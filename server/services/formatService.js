/**
 * Turns OCR output into structured blocks.
 *
 * Two entry points:
 *   formatLayout(doc)  - preferred. Uses line geometry (bounding boxes) from
 *                        the OCR engine to decide headings and paragraph wraps.
 *   formatText(raw)    - fallback for hand-edited text, where geometry is gone.
 *
 * Block types:
 *   { type: 'heading1'|'heading2'|'heading3', text }
 *   { type: 'paragraph'|'bullet'|'numbered', runs: [{ text, bold?, italic? }] }
 */

const BULLET_RE = /^\s*[•\-*–—]\s+/;
const NUMBERED_RE = /^\s*\d{1,2}[.)]\s+/;
const INLINE_EMPHASIS_RE = /(\*[^*]+\*|_[^_]+_)/g;

// A line counts as "wrapped" if it reaches within this fraction of the
// widest line in its block. Tuned loose because OCR right edges are ragged.
const WRAP_TOLERANCE = 0.08;
const H1_RATIO = 1.35;
const H2_RATIO = 1.15;
// Baseline-to-baseline distance beyond this multiple of the body text height
// means a deliberate gap, not a wrapped line. Normal leading is 1.2-1.5x.
const LEADING_RATIO = 1.8;

function parseRuns(line) {
  const runs = [];
  let lastIndex = 0;
  for (const match of line.matchAll(INLINE_EMPHASIS_RE)) {
    if (match.index > lastIndex) runs.push({ text: line.slice(lastIndex, match.index) });
    const token = match[0];
    if (token.startsWith('*')) runs.push({ text: token.slice(1, -1), bold: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < line.length) runs.push({ text: line.slice(lastIndex) });
  return runs.length ? runs : [{ text: line }];
}

const stripBullet = (l) => l.replace(BULLET_RE, '');
const stripNumber = (l) => l.replace(NUMBERED_RE, '');

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isAllCaps(text) {
  const letters = text.replace(/[^a-zA-Z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/**
 * Geometry-driven classification.
 *
 * @param {{ lines: Array<{text,block,top,left,width,height}>, pageWidth?: number }} doc
 * @returns {Array<object>} blocks
 */
function formatLayout(doc) {
  const lines = (doc.lines || [])
    .map((l) => ({ ...l, text: (l.text || '').trim() }))
    .filter((l) => l.text);

  if (!lines.length) return [];

  // Without usable box heights there is nothing to reason about; fall back.
  const heights = lines.map((l) => l.height).filter((h) => typeof h === 'number' && h > 0);
  if (heights.length < lines.length) {
    return formatText(lines.map((l) => l.text).join('\n'));
  }

  const bodyHeight = median(heights);

  // Widest right edge per block tells us where the text column actually ends,
  // which is what distinguishes a wrapped line from a line that simply stopped.
  const blockRight = new Map();
  for (const l of lines) {
    const right = l.left + l.width;
    const key = l.block ?? 0;
    if (!blockRight.has(key) || right > blockRight.get(key)) blockRight.set(key, right);
  }

  const classified = lines.map((l) => {
    const key = l.block ?? 0;
    const right = l.left + l.width;
    const columnRight = blockRight.get(key);
    const ratio = bodyHeight ? l.height / bodyHeight : 1;

    let type;
    if (BULLET_RE.test(l.text)) type = 'bullet';
    else if (NUMBERED_RE.test(l.text)) type = 'numbered';
    else if (ratio >= H1_RATIO || (isAllCaps(l.text) && ratio >= H2_RATIO)) type = 'heading1';
    else if (ratio >= H2_RATIO) type = 'heading2';
    else if (l.text.endsWith(':') && l.text.length <= 70) type = 'heading3';
    else type = 'paragraph';

    // Reaches the column edge => the line broke because it ran out of room.
    const wrapped = columnRight > 0 && right >= columnRight - columnRight * WRAP_TOLERANCE;

    return { ...l, type, wrapped, blockKey: key };
  });

  const blocks = [];
  for (let i = 0; i < classified.length; i++) {
    const line = classified[i];

    if (line.type === 'heading1' || line.type === 'heading2') {
      blocks.push({ type: line.type, text: line.text });
      continue;
    }
    if (line.type === 'heading3') {
      blocks.push({ type: 'heading3', text: line.text.replace(/:$/, '') });
      continue;
    }
    if (line.type === 'bullet') {
      blocks.push({ type: 'bullet', runs: parseRuns(stripBullet(line.text)) });
      continue;
    }
    if (line.type === 'numbered') {
      blocks.push({ type: 'numbered', runs: parseRuns(stripNumber(line.text)) });
      continue;
    }

    // Paragraph: absorb following lines while the current one is wrapped.
    let text = line.text;
    let cur = line;
    while (i + 1 < classified.length) {
      const next = classified[i + 1];
      if (!cur.wrapped) break;
      if (next.type !== 'paragraph' || next.blockKey !== cur.blockKey) break;
      // A larger-than-normal gap means the author started a new paragraph,
      // even though the previous line happened to reach the column edge.
      const leading = next.top - cur.top;
      if (bodyHeight && leading > bodyHeight * LEADING_RATIO) break;
      i++;
      cur = next;
      text += ' ' + cur.text;
    }
    blocks.push({ type: 'paragraph', runs: parseRuns(text) });
  }

  return blocks;
}

/**
 * Text-only fallback. Blank lines separate paragraphs; consecutive non-blank
 * lines are treated as one wrapped paragraph unless they look like a list or
 * an isolated heading.
 *
 * @param {string} rawText
 * @returns {Array<object>} blocks
 */
function formatText(rawText) {
  const lines = String(rawText || '').split(/\r?\n/).map((l) => l.trim());
  const blocks = [];

  const isList = (l) => !!l && (BULLET_RE.test(l) || NUMBERED_RE.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    if (BULLET_RE.test(line)) {
      blocks.push({ type: 'bullet', runs: parseRuns(stripBullet(line)) });
      continue;
    }
    if (NUMBERED_RE.test(line)) {
      blocks.push({ type: 'numbered', runs: parseRuns(stripNumber(line)) });
      continue;
    }
    if (isAllCaps(line) && line.length <= 60) {
      blocks.push({ type: 'heading1', text: line });
      continue;
    }
    if (line.endsWith(':') && line.length <= 70) {
      blocks.push({ type: 'heading3', text: line.replace(/:$/, '') });
      continue;
    }

    const next = lines[i + 1];
    const standalone = !next || isList(next);
    if (standalone && line.length <= 45 && !/[.!?]$/.test(line)) {
      blocks.push({ type: 'heading2', text: line });
      continue;
    }

    // Merge the run of non-blank, non-list lines into one paragraph.
    let text = line;
    while (i + 1 < lines.length && lines[i + 1] && !isList(lines[i + 1])) {
      i++;
      text += ' ' + lines[i];
    }
    blocks.push({ type: 'paragraph', runs: parseRuns(text) });
  }

  return blocks;
}

module.exports = { formatLayout, formatText };
