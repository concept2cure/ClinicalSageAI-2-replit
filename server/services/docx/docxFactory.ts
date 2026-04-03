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

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
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

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES — Shared regulatory formatting constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Standard page margins for regulatory submissions (1 inch all sides) */
const PAGE_MARGINS = {
  top: convertInchesToTwip(1),
  bottom: convertInchesToTwip(1),
  left: convertInchesToTwip(1.25),
  right: convertInchesToTwip(1),
};

/** Regulatory-compliant font settings */
const FONTS = {
  body: 'Times New Roman',
  heading: 'Arial',
  mono: 'Courier New',
} as const;

const FONT_SIZES = {
  body: 24, // 12pt (half-points)
  heading1: 32, // 16pt
  heading2: 28, // 14pt
  heading3: 24, // 12pt bold
  footer: 18, // 9pt
  tableBody: 20, // 10pt
  tableHeader: 20, // 10pt bold
} as const;

const COLORS = {
  headerBg: 'E2E8F0',
  borderGray: 'BBBBBB',
  textDark: '1A1A1A',
  textMuted: '666666',
} as const;

const TABLE_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.borderGray },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.borderGray },
  left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.borderGray },
  right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.borderGray },
} as const;

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

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        font: FONTS.body,
        size: FONT_SIZES.body,
        color: COLORS.textDark,
      }),
    ],
    spacing: { after: 120, line: 276 }, // 1.15 line spacing
  });
}

function sectionHeading(title: string, level: 1 | 2 | 3 = 1, sectionCode?: string): Paragraph {
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  } as const;

  const sizeMap = {
    1: FONT_SIZES.heading1,
    2: FONT_SIZES.heading2,
    3: FONT_SIZES.heading3,
  } as const;

  const displayTitle = sectionCode ? `${sectionCode}  ${title}` : title;

  return new Paragraph({
    text: displayTitle,
    heading: headingMap[level],
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: displayTitle,
        font: FONTS.heading,
        size: sizeMap[level],
        bold: true,
        color: COLORS.textDark,
      }),
    ],
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

function buildTable(table: DocxTable): Paragraph[] {
  const elements: Paragraph[] = [];

  // Caption above table
  if (table.caption) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: table.caption,
            font: FONTS.body,
            size: FONT_SIZES.body,
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
                  font: FONTS.body,
                  size: FONT_SIZES.tableHeader,
                  bold: true,
                }),
              ],
            }),
          ],
          shading: { type: ShadingType.SOLID, color: COLORS.headerBg },
          borders: TABLE_BORDER,
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
                      font: FONTS.body,
                      size: FONT_SIZES.tableBody,
                    }),
                  ],
                }),
              ],
              borders: TABLE_BORDER,
            })
        ),
      })
  );

  const docTable = new Table({
    rows: [headerRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });

  // Tables can't be in the elements array directly — they go into section children
  // We return the caption paragraph; the table is handled separately
  return elements;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════════════════════════════════════

function buildCoverPage(meta: DocxMetadata): Paragraph[] {
  const elements: Paragraph[] = [];

  // Spacer
  elements.push(new Paragraph({ spacing: { before: 2400 } }));

  // Title
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: meta.title,
          font: FONTS.heading,
          size: 48, // 24pt
          bold: true,
          color: COLORS.textDark,
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
          font: FONTS.heading,
          size: 32,
          color: COLORS.textMuted,
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
            font: FONTS.body,
            size: FONT_SIZES.body,
            color: COLORS.textMuted,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      })
    );
  }

  // Confidentiality notice
  elements.push(new Paragraph({ spacing: { before: 600 } }));
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'CONFIDENTIAL — For Regulatory Use Only',
          font: FONTS.body,
          size: FONT_SIZES.footer,
          italics: true,
          color: COLORS.textMuted,
        }),
      ],
      alignment: AlignmentType.CENTER,
    })
  );

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
export async function generateRegulatory(input: DocxInput): Promise<DocxOutput> {
  const { metadata, sections } = input;

  // Cover page section
  const coverChildren = buildCoverPage(metadata);

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
      sectionHeading(section.title, headingLevel as 1 | 2 | 3, section.sectionCode)
    );

    // Body paragraphs
    for (const text of section.paragraphs) {
      contentChildren.push(bodyParagraph(text));
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
                font: FONTS.body,
                size: FONT_SIZES.body,
                color: COLORS.textDark,
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
                font: FONTS.body,
                size: FONT_SIZES.body,
                color: COLORS.textDark,
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
        // Caption
        if (table.caption) {
          contentChildren.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: table.caption,
                  font: FONTS.body,
                  size: FONT_SIZES.body,
                  bold: true,
                  italics: true,
                }),
              ],
              spacing: { before: 200, after: 80 },
            })
          );
        }

        // Table
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
                        font: FONTS.body,
                        size: FONT_SIZES.tableHeader,
                        bold: true,
                      }),
                    ],
                  }),
                ],
                shading: { type: ShadingType.SOLID, color: COLORS.headerBg },
                borders: TABLE_BORDER,
              })
          ),
        });

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
                            font: FONTS.body,
                            size: FONT_SIZES.tableBody,
                          }),
                        ],
                      }),
                    ],
                    borders: TABLE_BORDER,
                  })
              ),
            })
        );

        contentChildren.push(
          new Table({
            rows: [headerRow, ...dataRows],
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );

        // Spacing after table
        contentChildren.push(new Paragraph({ spacing: { after: 200 } }));
      }
    }
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
          page: { margin: PAGE_MARGINS },
        },
        children: coverChildren,
      },
      // Content
      {
        properties: {
          page: {
            margin: PAGE_MARGINS,
            pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${metadata.title} — ${metadata.submissionType}`,
                    font: FONTS.body,
                    size: FONT_SIZES.footer,
                    color: COLORS.textMuted,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'CONFIDENTIAL  |  ',
                    font: FONTS.body,
                    size: FONT_SIZES.footer,
                    color: COLORS.textMuted,
                  }),
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                    font: FONTS.body,
                    size: FONT_SIZES.footer,
                    color: COLORS.textMuted,
                  }),
                ],
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
