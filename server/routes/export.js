const express = require('express');
const { buildDocx } = require('../services/docxService');

const router = express.Router();

// POST /api/export  { blocks: [...], title: "My Notes" }
router.post('/', async (req, res) => {
  const { blocks, title } = req.body;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return res.status(400).json({ error: 'blocks (non-empty array) is required' });
  }
  try {
    const buffer = await buildDocx(blocks, title || 'Notes');
    const safeName = (title || 'notes').replace(/[^a-z0-9 _-]/gi, '').trim() || 'notes';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.docx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('Export failed:', err);
    res.status(500).json({ error: 'DOCX generation failed', details: err.message });
  }
});

module.exports = router;
