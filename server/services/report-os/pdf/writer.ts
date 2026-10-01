/**
 * The text writer both report PDFs share (run-pdf.ts, bundle-pdf.ts): it wraps
 * lines, starts new pages and never drops text; a character the font cannot
 * encode prints as "?" and is counted; every page gets a footer.
 *
 * @module server/services/report-os/pdf/writer
 */
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';

export const PAGE: [number, number] = [612, 792];
export const MARGIN = 50;
const WIDTH = PAGE[0] - MARGIN * 2;
const TOP = PAGE[1] - MARGIN;
const BOTTOM = MARGIN + 24; // leave room for the footer
export const GREY = rgb(0.35, 0.35, 0.35);

export const iso = (v: Date | string | null | undefined): string =>
  v instanceof Date ? v.toISOString() : typeof v === 'string' && v ? v : 'not recorded';

export interface Style {
  size: number;
  bold?: boolean;
  indent?: number;
  color?: ReturnType<typeof rgb>;
  gap?: number;
}

/** A top-to-bottom writer that wraps lines and starts new pages; it never drops text. */
export class Writer {
  readonly pages: PDFPage[] = [];
  private page!: PDFPage;
  private y = TOP;
  replaced = 0;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  private newPage() {
    this.page = this.pdf.addPage(PAGE);
    this.pages.push(this.page);
    this.y = TOP;
  }

  /** The text with every character the font cannot encode replaced by '?', counted. */
  private encodable(text: string, font: PDFFont): string {
    let out = '';
    for (const ch of text.replace(/[\r\t]/g, ' ')) {
      try {
        font.encodeText(ch);
        out += ch;
      } catch {
        out += '?';
        this.replaced += 1;
      }
    }
    return out;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const word of paragraph.split(/ +/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width || !line) {
          line = next;
        } else {
          lines.push(line);
          line = word;
        }
        // A single word wider than the line is broken by characters.
        while (font.widthOfTextAtSize(line, size) > width && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > width) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      }
      lines.push(line);
    }
    return lines;
  }

  write(text: string, style: Style) {
    const font = style.bold ? this.bold : this.regular;
    const indent = style.indent ?? 0;
    const lineHeight = style.size + 4;
    for (const line of this.wrap(this.encodable(text, font), font, style.size, WIDTH - indent)) {
      if (this.y - lineHeight < BOTTOM) this.newPage();
      this.y -= lineHeight;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size: style.size, font, color: style.color });
    }
    this.y -= style.gap ?? 0;
  }
}

/** The footer on every page, "page n of N" included by the caller's text. */
export function stampFooters(w: Writer, font: PDFFont, footer: (page: number, total: number) => string) {
  const total = w.pages.length;
  w.pages.forEach((page, i) => {
    page.drawText(footer(i + 1, total), { x: MARGIN, y: MARGIN - 10, size: 8, font, color: GREY });
  });
}
