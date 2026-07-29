/**
 * Template Extractor — reads an uploaded document and reconstructs its
 * formatting as a {@link TemplateSpec}.
 *
 * This is the capability behind "AnA looks at the form you uploaded and
 * recreates the same fonts, logo, margins, header and footer." It reads the
 * OOXML inside a `.docx` (a zip) directly:
 *
 *   word/document.xml  → page size + margins (last <w:sectPr>)
 *   word/styles.xml    → default body font/size/colour + heading styles
 *   word/theme/*.xml   → resolve theme font references (minor/major latin)
 *   word/header*.xml   → running-header text + logo placement
 *   word/footer*.xml   → running-footer text + page-number detection
 *   word/media/*       → the embedded logo bytes
 *
 * It is intentionally tolerant: any part that is absent or unparseable falls
 * back to {@link DEFAULT_TEMPLATE_SPEC} and is reported in `warnings`, with an
 * overall `confidence` so AnA can say how sure it is and ask the user to
 * confirm before saving.
 *
 * PDF extraction is best-effort (page geometry only — a flat PDF carries no
 * style sheet), and is clearly flagged with low confidence.
 *
 * @module server/services/templates/templateExtractor
 */

import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import {
  DEFAULT_TEMPLATE_SPEC,
  normalizeTemplateSpec,
  type TemplateSpec,
  type TemplateNamedStyle,
  type Orientation,
  type PageSizeName,
} from './templateSpec';

export interface ExtractionResult {
  spec: TemplateSpec;
  /** 0–1 — how completely the source's formatting was recovered. */
  confidence: number;
  /** Human-readable notes on what could not be recovered. */
  warnings: string[];
  source: {
    kind: 'docx' | 'pdf';
    fileName?: string;
  };
}

const TWIPS_PER_INCH = 1440;
const EMU_PER_INCH = 914400;

// Standard page sizes in twips (width × height, portrait).
const PAGE_SIZES_TWIPS: Record<PageSizeName, { w: number; h: number }> = {
  letter: { w: 12240, h: 15840 },
  legal: { w: 12240, h: 20160 },
  a4: { w: 11906, h: 16838 },
};

// ── small XML helpers (targeted, namespace-agnostic) ─────────────────────────

/** First value of attribute `name` on a `<w:tag ...>` self-closing element. */
function tagAttrs(xml: string, tag: string): Record<string, string> | null {
  const m = xml.match(new RegExp(`<${tag}\\b([^>]*)/?>`));
  if (!m) return null;
  const attrs: Record<string, string> = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let a: RegExpExecArray | null;
  while ((a = re.exec(m[1])) !== null) attrs[a[1]] = a[2];
  return attrs;
}

function attrNum(attrs: Record<string, string> | null, name: string): number | undefined {
  if (!attrs) return undefined;
  const v = attrs[name];
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Map page dimensions (twips) to the closest named size + orientation. */
function classifyPage(
  wTwips: number,
  hTwips: number,
  orientAttr?: string,
): { size: PageSizeName; orientation: Orientation } {
  const orientation: Orientation =
    orientAttr === 'landscape' || wTwips > hTwips ? 'landscape' : 'portrait';
  // Compare against portrait dimensions regardless of orientation.
  const longEdge = Math.max(wTwips, hTwips);
  const shortEdge = Math.min(wTwips, hTwips);
  let best: PageSizeName = 'letter';
  let bestDist = Infinity;
  for (const name of Object.keys(PAGE_SIZES_TWIPS) as PageSizeName[]) {
    const { w, h } = PAGE_SIZES_TWIPS[name];
    const dist = Math.abs(longEdge - h) + Math.abs(shortEdge - w);
    if (dist < bestDist) {
      bestDist = dist;
      best = name;
    }
  }
  return { size: best, orientation };
}

// ── theme font resolution ────────────────────────────────────────────────────

interface ThemeFonts {
  minor?: string; // body
  major?: string; // headings
}

function parseThemeFonts(zip: AdmZip): ThemeFonts {
  const entry = zip.getEntry('word/theme/theme1.xml');
  if (!entry) return {};
  const xml = zip.readAsText(entry);
  const major = xml.match(/<a:majorFont>[\s\S]*?<a:latin\b[^>]*typeface="([^"]*)"/)?.[1];
  const minor = xml.match(/<a:minorFont>[\s\S]*?<a:latin\b[^>]*typeface="([^"]*)"/)?.[1];
  return { major, minor };
}

/**
 * Resolve a `<w:rFonts>` element to a concrete typeface, following theme
 * references (`w:asciiTheme="minorHAnsi"` → theme minor latin) when an
 * explicit `w:ascii` face is not present.
 */
function resolveFont(rFontsXml: string | undefined, theme: ThemeFonts): string | undefined {
  if (!rFontsXml) return undefined;
  const ascii = rFontsXml.match(/w:ascii="([^"]*)"/)?.[1];
  if (ascii) return ascii;
  const themeRef = rFontsXml.match(/w:asciiTheme="([^"]*)"/)?.[1];
  if (themeRef) {
    if (themeRef.startsWith('major')) return theme.major;
    if (themeRef.startsWith('minor')) return theme.minor;
  }
  return undefined;
}

// ── styles.xml parsing ─────────────────────────────────────────────────────

interface StyleInfo {
  styleId: string;
  name?: string;
  basedOn?: string;
  font?: string;
  sizePt?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

function parseStyles(
  zip: AdmZip,
  theme: ThemeFonts,
): { docDefault: StyleInfo | null; styles: StyleInfo[] } {
  const entry = zip.getEntry('word/styles.xml');
  if (!entry) return { docDefault: null, styles: [] };
  const xml = zip.readAsText(entry);

  // Document defaults (Normal text baseline).
  let docDefault: StyleInfo | null = null;
  const dd = xml.match(/<w:docDefaults>([\s\S]*?)<\/w:docDefaults>/)?.[1];
  if (dd) {
    const rFonts = dd.match(/<w:rFonts\b[^>]*>/)?.[0];
    const sz = attrNum(tagAttrs(dd, 'w:sz'), 'w:val');
    const color = dd.match(/<w:color\b[^>]*w:val="([^"]*)"/)?.[1];
    docDefault = {
      styleId: 'docDefaults',
      name: 'Document defaults',
      font: resolveFont(rFonts, theme),
      sizePt: sz !== undefined ? sz / 2 : undefined,
      color: color && color !== 'auto' ? color : undefined,
    };
  }

  // Named styles.
  const styles: StyleInfo[] = [];
  const styleRe = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(xml)) !== null) {
    const head = m[1];
    const body = m[2];
    const styleId = head.match(/w:styleId="([^"]*)"/)?.[1];
    if (!styleId) continue;
    const rFonts = body.match(/<w:rFonts\b[^>]*>/)?.[0];
    const sz = attrNum(tagAttrs(body, 'w:sz'), 'w:val');
    const color = body.match(/<w:color\b[^>]*w:val="([^"]*)"/)?.[1];
    styles.push({
      styleId,
      name: body.match(/<w:name\b[^>]*w:val="([^"]*)"/)?.[1],
      basedOn: body.match(/<w:basedOn\b[^>]*w:val="([^"]*)"/)?.[1],
      font: resolveFont(rFonts, theme),
      sizePt: sz !== undefined ? sz / 2 : undefined,
      bold: /<w:b\b[^>]*\/>|<w:b\b[^>]*>(?!<\/)/.test(body) ? true : undefined,
      italic: /<w:i\b[^>]*\/>/.test(body) ? true : undefined,
      color: color && color !== 'auto' ? color : undefined,
    });
  }

  return { docDefault, styles };
}

function findStyle(styles: StyleInfo[], ...matchers: RegExp[]): StyleInfo | undefined {
  for (const re of matchers) {
    const hit = styles.find(
      s => re.test(s.styleId) || (s.name !== undefined && re.test(s.name)),
    );
    if (hit) return hit;
  }
  return undefined;
}

// ── header / footer + logo ────────────────────────────────────────────────────

function collectText(xml: string): string {
  const parts: string[] = [];
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

const MEDIA_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
};

function extractLogo(
  zip: AdmZip,
  headerHasImage: boolean,
): TemplateSpec['brand']['logo'] | undefined {
  const mediaEntries = zip
    .getEntries()
    .filter(e => /^word\/media\/[^/]+\.(png|jpe?g|gif)$/i.test(e.entryName));
  if (mediaEntries.length === 0) return undefined;
  // Prefer the smallest image — logos are typically small marks, not full-page art.
  mediaEntries.sort((a, b) => a.header.size - b.header.size);
  const chosen = mediaEntries[0];
  const ext = chosen.entryName.split('.').pop()!.toLowerCase();
  const bytes = chosen.getData();
  return {
    dataBase64: bytes.toString('base64'),
    mimeType: MEDIA_MIME[ext] ?? 'image/png',
    placement: headerHasImage ? 'header' : 'cover',
  };
}

// ── DOCX extraction ───────────────────────────────────────────────────────────

export function extractFromDocx(buffer: Buffer, fileName?: string): ExtractionResult {
  const warnings: string[] = [];
  let confidence = 0.5;

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return {
      spec: normalizeTemplateSpec({}),
      confidence: 0,
      warnings: ['File is not a readable .docx (could not open the OOXML package).'],
      source: { kind: 'docx', fileName },
    };
  }

  const theme = parseThemeFonts(zip);
  const { docDefault, styles } = parseStyles(zip, theme);

  // Page geometry from the last <w:sectPr> in document.xml.
  const docEntry = zip.getEntry('word/document.xml');
  const docXml = docEntry ? zip.readAsText(docEntry) : '';
  const sectPrMatches = docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g);
  const lastSectPr = sectPrMatches ? sectPrMatches[sectPrMatches.length - 1] : undefined;

  const partial: Record<string, any> = {};

  if (lastSectPr) {
    const pgSz = tagAttrs(lastSectPr, 'w:pgSz');
    const pgMar = tagAttrs(lastSectPr, 'w:pgMar');
    const w = attrNum(pgSz, 'w:w');
    const h = attrNum(pgSz, 'w:h');
    if (w && h) {
      const { size, orientation } = classifyPage(w, h, pgSz?.['w:orient']);
      partial.page = { ...(partial.page ?? {}), size, orientation };
      confidence += 0.15;
    } else {
      warnings.push('Page size not found; using letter.');
    }
    const top = attrNum(pgMar, 'w:top');
    const bottom = attrNum(pgMar, 'w:bottom');
    const left = attrNum(pgMar, 'w:left');
    const right = attrNum(pgMar, 'w:right');
    if ([top, bottom, left, right].every(v => v !== undefined)) {
      partial.page = {
        ...(partial.page ?? {}),
        marginsInches: {
          top: round2(top! / TWIPS_PER_INCH),
          bottom: round2(bottom! / TWIPS_PER_INCH),
          left: round2(left! / TWIPS_PER_INCH),
          right: round2(right! / TWIPS_PER_INCH),
        },
      };
      confidence += 0.15;
    } else {
      warnings.push('Page margins not fully found; using defaults.');
    }
  } else {
    warnings.push('No section properties found; using default page geometry.');
  }

  // Typography from styles.
  const normal = findStyle(styles, /^Normal$/i, /^normal$/i);
  const h1 = findStyle(styles, /^Heading1$/i, /^heading 1$/i);
  const h2 = findStyle(styles, /^Heading2$/i, /^heading 2$/i);
  const h3 = findStyle(styles, /^Heading3$/i, /^heading 3$/i);

  const bodyFont = normal?.font ?? docDefault?.font ?? theme.minor;
  const headingFont = h1?.font ?? theme.major ?? bodyFont;
  const typography: Record<string, any> = {};
  if (bodyFont) {
    typography.bodyFont = bodyFont;
    confidence += 0.1;
  } else {
    warnings.push('Body font not found; using Times New Roman.');
  }
  if (headingFont) {
    typography.headingFont = headingFont;
    confidence += 0.1;
  } else {
    warnings.push('Heading font not found; using Arial.');
  }
  if (normal?.sizePt) typography.bodySizePt = normal.sizePt;
  else if (docDefault?.sizePt) typography.bodySizePt = docDefault.sizePt;
  if (h1?.sizePt) typography.heading1SizePt = h1.sizePt;
  if (h2?.sizePt) typography.heading2SizePt = h2.sizePt;
  if (h3?.sizePt) typography.heading3SizePt = h3.sizePt;
  if (Object.keys(typography).length > 0) partial.typography = typography;

  const colors: Record<string, any> = {};
  const textColor = normal?.color ?? docDefault?.color;
  if (textColor) colors.text = textColor;
  if (Object.keys(colors).length > 0) partial.colors = colors;

  // Header / footer text + page-number detection.
  const headerEntries = zip
    .getEntries()
    .filter(e => /^word\/header\d*\.xml$/i.test(e.entryName));
  const footerEntries = zip
    .getEntries()
    .filter(e => /^word\/footer\d*\.xml$/i.test(e.entryName));

  let headerHasImage = false;
  const headerTexts: string[] = [];
  for (const e of headerEntries) {
    const xml = zip.readAsText(e);
    if (/<w:drawing\b|<a:blip\b|<w:pict\b/.test(xml)) headerHasImage = true;
    const t = collectText(xml);
    if (t) headerTexts.push(t);
  }
  if (headerTexts.length > 0 || headerHasImage) {
    partial.header = {
      text: headerTexts[0] || undefined,
      showLogo: headerHasImage,
      alignment: 'right',
    };
  }

  let footerHasPageNumber = false;
  const footerTexts: string[] = [];
  for (const e of footerEntries) {
    const xml = zip.readAsText(e);
    if (/PAGE\b|NUMPAGES\b|<w:pgNum\b|w:fldCharType/.test(xml)) footerHasPageNumber = true;
    const t = collectText(xml).replace(/PAGE|NUMPAGES/g, '').trim();
    if (t) footerTexts.push(t);
  }
  partial.footer = {
    text: footerTexts[0] || undefined,
    showPageNumbers: footerHasPageNumber || footerEntries.length === 0,
    pageNumberFormat: DEFAULT_TEMPLATE_SPEC.footer!.pageNumberFormat,
  };

  // Logo.
  const logo = extractLogo(zip, headerHasImage);
  if (logo) {
    partial.brand = { ...(partial.brand ?? {}), logo };
  } else {
    warnings.push('No embedded logo image found.');
  }

  // Named styles (informational, capped).
  const namedStyles: TemplateNamedStyle[] = styles
    .filter(s => /^(Normal|Title|Heading\d|TOC|Caption)/i.test(s.styleId) || s.sizePt !== undefined)
    .slice(0, 40)
    .map(s => ({
      styleId: s.styleId,
      name: s.name,
      basedOn: s.basedOn,
      font: s.font,
      sizePt: s.sizePt,
      bold: s.bold,
      italic: s.italic,
      color: s.color,
    }));
  if (namedStyles.length > 0) partial.namedStyles = namedStyles;

  const spec = normalizeTemplateSpec({ ...partial });

  return {
    spec,
    confidence: Math.min(0.95, round2(confidence)),
    warnings,
    source: { kind: 'docx', fileName },
  };
}

// ── PDF extraction (best-effort: page geometry only) ──────────────────────────

export async function extractFromPdf(buffer: Buffer, fileName?: string): Promise<ExtractionResult> {
  const warnings: string[] = [
    'PDF carries no style sheet — fonts, margins, header and footer cannot be recovered reliably. Page size was detected; everything else uses defaults. Upload the Word (.docx) source for full fidelity.',
  ];
  const partial: Record<string, any> = {};
  let confidence = 0.2;

  try {
    const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
    const page = pdf.getPageCount() > 0 ? pdf.getPage(0) : undefined;
    if (page) {
      const { width, height } = page.getSize(); // points (1/72in)
      const wTwips = (width / 72) * TWIPS_PER_INCH;
      const hTwips = (height / 72) * TWIPS_PER_INCH;
      const { size, orientation } = classifyPage(wTwips, hTwips);
      partial.page = { size, orientation };
      confidence += 0.1;
    }
  } catch {
    warnings.push('Could not open the PDF to read its page size; using letter.');
  }

  return {
    spec: normalizeTemplateSpec(partial),
    confidence: round2(confidence),
    warnings,
    source: { kind: 'pdf', fileName },
  };
}

/** Dispatch by file extension / declared mime. */
export async function extractTemplateFromFile(
  buffer: Buffer,
  fileName: string,
  mimeType?: string,
): Promise<ExtractionResult> {
  const lower = fileName.toLowerCase();
  const isPdf = lower.endsWith('.pdf') || mimeType === 'application/pdf';
  if (isPdf) return extractFromPdf(buffer, fileName);
  return extractFromDocx(buffer, fileName);
}

export const EMU_PER_INCH_CONST = EMU_PER_INCH;
