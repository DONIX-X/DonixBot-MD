const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const settings = require('../settings');
const webp = require('node-webpmux');
const crypto = require('crypto');
const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';

function resolveTargetMessage(message, chatId) {
    if (message?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quotedInfo = message.message.extendedTextMessage.contextInfo;
        return {
            key: {
                remoteJid: chatId,
                id: quotedInfo.stanzaId,
                participant: quotedInfo.participant
            },
            message: quotedInfo.quotedMessage
        };
    }
    return message;
}

async function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        const child = spawn(ffmpegPath, ['-y', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        child.on('error', (error) => reject(error));
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg failed with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
            }
        });
    });
}

async function createStickerFromBuffer(mediaBuffer, isAnimated) {
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const inputName = `sticker_in_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const outputName = `sticker_out_${Date.now()}_${Math.random().toString(16).slice(2)}.webp`;
    const tempInput = path.join(tmpDir, inputName);
    const tempOutput = path.join(tmpDir, outputName);

    fs.writeFileSync(tempInput, mediaBuffer);

    try {
        const ffmpegArgs = isAnimated
            ? [
                '-i', tempInput,
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                '-c:v', 'libwebp',
                '-preset', 'default',
                '-loop', '0',
                '-vsync', '0',
                '-pix_fmt', 'yuva420p',
                '-quality', '75',
                '-compression_level', '6',
                tempOutput
            ]
            : [
                '-i', tempInput,
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                '-c:v', 'libwebp',
                '-preset', 'default',
                '-loop', '0',
                '-vsync', '0',
                '-pix_fmt', 'yuva420p',
                '-quality', '75',
                '-compression_level', '6',
                tempOutput
            ];

        await runFfmpeg(ffmpegArgs);

        if (!fs.existsSync(tempOutput)) {
            throw new Error('FFmpeg did not create a sticker output file.');
        }

        let webpBuffer = fs.readFileSync(tempOutput);

        if (isAnimated && webpBuffer.length > 1000 * 1024) {
            const fallbackOutput = path.join(tmpDir, `sticker_fallback_${Date.now()}_${Math.random().toString(16).slice(2)}.webp`);
            const fallbackArgs = [
                '-i', tempInput,
                '-t', '2',
                '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=8,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
                '-c:v', 'libwebp',
                '-preset', 'default',
                '-loop', '0',
                '-vsync', '0',
                '-pix_fmt', 'yuva420p',
                '-quality', '30',
                '-compression_level', '6',
                '-b:v', '100k',
                '-max_muxing_queue_size', '1024',
                fallbackOutput
            ];

            try {
                await runFfmpeg(fallbackArgs);
                if (fs.existsSync(fallbackOutput)) {
                    webpBuffer = fs.readFileSync(fallbackOutput);
                }
            } catch (fallbackError) {
                console.warn('Sticker fallback conversion failed:', fallbackError.message);
            } finally {
                if (fs.existsSync(fallbackOutput)) {
                    try { fs.unlinkSync(fallbackOutput); } catch (err) {}
                }
            }
        }

        const img = new webp.Image();
        await img.load(webpBuffer);

        const json = {
            'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
            'sticker-pack-name': settings.packname || 'Donix Bot MD',
            'emojis': ['🤖']
        };

        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuffer]);
        exif.writeUIntLE(jsonBuffer.length, 14, 4);
        img.exif = exif;

        return await img.save(null);
    } finally {
        try { fs.unlinkSync(tempInput); } catch (err) {}
        if (fs.existsSync(tempOutput)) {
            try { fs.unlinkSync(tempOutput); } catch (err) {}
        }
    }
}

async function stickerCommand(sock, chatId, message) {
    const messageToQuote = message;
    let targetMessage = resolveTargetMessage(message, chatId);
    const mediaMessage = targetMessage?.message?.imageMessage || targetMessage?.message?.videoMessage || targetMessage?.message?.documentMessage;

    if (!mediaMessage) {
        await sock.sendMessage(chatId, {
            text: 'Please reply to an image or video with .sticker, or send one as the caption.',
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true
            }
        }, { quoted: messageToQuote });
        return;
    }

    try {
        const mediaBuffer = await downloadMediaMessage(targetMessage, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });

        if (!mediaBuffer) {
            await sock.sendMessage(chatId, {
                text: 'Failed to download media. Please try again.',
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true
                }
            });
            return;
        }

        const isAnimated = Boolean(
            mediaMessage.mimetype?.includes('gif') ||
            mediaMessage.mimetype?.includes('video') ||
            Number(mediaMessage.seconds || 0) > 0
        );

        const finalBuffer = await createStickerFromBuffer(mediaBuffer, isAnimated);

        await sock.sendMessage(chatId, {
            sticker: finalBuffer
        }, { quoted: messageToQuote });
    } catch (error) {
        console.error('Error in sticker command:', error);
        await sock.sendMessage(chatId, {
            text: 'Failed to create sticker! Try again later.',
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true
            }
        });
    }
}

module.exports = stickerCommand;
