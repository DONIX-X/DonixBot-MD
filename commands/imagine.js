const axios = require('axios');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const POLLINATIONS_IMAGE_API = 'https://image.pollinations.ai/prompt/';

function getMessageText(message) {
    const content = unwrapEphemeralMessage(message.message || {});
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || '';
}

function getImageErrorMessage(error) {
    const status = error.response?.status;
    if (status === 402 || status === 429) {
        return '❌ The free image service is rate-limited right now. Please wait a bit and try again.';
    }
    if (status === 413) {
        return '❌ That image prompt is too long. Please shorten it and try again.';
    }
    if (status === 503) {
        const retryAfter = Number(
            error.response?.headers?.['retry-after']
            || error.response?.headers?.get?.('retry-after')
        );
        const waitMessage = Number.isFinite(retryAfter) && retryAfter > 0
            ? ` Please retry in ${retryAfter} seconds.`
            : ' Please try again shortly.';
        return `❌ The free image service is temporarily busy.${waitMessage}`;
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

        const get = options.get || axios.get;
        const response = await get(imageUrl.toString(), {
            responseType: 'arraybuffer',
            timeout: 90000,
            maxContentLength: 10 * 1024 * 1024
        });
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
            text: getImageErrorMessage(error)
        }, { quoted: message });
    }
}

module.exports = imagineCommand;
