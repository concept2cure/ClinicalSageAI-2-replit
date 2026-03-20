import fs from 'fs/promises';
import PDFDocument from 'pdfkit';
import { Cluster } from 'puppeteer-cluster';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  TabStopPosition,
  TabStopType,
  NumberFormat,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import { stylePacks, StylePack } from './stylePacks/config';

const MAX_CONTENT_CHARS = 500000;
let clusterPromise: Promise<Cluster> | null = null;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeHeading = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function getCluster(): Promise<Cluster | null> {
  if (!clusterPromise) {
    clusterPromise = Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 2,
      puppeteerOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    }).catch(err => {
      console.warn(
        '[Renderers] Puppeteer cluster failed to launch – using PDFKit fallback:',
        err?.message || err
      );
      return null;
    });
  }
  return clusterPromise;
}

type SectionContent = {
  title: string;
  html: string;
  text: string;
};

function nodeToText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (Array.isArray(node.content)) {
    return node.content.map(nodeToText).join('');
  }
  return '';
}

function nodeToHtml(node: any): string {
  if (!node) return '';
  if (node.type === 'text') {
    return escapeHtml(node.text || '');
  }
  if (node.type === 'paragraph') {
    const text = (node.content || []).map(nodeToHtml).join('');
    return text.trim() ? `<p>${text}</p>` : '';
  }
  if (node.type === 'heading') {
    const text = escapeHtml(nodeToText(node).trim());
    const level = node.attrs?.level || 2;
    const safeLevel = Math.min(Math.max(level, 1), 4);
    return `<h${safeLevel}>${text}</h${safeLevel}>`;
  }
  if (node.type === 'bulletList') {
    const items = (node.content || []).map(nodeToHtml).join('');
    return items.trim() ? `<ul>${items}</ul>` : '';
  }
  if (node.type === 'orderedList') {
    const items = (node.content || []).map(nodeToHtml).join('');
    return items.trim() ? `<ol>${items}</ol>` : '';
  }
  if (node.type === 'listItem') {
    const items = (node.content || []).map(nodeToHtml).join('');
    return items.trim() ? `<li>${items}</li>` : '';
  }
  if (Array.isArray(node.content)) {
    return node.content.map(nodeToHtml).join('');
  }
  return '';
}

function extractSectionsFromEditor(editorJson: any): SectionContent[] {
  const content = Array.isArray(editorJson?.content) ? editorJson.content : [];
  const sections: SectionContent[] = [];

  let current: SectionContent | null = null;

  for (const node of content) {
    if (node.type === 'heading' && node.attrs?.level === 1) {
      if (current) sections.push(current);
      const title = nodeToText(node).trim() || 'Untitled Section';
      current = { title, html: '', text: '' };
      continue;
    }

    const html = nodeToHtml(node);
    const text = nodeToText(node);

    if (!current) {
      current = { title: 'Overview', html: '', text: '' };
    }

    if (html) {
      current.html += html;
    }
    if (text.trim()) {
      current.text += `${text}\n`;
    }
  }

  if (current) sections.push(current);

  return sections.map(section => {
    const html =
      section.html.length > MAX_CONTENT_CHARS
        ? section.html.slice(0, MAX_CONTENT_CHARS)
        : section.html;
    const text =
      section.text.length > MAX_CONTENT_CHARS
        ? section.text.slice(0, MAX_CONTENT_CHARS)
        : section.text;
    return { ...section, html, text };
  });
}

function selectSection(sections: SectionContent[], titleIncludes: string): SectionContent | null {
  const needle = normalizeHeading(titleIncludes);
  // Prefer exact title match first, then start-of-title, then substring
  const exact = sections.find(section => normalizeHeading(section.title) === needle);
  if (exact) return exact;
  const startsWith = sections.find(section => {
    const norm = normalizeHeading(section.title);
    // Match at word boundary: title starts with needle or contains " needle"
    return norm.startsWith(needle) || norm.includes(` ${needle}`);
  });
  if (startsWith) return startsWith;
  const substring = sections.find(section => normalizeHeading(section.title).includes(needle));
  return substring || null;
}

async function renderHtmlWithStylePack(htmlBody: string, pack: StylePack): Promise<string> {
  const [template, css] = await Promise.all([
    fs.readFile(pack.html, 'utf-8'),
    fs.readFile(pack.css, 'utf-8'),
  ]);

  const withCss = template.replace(
    '<style id="style-pack"></style>',
    `<style id="style-pack">${css}</style>`
  );

  return withCss.replace(
    '<main id="doc-content"></main>',
    `<main id="doc-content">${htmlBody}</main>`
  );
}

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const { buffer } = await renderHtmlToPdfTracked(html);
  return buffer;
}

/**
 * Same as renderHtmlToPdf but returns { buffer, usedFallback } so callers
 * can emit warnings when Puppeteer is unavailable.
 */
export async function renderHtmlToPdfTracked(
  html: string
): Promise<{ buffer: Buffer; usedFallback: boolean }> {
  const cluster = await getCluster();
  if (cluster) {
    const buffer: Buffer = await cluster.execute(async ({ page }) => {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    });
    return { buffer, usedFallback: false };
  }

  const buffer = await renderFallbackPdf(html);
  return { buffer, usedFallback: true };
}

function renderFallbackPdf(html: string): Promise<Buffer> {
  return new Promise(resolve => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    doc.fontSize(12).text(text || 'Document content not available.', {
      align: 'left',
    });

    doc.end();
  });
}

function buildSectionHtml(title: string, bodyHtml: string, fallback: string): string {
  const safeBody =
    bodyHtml && bodyHtml.trim().length > 0
      ? bodyHtml
      : `<p class="section-note">${escapeHtml(fallback)}</p>`;
  return `<h1>${escapeHtml(title)}</h1>${safeBody}`;
}

export async function renderPdfBuffersFor510k(
  content: any,
  pack: StylePack = stylePacks['510k_v1']
) {
  const sections = extractSectionsFromEditor(content);

  const cover = buildSectionHtml(
    'Cover Letter',
    selectSection(sections, 'Cover')?.html || '',
    'Cover letter content not found in the current document.'
  );
  const summary = buildSectionHtml(
    '510(k) Summary',
    selectSection(sections, 'Summary')?.html || '',
    '510(k) summary content not found in the current document.'
  );
  const deviceDescription = buildSectionHtml(
    'Device Description',
    selectSection(sections, 'Device Description')?.html || '',
    'Device description content not found in the current document.'
  );
  const seDiscussion = buildSectionHtml(
    'Substantial Equivalence Discussion',
    selectSection(sections, 'Substantial Equivalence')?.html || '',
    'Substantial equivalence discussion content not found in the current document.'
  );
  const performanceTesting = buildSectionHtml(
    'Performance Testing',
    selectSection(sections, 'Performance')?.html || '',
    'Performance testing content not found in the current document.'
  );
  const labeling = buildSectionHtml(
    'Labeling',
    selectSection(sections, 'Labeling')?.html || '',
    'Labeling content not found in the current document.'
  );

  const [coverPdf, summaryPdf, devicePdf, sePdf, perfPdf, labelingPdf] = await Promise.all([
    renderHtmlToPdf(await renderHtmlWithStylePack(cover, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(summary, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(deviceDescription, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(seDiscussion, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(performanceTesting, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(labeling, pack)),
  ]);

  return {
    coverLetter: coverPdf,
    summary: summaryPdf,
    deviceDescription: devicePdf,
    seDiscussion: sePdf,
    performanceTesting: perfPdf,
    labeling: labelingPdf,
  };
}

export async function renderPdfBuffersForPma(content: any, pack: StylePack = stylePacks['pma_v1']) {
  const sections = extractSectionsFromEditor(content);

  const summaryInfo = buildSectionHtml(
    'Summary and General Information',
    selectSection(sections, 'Summary')?.html || selectSection(sections, 'General')?.html || '',
    'Summary and general information content not found in the current document.'
  );
  const nonclinical = buildSectionHtml(
    'Nonclinical Laboratory Studies',
    selectSection(sections, 'Nonclinical')?.html ||
      selectSection(sections, 'Laboratory')?.html ||
      '',
    'Nonclinical laboratory studies content not found in the current document.'
  );
  const clinical = buildSectionHtml(
    'Clinical Investigations',
    selectSection(sections, 'Clinical Investigations')?.html || '',
    'Clinical investigations content not found in the current document.'
  );
  const manufacturing = buildSectionHtml(
    'Manufacturing and Quality Systems',
    selectSection(sections, 'Manufacturing')?.html ||
      selectSection(sections, 'Quality')?.html ||
      '',
    'Manufacturing and quality systems content not found in the current document.'
  );
  const labeling = buildSectionHtml(
    'Labeling',
    selectSection(sections, 'Labeling')?.html || '',
    'Labeling content not found in the current document.'
  );
  const riskBenefit = buildSectionHtml(
    'Risk/Benefit Determination',
    selectSection(sections, 'Risk')?.html || selectSection(sections, 'Benefit')?.html || '',
    'Risk/benefit determination content not found in the current document.'
  );
  const postApproval = buildSectionHtml(
    'Post-Approval Study / PMS',
    selectSection(sections, 'Post-Approval')?.html || selectSection(sections, 'PMS')?.html || '',
    'Post-approval study content not found in the current document.'
  );

  const [summaryPdf, nonclinPdf, clinPdf, mfgPdf, labelPdf, riskPdf, pmsPdf] = await Promise.all([
    renderHtmlToPdf(await renderHtmlWithStylePack(summaryInfo, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(nonclinical, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(clinical, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(manufacturing, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(labeling, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(riskBenefit, pack)),
    renderHtmlToPdf(await renderHtmlWithStylePack(postApproval, pack)),
  ]);

  return {
    summaryInfo: summaryPdf,
    nonclinical: nonclinPdf,
    clinical: clinPdf,
    manufacturing: mfgPdf,
    labeling: labelPdf,
    riskBenefit: riskPdf,
    postApproval: pmsPdf,
  };
}

export async function renderPdfBuffersForCer(
  content: any,
  pack: StylePack = stylePacks['cer_mdr_v1']
) {
  const sections = extractSectionsFromEditor(content);

  const sota = buildSectionHtml(
    'State of the Art',
    selectSection(sections, 'State of the Art')?.html || '',
    'State of the art content not found in the current document.'
  );
  const devicePurpose = buildSectionHtml(
    'Device / Intended Purpose',
    selectSection(sections, 'Device')?.html ||
      selectSection(sections, 'Intended Purpose')?.html ||
      '',
    'Device/intended purpose content not found in the current document.'
  );
  const clinicalDataSet = buildSectionHtml(
    'Clinical Data Set (Literature + Studies)',
    selectSection(sections, 'Clinical Data')?.html ||
      selectSection(sections, 'Literature')?.html ||
      '',
    'Clinical data set content not found in the current document.'
  );
  const appraisal = buildSectionHtml(
    'Critical Appraisal & Weighting',
    selectSection(sections, 'Appraisal')?.html || selectSection(sections, 'Weighting')?.html || '',
    'Critical appraisal content not found in the current document.'
  );
  const benefitRisk = buildSectionHtml(
    'Benefit–Risk Determination',
    selectSection(sections, 'Benefit')?.html ||
      selectSection(sections, 'Risk Determination')?.html ||
      '',
    'Benefit–risk determination content not found in the current document.'
  );
  const gspr = buildSectionHtml(
    'GSPR Mapping',
    selectSection(sections, 'GSPR')?.html || '',
    'GSPR mapping content not found in the current document.'
  );
  const pmsPlan = buildSectionHtml(
    'PMS Plan / PMCF',
    selectSection(sections, 'PMS')?.html || selectSection(sections, 'PMCF')?.html || '',
    'PMS plan content not found in the current document.'
  );
  const conclusions = buildSectionHtml(
    'Conclusions & Recommendations',
    selectSection(sections, 'Conclusions')?.html ||
      selectSection(sections, 'Recommendations')?.html ||
      '',
    'Conclusions and recommendations content not found in the current document.'
  );

  const [sotaPdf, devicePdf, dataPdf, appraisalPdf, brPdf, gsprPdf, pmsPdf, conclPdf] =
    await Promise.all([
      renderHtmlToPdf(await renderHtmlWithStylePack(sota, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(devicePurpose, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(clinicalDataSet, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(appraisal, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(benefitRisk, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(gspr, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(pmsPlan, pack)),
      renderHtmlToPdf(await renderHtmlWithStylePack(conclusions, pack)),
    ]);

  return {
    stateOfArt: sotaPdf,
    devicePurpose: devicePdf,
    clinicalDataSet: dataPdf,
    appraisal: appraisalPdf,
    benefitRisk: brPdf,
    gsprMapping: gsprPdf,
    pmsPlan: pmsPdf,
    conclusions: conclPdf,
  };
}

export async function renderPdfForDocType(docType: string, content: any, packKey: string) {
  const pack = stylePacks[packKey];
  if (!pack) {
    throw new Error(`Unknown style pack: ${packKey}`);
  }

  const sections = extractSectionsFromEditor(content);
  const html = sections
    .map(section =>
      buildSectionHtml(
        section.title,
        section.html,
        'Section content not found in the current document.'
      )
    )
    .join('');

  return renderHtmlToPdf(await renderHtmlWithStylePack(html, pack));
}

/**
 * Convert TipTap editor nodes into rich DOCX paragraphs with proper formatting.
 */
function editorNodeToDocxParagraphs(node: any): Paragraph[] {
  if (!node) return [];

  if (node.type === 'heading') {
    const text = nodeToText(node).trim();
    const level = node.attrs?.level || 2;
    const headingMap: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
    };
    return [
      new Paragraph({
        text,
        heading: headingMap[level] || HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      }),
    ];
  }

  if (node.type === 'paragraph') {
    const runs = (node.content || []).map((child: any) => {
      if (child.type === 'text') {
        const marks = child.marks || [];
        const bold = marks.some((m: any) => m.type === 'bold');
        const italic = marks.some((m: any) => m.type === 'italic');
        const underline = marks.some((m: any) => m.type === 'underline');
        return new TextRun({
          text: child.text || '',
          bold,
          italics: italic,
          underline: underline ? {} : undefined,
          size: 22, // 11pt
        });
      }
      return new TextRun({ text: nodeToText(child), size: 22 });
    });

    if (runs.length === 0) {
      return [new Paragraph({ spacing: { after: 100 } })]; // empty line
    }

    return [
      new Paragraph({
        children: runs,
        spacing: { after: 120 },
      }),
    ];
  }

  if (node.type === 'bulletList') {
    const items = (node.content || []).flatMap((item: any) => {
      const text = nodeToText(item).trim();
      if (!text) return [];
      return [
        new Paragraph({
          children: [new TextRun({ text: `\u2022  ${text}`, size: 22 })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 60 },
        }),
      ];
    });
    return items;
  }

  if (node.type === 'orderedList') {
    let idx = 1;
    const items = (node.content || []).flatMap((item: any) => {
      const text = nodeToText(item).trim();
      if (!text) return [];
      return [
        new Paragraph({
          children: [new TextRun({ text: `${idx++}.  ${text}`, size: 22 })],
          indent: { left: convertInchesToTwip(0.5) },
          spacing: { after: 60 },
        }),
      ];
    });
    return items;
  }

  // Fallback: render as plain paragraph
  if (Array.isArray(node.content)) {
    return node.content.flatMap(editorNodeToDocxParagraphs);
  }

  const text = nodeToText(node).trim();
  if (text) {
    return [new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 120 } })];
  }
  return [];
}

export async function renderDocxForDocType(docType: string, content: any) {
  const editorContent = Array.isArray(content?.content) ? content.content : [];
  const paragraphs: Paragraph[] = [];

  // Title page
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: docType === 'cerv2_510k'
            ? '510(k) Premarket Notification'
            : docType === 'cerv2_pma'
              ? 'Premarket Approval Application'
              : docType === 'cerv2_cer'
                ? 'Clinical Evaluation Report'
                : 'Regulatory Submission Document',
          bold: true,
          size: 48,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 480 },
    })
  );
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toISOString().split('T')[0]}`,
          size: 22,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    })
  );
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Generated by Concept2Cure Platform',
          size: 20,
          color: '999999',
          italics: true,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );

  // Convert each editor node into DOCX paragraphs with formatting
  for (const node of editorContent) {
    paragraphs.push(...editorNodeToDocxParagraphs(node));
  }

  // If no content was extracted, add fallback sections
  if (editorContent.length === 0) {
    const sections = extractSectionsFromEditor(content);
    for (const section of sections) {
      paragraphs.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
      const lines = (section.text || '').split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        paragraphs.push(new Paragraph({ text: 'Section content not found in the current document.' }));
      } else {
        lines.forEach(line => paragraphs.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] })));
      }
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children: paragraphs,
    }],
  });

  return Packer.toBuffer(doc);
}

/**
 * Render a full combined PDF for any doc type using its style pack.
 */
export async function renderCombinedPdf(docType: string, content: any): Promise<Buffer> {
  const packMap: Record<string, string> = {
    cerv2_510k: '510k_v1',
    cerv2_pma: 'pma_v1',
    cerv2_cer: 'cer_mdr_v1',
  };
  const packKey = packMap[docType] || '510k_v1';
  return renderPdfForDocType(docType, content, packKey);
}

/**
 * Render a full combined DOCX for any doc type.
 */
export async function renderCombinedDocx(docType: string, content: any): Promise<Buffer> {
  return renderDocxForDocType(docType, content);
}
