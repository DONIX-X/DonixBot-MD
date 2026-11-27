const axios = require('axios');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const POLLINATIONS_IMAGE_API = 'https://image.pollinations.ai/prompt/';
const POLLINATIONS_AUTH_IMAGE_API = 'https://gen.pollinations.ai/image/';
const DEFAULT_IMAGE_MODEL = 'tongyi-mai/z-image-turbo';

function getMessageText(message) {
    const content = unwrapEphemeralMessage(message.message || {});
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || '';
}

function getRetryAfterSeconds(error) {
    const rawValue = error.response?.headers?.['retry-after']
        || error.response?.headers?.get?.('retry-after');
    if (!rawValue) return null;

    const seconds = Number(rawValue);
    if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);

    const retryAt = Date.parse(rawValue);
    if (Number.isNaN(retryAt)) return null;
    return Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
}

function getImageErrorMessage(error, hasApiKey) {
    const status = error.response?.status;
    const retryAfter = getRetryAfterSeconds(error);
    const retryMessage = retryAfter
        ? ` Retry in about ${retryAfter} seconds.`
        : ' Please wait a bit and try again.';

    if (status === 402) {
        return hasApiKey
            ? '❌ Pollinations could not process this request because the key balance or budget may be exhausted. Check your account balance and key budget.'
            : `❌ The free image service has reached its limit.${retryMessage} For higher limits, configure POLLINATIONS_API_KEY with a funded Pollinations account.`;
    }
    if (status === 429) {
        return `❌ The image service is rate-limited.${retryMessage}`;
    }
    if (status === 413) {
        return '❌ That image prompt is too long. Please shorten it and try again.';
    }
    if (status === 503) {
        return `❌ The image service is temporarily busy.${retryMessage}`;
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return '❌ Image generation took too long. Please try again.';
    }
    return '❌ Failed to generate the image. Please try again later.';
}

async function imagineCommand(sock, chatId, message, options = {}) {
    const text = getMessageText(message).trim();
    const match = text.match(/^(\.imagine|\.flux|\.dalle)(?:\s+([\s\S]*))?$/i);
    const prompt = (match?.[2] || '').trim();

    if (!match || !prompt) {
        await sock.sendMessage(chatId, {
            text: 'Send a prompt after .imagine.\nExample: .imagine a friendly orange cat sitting by a window'
        }, { quoted: message });
        return;
    }
    if (prompt.length > 1500) {
        await sock.sendMessage(chatId, {
            text: '❌ Image prompts must be 1,500 characters or fewer.'
        }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, {
        text: '🎨 Generating your image... Please wait.'
    }, { quoted: message });

    try {
        const imageUrl = new URL(`${POLLINATIONS_IMAGE_API}${encodeURIComponent(prompt)}`);
        imageUrl.searchParams.set('width', '768');
        imageUrl.searchParams.set('height', '768');
        imageUrl.searchParams.set('safe', 'true');

        const apiKey = options.apiKey || process.env.POLLINATIONS_API_KEY;
        const requestUrl = apiKey
            ? new URL(`${POLLINATIONS_AUTH_IMAGE_API}${encodeURIComponent(prompt)}`)
            : imageUrl;
        if (apiKey) {
            requestUrl.searchParams.set(
                'model',
                options.model || process.env.POLLINATIONS_IMAGE_MODEL || DEFAULT_IMAGE_MODEL
            );
            requestUrl.searchParams.set('width', '768');
            requestUrl.searchParams.set('height', '768');
            requestUrl.searchParams.set('safe', 'true');
        }

        const get = options.get || axios.get;
        const requestOptions = {
            responseType: 'arraybuffer',
            timeout: 90000,
            maxContentLength: 10 * 1024 * 1024
        };
        if (apiKey) {
            requestOptions.headers = { Authorization: `Bearer ${apiKey}` };
        }
        const response = await get(requestUrl.toString(), requestOptions);
        const contentType = response.headers?.['content-type'];
        const imageBuffer = Buffer.isBuffer(response.data)
            ? response.data
            : Buffer.from(response.data || '');

        if (!imageBuffer.length || (contentType && !contentType.startsWith('image/'))) {
            throw new Error('Image provider returned an invalid image response.');
        }

        await sock.sendMessage(chatId, {
            image: imageBuffer,
            caption: `🎨 ${prompt.slice(0, 700)}`
        }, { quoted: message });
    } catch (error) {
        console.error('Image generation failed:', {
            status: error.response?.status,
            code: error.code,
            message: error.message
        });
        await sock.sendMessage(chatId, {
            text: getImageErrorMessage(error, Boolean(options.apiKey || process.env.POLLINATIONS_API_KEY))
        }, { quoted: message });
    }
}

module.exports = imagineCommand;
