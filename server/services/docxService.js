const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} = require('docx');

const HEADING_MAP = {
  heading1: HeadingLevel.HEADING_1,
  heading2: HeadingLevel.HEADING_2,
  heading3: HeadingLevel.HEADING_3,
};

function runsFrom(block) {
  if (block.text !== undefined) {
    return [new TextRun({ text: block.text })];
  }
  return (block.runs || []).map(
    (r) => new TextRun({ text: r.text, bold: !!r.bold, italics: !!r.italic })
  );
}

/**
 * @param {Array<object>} blocks - structured blocks from formatService
 * @param {string} title
 * @returns {Promise<Buffer>} docx file buffer
 */
async function buildDocx(blocks, title) {
  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];

  // Assign a unique numbering instance to each run of numbered items so
  // separate lists restart at 1 instead of continuing (1,2 → 3,4).
  const numberedRefs = new Map(); // block index -> reference name
  let listCounter = 0;
  let inNumberedList = false;
  blocks.forEach((block, idx) => {
    if (block.type === 'numbered') {
      if (!inNumberedList) {
        listCounter++;
        inNumberedList = true;
      }
      numberedRefs.set(idx, `numbered-list-${listCounter}`);
    } else {
      inNumberedList = false;
    }
  });

  const usedRefs = [...new Set(numberedRefs.values())];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (HEADING_MAP[block.type]) {
      children.push(new Paragraph({ heading: HEADING_MAP[block.type], children: runsFrom(block) }));
    } else if (block.type === 'bullet') {
      children.push(new Paragraph({ bullet: { level: 0 }, children: runsFrom(block) }));
    } else if (block.type === 'numbered') {
      children.push(new Paragraph({
        numbering: { reference: numberedRefs.get(i), level: 0 },
        children: runsFrom(block),
      }));
    } else {
      children.push(new Paragraph({ children: runsFrom(block) }));
    }
  }

  const doc = new Document({
    numbering: {
      config: usedRefs.map((reference) => ({
        reference,
        levels: [
          {
            level: 0,
            format: 'decimal',
            text: '%1.',
            alignment: 'start',
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      })),
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocx };
