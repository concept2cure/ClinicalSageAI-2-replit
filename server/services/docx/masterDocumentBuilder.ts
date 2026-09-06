/**
 * Master Document Builder — Template-based regulatory document generation.
 *
 * Capabilities:
 * 1. Copy client DOCX template → unpack ZIP → modify XML → repack
 * 2. String replacement across all XML files in the DOCX
 * 3. Direct XML injection (tables, regulatory elements, eCTD structures)
 * 4. From-scratch OOXML document generation
 * 5. eCTD backbone XML (ICH M8)
 * 6. ICSR XML (ICH E2B R3)
 * 7. Page rasterization for visual inspection
 * 8. PDF overlay for template finalization
 *
 * Uses JSZip for proper DOCX (ZIP) manipulation — no raw binary corruption.
 *
 * @module server/services/docx/masterDocumentBuilder
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import JSZip from 'jszip';
import { runDocxPdfPipeline } from '../docx-pdf-pipeline';
import { inlineMarksToText } from '../../export/inline-marks-to-text.js';
import { decodeHtmlEntities } from '../../export/decode-html-entities.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuildFromTemplateOptions {
  templatePath: string;
  replacements?: Record<string, string>;
  xmlInjections?: XmlInjection[];
  outputFormat?: 'docx' | 'pdf';
  projectName?: string;
  documentTitle?: string;
}

export interface XmlInjection {
  targetFile: string;
  position: 'before-close-body' | 'after-open-body' | 'replace-placeholder' | 'append-to-body';
  xml: string;
  placeholder?: string;
}

export interface BuildResult {
  outputPath: string;
  format: 'docx' | 'pdf' | 'xml';
  sizeBytes: number;
  replacementsApplied: number;
  xmlInjectionsApplied: number;
  buildDurationMs: number;
}

export interface DocumentSection {
  number: string;
  title: string;
  content: string;
  tables?: SectionTable[];
}

export interface SectionTable {
  caption: string;
  headers: string[];
  rows: string[][];
}

// ─── XML Helpers ──────────────────────────────────────────────────────────────

function escapeXml(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Strip invalid XML control chars
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Create OOXML paragraph (namespace on root only, not per-element) */
function ooxmlParagraph(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function ooxmlHeading(text: string, level: number = 1): string {
  return ooxmlParagraph(text, `Heading${level}`);
}

function ooxmlTable(headers: string[], rows: string[][], caption?: string): string {
  const gridCols = headers.map(() => '<w:gridCol w:w="2000"/>').join('');

  const headerCells = headers.map(h =>
    `<w:tc><w:tcPr><w:shd w:val="clear" w:fill="F2F2F2"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p></w:tc>`
  ).join('');

  const dataRows = rows.map(row => {
    const cells = row.map(cell =>
      `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`
    ).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');

  const captionXml = caption ? ooxmlParagraph(caption, 'Caption') : '';
  const tblW = `<w:tblW w:w="5000" w:type="pct"/>`;
  const borders = `<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>`;

  return `${captionXml}<w:tbl><w:tblPr>${tblW}${borders}</w:tblPr><w:tblGrid>${gridCols}</w:tblGrid><w:tr>${headerCells}</w:tr>${dataRows}</w:tbl>`;
}

/** Convert HTML to OOXML paragraphs */
export function htmlToOoxml(html: string): string {
  /* Inline semantic marks BEFORE anything else. Every structural rule below
     strips inner tags with `replace(/<[^>]+>/g, '')`, which deletes a tag and
     inserts nothing — so `10<sup>6</sup>` became `106`, and an unresolved
     `<del>`/`<ins>` was silently settled into the built .docx. Shared with the
     eCTD leaf renderer, which had the identical defect; see
     server/export/inline-marks-to-text.ts for the full account. */
  /* Entities are decoded LAST, by decodeHtmlEntities, not here. Decoding them
     first turned an author's `&lt; 0.05%` into a literal `<` that the very next
     rule read as a tag and deleted along with everything up to the next `>` —
     "Total impurities were &lt; 0.05% and assay was &gt; 98.0%" reached the
     built .docx as "Total impurities were  98.0%". See that module for the full
     account, including why leading the old chain with `&amp;` was what CAUSED
     the double-decode its comment claimed to prevent. */
  let text = inlineMarksToText(html);

  // Extract structure
  text = text
    .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (_, lvl, content) => `\n__H${lvl}__${content.replace(/<[^>]+>/g, '')}\n`)
    .replace(/<p[^>]*>(.*?)<\/p>/gi, (_, content) => `\n${content.replace(/<[^>]+>/g, '')}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, (_, content) => `\n__LI__${content.replace(/<[^>]+>/g, '')}`)
    .replace(/<[^>]+>/g, '')
    .trim();

  return text.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const headingMatch = line.match(/^__H(\d)__(.+)/);
      if (headingMatch) {
        return ooxmlHeading(decodeHtmlEntities(headingMatch[2].trim()), parseInt(headingMatch[1]));
      }
      if (line.startsWith('__LI__')) {
        const content = decodeHtmlEntities(line.replace('__LI__', '').trim());
        return ooxmlParagraph(`\u2022 ${content}`, 'ListParagraph');
      }
      return ooxmlParagraph(decodeHtmlEntities(line.trim()));
    })
    .join('');
}

// ─── Master Builder ───────────────────────────────────────────────────────────

export class MasterDocumentBuilder {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || join(process.cwd(), 'tmp', 'docbuilder');
  }

  /**
   * Build from uploaded DOCX template using proper ZIP extraction.
   *
   * Flow: read ZIP → extract XML files → apply replacements → inject XML → repack ZIP
   */
  async buildFromTemplate(options: BuildFromTemplateOptions): Promise<BuildResult> {
    const startTime = Date.now();
    const buildId = randomUUID().slice(0, 8);
    const outputDir = join(this.tempDir, buildId);
    await fs.mkdir(outputDir, { recursive: true });

    // Read and parse the DOCX as a ZIP
    const templateBuffer = await fs.readFile(options.templatePath);
    const zip = await JSZip.loadAsync(templateBuffer);

    let replacementsApplied = 0;
    let xmlInjectionsApplied = 0;

    // Process all XML files in the DOCX for string replacement
    if (options.replacements && Object.keys(options.replacements).length > 0) {
      const xmlFiles = Object.keys(zip.files).filter(name =>
        name.endsWith('.xml') || name.endsWith('.rels')
      );

      for (const fileName of xmlFiles) {
        let content = await zip.file(fileName)!.async('text');
        let modified = false;

        for (const [placeholder, value] of Object.entries(options.replacements)) {
          const regex = new RegExp(escapeRegExp(placeholder), 'g');
          const matches = content.match(regex);
          if (matches && matches.length > 0) {
            content = content.replace(regex, escapeXml(value));
            replacementsApplied += matches.length;
            modified = true;
          }
        }

        if (modified) {
          zip.file(fileName, content);
        }
      }
    }

    // Apply XML injections to specific files
    if (options.xmlInjections && options.xmlInjections.length > 0) {
      for (const injection of options.xmlInjections) {
        const targetFile = injection.targetFile || 'word/document.xml';
        const file = zip.file(targetFile);
        if (!file) continue;

        let content = await file.async('text');
        let applied = false;

        switch (injection.position) {
          case 'replace-placeholder':
            if (injection.placeholder) {
              const regex = new RegExp(escapeRegExp(injection.placeholder), 'g');
              if (regex.test(content)) {
                content = content.replace(regex, injection.xml);
                applied = true;
              }
            }
            break;
          case 'before-close-body':
          case 'append-to-body':
            if (content.includes('</w:body>')) {
              content = content.replace('</w:body>', `${injection.xml}</w:body>`);
              applied = true;
            }
            break;
          case 'after-open-body': {
            const bodyOpen = content.match(/<w:body[^>]*>/);
            if (bodyOpen) {
              content = content.replace(bodyOpen[0], `${bodyOpen[0]}${injection.xml}`);
              applied = true;
            }
            break;
          }
        }

        if (applied) {
          zip.file(targetFile, content);
          xmlInjectionsApplied++;
        }
      }
    }

    // Generate output DOCX
    const outputBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = (options.documentTitle || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const docxPath = join(outputDir, `${safeName}_${buildId}.docx`);
    await fs.writeFile(docxPath, outputBuffer);

    /* When the caller asked for PDF, convert the .docx through headless
       LibreOffice (canonical Word→PDF path — see
       docs/architecture/docx-pipeline-canonical-designation.md). The .docx
       is the source of truth; the PDF is a downstream rendering with native
       Word fidelity (fonts, headers/footers, page breaks, tables, styles).
       We never render PDF directly with reportlab. */
    if (options.outputFormat === 'pdf') {
      const pipeline = await runDocxPdfPipeline({ inputDocxPath: docxPath });
      const pdfStat = await fs.stat(pipeline.finalPdf);
      return {
        outputPath: pipeline.finalPdf,
        format: 'pdf',
        sizeBytes: pdfStat.size,
        replacementsApplied,
        xmlInjectionsApplied,
        buildDurationMs: Date.now() - startTime,
      };
    }

    return {
      outputPath: docxPath,
      format: 'docx',
      sizeBytes: outputBuffer.length,
      replacementsApplied,
      xmlInjectionsApplied,
      buildDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a complete DOCX from scratch with proper ZIP structure.
   */
  async generateFromScratch(options: {
    documentType: string;
    sections: DocumentSection[];
    agencies?: string[];
    outputFormat?: 'docx' | 'pdf' | 'xml';
    documentTitle?: string;
  }): Promise<BuildResult> {
    const startTime = Date.now();
    const buildId = randomUUID().slice(0, 8);
    const outputDir = join(this.tempDir, buildId);
    await fs.mkdir(outputDir, { recursive: true });

    // Build body XML from sections
    let bodyXml = '';
    for (const section of options.sections) {
      bodyXml += ooxmlHeading(`${section.number} ${section.title}`, 1);
      bodyXml += htmlToOoxml(section.content);
      if (section.tables) {
        for (const table of section.tables) {
          bodyXml += ooxmlTable(table.headers, table.rows, table.caption);
        }
      }
    }

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

    // XML-only output
    if (options.outputFormat === 'xml') {
      const outputPath = join(outputDir, `${options.documentTitle || 'document'}_${buildId}.xml`);
      await fs.writeFile(outputPath, documentXml, 'utf-8');
      const stats = await fs.stat(outputPath);
      return { outputPath, format: 'xml', sizeBytes: stats.size, replacementsApplied: 0, xmlInjectionsApplied: options.sections.length, buildDurationMs: Date.now() - startTime };
    }

    // Build valid DOCX ZIP structure
    const zip = new JSZip();

    // [Content_Types].xml
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    // _rels/.rels
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/document.xml
    zip.file('word/document.xml', documentXml);

    // word/_rels/document.xml.rels
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);

    const outputBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeName = (options.documentTitle || 'document').replace(/[^a-zA-Z0-9._-]/g, '_');
    const docxPath = join(outputDir, `${safeName}_${buildId}.docx`);
    await fs.writeFile(docxPath, outputBuffer);

    /* PDF requested → convert via headless LibreOffice (canonical Word→PDF
       path). The .docx remains on disk as the editable source. */
    if (options.outputFormat === 'pdf') {
      const pipeline = await runDocxPdfPipeline({ inputDocxPath: docxPath });
      const pdfStat = await fs.stat(pipeline.finalPdf);
      return {
        outputPath: pipeline.finalPdf,
        format: 'pdf',
        sizeBytes: pdfStat.size,
        replacementsApplied: 0,
        xmlInjectionsApplied: options.sections.length,
        buildDurationMs: Date.now() - startTime,
      };
    }

    return {
      outputPath: docxPath,
      format: 'docx',
      sizeBytes: outputBuffer.length,
      replacementsApplied: 0,
      xmlInjectionsApplied: options.sections.length,
      buildDurationMs: Date.now() - startTime,
    };
  }

  // generateEctdXml and generateIcsrXml were removed. The first emitted a
  // backbone with sequence 0000 and operation="new" hardcoded and no
  // checksums or regional structure; the second an ICSR skeleton around
  // whatever the caller passed. Neither was a regulatory artefact: the
  // backbone comes from services/ectd/assemble-from-core.ts and the ICSR
  // from services/ind-lifecycle/e2b-icsr-composer.ts.
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance: MasterDocumentBuilder | null = null;

export function getMasterDocumentBuilder(): MasterDocumentBuilder {
  if (!_instance) _instance = new MasterDocumentBuilder();
  return _instance;
}

export default MasterDocumentBuilder;
