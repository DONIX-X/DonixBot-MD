const PhoneNumber = require('awesome-phonenumber');
const { createPairingCode } = require('../lib/pairingSession');

const pendingPairing = new Map();
const pairingTimeoutMs = 2 * 60 * 1000;

function getNumber(jid = '') {
    const number = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '');
    return number || '';
}

function getRequesterNumber(chatId, message) {
    if (!chatId || chatId.endsWith('@g.us') || chatId === 'status@broadcast') return null;

    const chatNumber = getNumber(chatId);
    const senderNumber = getNumber(message.key.participant || message.key.remoteJid);
    if (!chatNumber || chatNumber !== senderNumber) return null;
    return chatNumber;
}

async function submitPhoneNumber(sock, chatId, message, text, requesterNumber) {
    const phoneNumber = String(text || '').replace(/\D/g, '');
    if (!phoneNumber || !PhoneNumber(`+${phoneNumber}`).isValid()) {
        pendingPairing.delete(chatId);
        await sock.sendMessage(chatId, {
            text: 'That does not look like a valid international number. Start again with .pair and enter the number with country code, without + or spaces.'
        }, { quoted: message });
        return;
    }

    if (phoneNumber !== requesterNumber) {
        pendingPairing.delete(chatId);
        await sock.sendMessage(chatId, {
            text: 'For your security, you can only request a pairing code for the WhatsApp account you are messaging from.'
        }, { quoted: message });
        return;
    }

    pendingPairing.set(chatId, {
        requesterNumber,
        phoneNumber,
        phase: 'confirm',
        expiresAt: Date.now() + pairingTimeoutMs
    });
    await sock.sendMessage(chatId, {
        text: 'This will link a new WhatsApp companion session to this bot server. The server will store its login credentials, but this session will not run bot handlers. Only continue if this is your account and you understand the server will retain access. Reply YES to generate the code or NO to cancel.'
    }, { quoted: message });
}

async function pairCommand(sock, chatId, message, args = '') {
    const requesterNumber = getRequesterNumber(chatId, message);
    if (!requesterNumber) {
        await sock.sendMessage(chatId, {
            text: '❌ .pair can only be used in a private chat from the WhatsApp account you want to pair.'
        }, { quoted: message });
        return;
    }

    const input = String(args).trim();
    if (['cancel', 'no'].includes(input.toLowerCase())) {
        pendingPairing.delete(chatId);
        await sock.sendMessage(chatId, { text: 'Pairing request cancelled.' }, { quoted: message });
        return;
    }

    if (input) {
        await submitPhoneNumber(sock, chatId, message, input, requesterNumber);
        return;
    }

    pendingPairing.set(chatId, {
        requesterNumber,
        phase: 'number',
        expiresAt: Date.now() + pairingTimeoutMs
    });
    await sock.sendMessage(chatId, {
        text: 'Send your WhatsApp number with country code, without + or spaces. You must send this command from the same account. This request expires in 2 minutes; use .pair cancel to cancel.'
    }, { quoted: message });
}

async function handlePairResponse(sock, chatId, message, text) {
    const pending = pendingPairing.get(chatId);
    if (!pending) return false;

    if (pending.expiresAt < Date.now()) {
        pendingPairing.delete(chatId);
        return false;
    }

    const requesterNumber = getRequesterNumber(chatId, message);
    if (!requesterNumber || requesterNumber !== pending.requesterNumber) {
        pendingPairing.delete(chatId);
        return false;
    }

    const response = String(text || '').trim().toLowerCase();
    if (pending.phase === 'number') {
        await submitPhoneNumber(sock, chatId, message, text, requesterNumber);
        return true;
    }

    if (response === 'no' || response === 'cancel') {
        pendingPairing.delete(chatId);
        await sock.sendMessage(chatId, { text: 'Pairing request cancelled.' }, { quoted: message });
        return true;
    }

    if (response !== 'yes' && response !== 'confirm') {
        await sock.sendMessage(chatId, { text: 'Reply YES to generate the code or NO to cancel.' }, { quoted: message });
        return true;
    }

    pendingPairing.delete(chatId);
    await sock.sendMessage(chatId, { text: '🔄 Generating your private pairing code…' }, { quoted: message });
    try {
        const code = await createPairingCode(pending.phoneNumber);
        await sock.sendMessage(chatId, {
            text: `Your WhatsApp pairing code is: *${code}*\n\nIn your WhatsApp account, open Settings → Linked devices → Link a device → Link with phone number instead, then enter this code. Keep it private.`
        }, { quoted: message });
    } catch (error) {
        console.error('[pair] Could not create pairing code:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not create a pairing code: ${error.message}`
        }, { quoted: message });
    }

    return true;
}

module.exports = { pairCommand, handlePairResponse };
