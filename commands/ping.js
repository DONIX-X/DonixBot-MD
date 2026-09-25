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

        await sock.sendMessage(chatId, {
            text: `${botInfo}\n\nIf the menu button is unavailable, reply ALL COMMANDS or AVAILABLE COMMANDS.`
        }, { quoted: message });

        const userJid = sock.user?.id;
        try {
            const listMessage = proto.Message.ListMessage.create({
                title: 'Donix Bot MD',
                description: 'Choose which command list to view.',
                buttonText: 'Choose Menu',
                footerText: 'Donix Bot MD',
                listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
                sections: [proto.Message.ListMessage.Section.create({
                    title: 'Command Menus',
                    rows: [
                        proto.Message.ListMessage.Row.create({
                            title: 'All Commands',
                            description: 'Show the full command catalogue',
                            rowId: 'ping_all_commands'
                        }),
                        proto.Message.ListMessage.Row.create({
                            title: 'Available Commands',
                            description: 'Show commands enabled in this bot',
                            rowId: 'ping_available_commands'
                        })
                    ]
                })]
            });
            const menuMessage = generateWAMessageFromContent(chatId, {
                listMessage
            }, {
                userJid,
                messageId: generateMessageIDV2(userJid)
            });
            await sock.relayMessage(chatId, menuMessage.message, { messageId: menuMessage.key.id });
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
