const os = require('os');
const settings = require('../settings.js');
const { proto, generateWAMessageFromContent, generateMessageIDV2 } = require('@whiskeysockets/baileys');

function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;

    return time.trim();
}

async function pingCommand(sock, chatId, message) {
    try {
        const start = Date.now();
        await sock.sendMessage(chatId, { text: 'Pong!' }, { quoted: message });
        const end = Date.now();
        const ping = Math.round((end - start) / 2);

        const uptimeInSeconds = process.uptime();
        const uptimeFormatted = formatTime(uptimeInSeconds);

        const botInfo = `
┏━━〔 🤖  𝐃𝐨𝐧𝐢𝐱𝐁𝐨𝐭-𝐌𝐃 〕━━┓
┃ 🚀 Ping     : ${ping} ms
┃ ⏱️ Uptime   : ${uptimeFormatted}
┃ 🔖 Version  : v${settings.version}
┗━━━━━━━━━━━━━━━━━━━┛`.trim();

        await sock.sendMessage(chatId, { text: botInfo }, { quoted: message });

        const userJid = sock.user?.id;
        try {
            const nativeFlowMessage = proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create({
                    title: 'Donix Bot MD',
                    hasMediaAttachment: false
                }),
                body: proto.Message.InteractiveMessage.Body.create({ text: 'Choose a command menu.' }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: 'Donix Bot MD' }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                    messageVersion: 1,
                    buttons: [
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({ display_text: 'All Commands', id: 'ping_all_commands' })
                        },
                        {
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({ display_text: 'Available Commands', id: 'ping_available_commands' })
                        }
                    ]
                })
            });
            const interactiveMessage = generateWAMessageFromContent(chatId, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
                        interactiveMessage: nativeFlowMessage
                    }
                }
            }, {
                userJid,
                messageId: generateMessageIDV2(userJid)
            });
            await sock.relayMessage(chatId, interactiveMessage.message, { messageId: interactiveMessage.key.id });
        } catch (interactiveError) {
            console.error('Could not send ping menu buttons:', interactiveError);
            await sock.sendMessage(chatId, {
                text: 'Menu buttons could not be sent. Use .menu to see available commands.'
            }, { quoted: message });
        }

    } catch (error) {
        console.error('Error in ping command:', error);
        await sock.sendMessage(chatId, { text: '❌ Failed to get bot status.' });
    }
}

module.exports = pingCommand;
