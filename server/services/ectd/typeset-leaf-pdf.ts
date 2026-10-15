/**
 * Typeset eCTD leaf renderer: headings, paragraphs and RULED TABLES.
 *
 * ── Why this exists beside leaf-pdf-renderer ─────────────────────────────────
 * renderLeafPdf is a faithful TEXT rendering: it reduces content to lines of
 * Helvetica, so a table becomes "cell | cell" text. For a CMC Module 3 section
 * that is the wrong document. A §3.2.S.4.1 specification, a §3.2.S.4.4 batch
 * analysis and a §3.2.P.8.3 stability data set ARE tables, and the Module 3
 * placement stores its composition in the composer's format (module3Composer
 * .renderComposedSectionMarkdown — the same bytes as the governed artifact). So
 * the filed leaf printed that format itself: "## 3.2.S.4.1 Specification", then
 * "| Test | Acceptance criterion |" and "| --- | --- |" rows, in the PDF an
 * agency reviewer opens (hand-off item 17, docs/work-orders/README.md).
 *
 * This renderer lays the composition out — bold headings that become
 * bookmarks, wrapped paragraphs, and tables drawn as ruled grids whose header
 * row repeats on every page the table continues onto — from blocks read by
 * typeset-blocks.ts, which reads the composer's one format exactly and keeps
 * every recorded character (it is not a markdown parser; see its header for
 * the "1*10^3 CFU/g" that a markdown parser filed as "110^3 CFU/g"). The stored
 * content does not change, so the "filed leaf and governed artifact are the
 * same bytes" contract the placement pins still holds; only how the leaf PDF
 * is drawn from those bytes does.
 *
 * Determinism is the same contract renderLeafPdf keeps: fixed metadata, epoch
 * dates, no object streams, no wall clock — identical input yields
 * byte-identical output, so the md5 an index.xml records is stable.
 *
 * Every string is passed through toWinAnsiSafe (the one rule for what the
 * standard fonts can draw) BEFORE it is measured, so no authored glyph can
 * throw inside drawText and fail an export.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { toWinAnsiSafe, type LeafPdfOptions } from './leaf-pdf-renderer';
import { addBookmarks, type OutlineNode } from './pdf-bookmark-generator';
import { composedSectionToBlocks, type TypesetBlock } from './typeset-blocks';

export { composedSectionToBlocks, literalParagraphs, type TypesetBlock } from './typeset-blocks';

const PAGE_WIDTH = 612; // US Letter, points — the same page as renderLeafPdf
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const BODY_SIZE = 11;
const BODY_LEADING = 15;
const CELL_PAD = 4;
const RULE = 0.5;
const HEADING_SIZE: Record<number, number> = { 1: 15, 2: 13, 3: 12 };
const HEADER_FILL = rgb(0.9, 0.9, 0.9);
const INK = rgb(0, 0, 0);
const EPOCH = new Date(0);

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * The pieces a word may be broken into without breaking a token: after a
 * hyphen, slash or equals sign ("process-|related", "LC-|MS/|MS"). Only when a
 * piece is still wider than its line is it broken by character.
 */
function pieces(word: string): string[] {
  return word.split(/(?<=[-/=])(?=.)/);
}

/** Break a piece wider than its line by character; returns the open line. */
function breakByCharacter(piece: string, fits: (t: string) => boolean, out: string[]): string {
  let line = '';
  for (const ch of piece) {
    if (line && !fits(line + ch)) {
      out.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  return line;
}

/**
 * Lay out a word that does not fit after `line`, piece by piece: the first
 * piece after a space on the current line when it fits there. Returns the
 * open line.
 */
function placeOverlongWord(
  word: string,
  line: string,
  fits: (t: string) => boolean,
  out: string[]
): string {
  let open = line;
  let joiner = open ? ' ' : '';
  for (const piece of pieces(word)) {
    if (fits(open + joiner + piece)) {
      open = open + joiner + piece;
    } else {
      if (open) out.push(open);
      open = fits(piece) ? piece : breakByCharacter(piece, fits, out);
    }
    joiner = '';
  }
  return open;
}

/** Greedy word wrap with break opportunities at word pieces, then characters. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
  for (const logical of text.split('\n')) {
    let line = '';
    for (const word of logical.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      line = fits(candidate) ? candidate : placeOverlongWord(word, line, fits, out);
    }
    out.push(line);
  }
  return out;
}

const PORTRAIT = { w: PAGE_WIDTH, h: PAGE_HEIGHT };
const LANDSCAPE = { w: PAGE_HEIGHT, h: PAGE_WIDTH };
/** Table type sizes tried, largest first, before a wide table turns the page. */
const TABLE_SIZES = [9, 8, 7.5];

interface TablePlan {
  size: number;
  leading: number;
  landscape: boolean;
  widths: number[];
}

/**
 * How a table is set: the largest type size at which every column holds its
 * longest unbreakable piece on the portrait text width; failing that, the same
 * search on a landscape page (how wide Module 3 tables — impurity profiles,
 * batch analyses — are conventionally presented); failing that, the smallest
 * size on landscape with columns shared by content and characters broken.
 * Spare width is shared in proportion to how much more each column would use
 * unwrapped, so a long-text column gets the room, not a short one.
 */
function planTable(cells: string[][], bold: PDFFont, font: PDFFont): TablePlan {
  const cols = Math.max(...cells.map(r => r.length));
  const measure = (size: number) => {
    const minW: number[] = new Array(cols).fill(0);
    const natW: number[] = new Array(cols).fill(0);
    cells.forEach((row, ri) => {
      const f = ri === 0 ? bold : font;
      for (let c = 0; c < cols; c++) {
        const text = row[c] ?? '';
        const longestPiece = Math.max(
          0,
          ...text
            .split(/\s+/)
            .flatMap(pieces)
            .map(w => f.widthOfTextAtSize(w, size))
        );
        const longestLine = Math.max(0, ...text.split('\n').map(l => f.widthOfTextAtSize(l, size)));
        minW[c] = Math.max(minW[c], longestPiece + 2 * CELL_PAD);
        natW[c] = Math.max(natW[c], longestLine + 2 * CELL_PAD);
      }
    });
    return { minW, natW };
  };
  const share = (minW: number[], natW: number[], total: number): number[] => {
    const sumNat = natW.reduce((a, b) => a + b, 0);
    if (sumNat <= total) return natW.map(w => (w / sumNat) * total);
    const sumMin = minW.reduce((a, b) => a + b, 0);
    if (sumMin >= total) {
      // Nothing fits whole: blend both measures so long-text columns still get room.
      return minW.map((w, i) => total * (0.5 * (w / sumMin) + 0.5 * (natW[i] / sumNat)));
    }
    const want = natW.map((w, i) => w - minW[i]);
    const sumWant = want.reduce((a, b) => a + b, 0) || 1;
    return minW.map((w, i) => w + (want[i] / sumWant) * (total - sumMin));
  };
  for (const landscape of [false, true]) {
    const total = (landscape ? LANDSCAPE.w : PORTRAIT.w) - 2 * MARGIN;
    for (const size of TABLE_SIZES) {
      const { minW, natW } = measure(size);
      if (minW.reduce((a, b) => a + b, 0) <= total) {
        return { size, leading: size + 3, landscape, widths: share(minW, natW, total) };
      }
    }
  }
  const size = TABLE_SIZES[TABLE_SIZES.length - 1];
  const { minW, natW } = measure(size);
  return {
    size,
    leading: size + 3,
    landscape: true,
    widths: share(minW, natW, LANDSCAPE.w - 2 * MARGIN),
  };
}

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  landscape: boolean;
}

function newPage(cur: Cursor, landscape = cur.landscape): void {
  const dims = landscape ? LANDSCAPE : PORTRAIT;
  cur.page = cur.doc.addPage([dims.w, dims.h]);
  cur.y = dims.h - MARGIN;
  cur.landscape = landscape;
}

/** Continue on a page of the given orientation, turning a new one if needed. */
function ensureOrientation(cur: Cursor, landscape: boolean): void {
  if (cur.landscape !== landscape) newPage(cur, landscape);
}

function tableCells(block: { headers: string[]; rows: string[][] }): {
  header: string[];
  rows: string[][];
  cols: number;
} {
  const safeHeader = block.headers.map(toWinAnsiSafe);
  const safeRows = block.rows.map(r => r.map(toWinAnsiSafe));
  const cols = Math.max(safeHeader.length, ...safeRows.map(r => r.length), 0);
  const pad = (r: string[]) => [...r, ...new Array(Math.max(0, cols - r.length)).fill('')];
  return { header: pad(safeHeader), rows: safeRows.map(pad), cols };
}

function drawTable(
  cur: Cursor,
  block: { headers: string[]; rows: string[][] },
  font: PDFFont,
  bold: PDFFont
): void {
  const { header, rows, cols } = tableCells(block);
  if (cols < 1) return; // a table with no columns has nothing to draw
  const { size, leading, landscape, widths } = planTable([header, ...rows], bold, font);
  ensureOrientation(cur, landscape);
  const pageH = landscape ? LANDSCAPE.h : PORTRAIT.h;

  const layoutRow = (row: string[], f: PDFFont) =>
    row.map((text, c) => wrap(text, f, size, widths[c] - 2 * CELL_PAD));
  const headerLines = layoutRow(header, bold);
  const headerHeight = Math.max(...headerLines.map(l => l.length)) * leading + 2 * CELL_PAD;

  const drawRow = (lines: string[][], f: PDFFont, fill: boolean, height: number) => {
    let x = MARGIN;
    const top = cur.y;
    for (let c = 0; c < cols; c++) {
      cur.page.drawRectangle({
        x,
        y: top - height,
        width: widths[c],
        height,
        borderColor: INK,
        borderWidth: RULE,
        ...(fill ? { color: HEADER_FILL } : {}),
      });
      lines[c].forEach((line, i) => {
        if (!line) return;
        cur.page.drawText(line, {
          x: x + CELL_PAD,
          y: top - CELL_PAD - (i + 1) * leading + leading * 0.25,
          size,
          font: f,
          color: INK,
        });
      });
      x += widths[c];
    }
    cur.y = top - height;
  };
  const drawHeader = () => drawRow(headerLines, bold, true, headerHeight);

  // A table never starts so low that its header would sit alone at a page foot.
  if (cur.y - headerHeight - leading - 2 * CELL_PAD < MARGIN) newPage(cur);
  drawHeader();

  const fullPageRoom = Math.floor((pageH - 2 * MARGIN - headerHeight - 2 * CELL_PAD) / leading);
  for (const row of rows) {
    let lines = layoutRow(row, font);
    let remaining = Math.max(...lines.map(l => l.length));
    let freshPage = false;
    while (remaining > 0) {
      const room = Math.floor((cur.y - MARGIN - 2 * CELL_PAD) / leading);
      // A row that fits a page is never split; a row taller than a whole page
      // is split by line. Either way a continuation repeats the header.
      if (!freshPage && (room < 1 || (remaining > room && remaining <= fullPageRoom))) {
        newPage(cur);
        drawHeader();
        freshPage = true;
        continue;
      }
      // At least one line per pass, so a header taller than a page cannot loop.
      const take = Math.max(1, Math.min(remaining, room));
      freshPage = false;
      drawRow(
        lines.map(l => l.slice(0, take)),
        font,
        false,
        take * leading + 2 * CELL_PAD
      );
      lines = lines.map(l => l.slice(take));
      remaining -= take;
    }
  }
  cur.y -= BODY_LEADING / 2;
}

/** Whether a block is a table that will be set on a landscape page. */
function needsLandscape(block: TypesetBlock | undefined, font: PDFFont, bold: PDFFont): boolean {
  if (!block || block.kind !== 'table') return false;
  const { header, rows, cols } = tableCells(block);
  return cols > 0 && planTable([header, ...rows], bold, font).landscape;
}

interface Typesetter {
  doc: PDFDocument;
  cur: Cursor;
  font: PDFFont;
  bold: PDFFont;
  headings: Array<{ level: number; node: OutlineNode }>;
}

const textWidth = (cur: Cursor) => (cur.landscape ? LANDSCAPE.w : PORTRAIT.w) - 2 * MARGIN;

interface LineStyle {
  font: PDFFont;
  size: number;
  leading: number;
  indent?: number;
}

function drawLines(t: Typesetter, lines: string[], style: LineStyle): void {
  const { cur } = t;
  const { font: f, size, leading, indent = 0 } = style;
  for (const line of lines) {
    if (cur.y - leading < MARGIN) newPage(cur);
    cur.y -= leading;
    if (line)
      cur.page.drawText(line, {
        x: MARGIN + indent,
        y: cur.y + (leading - size) / 2,
        size,
        font: f,
        color: INK,
      });
  }
}

function drawHeading(t: Typesetter, block: { level: number; text: string }): void {
  const { cur, bold } = t;
  const size = HEADING_SIZE[block.level] ?? BODY_SIZE;
  const leading = size + 5;
  const text = toWinAnsiSafe(block.text);
  // Keep a heading with at least two lines of what follows it.
  if (cur.y - leading - 2 * BODY_LEADING < MARGIN) newPage(cur);
  cur.y -= BODY_LEADING / 3;
  t.headings.push({
    level: block.level,
    node: { title: text, sectionCode: '', pageIndex: t.doc.getPageCount() - 1 },
  });
  drawLines(t, wrap(text, bold, size, textWidth(cur)), { font: bold, size, leading });
  cur.y -= BODY_LEADING / 3;
}

function drawBlock(t: Typesetter, block: TypesetBlock): void {
  const { cur, font, bold } = t;
  switch (block.kind) {
    case 'heading':
      drawHeading(t, block);
      break;
    case 'paragraph':
      drawLines(t, wrap(toWinAnsiSafe(block.text), font, BODY_SIZE, textWidth(cur)), {
        font,
        size: BODY_SIZE,
        leading: BODY_LEADING,
      });
      cur.y -= BODY_LEADING / 2;
      break;
    case 'table':
      drawTable(cur, block, font, bold);
      break;
  }
}

/** Heading bookmarks nested by level under the document's own bookmark. */
function buildOutline(
  header: string,
  sectionCode: string,
  headings: Typesetter['headings']
): OutlineNode[] {
  const roots: OutlineNode[] = [];
  const stack: Typesetter['headings'] = [];
  for (const h of headings) {
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) (parent.node.children ??= []).push(h.node);
    else roots.push(h.node);
    stack.push(h);
  }
  if (!header) return roots;
  return [
    { title: header, sectionCode, pageIndex: 0, ...(roots.length ? { children: roots } : {}) },
  ];
}

/**
 * Render typeset blocks to a deterministic PDF leaf. Headings become bookmarks
 * nested under the document's own bookmark (section code + title), each
 * pointing at the page its heading is drawn on. A table too wide for a
 * portrait page is set on landscape pages, with the heading that introduces it;
 * the text after it returns to portrait.
 */
export async function renderTypesetLeafPdf(
  blocks: TypesetBlock[],
  options: LeafPdfOptions = {}
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(options.title ?? 'eCTD leaf');
  doc.setProducer('Concept2Cure eCTD leaf renderer');
  doc.setCreator('Concept2Cure eCTD leaf renderer');
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const t: Typesetter = {
    doc,
    cur: {
      doc,
      page: doc.addPage([PORTRAIT.w, PORTRAIT.h]),
      y: PORTRAIT.h - MARGIN,
      landscape: false,
    },
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    headings: [],
  };

  const header = toWinAnsiSafe(
    options.sectionCode
      ? `${options.sectionCode}  ${options.title ?? ''}`.trim()
      : options.title ?? ''
  );
  if (header) {
    drawLines(t, wrap(header, t.bold, BODY_SIZE, textWidth(t.cur)), {
      font: t.bold,
      size: BODY_SIZE,
      leading: BODY_LEADING,
    });
    t.cur.y -= BODY_LEADING / 2;
  }

  const content = blocks.length
    ? blocks
    : [{ kind: 'paragraph', text: '(no content)' } as TypesetBlock];
  content.forEach((block, index) => {
    if (block.kind !== 'table') {
      // A heading travels with the table it introduces; everything else is portrait.
      ensureOrientation(
        t.cur,
        block.kind === 'heading' && needsLandscape(content[index + 1], t.font, t.bold)
      );
    }
    drawBlock(t, block);
  });

  const outline = buildOutline(header, options.sectionCode ?? '', t.headings);
  const saved = await doc.save({ useObjectStreams: false });
  return Buffer.from(outline.length > 0 ? await addBookmarks(saved, outline) : saved);
}

/** A composed Module 3 section, as stored, typeset. The signature renderLeafPdf has. */
export async function renderComposedSectionLeafPdf(
  content: string,
  options: LeafPdfOptions = {}
): Promise<Buffer> {
  return renderTypesetLeafPdf(composedSectionToBlocks(content), options);
}
