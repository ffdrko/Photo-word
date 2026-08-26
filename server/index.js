const express = require('express');
const cors = require('cors');
const path = require('path');

const ocrRoute = require('./routes/ocr');
const formatRoute = require('./routes/format');
const exportRoute = require('./routes/export');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the web frontend
app.use(express.static(path.join(__dirname, '..', 'web')));

// API routes
app.use('/api/ocr', ocrRoute);
app.use('/api/format', formatRoute);
app.use('/api/export', exportRoute);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`SnapNote server running at http://localhost:${PORT}`);
});
