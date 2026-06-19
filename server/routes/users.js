const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

// @route   GET api/users
// @desc    Get all users (except current user) for starting a chat
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('-password')
      .sort({ displayName: 1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST api/users/push-token
// @desc    Register an Expo push token for the authenticated user's device
router.post('/push-token', auth, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'A valid push token is required' });
  }
  try {
    // addToSet avoids duplicate tokens; keep the list bounded to a few devices.
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { pushTokens: token.trim() } });
    res.json({ message: 'Push token registered' });
  } catch (err) {
    console.error('[PUSH] register token error:', err.message);
    res.status(500).json({ message: 'Server error registering push token' });
  }
});

// @route   POST api/users/push-token/remove
// @desc    Remove an Expo push token (called on logout)
router.post('/push-token/remove', auth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ message: 'Nothing to remove' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { pushTokens: token.trim() } });
    res.json({ message: 'Push token removed' });
  } catch (err) {
    console.error('[PUSH] remove token error:', err.message);
    res.status(500).json({ message: 'Server error removing push token' });
  }
});

// @route   GET api/users/me
// @desc    Get current user details
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT api/users/profile
// @desc    Update user profile (display name, about, avatar Base64)
router.put('/profile', auth, async (req, res) => {
  const { displayName, about, avatarUrl } = req.body;

  // Guard against oversized / abusive payloads (avatar is stored as base64 in DB).
  if (typeof displayName === 'string' && displayName.length > 100) {
    return res.status(400).json({ message: 'Display name is too long (max 100 characters).' });
  }
  if (typeof about === 'string' && about.length > 300) {
    return res.status(400).json({ message: 'About is too long (max 300 characters).' });
  }
  if (typeof avatarUrl === 'string' && avatarUrl.length > 3_000_000) {
    return res.status(400).json({ message: 'Avatar image is too large. Please choose a smaller image.' });
  }

  const updateFields = {};
  if (displayName !== undefined) updateFields.displayName = displayName;
  if (about !== undefined) updateFields.about = about;
  if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

module.exports = router;
