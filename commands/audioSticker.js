const { downloadMediaMessage, prepareWAMessageMedia, proto } = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webp = require('node-webpmux');
const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
const settings = require('../settings');

const MAX_STICKER_BYTES = 900 * 1024;
const stickerProfiles = [
    { duration: 5, fps: 15, quality: 60 },
    { duration: 4, fps: 10, quality: 35 },
    { duration: 3, fps: 8, quality: 20 },
    { duration: 2, fps: 6, quality: 15 }
];
const stateKey = Symbol.for('donixbot.audioStickerState');
let state = proto.Message[stateKey];

function encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
        bytes.push((value & 0x7f) | 0x80);
        value = Math.floor(value / 128);
    }
    bytes.push(value);
    return Buffer.from(bytes);
}

function encodeBytesField(fieldNumber, value) {
    return Buffer.concat([
        encodeVarint((fieldNumber << 3) | 2),
        encodeVarint(value.length),
        value
    ]);
}

if (!state) {
    state = { pendingAudioByStickerHash: new Map() };
    const originalEncode = proto.Message.encode.bind(proto.Message);

    // Audio stickers use an undocumented FutureProofMessage field not present in Baileys' schema.
    proto.Message.encode = function (message, writer) {
        const sticker = message?.stickerMessage;
        const stickerHash = sticker?.fileSha256
            ? Buffer.from(sticker.fileSha256).toString('base64')
            : null;
        const audio = stickerHash && state.pendingAudioByStickerHash.get(stickerHash);
        if (!audio) return originalEncode(message, writer);

        const encodedSticker = proto.Message.StickerMessage.encode(sticker).finish();
        const encodedAudio = proto.Message.AudioMessage.encode(audio).finish();
        const stickerWithAudio = Buffer.concat([
            encodedSticker,
            encodeBytesField(26, encodedAudio)
        ]);
        const futureProofMessage = encodeBytesField(
            1,
            encodeBytesField(26, stickerWithAudio)
        );
        const outputWriter = writer || originalEncode({}, undefined);
        outputWriter.uint32((134 << 3) | 2).bytes(futureProofMessage);

        const remainingMessage = { ...message };
        delete remainingMessage.stickerMessage;
        return originalEncode(remainingMessage, outputWriter);
    };

    Object.defineProperty(proto.Message, stateKey, { value: state, configurable: true });
}

function unwrapMessage(message) {
    let content = message;
    while (content) {
        if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
        else if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
        else if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message;
        else break;
    }
    return content;
}

function getQuotedVideo(message, chatId) {
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = unwrapMessage(contextInfo?.quotedMessage);
    if (!quotedMessage?.videoMessage) return null;

    return {
        source: {
            key: {
                remoteJid: chatId,
                id: contextInfo.stanzaId,
                participant: contextInfo.participant
            },
            message: quotedMessage
        },
        videoMessage: quotedMessage.videoMessage
    };
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
            stdio: ['ignore', 'ignore', 'pipe'],
            windowsHide: true
        });

        child.stderr.on('data', chunk => {
            stderr = (stderr + chunk.toString()).slice(-4000);
        });
        child.once('error', reject);
        child.once('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg failed with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
        });
    });
}

async function createAnimatedSticker(videoPath, tempDir) {
    for (let index = 0; index < stickerProfiles.length; index += 1) {
        const profile = stickerProfiles[index];
        const outputPath = path.join(tempDir, `sticker-${index}.webp`);
        await runFfmpeg([
            '-i', videoPath,
            '-t', String(profile.duration),
            '-vf', `fps=${profile.fps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
            '-vcodec', 'libwebp',
            '-lossless', '0',
            '-compression_level', '6',
            '-q:v', String(profile.quality),
            '-loop', '0',
            '-preset', 'picture',
            '-an',
            '-fps_mode', 'passthrough',
            outputPath
        ]);

        if (fs.statSync(outputPath).size <= MAX_STICKER_BYTES) {
            return { outputPath, profile };
        }
    }

    throw new Error('The video is too complex to fit WhatsApp sticker limits.');
}

async function createAudioTrack(videoPath, outputPath, duration) {
    await runFfmpeg([
        '-i', videoPath,
        '-map', '0:a:0',
        '-vn',
        '-t', String(duration),
        '-ac', '1',
        '-ar', '48000',
        '-c:a', 'libopus',
        '-b:a', '32k',
        '-application', 'audio',
        '-f', 'ogg',
        outputPath
    ]);
}

async function addAudioStickerMetadata(stickerBuffer, audioHash) {
    const image = new webp.Image();
    await image.load(stickerBuffer);

    const metadata = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': settings.packname || 'Donix Bot MD',
        'sticker-pack-publisher': settings.author || 'DONIX',
        emojis: ['🔊'],
        'sound-sha256': audioHash
    };
    const exifHeader = Buffer.from([
        0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]);
    const metadataBuffer = Buffer.from(JSON.stringify(metadata), 'utf8');
    const exif = Buffer.concat([exifHeader, metadataBuffer]);
    exif.writeUIntLE(metadataBuffer.length, 14, 4);
    image.exif = exif;

    const stickerWithMetadata = await image.save(null);
    if (stickerWithMetadata.length > 1024 * 1024) {
        throw new Error('The sticker exceeds WhatsApp’s 1 MB size limit.');
    }
    return stickerWithMetadata;
}

async function audioStickerCommand(sock, chatId, message) {
    const quotedVideo = getQuotedVideo(message, chatId);
    if (!quotedVideo) {
        await sock.sendMessage(chatId, {
            text: 'Reply to a video with .as to create a sticker that plays its audio.'
        }, { quoted: message });
        return;
    }

    let tempDir;
    let stage = 'downloading the video';
    try {
        await sock.sendMessage(chatId, {
            text: '🔊 Creating your audio sticker…'
        }, { quoted: message });

        const videoBuffer = await downloadMediaMessage(quotedVideo.source, 'buffer', {}, {
            logger: undefined,
            reuploadRequest: sock.updateMediaMessage
        });
        if (!videoBuffer?.length) {
            throw new Error('The replied video could not be downloaded.');
        }

        const tempRoot = path.join(process.cwd(), 'tmp');
        fs.mkdirSync(tempRoot, { recursive: true });
        tempDir = fs.mkdtempSync(path.join(tempRoot, 'audio-sticker-'));
        const videoPath = path.join(tempDir, 'source-video');
        const audioPath = path.join(tempDir, 'sticker-audio.ogg');
        fs.writeFileSync(videoPath, videoBuffer);

        stage = 'converting the video';
        const { outputPath: stickerPath, profile } = await createAnimatedSticker(videoPath, tempDir);
        stage = 'extracting audio';
        await createAudioTrack(videoPath, audioPath, profile.duration);
        const audioBuffer = fs.readFileSync(audioPath);
        if (!audioBuffer.length) {
            throw new Error('FFmpeg produced an empty audio track.');
        }
        const audioHash = crypto.createHash('sha256').update(audioBuffer).digest('base64');
        stage = 'adding sticker metadata';
        const stickerBuffer = await addAudioStickerMetadata(fs.readFileSync(stickerPath), audioHash);

        stage = 'preparing the sticker and audio uploads';
        if (typeof sock.waUploadToServer !== 'function') {
            throw new Error('Baileys media upload is unavailable on this socket.');
        }
        const [preparedSticker, preparedAudio] = await Promise.all([
            prepareWAMessageMedia(
                { sticker: stickerBuffer },
                { upload: sock.waUploadToServer }
            ),
            prepareWAMessageMedia(
                {
                    audio: audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: false,
                    seconds: profile.duration
                },
                { upload: sock.waUploadToServer }
            )
        ]);

        const sticker = preparedSticker.stickerMessage;
        const audio = preparedAudio.audioMessage;
        if (!sticker?.fileSha256 || !audio?.fileSha256 || !audio?.mediaKey || !audio?.directPath) {
            throw new Error('WhatsApp media upload returned incomplete sticker or audio data.');
        }

        sticker.width = 512;
        sticker.height = 512;
        sticker.isAnimated = true;
        sticker.isAvatar = false;
        sticker.isAiSticker = false;
        sticker.isLottie = false;
        audio.mimetype = 'audio/ogg; codecs=opus';
        audio.ptt = false;
        audio.seconds = audio.seconds || profile.duration;

        const stickerHash = Buffer.from(sticker.fileSha256).toString('base64');
        state.pendingAudioByStickerHash.set(stickerHash, audio);
        stage = 'sending the sticker';
        try {
            await sock.relayMessage(chatId, { stickerMessage: sticker }, {});
        } finally {
            state.pendingAudioByStickerHash.delete(stickerHash);
        }
    } catch (error) {
        console.error('Error creating audio sticker:', error);
        const reason = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 200);
        await sock.sendMessage(chatId, {
            text: `❌ Audio sticker failed while ${stage}: ${reason}`
        }, { quoted: message });
    } finally {
        if (tempDir) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

module.exports = audioStickerCommand;
