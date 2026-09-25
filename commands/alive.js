const settings = require("../settings");
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
                       `Type *.menu* for full command list`;

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
                    serverMessageId: -1
                };
            }
        } catch (channelError) {
            console.error('[ALIVE] channel preview unavailable:', channelError.message);
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