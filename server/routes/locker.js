const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const LockerFile = require('../models/LockerFile');
const { encryptBuffer, decryptBuffer } = require('../utils/lockerCrypto');

// Files are held in memory briefly, encrypted, then stored in the DB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12 MB per file (DB document limit)
}).single('file');

const toMeta = (f) => ({
  id: f._id,
  name: f.name,
  mimeType: f.mimeType,
  size: f.size,
  addedAt: f.createdAt,
});

// @route GET /api/locker  — list the user's locker files (metadata only)
router.get('/', auth, async (req, res) => {
  try {
    const files = await LockerFile.find({ user: req.user.id })
      .select('-data -nonce')
      .sort({ createdAt: -1 });
    res.json(files.map(toMeta));
  } catch (err) {
    console.error('[Locker] list error:', err);
    res.status(500).json({ message: 'Failed to load locker' });
  }
});

// @route POST /api/locker  — upload a file into the locker
router.post('/', auth, (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ message: err.message });
    if (!req.file) return res.status(400).json({ message: 'No file provided' });
    try {
      const { data, nonce, encrypted } = encryptBuffer(req.file.buffer);
      const doc = await LockerFile.create({
        user: req.user.id,
        name: req.body.name || req.file.originalname || 'file',
        mimeType: req.body.mimeType || req.file.mimetype || 'application/octet-stream',
        size: req.file.size,
        data,
        nonce,
        encrypted,
      });
      res.json(toMeta(doc));
    } catch (e) {
      console.error('[Locker] upload error:', e);
      res.status(500).json({ message: 'Failed to save file to locker' });
    }
  });
});

// @route GET /api/locker/:id  — download a locker file (owner only)
router.get('/:id', auth, async (req, res) => {
  try {
    const f = await LockerFile.findOne({ _id: req.params.id, user: req.user.id })
      .select('+data +nonce');
    if (!f) return res.status(404).json({ message: 'File not found' });
    const buf = decryptBuffer(f.data, f.nonce, f.encrypted);
    res.setHeader('Content-Type', f.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(f.name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  } catch (e) {
    console.error('[Locker] download error:', e);
    res.status(500).json({ message: 'Failed to download file' });
  }
});

// @route DELETE /api/locker/:id  — remove a locker file (owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    await LockerFile.deleteOne({ _id: req.params.id, user: req.user.id });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Locker] delete error:', e);
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

module.exports = router;
