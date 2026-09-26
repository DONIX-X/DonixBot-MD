const fs = require('fs');
const path = require('path');
const settings = require("../settings");

function getBotImagePath() {
    const primary = path.join(__dirname, '../assets/bot_image.jpg');
    const fallback = path.join(__dirname, '../assets/rapid.jpg');
    if (fs.existsSync(primary)) return primary;
    if (fs.existsSync(fallback)) return fallback;
    return null;
}

async function aliveCommand(sock, chatId, message) {
    try {
        const message1 = `*🤖 Donix Bot is Active!*\n\n` +
                       `*Version:* ${settings.version}\n` +
                       `*Status:* Online\n` +
                       `*Mode:* Public\n\n` +
                       `*🌟 Features:*\n` +
                       `• Group Management\n` +
                       `• Antilink Protection\n` +
                       `• Fun Commands\n` +
                       `• And more!\n\n` +
                       `Type *.menu* to command list`;

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
                caption: message1,
                contextInfo: channelContext
            }, { quoted: message });
            return;
        }

        await sock.sendMessage(chatId, {
            text: message1,
            contextInfo: channelContext
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Bot is alive and running!' }, { quoted: message });
    }
}

module.exports = aliveCommand;