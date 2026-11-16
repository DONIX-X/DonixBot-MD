const test = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../settings');
const { isCommandAllowed } = require('../lib/commandAllowlist');
const config = require('../config');
const aliveCommand = require('../commands/alive');
const helpCommand = require('../commands/help');
const { fileTypeFromBuffer } = require('../lib/fileType');

test('project settings load correctly', () => {
  assert.equal(settings.botName, 'Donix Bot MD');
  assert.equal(settings.version, '1.0.7');
  assert.equal(settings.author, 'DONIX');
});

test('command allowlist recognizes bot commands', () => {
  assert.equal(isCommandAllowed('.menu'), true);
  assert.equal(isCommandAllowed('.ping'), true);
  assert.equal(isCommandAllowed('.unknown'), false);
});

test('config exports supported API defaults', () => {
  assert.ok(config.APIs);
  assert.ok(config.APIKeys);
  assert.equal(config.WARN_COUNT, 3);
});

test('alive command sends the animated video', async () => {
  const sentMessages = [];
  const sock = {
    newsletterMetadata: async () => ({ id: 'newsletter-id', name: 'DONIX' }),
    sendMessage: async (...args) => sentMessages.push(args)
  };
  const quotedMessage = { key: { id: 'quoted-message' } };

  await aliveCommand(sock, 'chat-id', quotedMessage);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0][0], 'chat-id');
  assert.ok(Buffer.isBuffer(sentMessages[0][1].video));
  assert.equal(sentMessages[0][1].gifPlayback, true);
  assert.equal(sentMessages[0][2].quoted, quotedMessage);
});

test('help command sends the animated video menu', async () => {
  const sentMessages = [];
  const sock = {
    newsletterMetadata: async () => ({ id: 'newsletter-id', name: 'DONIX' }),
    sendMessage: async (...args) => sentMessages.push(args)
  };

  await helpCommand(sock, 'chat-id', { key: { id: 'quoted-message' } });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0][0], 'chat-id');
  assert.ok(Buffer.isBuffer(sentMessages[0][1].video));
  assert.equal(sentMessages[0][1].gifPlayback, true);
  assert.match(sentMessages[0][1].caption, /𝐃𝐎𝐍𝐈𝐗/);
});

test('file type helper detects image buffers with the patched ESM package', async () => {
  const image = require('node:fs').readFileSync(require('node:path').join(__dirname, '../assets/bot_image.jpg'));
  const type = await fileTypeFromBuffer(image);

  assert.equal(type.mime, 'image/jpeg');
});

test('image helpers work with the installed Jimp API', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
  const image = fs.readFileSync(imagePath);
  const myfuncPath = require.resolve('../lib/myfunc');
  const myfunc = require(myfuncPath);

  try {
    const resized = await myfunc.reSize(image, 64, 64);
    const profilePicture = await myfunc.generateProfilePicture(image);

    assert.ok(resized.length > 0);
    assert.ok(profilePicture.img.length > 0);
    assert.equal(profilePicture.preview, profilePicture.img);
  } finally {
    fs.unwatchFile(myfuncPath);
  }
});

test('TTS command sends fetched audio without creating temp files', async () => {
  const fetchPath = require.resolve('node-fetch');
  const originalFetch = require(fetchPath);
  const fetchModule = require.cache[fetchPath];
  const ttsPath = require.resolve('../commands/tts');
  const originalTtsModule = require.cache[ttsPath];
  const sentMessages = [];
  const quotedMessage = { key: { id: 'quoted-message' } };

  fetchModule.exports = async () => ({
    ok: true,
    status: 200,
    buffer: async () => Buffer.from('fake-audio')
  });
  delete require.cache[ttsPath];

  try {
    const ttsCommand = require('../commands/tts');
    await ttsCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'chat-id', 'hello', quotedMessage);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][0], 'chat-id');
    assert.ok(Buffer.isBuffer(sentMessages[0][1].audio));
    assert.equal(sentMessages[0][1].mimetype, 'audio/mpeg');
    assert.equal(sentMessages[0][2].quoted, quotedMessage);
  } finally {
    fetchModule.exports = originalFetch;
    if (originalTtsModule) {
      require.cache[ttsPath] = originalTtsModule;
    } else {
      delete require.cache[ttsPath];
    }
  }
});

test('vv unwraps and sends quoted view-once V2 images', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const baileysModule = require.cache[baileysPath];
  const originalBaileysExports = require(baileysPath);
  const originalBaileysModuleExports = baileysModule.exports;
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const media = { caption: 'view-once image', mimetype: 'image/jpeg' };
  const sentMessages = [];
  const quotedMessage = {
    message: {
      extendedTextMessage: {
        contextInfo: {
          quotedMessage: {
            ephemeralMessage: {
              message: {
                viewOnceMessageV2: {
                  message: { imageMessage: media }
                }
              }
            }
          }
        }
      }
    }
  };

  baileysModule.exports = {
    ...originalBaileysExports,
    downloadContentFromMessage: async (content, type) => {
      assert.equal(content, media);
      assert.equal(type, 'image');
      return (async function* () {
        yield Buffer.from('image-');
        yield Buffer.from('data');
      })();
    }
  };
  delete require.cache[commandPath];

  try {
    const viewonceCommand = require(commandPath);
    await viewonceCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'chat-id', quotedMessage);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][0], 'chat-id');
    assert.equal(sentMessages[0][1].image.toString(), 'image-data');
    assert.equal(sentMessages[0][1].caption, 'view-once image');
    assert.equal(sentMessages[0][2].quoted, quotedMessage);
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) {
      require.cache[commandPath] = originalCommandModule;
    } else {
      delete require.cache[commandPath];
    }
  }
});
