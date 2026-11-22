const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/lightweight_store');

const viewOnceLogger = {
    info: (details, message) => console.info(`[vv] ${message}`, details)
};

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

function getStoredViewOnceCandidates(contextInfo, chatId, message) {
    if (!contextInfo?.stanzaId) return [];

    const chatIds = [
        contextInfo.remoteJid,
        contextInfo.remoteJidAlt,
        message.key?.remoteJidAlt,
        chatId
    ].filter((jid, index, list) => jid && list.indexOf(jid) === index);

    return Promise.all(chatIds.map(async jid => {
        const storedMessage = await store.loadMessage(jid, contextInfo.stanzaId);
        const mediaInfo = findViewOnceMedia(storedMessage?.message);
        return mediaInfo ? { ...mediaInfo, sourceMessage: storedMessage } : null;
    })).then(results => results.filter(Boolean));
}

async function downloadViewOnceMedia(candidates, sock) {
    let lastError = null;
    const orderedCandidates = [...candidates].sort((a, b) => {
        const aComplete = Boolean(a.media.mediaKey && (a.media.directPath || a.media.url));
        const bComplete = Boolean(b.media.mediaKey && (b.media.directPath || b.media.url));
        return Number(bComplete) - Number(aComplete);
    });

    for (const candidate of orderedCandidates) {
        if (candidate.sourceMessage) {
            try {
                if (!candidate.media.url && !candidate.media.directPath && typeof sock.updateMediaMessage === 'function') {
                    candidate.sourceMessage = await sock.updateMediaMessage(candidate.sourceMessage);
                    const refreshedMedia = findViewOnceMedia(candidate.sourceMessage?.message);
                    if (refreshedMedia) {
                        candidate.media = refreshedMedia.media;
                        candidate.type = refreshedMedia.type;
                    }
                }

                const context = typeof sock.updateMediaMessage === 'function'
                    ? {
                        logger: viewOnceLogger,
                        reuploadRequest: sourceMessage => sock.updateMediaMessage(sourceMessage)
                    }
                    : undefined;
                const buffer = await downloadMediaMessage(candidate.sourceMessage, 'buffer', {}, context);
                if (!buffer?.length) throw new Error('Downloaded view-once media is empty');
                return { buffer, mediaInfo: candidate };
            } catch (error) {
                lastError = error;
                console.error('Could not download the stored view-once message:', error);
            }
        }

        try {
            const stream = await downloadContentFromMessage(candidate.media, candidate.type);
            const chunks = [];
            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
            const buffer = Buffer.concat(chunks);
            if (!buffer.length) throw new Error('Downloaded view-once media is empty');
            return { buffer, mediaInfo: candidate };
        } catch (error) {
            lastError = error;
            console.error('Could not download a view-once media candidate:', error);
        }
    }

    throw lastError || new Error('No downloadable view-once media was found');
}

async function viewonceCommand(sock, chatId, message) {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo
        || message.message?.imageMessage?.contextInfo
        || message.message?.videoMessage?.contextInfo;
    const candidates = [];
    const quotedMedia = findViewOnceMedia(contextInfo?.quotedMessage);
    if (quotedMedia) {
        candidates.push({
            ...quotedMedia,
            sourceMessage: contextInfo?.stanzaId ? {
                key: {
                    remoteJid: contextInfo.remoteJid || chatId,
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                },
                message: contextInfo.quotedMessage
            } : null
        });
    }
    candidates.push(...await getStoredViewOnceCandidates(contextInfo, chatId, message));

    if (!candidates.length) {
        await sock.sendMessage(chatId, { text: '❌ Please reply to a view-once image or video.' }, { quoted: message });
        return;
    }

    try {
        const { buffer, mediaInfo } = await downloadViewOnceMedia(candidates, sock);

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