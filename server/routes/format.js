const express = require('express');
const { formatText } = require('../services/formatService');

const router = express.Router();

// POST /api/format  { rawText: "..." }
router.post('/', (req, res) => {
  const { rawText } = req.body;
  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText (string) is required' });
  }
  res.json({ blocks: formatText(rawText) });
});

module.exports = router;
