/**
 * Canonical report PDF writer. PDFKit already ships in the platform and embeds
 * Noto font subsets, including the CJK collection. Unsupported glyphs refuse
 * the export; a governed character is never substituted with a question mark.
 * Both run and bundle exports share pagination, font coverage and identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import bidiFactory from 'bidi-js';
const bidi = bidiFactory();

export const PAGE: [number, number] = [612, 792];
export const MARGIN = 50;
const WIDTH = PAGE[0] - MARGIN * 2;
const BOTTOM = PAGE[1] - MARGIN - 24;
export const GREY = '#595959';
export const iso = (v: Date | string | null | undefined): string =>
  v instanceof Date ? v.toISOString() : typeof v === 'string' && v ? v : 'not recorded';

type Direction = 'ltr' | 'rtl';
export interface Style { size: number; bold?: boolean; indent?: number; color?: string; gap?: number; direction?: Direction }
interface FontSpec { alias: string; filename: string; family?: string }
type EmbeddedFont = { font: {
  hasGlyphForCodePoint(code: number): boolean;
  layout(text: string, features?: unknown, script?: unknown, language?: unknown, direction?: Direction): unknown;
} };
interface TextRun { font: string; text: string; direction: Direction; level: number; start: number; end: number }

// OS packages fonts-noto-core and fonts-noto-cjk are installed by the production
// image. Override the directories when the operator provisions fonts elsewhere.
const scriptFonts: Array<[RegExp, string]> = [
  [/\p{Script=Arabic}/u, 'NotoSansArabic'], [/\p{Script=Hebrew}/u, 'NotoSansHebrew'],
  [/\p{Script=Devanagari}/u, 'NotoSansDevanagari'], [/\p{Script=Bengali}/u, 'NotoSansBengali'],
  [/\p{Script=Gujarati}/u, 'NotoSansGujarati'], [/\p{Script=Gurmukhi}/u, 'NotoSansGurmukhi'],
  [/\p{Script=Tamil}/u, 'NotoSansTamil'], [/\p{Script=Telugu}/u, 'NotoSansTelugu'],
  [/\p{Script=Kannada}/u, 'NotoSansKannada'], [/\p{Script=Malayalam}/u, 'NotoSansMalayalam'],
  [/\p{Script=Sinhala}/u, 'NotoSansSinhala'], [/\p{Script=Thai}/u, 'NotoSansThai'],
  [/\p{Script=Lao}/u, 'NotoSansLao'], [/\p{Script=Khmer}/u, 'NotoSansKhmer'],
  [/\p{Script=Myanmar}/u, 'NotoSansMyanmar'], [/\p{Script=Ethiopic}/u, 'NotoSansEthiopic'],
  [/\p{Script=Armenian}/u, 'NotoSansArmenian'], [/\p{Script=Georgian}/u, 'NotoSansGeorgian'],
];

export class ReportingPdfError extends Error {
  constructor(public readonly status: 422 | 503, public readonly code: string, message: string) { super(message); }
}

export class Writer {
  readonly pdf: InstanceType<typeof PDFDocument>;
  readonly pages: number[] = [];
  readonly replaced = 0;
  private y = MARGIN;
  private fonts = new Map<string, FontSpec>();
  private glyphFonts = new Map<string, string>();
  private chunks: Buffer[] = [];
  private completed: Promise<Buffer>;
  private coreDir = process.env.REPORT_PDF_NOTO_CORE_DIR ?? '/usr/share/fonts/truetype/noto';
  private cjkDir = process.env.REPORT_PDF_NOTO_CJK_DIR ?? '/usr/share/fonts/opentype/noto';

  constructor(identity: { title: string; exportId: string; exportedAt: string }) {
    const at = new Date(identity.exportedAt);
    if (Number.isNaN(at.getTime())) throw new Error('The export time is not a valid time; the PDF was not rendered.');
    this.pdf = new PDFDocument({ size: PAGE, margin: MARGIN, bufferPages: true, autoFirstPage: false, info: {
      Title: identity.title, Subject: `Export ${identity.exportId}`, Producer: 'Concept2Cure Reporting', Creator: 'Concept2Cure', CreationDate: at, ModDate: at,
    } });
    this.completed = new Promise((resolve, reject) => {
      this.pdf.on('data', (chunk: Buffer) => this.chunks.push(chunk));
      this.pdf.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.pdf.on('error', reject);
    });
    if (!this.coreFont('NotoSans', false)) throw new ReportingPdfError(503, 'REPORT_PDF_FONTS_UNAVAILABLE', 'Reporting PDF fonts are unavailable on this deployment. Nothing was exported.');
    this.newPage();
  }

  private register(alias: string, filename: string, family?: string): string | null {
    if (!fs.existsSync(filename)) return null;
    if (!this.fonts.has(alias)) {
      this.fonts.set(alias, { alias, filename, family });
      this.pdf.registerFont(alias, filename, family);
    }
    return alias;
  }
  private coreFont(family: string, bold: boolean): string | null {
    const weight = bold && fs.existsSync(path.join(this.coreDir, `${family}-Bold.ttf`)) ? 'Bold' : 'Regular';
    return this.register(`${family}-${weight}`, path.join(this.coreDir, `${family}-${weight}.ttf`));
  }
  private cjkFont(bold: boolean): string | null {
    const weight = bold ? 'Bold' : 'Regular';
    return this.register(`NotoCJK-${weight}`, path.join(this.cjkDir, `NotoSansCJK-${weight}.ttc`), `NotoSansCJKjp-${weight}`);
  }
  private hasGlyph(alias: string, ch: string): boolean {
    try { this.pdf.font(alias); } catch {
      throw new ReportingPdfError(503, 'REPORT_PDF_FONTS_UNAVAILABLE', 'Reporting PDF fonts are unavailable or invalid on this deployment. Nothing was exported.');
    }
    // PDFKit's embedded font is its existing fontkit instance. This verifies
    // coverage before encode/layout, preventing fontkit's .notdef glyph.
    const embedded = (this.pdf as unknown as { _font: EmbeddedFont })._font;
    return embedded.font.hasGlyphForCodePoint(ch.codePointAt(0)!);
  }
  private fontFor(ch: string, bold: boolean): string {
    const key = `${bold}:${ch}`;
    const cached = this.glyphFonts.get(key);
    if (cached) return cached;
    const candidates = [this.coreFont('NotoSans', bold)];
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)) candidates.push(this.cjkFont(bold));
    for (const [script, family] of scriptFonts) if (script.test(ch)) candidates.push(this.coreFont(family, bold));
    candidates.push(this.coreFont('NotoSansMath', bold), this.coreFont('NotoSansSymbols', bold), this.coreFont('NotoSansSymbols2', bold));
    for (const font of candidates) {
      if (font && this.hasGlyph(font, ch)) { this.glyphFonts.set(key, font); return font; }
    }
    throw new ReportingPdfError(422, 'REPORT_PDF_GLYPH_UNSUPPORTED', `Reporting PDF cannot faithfully render U+${ch.codePointAt(0)!.toString(16).toUpperCase()}. Nothing was exported.`);
  }
  private runs(text: string, bold: boolean, direction?: Direction): TextRun[] {
    const runs: TextRun[] = [];
    const levels = bidi.getEmbeddingLevels(text, direction);
    // The installed bidi-js API takes the level ARRAY here (its README's
    // embedding-result example is misleading). Passing the result object
    // silently returns no mirrored punctuation and reverses copied brackets.
    const mirrored = bidi.getMirroredCharactersMap(text, levels.levels);
    let index = 0;
    for (const ch of text) {
      const last = runs[runs.length - 1];
      // Keep combining marks and intervening spaces in a script's shaping run.
      const font = last && /[\p{Mark}\s]/u.test(ch) && this.hasGlyph(last.font, ch) ? last.font : this.fontFor(ch, bold);
      const level = levels.levels[index] ?? 0;
      const shown = mirrored.get(index) ?? ch;
      if (last?.font === font && last.level === level) { last.text += shown; last.end += ch.length; }
      else runs.push({ font, text: shown, direction: level % 2 ? 'rtl' : 'ltr', level, start: index, end: index + ch.length });
      index += ch.length;
    }
    const order = bidi.getReorderedIndices(text, levels);
    const visual = new Map<number, number>(order.map((logical: number, position: number) => [logical, position]));
    const position = (run: TextRun) => Math.min(...Array.from({ length: run.end - run.start }, (_, i) => visual.get(run.start + i) ?? run.start + i));
    return runs.sort((a, b) => position(a) - position(b));
  }
  private withFontDirection<T>(run: TextRun, render: () => T): T {
    this.pdf.font(run.font);
    const font = (this.pdf as unknown as { _font: EmbeddedFont })._font.font;
    const layout = font.layout;
    // PDFKit otherwise splits every word before shaping, reversing RTL letters
    // but retaining LTR word order. Its public `features` option bypasses that
    // optimization; fontkit's direction parameter shapes each resolved bidi run.
    font.layout = (text, features, script, language) => layout.call(font, text, features, script, language, run.direction);
    try { return render(); } finally { font.layout = layout; }
  }
  private features(run: TextRun): string[] | Record<string, boolean> {
    // Noto's lam-alif ligature can share a subset Unicode mapping with another
    // glyph in PDFKit, causing text extraction to duplicate alif and lose lam.
    // Positional Arabic forms stay enabled; separate letter glyphs keep the
    // recorded characters independently extractable and correctly joined.
    return run.font.startsWith('NotoSansArabic') ? { liga: false, rlig: false } : [];
  }
  private width(text: string, style: Style): number {
    return this.runs(text, Boolean(style.bold), style.direction).reduce((sum, run) => sum + this.withFontDirection(run, () => this.pdf.fontSize(style.size).widthOfString(run.text, { features: this.features(run) })), 0);
  }
  private newPage() {
    this.pdf.addPage();
    this.pages.push(this.pages.length);
    this.y = MARGIN;
  }
  reserve(height: number): number {
    if (this.y + height > BOTTOM) this.newPage();
    const top = this.y;
    this.y += height;
    return top;
  }
  private wrap(text: string, style: Style, width: number): Array<{ text: string; direction: Direction }> {
    const lines: Array<{ text: string; direction: Direction }> = [];
    for (const paragraph of text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
      const level = bidi.getEmbeddingLevels(paragraph, style.direction).paragraphs[0]?.level ?? 0;
      const direction: Direction = level % 2 ? 'rtl' : 'ltr';
      const lineStyle = { ...style, direction };
      let line = '';
      for (const ch of paragraph) {
        if (line && this.width(line + ch, lineStyle) > width) {
          const space = line.lastIndexOf(' ');
          if (space > 0) { lines.push({ text: line.slice(0, space), direction }); line = line.slice(space + 1); }
          else { lines.push({ text: line, direction }); line = ''; }
        }
        line += ch;
      }
      lines.push({ text: line, direction });
    }
    return lines;
  }
  drawText(text: string, x: number, y: number, style: Style) {
    this.pdf.fillColor(style.color ?? '#111111');
    // Retain logical text independently of visual reordering for readers that
    // honor PDF ActualText (including accessibility and native text extraction).
    this.pdf.markContent('Span', { actual: text });
    for (const run of this.runs(text, Boolean(style.bold), style.direction)) {
      this.withFontDirection(run, () => {
        this.pdf.fontSize(style.size).text(run.text, x, y, { lineBreak: false, features: this.features(run) });
        x += this.pdf.widthOfString(run.text, { features: this.features(run) });
      });
    }
    this.pdf.endMarkedContent();
  }
  write(text: string, style: Style) {
    for (const line of this.wrap(text, style, WIDTH - (style.indent ?? 0))) {
      const top = this.reserve(style.size + 5);
      this.drawText(line.text, MARGIN + (style.indent ?? 0), top, { ...style, direction: line.direction });
    }
    this.y += style.gap ?? 0;
  }
  stampPages(footer: (page: number, total: number) => string, watermark?: string) {
    const total = this.pages.length;
    for (const page of this.pages) {
      this.pdf.switchToPage(page);
      const text = footer(page + 1, total);
      const size = Math.min(8, 8 * WIDTH / Math.max(WIDTH, this.width(text, { size: 8 })));
      this.drawText(text, MARGIN, PAGE[1] - MARGIN + 2, { size, color: GREY });
      if (watermark) {
        this.pdf.save().opacity(0.18).translate(112, 440).rotate(-40);
        this.drawText(watermark, 0, 0, { size: 40, color: '#777777', bold: true });
        this.pdf.restore();
      }
    }
  }
  async save(): Promise<Buffer> { this.pdf.end(); return this.completed; }
}
