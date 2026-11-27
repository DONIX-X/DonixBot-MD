async function setProfileName(sock, chatId, message, name) {
    const value = String(name || '').trim();
    if (!value || value.length > 25) {
        await sock.sendMessage(chatId, { text: 'Usage: .setname <name, up to 25 characters>' }, { quoted: message });
        return;
    }
    try {
        await sock.updateProfileName(value);
        await sock.sendMessage(chatId, { text: '✅ WhatsApp profile name updated.' }, { quoted: message });
    } catch (error) {
        console.error('Failed to update WhatsApp profile name:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not update profile name: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function setProfileBio(sock, chatId, message, bio) {
    const value = String(bio || '').trim();
    if (!value || value.length > 139) {
        await sock.sendMessage(chatId, { text: 'Usage: .setbio <status, up to 139 characters>' }, { quoted: message });
        return;
    }
    try {
        await sock.updateProfileStatus(value);
        await sock.sendMessage(chatId, { text: '✅ WhatsApp profile status updated.' }, { quoted: message });
    } catch (error) {
        console.error('Failed to update WhatsApp profile status:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not update profile status: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function sendMyProfilePicture(sock, chatId, message) {
    try {
        const pictureUrl = await sock.profilePictureUrl(sock.user.id, 'image');
        if (!pictureUrl) throw new Error('No profile picture is available.');
        await sock.sendMessage(chatId, { image: { url: pictureUrl }, caption: 'Current bot profile picture' }, { quoted: message });
    } catch (error) {
        console.error('Failed to get WhatsApp profile picture:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not get the bot profile picture: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

module.exports = { sendMyProfilePicture, setProfileBio, setProfileName };
