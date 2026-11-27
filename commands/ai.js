const axios = require('axios');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

const POLLINATIONS_TEXT_API = 'https://text.pollinations.ai/';

function getMessageText(message) {
    const content = unwrapEphemeralMessage(message.message || {});
    return content.conversation
        || content.extendedTextMessage?.text
        || content.imageMessage?.caption
        || content.videoMessage?.caption
        || content.documentMessage?.caption
        || '';
}

function extractText(responseData) {
    if (typeof responseData === 'string') {
        const text = responseData.trim();
        if (text) return text;
    } else if (responseData && typeof responseData === 'object') {
        const text = responseData.choices?.[0]?.message?.content
            || responseData.answer
            || responseData.text;
        if (typeof text === 'string' && text.trim()) return text.trim();
        if (responseData.error) {
            throw new Error(typeof responseData.error === 'string'
                ? responseData.error
                : JSON.stringify(responseData.error));
        }
    }

    throw new Error('AI provider returned an empty response.');
}

async function requestPollinations(query, options = {}) {
    const post = options.post || axios.post;
    const response = await post(
        POLLINATIONS_TEXT_API,
        { messages: [{ role: 'user', content: query }] },
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: 30000,
            responseType: 'text'
        }
    );
    return extractText(response.data);
}

function getAIErrorMessage(error) {
    const status = error.response?.status;
    if (status === 402 || status === 429) {
        return '❌ The free AI service is rate-limited right now. Please wait a bit and try again.';
    }
    if (status === 413) {
        return '❌ That question is too long for the free AI service. Please shorten it and try again.';
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return '❌ The AI service took too long to respond. Please try again.';
    }
    return '❌ The AI service could not return a response. Please try again later.';
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
            answer = await requestPollinations(query, options);
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
        console.error(`${command} API error:`, error);
        const text = command === '.gemini'
            ? getAIErrorMessage(error)
            : '❌ Failed to get response. Please try again later.';
        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
}

module.exports = aiCommand;
module.exports.requestPollinations = requestPollinations;
