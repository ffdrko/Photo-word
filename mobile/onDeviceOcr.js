// On-device OCR using ML Kit (Google's engine on Android, Apple Vision on iOS).
// Runs fully offline on the device NPU — much better for handwriting than server Tesseract.
import TextRecognition from '@react-native-ml-kit/text-recognition';

/**
 * Recognize text in a local image entirely on-device.
 * @param {string} uri - local file:// uri from image picker
 * @returns {Promise<{rawText: string, confidence: number|null, engine: 'on-device'}>}
 */
export async function ocrOnDevice(uri) {
  const result = await TextRecognition.recognize(uri);
  return {
    rawText: (result.text || '').trim(),
    confidence: null, // ML Kit doesn't expose a single overall confidence
    engine: 'on-device',
  };
}
