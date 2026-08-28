// SnapNote API client.
//
// The server is only needed for formatting and .docx export; OCR runs on the
// device. Point API_URL at whichever machine runs `npm start` in ../server.
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolution order:
//   1. extra.apiUrl in app.json (or EXPO_PUBLIC_API_URL at build time)
//   2. the host serving Metro, which is usually the same dev machine
//   3. the Android emulator's alias for the host, or localhost on iOS
function resolveApiUrl() {
  const configured =
    Constants.expoConfig?.extra?.apiUrl || process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri || Constants.expoGoConfig?.debuggerHost;
  const host = hostUri && hostUri.split(':')[0];
  if (host) return `http://${host}:3000`;

  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export let API_URL = resolveApiUrl();

/** Override at runtime from a settings screen. */
export function setApiUrl(url) {
  API_URL = String(url).replace(/\/$/, '');
  return API_URL;
}

async function readError(res, fallback) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

/**
 * Server-side OCR. Only used when on-device recognition is unavailable, or for
 * scripts ML Kit doesn't support (it covers Latin, Chinese, Devanagari,
 * Japanese and Korean; Tesseract covers many more).
 */
export async function ocrImage(uri, lang) {
  const formData = new FormData();
  formData.append('image', { uri, name: 'photo.jpg', type: 'image/jpeg' });
  if (lang) formData.append('lang', lang);

  const res = await fetch(`${API_URL}/api/ocr`, { method: 'POST', body: formData });
  if (!res.ok) throw await readError(res, 'OCR failed');
  return res.json();
}

/**
 * Turn OCR output into structured blocks.
 * Pass `lines` when geometry is available; pass `rawText` after the user has
 * edited the text, since editing invalidates the line boxes.
 */
export async function formatBlocks({ lines, rawText }) {
  const res = await fetch(`${API_URL}/api/format`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lines && lines.length ? { lines } : { rawText }),
  });
  if (!res.ok) throw await readError(res, 'Formatting failed');
  const data = await res.json();
  return data.blocks;
}

/** Export blocks as .docx, writing the file to `fileUri`. Returns that uri. */
export async function exportDocx(blocks, title, fileUri) {
  const res = await fetch(`${API_URL}/api/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks, title }),
  });
  if (!res.ok) throw await readError(res, 'Export failed');

  const blob = await res.blob();
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
