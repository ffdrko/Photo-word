const path = require('path');
const fs = require('fs');
const { createScheduler, createWorker } = require('tesseract.js');

const WORKER_COUNT = Number(process.env.OCR_WORKERS) || 2;
const DEFAULT_LANG = process.env.OCR_LANG || 'eng';

// Language data shipped next to the server is used when present: it avoids a
// ~5MB CDN fetch on first use and lets the server run with no internet at all.
const LANG_DIR = path.join(__dirname, '..');
const hasLocal = (lang) => fs.existsSync(path.join(LANG_DIR, `${lang}.traineddata`));

// One scheduler per language. Spawning workers is the expensive part of OCR,
// so they are created once and reused across requests.
const pools = new Map();

function pool(lang) {
  if (!pools.has(lang)) {
    pools.set(
      lang,
      (async () => {
        const scheduler = createScheduler();
        const options = hasLocal(lang) ? { langPath: LANG_DIR, gzip: false } : {};
        const workers = await Promise.all(
          Array.from({ length: WORKER_COUNT }, () => createWorker(lang, undefined, options))
        );
        workers.forEach((w) => scheduler.addWorker(w));
        return scheduler;
      })().catch((err) => {
        pools.delete(lang); // let the next request retry instead of caching the failure
        throw err;
      })
    );
  }
  return pools.get(lang);
}

/** Warm the default pool at boot so the first request doesn't pay for it. */
const start = (lang = DEFAULT_LANG) => pool(lang);

async function stop() {
  const schedulers = [...pools.values()];
  pools.clear();
  await Promise.all(
    schedulers.map((p) => p.then((s) => s.terminate()).catch(() => {}))
  );
}

/**
 * Flatten Tesseract's page tree into the shared LayoutDoc line shape.
 * Boxes are in image pixels, matching what ML Kit returns on mobile.
 */
function toLines(data) {
  const lines = [];
  (data.blocks || []).forEach((block, blockIndex) => {
    (block.paragraphs || []).forEach((para) => {
      (para.lines || []).forEach((line) => {
        const text = (line.text || '').trim();
        if (!text) return;
        const b = line.bbox || {};
        lines.push({
          text,
          block: blockIndex,
          left: b.x0,
          top: b.y0,
          width: b.x1 - b.x0,
          height: b.y1 - b.y0,
        });
      });
    });
  });
  return lines;
}

/**
 * Run OCR on an image file.
 * @param {string} imagePath
 * @param {string} lang tesseract language code
 * @returns {Promise<{rawText: string, confidence: number|null, lines: Array, engine: string}>}
 */
async function runOcr(imagePath, lang = DEFAULT_LANG) {
  const scheduler = await pool(lang);
  const { data } = await scheduler.addJob('recognize', imagePath);
  return {
    rawText: (data.text || '').trim(),
    confidence: typeof data.confidence === 'number' ? data.confidence / 100 : null,
    lines: toLines(data),
    engine: 'server',
  };
}

module.exports = { runOcr, start, stop, DEFAULT_LANG };
