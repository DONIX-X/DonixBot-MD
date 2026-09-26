const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const { commandGroups } = require('../lib/commandAllowlist');
const packageVersion = require('../package.json').version;

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

function createMenuSection(title, commands) {
    const boldTitle = toMathematicalBold(title);
    const boldCommands = commands.map(command => toMathematicalBold(command));
    const titleBlock = `〔 ${boldTitle} 〕`;
    const borderStyles = {
        '🌐 GENERAL': { left: 3, right: 1, bottom: '╰━━━━━━━━━━━━━━━━━━━╯' },
        '🛡️ ADMIN': { left: 3, right: 3, bottom: '╰━━━━━━━━━━━━━━━━━╯' },
        '👑 OWNER': { left: 3, right: 4, bottom: '╰━━━━━━━━━━━━━━━━━━━╯' },
        '🖼️ IMAGE / STICKER': { left: 2, right: 1, bottom: '╰━━━━━━━━━━━━━━━━━━━━━╯' },
        '📥 DOWNLOADER': { left: 2, right: 2, bottom: '╰━━━━━━━━━━━━━━━━━━━━╯' },
        '🐙 GITHUB': { left: 3, right: 5, bottom: '╰━━━━━━━━━━━━━━━━━━━━╯' }
    };
    const style = borderStyles[title] || borderStyles['🌐 GENERAL'];

    return [
        `╭${'━'.repeat(style.left)}${titleBlock}${'━'.repeat(style.right)}╮`,
        '┃',
        ...boldCommands.map(command => `┃ ${command}`),
        style.bottom
    ].join('\n');
}

async function helpCommand(sock, chatId, message) {
    const menuSections = commandGroups
        .map(({ title, commands }) => createMenuSection(title, commands))
        .join('\n\n');

    const helpMessage = [
        `╭━━〔 🤖 ${toMathematicalBold('DONIX BOT MD')} 〕━╮`,
        '┃',
        `┃ 👤 ${toMathematicalBold('Owner')}  : ${toMathematicalBold(settings.botOwner || 'DONIX')}`,
        `┃ ⚡ ${toMathematicalBold('Prefix')} : ${toMathematicalBold('.')}`,
        `┃ 📦 ${toMathematicalBold('Version')} : ${toMathematicalBold(String(packageVersion))}`,
        '┃',
        '╰━━━━━━━━━━━━━━━━━━━━╯',
        '',
        menuSections,
        '',
        '╭━━━━━━━━━━━━━━━━━━━━╮',
        `┃ 🤖 ${toMathematicalBold('DONIX BOT MD')} ${toMathematicalBold(`v${settings.version || '1.0.7'}`)}`,
        `┃ 👑 ${toMathematicalBold('Powered by')} ${toMathematicalBold(settings.botOwner || 'DONIX')}`,
        '╰━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n');

    const boldHelpMessage = toMathematicalBold(helpMessage);

    try {
        const imagePath = getBotImagePath();
        const channelLink = settings.channelLink || global.channelLink;
        const channelContext = {
            forwardingScore: 1,
            isForwarded: true
        };

        try {
            const inviteCode = new URL(channelLink).pathname.split('/').filter(Boolean).pop();
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
            console.error('[HELP] channel preview unavailable:', channelError.message);
        }

        if (imagePath) {
            const imageBuffer = fs.readFileSync(imagePath);
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: boldHelpMessage,
                contextInfo: channelContext
            }, { quoted: message });
            return;
        }

        console.error('Bot image not found in assets directory.');
        await sock.sendMessage(chatId, {
            text: boldHelpMessage,
            contextInfo: channelContext
        });
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: boldHelpMessage });
    }
}

module.exports = helpCommand;
