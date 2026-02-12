import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { Cluster } from 'puppeteer-cluster';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { stylePacks, StylePack } from './stylePacks/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    }).catch(() => null);
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
  const direct = sections.find(section => normalizeHeading(section.title).includes(needle));
  return direct || null;
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

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const cluster = await getCluster();
  if (cluster) {
    return cluster.execute(async ({ page }) => {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    });
  }

  return renderFallbackPdf(html);
}

function renderFallbackPdf(html: string): Promise<Buffer> {
  return new Promise(resolve => {
    const doc = new PDFDocument({ margin: 72, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const text = html
      .replace(/<[^>]+>/g, ' ')
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

export async function renderDocxForDocType(docType: string, content: any) {
  const sections = extractSectionsFromEditor(content);
  const paragraphs: Paragraph[] = [];

  for (const section of sections) {
    paragraphs.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
    const lines = (section.text || '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      paragraphs.push(
        new Paragraph({ text: 'Section content not found in the current document.' })
      );
    } else {
      lines.forEach(line => paragraphs.push(new Paragraph(line)));
    }
  }

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  return Packer.toBuffer(doc);
}
