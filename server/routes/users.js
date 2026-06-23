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

// @route   POST api/users/fcm-debug
// @desc    Receive a client FCM-registration diagnostic string (for debugging)
router.post('/fcm-debug', auth, (req, res) => {
  const detail = String(req.body?.detail || '').slice(0, 400);
  console.log(`[FCM-DEBUG] user ${req.user.id}: ${detail}`);
  res.json({ ok: true });
});

// @route   POST api/users/call-ringtone
// @desc    Save the user's chosen incoming-call ringtone id (per-tone channel)
router.post('/call-ringtone', auth, async (req, res) => {
  const { ringtone } = req.body;
  if (typeof ringtone !== 'string') {
    return res.status(400).json({ message: 'ringtone id is required' });
  }
  try {
    await User.findByIdAndUpdate(req.user.id, { callRingtone: ringtone.trim().slice(0, 40) });
    res.json({ message: 'Call ringtone saved' });
  } catch (err) {
    console.error('[FCM] call-ringtone error:', err.message);
    res.status(500).json({ message: 'Server error saving call ringtone' });
  }
});

// @route   POST api/users/fcm-token
// @desc    Register a native FCM device token (for incoming-call data messages)
router.post('/fcm-token', auth, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ message: 'A valid FCM token is required' });
  }
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { fcmTokens: token.trim() } });
    console.log(`[FCM] token registered for user ${req.user.id} (…${token.trim().slice(-8)})`);
    res.json({ message: 'FCM token registered' });
  } catch (err) {
    console.error('[FCM] register token error:', err.message);
    res.status(500).json({ message: 'Server error registering FCM token' });
  }
});

// @route   POST api/users/fcm-token/remove
// @desc    Remove a native FCM device token (called on logout)
router.post('/fcm-token/remove', auth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.json({ message: 'Nothing to remove' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { fcmTokens: token.trim() } });
    res.json({ message: 'FCM token removed' });
  } catch (err) {
    console.error('[FCM] remove token error:', err.message);
    res.status(500).json({ message: 'Server error removing FCM token' });
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

// @route   POST api/users/block
// @desc    Block a user (they can no longer message you, nor you them)
router.post('/block', auth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is required' });
  if (userId === req.user.id) return res.status(400).json({ message: 'You cannot block yourself' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: userId } });
    res.json({ message: 'User blocked' });
  } catch (err) {
    console.error('[BLOCK] error:', err.message);
    res.status(500).json({ message: 'Server error blocking user' });
  }
});

// @route   POST api/users/unblock
// @desc    Unblock a previously-blocked user
router.post('/unblock', auth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is required' });
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: userId } });
    res.json({ message: 'User unblocked' });
  } catch (err) {
    console.error('[UNBLOCK] error:', err.message);
    res.status(500).json({ message: 'Server error unblocking user' });
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
