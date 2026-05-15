// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//       NEXA-MD SESSION GENERATOR
//    IP Masking + QR + Pair Code Support
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

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//   IP MASKING — WhatsApp detect cheyyilla
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BROWSER_PROFILES = [
    Browsers.macOS('Safari'),
    Browsers.windows('Edge'),
    Browsers.macOS('Desktop'),
    Browsers.ubuntu('Chrome'),
    Browsers.macOS('Chrome'),
];

// Random User Agents — real browser pole kanikkan
const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomBrowser() {
    return BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
}

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Random delay — bot detection avoid cheyyaan
function randomDelay(min = 2000, max = 5000) {
    return new Promise(r => setTimeout(r, Math.floor(Math.random() * (max - min)) + min));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//        CONNECTION MANAGER CLASS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
        const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
        const { version } = await fetchLatestBaileysVersion();

        this.conn = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            browser,
            version,
            printQRInTerminal: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            // IP masking — extra headers
            options: {
                headers: {
                    'User-Agent': getRandomUA(),
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                }
            }
        });

        this.conn.ev.on("creds.update", saveCreds);
        this.setupEventHandlers();

        // Pair code mode
        if (this.type === 'pair' && this.phone) {
            setTimeout(async () => {
                if (this.isDestroyed) return;
                try {
                    await randomDelay(3000, 6000); // Random delay before requesting
                    const code = await this.conn.requestPairingCode(
                        this.phone.replace(/[^0-9]/g, '')
                    );
                    this.socket.emit('code', code);
                } catch (err) {
                    console.error('Pair code error:', err.message);
                    this.retryCount++;
                    if (this.retryCount < this.maxRetries) {
                        await randomDelay(2000, 4000);
                        await this.connect();
                    } else {
                        this.socket.emit('error', 'Pair code generate cheyyaan pattiyillaa. Try again!');
                    }
                }
            }, 3000);
        }
    }

    setupEventHandlers() {
        this.conn.ev.on("connection.update", async (update) => {
            if (this.isDestroyed) return;
            const { connection, qr, lastDisconnect } = update;

            // QR Code emit
            if (qr && this.type === 'qr') {
                try {
                    const qrBase64 = await QRCode.toDataURL(qr, {
                        errorCorrectionLevel: 'M',
                        margin: 2,
                        color: { dark: '#000000', light: '#ffffff' }
                    });
                    this.socket.emit('qr', qrBase64);
                } catch {}
            }

            if (connection === 'open') {
                // Random delay — natural behaviour simulate cheyyaan
                await randomDelay(4000, 7000);

                try {
                    const sessionData = JSON.stringify(this.conn.authState.creds);
                    const sessionID = 'NEXA-MD~' + Buffer.from(sessionData).toString('base64');

                    // ✅ Frontend-ലേക്ക് emit — screen-ൽ കാണിക്കും
                    this.socket.emit('session-id', sessionID);

                    // Owner-ലേക്ക് WhatsApp message
                    const ownerJid = (process.env.OWNER_NUMBER || '916235508514') + '@s.whatsapp.net';
                    await this.conn.sendMessage(ownerJid, {
                        text: `*✅ NEXA-MD SESSION ID*\n\n\`\`\`${sessionID}\`\`\`\n\n_Generated at ${new Date().toLocaleString()}_`
                    });

                } catch (e) {
                    console.error('Session send error:', e.message);
                }

                // 15 sec baad cleanup
                setTimeout(() => this.cleanup(), 15000);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode !== DisconnectReason.loggedOut && this.retryCount < 3) {
                    this.retryCount++;
                    await randomDelay(2000, 4000);
                    await this.connect();
                } else {
                    this.socket.emit('error', 'Connection failed. Please try again!');
                    this.cleanup();
                }
            }
        });
    }

    cleanup() {
        this.isDestroyed = true;
        try { if (this.conn) this.conn.end(); } catch {}
        try { if (fs.existsSync(this.sessionDir)) fs.removeSync(this.sessionDir); } catch {}
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//              SERVER START
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
app.prepare().then(() => {
    const server = express();
    const httpServer = http.createServer(server);
    const io = new Server(httpServer, {
        cors: { origin: '*' },
        transports: ['websocket', 'polling'],
    });

    const activeSessions = new Map();

    io.on('connection', (socket) => {
        console.log('New connection:', socket.id);

        socket.on('start-session', async (data) => {
            // Previous session cleanup
            if (activeSessions.has(socket.id)) {
                activeSessions.get(socket.id).cleanup();
            }

            const manager = new ConnectionManager(socket, data.type, data.phone);
            activeSessions.set(socket.id, manager);

            try {
                await manager.start();
            } catch (err) {
                socket.emit('error', 'Failed to start session: ' + err.message);
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
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ NEXA-MD Session Site running on port ${PORT}`);
    });
});
