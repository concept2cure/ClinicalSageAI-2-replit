/**
 * CSR slice 8 (2026-10-29): a streaming PDF writer for the assembled CSR leaves.
 *
 * Pages leave memory as they are finished: pdfkit (the renderer leaf-pdf.ts
 * already uses for eCTD leaves) writes each page's objects when the next page
 * starts (bufferPages: false), and this writer passes the bytes straight to
 * the file, hashing them on the way, and waits for the file to drain at every
 * page. A several-thousand-page listing therefore never exists in memory as a
 * document; only the outline (one entry per bookmark) and the named
 * destinations are kept until the end.
 *
 * What it draws: headings that become bookmarks to any depth and named
 * destinations, wrapped paragraphs whose cross-references are links (to a
 * destination in this file, or to a named destination in a sibling leaf by
 * relative file name, as FDA's PDF specifications ask for links between
 * documents), and ruled tables whose header repeats on every page.
 *
 * Determinism: fixed producer strings and content-derived dates, as leaf-pdf.ts
 * pins them, so unchanged content renders to the same bytes. Every string goes
 * through toWinAnsiSafe (the one rule for what the standard fonts can draw).
 */
import PDFDocument from 'pdfkit';
import { createWriteStream, type WriteStream } from 'node:fs';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers';
import { toWinAnsiSafe } from '../ectd/leaf-pdf-renderer.js';
import type { LinkTarget, TextRun } from './csr-cross-references.js';

const PRODUCER = 'Concept2Cure CSR assembler';
const MARGIN = 54;
const HEADER_BAND = 34;
const HEADING_SIZE: Readonly<Record<number, number>> = { 1: 14, 2: 12.5, 3: 11.5, 4: 11 };
const BODY_SIZE = 10.5;

/* The pdfkit surface this writer uses (the repository's pdfkit.d.ts is partial). */
interface OutlineItem { addItem(title: string, options?: Record<string, unknown>): OutlineItem }
interface PdfRef { end(): void }
interface PdfKit {
  page: { width: number; height: number };
  y: number;
  outline: OutlineItem;
  _root: { data: Record<string, unknown> };
  addPage(options: Record<string, unknown>): PdfKit;
  font(name: string): PdfKit;
  fontSize(size: number): PdfKit;
  fillColor(color: string): PdfKit;
  text(text: string, x: number, y: number, options?: Record<string, unknown>): PdfKit;
  widthOfString(text: string): number;
  rect(x: number, y: number, w: number, h: number): PdfKit;
  fill(color: string): PdfKit;
  stroke(): PdfKit;
  lineWidth(w: number): PdfKit;
  moveTo(x: number, y: number): PdfKit;
  lineTo(x: number, y: number): PdfKit;
  goTo(x: number, y: number, w: number, h: number, name: string): PdfKit;
  annotate(x: number, y: number, w: number, h: number, options: Record<string, unknown>): PdfKit;
  ref(data: Record<string, unknown>): PdfRef;
  addNamedDestination(name: string, ...args: unknown[]): void;
  on(event: string, listener: (...args: never[]) => void): PdfKit;
  end(): void;
}

export interface CsrPdfWriterOptions {
  /** The file to write, or null to lay the document out without writing (a pagination pass). */
  path: string | null;
  title: string;
  /** Printed at the top of every page (study and leaf). */
  runningHeader: string;
  /** Content-derived timestamp, never the wall clock. */
  stamp: Date;
  landscape?: boolean;
}

export interface WrittenPdf { sha256: string; bytes: number; pages: number }
type Token = { text: string; link?: LinkTarget; glue: boolean };
type Line = Token[];

export interface TableSpec { headers: string[]; widths: number[]; size?: number }
export interface TableRow { cells: string[]; bookmark?: { title: string; level: number }; destination?: string; subjectId?: string }

export class CsrPdfWriter {
  pages = 0;
  private readonly doc: PdfKit;
  private readonly hash = createHash('sha256');
  private bytes = 0;
  private readonly out: WriteStream | null;
  private readonly ended: Promise<unknown>;
  private readonly outline: Array<{ level: number; item: OutlineItem }> = [];
  private readonly destinations = new Set<string>();

  constructor(private readonly options: CsrPdfWriterOptions) {
    const stamp = new Date(options.stamp);
    if (Number.isNaN(stamp.getTime())) throw new TypeError(`Cannot render "${options.title}": the content timestamp is not a date.`);
    this.doc = new (PDFDocument as unknown as new (o: Record<string, unknown>) => PdfKit)({
      pdfVersion: '1.7', autoFirstPage: false, bufferPages: false, compress: true,
      info: { Title: toWinAnsiSafe(options.title), Producer: PRODUCER, Creator: PRODUCER, CreationDate: stamp, ModDate: stamp },
    });
    // Open with the bookmarks pane, as FDA's PDF specifications ask of a navigable document.
    this.doc._root.data.PageMode = 'UseOutlines';
    this.out = options.path ? createWriteStream(options.path) : null;
    this.doc.on('data', ((chunk: Buffer) => {
      this.hash.update(chunk);
      this.bytes += chunk.length;
      this.out?.write(chunk);
    }) as never);
    this.ended = once(this.doc as unknown as NodeJS.EventEmitter, 'end');
    this.doc.on('pageAdded', (() => this.drawFurniture()) as never);
    this.newPage();
  }

  get width(): number { return this.doc.page.width - 2 * MARGIN; }
  get left(): number { return MARGIN; }
  get y(): number { return this.doc.y; }
  private get bottom(): number { return this.doc.page.height - MARGIN; }

  private drawFurniture(): void {
    this.pages++;
    const { width, height } = this.doc.page;
    this.doc.font('Helvetica').fontSize(8).fillColor('#000000');
    this.doc.text(toWinAnsiSafe(this.options.runningHeader), MARGIN, 24, { lineBreak: false });
    this.doc.text(`Page ${this.pages}`, width - MARGIN - 60, height - 36, { lineBreak: false, width: 60, align: 'right' });
    this.doc.y = MARGIN + HEADER_BAND - 20;
  }

  newPage(): void {
    this.doc.addPage({ size: 'LETTER', layout: this.options.landscape ? 'landscape' : 'portrait',
      margins: { top: MARGIN, bottom: 20, left: MARGIN, right: MARGIN } });
  }

  /** Let the file take the finished pages before more are drawn. */
  async drain(): Promise<void> {
    if (this.out?.writableNeedDrain) await once(this.out, 'drain');
    else await new Promise(resolve => setImmediate(resolve));
  }

  ensureSpace(height: number): boolean {
    if (this.doc.y + height <= this.bottom) return false;
    this.newPage();
    return true;
  }

  /** A named destination at the current position; each name once per file. */
  destination(name: string): void {
    if (this.destinations.has(name)) throw new Error(`Named destination ${name} is defined twice in "${this.options.title}".`);
    this.destinations.add(name);
    this.doc.addNamedDestination(name, 'XYZ', 0, this.doc.y, null);
  }

  /** A bookmark at `level` (1 = top), nested under the nearest shallower bookmark. */
  bookmark(title: string, level: number): void {
    while (this.outline.length && this.outline[this.outline.length - 1].level >= level) this.outline.pop();
    const parent = this.outline.length ? this.outline[this.outline.length - 1].item : this.doc.outline;
    // pdfkit computes XYZ left as width − left and top as height − top.
    const item = parent.addItem(toWinAnsiSafe(title), { top: this.doc.y, left: this.doc.page.width });
    this.outline.push({ level, item });
  }

  heading(text: string, level: number, destination?: string): void {
    const size = HEADING_SIZE[Math.min(Math.max(level, 1), 4)];
    this.ensureSpace(size * 3 + 16);
    this.doc.y += level === 1 ? 10 : 6;
    this.bookmark(text, level);
    if (destination) this.destination(destination);
    this.lines(text, { font: 'Helvetica-Bold', size });
    this.doc.y += 4;
  }

  /** Wrap plain text to the width, breaking at spaces, then characters. */
  wrap(text: string, width: number): string[] {
    const out: string[] = [];
    for (const logical of toWinAnsiSafe(text).split('\n')) {
      let line = '';
      for (const word of logical.split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.doc.widthOfString(candidate) <= width) { line = candidate; continue; }
        if (line) out.push(line);
        line = this.breakLong(word, width, out);
      }
      out.push(line);
    }
    return out;
  }

  private breakLong(word: string, width: number, out: string[]): string {
    if (this.doc.widthOfString(word) <= width) return word;
    let line = '';
    for (const ch of word) {
      if (line && this.doc.widthOfString(line + ch) > width) { out.push(line); line = ch; } else line += ch;
    }
    return line;
  }

  /** Plain wrapped lines in one font. */
  lines(text: string, style: { font?: string; size?: number; indent?: number } = {}): void {
    const size = style.size ?? BODY_SIZE;
    this.doc.font(style.font ?? 'Helvetica').fontSize(size).fillColor('#000000');
    const indent = style.indent ?? 0;
    for (const line of this.wrap(text, this.width - indent)) {
      this.ensureSpace(size + 4);
      this.doc.font(style.font ?? 'Helvetica').fontSize(size);
      this.doc.text(line, MARGIN + indent, this.doc.y, { lineBreak: false });
      this.doc.y += size + 3.5;
    }
  }

  /** A paragraph whose reference runs are links. */
  paragraph(runs: readonly TextRun[], style: { size?: number; indent?: number } = {}): void {
    const size = style.size ?? BODY_SIZE;
    const indent = style.indent ?? 0;
    this.doc.font('Helvetica').fontSize(size).fillColor('#000000');
    for (const line of this.layoutRuns(runs, this.width - indent)) {
      this.ensureSpace(size + 4);
      this.doc.font('Helvetica').fontSize(size);
      this.drawLine(line, MARGIN + indent, size);
      this.doc.y += size + 3.5;
    }
    this.doc.y += 5;
  }

  /** Tokens to lines; a token that touched the one before it in the text is drawn without a space (a link, then "."). */
  private layoutRuns(runs: readonly TextRun[], width: number): Line[] {
    const tokens: Token[] = [];
    let touching = false;
    for (const run of runs) {
      const text = toWinAnsiSafe(run.text);
      const words = run.link ? [text.trim()] : text.split(/\s+/).filter(Boolean);
      words.forEach((word, i) => tokens.push({ text: word, link: run.link, glue: i === 0 && touching && !/^\s/.test(text) }));
      touching = !/\s$/.test(text);
    }
    const lines: Line[] = [[]];
    const space = this.doc.widthOfString(' ');
    let used = 0;
    for (const token of tokens) {
      const w = this.doc.widthOfString(token.text);
      const current = lines[lines.length - 1];
      const gap = current.length && !token.glue ? space : 0;
      if (current.length && used + gap + w > width) { lines.push([{ ...token, glue: false }]); used = w; continue; }
      used += gap + w;
      current.push(token);
    }
    return lines;
  }

  private drawLine(tokens: Line, x0: number, size: number): void {
    const space = this.doc.widthOfString(' ');
    let x = x0;
    tokens.forEach((token, i) => {
      if (i > 0 && !token.glue) x += space;
      const w = this.doc.widthOfString(token.text);
      this.doc.fillColor(token.link ? '#1F3F8F' : '#000000');
      this.doc.text(token.text, x, this.doc.y, { lineBreak: false });
      if (token.link) this.link(token.link, x, this.doc.y, w, size + 2);
      x += w;
    });
    this.doc.fillColor('#000000');
  }

  /** A link: to a named destination here (GoTo) or in a sibling leaf by relative file name (GoToR). */
  link(target: LinkTarget, x: number, y: number, w: number, h: number): void {
    if (target.kind === 'internal') { this.doc.goTo(x, y, w, h, target.destination); return; }
    // pdfkit writes a JS string as a PDF name and a String object as a PDF string.
    const action = this.doc.ref({ S: 'GoToR', F: new String(target.fileName), NewWindow: false,
      D: target.destination ? new String(target.destination) : [0, 'Fit'] });
    action.end();
    this.doc.annotate(x, y, w, h, { Subtype: 'Link', A: action });
  }

  /** A ruled table, its header repeated on every page it continues onto. Draws rows as they arrive. */
  async table(spec: TableSpec, rows: Iterable<TableRow> | AsyncIterable<TableRow>, onRow?: (row: TableRow) => void): Promise<number> {
    const size = spec.size ?? 8;
    const total = spec.widths.reduce((a, b) => a + b, 0);
    const widths = spec.widths.map(w => (w / total) * this.width);
    this.ensureSpace(size * 6);
    this.tableHeader(spec.headers, widths, size);
    let count = 0;
    for await (const row of rows) {
      const cellLines = row.cells.map((cell, i) => this.cellLines(cell, widths[i], size));
      const height = Math.max(1, ...cellLines.map(l => l.length)) * (size + 2.5) + 5;
      if (height > this.bottom - (MARGIN + HEADER_BAND) - 40) throw new Error(`A row of "${this.options.title}" is taller than a page.`);
      if (this.ensureSpace(height)) { this.tableHeader(spec.headers, widths, size); await this.drain(); }
      if (row.bookmark) this.bookmark(row.bookmark.title, row.bookmark.level);
      if (row.destination) this.destination(row.destination);
      this.tableRow(cellLines, widths, size, height);
      onRow?.(row);
      count++;
    }
    this.doc.y += 8;
    return count;
  }

  private cellLines(cell: string, width: number, size: number): string[] {
    this.doc.font('Helvetica').fontSize(size);
    return this.wrap(cell, width - 6);
  }

  private tableHeader(headers: string[], widths: number[], size: number): void {
    this.doc.font('Helvetica-Bold').fontSize(size);
    const lines = headers.map((h, i) => this.wrap(h, widths[i] - 6));
    const height = Math.max(...lines.map(l => l.length)) * (size + 2.5) + 6;
    this.doc.rect(MARGIN, this.doc.y, this.width, height).fill('#E6E6E6');
    this.doc.fillColor('#000000').font('Helvetica-Bold').fontSize(size);
    this.tableRow(lines, widths, size, height);
  }

  private tableRow(cellLines: string[][], widths: number[], size: number, height: number): void {
    const top = this.doc.y;
    let x = MARGIN;
    cellLines.forEach((lines, i) => {
      lines.forEach((line, n) => this.doc.text(line, x + 3, top + 3 + n * (size + 2.5), { lineBreak: false }));
      x += widths[i];
    });
    this.doc.lineWidth(0.4).moveTo(MARGIN, top + height).lineTo(MARGIN + this.width, top + height).stroke();
    this.doc.font('Helvetica').fontSize(size);
    this.doc.y = top + height;
  }

  /** One table-of-contents line: indented title, dotted to a right-aligned page number, linked. */
  tocLine(text: string, level: number, page: string, destination: string): void {
    const size = level === 1 ? 10 : 9.5;
    this.doc.font(level === 1 ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    const indent = (level - 1) * 14;
    const pageWidth = 36;
    const lines = this.wrap(text, this.width - indent - pageWidth - 8);
    this.ensureSpace(lines.length * (size + 3.5) + 2);
    const top = this.doc.y;
    lines.forEach((line, n) => this.doc.text(line, MARGIN + indent, top + n * (size + 3.5), { lineBreak: false }));
    this.doc.text(page, MARGIN + this.width - pageWidth, top + (lines.length - 1) * (size + 3.5), { lineBreak: false, width: pageWidth, align: 'right' });
    this.doc.goTo(MARGIN + indent, top, this.width - indent, lines.length * (size + 3.5), destination);
    this.doc.y = top + lines.length * (size + 3.5) + 1;
  }

  async finish(): Promise<WrittenPdf> {
    this.doc.end();
    await this.ended;
    if (this.out) {
      this.out.end();
      await once(this.out, 'close');
    }
    return { sha256: this.hash.digest('hex'), bytes: this.bytes, pages: this.pages };
  }
}
