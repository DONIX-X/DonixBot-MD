const axios = require('axios');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GPT4_API_URL = 'https://api.openai.com/v1/chat/completions';
const GPT4_MODEL = 'gpt-4o-mini';
const GPT4_MAX_QUERY_LENGTH = 4000;
const GPT4_COOLDOWN_MS = 15000;
const GPT4_MAX_TRACKED_SENDERS = 10000;
const gpt4LastRequests = new Map();

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

async function requestGpt4(query, options = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const error = new Error('OpenAI API key is missing.');
        error.code = 'MISSING_OPENAI_API_KEY';
        throw error;
    }

    const model = options.model || process.env.OPENAI_MODEL || GPT4_MODEL;
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
        const error = new Error('Invalid OpenAI model name.');
        error.code = 'INVALID_OPENAI_MODEL';
        throw error;
    }

    const post = options.postOpenAI || options.post || axios.post;
    const response = await post(
        GPT4_API_URL,
        {
            model,
            messages: [{ role: 'user', content: query }],
            max_tokens: 512
        },
        {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            timeout: 30000
        }
    );
    const answer = response.data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
        throw new Error('OpenAI returned no text content.');
    }
    return answer.trim();
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

function getGpt4ErrorMessage(error) {
    const status = error.response?.status;
    if (error.code === 'MISSING_OPENAI_API_KEY') {
        return '❌ GPT-4 is not configured. Set OPENAI_API_KEY in the bot host environment and restart.';
    }
    if (error.code === 'INVALID_OPENAI_MODEL') {
        return '❌ The OPENAI_MODEL setting is invalid.';
    }
    if (status === 400) {
        return '❌ OpenAI rejected the request. Check the prompt and OPENAI_MODEL setting.';
    }
    if (status === 401 || status === 403) {
        return '❌ OpenAI rejected the API key or model access. Check the OpenAI account settings.';
    }
    if (status === 429) {
        return '❌ OpenAI quota or rate limit reached. Check the account quota and try again later.';
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return '❌ GPT-4 took too long to respond. Please try again.';
    }
    return '❌ GPT-4 could not return a response. Please try again later.';
}

function getGpt4CooldownSeconds(sender, now = Date.now()) {
    for (const [trackedSender, timestamp] of gpt4LastRequests) {
        if (now - timestamp >= GPT4_COOLDOWN_MS) {
            gpt4LastRequests.delete(trackedSender);
        }
    }

    const previousRequest = gpt4LastRequests.get(sender);
    if (previousRequest !== undefined && now - previousRequest < GPT4_COOLDOWN_MS) {
        return Math.ceil((GPT4_COOLDOWN_MS - (now - previousRequest)) / 1000);
    }

    if (gpt4LastRequests.size >= GPT4_MAX_TRACKED_SENDERS) {
        const oldestSender = gpt4LastRequests.keys().next().value;
        if (oldestSender !== undefined) gpt4LastRequests.delete(oldestSender);
    }
    gpt4LastRequests.set(sender, now);
    return 0;
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
    if (!['.gpt', '.gpt4', '.gemini'].includes(command)) {
        await sock.sendMessage(chatId, { text: 'Use .gpt, .gpt4, or .gemini for AI questions.' }, { quoted: message });
        return;
    }
    if (!query) {
        await sock.sendMessage(chatId, {
            text: `Please provide a question after ${command}.\nExample: ${command} explain how rainbows form`
        }, { quoted: message });
        return;
    }
    if (command === '.gpt4' && query.length > GPT4_MAX_QUERY_LENGTH) {
        await sock.sendMessage(chatId, {
            text: `Please keep GPT-4 questions under ${GPT4_MAX_QUERY_LENGTH} characters.`
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
        } else if (command === '.gpt4') {
            if (options.apiKey || process.env.OPENAI_API_KEY) {
                const sender = message.key?.participant || message.key?.remoteJid || chatId;
                const cooldownSeconds = getGpt4CooldownSeconds(sender, options.now?.() ?? Date.now());
                if (cooldownSeconds) {
                    await sock.sendMessage(chatId, {
                        text: `Please wait ${cooldownSeconds} seconds before using .gpt4 again.`
                    }, { quoted: message });
                    return;
                }
            }
            answer = await requestGpt4(query, options);
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
            : command === '.gpt4'
                ? getGpt4ErrorMessage(error)
                : '❌ Failed to get response. Please try again later.';
        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
}

module.exports = aiCommand;
module.exports.requestGemini = requestGemini;
module.exports.requestGpt4 = requestGpt4;
