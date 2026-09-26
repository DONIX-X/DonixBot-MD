const commandGroups = [
    {
        title: '🌐 GENERAL',
        commands: [
            '.menu', '.help', '.ping', '.alive', '.tts <text>', '.owner', '.news', '.groupinfo', '.vv', '.url'
        ]
    },
    {
        title: '🛡️ ADMIN',
        commands: [
            '.ban @user', '.promote @user', '.demote @user', '.kick @user', '.antilink',
            '.tag <message>', '.tagall', '.tagnotadmin', '.hidetag <message>', '.chatbot',
            '.resetlink', '.antitag <on/off>', '.welcome <on/off>', '.goodbye <on/off>',
            '.setgdesc <description>', '.setgname <new name>', '.setgpp'
        ]
    },
    {
        title: '👑 OWNER',
        commands: [
            '.mode <public/private>', '.clearsession', '.antidelete', '.cleartmp', '.update',
            '.settings', '.setpp', '.autoreact <on/off>', '.autostatus <on/off>',
            '.autotyping <on/off>', '.autoread <on/off>', '.anticall <on/off>',
            '.pmblocker <on/off/status>', '.pmblocker setmsg <text>', '.setmention',
            '.mention <on/off>'
        ]
    },
    {
        title: '🖼️ IMAGE / STICKER',
        commands: ['.sticker', '.take <packname>']
    },
    {
        title: '📥 DOWNLOADER',
        commands: ['.play <song_name>', '.song <song_name>', '.ytmp4 <Link>', '.spotify <query>', '.insta <link>']
    },
    {
        title: '🐙 GITHUB',
        commands: ['.git', '.github', '.sc', '.script', '.repo']
    }
];

const enabledCommands = new Set(
    commandGroups.flatMap(group => group.commands.map(command => command.split(/\s+/)[0]))
);

function isCommandAllowed(commandName) {
    return enabledCommands.has(commandName.toLowerCase());
}

module.exports = { commandGroups, isCommandAllowed };
