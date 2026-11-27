const axios = require('axios');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function getMessageText(message) {
    const content = unwrapEphemeralMessage(message.message || {});
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || content.documentMessage?.caption
        || '';
}

function extractGeminiText(responseData) {
    const blockReason = responseData?.promptFeedback?.blockReason;
    if (blockReason) {
        const error = new Error(`Gemini blocked the prompt: ${blockReason}`);
        error.code = 'PROMPT_BLOCKED';
        throw error;
    }

    const text = (responseData?.candidates || [])
        .flatMap(candidate => candidate.content?.parts || [])
        .map(part => part.text)
        .filter(part => typeof part === 'string' && part.trim())
        .join('\n')
        .trim();
    if (text) return text;

    const apiMessage = responseData?.error?.message;
    throw new Error(apiMessage || 'Gemini returned no text content.');
}

async function requestGemini(query, options = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        const error = new Error('Gemini API key is missing.');
        error.code = 'MISSING_GEMINI_API_KEY';
        throw error;
    }

    const model = options.model || process.env.GEMINI_MODEL || GEMINI_MODEL;
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
        throw new Error('Invalid Gemini model name.');
    }

    const post = options.post || axios.post;
    const response = await post(
        `${GEMINI_API_URL}/${model}:generateContent`,
        { contents: [{ parts: [{ text: query }] }] },
        {
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            timeout: 30000
        }
    );
    return extractGeminiText(response.data);
}

function getAIErrorMessage(error) {
    const status = error.response?.status;
    if (error.code === 'MISSING_GEMINI_API_KEY') {
        return '❌ Gemini is not configured. Set GEMINI_API_KEY in the bot host environment and restart.';
    }
    if (error.code === 'PROMPT_BLOCKED') {
        return '❌ Gemini blocked that prompt. Please rephrase it and try again.';
    }
    if (status === 400) {
        return '❌ Gemini rejected the request. Check the prompt and GEMINI_MODEL setting.';
    }
    if (status === 401 || status === 403) {
        return '❌ Gemini rejected the API key. Verify it and make sure the Gemini API is enabled.';
    }
    if (status === 429) {
        return '❌ Gemini quota or rate limit reached. Check the Google AI Studio quota and try again later.';
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return '❌ Gemini took too long to respond. Please try again.';
    }
    return '❌ Gemini could not return a response. Please try again later.';
}

async function aiCommand(sock, chatId, message, options = {}) {
    const text = getMessageText(message).trim();
    const commandMatch = text.match(/^(\.[a-z0-9]+)(?:\s+([\s\S]*))?$/i);
    if (!commandMatch) {
        await sock.sendMessage(chatId, {
            text: 'Usage: .gemini <question>\nExample: .gemini explain how rainbows form'
        }, { quoted: message });
        return;
    }

    const command = commandMatch[1].toLowerCase();
    const query = (commandMatch[2] || '').trim();
    if (!['.gpt', '.gemini'].includes(command)) {
        await sock.sendMessage(chatId, { text: 'Use .gpt or .gemini for AI questions.' }, { quoted: message });
        return;
    }
    if (!query) {
        await sock.sendMessage(chatId, {
            text: `Please provide a question after ${command}.\nExample: ${command} explain how rainbows form`
        }, { quoted: message });
        return;
    }

    try {
        try {
            await sock.sendMessage(chatId, {
                react: { text: '🤖', key: message.key }
            });
        } catch (reactionError) {
            console.error('Could not send AI processing reaction:', reactionError);
        }

        let answer;
        if (command === '.gemini') {
            answer = await requestGemini(query, options);
        } else {
            const response = await axios.get(
                `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(query)}`,
                { timeout: 30000 }
            );
            if (!response.data?.status || !response.data?.result) {
                throw new Error('Invalid response from GPT API.');
            }
            answer = response.data.result;
        }

        await sock.sendMessage(chatId, { text: answer }, { quoted: message });
    } catch (error) {
        console.error(`${command} API error:`, {
            status: error.response?.status,
            code: error.code,
            message: error.message
        });
        const text = command === '.gemini'
            ? getAIErrorMessage(error)
            : '❌ Failed to get response. Please try again later.';
        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
}

module.exports = aiCommand;
module.exports.requestGemini = requestGemini;
