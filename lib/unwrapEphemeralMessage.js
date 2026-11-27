function unwrapEphemeralMessage(content) {
    let current = content;
    const visited = new Set();
    while (current?.ephemeralMessage?.message && !visited.has(current)) {
        visited.add(current);
        current = current.ephemeralMessage.message;
    }
    return current;
}

module.exports = unwrapEphemeralMessage;
