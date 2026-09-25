const settings = require('../settings');
const fs = require('fs');
const path = require('path');
const { commandGroups } = require('../lib/commandAllowlist');
const packageVersion = require('../package.json').version;

const allCommandGroups = [
    {
        title: '🌐 GENERAL',
        commands: [
            '.menu', '.ping', '.alive', '.tts <text>', '.owner', '.joke', '.quote', '.fact',
            '.weather <city>', '.news', '.attp <text>', '.lyrics <song_title>', '.8ball <question>',
            '.groupinfo', '.staff', '.vv', '.trt <text> <lang>', '.ss <link>', '.jid', '.url'
        ]
    },
    {
        title: '🛡️ ADMIN',
        commands: [
            '.ban @user', '.promote @user', '.demote @user', '.mute <minutes>', '.unmute',
            '.delete', '.del', '.kick @user', '.warnings @user', '.warn @user', '.antilink',
            '.antibadword', '.clear', '.tag <message>', '.tagall', '.tagnotadmin', '.hidetag <message>',
            '.chatbot', '.resetlink', '.antitag <on/off>', '.welcome <on/off>', '.goodbye <on/off>',
            '.setgdesc <description>', '.setgname <new name>', '.setgpp'
        ]
    },
    {
        title: '👑 OWNER',
        commands: [
            '.mode <on/off>', '.clearsession', '.antidelete', '.cleartmp', '.update', '.settings',
            '.setpp', '.autoreact <on/off>', '.autostatus <on/off>', '.autostatus react <on/off>',
            '.autotyping <on/off>', '.autoread <on/off>', '.anticall <on/off>',
            '.pmblocker <on/off/status>', '.pmblocker setmsg <text>', '.setmention', '.mention <on/off>'
        ]
    },
    {
        title: '🖼️ IMAGE / STICKER',
        commands: [
            '.blur', '.simage', '.sticker', '.removebg', '.remini', '.crop', '.tgsticker',
            '.meme', '.take <packname>', '.emojimix', '.igs', '.igsc'
        ]
    },
    {
        title: '🗺️ PIES',
        commands: ['.pies', '.china', '.indonesia', '.japan', '.korea', '.india', '.malaysia', '.thailand']
    },
    {
        title: '🎮 GAME',
        commands: ['.tictactoe', '.hangman', '.guess <letter>', '.trivia', '.answer <answer>', '.truth', '.dare']
    },
    {
        title: '🤖 AI',
        commands: ['.gpt <question>', '.gemini <question>', '.imagine <prompt>', '.flux <prompt>', '.sora <prompt>']
    },
    {
        title: '🎯 FUN',
        commands: [
            '.compliment', '.insult', '.flirt', '.shayari', '.goodnight', '.roseday', '.character',
            '.wasted', '.ship', '.simp', '.stupid'
        ]
    },
    {
        title: '🔤 TEXTMAKER',
        commands: [
            '.metallic', '.ice', '.snow', '.impressive', '.matrix', '.light', '.neon', '.devil',
            '.purple', '.thunder', '.leaves', '.1917', '.arena', '.hacker', '.sand', '.blackpink',
            '.glitch', '.fire'
        ]
    },
    {
        title: '📥 DOWNLOADER',
        commands: [
            '.play <song_name>', '.song <song_name>', '.spotify <query>', '.instagram <link>',
            '.facebook <link>', '.tiktok <link>', '.video <song name>', '.ytmp4 <Link>'
        ]
    },
    {
        title: '🧩 MISC',
        commands: [
            '.heart', '.horny', '.circle', '.lgbt', '.lolice', '.its-so-stupid', '.namecard',
            '.oogway', '.tweet', '.ytcomment', '.comrade', '.gay', '.glass', '.jail', '.passed', '.triggered'
        ]
    },
    {
        title: '🖼️ ANIME',
        commands: ['.nom', '.poke', '.cry', '.kiss', '.pat', '.hug', '.wink', '.facepalm']
    },
    {
        title: '🐙 GITHUB',
        commands: ['.git', '.github', '.sc', '.script', '.repo']
    }
];

async function helpCommand(sock, chatId, message, menuType = 'available') {
    const menuGroups = menuType === 'all' ? allCommandGroups : commandGroups;
    const menuSections = menuGroups.map(({ title, commands }) => [
        `╭━━━〔 ${title} 〕━━━╮`,
        '┃',
        ...commands.map(command => `┃ ${command}`),
        '╰━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n')).join('\n\n');
    const helpMessage = [
        '╭━━━〔 🤖 DONIX BOT MD 〕━━━╮',
        '┃',
        `┃ 👤 Owner  : ${settings.botOwner || 'DONIX'}`,
        '┃ ⚡ Prefix : .',
        `┃ 📦 Version : ${packageVersion}`,
        '┃',
        '╰━━━━━━━━━━━━━━━━━━━━╯',
        '',
        menuSections,
        '',
        '╭━━━━━━━━━━━━━━━━━━━━╮',
        `┃ 🤖 DONIX BOT MD v${settings.version || '1.0'}`,
        `┃ 👑 Powered by ${settings.botOwner || 'DONIX'}`,
        '╰━━━━━━━━━━━━━━━━━━━━╯'
    ].join('\n');

    try {
        const imagePath = path.join(__dirname, '../assets/bot_image.jpg');
        const channelLink = settings.channelLink || global.channelLink;
        const channelContext = {
            forwardingScore: 1,
            isForwarded: true
        };
        try {
            const inviteCode = new URL(channelLink).pathname.split('/').filter(Boolean).pop();
            const channel = await sock.newsletterMetadata('invite', inviteCode);
            if (channel?.id) {
                channelContext.forwardedNewsletterMessageInfo = {
                    newsletterJid: channel.id,
                    newsletterName: channel.name || settings.botName || 'Donix Bot MD',
                    serverMessageId: -1,
                    contentType: 3
                };
            }
        } catch (channelError) {
            console.error('[HELP] channel preview unavailable:', channelError.message);
        }

        if (menuType === 'all' || helpMessage.length > 1024) {
            await sock.sendMessage(chatId, {
                text: helpMessage,
                contextInfo: channelContext
            }, { quoted: message });
            return;
        }
        
        if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            
            await sock.sendMessage(chatId, {
                image: imageBuffer,
                caption: helpMessage,
                contextInfo: channelContext
            },{ quoted: message });
        } else {
            console.error('Bot image not found at:', imagePath);
            await sock.sendMessage(chatId, { 
                text: helpMessage,
                contextInfo: channelContext
            });
        }
    } catch (error) {
        console.error('Error in help command:', error);
        await sock.sendMessage(chatId, { text: helpMessage });
    }
}

module.exports = helpCommand;