const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { runOcr, DEFAULT_LANG } = require('../services/ocrService');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// POST /api/ocr  (FormData field: "image")
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded (field name must be "image")' });
  }
  try {
    const lang = req.body.lang || DEFAULT_LANG;
    const result = await runOcr(req.file.path, lang);
    res.json(result); // { rawText, confidence, lines, engine }
  } catch (err) {
    console.error('OCR failed:', err);
    res.status(500).json({ error: 'OCR processing failed', details: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

module.exports = router;
