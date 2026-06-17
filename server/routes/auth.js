const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const EncryptionManager = require('../utils/encryption');

const JWT_SECRET = process.env.JWT_SECRET || 'nova_chat_secret_key';

// @route   POST api/auth/register
// @desc    Register a new user with E2E encryption keys
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password' });
  }

  const lowercaseUsername = username.trim().toLowerCase();

  try {
    let user = await User.findOne({ username: lowercaseUsername });
    if (user) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Generate E2E encryption keys
    const encryptionKeys = EncryptionManager.generateKeyPair();

    user = new User({
      username: lowercaseUsername,
      password,
      publicKey: encryptionKeys.publicKey,
      secretKey: encryptionKeys.secretKey
    });

    // Hash password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    await user.save();

    const payload = {
      user: {
        id: user.id,
        username: user.username
      }
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          about: user.about,
          avatarUrl: user.avatarUrl,
          publicKey: user.publicKey
        }
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user and get token
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password' });
  }

  const lowercaseUsername = username.trim().toLowerCase();

  try {
    let user = await User.findOne({ username: lowercaseUsername });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const payload = {
      user: {
        id: user.id,
        username: user.username
      }
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          about: user.about,
          avatarUrl: user.avatarUrl,
          publicKey: user.publicKey
        }
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   GET api/auth/user-keys/:userId
// @desc    Get user's public key for encryption
router.get('/user-keys/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('publicKey username displayName avatarUrl');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
