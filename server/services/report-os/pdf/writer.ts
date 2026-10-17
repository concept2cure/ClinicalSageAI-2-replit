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
import type { ReportPdfBranding } from './company-branding';
const bidi = bidiFactory();

export const PAGE: [number, number] = [612, 792];
export const MARGIN = 50;
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

function brandingRefusal(message: string): never {
  throw new ReportingPdfError(422, 'REPORT_PDF_BRANDING_INVALID', `${message} Nothing was exported. Update the company letterhead in Settings and retry.`);
}

/** Resolve page geometry before opening a PDF; every render uses the same safe content area. */
function reportPageGeometry(branding?: ReportPdfBranding) {
  if (!branding) return { pageWidth: PAGE[0], pageHeight: PAGE[1],
    marginLeft: MARGIN, marginRight: MARGIN, marginTop: MARGIN, marginBottom: MARGIN };
  const spec = branding.profile.letterhead;
  const sizes = { letter: PAGE, a4: [595.28, 841.89], legal: [612, 1008] };
  const geometry = sizes[spec.page.size];
  if (!geometry) brandingRefusal('The company letterhead page size is unsupported.');
  const [pageWidth, pageHeight] = spec.page.orientation === 'landscape' ? [geometry[1], geometry[0]] : geometry;
  const marginLeft = spec.page.marginsInches.left * 72;
  const marginRight = spec.page.marginsInches.right * 72;
  const marginTop = spec.page.marginsInches.top * 72;
  const marginBottom = spec.page.marginsInches.bottom * 72;
  const marginsValid = [marginLeft, marginRight, marginTop, marginBottom].every(n => Number.isFinite(n) && n >= 18 && n <= 288);
  if (!marginsValid || pageWidth - marginLeft - marginRight < 200) {
    brandingRefusal('Reporting letterhead requires margins of at least 0.25 inches and a content width of at least 200 points.');
  }
  return { pageWidth, pageHeight, marginLeft, marginRight, marginTop, marginBottom };
}

export class Writer {
  readonly pdf: InstanceType<typeof PDFDocument>;
  readonly pages: number[] = [];
  readonly replaced = 0;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marginLeft: number;
  private readonly marginTop: number;
  private readonly marginBottom: number;
  private readonly marginRight: number;
  private contentTop = MARGIN;
  private contentBottom = BOTTOM;
  private branding?: ReportPdfBranding;
  private headerLines: Array<{ text: string; style: Style; direction: Direction }> = [];
  private brandFooterLines: Array<{ text: string; direction: Direction }> = [];
  private logoWidth = 0;
  private logoHeight = 0;
  private logoImage?: ReturnType<Writer['pdf']['openImage']>;
  private y = MARGIN;
  private fonts = new Map<string, FontSpec>();
  private glyphFonts = new Map<string, string>();
  private chunks: Buffer[] = [];
  private completed: Promise<Buffer>;
  private coreDir = process.env.REPORT_PDF_NOTO_CORE_DIR ?? '/usr/share/fonts/truetype/noto';
  private cjkDir = process.env.REPORT_PDF_NOTO_CJK_DIR ?? '/usr/share/fonts/opentype/noto';

  constructor(identity: { title: string; exportId: string; exportedAt: string }, branding?: ReportPdfBranding) {
    const at = new Date(identity.exportedAt);
    if (Number.isNaN(at.getTime())) throw new Error('The export time is not a valid time; the PDF was not rendered.');
    const geometry = reportPageGeometry(branding);
    this.pageWidth = geometry.pageWidth;
    this.pageHeight = geometry.pageHeight;
    this.marginLeft = geometry.marginLeft;
    this.marginRight = geometry.marginRight;
    this.marginTop = geometry.marginTop;
    this.marginBottom = geometry.marginBottom;
    this.branding = branding;
    this.pdf = new PDFDocument({ size: [this.pageWidth, this.pageHeight], margin: MARGIN, bufferPages: true, autoFirstPage: false, info: {
      Title: identity.title, Subject: `Export ${identity.exportId}`, Producer: 'Concept2Cure Reporting', Creator: 'Concept2Cure', CreationDate: at, ModDate: at,
    } });
    this.completed = new Promise((resolve, reject) => {
      this.pdf.on('data', (chunk: Buffer) => this.chunks.push(chunk));
      this.pdf.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.pdf.on('error', reject);
    });
    if (!this.coreFont('NotoSans', false)) throw new ReportingPdfError(503, 'REPORT_PDF_FONTS_UNAVAILABLE', 'Reporting PDF fonts are unavailable on this deployment. Nothing was exported.');
    if (branding) this.prepareLetterhead(branding);
    this.newPage();
  }

  get contentWidth(): number { return this.pageWidth - this.marginLeft - this.marginRight; }

  private prepareLogo(logo?: Buffer): void {
    if (!logo) return;
    try {
      const image = this.pdf.openImage(logo);
      if (!image.width || !image.height || image.width > 4096 || image.height > 4096) brandingRefusal('The company logo dimensions are invalid.');
      const scale = Math.min(84 / image.width, 44 / image.height);
      this.logoWidth = image.width * scale;
      this.logoHeight = image.height * scale;
      this.logoImage = image;
    } catch { brandingRefusal('The saved company logo could not be rendered faithfully.'); }
  }

  private prepareLetterhead({ profile, logo }: ReportPdfBranding): void {
    this.prepareLogo(logo);
    const textWidth = this.contentWidth - (logo ? 96 : 0);
    const values = [
      { text: profile.companyName || profile.letterhead.brand.organizationName || '', style: { size: 14, bold: true } },
      ...[profile.address, profile.contact, profile.registrationDetails, profile.letterhead.header?.text, profile.letterhead.brand.confidentialityNotice]
        .filter(Boolean).map(text => ({ text: text!, style: { size: 8 } })),
    ];
    for (const value of values) {
      if (value.text) for (const line of this.wrap(value.text, value.style, textWidth)) this.headerLines.push({ ...line, style: value.style });
    }
    const headerHeight = Math.max(this.logoHeight, this.headerLines.reduce((height, line) => height + line.style.size + 4, 0));
    this.contentTop = this.marginTop + headerHeight + 16;
    const footerText = [profile.letterhead.footer?.text,
      profile.letterhead.footer?.showPageNumbers ? profile.letterhead.footer.pageNumberFormat || 'Page {PAGE} of {PAGES}' : undefined].filter(Boolean).join('\n');
    this.brandFooterLines = this.wrap(footerText.replaceAll('{PAGE}', '9999999').replaceAll('{PAGES}', '9999999'), { size: 8 }, this.contentWidth);
    if (!footerText) this.brandFooterLines = [];
    this.contentBottom = this.pageHeight - this.marginBottom - 28 - this.brandFooterLines.length * 13 - 12;
    if (this.contentBottom - this.contentTop < 180) brandingRefusal('The company letterhead leaves insufficient room for report content and mandatory export labels.');
  }

  private drawLetterhead(): void {
    if (!this.branding) return;
    const { profile, logo } = this.branding;
    if (this.logoImage && (profile.letterhead.brand.logo?.placement !== 'cover' || this.pages.length === 1)) {
      try { this.pdf.image(this.logoImage, this.marginLeft, this.marginTop, { width: this.logoWidth, height: this.logoHeight }); }
      catch { brandingRefusal('The saved company logo could not be rendered faithfully.'); }
    }
    const textX = this.marginLeft + (logo ? 96 : 0);
    const textWidth = this.contentWidth - (logo ? 96 : 0);
    let y = this.marginTop;
    const alignment = profile.letterhead.header?.alignment ?? 'left';
    for (const line of this.headerLines) {
      const remaining = textWidth - this.width(line.text, line.style);
      const x = textX + (alignment === 'center' ? remaining / 2 : alignment === 'right' ? remaining : 0);
      this.drawText(line.text, x, y, { ...line.style, direction: line.direction });
      y += line.style.size + 4;
    }
    this.pdf.save().strokeColor(`#${profile.letterhead.colors.accent}`).lineWidth(1.5)
      .moveTo(this.marginLeft, this.contentTop - 8).lineTo(this.pageWidth - this.marginRight, this.contentTop - 8).stroke().restore();
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
    this.drawLetterhead();
    this.y = this.contentTop;
  }
  /** Begin a caller-owned section on a new page; returns its one-based page. */
  startPage(): number {
    this.newPage();
    return this.pages.length;
  }
  reserve(height: number): number {
    if (this.y + height > this.contentBottom) this.newPage();
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
    for (const line of this.wrap(text, style, this.contentWidth - (style.indent ?? 0))) {
      const top = this.reserve(style.size + 5);
      this.drawText(line.text, this.marginLeft + (style.indent ?? 0), top, { ...style, direction: line.direction });
    }
    this.y += style.gap ?? 0;
  }
  stampPages(footer: (page: number, total: number) => string | string[], watermark?: string | ((page: number, total: number) => string | undefined)) {
    const total = this.pages.length;
    for (const page of this.pages) {
      this.pdf.switchToPage(page);
      const value = footer(page + 1, total);
      const lines = Array.isArray(value) ? value : [value];
      lines.forEach((text, index) => {
        const size = Math.min(8, 8 * this.contentWidth / Math.max(this.contentWidth, this.width(text, { size: 8 })));
        this.drawText(text, this.marginLeft, this.pageHeight - this.marginBottom + 2 - (lines.length - index - 1) * 11, { size, color: GREY });
      });
      if (this.branding) {
        const footerSpec = this.branding.profile.letterhead.footer;
        const text = [footerSpec?.text, footerSpec?.showPageNumbers ? footerSpec.pageNumberFormat || 'Page {PAGE} of {PAGES}' : undefined]
          .filter(Boolean).join('\n').replaceAll('{PAGE}', String(page + 1)).replaceAll('{PAGES}', String(total));
        const brandLines = text ? this.wrap(text, { size: 8 }, this.contentWidth) : [];
        if (brandLines.length > this.brandFooterLines.length) brandingRefusal('The company footer exceeds its reserved area.');
        const top = this.pageHeight - this.marginBottom - 28 - this.brandFooterLines.length * 13;
        brandLines.forEach((line, index) => this.drawText(line.text, this.marginLeft, top + index * 13, { size: 8, direction: line.direction }));
      }
      const mark = typeof watermark === 'function' ? watermark(page + 1, total) : watermark;
      if (mark) {
        this.pdf.save().opacity(0.18).translate(112, 440).rotate(-40);
        this.drawText(mark, 0, 0, { size: 40, color: '#777777', bold: true });
        this.pdf.restore();
      }
    }
  }
  async save(): Promise<Buffer> { this.pdf.end(); return this.completed; }
}
