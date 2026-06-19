const mongoose = require('mongoose');

// A user's private locker file, stored durably in the database (survives app
// reinstalls / new devices). File bytes are encrypted at rest and are never
// returned unless explicitly downloaded by the owner.
const LockerFileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: { type: String, required: true },
  mimeType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  // Encrypted file bytes (or plaintext if no LOCKER_SECRET configured).
  data: { type: Buffer, required: true, select: false },
  nonce: { type: String, default: null, select: false },
  encrypted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('LockerFile', LockerFileSchema);
