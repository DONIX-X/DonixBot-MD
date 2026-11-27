const statuses = new Map();

async function afkCommand(sock, chatId, message, reason) {
    const senderId = message.key.participant || message.key.remoteJid;
    const normalizedReason = (reason || '').trim();

    if (normalizedReason.toLowerCase() === 'off') {
        statuses.delete(senderId);
        await sock.sendMessage(chatId, { text: '✅ AFK status cleared.' }, { quoted: message });
        return;
    }

    statuses.set(senderId, {
        reason: normalizedReason.slice(0, 200),
        since: Date.now()
    });
    await sock.sendMessage(chatId, {
        text: `✅ AFK status enabled.${normalizedReason ? `\nReason: ${normalizedReason.slice(0, 200)}` : ''}`
    }, { quoted: message });
}

async function handleAfkMentions(sock, chatId, message, content) {
    const contextInfo = content?.extendedTextMessage?.contextInfo
        || content?.imageMessage?.contextInfo
        || content?.videoMessage?.contextInfo;
    const mentionedJids = [...new Set(contextInfo?.mentionedJid || [])];
    const active = mentionedJids
        .map(jid => ({ jid, status: statuses.get(jid) }))
        .filter(item => item.status);

    if (!active.length) return;

    const text = active.map(({ jid, status }) => {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - status.since) / 1000));
        const reason = status.reason ? `\nReason: ${status.reason}` : '';
        return `@${jid.split('@')[0]} is away (${elapsedSeconds}s).${reason}`;
    }).join('\n\n');

    await sock.sendMessage(chatId, {
        text,
        mentions: active.map(item => item.jid)
    }, { quoted: message });
}

module.exports = { afkCommand, handleAfkMentions };
