const {
    downloadMediaMessage,
    prepareWAMessageMedia,
    proto
} = require('@whiskeysockets/baileys');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webp = require('node-webpmux');
const ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
const settings = require('../settings');

const MAX_STICKER_BYTES = 500 * 1024;
const MAX_STICKER_ANIMATION_SECONDS = 10;
const audioStickerPatchKey = Symbol.for('donixbot.audioStickerProtoPatch');
const audioStickerMessagePatchKey = Symbol.for('donixbot.audioStickerMessageProtoPatch');
const stickerProfiles = [
    { fps: 12, quality: 45, size: 512 },
    { fps: 10, quality: 30, size: 512 },
    { fps: 8, quality: 20, size: 512 },
    { fps: 6, quality: 15, size: 512 }
];

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

if (!proto.Message.StickerMessage[audioStickerPatchKey]) {
    const originalStickerEncode = proto.Message.StickerMessage.encode;
    const originalStickerFromObject = proto.Message.StickerMessage.fromObject;

    proto.Message.StickerMessage.encode = function (sticker, writer) {
        const outputWriter = originalStickerEncode.call(this, sticker, writer);
        if (sticker?.audioMessage) {
            proto.Message.AudioMessage.encode(
                sticker.audioMessage,
                outputWriter.uint32((26 << 3) | 2).fork()
            ).ldelim();
        }
        return outputWriter;
    };

    proto.Message.StickerMessage.fromObject = function (object) {
        const sticker = originalStickerFromObject.call(this, object);
        if (object?.audioMessage) {
            sticker.audioMessage = proto.Message.AudioMessage.fromObject(object.audioMessage);
        }
        return sticker;
    };

    Object.defineProperty(proto.Message.StickerMessage, audioStickerPatchKey, {
        value: true,
        configurable: true
    });
}

if (!proto.Message[audioStickerMessagePatchKey]) {
    const originalMessageEncode = proto.Message.encode;

    proto.Message.encode = function (message, writer) {
        const sticker = message?.stickerMessage;
        if (!sticker?.audioMessage) {
            return originalMessageEncode.call(this, message, writer);
        }

        const encodedSticker = proto.Message.StickerMessage.encode(sticker).finish();
        const futureProofMessage = encodeBytesField(
            1,
            encodeBytesField(26, encodedSticker)
        );
        const outputWriter = writer || originalMessageEncode.call(this, {}, undefined);

        // Keep stickerMessage visible to Baileys' relay code so it sets mediatype="sticker".
        outputWriter.uint32((134 << 3) | 2).bytes(futureProofMessage);

        const remainingMessage = { ...message };
        delete remainingMessage.stickerMessage;
        return originalMessageEncode.call(this, remainingMessage, outputWriter);
    };

    Object.defineProperty(proto.Message, audioStickerMessagePatchKey, {
        value: true,
        configurable: true
    });
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

async function createAnimatedSticker(videoPath, tempDir, duration) {
    for (let index = 0; index < stickerProfiles.length; index += 1) {
        const profile = stickerProfiles[index];
        const size = profile.size || 512;
        const outputPath = path.join(tempDir, `sticker-${index}.webp`);
        await runFfmpeg([
            '-i', videoPath,
            '-t', String(duration),
            '-vf', `fps=${profile.fps},scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
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

        const outputBytes = fs.statSync(outputPath).size;
        if (outputBytes <= MAX_STICKER_BYTES) {
            console.info(
                `[.as] Using sticker profile (cap ${duration}s, ${profile.fps} fps, ${size}px source, ${outputBytes} bytes).`
            );
            return { outputPath };
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
        '-b:a', '64k',
        '-application', 'audio',
        '-vbr', 'on',
        '-compression_level', '10',
        '-frame_duration', '20',
        '-avoid_negative_ts', 'make_zero',
        '-f', 'ogg',
        outputPath
    ]);
}

async function createAudioWaveform(audioPath, outputPath) {
    await runFfmpeg([
        '-i', audioPath,
        '-map', '0:a:0',
        '-ac', '1',
        '-ar', '8000',
        '-f', 's16le',
        outputPath
    ]);

    const pcm = fs.readFileSync(outputPath);
    const sampleCount = Math.floor(pcm.length / 2);
    if (!sampleCount) {
        throw new Error('FFmpeg produced no audio samples for the waveform.');
    }

    const amplitudes = new Float64Array(64);
    let peak = 0;
    for (let index = 0; index < amplitudes.length; index += 1) {
        const start = Math.floor(index * sampleCount / amplitudes.length);
        const end = Math.max(start + 1, Math.floor((index + 1) * sampleCount / amplitudes.length));
        let total = 0;
        let count = 0;
        for (let sample = start; sample < Math.min(end, sampleCount); sample += 1) {
            total += Math.abs(pcm.readInt16LE(sample * 2));
            count += 1;
        }
        amplitudes[index] = count ? total / count : 0;
        peak = Math.max(peak, amplitudes[index]);
    }

    return Uint8Array.from(amplitudes, amplitude => peak ? Math.round(amplitude * 100 / peak) : 0);
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
    if (stickerWithMetadata.length > MAX_STICKER_BYTES) {
        throw new Error('The animated sticker exceeds WhatsApp’s 500 KB size limit.');
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
        const waveformPath = path.join(tempDir, 'sticker-audio.pcm');
        fs.writeFileSync(videoPath, videoBuffer);

        stage = 'converting the video';
        const sourceDuration = Number(quotedVideo.videoMessage.seconds);
        const stickerDuration = Number.isFinite(sourceDuration) && sourceDuration > 0
            ? Math.min(MAX_STICKER_ANIMATION_SECONDS, Math.ceil(sourceDuration))
            : MAX_STICKER_ANIMATION_SECONDS;
        const { outputPath: stickerPath } = await createAnimatedSticker(
            videoPath,
            tempDir,
            stickerDuration
        );
        stage = 'extracting audio';
        await createAudioTrack(videoPath, audioPath, stickerDuration);
        const audioBuffer = fs.readFileSync(audioPath);
        if (!audioBuffer.length) {
            throw new Error('FFmpeg produced an empty audio track.');
        }
        const audioHash = crypto.createHash('sha256').update(audioBuffer).digest('base64');
        const waveform = await createAudioWaveform(audioPath, waveformPath);
        stage = 'adding sticker metadata';
        const stickerBuffer = await addAudioStickerMetadata(fs.readFileSync(stickerPath), audioHash);

        stage = 'preparing the sticker and audio uploads';
        if (typeof sock.waUploadToServer !== 'function') {
            throw new Error('Baileys media upload is unavailable on this socket.');
        }
        const [preparedSticker, preparedAudio] = await Promise.all([
            prepareWAMessageMedia(
                { sticker: stickerBuffer, isAnimated: true },
                { upload: sock.waUploadToServer }
            ),
            prepareWAMessageMedia(
                {
                    audio: audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: false
                },
                { upload: sock.waUploadToServer }
            )
        ]);

        const sticker = preparedSticker.stickerMessage;
        const audio = preparedAudio.audioMessage;
        if (!sticker?.fileSha256 || !audio?.fileSha256 || !audio?.mediaKey || !audio?.directPath) {
            throw new Error('WhatsApp media upload returned incomplete sticker or audio data.');
        }
        if (!Buffer.from(audio.fileSha256).equals(Buffer.from(audioHash, 'base64'))) {
            throw new Error('The uploaded audio hash does not match the sticker sound metadata.');
        }
        audio.waveform = waveform;

        sticker.width = 512;
        sticker.height = 512;
        sticker.isAnimated = true;
        sticker.stickerSentTs = Date.now();
        sticker.isAvatar = false;
        sticker.isAiSticker = false;
        sticker.isLottie = false;
        audio.mimetype = 'audio/ogg; codecs=opus';
        audio.ptt = false;
        if (!Number.isFinite(audio.seconds) || audio.seconds <= 0) {
            throw new Error('WhatsApp media upload did not return the audio duration.');
        }
        console.info(`[.as] Audio track duration reported by WhatsApp: ${audio.seconds}s.`);

        sticker.audioMessage = audio;
        stage = 'sending the sticker';
        await sock.relayMessage(chatId, { stickerMessage: sticker }, {});
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
