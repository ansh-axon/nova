const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const EncryptionManager = require('../utils/encryption');

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

    const messages = await Message.find({
      conversation: conversationId,
      text: { $regex: query, $options: 'i' }
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error sending message' });
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
