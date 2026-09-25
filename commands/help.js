const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const { commandGroups } = require('../lib/commandAllowlist');
const packageVersion = require('../package.json').version;

async function helpCommand(sock, chatId, message) {
    const menuSections = commandGroups.map(({ title, commands }) => [
        `╭━━━〔 ${title} 〕━━━╮`,
        '┃',
        ...commands.map(command => `┃ ${command}`),
        '╰━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n')).join('\n\n');
    const helpMessage = [
        '╭━━━〔 🤖 DONIX BOT MD 〕━━━╮',
        '┃',
        `┃ 👤 Owner  : ${settings.botOwner || 'DONIX'}`,
        '┃ ⚡ Prefix : .',
        `┃ 📦 Version : ${packageVersion}`,
        '┃',
        '╰━━━━━━━━━━━━━━━━━━━━╯',
        '',
        menuSections,
        '',
        '╭━━━━━━━━━━━━━━━━━━━━╮',
        `┃ 🤖 DONIX BOT MD v${settings.version || '1.0'}`,
        `┃ 👑 Powered by ${settings.botOwner || 'DONIX'}`,
        '╰━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n');

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
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
        
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: channelContext
            },{ quoted: message });
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, { 
                text: helpMessage,
                contextInfo: channelContext
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;