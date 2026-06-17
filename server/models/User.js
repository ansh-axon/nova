const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
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
  }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
