/**
 * DOCX Factory — Centralized regulatory document generator
 *
 * Architecture:
 *   AI Agent → structured JSON → docxFactory → formatted Word document
 *
 * Features:
 *   - Consistent regulatory formatting (fonts, margins, headers, footers)
 *   - Section-based document assembly from structured data
 *   - Table generation with proper FDA/EMA formatting
 *   - Dual output: .docx binary + .source.json for regeneration
 *   - Shared style constants across all document types
 *
 * @module server/services/docx/docxFactory
 */

// DOCX Runtime: JS docx v9.5.1 (canonical)
// Owner: document-export team
// See: docs/architecture/docx-pipeline-canonical-designation.md

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  PageBreak,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import { imageSize, fitWithin } from '../templates/imageSize';

// ═══════════════════════════════════════════════════════════════════════════════
// STYLE MODEL — formatting is data, not hard-coded constants.
//
// `DocxStyle` is expressed in docx-native units (twips for lengths, half-points
// for font sizes, 6-digit hex for colours) so this module stays self-consistent.
// A client `TemplateSpec` (inches / points) is converted into a `DocxStyle` by
// `server/services/templates/templateRenderAdapter.ts`. Callers that pass
// nothing get `DEFAULT_DOCX_STYLE`, which reproduces the original hard-coded
// regulatory look exactly — so existing callers are unaffected.
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocxLogo {
  /** image bytes, base64-encoded (no data: prefix) */
  dataBase64: string;
  mimeType: string;
  placement: 'cover' | 'header';
}

export interface DocxStyle {
  /** page margins in twips */
  margins: { top: number; bottom: number; left: number; right: number };
  fonts: { body: string; heading: string; mono: string };
  /** font sizes in half-points */
  fontSizes: {
    body: number;
    heading1: number;
    heading2: number;
    heading3: number;
    footer: number;
    tableBody: number;
    tableHeader: number;
    coverTitle: number;
    coverSubtitle: number;
  };
  colors: { headerBg: string; borderGray: string; textDark: string; textMuted: string };
  /** line spacing in 240ths (240 = single, 276 = 1.15×) */
  lineSpacing: number;
  /** space after each body paragraph, in twips */
  paragraphSpaceAfter: number;
  confidentialityNotice: string;
  headerText?: string;
  footerText?: string;
  footerShowPageNumbers: boolean;
  logo?: DocxLogo;
}

/** The canonical regulatory look (Times New Roman 12pt body, Arial headings). */
export const DEFAULT_DOCX_STYLE: DocxStyle = {
  margins: {
    top: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1.25),
    right: convertInchesToTwip(1),
  },
  fonts: { body: 'Times New Roman', heading: 'Arial', mono: 'Courier New' },
  fontSizes: {
    body: 24, // 12pt
    heading1: 32, // 16pt
    heading2: 28, // 14pt
    heading3: 24, // 12pt
    footer: 18, // 9pt
    tableBody: 20, // 10pt
    tableHeader: 20, // 10pt
    coverTitle: 48, // 24pt
    coverSubtitle: 32, // 16pt
  },
  colors: {
    headerBg: 'E2E8F0',
    borderGray: 'BBBBBB',
    textDark: '1A1A1A',
    textMuted: '666666',
  },
  lineSpacing: 276,
  paragraphSpaceAfter: 120,
  confidentialityNotice: 'CONFIDENTIAL — For Regulatory Use Only',
  footerShowPageNumbers: true,
};

function tableBorder(style: DocxStyle) {
  const b = { style: BorderStyle.SINGLE, size: 1, color: style.colors.borderGray };
  return { top: b, bottom: b, left: b, right: b };
}

/** Build an ImageRun for a logo, sized to its true aspect ratio within a box. */
function logoImageRun(logo: DocxLogo, maxWidthPx: number, maxHeightPx: number): ImageRun | null {
  try {
    const bytes = Buffer.from(logo.dataBase64, 'base64');
    if (bytes.length === 0) return null;
    const intrinsic = imageSize(bytes);
    const { width, height } = intrinsic
      ? fitWithin(intrinsic.width, intrinsic.height, maxWidthPx, maxHeightPx)
      : { width: maxWidthPx, height: maxHeightPx };
    const type = logo.mimeType.includes('png')
      ? 'png'
      : logo.mimeType.includes('gif')
        ? 'gif'
        : 'jpg';
    return new ImageRun({
      data: bytes,
      transformation: { width, height },
      type: type as any,
    });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DocxSection {
  /** Section heading */
  title: string;
  /** CTD section code (e.g., "2.7.1") */
  sectionCode?: string;
  /** Body paragraphs — each string becomes a paragraph */
  paragraphs: string[];
  /** Optional bulleted list items */
  bulletItems?: string[];
  /** Optional numbered list items */
  numberedItems?: string[];
  /** Optional tables within this section */
  tables?: DocxTable[];
  /** Page break before this section */
  pageBreak?: boolean;
}

export interface DocxTable {
  /** Table caption */
  caption?: string;
  /** Column headers */
  headers: string[];
  /** Row data — each inner array matches headers */
  rows: string[][];
}

export interface DocxMetadata {
  /** Document title (cover page) */
  title: string;
  /** Submission type: CER, 510K, IND, NDA, etc. */
  submissionType: string;
  /** Sponsor / organization name */
  sponsor?: string;
  /** Product / device / drug name */
  product?: string;
  /** Regulatory region: FDA, EMA, PMDA, etc. */
  region?: string;
  /** Document version */
  version?: string;
  /** Document date */
  date?: string;
  /** Project ID for traceability */
  projectId?: string;
}

export interface DocxInput {
  metadata: DocxMetadata;
  sections: DocxSection[];
}

export interface DocxOutput {
  /** The Word document as a Node.js Buffer */
  buffer: Buffer;
  /** JSON source for regeneration */
  source: DocxInput;
  /** Suggested filename */
  filename: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARAGRAPH BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function bodyParagraph(text: string, style: DocxStyle): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: style.fonts.body,
        size: style.fontSizes.body,
        color: style.colors.textDark,
      }),
    ],
    spacing: { after: style.paragraphSpaceAfter, line: style.lineSpacing },
  });
}

function sectionHeading(
  title: string,
  level: 1 | 2 | 3,
  style: DocxStyle,
  sectionCode?: string,
): Paragraph {
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  } as const;

  const sizeMap = {
    1: style.fontSizes.heading1,
    2: style.fontSizes.heading2,
    3: style.fontSizes.heading3,
  } as const;

  const displayTitle = sectionCode ? `${sectionCode}  ${title}` : title;

  return new Paragraph({
    text: displayTitle,
    heading: headingMap[level],
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: displayTitle,
        font: style.fonts.heading,
        size: sizeMap[level],
        bold: true,
        color: style.colors.textDark,
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a docx Table plus its optional caption paragraph, styled per `style`.
 * Returned as an ordered array so callers can splice it straight into a
 * section's children.
 */
function buildTable(table: DocxTable, style: DocxStyle): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const borders = tableBorder(style);

  // Caption above table
  if (table.caption) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: table.caption,
            font: style.fonts.body,
            size: style.fontSizes.body,
            bold: true,
            italics: true,
          }),
        ],
        spacing: { before: 120, after: 60 },
      })
    );
  }

  // Header row
  const headerRow = new TableRow({
    tableHeader: true,
    children: table.headers.map(
      h =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  font: style.fonts.body,
                  size: style.fontSizes.tableHeader,
                  bold: true,
                }),
              ],
            }),
          ],
          shading: { type: ShadingType.SOLID, color: style.colors.headerBg },
          borders,
        })
    ),
  });

  // Data rows
  const dataRows = table.rows.map(
    row =>
      new TableRow({
        children: row.map(
          cell =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cell || '—',
                      font: style.fonts.body,
                      size: style.fontSizes.tableBody,
                    }),
                  ],
                }),
              ],
              borders,
            })
        ),
      })
  );

  elements.push(
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    })
  );

  return elements;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function buildCoverPage(meta: DocxMetadata, style: DocxStyle): Paragraph[] {
  const elements: Paragraph[] = [];

  // Brand logo (if the template carries one for the cover)
  if (style.logo && style.logo.placement === 'cover') {
    const run = logoImageRun(style.logo, 220, 90);
    if (run) {
      elements.push(new Paragraph({ spacing: { before: 800, after: 240 } }));
      elements.push(new Paragraph({ children: [run], alignment: AlignmentType.CENTER }));
      // Smaller top spacer when a logo is present
      elements.push(new Paragraph({ spacing: { before: 600 } }));
    } else {
      elements.push(new Paragraph({ spacing: { before: 2400 } }));
    }
  } else {
    // Spacer
    elements.push(new Paragraph({ spacing: { before: 2400 } }));
  }

  // Title
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: meta.title,
          font: style.fonts.heading,
          size: style.fontSizes.coverTitle,
          bold: true,
          color: style.colors.textDark,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    })
  );

  // Submission type
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: meta.submissionType.toUpperCase(),
          font: style.fonts.heading,
          size: style.fontSizes.coverSubtitle,
          color: style.colors.textMuted,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Metadata lines
  const lines: string[] = [];
  if (meta.sponsor) lines.push(`Sponsor: ${meta.sponsor}`);
  if (meta.product) lines.push(`Product: ${meta.product}`);
  if (meta.region) lines.push(`Regulatory Region: ${meta.region}`);
  if (meta.version) lines.push(`Version: ${meta.version}`);
  lines.push(`Date: ${meta.date || new Date().toISOString().split('T')[0]}`);

  for (const line of lines) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line,
            font: style.fonts.body,
            size: style.fontSizes.body,
            color: style.colors.textMuted,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      })
    );
  }

  // Confidentiality notice
  if (style.confidentialityNotice) {
    elements.push(new Paragraph({ spacing: { before: 600 } }));
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: style.confidentialityNotice,
            font: style.fonts.body,
            size: style.fontSizes.footer,
            italics: true,
            color: style.colors.textMuted,
          }),
        ],
        alignment: AlignmentType.CENTER,
      })
    );
  }

  return elements;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT ASSEMBLY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a regulatory DOCX from structured input.
 *
 * @param input - Metadata + sections with paragraphs and tables
 * @returns Buffer + JSON source + suggested filename
 */
export async function generateRegulatory(
  input: DocxInput,
  style: DocxStyle = DEFAULT_DOCX_STYLE,
): Promise<DocxOutput> {
  const { metadata, sections } = input;

  // Cover page section
  const coverChildren = buildCoverPage(metadata, style);

  // Content sections
  const contentChildren: (Paragraph | Table)[] = [];

  for (const section of sections) {
    // Page break before section (if requested)
    if (section.pageBreak) {
      contentChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    // Section heading
    const headingLevel = section.sectionCode
      ? section.sectionCode.split('.').length <= 2
        ? 1
        : 2
      : 1;
    contentChildren.push(
      sectionHeading(section.title, headingLevel as 1 | 2 | 3, style, section.sectionCode)
    );

    // Body paragraphs
    for (const text of section.paragraphs) {
      contentChildren.push(bodyParagraph(text, style));
    }

    // Bulleted list items
    if (section.bulletItems) {
      for (const item of section.bulletItems) {
        contentChildren.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [
              new TextRun({
                text: item,
                font: style.fonts.body,
                size: style.fontSizes.body,
                color: style.colors.textDark,
              }),
            ],
            spacing: { after: 60 },
          })
        );
      }
    }

    // Numbered list items
    if (section.numberedItems) {
      for (const item of section.numberedItems) {
        contentChildren.push(
          new Paragraph({
            numbering: { reference: 'regulatory-numbered-list', level: 0 },
            children: [
              new TextRun({
                text: item,
                font: style.fonts.body,
                size: style.fontSizes.body,
                color: style.colors.textDark,
              }),
            ],
            spacing: { after: 60 },
          })
        );
      }
    }

    // Tables
    if (section.tables) {
      for (const table of section.tables) {
        contentChildren.push(...buildTable(table, style));
        // Spacing after table
        contentChildren.push(new Paragraph({ spacing: { after: 200 } }));
      }
    }
  }

  // Running header — optional logo + title line.
  const headerChildren: (TextRun | ImageRun)[] = [];
  if (style.logo && style.logo.placement === 'header') {
    const run = logoImageRun(style.logo, 130, 40);
    if (run) headerChildren.push(run);
  }
  headerChildren.push(
    new TextRun({
      text: style.headerText ?? `${metadata.title} — ${metadata.submissionType}`,
      font: style.fonts.body,
      size: style.fontSizes.footer,
      color: style.colors.textMuted,
    })
  );

  // Running footer — optional label + page numbers.
  const footerRuns: TextRun[] = [];
  const footerLabel = style.footerText ?? 'CONFIDENTIAL';
  if (footerLabel) {
    footerRuns.push(
      new TextRun({
        text: style.footerShowPageNumbers ? `${footerLabel}  |  ` : footerLabel,
        font: style.fonts.body,
        size: style.fontSizes.footer,
        color: style.colors.textMuted,
      })
    );
  }
  if (style.footerShowPageNumbers) {
    footerRuns.push(
      new TextRun({
        children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
        font: style.fonts.body,
        size: style.fontSizes.footer,
        color: style.colors.textMuted,
      })
    );
  }

  // Build document
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'regulatory-numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      // Cover page
      {
        properties: {
          page: { margin: style.margins },
        },
        children: coverChildren,
      },
      // Content
      {
        properties: {
          page: {
            margin: style.margins,
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: headerChildren,
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: footerRuns,
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: contentChildren,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  // Sanitize filename
  const safeName = metadata.title.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
  const dateStr = (metadata.date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const filename = `${safeName}_${metadata.submissionType}_${dateStr}.docx`;

  return {
    buffer,
    source: input,
    filename,
  };
}
