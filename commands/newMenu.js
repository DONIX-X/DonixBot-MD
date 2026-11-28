const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const packageVersion = require('../package.json').version;
const { getVisibleCommandGroups } = require('../lib/commandAllowlist');

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

function createJawadStyleCategorySection(title, commands) {
    return [
        `╭──❰ *${title}* ❱`,
        ...commands.map(command => `│ 🏮 ${command}`),
        '╰──────────────────⦁'
    ].join('\n');
}

function addAlternateControlsToOwnerGroup(groups) {
    const controls = [
        '.dismenu2 (view second-set disabled commands)',
        '.encommand2 <command> (enable a second-set command)'
    ];
    let inserted = false;

    return groups.map(group => {
        if (group.title !== '👑 OWNER') return group;
        const commands = [...group.commands];
        const dismenuIndex = commands.findIndex(command => command.split(/\s+/)[0] === '.dismenu');
        commands.splice(dismenuIndex < 0 ? commands.length : dismenuIndex + 1, 0, ...controls);
        inserted = true;
        return { ...group, commands };
    }).concat(inserted ? [] : [{
        title: '👑 OWNER',
        commands: controls
    }]);
}

async function newMenuCommand(sock, chatId, message, options = {}) {
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
    const commandGroups = addAlternateControlsToOwnerGroup(getVisibleCommandGroups());
    const commandCount = commandGroups.reduce((count, group) => count + group.commands.length, 0);
    const categories = commandGroups
        .map(({ title, commands }) => createCategorySection(title, commands))
        .join('\n');
    const jawadStyleCategories = commandGroups
        .map(({ title, commands }) => createJawadStyleCategorySection(title, commands))
        .join('\n\n');

    const classicMenu = [
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
        'Use .dismenu or .dismenu2 to view disabled commands. Owners can enable second-set commands with .encommand2 <command>.',
        '',
        '╰━━━━━━━━━━━┈⊷',
        'made with 🤍'
    ].join('\n');
    const jawadStyleMenu = [
        `╭━━〔 ${settings.botName || 'DONIX BOT MD'} 〕━━╮`,
        `│ ✦ *ᴏᴡɴᴇʀ* : ${settings.botOwner || 'DONIX'}`,
        `│ ✦ *Uꜱᴇʀ* : ${user}`,
        '│ ✦ *Pʀᴇғɪx* : [ . ]',
        `│ ✦ *Cᴏᴍᴍᴀɴᴅꜱ* : ${commandCount}`,
        `│ ✦ *Dᴀᴛᴇ* : ${date}`,
        `│ ✦ *Tɪᴍᴇ* : ${time}`,
        `│ ✦ *Uᴘᴛɪᴍᴇ* : ${formatUptime(process.uptime())}`,
        `│ ✦ *Vᴇʀꜱɪᴏɴ* : v${packageVersion}`,
        '╰━━━━━━━━━━━━━━━━━━╯',
        '',
        '╭──❰ *ALL MENU* ❱',
        '│ 🏮 Browse commands by category below',
        '╰───────────────⦁',
        '',
        jawadStyleCategories,
        '',
        'Use .dismenu or .dismenu2 to view disabled commands. Owners can enable second-set commands with .encommand2 <command>.',
        '',
        `╰━━━┈⊷\nPowered by ${settings.botName || 'DONIX BOT MD'}`
    ].join('\n');
    const menuVariant = (options.randomInt || crypto.randomInt)(2);
    const menu = menuVariant === 0 ? classicMenu : jawadStyleMenu;

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
