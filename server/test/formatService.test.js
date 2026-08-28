const assert = require('node:assert');
const { test } = require('node:test');
const { formatLayout, formatText } = require('../services/formatService');

const types = (blocks) => blocks.map((b) => b.type);
const textOf = (b) => (b.text !== undefined ? b.text : b.runs.map((r) => r.text).join(''));

// Helper: build a line at a given column with a given height.
const L = (text, { block = 0, top = 0, left = 40, width = 400, height = 20 } = {}) =>
  ({ text, block, top, left, width, height });

test('wrapped lines merge into one paragraph instead of becoming headings', () => {
  const blocks = formatLayout({
    lines: [
      L('The mitochondria is the', { top: 100, width: 400 }),
      L('Powerhouse of the cell. It', { top: 130, width: 398 }),
      L('Converts glucose into ATP', { top: 160, width: 401 }),
      L('Through respiration', { top: 190, width: 210 }),
    ],
  });
  assert.deepStrictEqual(types(blocks), ['paragraph']);
  assert.strictEqual(
    textOf(blocks[0]),
    'The mitochondria is the Powerhouse of the cell. It Converts glucose into ATP Through respiration'
  );
});

test('a taller line becomes a heading', () => {
  const blocks = formatLayout({
    lines: [
      L('Meeting notes', { top: 40, width: 180, height: 32 }),
      L('Kickoff was held today and the', { top: 100, width: 400 }),
      L('team agreed a phased rollout.', { top: 130, width: 300 }),
    ],
  });
  assert.deepStrictEqual(types(blocks), ['heading1', 'paragraph']);
});

test('short final line does not swallow the next paragraph', () => {
  const blocks = formatLayout({
    lines: [
      L('First para ends short.', { top: 40, width: 200 }),
      L('Second para starts here.', { top: 80, width: 210 }),
    ],
  });
  assert.deepStrictEqual(types(blocks), ['paragraph', 'paragraph']);
});

test('separate blocks never merge', () => {
  const blocks = formatLayout({
    lines: [
      L('Column one text runs on', { block: 0, top: 40, width: 400 }),
      L('Column two text', { block: 1, top: 40, left: 460, width: 400 }),
    ],
  });
  assert.strictEqual(blocks.length, 2);
});

test('lists and trailing-colon headings survive geometry mode', () => {
  const blocks = formatLayout({
    lines: [
      L('Action items:', { top: 40, width: 120 }),
      L('- Draft the spec', { top: 70, width: 150 }),
      L('1. Review budget', { top: 100, width: 160 }),
    ],
  });
  assert.deepStrictEqual(types(blocks), ['heading3', 'bullet', 'numbered']);
  assert.strictEqual(textOf(blocks[0]), 'Action items');
});

test('missing geometry falls back to the text parser', () => {
  const blocks = formatLayout({ lines: [{ text: 'NOTES' }, { text: 'Body line here.' }] });
  assert.deepStrictEqual(types(blocks), ['heading1', 'paragraph']);
});

test('text fallback merges wrapped lines rather than making headings', () => {
  const blocks = formatText('The mitochondria is the\nPowerhouse of the cell. It\nConverts glucose');
  assert.deepStrictEqual(types(blocks), ['paragraph']);
});

test('text fallback still finds headings, lists and emphasis', () => {
  const blocks = formatText(
    'MEETING NOTES\n\nNext steps\n1. Review budget\n2. Confirm vendors\n\nSee the *bold* item.'
  );
  assert.deepStrictEqual(types(blocks), [
    'heading1', 'heading2', 'numbered', 'numbered', 'paragraph',
  ]);
  const runs = blocks[4].runs;
  assert.strictEqual(runs.find((r) => r.bold).text, 'bold');
});

test('empty input yields no blocks', () => {
  assert.deepStrictEqual(formatLayout({ lines: [] }), []);
  assert.deepStrictEqual(formatText('   \n\n  '), []);
});
