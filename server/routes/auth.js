const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const EncryptionManager = require('../utils/encryption');
const { sendCodeEmail, generateCode } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'nova_chat_secret_key';
const CODE_TTL_MS = 10 * 60 * 1000; // codes expire in 10 minutes

// Issues a signed JWT and returns the standard auth payload
function issueAuth(user) {
  const payload = { user: { id: user.id, username: user.username } };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      about: user.about,
      avatarUrl: user.avatarUrl,
      publicKey: user.publicKey
    }
  };
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// @route   POST api/auth/register
// @desc    Register a new user, then email a verification OTP (no login until verified)
router.post('/register', async (req, res) => {
  const { username, password, email, deviceId } = req.body;

  if (!username || !password || !email) {
    return res.status(400).json({ message: 'Username, email and password are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }

  const lowercaseUsername = username.trim().toLowerCase();
  const lowercaseEmail = email.trim().toLowerCase();

  try {
    const existing = await User.findOne({ username: lowercaseUsername });
    if (existing) {
      // Allow re-sending OTP if the existing account is unverified and matches
      if (!existing.isVerified) {
        return res.status(409).json({ message: 'Account exists but is not verified. Please verify with the code sent to your email.', needsVerification: true, email: existing.email });
      }
      return res.status(400).json({ message: 'Username already exists' });
    }

    const emailTaken = await User.findOne({ email: lowercaseEmail });
    if (emailTaken) {
      return res.status(400).json({ message: 'An account with this email already exists' });
    }

    // Enforce one account per device
    if (deviceId) {
      const existingDeviceUser = await User.findOne({ deviceFingerprint: deviceId });
      if (existingDeviceUser) {
        return res.status(403).json({ message: 'This device is already registered to an account. Only one account is allowed per device.' });
      }
    }

    const encryptionKeys = EncryptionManager.generateKeyPair();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const code = generateCode();

    const user = new User({
      username: lowercaseUsername,
      email: lowercaseEmail,
      password: hashedPassword,
      publicKey: encryptionKeys.publicKey,
      secretKey: encryptionKeys.secretKey,
      deviceFingerprint: deviceId || null,
      isVerified: false,
      otpCode: code,
      otpExpires: new Date(Date.now() + CODE_TTL_MS)
    });

    await user.save();
    await sendCodeEmail(lowercaseEmail, code, 'verify');

    res.json({ message: 'Verification code sent to your email.', needsVerification: true, email: lowercaseEmail, username: lowercaseUsername });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   POST api/auth/verify-otp
// @desc    Verify the email OTP and activate the account (returns token)
router.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: 'Email and code are required' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+otpCode +otpExpires');
    if (!user) {
      return res.status(404).json({ message: 'Account not found' });
    }
    if (user.isVerified) {
      return res.json(issueAuth(user));
    }
    if (!user.otpCode || !user.otpExpires || user.otpExpires < new Date()) {
      return res.status(400).json({ message: 'Code has expired. Please request a new one.' });
    }
    if (user.otpCode !== String(code).trim()) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    user.isVerified = true;
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();

    res.json(issueAuth(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

// @route   POST api/auth/resend-otp
// @desc    Resend a verification code
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+otpCode +otpExpires');
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isVerified) return res.status(400).json({ message: 'Account is already verified. Please log in.' });

    const code = generateCode();
    user.otpCode = code;
    user.otpExpires = new Date(Date.now() + CODE_TTL_MS);
    await user.save();
    await sendCodeEmail(user.email, code, 'verify');

    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error resending code' });
  }
});

// @route   POST api/auth/login
// @desc    Authenticate user; blocks unverified accounts
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Please enter username and password' });
  }

  const lowercaseUsername = username.trim().toLowerCase();

  try {
    // Allow login by username OR email for convenience
    const user = await User.findOne({
      $or: [{ username: lowercaseUsername }, { email: lowercaseUsername }]
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Please verify your email before logging in.', needsVerification: true, email: user.email });
    }

    res.json(issueAuth(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   POST api/auth/forgot-password
// @desc    Email a password reset code
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    // Always respond success to avoid leaking which emails exist
    if (user) {
      const code = generateCode();
      user.resetCode = code;
      user.resetExpires = new Date(Date.now() + CODE_TTL_MS);
      await user.save();
      await sendCodeEmail(user.email, code, 'reset');
    }
    res.json({ message: 'If an account exists for that email, a reset code has been sent.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error sending reset code' });
  }
});

// @route   POST api/auth/reset-password
// @desc    Reset password using the emailed code
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ message: 'Email, code and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+resetCode +resetExpires');
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (!user.resetCode || !user.resetExpires || user.resetExpires < new Date()) {
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }
    if (user.resetCode !== String(code).trim()) {
      return res.status(400).json({ message: 'Invalid reset code' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetCode = null;
    user.resetExpires = null;
    // A successful reset also verifies ownership of the email
    user.isVerified = true;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error resetting password' });
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
