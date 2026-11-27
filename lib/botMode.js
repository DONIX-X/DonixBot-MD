const fs = require('fs');
const path = require('path');

const dataDirectory = path.join(__dirname, '..', 'data');
const botModePath = path.join(dataDirectory, 'botMode.json');
const messageCountPath = path.join(dataDirectory, 'messageCount.json');

function readIsPublic(filePath) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return typeof data.isPublic === 'boolean' ? data.isPublic : undefined;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error(`Unable to read bot mode from ${filePath}:`, error);
        }
        return undefined;
    }
}

function loadBotMode(defaultIsPublic = false, options = {}) {
    const storedMode = readIsPublic(options.botModePath || botModePath);
    if (storedMode !== undefined) return storedMode;

    const legacyMode = readIsPublic(options.messageCountPath || messageCountPath);
    return legacyMode === undefined ? defaultIsPublic : legacyMode;
}

function setBotMode(isPublic, options = {}) {
    if (typeof isPublic !== 'boolean') {
        throw new TypeError('Bot mode must be a boolean.');
    }

    const modePath = options.botModePath || botModePath;
    const countPath = options.messageCountPath || messageCountPath;
    fs.mkdirSync(path.dirname(modePath), { recursive: true });

    const modeData = { isPublic };
    fs.writeFileSync(modePath, JSON.stringify(modeData, null, 2));

    let messageCounts = {};
    if (fs.existsSync(countPath)) {
        messageCounts = JSON.parse(fs.readFileSync(countPath, 'utf8'));
    }
    messageCounts.isPublic = isPublic;
    fs.mkdirSync(path.dirname(countPath), { recursive: true });
    fs.writeFileSync(countPath, JSON.stringify(messageCounts, null, 2));
}

module.exports = {
    botModePath,
    messageCountPath,
    loadBotMode,
    setBotMode
};
