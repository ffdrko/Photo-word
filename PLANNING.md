# 📸 SnapNote — Photo-to-Word OCR Note App

> Take a photo of handwritten/printed notes → OCR extracts the text → smart rich formatting → export as a `.docx` file.
> One backend API, two clients: **Web** + **React Native (mobile)**.

---

## 1. Vision

A note-taking app where the user clicks a picture of written content (notebook, whiteboard, printed page), the app performs OCR, intelligently formats the extracted text (headings, bullets, bold), and exports everything into a properly formatted Word document.

---

## 2. Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Web App    │────▶│                  │◀────│ React Native App  │
│ (browser)   │     │   OCR API Server │     │   (mobile)        │
└─────────────┘     ├──────────────────┤     └──────────────────┘
                    │  POST /api/ocr    │
                    │  POST /api/format │
                    │  POST /api/export │
                    │  Tesseract.js     │
                    │  docx library     │
                    └──────────────────┘
```

**Principle:** One brain, two faces. All OCR + formatting logic lives on the server; clients are thin UI layers.

---

## 3. Tech Stack

| Layer      | Technology                              |
|------------|------------------------------------------|
| Backend    | Node.js + Express                        |
| OCR        | `tesseract.js` (server-side)             |
| Doc export | `docx` npm package                       |
| Uploads    | `multer` (multipart/form-data)           |
| Web client | HTML/CSS/JS (or React) — served by Express |
| Mobile     | React Native + `react-native-image-picker` |

---

## 4. API Design

### `POST /api/ocr`
- **Input:** image file (`FormData`, field: `image`), optional `lang`
- **Output:** `{ "rawText": "...", "confidence": 0.92, "lines": [...], "engine": "server" }`

### `POST /api/format`
- **Input:** `{ "lines": [...] }` (preferred) or `{ "rawText": "..." }` (after editing)
- **Output:** structured blocks:
```json
{
  "blocks": [
    { "type": "heading1", "text": "Chapter 1" },
    { "type": "paragraph", "runs": [{ "text": "normal " }, { "text": "bold", "bold": true }] },
    { "type": "bullet", "text": "first point" },
    { "type": "numbered", "text": "step one" }
  ]
}
```

### `POST /api/export`
- **Input:** `{ "blocks": [...], "title": "My Notes" }`
- **Output:** `.docx` binary download

---

## 5. Formatting Heuristics (v1)

| Detected pattern                          | Mapped to       |
|-------------------------------------------|-----------------|
| Short line (< 60 chars) with no ending period | Heading 2   |
| ALL CAPS short line                        | Heading 1       |
| Line starting with `•`, `-`, `*`, `–`      | Bullet list     |
| Line starting with `1.`, `2)` etc.         | Numbered list   |
| Text wrapped in `*...*` or `_..._`         | Bold / Italic   |
| Blank line separated text                  | Paragraph       |
| Lines ending with `:` followed by list     | Heading 3 + list|

---

## 6. Project Structure

```
project/
├── PLANNING.md
├── server/
│   ├── package.json
│   ├── index.js              # Express app entry
│   ├── routes/
│   │   ├── ocr.js
│   │   ├── format.js
│   │   └── export.js
│   ├── services/
│   │   ├── ocrService.js     # tesseract.js wrapper
│   │   ├── formatService.js  # heuristics engine
│   │   └── docxService.js    # blocks → .docx
│   └── uploads/              # temp image storage
└── web/
    ├── index.html            # upload + preview + edit UI
    ├── style.css
    └── app.js
```

The React Native app lives in `mobile/`. It uses ML Kit on-device rather than
calling `/api/ocr`, so the server is only involved in formatting and export.

---

## 7. Development Phases

### Phase 1 — Backend Core ✅ target: day 1–2
- [x] Scaffold Node.js project, install deps
- [x] `/api/ocr` endpoint working with test images
- [x] `/api/format` heuristic engine + unit tests
- [x] `/api/export` producing valid `.docx`
- [x] Persistent Tesseract worker pool; local traineddata

### Phase 2 — Web Frontend ✅ target: day 3–4
- [x] Image upload (file picker + camera capture via `<input capture>`)
- [x] Raw text preview with editable textarea
- [x] Formatted preview (rendered blocks)
- [x] Export button → downloads `.docx`

### Phase 3 — Polish ✅ target: day 5
- [x] Multi-image support (append into one document)
- [x] Error handling & loading states
- [x] Basic styling / dark mode
- [x] Client-side downscaling before upload
- [ ] Editable structured preview (retype a block, not just the text)

### Phase 4 — React Native App ✅ target: week 2
- [x] Init RN project, image picker integration
- [x] Camera capture → on-device OCR
- [x] Preview/edit screen → export/share `.docx`
- [x] Handle Android/iOS file sharing

### Phase 5 — Future Enhancements 💡
- [ ] Handwriting-specific OCR model (e.g., Google Cloud Vision / TrOCR)
- [ ] User accounts + cloud storage of notes
- [ ] PDF export
- [ ] Offline mode (on-device OCR)

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Poor OCR accuracy on handwriting | Start with printed text; add better models later; allow manual editing before export |
| Large image uploads slow | Compress client-side before upload |
| Tesseract language packs size | Load only needed languages (start: `eng`) |
| CORS for mobile client | Enable CORS middleware on Express |

---

## 9. Success Criteria

1. A photo of a printed page converts to a clean `.docx` in under 10 seconds
2. Headings/bullets/bold detected correctly ≥ 80% of the time on clear samples
3. Same API serves both web and mobile without changes
