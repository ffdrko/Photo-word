/**
 * Heuristic formatting engine: raw OCR text -> structured blocks.
 *
 * Block types:
 *  - { type: 'heading1'|'heading2'|'heading3', text }
 *  - { type: 'paragraph'|'bullet'|'numbered', runs: [{ text, bold?, italic? }] }
 */

const BULLET_RE = /^\s*[•\-*–—]\s+/;
const NUMBERED_RE = /^\s*\d{1,2}[.)]\s+/;
const INLINE_EMPHASIS_RE = /(\*[^*]+\*|_[^_]+_)/g;

/** Parse inline *bold* / _italic_ markers into runs. */
function parseRuns(line) {
  const runs = [];
  let lastIndex = 0;
  for (const match of line.matchAll(INLINE_EMPHASIS_RE)) {
    if (match.index > lastIndex) {
      runs.push({ text: line.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith('*')) runs.push({ text: token.slice(1, -1), bold: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) runs.push({ text: line.slice(lastIndex) });
  return runs.length ? runs : [{ text: line }];
}

function stripBullet(line) {
  return line.replace(BULLET_RE, '');
}
function stripNumber(line) {
  return line.replace(NUMBERED_RE, '');
}

/**
 * @param {string} rawText
 * @returns {Array<object>} blocks
 */
function formatText(rawText) {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const blocks = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // skip blank lines

    // Bullets
    if (BULLET_RE.test(line)) {
      blocks.push({ type: 'bullet', runs: parseRuns(stripBullet(line)) });
      continue;
    }

    // Numbered lists
    if (NUMBERED_RE.test(line)) {
      blocks.push({ type: 'numbered', runs: parseRuns(stripNumber(line)) });
      continue;
    }

    // Heading 1: ALL CAPS short line
    const lettersOnly = line.replace(/[^a-zA-Z]/g, '');
    if (lettersOnly.length >= 3 && lettersOnly === lettersOnly.toUpperCase() && line.length <= 60) {
      blocks.push({ type: 'heading1', text: line });
      continue;
    }

    // Heading 2/3: short line ending with ':' or a short standalone line
    if (line.endsWith(':') && line.length <= 70) {
      blocks.push({ type: 'heading3', text: line.replace(/:$/, '') });
      continue;
    }
    if (line.length <= 45 && !/[.!?]$/.test(line)) {
      // Look ahead: heading if next non-empty line exists (i.e., it's a title-ish fragment)
      blocks.push({ type: 'heading2', text: line });
      continue;
    }

    // Otherwise paragraph — merge wrapped lines (next line not starting a new block and lowercase start)
    let paragraph = line;
    while (
      i + 1 < lines.length &&
      lines[i + 1] &&
      !BULLET_RE.test(lines[i + 1]) &&
      !NUMBERED_RE.test(lines[i + 1]) &&
      /^[a-z(]/.test(lines[i + 1])
    ) {
      i++;
      paragraph += ' ' + lines[i];
    }
    blocks.push({ type: 'paragraph', runs: parseRuns(paragraph) });
  }

  return blocks;
}

module.exports = { formatText };
