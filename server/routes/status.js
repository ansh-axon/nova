const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Status = require('../models/Status');
const User = require('../models/User');

router.get('/', auth, async (req, res) => {
  try {
    // Get all active statuses globally with privacy filters
    const statuses = await Status.find({
      expiresAt: { $gt: new Date() },
      $or: [
        { user: req.user.id },
        { privacy: 'public' },
        { privacy: 'contacts' },
        { 'viewers.user': req.user.id }
      ]
    })
      .populate('user', 'username displayName avatarUrl')
      .populate('viewers.user', 'username displayName avatarUrl')
      .sort({ createdAt: -1 });

    res.json(statuses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching statuses' });
  }
});

// @route   GET api/status/:userId
// @desc    Get statuses for a specific user
router.get('/:userId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const statuses = await Status.find({
      user: req.params.userId,
      expiresAt: { $gt: new Date() }
    })
      .populate('viewers.user', 'username displayName avatarUrl')
      .sort({ createdAt: -1 });

    // Filter based on privacy
    const filteredStatuses = statuses.filter(status => {
      if (status.privacy === 'public') return true;
      if (status.privacy === 'private' && status.user.toString() === req.user.id) return true;
      if (status.privacy === 'contacts') return true;
      return false;
    });

    res.json(filteredStatuses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error fetching statuses' });
  }
});

// @route   POST api/status
// @desc    Create a new status/story
router.post('/', auth, async (req, res) => {
  const { statusType, mediaUrl, textContent, textColor, backgroundColor, privacy } = req.body;

  if (!statusType) {
    return res.status(400).json({ message: 'Status type is required' });
  }

  if (statusType !== 'text' && !mediaUrl) {
    return res.status(400).json({ message: 'Media URL is required for image/video status' });
  }

  try {
    const status = new Status({
      user: req.user.id,
      statusType,
      mediaUrl: mediaUrl || null,
      textContent: textContent || null,
      textColor: textColor || '#FFFFFF',
      backgroundColor: backgroundColor || '#000000',
      privacy: privacy || 'contacts'
    });

    await status.save();

    const populatedStatus = await Status.findById(status._id)
      .populate('user', 'username displayName avatarUrl')
      .populate('viewers.user', 'username displayName avatarUrl');

    // Emit to Socket.io - notify contacts about new status
    req.io.emit('new_status', populatedStatus);

    res.json(populatedStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error creating status' });
  }
});

// @route   PUT api/status/:statusId/view
// @desc    Mark a status as viewed
router.put('/:statusId/view', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if (!status) {
      return res.status(404).json({ message: 'Status not found' });
    }

    // Check if already viewed
    const alreadyViewed = status.viewers.some(v => v.user.toString() === req.user.id);
    if (!alreadyViewed) {
      status.viewers.push({
        user: req.user.id,
        viewedAt: new Date()
      });
      await status.save();
    }

    const populatedStatus = await Status.findById(status._id)
      .populate('user', 'username displayName avatarUrl')
      .populate('viewers.user', 'username displayName avatarUrl');

    res.json(populatedStatus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating status' });
  }
});

// @route   DELETE api/status/:statusId
// @desc    Delete a status (only owner can delete)
router.delete('/:statusId', auth, async (req, res) => {
  try {
    const status = await Status.findById(req.params.statusId);
    if (!status) {
      return res.status(404).json({ message: 'Status not found' });
    }

    if (status.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to delete this status' });
    }

    await Status.findByIdAndDelete(req.params.statusId);

    res.json({ message: 'Status deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error deleting status' });
  }
});

module.exports = router;
