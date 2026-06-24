const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Conversation = require('../models/Conversation');
const User = require('../models/User');
const Message = require('../models/Message');
const EncryptionManager = require('../utils/encryption');

// @route   GET api/conversations
// @desc    Get all conversations for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.id,
      deletedFor: { $ne: req.user.id }
    })
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('groupAdmin', 'username displayName avatarUrl')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    // Attach an unread-message count for each conversation (messages sent by
    // someone else that this user has not read yet).
    const result = await Promise.all(conversations.map(async (c) => {
      const obj = c.toObject();
      obj.unreadCount = await Message.countDocuments({
        conversation: c._id,
        sender: { $ne: req.user.id },
        'readBy.user': { $ne: req.user.id },
      });
      return obj;
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching conversations' });
  }
});

// @route   GET api/conversations/:conversationId
// @desc    Get a specific conversation
router.get('/:conversationId', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('groupAdmin', 'username displayName avatarUrl')
      .populate('lastMessage');

    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Not authorized to view this conversation' });
    }

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching conversation' });
  }
});

// @route   POST api/conversations
// @desc    Start/Get a 1-on-1 conversation with another user
router.post('/', auth, async (req, res) => {
  const { recipientId } = req.body;

  if (!recipientId) {
    return res.status(400).json({ message: 'Recipient user ID is required' });
  }

  try {
    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient not found' });
    }

    // Check if conversation already exists between these two participants
    let conversation = await Conversation.findOne({
      isGroup: false,
      participants: { $all: [req.user.id, recipientId] }
    }).populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('lastMessage');

    if (conversation) {
      return res.json(conversation);
    }

    // Create new 1-on-1 conversation
    conversation = new Conversation({
      participants: [req.user.id, recipientId],
      isGroup: false
    });

    await conversation.save();

    conversation = await Conversation.findById(conversation.id)
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen');

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating conversation' });
  }
});

// @route   POST api/conversations/group/create
// @desc    Create a group conversation (max 15 members)
router.post('/group/create', auth, async (req, res) => {
  const { groupName, participantIds, description, groupIcon } = req.body;

  if (!groupName || !participantIds || !Array.isArray(participantIds)) {
    return res.status(400).json({ message: 'Group name and participant IDs are required' });
  }

  if (participantIds.length > 14) {
    return res.status(400).json({ message: 'Group cannot have more than 15 participants (including creator)' });
  }

  try {
    // Include creator in participants
    const allParticipants = [req.user.id, ...participantIds];
    const uniqueParticipants = [...new Set(allParticipants)];

    if (uniqueParticipants.length > 15) {
      return res.status(400).json({ message: 'Group cannot have more than 15 participants' });
    }

    // Verify all participants exist
    const users = await User.find({ _id: { $in: uniqueParticipants } });
    if (users.length !== uniqueParticipants.length) {
      return res.status(400).json({ message: 'Some participants not found' });
    }

    // Generate group encryption key
    const groupEncryptionKey = EncryptionManager.generateGroupKey();

    const conversation = new Conversation({
      isGroup: true,
      groupName: groupName.trim(),
      groupIcon: groupIcon || null,
      description: description || null,
      participants: uniqueParticipants,
      groupAdmin: req.user.id,
      groupEncryptionKey: groupEncryptionKey,
      participantStatus: uniqueParticipants.map(id => ({
        user: id,
        joinedAt: new Date(),
        role: id.toString() === req.user.id ? 'admin' : 'member'
      }))
    });

    await conversation.save();

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('groupAdmin', 'username displayName avatarUrl')
      .populate('participantStatus.user', 'username displayName avatarUrl');

    res.json(populatedConversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating group conversation' });
  }
});

// @route   PUT api/conversations/:conversationId/add-member
// @desc    Add a member to a group (only admin)
router.put('/:conversationId/add-member', auth, async (req, res) => {
  const { memberId } = req.body;

  if (!memberId) {
    return res.status(400).json({ message: 'Member ID is required' });
  }

  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (conversation.groupAdmin.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only group admin can add members' });
    }

    if (conversation.participants.includes(memberId)) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    if (conversation.participants.length >= conversation.maxParticipants) {
      return res.status(400).json({ message: `Group is full (max ${conversation.maxParticipants} members)` });
    }

    const user = await User.findById(memberId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    conversation.participants.push(memberId);
    conversation.participantStatus.push({
      user: memberId,
      joinedAt: new Date(),
      role: 'member'
    });

    await conversation.save();

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('groupAdmin', 'username displayName avatarUrl');

    res.json(populatedConversation);

    // Notify everyone (especially the new member) so the group appears/updates
    // in their list immediately without needing an app restart.
    try {
      if (req.io) {
        conversation.participants.forEach((pid) => {
          req.io.to(`user_${pid.toString()}`).emit('group_updated', populatedConversation);
        });
      }
    } catch (e) { /* best-effort */ }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error adding member' });
  }
});

// @route   PUT api/conversations/:conversationId/remove-member
// @desc    Remove a member from a group (only admin)
router.put('/:conversationId/remove-member', auth, async (req, res) => {
  const { memberId } = req.body;

  if (!memberId) {
    return res.status(400).json({ message: 'Member ID is required' });
  }

  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.isGroup) {
      return res.status(404).json({ message: 'Group not found' });
    }

    if (conversation.groupAdmin.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Only group admin can remove members' });
    }

    conversation.participants = conversation.participants.filter(p => p.toString() !== memberId);
    conversation.participantStatus = conversation.participantStatus.filter(p => p.user.toString() !== memberId);

    await conversation.save();

    const populatedConversation = await Conversation.findById(conversation._id)
      .populate('participants', 'username displayName about avatarUrl isOnline lastSeen')
      .populate('groupAdmin', 'username displayName avatarUrl');

    res.json(populatedConversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error removing member' });
  }
});

// @route   PUT api/conversations/:conversationId/mute
// @desc    Mute notifications for a conversation
router.put('/:conversationId/mute', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (!conversation.mutedBy.includes(req.user.id)) {
      conversation.mutedBy.push(req.user.id);
      await conversation.save();
    }

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error muting conversation' });
  }
});

// @route   PUT api/conversations/:conversationId/unmute
// @desc    Unmute notifications for a conversation
router.put('/:conversationId/unmute', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    conversation.mutedBy = conversation.mutedBy.filter(u => u.toString() !== req.user.id);
    await conversation.save();

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error unmuting conversation' });
  }
});

// @route   DELETE api/conversations/:conversationId
// @desc    Delete/Leave a conversation
router.delete('/:conversationId', auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participants.includes(req.user.id)) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    if (conversation.isGroup && conversation.groupAdmin.toString() === req.user.id) {
      // Admin can delete entire group
      await Conversation.findByIdAndDelete(req.params.conversationId);
    } else if (conversation.isGroup) {
      // Member just leaves
      conversation.participants = conversation.participants.filter(p => p.toString() !== req.user.id);
      conversation.participantStatus = conversation.participantStatus.filter(p => p.user.toString() !== req.user.id);
      await conversation.save();
    } else {
      // 1-on-1: soft-delete for THIS user only, so the other participant keeps
      // their copy + history. Only hard-delete once both have cleared it.
      if (!conversation.deletedFor.some(id => id.toString() === req.user.id)) {
        conversation.deletedFor.push(req.user.id);
      }
      const everyoneDeleted = conversation.participants.every(p =>
        conversation.deletedFor.some(d => d.toString() === p.toString())
      );
      if (everyoneDeleted) {
        await Conversation.findByIdAndDelete(req.params.conversationId);
      } else {
        await conversation.save();
      }
    }

    res.json({ message: 'Conversation deleted/left' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting conversation' });
  }
});

module.exports = router;
