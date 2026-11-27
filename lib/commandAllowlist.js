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
        commands: ['.sticker', '.take <packname>', '.as (reply to video)']
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

function isCommandAllowed(commandName) {
    return enabledCommands.has(commandName.toLowerCase());
}

module.exports = { commandGroups, isCommandAllowed };
