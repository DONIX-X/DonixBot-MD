const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const packageVersion = require('../package.json').version;
const { commandGroups } = require('../lib/commandAllowlist');

function getBotGifVideoPath() {
    const videoPath = path.join(__dirname, '../assets/giphy.mp4');
    return fs.existsSync(videoPath) ? videoPath : null;
}

async function getChannelContext(sock) {
    const channelContext = {
        forwardingScore: 1,
        isForwarded: true
    };

    try {
        const channelLink = settings.channelLink || global.channelLink;
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
        console.error('[MNEW] channel preview unavailable:', channelError.message);
    }

    return channelContext;
}

function formatUptime(totalSeconds) {
    const seconds = Math.floor(totalSeconds);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const remainder = String(seconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${remainder}`;
}

function createCategorySection(title, commands) {
    return [
        `┃  ╭─────────────┅┄▻`,
        `┃  │  *➻ ${title.replace(/^[^A-Z]*([A-Z].*)$/, '$1')}*`,
        `┃  ╰┬────────────┅┄▻`,
        '┃  ┌┤',
        ...commands.map(command => `┃  │ ‣ ${command}`),
        '┃  ╰─────────────···▸'
    ].join('\n');
}

async function newMenuCommand(sock, chatId, message) {
    const now = new Date();
    const date = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'medium'
    }).format(now);
    const time = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        timeStyle: 'medium'
    }).format(now);
    const user = String(message.pushName || 'User').replace(/[\r\n]+/g, ' ').slice(0, 40);
    const commandCount = commandGroups.reduce((count, group) => count + group.commands.length, 0);
    const categories = commandGroups
        .map(({ title, commands }) => createCategorySection(title, commands))
        .join('\n');

    const menu = [
        `╭━━━〔 ${settings.botName || 'DONIX BOT MD'} 〕━━━···▸`,
        '┃╭──────────────···▸',
        `✧│ *ᴏᴡɴᴇʀ :* ${settings.botOwner || 'DONIX'}`,
        `✧│ *ᴜsᴇʀ :* ${user}`,
        `✧│ *ᴄᴏᴍᴍᴀɴᴅs :* ${commandCount}`,
        `✧│ *ᴅᴀᴛᴇ :* ${date}`,
        `✧│ *ᴛɪᴍᴇ :* ${time}`,
        `✧│ *ᴜᴘᴛɪᴍᴇ :* ${formatUptime(process.uptime())}`,
        `✧│ *ᴠᴇʀsɪᴏɴ :* ᴠ${packageVersion}`,
        '┃╰──────────────···▸',
        '╰━━━━━━━━━━━━━━━···▸',
        '',
        categories,
        '',
        '╰━━━━━━━━━━━┈⊷',
        'made with 🤍'
    ].join('\n');

    const contextInfo = await getChannelContext(sock);
    const gifVideoPath = getBotGifVideoPath();

    if (gifVideoPath) {
        await sock.sendMessage(chatId, {
            video: fs.readFileSync(gifVideoPath),
            mimetype: 'video/mp4',
            gifPlayback: true,
            caption: menu,
            contextInfo
        }, { quoted: message });
        return;
    }

    console.error('Bot image not found in assets directory.');
    await sock.sendMessage(chatId, { text: menu, contextInfo }, { quoted: message });
}

module.exports = newMenuCommand;
