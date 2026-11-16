const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const viewOnceWrappers = [
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension'
];

function findViewOnceMedia(quotedMessage) {
    let current = quotedMessage;
    let isViewOnce = false;
    const visited = new Set();

    while (current && typeof current === 'object' && !visited.has(current)) {
        visited.add(current);

        for (const mediaType of ['imageMessage', 'videoMessage']) {
            const media = current[mediaType];
            if (media && (isViewOnce || media.viewOnce === true)) {
                return {
                    media,
                    type: mediaType === 'imageMessage' ? 'image' : 'video'
                };
            }
        }

        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
            continue;
        }

        const wrapper = viewOnceWrappers.find(key => current[key]?.message);
        if (wrapper) {
            isViewOnce = true;
            current = current[wrapper].message;
            continue;
        }

        return null;
    }

    return null;
}

async function viewonceCommand(sock, chatId, message) {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo
        || message.message?.imageMessage?.contextInfo
        || message.message?.videoMessage?.contextInfo;
    const mediaInfo = findViewOnceMedia(contextInfo?.quotedMessage);

    if (!mediaInfo) {
        await sock.sendMessage(chatId, { text: '❌ Please reply to a view-once image or video.' }, { quoted: message });
        return;
    }

    try {
        const stream = await downloadContentFromMessage(mediaInfo.media, mediaInfo.type);
        const chunks = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) throw new Error('Downloaded view-once media is empty');

        const mediaKey = mediaInfo.type;
        const payload = {
            [mediaKey]: buffer,
            mimetype: mediaInfo.media.mimetype || (mediaKey === 'image' ? 'image/jpeg' : 'video/mp4'),
            caption: mediaInfo.media.caption || ''
        };
        await sock.sendMessage(chatId, payload, { quoted: message });
    } catch (error) {
        console.error('Error retrieving view-once media:', error);
        await sock.sendMessage(chatId, {
            text: '❌ Could not retrieve that view-once media.'
        }, { quoted: message });
    }
}

module.exports = viewonceCommand; 