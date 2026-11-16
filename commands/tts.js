const googleTTS = require('google-tts-api');
const fetch = require('node-fetch');

async function ttsCommand(sock, chatId, text, message, language = 'en') {
    if (!text) {
        await sock.sendMessage(chatId, { text: 'Please provide the text for TTS conversion.' });
        return;
    }

    try {
        const audioSegments = googleTTS.getAllAudioUrls(text, {
            lang: language,
            host: 'https://translate.google.com'
        });
        const buffers = [];

        for (const { url } of audioSegments) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`TTS service returned HTTP ${response.status}`);
            }

            const audioBuffer = await response.buffer();
            if (!audioBuffer.length) {
                throw new Error('TTS service returned empty audio');
            }
            buffers.push(audioBuffer);
        }

        await sock.sendMessage(chatId, {
            audio: Buffer.concat(buffers),
            mimetype: 'audio/mpeg'
        }, { quoted: message });
    } catch (error) {
        console.error('TTS generation failed:', error);
        await sock.sendMessage(chatId, {
            text: 'Error generating TTS audio. Please try again.'
        }, { quoted: message });
    }
}

module.exports = ttsCommand;
