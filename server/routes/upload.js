const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const auth = require('../middleware/auth');

// Disk Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter: allow common media/docs, but BLOCK types that can execute in a
// browser context (HTML/SVG/XHTML) since /uploads is publicly served — this
// prevents stored-XSS via a malicious "image".
const BLOCKED_MIME = new Set([
  'text/html', 'application/xhtml+xml', 'image/svg+xml',
  'application/xml', 'text/xml', 'application/x-msdownload',
  'application/javascript', 'text/javascript',
]);
const BLOCKED_EXT = new Set([
  '.html', '.htm', '.xhtml', '.svg', '.xml', '.js', '.mjs', '.exe', '.bat', '.sh', '.htaccess',
]);

const fileFilter = (req, file, cb) => {
  const mimetype = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (BLOCKED_MIME.has(mimetype) || BLOCKED_EXT.has(ext)) {
    return cb(new Error('This file type is not allowed for security reasons.'), false);
  }

  const allowedPrefixes = ['image/', 'video/', 'audio/', 'text/', 'application/'];
  const isAllowed = allowedPrefixes.some(prefix => mimetype.startsWith(prefix));

  if (isAllowed) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and standard documents are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: fileFilter
}).single('media');

// POST /api/upload/media
router.post('/media', auth, (req, res) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading.
      return res.status(400).json({ message: `Multer upload error: ${err.message}` });
    } else if (err) {
      // An unknown error occurred when uploading.
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a file' });
    }

    // Success! Return file details
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      url: fileUrl,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size
    });
  });
});

module.exports = router;
