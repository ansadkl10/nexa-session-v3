import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Head from 'next/head';

export default function Home() {
    const [mode, setMode] = useState(null); // null | 'qr' | 'pair'
    const [countryCode, setCountryCode] = useState('+91');
    const [phone, setPhone] = useState('');
    const [qr, setQr] = useState(null);
    const [pairCode, setPairCode] = useState(null);
    const [sessionId, setSessionId] = useState(null);
    const [status, setStatus] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);
    const socketRef = useRef(null);

    const countryCodes = [
        { code: '+91', name: 'IN' },
        { code: '+1', name: 'US' },
        { code: '+44', name: 'UK' },
        { code: '+971', name: 'UAE' },
        { code: '+60', name: 'MY' },
        { code: '+65', name: 'SG' },
        { code: '+92', name: 'PK' },
        { code: '+880', name: 'BD' },
        { code: '+94', name: 'LK' },
        { code: '+966', name: 'SA' },
    ];

    useEffect(() => {
        return () => { if (socketRef.current) socketRef.current.disconnect(); };
    }, []);

    function connectSocket() {
        if (socketRef.current) socketRef.current.disconnect();
        const socket = io('/', { transports: ['websocket', 'polling'] });
        socketRef.current = socket;

        socket.on('qr', (qrBase64) => {
            setQr(qrBase64);
            setLoading(false);
        });

        socket.on('code', (code) => {
            setPairCode(code);
            setLoading(false);
        });

        socket.on('session-id', (id) => {
            setSessionId(id);
            setQr(null);
            setPairCode(null);
            setLoading(false);
        });

        socket.on('error', (msg) => {
            setStatus('❌ ' + msg);
            setLoading(false);
        });

        return socket;
    }

    function startQR() {
        setMode('qr');
        setQr(null); setSessionId(null); setCopied(false);
        setLoading(true); setStatus('');
        const socket = connectSocket();
        socket.emit('start-session', { type: 'qr' });
    }

    function startPair() {
        const cleaned = phone.replace(/[^0-9]/g, '');
        if (cleaned.length < 7) { setStatus('❌ Valid phone number enter cheyyuu!'); return; }
        setMode('pair');
        setPairCode(null); setSessionId(null); setCopied(false);
        setLoading(true); setStatus('');
        const fullNumber = countryCode.replace('+', '') + cleaned;
        const socket = connectSocket();
        socket.emit('start-session', { type: 'pair', phone: fullNumber });
    }

    function reset() {
        if (socketRef.current) socketRef.current.disconnect();
        setMode(null); setQr(null); setPairCode(null);
        setSessionId(null); setStatus(''); setPhone('');
        setLoading(false); setCopied(false);
    }

    function copyId() {
        navigator.clipboard.writeText(sessionId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <>
            <Head>
                <title>NEXA-MD | Session Generator</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>

            <div className="root">
                {/* BG */}
                <div className="bg" />

                <div className="wrap">
                    {/* ── Landing ── */}
                    {!mode && !sessionId && (
                        <div className="page">
                            <div className="logo-area">
                                <div className="logo-icon">⚡</div>
                                <h1 className="brand">NEXA-MD.</h1>
                                <p className="sub">How do you want to pair?</p>
                            </div>

                            {status && <p className="err">{status}</p>}

                            <div className="btn-row">
                                <button className="pill-btn" onClick={startQR}>
                                    <span className="pill-icon">▦</span> QR
                                </button>
                                <button className="pill-btn active" onClick={() => setMode('pair-form')}>
                                    <span className="pill-icon">⌨</span> Enter code
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Pair Form ── */}
                    {mode === 'pair-form' && !sessionId && (
                        <div className="page">
                            <h2 className="page-title">Get Pairing Code</h2>

                            <div className="input-group">
                                <select
                                    className="country-select"
                                    value={countryCode}
                                    onChange={e => setCountryCode(e.target.value)}
                                >
                                    {countryCodes.map(c => (
                                        <option key={c.code} value={c.code}>{c.code}</option>
                                    ))}
                                </select>
                                <input
                                    className="phone-input"
                                    type="tel"
                                    placeholder="Enter phone number"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && startPair()}
                                    autoFocus
                                />
                            </div>

                            {status && <p className="err">{status}</p>}

                            <button className="get-code-btn" onClick={startPair}>
                                GET CODE
                            </button>

                            <button className="back-link" onClick={reset}>← Back</button>
                        </div>
                    )}

                    {/* ── QR Screen ── */}
                    {mode === 'qr' && !sessionId && (
                        <div className="page">
                            <h2 className="page-title">Scan QR Code</h2>
                            {loading && !qr && (
                                <div className="loader-wrap">
                                    <div className="spinner" />
                                    <p className="loading-text">Connecting...</p>
                                </div>
                            )}
                            {qr && (
                                <>
                                    <div className="qr-box">
                                        <img src={qr} alt="QR" className="qr-img" />
                                    </div>
                                    <p className="hint">WhatsApp → Linked Devices → Link a Device</p>
                                </>
                            )}
                            <button className="back-link" onClick={reset}>← Back</button>
                        </div>
                    )}

                    {/* ── Pair Code Screen ── */}
                    {mode === 'pair' && !sessionId && (
                        <div className="page">
                            <h2 className="page-title">Your Pairing Code</h2>
                            {loading && !pairCode && (
                                <div className="loader-wrap">
                                    <div className="spinner" />
                                    <p className="loading-text">Getting code...</p>
                                </div>
                            )}
                            {pairCode && (
                                <>
                                    <div className="code-display">
                                        {pairCode.match(/.{1,4}/g)?.map((chunk, i) => (
                                            <span key={i} className="code-chunk">{chunk}</span>
                                        ))}
                                    </div>
                                    <p className="hint">WhatsApp → Linked Devices → Link with phone number</p>
                                </>
                            )}
                            <button className="back-link" onClick={reset}>← Back</button>
                        </div>
                    )}

                    {/* ── Session ID Result ── */}
                    {sessionId && (
                        <div className="page">
                            <div className="success-icon">✅</div>
                            <h2 className="page-title">Session ID Ready!</h2>

                            <div className="session-box">
                                <code className="session-text">{sessionId}</code>
                            </div>

                            <button className="get-code-btn" onClick={copyId}>
                                {copied ? '✅ COPIED!' : '📋 COPY SESSION ID'}
                            </button>

                            <p className="warn">
                                ⚠️ Ee Session ID aarumaayum share cheyyaruth!<br />
                                Bot environment variables-il mathram use cheyyuu.
                            </p>

                            <button className="back-link" onClick={reset}>🔄 New Session</button>
                        </div>
                    )}
                </div>
            </div>

            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');

                * { margin: 0; padding: 0; box-sizing: border-box; }

                body {
                    font-family: 'Inter', sans-serif;
                    background: #000;
                    color: #fff;
                    min-height: 100vh;
                }

                .root {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    padding: 24px 16px;
                }

                .bg {
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse 80% 50% at 50% -10%, rgba(220,38,38,0.15) 0%, transparent 60%),
                        #000;
                    pointer-events: none;
                }

                .wrap {
                    width: 100%;
                    max-width: 400px;
                    z-index: 1;
                }

                .page {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 20px;
                    text-align: center;
                }

                /* Logo */
                .logo-area { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-bottom: 10px; }

                .logo-icon {
                    font-size: 3rem;
                    margin-bottom: 4px;
                    filter: drop-shadow(0 0 20px rgba(220,38,38,0.6));
                }

                .brand {
                    font-size: 2.8rem;
                    font-weight: 900;
                    letter-spacing: -2px;
                    color: #fff;
                }

                .sub {
                    font-size: 1rem;
                    color: #888;
                    font-weight: 400;
                    margin-top: 4px;
                }

                /* QR / Enter code buttons */
                .btn-row {
                    display: flex;
                    gap: 12px;
                    margin-top: 8px;
                }

                .pill-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 14px 28px;
                    border-radius: 50px;
                    border: 1px solid rgba(255,255,255,0.15);
                    background: rgba(255,255,255,0.06);
                    color: #ccc;
                    font-size: 1rem;
                    font-weight: 600;
                    font-family: 'Inter', sans-serif;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .pill-btn:hover, .pill-btn.active {
                    background: rgba(255,255,255,0.12);
                    color: #fff;
                    border-color: rgba(255,255,255,0.3);
                }

                .pill-icon { font-size: 1.1rem; }

                /* Page title */
                .page-title {
                    font-size: 1.6rem;
                    font-weight: 800;
                    letter-spacing: -0.5px;
                }

                /* Phone input */
                .input-group {
                    display: flex;
                    width: 100%;
                    gap: 8px;
                }

                .country-select {
                    background: #fff;
                    color: #000;
                    border: none;
                    border-radius: 12px;
                    padding: 14px 10px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    font-family: 'Inter', sans-serif;
                    cursor: pointer;
                    outline: none;
                    min-width: 72px;
                }

                .phone-input {
                    flex: 1;
                    background: #fff;
                    color: #000;
                    border: none;
                    border-radius: 12px;
                    padding: 14px 16px;
                    font-size: 1rem;
                    font-family: 'Inter', sans-serif;
                    outline: none;
                }

                .phone-input::placeholder { color: #999; }

                /* GET CODE button */
                .get-code-btn {
                    width: 100%;
                    padding: 16px;
                    background: #fff;
                    color: #000;
                    border: none;
                    border-radius: 12px;
                    font-size: 1rem;
                    font-weight: 800;
                    font-family: 'Inter', sans-serif;
                    letter-spacing: 1px;
                    cursor: pointer;
                    transition: opacity 0.2s;
                }

                .get-code-btn:hover { opacity: 0.88; }

                /* Back */
                .back-link {
                    background: none;
                    border: none;
                    color: #666;
                    font-size: 0.9rem;
                    font-family: 'Inter', sans-serif;
                    cursor: pointer;
                    margin-top: 4px;
                    transition: color 0.2s;
                }

                .back-link:hover { color: #aaa; }

                /* QR */
                .qr-box {
                    background: #fff;
                    border-radius: 16px;
                    padding: 14px;
                    display: inline-block;
                }

                .qr-img { width: 210px; height: 210px; display: block; }

                /* Pair code chunks */
                .code-display {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    flex-wrap: wrap;
                }

                .code-chunk {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 10px;
                    padding: 12px 18px;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #fff;
                    letter-spacing: 3px;
                }

                /* Loader */
                .loader-wrap {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                    padding: 30px 0;
                }

                .spinner {
                    width: 38px;
                    height: 38px;
                    border: 3px solid rgba(255,255,255,0.1);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .loading-text { color: #666; font-size: 0.9rem; }

                /* Session result */
                .success-icon { font-size: 2.5rem; }

                .session-box {
                    width: 100%;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 12px;
                    padding: 16px;
                    text-align: left;
                    overflow-x: auto;
                }

                .session-text {
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.68rem;
                    color: #aaa;
                    word-break: break-all;
                    line-height: 1.7;
                }

                /* Warning */
                .warn {
                    font-size: 0.78rem;
                    color: #f59e0b;
                    background: rgba(245,158,11,0.08);
                    border: 1px solid rgba(245,158,11,0.2);
                    border-radius: 10px;
                    padding: 12px 16px;
                    line-height: 1.6;
                    width: 100%;
                }

                /* Error */
                .err {
                    color: #f87171;
                    font-size: 0.85rem;
                    background: rgba(248,113,113,0.08);
                    border: 1px solid rgba(248,113,113,0.2);
                    border-radius: 8px;
                    padding: 10px 14px;
                    width: 100%;
                }

                /* Hint */
                .hint { color: #555; font-size: 0.82rem; line-height: 1.5; }

                @media (max-width: 400px) {
                    .brand { font-size: 2.2rem; }
                    .qr-img { width: 180px; height: 180px; }
                    .code-chunk { font-size: 1.2rem; padding: 10px 14px; }
                    .pill-btn { padding: 12px 20px; font-size: 0.9rem; }
                }
            `}</style>
        </>
    );
          }
      
