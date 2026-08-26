// SnapNote API client — points to your computer's SnapNote server.
// Replace with your PC's local IP (find it with `ipconfig`), e.g. http://192.168.1.5:3000
import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2 to reach host machine; real devices need the LAN IP.
export const API_URL = 'http://192.168.0.199:3000'; // PC's Wi-Fi IP — update if your network changes

/**
 * Upload an image and OCR it.
 * @param {string} uri - local file uri from image picker
 * @returns {Promise<{rawText: string, confidence: number|null}>}
 */
export async function ocrImage(uri) {
  const formData = new FormData();
  formData.append('image', {
    uri,
    name: 'photo.jpg',
    type: 'image/jpeg',
  });

  const res = await fetch(`${API_URL}/api/ocr`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OCR failed');
  return data;
}

/**
 * Send raw text for heuristic formatting.
 * @param {string} rawText
 * @returns {Promise<Array>} blocks
 */
export async function formatText(rawText) {
  const res = await fetch(`${API_URL}/api/format`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Formatting failed');
  return data.blocks;
}

/**
 * Export blocks as .docx; returns the downloaded file URI.
 * @param {Array} blocks
 * @param {string} title
 * @param {string} fileUri - destination file uri in app cache
 * @returns {Promise<string>} fileUri of written docx
 */
export async function exportDocx(blocks, title, fileUri) {
  const res = await fetch(`${API_URL}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks, title }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  const blob = await res.blob();
  // Write via FileSystem passed in to avoid circular import
  const { writeAsStringAsync, EncodingType } = require('expo-file-system');
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
  return fileUri;
}
