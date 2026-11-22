const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const settings = require('../settings');
const { commandGroups, isCommandAllowed } = require('../lib/commandAllowlist');
const config = require('../config');
const aliveCommand = require('../commands/alive');
const helpCommand = require('../commands/help');
const { fileTypeFromBuffer } = require('../lib/fileType');

test('project settings load correctly', () => {
  assert.equal(settings.botName, 'Donix Bot MD');
  assert.equal(settings.version, '1.0.7');
  assert.equal(settings.author, 'DONIX');
});

test('lightweight store only writes changed data and performs writes asynchronously', async () => {
  const { EventEmitter } = require('node:events');
  const store = require('../lib/lightweight_store');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'donix-store-test-'));
  const filePath = path.join(directory, 'store.json');
  const original = {
    messages: store.messages,
    contacts: store.contacts,
    chats: store.chats,
    dirty: store.dirty,
    writing: store.writing
  };

  try {
    store.messages = {};
    store.contacts = {};
    store.chats = {};
    store.dirty = false;
    store.writing = false;
    await store.writeToFile(filePath);
    await assert.rejects(fs.access(filePath), { code: 'ENOENT' });

    const ev = new EventEmitter();
    store.bind(ev);
    ev.emit('messages.upsert', {
      messages: [{
        key: { remoteJid: 'test-chat@s.whatsapp.net', id: 'test-message' },
        message: { conversation: 'hello' }
      }]
    });

    await store.writeToFile(filePath);
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(persisted.messages['test-chat@s.whatsapp.net'][0].key.id, 'test-message');
    assert.equal(store.dirty, false);
  } finally {
    store.messages = original.messages;
    store.contacts = original.contacts;
    store.chats = original.chats;
    store.dirty = original.dirty;
    store.writing = original.writing;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('command allowlist recognizes bot commands', () => {
  assert.equal(isCommandAllowed('.menu'), true);
  assert.equal(isCommandAllowed('.ping'), true);
  assert.equal(isCommandAllowed('.sudo'), true);
  assert.equal(isCommandAllowed('.pair'), true);
  assert.equal(isCommandAllowed('.github'), true);
  const downloadCommands = [
    '.vv', '.url', '.tourl', '.play', '.mp3', '.ytmp3', '.song', '.music', '.video', '.ytmp4',
    '.spotify', '.instagram', '.insta', '.ig', '.igsc', '.igs', '.facebook', '.fb',
    '.tiktok', '.tt', '.tg', '.stickertelegram', '.tgsticker', '.telesticker'
  ];
  for (const command of downloadCommands) {
    assert.equal(isCommandAllowed(command), true, `${command} should be enabled`);
  }
  assert.equal(isCommandAllowed('.chatbot'), false);
  assert.equal(isCommandAllowed('.git'), false);
  assert.equal(isCommandAllowed('.sc'), false);
  assert.equal(isCommandAllowed('.script'), false);
  assert.equal(isCommandAllowed('.repo'), false);
  assert.equal(isCommandAllowed('.unknown'), false);
  const menuCommands = commandGroups.flatMap(group => group.commands);
  for (const command of ['.chatbot', '.git', '.sc', '.script', '.repo']) {
    assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === command), false);
  }
  for (const command of downloadCommands) {
    assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === command), true, `${command} should be listed in the menu`);
  }
});

test('antibadword checks configuration once and acts on matching group messages', async () => {
  const indexPath = require.resolve('../lib/index');
  const antiBadwordPath = require.resolve('../lib/antibadword');
  const indexExports = require(indexPath);
  const originalIndexExports = require.cache[indexPath].exports;
  const originalAntiBadwordCache = require.cache[antiBadwordPath];
  const sentMessages = [];
  let configReads = 0;
  let config = { enabled: false };

  require.cache[indexPath].exports = {
    ...indexExports,
    getAntiBadword: async () => {
      configReads += 1;
      return config;
    }
  };
  delete require.cache[antiBadwordPath];

  try {
    const { handleBadwordDetection } = require(antiBadwordPath);
    const sock = {
      user: { id: 'bot:0@s.whatsapp.net' },
      groupMetadata: async () => ({
        participants: [
          { id: 'bot@s.whatsapp.net', admin: 'admin' },
          { id: 'user@s.whatsapp.net' }
        ]
      }),
      sendMessage: async (...args) => { sentMessages.push(args); }
    };
    const message = {
      key: {
        fromMe: false,
        participant: 'user@s.whatsapp.net',
        id: 'badword-message'
      }
    };

    await handleBadwordDetection(sock, 'test-group@g.us', message, 'ordinary text', 'user@s.whatsapp.net');
    assert.equal(configReads, 1);
    assert.equal(sentMessages.length, 0);

    config = { enabled: true, action: 'delete' };
    await handleBadwordDetection(sock, 'test-group@g.us', message, 'idiot', 'user@s.whatsapp.net');
    assert.equal(configReads, 2);
    assert.equal(sentMessages[0][1].delete.id, 'badword-message');
    assert.match(sentMessages[1][1].text, /bad words are not allowed/);
  } finally {
    require.cache[indexPath].exports = originalIndexExports;
    if (originalAntiBadwordCache) require.cache[antiBadwordPath] = originalAntiBadwordCache;
    else delete require.cache[antiBadwordPath];
  }
});

test('.pair sends the code immediately after validating the requesting WhatsApp account', async () => {
  const pairingSessionPath = require.resolve('../lib/pairingSession');
  const originalPairingSession = require(pairingSessionPath);
  const originalExports = require.cache[pairingSessionPath].exports;
  const pairCommandPath = require.resolve('../commands/pair');
  const sentMessages = [];
  let pairedNumber = null;
  require.cache[pairingSessionPath].exports = {
    ...originalPairingSession,
    createPairingCode: async number => {
      pairedNumber = number;
      return 'ABCD-EFGH';
    }
  };
  delete require.cache[pairCommandPath];

  try {
    const { pairCommand, handlePairResponse } = require(pairCommandPath);
    const requesterNumber = '447911123456';
    const chatId = `${requesterNumber}@s.whatsapp.net`;
    const sock = {
      sendMessage: async (...args) => sentMessages.push(args)
    };
    const commandMessage = {
      message: { conversation: '.pair' },
      key: { remoteJid: chatId, fromMe: false }
    };

    await pairCommand(sock, chatId, commandMessage);
    assert.equal(sentMessages[0][1].text, 'Send your WhatsApp number with country code, without + or spaces.');
    const sentCountBeforeCode = sentMessages.length;
    assert.equal(await handlePairResponse(sock, chatId, commandMessage, requesterNumber), true);
    assert.equal(pairedNumber, requesterNumber);
    assert.equal(sentMessages.length, sentCountBeforeCode + 2);
    assert.equal(sentMessages[sentCountBeforeCode][1].text, 'Your WhatsApp pairing code is:');
    assert.equal(sentMessages[sentCountBeforeCode + 1][1].text, 'ABCD-EFGH');

    const groupId = 'test-group@g.us';
    await pairCommand(sock, groupId, {
      message: { conversation: '.pair' },
      key: { remoteJid: groupId, participant: requesterNumber + '@s.whatsapp.net', fromMe: false }
    });
    assert.match(sentMessages[sentMessages.length - 1][1].text, /private chat/);

    const otherChat = '14155552671@s.whatsapp.net';
    await pairCommand(sock, otherChat, {
      message: { conversation: '.pair' },
      key: { remoteJid: otherChat, fromMe: false }
    });
    await handlePairResponse(sock, otherChat, {
      message: { conversation: '.pair' },
      key: { remoteJid: otherChat, fromMe: false }
    }, settings.ownerNumber);
    assert.notEqual(pairedNumber, settings.ownerNumber);

    const lid = '123456789@lid';
    const lidChat = {
      message: { conversation: '.pair' },
      key: { remoteJid: lid, fromMe: false }
    };
    const lidSock = {
      signalRepository: {
        lidMapping: {
          getPNForLID: async () => `${requesterNumber}@s.whatsapp.net`
        }
      },
      sendMessage: async (...args) => sentMessages.push(args)
    };
    await pairCommand(lidSock, lid, lidChat);
    assert.equal(sentMessages[sentMessages.length - 1][1].text, 'Send your WhatsApp number with country code, without + or spaces.');
    assert.equal(await handlePairResponse(lidSock, lid, lidChat, requesterNumber), true);
    assert.equal(pairedNumber, requesterNumber);
  } finally {
    require.cache[pairingSessionPath].exports = originalExports;
    delete require.cache[pairCommandPath];
  }
});

test('paired sessions dispatch incoming messages to the bot command handler', async () => {
  const { EventEmitter } = require('node:events');
  const attachPairingSessionHandlers = require('../lib/pairingSessionHandlers');
  const ev = new EventEmitter();
  let storedEvents = false;
  let handledMessage = null;
  let retryCacheCleared = false;
  class RetryCache {
    flushAll() {
      retryCacheCleared = true;
    }
  }
  const sock = {
    ev,
    sendMessage: async () => {}
  };

  attachPairingSessionHandlers(sock, {
    handleMessages: async (_sock, update) => {
      handledMessage = update.messages[0];
    },
    handleGroupParticipantUpdate: async () => {},
    handleStatus: async () => {},
    store: { bind: () => { storedEvents = true; } },
    NodeCache: RetryCache
  });

  const message = {
    key: { remoteJid: 'paired-user@s.whatsapp.net', id: 'message-id' },
    message: { ephemeralMessage: { message: { conversation: '.ping' } } }
  };
  ev.emit('messages.upsert', { type: 'notify', messages: [message] });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(storedEvents, true);
  assert.equal(sock.public, true);
  assert.equal(retryCacheCleared, true);
  assert.equal(handledMessage, message);
  assert.equal(message.message.conversation, '.ping');
});

test('paired-session handler errors are logged without replying into self-DM', async () => {
  const { EventEmitter } = require('node:events');
  const attachPairingSessionHandlers = require('../lib/pairingSessionHandlers');
  const ev = new EventEmitter();
  const sentMessages = [];
  let loggedError = false;
  const originalConsoleError = console.error;
  console.error = () => { loggedError = true; };

  try {
    attachPairingSessionHandlers({
      ev,
      sendMessage: async (...args) => { sentMessages.push(args); }
    }, {
      handleMessages: async () => { throw new Error('test handler failure'); },
      handleGroupParticipantUpdate: async () => {},
      handleStatus: async () => {},
      store: { bind: () => {} },
      NodeCache: class { flushAll() {} }
    });

    ev.emit('messages.upsert', {
      type: 'notify',
      messages: [{
        key: { remoteJid: 'paired-user@s.whatsapp.net', id: 'message-id' },
        message: { conversation: '.ping' }
      }]
    });
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(loggedError, true);
  assert.equal(sentMessages.length, 0);
});

test('pairing code waits for WhatsApp readiness and reports disconnect reasons', async () => {
  const { EventEmitter } = require('node:events');
  const { waitForPairingSocketReady } = require('../lib/pairingSession');
  const readySocket = { ev: new EventEmitter() };
  const readyPromise = waitForPairingSocketReady(readySocket, 1000);
  readySocket.ev.emit('connection.update', { qr: 'pairing-ready' });
  await readyPromise;

  const closedSocket = { ev: new EventEmitter() };
  const closedPromise = waitForPairingSocketReady(closedSocket, 1000);
  closedSocket.ev.emit('connection.update', {
    connection: 'close',
    lastDisconnect: {
      error: {
        output: { statusCode: 408 },
        message: 'WebSocket Error ()',
        data: { code: 'ETIMEDOUT', message: 'Connection timed out' }
      }
    }
  });
  await assert.rejects(closedPromise, /status 408: WebSocket Error \(\): ETIMEDOUT: Connection timed out/);
});

test('sudo list is restricted to owners and sudo users', async () => {
  const isOwnerPath = require.resolve('../lib/isOwner');
  const libIndex = require('../lib/index');
  const originalOwnerCheck = require(isOwnerPath);
  const originalGetSudoList = libIndex.getSudoList;
  const sudoPath = require.resolve('../commands/sudo');
  let sudoListRead = false;
  const sentMessages = [];

  libIndex.getSudoList = async () => {
    sudoListRead = true;
    return [];
  };
  require.cache[isOwnerPath].exports = async () => false;
  delete require.cache[sudoPath];

  try {
    const sudoCommand = require(sudoPath);
    await sudoCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'chat-id', {
      message: { conversation: '.sudo list' },
      key: { participant: 'not-owner@s.whatsapp.net' }
    });

    assert.equal(sudoListRead, false);
    assert.match(sentMessages[0][1].text, /Only the owner or a sudo user/);
  } finally {
    libIndex.getSudoList = originalGetSudoList;
    require.cache[isOwnerPath].exports = originalOwnerCheck;
    delete require.cache[sudoPath];
  }
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

test('vv unwraps and sends quoted view-once images across wrapper versions', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const baileysModule = require.cache[baileysPath];
  const originalBaileysExports = require(baileysPath);
  const originalBaileysModuleExports = baileysModule.exports;
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const media = { caption: 'view-once image', mimetype: 'image/jpeg' };
  const sentMessages = [];
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
    for (const wrapper of ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']) {
      const quotedMessage = {
        message: {
          extendedTextMessage: {
            contextInfo: {
              quotedMessage: {
                ephemeralMessage: {
                  message: {
                    [wrapper]: {
                      message: { imageMessage: media }
                    }
                  }
                }
              }
            }
          }
        }
      };
      const sentCountBefore = sentMessages.length;

      await viewonceCommand({
        sendMessage: async (...args) => sentMessages.push(args)
      }, 'chat-id', quotedMessage);

      assert.equal(sentMessages.length, sentCountBefore + 1);
      assert.equal(sentMessages.at(-1)[0], 'chat-id');
      assert.equal(sentMessages.at(-1)[1].image.toString(), 'image-data');
      assert.equal(sentMessages.at(-1)[1].caption, 'view-once image');
      assert.equal(sentMessages.at(-1)[2].quoted, quotedMessage);
    }

    assert.equal(sentMessages.length, 3);
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) {
      require.cache[commandPath] = originalCommandModule;
    } else {
      delete require.cache[commandPath];
    }
  }
});

test('vv retrieves quoted media from the lightweight store when the quote is incomplete', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const baileysModule = require.cache[baileysPath];
  const originalBaileysExports = require(baileysPath);
  const originalBaileysModuleExports = baileysModule.exports;
  const store = require('../lib/lightweight_store');
  const chatId = 'test-chat';
  const sourceId = 'source-message';
  const priorMessages = store.messages[chatId];
  const media = { caption: 'stored view-once video', mimetype: 'video/mp4' };
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const sentMessages = [];

  store.messages[chatId] = [{
    key: { remoteJid: chatId, id: sourceId },
    message: {
      viewOnceMessageV2: {
        message: { videoMessage: media }
      }
    }
  }];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadContentFromMessage: async (content, type) => {
      assert.equal(content, media);
      assert.equal(type, 'video');
      return (async function* () {
        yield Buffer.from('video-data');
      })();
    }
  };
  delete require.cache[commandPath];

  try {
    const viewonceCommand = require(commandPath);
    const message = {
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: sourceId,
            remoteJid: chatId,
            quotedMessage: {}
          }
        }
      }
    };

    await viewonceCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, chatId, message);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][1].video.toString(), 'video-data');
    assert.equal(sentMessages[0][1].caption, 'stored view-once video');
    assert.equal(sentMessages[0][2].quoted, message);
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) {
      require.cache[commandPath] = originalCommandModule;
    } else {
      delete require.cache[commandPath];
    }
    if (priorMessages) {
      store.messages[chatId] = priorMessages;
    } else {
      delete store.messages[chatId];
    }
  }
});

test('vv falls back to complete stored media when the quoted media node is incomplete', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const baileysModule = require.cache[baileysPath];
  const originalBaileysExports = require(baileysPath);
  const originalBaileysModuleExports = baileysModule.exports;
  const store = require('../lib/lightweight_store');
  const primaryChatId = 'primary-chat';
  const alternateChatId = 'alternate-chat';
  const sourceId = 'source-message';
  const priorPrimaryMessages = store.messages[primaryChatId];
  const priorAlternateMessages = store.messages[alternateChatId];
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const partialMedia = { mimetype: 'image/jpeg' };
  const completeMedia = {
    mediaKey: Buffer.from('media-key'),
    directPath: '/media/path',
    mimetype: 'image/jpeg',
    caption: 'recovered image'
  };
  const sentMessages = [];
  store.messages[alternateChatId] = [{
    key: { remoteJid: alternateChatId, id: sourceId },
    message: {
      viewOnceMessageV2: {
        message: { imageMessage: completeMedia }
      }
    }
  }];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadContentFromMessage: async (content, type) => {
      assert.equal(content, completeMedia);
      assert.equal(type, 'image');
      return (async function* () {
        yield Buffer.from('recovered-image');
      })();
    }
  };
  delete require.cache[commandPath];

  try {
    const viewonceCommand = require(commandPath);
    const message = {
      key: { remoteJid: primaryChatId, remoteJidAlt: alternateChatId },
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: sourceId,
            remoteJid: primaryChatId,
            remoteJidAlt: alternateChatId,
            quotedMessage: {
              viewOnceMessageV2: {
                message: { imageMessage: partialMedia }
              }
            }
          }
        }
      }
    };

    await viewonceCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, primaryChatId, message);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][1].image.toString(), 'recovered-image');
    assert.equal(sentMessages[0][1].caption, 'recovered image');
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
    if (priorPrimaryMessages) store.messages[primaryChatId] = priorPrimaryMessages;
    else delete store.messages[primaryChatId];
    if (priorAlternateMessages) store.messages[alternateChatId] = priorAlternateMessages;
    else delete store.messages[alternateChatId];
  }
});
