const fs = require('fs');
const path = require('path');
const settings = require('../settings');

function toMathematicalBold(input = '') {
    const map = {
        A: '𝐀', B: '𝐁', C: '𝐂', D: '𝐃', E: '𝐄', F: '𝐅', G: '𝐆', H: '𝐇', I: '𝐈', J: '𝐉', K: '𝐊', L: '𝐋', M: '𝐌',
        N: '𝐍', O: '𝐎', P: '𝐏', Q: '𝐐', R: '𝐑', S: '𝐒', T: '𝐓', U: '𝐔', V: '𝐕', W: '𝐖', X: '𝐗', Y: '𝐘', Z: '𝐙',
        a: '𝐚', b: '𝐛', c: '𝐜', d: '𝐝', e: '𝐞', f: '𝐟', g: '𝐠', h: '𝐡', i: '𝐢', j: '𝐣', k: '𝐤', l: '𝐥', m: '𝐦',
        n: '𝐧', o: '𝐨', p: '𝐩', q: '𝐪', r: '𝐫', s: '𝐬', t: '𝐭', u: '𝐮', v: '𝐯', w: '𝐰', x: '𝐱', y: '𝐲', z: '𝐳',
        0: '𝟎', 1: '𝟏', 2: '𝟐', 3: '𝟑', 4: '𝟒', 5: '𝟓', 6: '𝟔', 7: '𝟕', 8: '𝟖', 9: '𝟗'
    };

    return String(input).split('').map(char => map[char] || char).join('');
}

function getBotImagePath() {
    const primary = path.join(__dirname, '../assets/bot_image.jpg');
    const fallback = path.join(__dirname, '../assets/rapid.jpg');
    if (fs.existsSync(primary)) return primary;
    if (fs.existsSync(fallback)) return fallback;
    return null;
}

async function aliveCommand(sock, chatId, message) {
    try {
        const message1 = [
            `🤖 ${toMathematicalBold('Donix Bot is Active!')}`,
            '',
            `${toMathematicalBold('Version')}: ${toMathematicalBold(String(settings.version || '1.0.7'))}`,
            `${toMathematicalBold('Status')}: ${toMathematicalBold('Online')}`,
            `${toMathematicalBold('Mode')}: ${toMathematicalBold('Public')}`,
            '',
            `${toMathematicalBold('🌟 Features')}:`,
            `• ${toMathematicalBold('Group Management')}`,
            `• ${toMathematicalBold('Antilink Protection')}`,
            `• ${toMathematicalBold('Fun Commands')}`,
            `• ${toMathematicalBold('And more!')}`,
            '',
            `${toMathematicalBold('Type')} .${toMathematicalBold('menu')} ${toMathematicalBold('to command list')}`
        ].join('\n');

        const boldMessage = toMathematicalBold(message1);

        const channelContext = {
            forwardingScore: 999,
            isForwarded: true
        };

        try {
            const inviteCode = new URL(settings.channelLink).pathname.split('/').filter(Boolean).pop();
            const channel = await sock.newsletterMetadata('invite', inviteCode);
            if (channel?.id) {
                channelContext.forwardedNewsletterMessageInfo = {
                    newsletterJid: channel.id,
                    newsletterName: channel.name || settings.botName || 'Donix Bot MD',
                    serverMessageId: -1,
                    contentType: 3
                };
            }
        } catch (channelError) {
            console.error('[ALIVE] channel preview unavailable:', channelError.message);
        }

        const imagePath = getBotImagePath();
        if (imagePath) {
            await sock.sendMessage(chatId, {
                image: fs.readFileSync(imagePath),
                caption: boldMessage,
                contextInfo: channelContext
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: boldMessage,
            contextInfo: channelContext
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Bot is alive and running!' }, { quoted: message });
    }
}

module.exports = aliveCommand;
