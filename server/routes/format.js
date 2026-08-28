const express = require('express');
const { formatLayout, formatText } = require('../services/formatService');

const router = express.Router();

// POST /api/format
//   { lines: [...] }    preferred - geometry from the OCR engine
//   { rawText: "..." }  fallback  - hand-edited text, geometry lost
router.post('/', (req, res) => {
  const { lines, rawText, pageWidth, pageHeight } = req.body || {};

  if (Array.isArray(lines) && lines.length) {
    return res.json({ blocks: formatLayout({ lines, pageWidth, pageHeight }), source: 'layout' });
  }
  if (typeof rawText === 'string' && rawText.trim()) {
    return res.json({ blocks: formatText(rawText), source: 'text' });
  }
  res.status(400).json({ error: 'Provide either lines (array) or rawText (string)' });
});

module.exports = router;
