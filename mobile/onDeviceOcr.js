// On-device text recognition via Google ML Kit (same engine on Android and iOS).
// Runs fully offline, and unlike the server path it costs no upload.
//
// Note: ML Kit's text recognizer is trained on printed text. It handles neat
// handwriting reasonably and cursive poorly, which is why the review step
// before export matters.
import TextRecognition from '@react-native-ml-kit/text-recognition';

/**
 * Recognize text in a local image entirely on-device.
 *
 * Returns the shared LayoutDoc shape: line boxes are what lets the server
 * classify headings and paragraph wraps by geometry instead of guessing from
 * string length, so we keep them rather than flattening to plain text.
 *
 * @param {string} uri local file:// uri from the image picker
 */
export async function ocrOnDevice(uri) {
  const result = await TextRecognition.recognize(uri);

  const lines = [];
  (result.blocks || []).forEach((block, blockIndex) => {
    (block.lines || []).forEach((line) => {
      const text = (line.text || '').trim();
      if (!text) return;
      const f = line.frame || {};
      lines.push({
        text,
        block: blockIndex,
        left: f.left,
        top: f.top,
        width: f.width,
        height: f.height,
      });
    });
  });

  return {
    rawText: (result.text || '').trim(),
    lines,
    confidence: null, // ML Kit exposes no overall confidence score
    engine: 'on-device',
  };
}

/** True when the native module simply isn't linked (Expo Go, missing rebuild). */
export function isUnavailableError(err) {
  return /doesn't seem to be linked|null is not an object|undefined is not an object/i.test(
    String(err && err.message)
  );
}
