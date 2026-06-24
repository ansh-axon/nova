const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const EncryptionManager = require('../utils/encryption');
const { generateAIReply, AI_USERNAME } = require('../utils/aiAssistant');
const { sendPush } = require('../utils/push');
const { sendData } = require('../utils/fcmAdmin');

// Builds a short notification preview from a message (never leaks long content).
function notifPreview(messageType, text) {
  switch (messageType) {
    case 'image': return '📷 Photo';
    case 'video': return '🎥 Video';
    case 'audio': return '🎤 Voice note';
    case 'file': return '📁 Document';
    default: {
      const t = (text || '').trim();
      if (!t) return 'New message';
      return t.length > 80 ? t.slice(0, 77) + '…' : t;
    }
  }
}

// @route   GET api/messages/:conversationId
// @desc    Get all messages for a conversation (with decryption)
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to view messages' });
    }

    const messages = await Message.find({ conversation: req.params.conversationId })
      .populate('sender', 'username displayName avatarUrl')
      .populate('readBy.user', 'username displayName avatarUrl')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error loading messages' });
  }
});

// @route   POST api/messages/search
// @desc    Search messages in conversations
router.post('/search', auth, async (req, res) => {
  const { query, conversationId } = req.body;

  if (!query || !conversationId) {
    return res.status(400).json({ message: 'Query and conversationId are required' });
  }

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Escape regex special chars so user input is treated as a literal string
    // (prevents ReDoS / catastrophic backtracking and regex injection).
    const safeQuery = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const messages = await Message.find({
      conversation: conversationId,
      text: { $regex: safeQuery, $options: 'i' }
    })
      .populate('sender', 'username displayName avatarUrl')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error searching messages' });
  }
});

// @route   POST api/messages
// @desc    Send an encrypted message in a conversation
router.post('/', auth, async (req, res) => {
  const { conversationId, text, messageType, mediaUrl } = req.body;

  if (!conversationId || !text) {
    return res.status(400).json({ message: 'Conversation ID and text are required' });
  }

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    // Ensure sender is participant
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({ message: 'Not authorized to send in this conversation' });
    }

    const sender = await User.findById(req.user.id).select('+secretKey');

    let encryptedContent = null;

    // Handle encryption based on conversation type
    if (conversation.isGroup) {
      // Group message - use symmetric encryption with group key
      if (conversation.groupEncryptionKey) {
        encryptedContent = EncryptionManager.encryptGroupMessage(text, conversation.groupEncryptionKey);
      }
    } else {
      // 1-on-1 message - use asymmetric encryption
      const recipient = conversation.participants.find(p => p.toString() !== req.user.id);
      const recipientUser = await User.findById(recipient);
      // Block enforcement: if either side has blocked the other, refuse to send.
      const senderBlocked = (sender.blockedUsers || []).some(id => id.toString() === recipient.toString());
      const recipientBlocked = (recipientUser?.blockedUsers || []).some(id => id.toString() === req.user.id);
      if (senderBlocked || recipientBlocked) {
        return res.status(403).json({ message: 'You can no longer message this user.' });
      }
      if (sender.secretKey && recipientUser.publicKey) {
        encryptedContent = EncryptionManager.encryptMessage(text, sender.secretKey, recipientUser.publicKey);
      }
    }

    const message = new Message({
      conversation: conversationId,
      sender: req.user.id,
      text: text.trim(),
      messageType: messageType || 'text',
      mediaUrl: mediaUrl || undefined,
      encryptedContent: encryptedContent,
      readBy: [{ user: req.user.id, readAt: new Date() }]
    });

    await message.save();

    // Update conversation lastMessage
    conversation.lastMessage = message._id;
    // A new message revives the chat for anyone who had cleared it.
    if (Array.isArray(conversation.deletedFor) && conversation.deletedFor.length > 0) {
      conversation.deletedFor = [];
    }
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username displayName avatarUrl');

    // Emit to all participants via Socket.io
    conversation.participants.forEach(participantId => {
      if (participantId.toString() !== req.user.id) {
        req.io.to(`user_${participantId.toString()}`).emit('message_received', populatedMessage);
      }
    });

    res.json(populatedMessage);

    // ── Push notification to offline/backgrounded recipients ────────────
    // Fire-and-forget: never blocks or breaks the message flow.
    (async () => {
      try {
        const recipientIds = conversation.participants
          .filter((p) => p.toString() !== req.user.id);
        if (recipientIds.length === 0) return;

        const recipients = await User.find({ _id: { $in: recipientIds } }).select('pushTokens fcmTokens username messageRingtone');

        const senderName = populatedMessage.sender.displayName || populatedMessage.sender.username || 'New message';
        const preview = notifPreview(populatedMessage.messageType, text);
        const title = conversation.isGroup
          ? (conversation.groupName || 'Group')
          : senderName;
        const body = conversation.isGroup ? `${senderName}: ${preview}` : preview;

        // Built-in tone ids that have a dedicated per-tone notification channel
        // (so the user's chosen message tone sounds on the lock screen).
        const MSG_TONE_IDS = ['pulse','chime','ripple','glow','aurora','marimba','classic','bright','bubble','cool','melody','romantic'];

        // Prefer reliable FCM (rings/shows on lock screen & when app closed);
        // fall back to Expo push only for recipients without an FCM token.
        // Send PER-RECIPIENT so each gets their own chosen message tone.
        const expoTokens = [];
        const invalidAll = [];
        for (const u of recipients) {
          if (u.username === AI_USERNAME) continue;
          if (Array.isArray(u.fcmTokens) && u.fcmTokens.length > 0) {
            const tone = (u.messageRingtone && MSG_TONE_IDS.indexOf(u.messageRingtone) >= 0) ? u.messageRingtone : null;
            const channelId = tone ? ('nova_msg_' + tone) : 'nova_message';
            const sound = tone || 'notif_message';
            const invalid = await sendData(u.fcmTokens, {
              type: 'message',
              conversationId: conversationId.toString(),
            }, {
              title,
              body,
              channelId,
              sound,
              tag: 'msg_' + conversationId.toString(),
            });
            if (Array.isArray(invalid) && invalid.length > 0) invalidAll.push(...invalid);
          } else if (Array.isArray(u.pushTokens)) {
            expoTokens.push(...u.pushTokens);
          }
        }
        if (invalidAll.length > 0) {
          await User.updateMany({ _id: { $in: recipientIds } }, { $pull: { fcmTokens: { $in: invalidAll } } });
        }

        if (expoTokens.length > 0) {
          await sendPush(expoTokens, {
            title,
            body,
            channelId: 'messages-v2',
            sound: 'notif_message.wav',
            data: { type: 'message', conversationId: conversationId.toString() },
          });
        }
      } catch (e) {
        console.error('[PUSH] message push failed:', e.message);
      }
    })();

    // ── NOVA AI auto-reply ──────────────────────────────────────────────
    // If this is a 1-on-1 chat with the AI bot, generate a reply in the
    // background (after responding) and push it back over the socket.
    if (!conversation.isGroup) {
      const otherId = conversation.participants.find((p) => p.toString() !== req.user.id);
      (async () => {
        try {
          const aiUser = await User.findById(otherId).select('+secretKey');
          if (!aiUser || aiUser.username !== AI_USERNAME) return;

          const aiUserId = aiUser._id.toString();

          // Show a typing indicator from the AI while it "thinks"
          req.io.to(`user_${req.user.id}`).emit('typing_status', {
            conversationId, senderId: aiUserId, isTyping: true,
          });

          const aiText = await generateAIReply(conversationId, aiUserId, sender.displayName || sender.username);

          // Encrypt the AI reply for the user (1-on-1 asymmetric)
          let aiEncrypted = null;
          if (aiUser.secretKey && sender.publicKey) {
            aiEncrypted = EncryptionManager.encryptMessage(aiText, aiUser.secretKey, sender.publicKey);
          }

          const aiMessage = new Message({
            conversation: conversationId,
            sender: aiUser._id,
            text: aiText,
            messageType: 'text',
            encryptedContent: aiEncrypted,
            readBy: [{ user: aiUser._id, readAt: new Date() }],
          });
          await aiMessage.save();

          conversation.lastMessage = aiMessage._id;
          await conversation.save();

          const populatedAI = await Message.findById(aiMessage._id)
            .populate('sender', 'username displayName avatarUrl');

          // Stop typing, then deliver the AI message
          req.io.to(`user_${req.user.id}`).emit('typing_status', {
            conversationId, senderId: aiUserId, isTyping: false,
          });
          req.io.to(`user_${req.user.id}`).emit('message_received', populatedAI);
        } catch (e) {
          console.error('[NOVA AI] auto-reply failed:', e.message);
          req.io.to(`user_${req.user.id}`).emit('typing_status', {
            conversationId, senderId: otherId.toString(), isTyping: false,
          });
        }
      })();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error sending message' });
  }
});

// @route   PUT api/messages/:messageId/edit
// @desc    Edit your own text message (re-encrypts, marks edited, notifies all)
router.put('/:messageId/edit', auth, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ message: 'Text is required' });
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own messages' });
    }
    if (message.messageType !== 'text') {
      return res.status(400).json({ message: 'Only text messages can be edited' });
    }
    if (message.deletedForEveryone) {
      return res.status(400).json({ message: 'This message was deleted' });
    }

    const conversation = await Conversation.findById(message.conversation);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });

    // Re-encrypt the new text the same way it was originally encrypted.
    let encryptedContent = null;
    const sender = await User.findById(req.user.id).select('+secretKey');
    if (conversation.isGroup) {
      if (conversation.groupEncryptionKey) {
        encryptedContent = EncryptionManager.encryptGroupMessage(text, conversation.groupEncryptionKey);
      }
    } else {
      const recipient = conversation.participants.find(p => p.toString() !== req.user.id);
      const recipientUser = await User.findById(recipient);
      if (sender.secretKey && recipientUser && recipientUser.publicKey) {
        encryptedContent = EncryptionManager.encryptMessage(text, sender.secretKey, recipientUser.publicKey);
      }
    }

    message.text = text.trim();
    message.encryptedContent = encryptedContent;
    message.edited = true;
    await message.save();

    const populated = await Message.findById(message._id).populate('sender', 'username displayName avatarUrl');
    conversation.participants.forEach((pid) => {
      req.io.to(`user_${pid.toString()}`).emit('message_edited', populated);
    });
    res.json(populated);
  } catch (err) {
    console.error('[EDIT] error:', err.message);
    res.status(500).json({ message: 'Server error editing message' });
  }
});

// @route   DELETE api/messages/:messageId
// @desc    Delete your own message for everyone (notifies all participants)
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }
    const conversation = await Conversation.findById(message.conversation);

    message.deletedForEveryone = true;
    message.text = null;
    message.encryptedContent = null;
    message.mediaUrl = null;
    await message.save();

    if (conversation) {
      conversation.participants.forEach((pid) => {
        req.io.to(`user_${pid.toString()}`).emit('message_deleted', {
          _id: message._id.toString(),
          conversation: message.conversation.toString(),
        });
      });
    }
    res.json({ message: 'Message deleted', _id: message._id.toString() });
  } catch (err) {
    console.error('[DELETE MSG] error:', err.message);
    res.status(500).json({ message: 'Server error deleting message' });
  }
});

// @route   PUT api/messages/:messageId/read
// @desc    Mark message as read
router.put('/:messageId/read', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user is recipient
    const conversation = await Conversation.findById(message.conversation);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Add user to readBy if not already there
    const alreadyRead = message.readBy.some(r => r.user.toString() === req.user.id);
    if (!alreadyRead) {
      message.readBy.push({
        user: req.user.id,
        readAt: new Date()
      });
      message.status = 'read';
      await message.save();
    }

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'username displayName avatarUrl')
      .populate('readBy.user', 'username displayName avatarUrl');

    // Notify sender
    req.io.to(`user_${message.sender.toString()}`).emit('message_read', populatedMessage);

    res.json(populatedMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating read status' });
  }
});

// @route   PUT api/messages/conversation/:conversationId/read-all
// @desc    Mark all incoming messages in a conversation as read (seen). Efficient
//          bulk operation used to drive double-tick (seen) receipts.
router.put('/conversation/:conversationId/read-all', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await Message.updateMany(
      { conversation: req.params.conversationId, sender: { $ne: req.user.id }, status: { $ne: 'read' } },
      { $set: { status: 'read' }, $addToSet: { readBy: { user: req.user.id, readAt: new Date() } } }
    );

    // Notify the other participants so their sent messages flip to double-tick
    conversation.participants.forEach((pid) => {
      const idStr = pid.toString();
      if (idStr !== req.user.id) {
        req.io.to(`user_${idStr}`).emit('messages_read', {
          conversationId: req.params.conversationId,
          readerId: req.user.id
        });
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error marking conversation read' });
  }
});

// @route   DELETE api/messages/:messageId
// @desc    Delete a message (only sender can delete)
router.delete('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Only sender can delete
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this message' });
    }

    await Message.findByIdAndDelete(req.params.messageId);

    // Notify participants
    const conversation = await Conversation.findById(message.conversation);
    conversation.participants.forEach(participantId => {
      req.io.to(`user_${participantId.toString()}`).emit('message_deleted', req.params.messageId);
    });

    res.json({ message: 'Message deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting message' });
  }
});

module.exports = router;
