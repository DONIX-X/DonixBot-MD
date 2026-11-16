const fs = require('fs');
const path = require('path');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const SESSION_ROOT = path.join(process.cwd(), 'pairing_sessions');
const reconnectDelayMs = 5000;
const pairingSockets = new Map();
const reconnectTimers = new Map();
const connectingSessions = new Map();
const pairingRequests = new Set();
const pairingReadyTimeoutMs = 30000;
let configurePairingSessionSocket = null;

function getDisconnectError(lastDisconnect) {
    const error = lastDisconnect?.error;
    const socketError = error?.data;
    const statusCode = error?.output?.statusCode;
    const details = [
        statusCode ? `status ${statusCode}` : '',
        error?.message || '',
        socketError?.code || '',
        socketError?.message || ''
    ].filter(Boolean).join(': ');
    return new Error(`Pairing connection closed before WhatsApp was ready${details ? ` (${details})` : ''}.`);
}

function waitForPairingSocketReady(socket, timeoutMs = pairingReadyTimeoutMs) {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            clearTimeout(timeout);
            socket.ev.off('connection.update', onConnectionUpdate);
        };
        const onConnectionUpdate = ({ qr, connection, lastDisconnect }) => {
            if (qr) {
                cleanup();
                resolve();
            } else if (connection === 'close') {
                cleanup();
                reject(getDisconnectError(lastDisconnect));
            }
        };
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for WhatsApp to initialize pairing. Check the Termux connection and try again.'));
        }, timeoutMs);

        socket.ev.on('connection.update', onConnectionUpdate);
    });
}

function setPairingSessionSocketConfigurer(configurer) {
    if (typeof configurer !== 'function') {
        throw new TypeError('Pairing session socket configurer must be a function.');
    }
    configurePairingSessionSocket = configurer;
}

function getSessionDir(phoneNumber) {
    if (!/^\d{7,15}$/.test(phoneNumber)) {
        throw new Error('Phone number must contain 7 to 15 digits.');
    }
    return path.join(SESSION_ROOT, phoneNumber);
}

async function connectPairingSession(phoneNumber) {
    if (pairingSockets.has(phoneNumber)) return pairingSockets.get(phoneNumber);
    if (connectingSessions.has(phoneNumber)) return connectingSessions.get(phoneNumber);

    const pendingReconnect = reconnectTimers.get(phoneNumber);
    if (pendingReconnect) {
        clearTimeout(pendingReconnect);
        reconnectTimers.delete(phoneNumber);
    }

    const connecting = (async () => {
        const [{ state, saveCreds }, { version }] = await Promise.all([
            useMultiFileAuthState(getSessionDir(phoneNumber)),
            fetchLatestBaileysVersion()
        ]);
        const logger = pino({ level: 'silent' });
        const socket = makeWASocket({
            version,
            logger,
            printQRInTerminal: false,
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'fatal' }))
            },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            connectTimeoutMs: 20000,
            keepAliveIntervalMs: 5000
        });

        pairingSockets.set(phoneNumber, socket);
        if (!configurePairingSessionSocket) {
            throw new Error('Pairing session event handlers have not been configured.');
        }
        configurePairingSessionSocket(socket);
        socket.ev.on('creds.update', saveCreds);
        socket.ev.on('connection.update', ({ connection, lastDisconnect }) => {
            if (connection !== 'close' || pairingSockets.get(phoneNumber) !== socket) return;

            pairingSockets.delete(phoneNumber);
            const disconnectError = lastDisconnect?.error;
            const statusCode = disconnectError?.output?.statusCode;
            console.error(
                `[pair] Companion session disconnected${statusCode ? ` (status ${statusCode})` : ''}:`,
                {
                    message: disconnectError?.message || 'Unknown disconnect reason.',
                    socketErrorCode: disconnectError?.data?.code,
                    socketErrorMessage: disconnectError?.data?.message
                }
            );
            if (statusCode === DisconnectReason.loggedOut) {
                console.error('[pair] A companion session logged out; remove it from Linked Devices before pairing again.');
                try {
                    fs.rmSync(getSessionDir(phoneNumber), { recursive: true, force: true });
                } catch (error) {
                    console.error('[pair] Failed to remove logged-out companion credentials:', error);
                }
                return;
            }

            if (!reconnectTimers.has(phoneNumber)) {
                const timer = setTimeout(() => {
                    reconnectTimers.delete(phoneNumber);
                    connectPairingSession(phoneNumber).catch(error => {
                        console.error('[pair] Failed to reconnect a companion session:', error);
                    });
                }, reconnectDelayMs);
                reconnectTimers.set(phoneNumber, timer);
            }
        });

        return socket;
    })();

    connectingSessions.set(phoneNumber, connecting);
    try {
        return await connecting;
    } finally {
        connectingSessions.delete(phoneNumber);
    }
}

async function createPairingCode(phoneNumber) {
    const sessionDir = getSessionDir(phoneNumber);
    const credsPath = path.join(sessionDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        if (creds.registered) {
            throw new Error('This number already has a companion session saved on the bot.');
        }
    }

    if (pairingRequests.has(phoneNumber)) {
        throw new Error('A pairing code is already being generated for this number. Please wait.');
    }
    pairingRequests.add(phoneNumber);

    try {
        const socket = await connectPairingSession(phoneNumber);
        if (pairingSockets.get(phoneNumber) !== socket) {
            throw new Error('The pairing connection closed before code generation. Check the Termux logs for the [pair] disconnect reason.');
        }

        await waitForPairingSocketReady(socket);
        if (pairingSockets.get(phoneNumber) !== socket) {
            throw new Error('The pairing connection closed before code generation. Check the Termux logs for the [pair] disconnect reason.');
        }
        const code = await socket.requestPairingCode(phoneNumber);
        return code?.match(/.{1,4}/g)?.join('-') || code;
    } finally {
        pairingRequests.delete(phoneNumber);
    }
}

async function restorePairingSessions() {
    if (!fs.existsSync(SESSION_ROOT)) return;

    for (const phoneNumber of fs.readdirSync(SESSION_ROOT)) {
        if (!/^\d{7,15}$/.test(phoneNumber)) continue;
        try {
            const sessionDir = getSessionDir(phoneNumber);
            if (!fs.statSync(sessionDir).isDirectory()) continue;

            const credsPath = path.join(sessionDir, 'creds.json');
            if (!fs.existsSync(credsPath)) continue;

            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            if (!creds.registered) continue;

            await connectPairingSession(phoneNumber);
        } catch (error) {
            console.error('[pair] Failed to restore a companion session:', error);
        }
    }
}

module.exports = {
    createPairingCode,
    restorePairingSessions,
    setPairingSessionSocketConfigurer,
    waitForPairingSocketReady
};
