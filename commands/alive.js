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

        await sock.sendMessage(chatId, {
            text: message1,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                externalAdReply: {
                    title: settings.botName || 'Donix Bot MD',
                    body: 'Follow our WhatsApp channel for updates',
                    mediaType: 1,
                    sourceUrl: settings.channelLink,
                    showAdAttribution: false,
                    renderLargerThumbnail: true
                }
                }
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: 'Bot is alive and running!' }, { quoted: message });
    }
}

module.exports = aliveCommand;