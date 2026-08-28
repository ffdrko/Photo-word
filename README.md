# 📸 SnapNote — photo to Word

Photograph handwritten or printed notes, extract the text, apply formatting, and
export a `.docx`. One backend, two clients: web and React Native.

## How it works

```
capture → downscale → OCR → LayoutDoc → classify → review → export
```

OCR returns **lines with bounding boxes**, not just a string. Headings are
detected from line height relative to the page median, and paragraph wraps from
whether a line reaches its column's right edge. That is far more reliable than
guessing from string length, which mistakes every wrapped line for a heading.

| Client | OCR engine | Runs |
| ------ | ---------- | ---- |
| Mobile | Google ML Kit | On device, offline |
| Web    | Tesseract.js | Server, pooled workers |

Both normalize to the same shape, so `/api/format` works identically for either:

```js
{ lines: [{ text, block, top, left, width, height }] }
```

## Running it

```bash
cd server && npm install && npm start   # http://localhost:3000
npm test                                # formatting heuristics
```

The web client is served by the same Express app. For mobile:

```bash
cd mobile && npm install
npx expo prebuild && npx expo run:android   # or run:ios
```

ML Kit needs native code, so Expo Go will not work — use a dev client. Set the
backend address in `app.json` under `expo.extra.apiUrl`; if you leave it null
the app falls back to the machine serving Metro, which is usually correct
during development.

## API

| Route | Body | Returns |
| ----- | ---- | ------- |
| `POST /api/ocr` | `FormData` field `image`, optional `lang` | `{ rawText, confidence, lines, engine }` |
| `POST /api/format` | `{ lines }` or `{ rawText }` | `{ blocks, source }` |
| `POST /api/export` | `{ blocks, title }` | `.docx` download |

Block types: `heading1`, `heading2`, `heading3`, `paragraph`, `bullet`,
`numbered`. Headings carry `text`; the rest carry `runs` with `bold` / `italic`.

## Configuration

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `3000` | Server port |
| `OCR_WORKERS` | `2` | Tesseract workers per language |
| `OCR_LANG` | `eng` | Default language code |
| `CORS_ORIGIN` | open | Comma-separated allowlist |

Drop a `<lang>.traineddata` file in `server/` and it is used directly instead of
being fetched from the CDN, which also lets the server run with no internet.

## Known limits

- ML Kit's recognizer is trained on **printed** text. Neat handwriting works;
  cursive does not. The review step before export exists for this reason.
- ML Kit covers Latin, Chinese, Devanagari, Japanese and Korean. For anything
  else, use the server Tesseract path with a `lang` parameter.
- Editing the recognized text discards the line boxes, so formatting falls back
  to the text-only parser for that run.
