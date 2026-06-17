const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Group chat properties
  isGroup: {
    type: Boolean,
    default: false
  },
  groupName: {
    type: String,
    default: null
  },
  groupIcon: {
    type: String,
    default: null
  },
  groupAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // E2E Encryption for groups
  groupEncryptionKey: {
    type: String,
    default: null
  },
  // Last message in conversation
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Group metadata
  description: String,
  maxParticipants: {
    type: Number,
    default: 15
  },
  // Mute notifications
  mutedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Participant status
  participantStatus: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: Date,
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    }
  }]
}, { timestamps: true });

// Validate max participants for groups
ConversationSchema.pre('save', function(next) {
  if (this.isGroup && this.participants.length > this.maxParticipants) {
    return next(new Error(`Group cannot have more than ${this.maxParticipants} participants`));
  }
  next();
});

module.exports = mongoose.model('Conversation', ConversationSchema);
