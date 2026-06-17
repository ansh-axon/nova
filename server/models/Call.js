const mongoose = require('mongoose');

const CallSchema = new mongoose.Schema({
  caller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // For group calls
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    default: null
  },
  callType: {
    type: String,
    enum: ['voice', 'video'],
    default: 'voice'
  },
  status: {
    type: String,
    enum: ['ringing', 'accepted', 'rejected', 'missed', 'ended'],
    default: 'ringing'
  },
  // WebRTC signal server URLs
  signalingServer: String,
  // Call room ID for WebRTC
  callRoomId: String,
  // Duration of call in seconds
  duration: {
    type: Number,
    default: 0
  },
  // Call metrics
  callQuality: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: null
  },
  // Connection diagnostics
  connectionStats: {
    audioCodec: String,
    videoCodec: String,
    networkType: String, // wifi, cellular, etc
    bitrate: Number, // in kbps
    packetLoss: Number, // percentage
    latency: Number // in ms
  },
  // Timestamps
  startedAt: Date,
  endedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Call', CallSchema);
