const test = require('node:test');
const assert = require('node:assert/strict');

const settings = require('../settings');
const { isCommandAllowed } = require('../lib/commandAllowlist');
const config = require('../config');
const aliveCommand = require('../commands/alive');
const helpCommand = require('../commands/help');

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
