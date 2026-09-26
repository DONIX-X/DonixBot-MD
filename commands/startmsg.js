const fs = require('fs');
const path = require('path');
const isOwnerOrSudo = require('../lib/isOwner');

const configPath = path.join(__dirname, '../data/startupNotify.json');

function toMathematicalBold(input = '') {
    return String(input).split('').map(char => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(0x1D400 + code - 65);
        if (code >= 97 && code <= 122) return String.fromCodePoint(0x1D41A + code - 97);
        if (code >= 48 && code <= 57) return String.fromCodePoint(0x1D7CE + code - 48);
        return char;
    }).join('');
}

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (_) {
        return { enabled: false, chatId: '' };
    }
}

function writeConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function startmsgCommand(sock, chatId, message, action) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
        await sock.sendMessage(chatId, { text: toMathematicalBold('Only bot owner can use this command!') }, { quoted: message });
        return;
    }

    const config = readConfig();
    const normalizedAction = action?.toLowerCase();

    if (!normalizedAction || normalizedAction === 'info') {
        await sock.sendMessage(chatId, {
            text: toMathematicalBold('Startup message controls:\n\n.startmsg on - Send startup messages to the saved group\n.startmsg off - Send startup messages to Saved Messages\n.startmsg status - Show the current state and destination\n.setstartmsg - Save the group where this command is run')
        }, { quoted: message });
        return;
    }

    if (normalizedAction === 'status') {
        if (config.chatId && !config.groupName) {
            try {
                const groupInfo = await sock.groupMetadata(config.chatId);
                config.groupName = groupInfo.subject || 'Unnamed group';
                writeConfig(config);
            } catch (_) {
                config.groupName = 'Saved group (name unavailable)';
            }
        }
        const destination = config.groupName || 'Saved Messages';
        await sock.sendMessage(chatId, {
            text: toMathematicalBold(`Startup message: ${config.enabled ? 'ON' : 'OFF'}\nDestination: ${destination}\n\nUse .startmsg info for help.`)
        }, { quoted: message });
        return;
    }

    if (normalizedAction !== 'on' && normalizedAction !== 'off') {
        await sock.sendMessage(chatId, { text: toMathematicalBold('Usage: .startmsg on/off/status/info') }, { quoted: message });
        return;
    }

    if (normalizedAction === 'on' && !config.chatId) {
        await sock.sendMessage(chatId, {
            text: toMathematicalBold('Set a group first with .setstartmsg')
        }, { quoted: message });
        return;
    }

    config.enabled = normalizedAction === 'on';
    writeConfig(config);
    await sock.sendMessage(chatId, {
        text: toMathematicalBold(`Startup message is now ${config.enabled ? 'ON' : 'OFF'}.`)
    }, { quoted: message });
}

async function setStartMsgCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    if (!message.key.fromMe && !(await isOwnerOrSudo(senderId, sock, chatId))) {
            await sock.sendMessage(chatId, { text: toMathematicalBold('Only bot owner can use this command!') }, { quoted: message });
        return;
    }

    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, {
            text: toMathematicalBold('Run .setstartmsg inside the group where startup messages should be sent.')
        }, { quoted: message });
        return;
    }

    try {
        const groupInfo = await sock.groupMetadata(chatId);
        if (!groupInfo?.id) throw new Error('Group ID was not returned');

        const config = readConfig();
        config.chatId = chatId;
        config.groupName = groupInfo.subject || 'Unnamed group';
        writeConfig(config);

        await sock.sendMessage(chatId, {
            text: toMathematicalBold(`Startup message group saved.\nGroup: ${config.groupName}\nUse .startmsg on to enable it.`)
        }, { quoted: message });
    } catch (error) {
        console.error('[STARTMSG] group validation failed:', error.message);
        await sock.sendMessage(chatId, {
            text: toMathematicalBold('The bot is not in that group yet. Add or join the bot to the group first, then try .setstartmsg again.')
        }, { quoted: message });
    }
}

function getStartupNotifyConfig() {
    return readConfig();
}

module.exports = {
    startmsgCommand,
    setStartMsgCommand,
    getStartupNotifyConfig
};
