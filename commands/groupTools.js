const isAdmin = require('../lib/isAdmin');
const unwrapEphemeralMessage = require('../lib/unwrapEphemeralMessage');

function getContextInfo(message) {
    const content = unwrapEphemeralMessage(message.message);
    return content?.extendedTextMessage?.contextInfo
        || content?.imageMessage?.contextInfo
        || content?.videoMessage?.contextInfo
        || {};
}

function normalizePhoneJid(value) {
    const input = String(value || '').trim();
    const number = input.replace(/^[+]/, '').replace(/[\s()-]/g, '');
    if (!/^\d+$/.test(number)) return null;
    if (number.length < 8 || number.length > 15) return null;
    return `${number}@s.whatsapp.net`;
}

async function requireGroupAdmin(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'This command can only be used in a group.' }, { quoted: message });
        return false;
    }
    const { isBotAdmin, isSenderAdmin } = await isAdmin(sock, chatId, senderId);
    if (!isBotAdmin || !isSenderAdmin) {
        await sock.sendMessage(chatId, {
            text: !isBotAdmin
                ? '❌ The bot must be a group admin to use this command.'
                : '❌ Only group admins can use this command.'
        }, { quoted: message });
        return false;
    }
    return true;
}

function getTargets(message, input) {
    const contextInfo = getContextInfo(message);
    const quotedJid = contextInfo.participant;
    const mentionedJids = contextInfo.mentionedJid || [];
    if (mentionedJids.length) return mentionedJids;
    if (quotedJid) return [quotedJid];
    const rawInput = String(input || '').trim();
    if (!rawInput) return [];
    return rawInput
        .split(',')
        .map(value => normalizePhoneJid(value))
}

async function addGroupParticipant(sock, chatId, senderId, message, input) {
    if (!await requireGroupAdmin(sock, chatId, senderId, message)) return;
    const targets = getTargets(message, input);
    if (!targets.length) {
        await sock.sendMessage(chatId, {
            text: 'Usage: .add <phone number> or mention/reply to a member.'
        }, { quoted: message });
        return;
    }
    if (targets.some(jid => !jid)) {
        await sock.sendMessage(chatId, { text: '❌ Provide valid WhatsApp phone numbers.' }, { quoted: message });
        return;
    }

    const invalidTarget = targets.find(jid => !/^\d+@s\.whatsapp\.net$/.test(jid));
    if (invalidTarget) {
        await sock.sendMessage(chatId, { text: '❌ Provide valid WhatsApp phone numbers.' }, { quoted: message });
        return;
    }

    try {
        const results = await sock.groupParticipantsUpdate(chatId, targets, 'add');
        const successful = results.filter(result => String(result.status) === '200');
        const failed = results.length - successful.length;
        const details = successful.length
            ? `Added: ${successful.map(result => `@${result.jid.split('@')[0]}`).join(', ')}`
            : 'No participants were added.';
        await sock.sendMessage(chatId, {
            text: `${details}${failed ? `\n${failed} participant(s) could not be added.` : ''}`,
            mentions: successful.map(result => result.jid)
        }, { quoted: message });
    } catch (error) {
        console.error('Failed to add group participant:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not add participant: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function sendGroupInvite(sock, chatId, senderId, message) {
    if (!await requireGroupAdmin(sock, chatId, senderId, message)) return;
    try {
        const code = await sock.groupInviteCode(chatId);
        if (!code) throw new Error('WhatsApp returned no group invite code.');
        await sock.sendMessage(chatId, {
            text: `Group invite link:\nhttps://chat.whatsapp.com/${code}`
        }, { quoted: message });
    } catch (error) {
        console.error('Failed to get group invite link:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not get the group invite link: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function listGroupJoinRequests(sock, chatId, senderId, message) {
    if (!await requireGroupAdmin(sock, chatId, senderId, message)) return;
    try {
        const requests = await sock.groupRequestParticipantsList(chatId);
        const list = (requests || []).map(request => request.jid).filter(Boolean);
        if (!list.length) {
            await sock.sendMessage(chatId, { text: 'There are no pending join requests.' }, { quoted: message });
            return;
        }
        await sock.sendMessage(chatId, {
            text: `Pending join requests:\n${list.map(jid => `• +${jid.split('@')[0]}`).join('\n')}`,
            mentions: list
        }, { quoted: message });
    } catch (error) {
        console.error('Failed to list group join requests:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not list join requests: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function updateGroupJoinRequests(sock, chatId, senderId, message, input, action) {
    if (!await requireGroupAdmin(sock, chatId, senderId, message)) return;
    const selection = String(input || '').trim();
    if (!selection) {
        await sock.sendMessage(chatId, {
            text: `Usage: .g${action === 'approve' ? 'approve' : 'reject'} all|<phone numbers>`
        }, { quoted: message });
        return;
    }

    try {
        const pending = await sock.groupRequestParticipantsList(chatId);
        const pendingJids = (pending || []).map(request => request.jid).filter(Boolean);
        const requested = selection.toLowerCase() === 'all'
            ? pendingJids
            : selection.split(',').map(normalizePhoneJid);
        if (requested.some(jid => !jid)) {
            await sock.sendMessage(chatId, {
                text: '❌ Provide valid phone numbers separated by commas, or use "all".'
            }, { quoted: message });
            return;
        }
        if (!requested.length) {
            await sock.sendMessage(chatId, { text: 'There are no matching pending requests.' }, { quoted: message });
            return;
        }
        const pendingSet = new Set(pendingJids);
        const selected = requested.filter(jid => pendingSet.has(jid));
        if (selected.length !== requested.length) {
            await sock.sendMessage(chatId, {
                text: '❌ One or more supplied numbers do not have a pending request.'
            }, { quoted: message });
            return;
        }

        const results = await sock.groupRequestParticipantsUpdate(chatId, selected, action);
        const failures = (results || []).filter(result => String(result.status) !== '200');
        if (failures.length) {
            await sock.sendMessage(chatId, {
                text: `⚠️ ${selected.length - failures.length} request(s) processed; ${failures.length} failed.`
            }, { quoted: message });
            return;
        }
        await sock.sendMessage(chatId, {
            text: `✅ ${action === 'approve' ? 'Approved' : 'Rejected'} ${selected.length} join request(s).`
        }, { quoted: message });
    } catch (error) {
        console.error(`Failed to ${action} group join requests:`, error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not ${action} join requests: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function joinGroup(sock, chatId, message, input) {
    const match = String(input || '').trim().match(/^https:\/\/chat\.whatsapp\.com\/([a-zA-Z0-9]+)\/?$/);
    if (!match) {
        await sock.sendMessage(chatId, { text: 'Usage: .join <WhatsApp group invite link>' }, { quoted: message });
        return;
    }
    try {
        const groupId = await sock.groupAcceptInvite(match[1]);
        await sock.sendMessage(chatId, {
            text: groupId ? `✅ Joined group ${groupId}.` : '❌ WhatsApp did not confirm the group join.'
        }, { quoted: message });
    } catch (error) {
        console.error('Failed to join group from invite:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not join that group: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

async function createGroup(sock, chatId, message, input) {
    const subject = String(input || '').trim().slice(0, 100);
    const participant = getTargets(message, '');
    if (!subject) {
        await sock.sendMessage(chatId, { text: 'Usage: Reply to a user with .create <group name>' }, { quoted: message });
        return;
    }
    if (!participant.length) {
        await sock.sendMessage(chatId, {
            text: 'Reply to a user or mention one when creating the group.'
        }, { quoted: message });
        return;
    }
    try {
        const group = await sock.groupCreate(subject, participant.slice(0, 1));
        await sock.sendMessage(chatId, {
            text: group?.id ? `✅ Created “${subject}”.\nGroup ID: ${group.id}` : '❌ WhatsApp did not confirm group creation.'
        }, { quoted: message });
    } catch (error) {
        console.error('Failed to create group:', error);
        await sock.sendMessage(chatId, {
            text: `❌ Could not create the group: ${String(error.message || error).slice(0, 160)}`
        }, { quoted: message });
    }
}

module.exports = {
    addGroupParticipant,
    createGroup,
    joinGroup,
    listGroupJoinRequests,
    sendGroupInvite,
    updateGroupJoinRequests
};
