const moment = require('moment-timezone');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

function getBotImagePath() {
  const primary = path.join(__dirname, '../assets/bot_image.jpg');
  const fallback = path.join(__dirname, '../assets/rapid.jpg');

  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(fallback)) return fallback;
  return null;
}

async function githubCommand(sock, chatId, message) {
  try {
    const profileUrl = 'https://github.com/DONIX-X';
    const res = await fetch('https://api.github.com/users/DONIX-X');
    if (!res.ok) throw new Error('Error fetching GitHub profile data');
    const json = await res.json();

    let txt = `*乂  Donix Bot MD  乂*\n\n`;
    txt += `✩  *GitHub* : ${profileUrl}\n`;
    txt += `✩  *Username* : ${json.login}\n`;
    txt += `✩  *Public Repositories* : ${json.public_repos}\n`;
    txt += `✩  *Followers* : ${json.followers}\n`;
    txt += `✩  *Following* : ${json.following}\n`;
    txt += `✩  *Last Updated* : ${moment().format('DD/MM/YY - HH:mm:ss')}\n\n`;
    txt += `💥 *Donix Bot MD*`;

    const imgPath = getBotImagePath();
    if (!imgPath) {
      await sock.sendMessage(chatId, { text: txt }, { quoted: message });
      return;
    }

    const imgBuffer = fs.readFileSync(imgPath);
    await sock.sendMessage(chatId, { image: imgBuffer, caption: txt }, { quoted: message });
  } catch (error) {
    console.error('GitHub command error:', error);
    await sock.sendMessage(chatId, { text: '❌ Error fetching GitHub profile information.' }, { quoted: message });
  }
}

module.exports = githubCommand;
