/**
 * Template Render Adapter — binds a renderer-neutral {@link TemplateSpec} to
 * the platform's EXISTING generators. It introduces no new document engine:
 *
 *   • DOCX → maps the spec to a `DocxStyle` and calls the (now style-driven)
 *            `docxFactory.generateRegulatory(input, style)`.
 *   • PDF  → maps the spec to the styling options the existing
 *            `documentExportService.generatePDF(options)` already accepts
 *            (page size, margins, font family/size). The caller supplies the
 *            project/section selection; this adapter supplies the look.
 *
 * All unit conversion lives here: the spec speaks inches + points + hex; docx
 * wants twips + half-points; pdfkit wants points + standard font names.
 *
 * @module server/services/templates/templateRenderAdapter
 */

import { convertInchesToTwip } from 'docx';
import {
  generateRegulatory,
  DEFAULT_DOCX_STYLE,
  type DocxStyle,
  type DocxInput,
  type DocxOutput,
} from '../docx/docxFactory';
import { normalizeTemplateSpec, type TemplateSpec } from './templateSpec';

const POINTS_PER_INCH = 72;

function ptToHalfPt(pt: number): number {
  return Math.round(pt * 2);
}

function inchToTwip(inch: number): number {
  return convertInchesToTwip(inch);
}

/** Map a TemplateSpec to the docx-native `DocxStyle` the factory consumes. */
export function templateSpecToDocxStyle(input: TemplateSpec): DocxStyle {
  const spec = normalizeTemplateSpec(input);
  const d = DEFAULT_DOCX_STYLE;

  return {
    margins: {
      top: inchToTwip(spec.page.marginsInches.top),
      bottom: inchToTwip(spec.page.marginsInches.bottom),
      left: inchToTwip(spec.page.marginsInches.left),
      right: inchToTwip(spec.page.marginsInches.right),
    },
    fonts: {
      body: spec.typography.bodyFont,
      heading: spec.typography.headingFont,
      mono: spec.typography.monoFont,
    },
    fontSizes: {
      body: ptToHalfPt(spec.typography.bodySizePt),
      heading1: ptToHalfPt(spec.typography.heading1SizePt),
      heading2: ptToHalfPt(spec.typography.heading2SizePt),
      heading3: ptToHalfPt(spec.typography.heading3SizePt),
      footer: d.fontSizes.footer,
      tableBody: d.fontSizes.tableBody,
      tableHeader: d.fontSizes.tableHeader,
      coverTitle: ptToHalfPt(Math.max(spec.typography.heading1SizePt + 8, 20)),
      coverSubtitle: ptToHalfPt(spec.typography.heading1SizePt),
    },
    colors: {
      headerBg: spec.colors.tableHeaderBg,
      borderGray: spec.colors.tableBorder,
      textDark: spec.colors.text,
      textMuted: spec.colors.muted,
    },
    lineSpacing: Math.round(spec.typography.lineSpacing * 240),
    paragraphSpaceAfter: Math.round(spec.typography.paragraphSpaceAfterPt * 20),
    confidentialityNotice: spec.brand.confidentialityNotice ?? '',
    headerText: spec.header?.text,
    footerText: spec.footer?.text,
    footerShowPageNumbers: spec.footer?.showPageNumbers !== false,
    logo: spec.brand.logo
      ? {
          dataBase64: spec.brand.logo.dataBase64,
          mimeType: spec.brand.logo.mimeType,
          placement: spec.brand.logo.placement,
        }
      : undefined,
  };
}

/** Render `input` as a DOCX styled by `spec`, reusing the existing factory. */
export function renderDocxWithTemplate(
  spec: TemplateSpec,
  input: DocxInput,
): Promise<DocxOutput> {
  return generateRegulatory(input, templateSpecToDocxStyle(spec));
}

/**
 * The subset of `documentExportService.PDFExportOptions` that a template
 * controls. Returned so callers can spread it over their project-scoped PDF
 * export request — the existing PDF pipeline stays the single source of truth
 * for page assembly, bookmarks, and eCTD validation.
 */
export interface TemplatePdfStyleOptions {
  pageSize: 'letter' | 'a4';
  fontFamily: string;
  fontSize: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

// pdfkit ships only the 14 standard fonts; map common template faces to the
// closest standard family so the PDF pipeline never references a missing font.
function toStandardPdfFont(family: string): string {
  const f = family.toLowerCase();
  if (f.includes('courier') || f.includes('mono')) return 'Courier';
  if (
    f.includes('times') ||
    f.includes('georgia') ||
    f.includes('garamond') ||
    f.includes('serif')
  ) {
    return 'Times-Roman';
  }
  // Arial, Calibri, Helvetica, Verdana, and other sans → Helvetica.
  return 'Helvetica';
}

/** Map a TemplateSpec to the styling options the existing PDF exporter accepts. */
export function templateSpecToPdfOptions(input: TemplateSpec): TemplatePdfStyleOptions {
  const spec = normalizeTemplateSpec(input);
  return {
    // The existing exporter understands letter | a4; legal falls back to letter.
    pageSize: spec.page.size === 'a4' ? 'a4' : 'letter',
    fontFamily: toStandardPdfFont(spec.typography.bodyFont),
    fontSize: Math.round(spec.typography.bodySizePt),
    margins: {
      top: Math.round(spec.page.marginsInches.top * POINTS_PER_INCH),
      right: Math.round(spec.page.marginsInches.right * POINTS_PER_INCH),
      bottom: Math.round(spec.page.marginsInches.bottom * POINTS_PER_INCH),
      left: Math.round(spec.page.marginsInches.left * POINTS_PER_INCH),
    },
  };
}
