const { createWorker } = require('tesseract.js');

/**
 * Run OCR on an image file.
 * @param {string} imagePath
 * @param {string} lang - tesseract language code, e.g. 'eng'
 * @returns {Promise<{rawText: string, confidence: number}>}
 */
async function runOcr(imagePath, lang = 'eng') {
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(imagePath);
    return {
      rawText: (data.text || '').trim(),
      confidence: typeof data.confidence === 'number' ? data.confidence / 100 : null,
    };
  } finally {
    await worker.terminate();
  }
}

module.exports = { runOcr };
