# 📱 SnapNote Mobile (React Native + Expo)

Mobile client for the SnapNote OCR API. Photograph your notes, extract text, and share a formatted `.docx`.

## Prerequisites

1. **SnapNote server running** on your computer:
   ```
   cd ../server
   node index.js
   ```
2. **Expo Go app** installed on your phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779))

## Setup

```bash
cd mobile
npm install
```

### ⚠️ Configure the API URL (required for real phones)

Open `api.js` and set `API_URL` to your **computer's local IP**:

```js
export const API_URL = 'http://192.168.1.XX:3000'; // find with `ipconfig`
```

- **Android emulator:** `http://10.0.2.2:3000` works automatically
- **Real phone:** must use LAN IP, and phone + PC must be on the same Wi-Fi

## OCR engines

SnapNote uses a two-tier OCR strategy:

1. **On-device (preferred)** — `@react-native-ml-kit/text-recognition`:
   - iOS wraps **Apple Vision** (same engine as Live Text) → runs on the Neural Engine, excellent for handwriting
   - Android uses **Google ML Kit** v2 text recognition
   - Fully offline, free, private — images never leave the phone
2. **Server fallback** — Tesseract.js via `/api/ocr`, used automatically when the native module is unavailable (e.g., running in Expo Go)

> Because the app includes native modules, it must run as a **development build**, not in Expo Go.

## Run (development build)

One-time native compile (requires Android Studio / Xcode):

```bash
npm run prebuild        # generates android/ and ios/ folders
npm run android         # build & install on Android device/emulator
# or
npm run ios             # build & install on iOS simulator/device (macOS only)
```

Then start the JS dev server (hot reload works as usual):

```bash
npm start               # expo start --dev-client
```

### No Android Studio/Xcode? Use EAS Build (cloud)

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```
Install the resulting APK on your phone, then `npm start` and connect.

## Features

- 📷 Camera capture or gallery multi-select
- 🧠 On-device OCR (Apple Vision / ML Kit) with server Tesseract fallback
- ✏️ Editable extracted text before formatting
- 👁 Live preview of headings/bullets/bold
- ⬇️ Export `.docx` → native share sheet (save to Files, send via email/WhatsApp, etc.)

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Network request failed | Check API_URL matches PC's IP; same Wi-Fi network |
| Windows Firewall blocks it | Allow inbound port 3000 for Node.js |
| Camera permission denied | Re-enable in phone Settings → Expo Go |
