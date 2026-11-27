const { downloadContentFromMessage, downloadMediaMessage } = require('@whiskeysockets/baileys');
const store = require('../lib/lightweight_store');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const viewOnceLogger = {
    info: (details, message) => console.info(`[vv] ${message}`, details)
};

const viewOnceWrappers = [
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension'
];
const viewOnceMediaCache = new Map();
const VIEW_ONCE_CACHE_TTL_MS = 15 * 60 * 1000;
const VIEW_ONCE_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const VIEW_ONCE_CACHE_MAX_ITEMS = 50;

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

function hasMediaKey(media) {
    return Buffer.isBuffer(media?.mediaKey) || media?.mediaKey instanceof Uint8Array;
}

function restoreSerializedMediaKey(media) {
    const mediaKey = media?.mediaKey;
    if (mediaKey?.type === 'Buffer' && Array.isArray(mediaKey.data)) {
        media.mediaKey = Buffer.from(mediaKey.data);
    }
}

function getStoredMediaCandidate(storedMessage) {
    const mediaInfo = findViewOnceMedia(storedMessage?.message);
    if (!mediaInfo) return null;
    restoreSerializedMediaKey(mediaInfo.media);
    return { ...mediaInfo, sourceMessage: storedMessage, source: 'store' };
}

async function downloadMediaBuffer(media, type) {
    const stream = await downloadContentFromMessage(media, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    if (!buffer.length) throw new Error('Downloaded view-once media is empty');
    return buffer;
}

function pruneViewOnceCache() {
    const now = Date.now();
    for (const [id, entry] of viewOnceMediaCache) {
        if (entry.expiresAt <= now) viewOnceMediaCache.delete(id);
    }

    const getCachedBytes = () => [...viewOnceMediaCache.values()]
        .reduce((total, entry) => total + entry.buffer.length, 0);
    while (
        viewOnceMediaCache.size > VIEW_ONCE_CACHE_MAX_ITEMS ||
        getCachedBytes() > VIEW_ONCE_CACHE_MAX_BYTES
    ) {
        viewOnceMediaCache.delete(viewOnceMediaCache.keys().next().value);
    }
}

async function cacheIncomingViewOnceMessage(sock, message) {
    const id = message?.key?.id;
    let mediaInfo = findViewOnceMedia(message?.message);
    if (!id || !mediaInfo) return;

    try {
        let buffer;
        try {
            buffer = await downloadMediaBuffer(mediaInfo.media, mediaInfo.type);
        } catch (downloadError) {
            if (!hasMediaKey(mediaInfo.media) || typeof sock.updateMediaMessage !== 'function') {
                throw downloadError;
            }

            const refreshedMessage = await sock.updateMediaMessage(message);
            const refreshedMedia = findViewOnceMedia(refreshedMessage?.message);
            if (!refreshedMedia) throw downloadError;
            mediaInfo = refreshedMedia;
            buffer = await downloadMediaBuffer(mediaInfo.media, mediaInfo.type);
        }

        if (buffer.length > VIEW_ONCE_CACHE_MAX_BYTES) {
            console.warn(`Skipping view-once cache for ${id}: media exceeds cache size limit`);
            return;
        }

        pruneViewOnceCache();
        viewOnceMediaCache.delete(id);
        viewOnceMediaCache.set(id, {
            buffer,
            type: mediaInfo.type,
            mimetype: mediaInfo.media.mimetype,
            caption: mediaInfo.media.caption || '',
            expiresAt: Date.now() + VIEW_ONCE_CACHE_TTL_MS
        });
        pruneViewOnceCache();
    } catch (error) {
        console.error(`Could not cache received view-once media (${id}):`, error);
    }
}

function getCachedViewOnceMedia(id) {
    if (!id) return null;
    pruneViewOnceCache();
    return viewOnceMediaCache.get(id) || null;
}

function getStoredViewOnceCandidates(contextInfo, chatId, message) {
    if (!contextInfo?.stanzaId) return [];

    const chatIds = [
        contextInfo.remoteJid,
        contextInfo.remoteJidAlt,
        message.key?.remoteJidAlt,
        chatId
    ].filter((jid, index, list) => jid && list.indexOf(jid) === index);

    const storedCandidates = [];
    const seenMessages = new Set();
    const candidateChatIds = [...chatIds, ...Object.keys(store.messages || {})];

    return Promise.all(candidateChatIds.map(async jid => {
        if (seenMessages.has(jid)) return null;
        seenMessages.add(jid);
        const storedMessage = await store.loadMessage(jid, contextInfo.stanzaId);
        return getStoredMediaCandidate(storedMessage);
    })).then(results => {
        for (const candidate of results) {
            if (candidate) storedCandidates.push(candidate);
        }
        return storedCandidates;
    });
}

async function downloadViewOnceMedia(candidates, sock) {
    let lastError = null;
    const orderedCandidates = [...candidates].sort((a, b) => {
        const score = candidate =>
            (hasMediaKey(candidate.media) ? 2 : 0) +
            (candidate.media.directPath || candidate.media.url ? 1 : 0) +
            (candidate.source === 'store' ? 1 : 0);
        return score(b) - score(a);
    });

    for (const candidate of orderedCandidates) {
        if (candidate.sourceMessage) {
            try {
                if (
                    !candidate.media.url &&
                    !candidate.media.directPath &&
                    hasMediaKey(candidate.media) &&
                    typeof sock.updateMediaMessage === 'function'
                ) {
                    candidate.sourceMessage = await sock.updateMediaMessage(candidate.sourceMessage);
                    const refreshedMedia = findViewOnceMedia(candidate.sourceMessage?.message);
                    if (refreshedMedia) {
                        candidate.media = refreshedMedia.media;
                        candidate.type = refreshedMedia.type;
                    }
                }

                const context = hasMediaKey(candidate.media) && typeof sock.updateMediaMessage === 'function'
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
            const buffer = await downloadMediaBuffer(candidate.media, candidate.type);
            return { buffer, mediaInfo: candidate };
        } catch (error) {
            lastError = error;
            console.error('Could not download a view-once media candidate:', error);
        }
    }

    throw lastError || new Error('No downloadable view-once media was found');
}

async function viewonceCommand(sock, chatId, message) {
    const messageContent = unwrapEphemeralMessage(message.message);
    const contextInfo = messageContent?.extendedTextMessage?.contextInfo
        || messageContent?.imageMessage?.contextInfo
        || messageContent?.videoMessage?.contextInfo;
    const cachedMedia = getCachedViewOnceMedia(contextInfo?.stanzaId);
    if (cachedMedia) {
        const payload = {
            [cachedMedia.type]: cachedMedia.buffer,
            mimetype: cachedMedia.mimetype || (cachedMedia.type === 'image' ? 'image/jpeg' : 'video/mp4'),
            caption: cachedMedia.caption
        };
        await sock.sendMessage(chatId, payload, { quoted: message });
        viewOnceMediaCache.delete(contextInfo.stanzaId);
        return;
    }

    const candidates = [];
    const quotedMedia = findViewOnceMedia(contextInfo?.quotedMessage);
    if (quotedMedia) {
        candidates.push({
            ...quotedMedia,
            source: 'quote',
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
module.exports.cacheIncomingViewOnceMessage = cacheIncomingViewOnceMessage;