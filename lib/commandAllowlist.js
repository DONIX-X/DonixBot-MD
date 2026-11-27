const fs = require('fs');
const path = require('path');

const commandSettingsPath = path.join(__dirname, '..', 'data', 'commandOverrides.json');

const commandGroups = [
    {
        title: '🌐 GENERAL',
        commands: [
            '.menu', '.mnew', '.help', '.ping', '.alive', '.tts <text>', '.owner', '.news', '.groupinfo', '.vv', '.url', '.tourl', '.pair', '.ss <url>'
        ]
    },
    {
        title: '🛡️ ADMIN',
        commands: [
            '.ban @user', '.promote @user', '.demote @user', '.kick @user', '.add @user', '.invite', '.glist',
            '.gapprove <all|numbers>', '.greject <all|numbers>', '.antilink',
            '.tag <message>', '.tagall', '.tagnotadmin', '.hidetag <message>',
            '.resetlink', '.antitag <on/off>', '.welcome <on/off>', '.goodbye <on/off>',
            '.setgdesc <description>', '.setgname <new name>', '.setgpp'
        ]
    },
    {
        title: '👑 OWNER',
        commands: [
            '.mode <public/private>', '.sudo <add/del/list>', '.clearsession', '.antidelete', '.cleartmp', '.update',
            '.dismenu', '.encommand <command>', '.discommand <command>',
            '.afk [reason/off]', '.join <group link>', '.create <name> (reply to a user)',
            '.setname <name>', '.setbio <status>', '.mypp',
            '.settings', '.setpp', '.autoreact <on/off>', '.autostatus <on/off>',
            '.autotyping <on/off>', '.autoread <on/off>', '.anticall <on/off>',
            '.pmblocker <on/off/status>', '.pmblocker setmsg <text>', '.setmention',
            '.mention <on/off>', '.startmsg <on/off/status/info>', '.setstartmsg'
        ]
    },
    {
        title: '🖼️ IMAGE / STICKER',
        commands: ['.sticker', '.take <packname>', '.as (reply to video)', '.imagine <prompt>']
    },
    {
        title: '🧠 AI',
        commands: ['.gpt4 <question>']
    },
    {
        title: '📥 DOWNLOADER',
        commands: [
            '.play <song_name>', '.mp3 <song_name>', '.ytmp3 <song_name>', '.song <song_name>', '.music <song_name>',
            '.video <link>', '.ytmp4 <link>', '.spotify <query>',
            '.instagram <link>', '.insta <link>', '.ig <link>', '.igsc <link>', '.igs <link>',
            '.facebook <link>', '.fb <link>', '.tiktok <link>', '.tt <link>',
            '.tg <sticker_set>', '.stickertelegram <sticker_set>', '.tgsticker <sticker_set>', '.telesticker <sticker_set>'
        ]
    },
    {
        title: '🐙 GITHUB',
        commands: ['.github']
    }
];

const enabledCommands = new Set(
    commandGroups.flatMap(group => group.commands.map(command => command.split(/\s+/)[0]))
);

const implementedCommands = new Set([
    '.1917', '.8ball', '.admins', '.animu', '.animuquote', '.answer', '.antibadword', '.anularlink',
    '.areact', '.arena', '.attp', '.autoreaction', '.blackpink', '.blur', '.bot', '.character',
    '.chatbot', '.china', '.circle', '.clear', '.clearsesi', '.compliment', '.comrade', '.crop',
    '.cry', '.dalle', '.dare', '.del', '.delete', '.devil', '.emix', '.emojimix', '.enhance',
    '.face-palm', '.facepalm', '.fact', '.fire', '.flirt', '.flux', '.gay', '.gemini', '.git',
    '.glass', '.glitch', '.gn', '.goodnight', '.gpt', '.guess', '.hacker', '.hangman', '.heart',
    '.horny', '.hug', '.ice', '.imagine', '.impressive', '.india', '.indonesia', '.infogp',
    '.infogrupo', '.insult', '.iss', '.its-so-stupid', '.itssostupid', '.jail', '.japan', '.jid',
    '.joke', '.kiss', '.korea', '.leaves', '.lgbt', '.light', '.list', '.listadmin', '.loli',
    '.lolice', '.lovenight', '.lyrics', '.malaysia', '.matrix', '.meme', '.metallic', '.move',
    '.mute', '.namecard', '.neon', '.nobg', '.nom', '.oogway', '.oogway2', '.passed', '.pat',
    '.pies', '.poke', '.purple', '.quote', '.remini', '.removebg', '.repo', '.revoke', '.rmbg',
    '.roseday', '.s', '.sand', '.sc', '.screenshot', '.script', '.shayari', '.shayri', '.ship',
    '.simage', '.simp', '.simpcard', '.snow', '.sora', '.ssweb', '.staff', '.steal', '.stupid',
    '.surrender', '.thailand', '.thunder', '.tictactoe', '.tonikawa', '.topmembers', '.translate',
    '.triggered', '.trivia', '.trt', '.truth', '.ttt', '.tweet', '.unban', '.unmute', '.upscale',
    '.warn', '.warnings', '.waste', '.weather', '.wink', '.ytcomment'
]);

const knownCommands = new Set([...enabledCommands, ...implementedCommands]);
const protectedCommands = new Set([
    '.menu', '.mnew', '.help', '.dismenu', '.encommand', '.discommand', '.mode'
]);

function readCommandOverrides(filePath = commandSettingsPath, strict = false) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!data || typeof data.overrides !== 'object' || Array.isArray(data.overrides)) return {};
        return data.overrides;
    } catch (error) {
        if (error.code === 'ENOENT') return {};
        console.error(`Unable to read command overrides from ${filePath}:`, error);
        if (strict) throw new Error(`Unable to read command settings: ${error.message}`);
        return {};
    }
}

function isAllowed(commandName, overrides) {
    const rawCommand = String(commandName || '').trim().toLowerCase();
    const normalized = rawCommand.startsWith('.') ? rawCommand : `.${rawCommand}`;
    if (!knownCommands.has(normalized)) return false;
    if (typeof overrides[normalized] === 'boolean') return overrides[normalized];
    return enabledCommands.has(normalized);
}

function isCommandAllowed(commandName, options = {}) {
    const overrides = readCommandOverrides(options.filePath);
    return isAllowed(commandName, overrides);
}

function getDisabledCommands(options = {}) {
    const overrides = readCommandOverrides(options.filePath);
    return [...knownCommands]
        .filter(command => !isAllowed(command, overrides))
        .sort();
}

function setCommandEnabled(commandName, enabled, options = {}) {
    const rawCommand = String(commandName || '').trim().toLowerCase();
    const normalized = rawCommand.startsWith('.') ? rawCommand : `.${rawCommand}`;
    if (!knownCommands.has(normalized)) {
        return { ok: false, reason: 'unknown' };
    }
    if (typeof enabled !== 'boolean') {
        throw new TypeError('Command enabled state must be a boolean.');
    }
    if (!enabled && protectedCommands.has(normalized)) {
        return { ok: false, reason: 'protected' };
    }

    const filePath = options.filePath || commandSettingsPath;
    const overrides = readCommandOverrides(filePath, true);
    const currentState = isAllowed(normalized, overrides);
    if (currentState === enabled) {
        return { ok: true, changed: false };
    }

    if (enabled === enabledCommands.has(normalized)) {
        delete overrides[normalized];
    } else {
        overrides[normalized] = enabled;
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ overrides }, null, 2));
    return { ok: true, changed: true };
}

function getVisibleCommandGroups(options = {}) {
    const overrides = readCommandOverrides(options.filePath);
    const visibleGroups = commandGroups
        .map(group => ({
            ...group,
            commands: group.commands.filter(command => isAllowed(command.split(/\s+/)[0], overrides))
        }))
        .filter(group => group.commands.length > 0);

    const listedCommands = new Set(
        visibleGroups.flatMap(group => group.commands.map(command => command.split(/\s+/)[0]))
    );
    const additionalCommands = [...knownCommands]
        .filter(command => isAllowed(command, overrides) && !listedCommands.has(command))
        .sort();
    if (additionalCommands.length) {
        visibleGroups.push({
            title: '🧩 ENABLED COMMANDS',
            commands: additionalCommands
        });
    }
    return visibleGroups;
}

module.exports = {
    commandGroups,
    commandSettingsPath,
    getDisabledCommands,
    getVisibleCommandGroups,
    isCommandAllowed,
    setCommandEnabled
};
