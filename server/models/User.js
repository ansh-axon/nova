const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true // allows existing users / bots without an email
  },
  password: {
    type: String,
    required: true
  },
  // Email OTP verification + password reset
  isVerified: {
    type: Boolean,
    default: false
  },
  otpCode: { type: String, default: null, select: false },
  otpExpires: { type: Date, default: null, select: false },
  resetCode: { type: String, default: null, select: false },
  resetExpires: { type: Date, default: null, select: false },
  displayName: {
    type: String,
    default: function() {
      return this.username;
    }
  },
  about: {
    type: String,
    default: "Hey there! I am using Nova."
  },
  avatarUrl: {
    type: String, // Store Base64 encoded image
    default: ""
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // E2E Encryption keys
  publicKey: {
    type: String,
    required: true
  },
  secretKey: {
    type: String,
    required: true,
    select: false // Never send secret key in queries by default
  },
  // Device fingerprint for verification
  deviceFingerprint: {
    type: String,
    default: null
  },
  // Expo push notification tokens (one per device the user is logged in on)
  pushTokens: {
    type: [String],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
