const { setAntiBadword, getAntiBadword, removeAntiBadword, incrementWarningCount, resetWarningCount } = require('../lib/index');

const badWords = new Set([
    'gandu', 'madarchod', 'bhosdike', 'bsdk', 'fucker', 'bhosda',
    'lauda', 'laude', 'betichod', 'chutiya', 'behenchod', 'randi', 'chuchi',
    'boobs', 'boobies', 'tits', 'idiot', 'nigga', 'fuck', 'dick', 'bitch',
    'bastard', 'asshole', 'asu', 'awyu', 'lund', 'mc', 'lodu',
    'shit', 'damn', 'hell', 'piss', 'crap', 'slut', 'whore', 'prick',
    'motherfucker', 'cock', 'cunt', 'pussy', 'twat', 'wanker', 'douchebag',
    'jackass', 'moron', 'retard', 'scumbag', 'skank', 'slutty', 'arse',
    'bugger', 'chut', 'madar', 'chodne', 'harami', 'chodu', 'kameena',
    'haramzada', 'chudai', 'fck', 'fckr', 'fcker', 'fuk', 'fukk', 'fcuk',
    'btch', 'bch', 'assclown', 'l0du', 'spic', 'chink', 'cracker',
    'towelhead', 'gook', 'kike', 'paki', 'honky', 'wetback', 'raghead',
    'beaner', 'lund69', 'blowjob', 'handjob', 'cum', 'cumshot', 'jizz', 'deepthroat',
    'fap', 'hentai', 'milf', 'anal', 'orgasm', 'dildo', 'vibrator',
    'gangbang', 'threesome', 'porn', 'sex', 'xxx', 'fag', 'faggot', 'dyke',
    'tranny', 'homo', 'sissy', 'fairy', 'lesbo', 'weed', 'pot', 'coke',
    'heroin', 'meth', 'crack', 'dope', 'bong', 'kush', 'hash', 'trip', 'rolling'
]);

const badPhrases = [
    'maa ki chut', 'behen ki chut', 'tatto ke saudagar', 'machar ki jhant',
    'jhant ka baal', 'teri ma ki chut', 'teri maa ki', 'lund ke baal',
    'benchod', 'sod off', 'laude ka baal', 'behen ke lode', 'sala kutta',
    'randi ki aulad', 'gaand mara', 'lund le', 'gandu saala', 'chamiya',
    'chodne wala', 'chutiye ke baap', 'f*ck', 'f@ck', 'b!tch', 'd!ck',
    'n!gga', 'f***er', 's***head', 'a$$', 'a**hole', 'jungle bunny', 'sand nigger'
];

async function handleAntiBadwordCommand(sock, chatId, message, match) {
    if (!match) {
        return sock.sendMessage(chatId, {
            text: `*ANTIBADWORD SETUP*\n\n*.antibadword on*\nTurn on antibadword\n\n*.antibadword set <action>*\nSet action: delete/kick/warn\n\n*.antibadword off*\nDisables antibadword in this group`
        }, { quoted: message });
    }

    if (match === 'on') {
        const existingConfig = await getAntiBadword(chatId, 'on');
        if (existingConfig?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already enabled for this group*' });
        }
        await setAntiBadword(chatId, 'on', 'delete');
        return sock.sendMessage(chatId, { text: '*AntiBadword has been enabled. Use .antibadword set <action> to customize action*' }, { quoted: message });
    }

    if (match === 'off') {
        const config = await getAntiBadword(chatId, 'on');
        if (!config?.enabled) {
            return sock.sendMessage(chatId, { text: '*AntiBadword is already disabled for this group*' }, { quoted: message } );
        }
        await removeAntiBadword(chatId);
        return sock.sendMessage(chatId, { text: '*AntiBadword has been disabled for this group*' }, { quoted: message } );
    }

    if (match.startsWith('set')) {
        const action = match.split(' ')[1];
        if (!action || !['delete', 'kick', 'warn'].includes(action)) {
            return sock.sendMessage(chatId, { text: '*Invalid action. Choose: delete, kick, or warn*' }, { quoted: message } );
        }
        await setAntiBadword(chatId, 'on', action);
        return sock.sendMessage(chatId, { text: `*AntiBadword action set to: ${action}*` }, { quoted: message } );
    }

    return sock.sendMessage(chatId, { text: '*Invalid command. Use .antibadword to see usage*' }, { quoted: message } );
}

async function handleBadwordDetection(sock, chatId, message, userMessage, senderId) {
    // Skip if not group
    if (!chatId.endsWith('@g.us')) return;

    // Skip if message is from bot
    if (message.key.fromMe) return;

    const antiBadwordConfig = await getAntiBadword(chatId, 'on');
    if (!antiBadwordConfig?.enabled) {
        return;
    }

    // Convert message to lowercase and clean it
    const cleanMessage = userMessage.toLowerCase()
        .replace(/[^\w\s]/g, ' ')  // Replace special chars with space
        .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
        .trim();

    const containsBadWord = cleanMessage.split(' ').some(word => word.length >= 2 && badWords.has(word)) ||
        badPhrases.some(phrase => cleanMessage.includes(phrase));
    if (!containsBadWord) return;

   // console.log('Bad word detected in:', userMessage);

    // Check if bot is admin before taking action
    const groupMetadata = await sock.groupMetadata(chatId);
    const botId = sock.user.id.split(':')[0] + '@s.whatsapp.net';
    const bot = groupMetadata.participants.find(p => p.id === botId);
    if (!bot?.admin) {
       // console.log('Bot is not admin, cannot take action');
        return;
    }

    // Check if sender is admin
    const participant = groupMetadata.participants.find(p => p.id === senderId);
    if (participant?.admin) {
        //console.log('Sender is admin, skipping action');
        return;
    }

    // Delete message immediately
    try {
        await sock.sendMessage(chatId, { 
            delete: message.key
        });
        //console.log('Message deleted successfully');
    } catch (err) {
        console.error('Error deleting message:', err);
        return;
    }

    // Take action based on config
    switch (antiBadwordConfig.action) {
        case 'delete':
            await sock.sendMessage(chatId, {
                text: `*@${senderId.split('@')[0]} bad words are not allowed here*`,
                mentions: [senderId]
            });
            break;

        case 'kick':
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} has been kicked for using bad words*`,
                    mentions: [senderId]
                });
            } catch (error) {
                console.error('Error kicking user:', error);
            }
            break;

        case 'warn':
            const warningCount = await incrementWarningCount(chatId, senderId);
            if (warningCount >= 3) {
                try {
                    await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                    await resetWarningCount(chatId, senderId);
                    await sock.sendMessage(chatId, {
                        text: `*@${senderId.split('@')[0]} has been kicked after 3 warnings*`,
                        mentions: [senderId]
                    });
                } catch (error) {
                    console.error('Error kicking user after warnings:', error);
                }
            } else {
                await sock.sendMessage(chatId, {
                    text: `*@${senderId.split('@')[0]} warning ${warningCount}/3 for using bad words*`,
                    mentions: [senderId]
                });
            }
            break;
    }
}

module.exports = {
    handleAntiBadwordCommand,
    handleBadwordDetection
}; 