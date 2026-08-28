const express = require('express');
const cors = require('cors');
const path = require('path');

const ocrRoute = require('./routes/ocr');
const formatRoute = require('./routes/format');
const exportRoute = require('./routes/export');
const { start, stop } = require('./services/ocrService');

const app = express();
const PORT = process.env.PORT || 3000;

// Wide open by default for LAN development. Set CORS_ORIGIN before deploying.
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : {}));
app.use(express.json({ limit: '10mb' }));

app.use(express.static(path.join(__dirname, '..', 'web')));

app.use('/api/ocr', ocrRoute);
app.use('/api/format', formatRoute);
app.use('/api/export', exportRoute);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const server = app.listen(PORT, () => {
  console.log(`SnapNote server running at http://localhost:${PORT}`);
  // Spawning Tesseract workers takes seconds, so do it now rather than making
  // the first user wait for it.
  start()
    .then(() => console.log('OCR workers ready'))
    .catch((err) => console.error('OCR warmup failed, will retry on first request:', err.message));
});

async function shutdown() {
  server.close();
  await stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
