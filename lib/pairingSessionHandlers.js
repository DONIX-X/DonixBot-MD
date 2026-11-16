function attachPairingSessionHandlers(sock, { handleMessages, handleGroupParticipantUpdate, handleStatus, store, NodeCache }) {
    sock.public = true;
    sock.msgRetryCounterCache = new NodeCache();
    store.bind(sock.ev);

    sock.ev.on('messages.upsert', async update => {
        try {
            const message = update.messages?.[0];
            if (!message?.message) return;

            if (Object.keys(message.message)[0] === 'ephemeralMessage') {
                message.message = message.message.ephemeralMessage.message;
            }
            if (message.key?.remoteJid === 'status@broadcast') {
                await handleStatus(sock, update);
                return;
            }
            if (message.key?.id?.startsWith('BAE5') && message.key.id.length === 16) return;

            sock.msgRetryCounterCache.clear();
            await handleMessages(sock, update, true);
        } catch (error) {
            console.error('Error in companion session message handler:', error);
            const chatId = update.messages?.[0]?.key?.remoteJid;
            if (chatId) {
                await sock.sendMessage(chatId, {
                    text: '❌ An error occurred while processing your message.'
                }).catch(console.error);
            }
        }
    });

    sock.ev.on('group-participants.update', async update => {
        await handleGroupParticipantUpdate(sock, update);
    });
    sock.ev.on('status.update', async status => {
        await handleStatus(sock, status);
    });
    sock.ev.on('messages.reaction', async status => {
        await handleStatus(sock, status);
    });
}

module.exports = attachPairingSessionHandlers;
