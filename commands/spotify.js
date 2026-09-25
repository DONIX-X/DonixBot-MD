const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { toAudio } = require('../lib/converter');

const execFileAsync = promisify(execFile);

async function downloadSpotifyTrack(query) {
    const search = await yts(query);
    const video = search.videos?.[0];
    if (!video) throw new Error('No matching track found');

    const outputPath = path.join(__dirname, '../temp', `spotify-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
    const ytDlpPath = process.env.YTDLP_PATH || 'yt-dlp';

    try {
        await execFileAsync(ytDlpPath, [
            '--no-playlist',
            '--no-warnings',
            '--no-progress',
            '--extractor-args', 'youtube:player_client=android',
            '--format', '18/bestaudio/best',
            '--output', outputPath,
            video.url
        ], { timeout: 180000, windowsHide: true });

        const audio = await toAudio(await fs.promises.readFile(outputPath), 'mp4');
        return { audio, video };
    } finally {
        await fs.promises.rm(outputPath, { force: true }).catch(() => {});
    }
}

async function spotifyCommand(sock, chatId, message) {
    try {
        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        const used = (rawText || '').split(/\s+/)[0] || '.spotify';
        const query = rawText.slice(used.length).trim();

        if (!query) {
            await sock.sendMessage(chatId, { text: 'Usage: .spotify <song/artist/keywords>\nExample: .spotify con calma' }, { quoted: message });
            return;
        }

        const { audio, video } = await downloadSpotifyTrack(query);
        const caption = `🎵 ${video.title}\n👤 ${video.author?.name || ''}\n⏱ ${video.timestamp || ''}`.trim();

         // Send cover and info as a follow-up (optional)
         if (video.thumbnail) {
            await sock.sendMessage(chatId, { image: { url: video.thumbnail }, caption }, { quoted: message });
        } else if (caption) {
            await sock.sendMessage(chatId, { text: caption }, { quoted: message });
        }
        await sock.sendMessage(chatId, {
            audio,
            mimetype: 'audio/mpeg',
            fileName: `${video.title.replace(/[\\/:*?"<>|]/g, '')}.mp3`
        }, { quoted: message });

       

    } catch (error) {
        console.error('[SPOTIFY] error:', error?.message || error);
        await sock.sendMessage(chatId, { text: 'Failed to fetch Spotify audio. Try another query later.' }, { quoted: message });
    }
}

module.exports = spotifyCommand;
