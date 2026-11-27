const test = require('node:test');
const assert = require('node:assert/strict');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const settings = require('../settings');
const { commandGroups, isCommandAllowed } = require('../lib/commandAllowlist');
const config = require('../config');
const aiCommand = require('../commands/ai');
const aliveCommand = require('../commands/alive');
const helpCommand = require('../commands/help');
const imagineCommand = require('../commands/imagine');
const newMenuCommand = require('../commands/newMenu');
const { fileTypeFromBuffer } = require('../lib/fileType');

test('project settings load correctly', () => {
  assert.equal(settings.botName, 'Donix Bot MD');
  assert.equal(settings.version, '1.0.7');
  assert.equal(settings.author, 'DONIX');
});

test('update preserves the existing bot mode and counters when replacing the repo data file', async () => {
  const { preserveMessageCountFileDuringUpdate } = require('../commands/update');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'donix-update-mode-test-'));
  const dataFile = path.join(directory, 'messageCount.json');
  const modeFile = path.join(directory, 'botMode.json');
  const commandFile = path.join(directory, 'commandOverrides.json');
  const originalContent = JSON.stringify({
    isPublic: false,
    messageCount: { 'chat-id': { 'user-id': 3 } }
  }, null, 2);
  const originalMode = JSON.stringify({ isPublic: false }, null, 2);
  const originalCommands = JSON.stringify({ overrides: { '.meme': true } }, null, 2);

  try {
    await fs.writeFile(dataFile, originalContent);
    await fs.writeFile(modeFile, originalMode);
    await fs.writeFile(commandFile, originalCommands);
    await preserveMessageCountFileDuringUpdate(async () => {
      await fs.writeFile(dataFile, JSON.stringify({ isPublic: true, messageCount: {} }));
      await fs.writeFile(modeFile, JSON.stringify({ isPublic: true }));
      await fs.writeFile(commandFile, JSON.stringify({ overrides: {} }));
    }, dataFile, modeFile, commandFile);
    assert.equal(await fs.readFile(dataFile, 'utf8'), originalContent);
    assert.equal(await fs.readFile(modeFile, 'utf8'), originalMode);
    assert.equal(await fs.readFile(commandFile, 'utf8'), originalCommands);

    await assert.rejects(preserveMessageCountFileDuringUpdate(async () => {
      await fs.writeFile(dataFile, JSON.stringify({ isPublic: true, messageCount: {} }));
      await fs.writeFile(modeFile, JSON.stringify({ isPublic: true }));
      await fs.writeFile(commandFile, JSON.stringify({ overrides: {} }));
      throw new Error('simulated update failure');
    }, dataFile, modeFile, commandFile), /simulated update failure/);
    assert.equal(await fs.readFile(dataFile, 'utf8'), originalContent);
    assert.equal(await fs.readFile(modeFile, 'utf8'), originalMode);
    assert.equal(await fs.readFile(commandFile, 'utf8'), originalCommands);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('bot mode uses persistent private state before legacy public state after restart', () => {
  const { loadBotMode, setBotMode } = require('../lib/botMode');
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'donix-bot-mode-test-'));
  const botModePath = path.join(directory, 'botMode.json');
  const messageCountPath = path.join(directory, 'messageCount.json');

  try {
    fsSync.writeFileSync(messageCountPath, JSON.stringify({ isPublic: true, messageCount: {} }));
    assert.equal(loadBotMode(false, { botModePath, messageCountPath }), true);

    setBotMode(false, { botModePath, messageCountPath });
    assert.equal(loadBotMode(true, { botModePath, messageCountPath }), false);
    assert.equal(JSON.parse(fsSync.readFileSync(messageCountPath, 'utf8')).isPublic, false);
  } finally {
    fsSync.rmSync(directory, { recursive: true, force: true });
  }
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
  assert.equal(isCommandAllowed('.mnew'), true);
  assert.equal(isCommandAllowed('.ping'), true);
  assert.equal(isCommandAllowed('.sudo'), true);
  assert.equal(isCommandAllowed('.pair'), true);
  assert.equal(isCommandAllowed('.github'), true);
  assert.equal(isCommandAllowed('.as'), true);
  assert.equal(isCommandAllowed('.imagine'), true);
  assert.equal(isCommandAllowed('.gpt4'), true);
  assert.equal(isCommandAllowed('.vv'), true);
  assert.equal(isCommandAllowed('.me'), false);
  const downloadCommands = [
    '.vv', '.url', '.tourl', '.play', '.mp3', '.ytmp3', '.song', '.music', '.video', '.ytmp4',
    '.spotify', '.instagram', '.insta', '.ig', '.igsc', '.igs', '.facebook', '.fb',
    '.tiktok', '.tt', '.tg', '.stickertelegram', '.tgsticker', '.telesticker'
  ];
  for (const command of downloadCommands) {
    assert.equal(isCommandAllowed(command), true, `${command} should be enabled`);
  }
  const importedCommands = [
    '.afk', '.add', '.invite', '.glist', '.gapprove', '.greject', '.join', '.create', '.ss',
    '.setname', '.setbio', '.mypp'
  ];
  for (const command of importedCommands) {
    assert.equal(isCommandAllowed(command), true, `${command} should be enabled`);
  }
  assert.equal(isCommandAllowed('.chatbot'), false);
  assert.equal(isCommandAllowed('.git'), false);
  assert.equal(isCommandAllowed('.sc'), false);
  assert.equal(isCommandAllowed('.script'), false);
  assert.equal(isCommandAllowed('.repo'), false);
  assert.equal(isCommandAllowed('.unknown'), false);
  const menuCommands = commandGroups.flatMap(group => group.commands);
  assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === '.mnew'), true);
  for (const command of ['.chatbot', '.git', '.sc', '.script', '.repo']) {
    assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === command), false);
  }
  assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === '.as'), true);
  assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === '.imagine'), true);
  assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === '.gpt4'), true);
  for (const command of downloadCommands) {
    assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === command), true, `${command} should be listed in the menu`);
  }
  for (const command of importedCommands) {
    assert.equal(menuCommands.some(entry => entry.split(/\s+/)[0] === command), true, `${command} should be listed in the menu`);
  }
});

test('command manager enables and disables only implemented commands', () => {
  const {
    getDisabledCommands,
    getVisibleCommandGroups,
    isCommandAllowed,
    setCommandEnabled
  } = require('../lib/commandAllowlist');
  const directory = fsSync.mkdtempSync(path.join(os.tmpdir(), 'donix-command-manager-test-'));
  const filePath = path.join(directory, 'commandOverrides.json');
  const options = { filePath };

  try {
    assert.equal(isCommandAllowed('.meme', options), false);
    assert.equal(getDisabledCommands(options).includes('.meme'), true);

    assert.deepEqual(setCommandEnabled('meme', true, options), { ok: true, changed: true });
    assert.equal(isCommandAllowed('.meme', options), true);
    assert.equal(getVisibleCommandGroups(options).some(group => group.commands.includes('.meme')), true);

    assert.deepEqual(setCommandEnabled('.ping', false, options), { ok: true, changed: true });
    assert.equal(isCommandAllowed('.ping', options), false);
    assert.equal(getDisabledCommands(options).includes('.ping'), true);
    assert.deepEqual(setCommandEnabled('.notimplemented', true, options), { ok: false, reason: 'unknown' });
    assert.deepEqual(setCommandEnabled('.dismenu', false, options), { ok: false, reason: 'protected' });
  } finally {
    fsSync.rmSync(directory, { recursive: true, force: true });
  }
});

test('.gemini uses Google Gemini and returns generated text', async () => {
  const sentMessages = [];
  const requests = [];
  const message = {
    key: { id: 'gemini-message', remoteJid: 'gemini-chat' },
    message: {
      ephemeralMessage: {
        message: { conversation: '.gemini explain rainbows' }
      }
    }
  };

  await aiCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'gemini-chat', message, {
    apiKey: 'test-gemini-key',
    model: 'gemini-test-model',
    post: async (...args) => {
      requests.push(args);
      return {
        data: {
          candidates: [{
            content: { parts: [{ text: 'Light bends.' }, { text: 'Colors separate.' }] }
          }]
        }
      };
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent');
  assert.deepEqual(requests[0][1].contents, [{ parts: [{ text: 'explain rainbows' }] }]);
  assert.equal(requests[0][2].headers['x-goog-api-key'], 'test-gemini-key');
  assert.equal(requests[0][2].timeout, 30000);
  assert.equal(sentMessages.at(-1)[1].text, 'Light bends.\nColors separate.');
  assert.equal(sentMessages.at(-1)[2].quoted, message);
});

test('.gemini reports Google quota errors clearly', async () => {
  const sentMessages = [];
  await aiCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'gemini-chat', {
    key: { id: 'gemini-message' },
    message: { conversation: '.gemini hi' }
  }, {
    apiKey: 'test-gemini-key',
    post: async () => {
      const error = new Error('Gemini quota exhausted');
      error.response = { status: 429 };
      throw error;
    }
  });

  assert.match(sentMessages.at(-1)[1].text, /Gemini quota or rate limit reached/);
});

test('.gemini prompts for an environment key when no key is configured', async () => {
  const sentMessages = [];
  const previousGeminiKey = process.env.GEMINI_API_KEY;
  const previousGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    await aiCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'gemini-chat', {
      key: { id: 'gemini-missing-key' },
      message: { conversation: '.gemini hello' }
    }, {
      post: async () => {
        throw new Error('Should not call the API without a key.');
      }
    });

    assert.match(sentMessages.at(-1)[1].text, /GEMINI_API_KEY/);
  } finally {
    if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousGeminiKey;
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previousGoogleKey;
  }
});

test('.gpt4 uses the OpenAI API and returns generated text', async () => {
  const sentMessages = [];
  const requests = [];
  const message = {
    key: { id: 'gpt4-message', remoteJid: 'gpt4-chat', participant: 'gpt4-user-success' },
    message: { conversation: '.gpt4 explain rainbows' }
  };

  await aiCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'gpt4-chat', message, {
    apiKey: 'test-openai-key',
    model: 'gpt-4o-test',
    post: async (...args) => {
      requests.push(args);
      return { data: { choices: [{ message: { content: 'Light bends.' } }] } };
    }
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], 'https://api.openai.com/v1/chat/completions');
  assert.deepEqual(requests[0][1].messages, [{ role: 'user', content: 'explain rainbows' }]);
  assert.equal(requests[0][1].model, 'gpt-4o-test');
  assert.equal(requests[0][1].max_tokens, 512);
  assert.equal(requests[0][2].headers.Authorization, 'Bearer test-openai-key');
  assert.equal(requests[0][2].timeout, 30000);
  assert.equal(sentMessages.at(-1)[1].text, 'Light bends.');
  assert.equal(sentMessages.at(-1)[2].quoted, message);
});

test('.gpt4 reports a missing OpenAI key without making a request', async () => {
  const sentMessages = [];
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    await aiCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'gpt4-chat', {
      key: { id: 'gpt4-missing-key', remoteJid: 'gpt4-chat', participant: 'gpt4-user-missing-key' },
      message: { conversation: '.gpt4 hello' }
    }, {
      post: async () => {
        throw new Error('Should not call the API without a key.');
      }
    });

    assert.match(sentMessages.at(-1)[1].text, /OPENAI_API_KEY/);
  } finally {
    if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousOpenAiKey;
  }
});

test('.gpt4 limits prompt length and per-sender request rate', async () => {
  const sentMessages = [];
  let now = 100000;
  let requestCount = 0;
  const sock = { sendMessage: async (...args) => sentMessages.push(args) };
  const options = {
    apiKey: 'test-openai-key',
    now: () => now,
    post: async () => {
      requestCount++;
      return { data: { choices: [{ message: { content: 'Answer.' } }] } };
    }
  };

  await aiCommand(sock, 'gpt4-chat', {
    key: { id: 'gpt4-rate-limit', remoteJid: 'gpt4-chat', participant: 'gpt4-user-rate-limit' },
    message: { conversation: `.gpt4 ${'a'.repeat(4001)}` }
  }, options);
  assert.match(sentMessages.at(-1)[1].text, /4000 characters/);
  assert.equal(requestCount, 0);

  const message = {
    key: { id: 'gpt4-first-request', remoteJid: 'gpt4-chat', participant: 'gpt4-user-rate-limit' },
    message: { conversation: '.gpt4 first question' }
  };
  await aiCommand(sock, 'gpt4-chat', message, options);
  now += 1000;
  await aiCommand(sock, 'gpt4-chat', {
    key: { ...message.key, id: 'gpt4-second-request' },
    message: { conversation: '.gpt4 another question' }
  }, options);

  assert.equal(requestCount, 1);
  assert.match(sentMessages.at(-1)[1].text, /before using \.gpt4 again/);
});

test('.imagine generates an image from an ephemeral WhatsApp prompt', async () => {
  const sentMessages = [];
  const requests = [];
  const message = {
    key: { id: 'imagine-message', remoteJid: 'imagine-chat' },
    message: {
      ephemeralMessage: {
        message: { conversation: '.imagine a friendly orange cat' }
      }
    }
  };

  await imagineCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'imagine-chat', message, {
    get: async (...args) => {
      requests.push(args);
      return {
        data: Buffer.from('image-bytes'),
        headers: { 'content-type': 'image/jpeg' }
      };
    }
  });

  assert.equal(requests.length, 1);
  const requestUrl = new URL(requests[0][0]);
  assert.equal(requestUrl.hostname, 'image.pollinations.ai');
  assert.match(decodeURIComponent(requestUrl.pathname), /a friendly orange cat/);
  assert.equal(requestUrl.searchParams.get('safe'), 'true');
  assert.equal(requests[0][1].responseType, 'arraybuffer');
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1][1].image.toString(), 'image-bytes');
  assert.equal(sentMessages[1][1].caption, '🎨 a friendly orange cat');
  assert.equal(sentMessages[1][2].quoted, message);
});

test('.imagine reports temporary provider outages with retry timing', async () => {
  const sentMessages = [];
  const message = {
    key: { id: 'imagine-failed-message' },
    message: { conversation: '.imagine a cat' }
  };
  await imagineCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'imagine-chat', message, {
    get: async () => {
      const error = new Error('Service unavailable');
      error.response = { status: 503, headers: { 'retry-after': '10' } };
      throw error;
    }
  });

  assert.match(sentMessages.at(-1)[1].text, /temporarily busy/);
  assert.match(sentMessages.at(-1)[1].text, /Retry in about 10 seconds/);
});

test('.imagine uses the authenticated Pollinations API key when configured', async () => {
  const sentMessages = [];
  const requests = [];
  await imagineCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'imagine-chat', {
    key: { id: 'imagine-key-message' },
    message: { conversation: '.imagine a cat wearing a hat' }
  }, {
    apiKey: 'test-pollinations-key',
    get: async (...args) => {
      requests.push(args);
      return {
        data: Buffer.from('authenticated-image'),
        headers: { 'content-type': 'image/png' }
      };
    }
  });

  assert.equal(requests.length, 1);
  const requestUrl = new URL(requests[0][0]);
  assert.equal(requestUrl.hostname, 'gen.pollinations.ai');
  assert.equal(requestUrl.searchParams.get('model'), 'tongyi-mai/z-image-turbo');
  assert.equal(requests[0][1].headers.Authorization, 'Bearer test-pollinations-key');
  assert.equal(sentMessages.at(-1)[1].image.toString(), 'authenticated-image');
});

test('.imagine describes free quota retry timing and key-based higher limits', async () => {
  const sentMessages = [];
  await imagineCommand({
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'imagine-chat', {
    key: { id: 'imagine-quota-message' },
    message: { conversation: '.imagine a cat' }
  }, {
    get: async () => {
      const error = new Error('Free quota reached');
      error.response = { status: 402, headers: { 'retry-after': '45' } };
      throw error;
    }
  });

  assert.match(sentMessages.at(-1)[1].text, /Retry in about 45 seconds/);
  assert.match(sentMessages.at(-1)[1].text, /POLLINATIONS_API_KEY/);
});

test('.mnew renders the Jarvis-style runtime header and command categories', async () => {
  const sentMessages = [];
  const newsletterRequests = [];
  const message = {
    key: { id: 'mnew-quoted-message' },
    pushName: 'Test User'
  };
  await newMenuCommand({
    newsletterMetadata: async (...args) => {
      newsletterRequests.push(args);
      return { id: 'updates@newsletter', name: 'Donix Updates' };
    },
    sendMessage: async (...args) => sentMessages.push(args)
  }, 'mnew-chat', message);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0][0], 'mnew-chat');
  assert.equal(sentMessages[0][2].quoted, message);
  assert.ok(Buffer.isBuffer(sentMessages[0][1].video));
  assert.equal(sentMessages[0][1].gifPlayback, true);
  assert.match(sentMessages[0][1].caption, /ᴏᴡɴᴇʀ/);
  assert.match(sentMessages[0][1].caption, /Test User/);
  assert.match(sentMessages[0][1].caption, /GENERAL/);
  assert.match(sentMessages[0][1].caption, /\.mnew/);
  assert.match(sentMessages[0][1].caption, /\.dismenu/);
  assert.match(sentMessages[0][1].caption, /\.encommand/);
  assert.match(sentMessages[0][1].caption, /\.as/);
  assert.equal(newsletterRequests.length, 1);
  assert.equal(newsletterRequests[0][0], 'invite');
  assert.equal(sentMessages[0][1].contextInfo.forwardedNewsletterMessageInfo.newsletterJid, 'updates@newsletter');
});

test('AFK command records and clears owner status and answers mentions', async () => {
  const { afkCommand, handleAfkMentions } = require('../commands/afk');
  const sentMessages = [];
  const sock = { sendMessage: async (...args) => sentMessages.push(args) };
  const chatId = 'afk-test@g.us';
  const senderId = 'owner-afk-test@s.whatsapp.net';
  const commandMessage = {
    key: { remoteJid: chatId, participant: senderId, fromMe: true }
  };

  await afkCommand(sock, chatId, commandMessage, 'at lunch');
  await handleAfkMentions(sock, chatId, {
    key: { remoteJid: chatId, participant: 'member@s.whatsapp.net' }
  }, {
    extendedTextMessage: {
      contextInfo: { mentionedJid: [senderId] }
    }
  });

  assert.match(sentMessages[1][1].text, /@owner-afk-test is away/);
  assert.match(sentMessages[1][1].text, /at lunch/);
  assert.deepEqual(sentMessages[1][1].mentions, [senderId]);

  await afkCommand(sock, chatId, commandMessage, 'off');
  await handleAfkMentions(sock, chatId, {
    key: { remoteJid: chatId, participant: 'member@s.whatsapp.net' }
  }, {
    extendedTextMessage: {
      contextInfo: { mentionedJid: [senderId] }
    }
  });
  assert.equal(sentMessages.length, 3);
  assert.match(sentMessages[2][1].text, /cleared/i);
});

test('imported group tools enforce admin access for add and invite', async () => {
  const { addGroupParticipant, sendGroupInvite } = require('../commands/groupTools');
  const sentMessages = [];
  const addedParticipants = [];
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    groupMetadata: async () => ({
      participants: [
        { id: 'bot@s.whatsapp.net', admin: 'admin' },
        { id: 'admin@s.whatsapp.net', admin: 'admin' }
      ]
    }),
    groupParticipantsUpdate: async (_chatId, participants, action) => {
      addedParticipants.push({ participants, action });
      return participants.map(jid => ({ status: '200', jid }));
    },
    groupInviteCode: async () => 'invite-code',
    sendMessage: async (...args) => sentMessages.push(args)
  };
  const message = { key: { remoteJid: 'group@g.us', participant: 'admin@s.whatsapp.net' } };

  await addGroupParticipant(sock, 'group@g.us', 'admin@s.whatsapp.net', message, '15551234567');
  await sendGroupInvite(sock, 'group@g.us', 'admin@s.whatsapp.net', message);

  assert.deepEqual(addedParticipants, [{
    participants: ['15551234567@s.whatsapp.net'],
    action: 'add'
  }]);
  assert.match(sentMessages[0][1].text, /Added: @15551234567/);
  assert.match(sentMessages[1][1].text, /https:\/\/chat\.whatsapp\.com\/invite-code/);

  await addGroupParticipant(sock, 'group@g.us', 'member@s.whatsapp.net', message, '15557654321');
  assert.match(sentMessages[2][1].text, /Only group admins/);
  assert.equal(addedParticipants.length, 1);
});

test('imported group request tools list and process pending requests', async () => {
  const { listGroupJoinRequests, updateGroupJoinRequests } = require('../commands/groupTools');
  const sentMessages = [];
  const actions = [];
  const pendingJid = '15551234567@s.whatsapp.net';
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    groupMetadata: async () => ({
      participants: [
        { id: 'bot@s.whatsapp.net', admin: 'admin' },
        { id: 'admin@s.whatsapp.net', admin: 'admin' }
      ]
    }),
    groupRequestParticipantsList: async () => [{ jid: pendingJid }],
    groupRequestParticipantsUpdate: async (_chatId, participants, action) => {
      actions.push({ participants, action });
      return participants.map(jid => ({ status: '200', jid }));
    },
    sendMessage: async (...args) => sentMessages.push(args)
  };
  const message = { key: { remoteJid: 'group@g.us', participant: 'admin@s.whatsapp.net' } };

  await listGroupJoinRequests(sock, 'group@g.us', 'admin@s.whatsapp.net', message);
  await updateGroupJoinRequests(sock, 'group@g.us', 'admin@s.whatsapp.net', message, 'all', 'approve');
  await updateGroupJoinRequests(sock, 'group@g.us', 'admin@s.whatsapp.net', message, '15551234567', 'reject');
  await updateGroupJoinRequests(sock, 'group@g.us', 'admin@s.whatsapp.net', message, 'bad,15551234567', 'approve');

  assert.match(sentMessages[0][1].text, /Pending join requests/);
  assert.deepEqual(actions, [
    { participants: [pendingJid], action: 'approve' },
    { participants: [pendingJid], action: 'reject' }
  ]);
  assert.match(sentMessages[1][1].text, /Approved 1/);
  assert.match(sentMessages[2][1].text, /Rejected 1/);
  assert.match(sentMessages[3][1].text, /valid phone numbers/);
  assert.equal(actions.length, 2);
});

test('imported join and create commands use validated group inputs', async () => {
  const { createGroup, joinGroup } = require('../commands/groupTools');
  const sentMessages = [];
  let created;
  let acceptedCode;
  const sock = {
    groupCreate: async (subject, participants) => {
      created = { subject, participants };
      return { id: 'created-group@g.us' };
    },
    groupAcceptInvite: async code => {
      acceptedCode = code;
      return 'joined-group@g.us';
    },
    sendMessage: async (...args) => sentMessages.push(args)
  };
  const message = {
    key: { remoteJid: 'owner-chat@s.whatsapp.net' },
    message: {
      extendedTextMessage: {
        contextInfo: { mentionedJid: ['15551234567@s.whatsapp.net'] }
      }
    }
  };

  await createGroup(sock, 'owner-chat@s.whatsapp.net', message, 'Test group');
  await joinGroup(sock, 'owner-chat@s.whatsapp.net', message, 'https://chat.whatsapp.com/abc123');
  await joinGroup(sock, 'owner-chat@s.whatsapp.net', message, 'not a link');

  assert.deepEqual(created, {
    subject: 'Test group',
    participants: ['15551234567@s.whatsapp.net']
  });
  assert.equal(acceptedCode, 'abc123');
  assert.match(sentMessages[0][1].text, /Created “Test group”/);
  assert.match(sentMessages[1][1].text, /Joined group/);
  assert.match(sentMessages[2][1].text, /Usage: \.join/);
});

test('imported profile commands validate and update bot profile details', async () => {
  const { sendMyProfilePicture, setProfileBio, setProfileName } = require('../commands/profile');
  const sentMessages = [];
  const updates = [];
  const sock = {
    user: { id: 'bot@s.whatsapp.net' },
    updateProfileName: async name => updates.push({ name }),
    updateProfileStatus: async status => updates.push({ status }),
    profilePictureUrl: async (jid, type) => {
      assert.equal(jid, 'bot@s.whatsapp.net');
      assert.equal(type, 'image');
      return 'https://example.com/profile.jpg';
    },
    sendMessage: async (...args) => sentMessages.push(args)
  };
  const message = { key: { remoteJid: 'owner-chat@s.whatsapp.net' } };

  await setProfileName(sock, 'owner-chat@s.whatsapp.net', message, 'Bot Display');
  await setProfileBio(sock, 'owner-chat@s.whatsapp.net', message, 'Available now');
  await sendMyProfilePicture(sock, 'owner-chat@s.whatsapp.net', message);
  await setProfileName(sock, 'owner-chat@s.whatsapp.net', message, 'x'.repeat(26));

  assert.deepEqual(updates, [{ name: 'Bot Display' }, { status: 'Available now' }]);
  assert.match(sentMessages[0][1].text, /profile name updated/i);
  assert.match(sentMessages[1][1].text, /profile status updated/i);
  assert.equal(sentMessages[2][1].image.url, 'https://example.com/profile.jpg');
  assert.match(sentMessages[3][1].text, /up to 25 characters/);
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

test('antidelete stores text and reports the deleted message', async () => {
  const antideletePath = require.resolve('../commands/antidelete');
  const originalModule = require.cache[antideletePath];
  const configPath = require.resolve('../data/antidelete.json');
  const fs = require('node:fs');
  const path = require('node:path');
  const storePath = path.resolve(__dirname, '../data/antidelete-store.json');
  const originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;
  const originalStore = fs.existsSync(storePath) ? fs.readFileSync(storePath, 'utf8') : null;
  delete require.cache[antideletePath];

  try {
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true }));
    const { storeMessage, handleMessageRevocation } = require(antideletePath);
    const sentMessages = [];
    const sock = {
      user: { id: '918086196892:1@s.whatsapp.net' },
      groupMetadata: async () => ({ subject: 'Test group' }),
      sendMessage: async (...args) => sentMessages.push(args)
    };
    const originalMessage = {
      key: {
        id: 'deleted-message-id',
        remoteJid: 'test-group@g.us',
        participant: '919876543210@s.whatsapp.net'
      },
      message: { conversation: 'message that will be deleted' }
    };

    await storeMessage(sock, originalMessage);

    await handleMessageRevocation(sock, {
      key: {
        id: 'revocation-id',
        remoteJid: 'test-group@g.us',
        participant: '919876543210@s.whatsapp.net'
      },
      participant: '919876543210@s.whatsapp.net',
      message: {
        protocolMessage: {
          type: 0,
          key: { id: 'deleted-message-id', remoteJid: 'test-group@g.us' }
        }
      }
    });

    assert.equal(sentMessages.length, 1);
    assert.match(sentMessages[0][1].text, /ANTIDELETE REPORT/);
    assert.match(sentMessages[0][1].text, /message that will be deleted/);
  } finally {
    if (originalConfig === null) {
      fs.rmSync(configPath, { force: true });
    } else {
      fs.writeFileSync(configPath, originalConfig);
    }
    if (originalStore === null) {
      fs.rmSync(storePath, { force: true });
    } else {
      fs.writeFileSync(storePath, originalStore);
    }
    if (originalModule) require.cache[antideletePath] = originalModule;
    else delete require.cache[antideletePath];
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
  assert.match(sentMessages[0][1].caption, /𝐝𝐢𝐬𝐦𝐞𝐧𝐮/);
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

test('.ss screenshot command sends API image and rejects invalid URLs', async () => {
  const fetchPath = require.resolve('node-fetch');
  const originalFetch = require(fetchPath);
  const fetchModule = require.cache[fetchPath];
  const commandPath = require.resolve('../commands/ss');
  const originalCommandModule = require.cache[commandPath];
  const sentMessages = [];
  let requestedUrl;

  fetchModule.exports = async url => {
    requestedUrl = url;
    return {
      ok: true,
      buffer: async () => Buffer.from('fake-screenshot')
    };
  };
  delete require.cache[commandPath];

  try {
    const { handleSsCommand } = require(commandPath);
    const sock = {
      presenceSubscribe: async () => {},
      sendPresenceUpdate: async () => {},
      sendMessage: async (...args) => sentMessages.push(args)
    };
    const message = { key: { id: 'ss-message' } };
    await handleSsCommand(sock, 'ss-chat', message, 'https://example.com');
    await handleSsCommand(sock, 'ss-chat', message, 'example.com');

    assert.match(requestedUrl, /api\.siputzx\.my\.id\/api\/tools\/ssweb/);
    assert.ok(Buffer.isBuffer(sentMessages[0][1].image));
    assert.equal(sentMessages[0][1].image.toString(), 'fake-screenshot');
    assert.match(sentMessages[1][1].text, /valid URL/);
  } finally {
    fetchModule.exports = originalFetch;
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
  }
});

test('vv unwraps and sends quoted view-once images across wrapper versions', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
  const originalBaileysModuleExports = baileysModule.exports;
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const media = { caption: 'view-once image', mimetype: 'image/jpeg' };
  const sentMessages = [];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadMediaMessage: async () => {
      throw new Error('Use direct media fallback in this test');
    },
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
        message: wrapper === 'viewOnceMessage'
          ? {
              ephemeralMessage: {
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
              }
            }
          : {
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
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
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
    downloadMediaMessage: async () => {
      throw new Error('Use direct media fallback in this test');
    },
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
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
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
    downloadMediaMessage: async (sourceMessage, type, _options, context) => {
      assert.equal(sourceMessage.key.id, sourceId);
      assert.equal(type, 'buffer');
      assert.equal(typeof context.reuploadRequest, 'function');
      assert.equal(typeof context.logger.info, 'function');
      const expiredMediaError = Object.assign(new Error('Media URL expired'), { status: 404 });
      try {
        throw expiredMediaError;
      } catch (error) {
        if (typeof error.status === 'number') {
          context.logger.info({ key: sourceMessage.key }, 'sending reupload media request...');
          assert.equal(await context.reuploadRequest(sourceMessage), sourceMessage);
        } else {
          throw error;
        }
      }
      return Buffer.from('recovered-image');
    },
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
      updateMediaMessage: async sourceMessage => sourceMessage,
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

test('vv uses cached media with a valid key when quoted media has a null key', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
  const originalBaileysModuleExports = baileysModule.exports;
  const store = require('../lib/lightweight_store');
  const chatId = 'quoted-chat';
  const cachedChatId = 'cached-chat-alias';
  const sourceId = 'null-key-source';
  const priorCachedMessages = store.messages[cachedChatId];
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const cachedMedia = {
    mediaKey: { type: 'Buffer', data: Array.from(Buffer.from('cached-key')) },
    mimetype: 'image/jpeg',
    caption: 'cached view-once image'
  };
  const sentMessages = [];
  let updateCalls = 0;
  store.messages[cachedChatId] = [{
    key: { remoteJid: cachedChatId, id: sourceId },
    message: {
      viewOnceMessageV2: {
        message: { imageMessage: cachedMedia }
      }
    }
  }];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadMediaMessage: async (sourceMessage, type, _options, context) => {
      assert.equal(sourceMessage.key.remoteJid, cachedChatId);
      assert.equal(type, 'buffer');
      assert.equal(typeof context.reuploadRequest, 'function');
      assert.equal(Buffer.isBuffer(sourceMessage.message.viewOnceMessageV2.message.imageMessage.mediaKey), true);
      return Buffer.from('recovered-image');
    },
    downloadContentFromMessage: async () => {
      throw new Error('Expected cached media download path');
    }
  };
  delete require.cache[commandPath];

  try {
    const viewonceCommand = require(commandPath);
    const message = {
      key: { remoteJid: chatId },
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: sourceId,
            remoteJid: chatId,
            quotedMessage: {
              viewOnceMessageV2: {
                message: {
                  imageMessage: { mediaKey: null, mimetype: 'image/jpeg' }
                }
              }
            }
          }
        }
      }
    };

    await viewonceCommand({
      updateMediaMessage: async sourceMessage => {
        updateCalls += 1;
        const media = sourceMessage.message.viewOnceMessageV2.message.imageMessage;
        assert.equal(Buffer.isBuffer(media.mediaKey), true);
        media.directPath = '/refreshed/path';
        return sourceMessage;
      },
      sendMessage: async (...args) => sentMessages.push(args)
    }, chatId, message);

    assert.equal(updateCalls, 1);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][1].image.toString(), 'recovered-image');
    assert.equal(sentMessages[0][1].caption, 'cached view-once image');
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
    if (priorCachedMessages) store.messages[cachedChatId] = priorCachedMessages;
    else delete store.messages[cachedChatId];
  }
});

test('vv serves a view-once image cached when the bot first receives it', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
  const originalBaileysModuleExports = baileysModule.exports;
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  let downloadCalls = 0;
  const sentMessages = [];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadMediaMessage: async () => {
      throw new Error('Expected the receive-time media cache');
    },
    downloadContentFromMessage: async (media, type) => {
      downloadCalls += 1;
      assert.equal(media.directPath, '/incoming/view-once');
      assert.equal(type, 'image');
      return (async function* () {
        yield Buffer.from('cached-on-arrival');
      })();
    }
  };
  delete require.cache[commandPath];

  try {
    const viewonceCommand = require(commandPath);
    const sourceMessage = {
      key: { remoteJid: 'cached-source-chat', id: 'cached-on-arrival-id' },
      message: {
        ephemeralMessage: {
          message: {
            viewOnceMessageV2: {
              message: {
                imageMessage: {
                  directPath: '/incoming/view-once',
                  mediaKey: Buffer.from('incoming-key'),
                  mimetype: 'image/jpeg',
                  caption: 'cached caption'
                }
              }
            }
          }
        }
      }
    };
    await viewonceCommand.cacheIncomingViewOnceMessage({}, sourceMessage);

    const commandMessage = {
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: 'cached-on-arrival-id',
            quotedMessage: {
              viewOnceMessageV2: {
                message: { imageMessage: { mediaKey: null, mimetype: 'image/jpeg' } }
              }
            }
          }
        }
      }
    };
    await viewonceCommand({
      sendMessage: async (...args) => sentMessages.push(args)
    }, 'reply-chat', commandMessage);

    assert.equal(downloadCalls, 1);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][1].image.toString(), 'cached-on-arrival');
    assert.equal(sentMessages[0][1].caption, 'cached caption');
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
  }
});

test('vv refreshes stored media that has no download URL before trying to download it', async () => {
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
  const originalBaileysModuleExports = baileysModule.exports;
  const store = require('../lib/lightweight_store');
  const chatId = 'refresh-chat';
  const sourceId = 'refresh-message';
  const priorMessages = store.messages[chatId];
  const commandPath = require.resolve('../commands/viewonce');
  const originalCommandModule = require.cache[commandPath];
  const media = {
    mediaKey: Buffer.from('view-once-key'),
    mimetype: 'image/jpeg',
    caption: 'refreshed media'
  };
  const sentMessages = [];
  store.messages[chatId] = [{
    key: { remoteJid: chatId, id: sourceId },
    message: {
      viewOnceMessageV2: {
        message: { imageMessage: media }
      }
    }
  }];
  baileysModule.exports = {
    ...originalBaileysExports,
    downloadMediaMessage: async (sourceMessage, type) => {
      assert.equal(sourceMessage.key.id, sourceId);
      assert.equal(type, 'buffer');
      assert.equal(sourceMessage.message.viewOnceMessageV2.message.imageMessage.directPath, '/refreshed/path');
      return Buffer.from('refreshed-image');
    },
    downloadContentFromMessage: async () => {
      throw new Error('Expected the refreshed message downloader');
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
      updateMediaMessage: async sourceMessage => {
        sourceMessage.message.viewOnceMessageV2.message.imageMessage.directPath = '/refreshed/path';
        return sourceMessage;
      },
      sendMessage: async (...args) => sentMessages.push(args)
    }, chatId, message);

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][1].image.toString(), 'refreshed-image');
    assert.equal(sentMessages[0][1].caption, 'refreshed media');
  } finally {
    baileysModule.exports = originalBaileysModuleExports;
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
    if (priorMessages) store.messages[chatId] = priorMessages;
    else delete store.messages[chatId];
  }
});

test('.as sends a video sticker with an embedded audio track', async () => {
  const { EventEmitter } = require('node:events');
  const fs = require('node:fs');
  const childProcess = require('node:child_process');
  const protobuf = require('protobufjs/minimal');
  const baileysPath = require.resolve('@whiskeysockets/baileys');
  const originalBaileysExports = require(baileysPath);
  const baileysModule = require.cache[baileysPath];
  const proto = originalBaileysExports.proto;
  const originalMessageEncode = proto.Message.encode;
  const originalStickerEncode = proto.Message.StickerMessage.encode;
  const originalStickerFromObject = proto.Message.StickerMessage.fromObject;
  const messagePatchKey = Symbol.for('donixbot.audioStickerMessageProtoPatch');
  const originalMessagePatch = Object.getOwnPropertyDescriptor(proto.Message, messagePatchKey);
  const patchKey = Symbol.for('donixbot.audioStickerProtoPatch');
  const originalPatch = Object.getOwnPropertyDescriptor(proto.Message.StickerMessage, patchKey);
  const originalSpawn = childProcess.spawn;
  const commandPath = require.resolve('../commands/audioSticker');
  const originalCommandModule = require.cache[commandPath];
  const sentMessages = [];
  const ffmpegArgs = [];
  let encodedMessage;
  let stickerUploadBuffer;
  let audioSeconds;

  baileysModule.exports = {
    ...originalBaileysExports,
    downloadMediaMessage: async (sourceMessage, type) => {
      assert.equal(sourceMessage.key.remoteJid, 'audio-chat');
      assert.equal(sourceMessage.key.id, 'video-message');
      assert.equal(type, 'buffer');
      return Buffer.from('fake-video');
    },
    prepareWAMessageMedia: async content => {
      if (content.sticker) {
        stickerUploadBuffer = content.sticker;
        return { stickerMessage: { fileSha256: Buffer.alloc(32, 1), mimetype: 'image/webp' } };
      }
      audioSeconds = content.seconds;
      return {
        audioMessage: {
          fileSha256: require('node:crypto').createHash('sha256').update('fake-ogg-audio').digest(),
          mediaKey: Buffer.alloc(32, 3),
          directPath: '/audio-path',
          mimetype: content.mimetype,
          seconds: 60
        }
      };
    }
  };
  childProcess.spawn = (_executable, args) => {
    ffmpegArgs.push(args);
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      let output;
      if (args.includes('libwebp')) {
        const stickerProfile = ffmpegArgs.filter(ffmpegArgsForRun => ffmpegArgsForRun.includes('libwebp')).length - 1;
        output = stickerProfile < 8
          ? Buffer.alloc(500 * 1024 + 1)
          : fs.readFileSync(path.join(__dirname, '../assets/stickintro.webp'));
      } else if (args.includes('s16le')) {
        output = Buffer.alloc(128 * 2);
        for (let sample = 0; sample < 128; sample += 1) {
          output.writeInt16LE(sample * 100, sample * 2);
        }
      } else {
        output = Buffer.from('fake-ogg-audio');
      }
      fs.writeFileSync(args[args.length - 1], output);
      child.emit('close', 0);
    });
    return child;
  };
  delete require.cache[commandPath];

  try {
    const audioStickerCommand = require(commandPath);
    const message = {
      key: { remoteJid: 'audio-chat' },
      message: {
        extendedTextMessage: {
          contextInfo: {
            stanzaId: 'video-message',
            quotedMessage: { videoMessage: { mimetype: 'video/mp4' } }
          }
        }
      }
    };

    await audioStickerCommand({
      updateMediaMessage: async sourceMessage => sourceMessage,
      waUploadToServer: async () => ({}),
      sendMessage: async (...args) => sentMessages.push(args),
      relayMessage: async (_chatId, payload) => {
        encodedMessage = proto.Message.encode(proto.Message.fromObject(payload)).finish();
      }
    }, 'audio-chat', message);

    assert.equal(ffmpegArgs.length, 11, sentMessages.map(entry => entry[1].text).join(' | '));
    assert.ok(ffmpegArgs[0].includes('libwebp'));
    assert.ok(ffmpegArgs[0].includes('-fps_mode'));
    assert.ok(ffmpegArgs[0].includes('passthrough'));
    assert.equal(ffmpegArgs[0][ffmpegArgs[0].indexOf('-t') + 1], '60');
    for (const stickerArgs of ffmpegArgs.slice(0, 9)) {
      assert.equal(stickerArgs[stickerArgs.indexOf('-t') + 1], '60');
    }
    assert.ok(ffmpegArgs[4].some(argument => argument.includes('fps=3,scale=384:384')));
    assert.ok(ffmpegArgs[8].some(argument => argument.includes('fps=1,scale=128:128')));
    assert.ok(ffmpegArgs[8].some(argument => argument.includes('pad=512:512')));
    assert.equal(ffmpegArgs[9][ffmpegArgs[9].indexOf('-t') + 1], '60');
    assert.ok(ffmpegArgs[9].includes('0:a:0'));
    assert.ok(ffmpegArgs[9].includes('libopus'));
    assert.ok(ffmpegArgs[9].includes('64k'));
    assert.ok(ffmpegArgs[9].includes('20'));
    assert.ok(ffmpegArgs[10].includes('s16le'));
    assert.equal(audioSeconds, undefined);
    assert.equal(sentMessages.length, 1);
    const stickerImage = new (require('node-webpmux').Image)();
    await stickerImage.load(stickerUploadBuffer);
    assert.ok(stickerUploadBuffer.length <= 500 * 1024);
    const stickerMetadata = JSON.parse(stickerImage.exif.subarray(22).toString());
    assert.equal(
      stickerMetadata['sound-sha256'],
      require('node:crypto').createHash('sha256').update('fake-ogg-audio').digest('base64')
    );

    const outer = protobuf.Reader.create(encodedMessage);
    assert.equal(outer.uint32(), (134 << 3) | 2);
    const futureProof = protobuf.Reader.create(outer.bytes());
    assert.equal(futureProof.uint32(), (1 << 3) | 2);
    const wrappedMessage = protobuf.Reader.create(futureProof.bytes());
    assert.equal(wrappedMessage.uint32(), (26 << 3) | 2);

    const nestedSticker = protobuf.Reader.create(wrappedMessage.bytes());
    const audioFields = [];
    while (nestedSticker.pos < nestedSticker.len) {
      const tag = nestedSticker.uint32();
      const fieldNumber = tag >>> 3;
      const wireType = tag & 7;
      if (fieldNumber === 26 && wireType === 2) {
        audioFields.push(nestedSticker.bytes());
      } else {
        nestedSticker.skipType(wireType);
      }
    }
    assert.equal(audioFields.length, 1);
    const embeddedAudio = proto.Message.AudioMessage.decode(audioFields[0]);
    assert.equal(embeddedAudio.mimetype, 'audio/ogg; codecs=opus');
    assert.equal(embeddedAudio.seconds, 60);
    assert.equal(embeddedAudio.waveform.length, 64);
    assert.equal(Math.max(...embeddedAudio.waveform), 100);
  } finally {
    childProcess.spawn = originalSpawn;
    baileysModule.exports = originalBaileysExports;
    proto.Message.encode = originalMessageEncode;
    proto.Message.StickerMessage.encode = originalStickerEncode;
    proto.Message.StickerMessage.fromObject = originalStickerFromObject;
    if (originalMessagePatch) Object.defineProperty(proto.Message, messagePatchKey, originalMessagePatch);
    else delete proto.Message[messagePatchKey];
    if (originalPatch) Object.defineProperty(proto.Message.StickerMessage, patchKey, originalPatch);
    else delete proto.Message.StickerMessage[patchKey];
    if (originalCommandModule) require.cache[commandPath] = originalCommandModule;
    else delete require.cache[commandPath];
  }
});
