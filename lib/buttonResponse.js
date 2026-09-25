function getButtonResponseId(message) {
    const legacyButtonId = message?.message?.buttonsResponseMessage?.selectedButtonId;
    if (legacyButtonId) return legacyButtonId;

    const paramsJson = message?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (!paramsJson) return undefined;

    try {
        const response = JSON.parse(paramsJson);
        return typeof response.id === 'string' ? response.id : undefined;
    } catch {
        return undefined;
    }
}

module.exports = { getButtonResponseId };
