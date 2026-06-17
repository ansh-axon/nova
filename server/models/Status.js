const mongoose = require('mongoose');

const StatusSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Status type: image, video, or text
  statusType: {
    type: String,
    enum: ['image', 'video', 'text'],
    default: 'image'
  },
  // Media URL or text content
  mediaUrl: String,
  textContent: String,
  textColor: String,
  backgroundColor: String,
  // Who can view this status
  viewers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: Date
  }],
  // Privacy settings
  privacy: {
    type: String,
    enum: ['public', 'contacts', 'private'],
    default: 'contacts'
  },
  // Auto-delete after 24 hours
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
    index: { expireAfterSeconds: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('Status', StatusSchema);
