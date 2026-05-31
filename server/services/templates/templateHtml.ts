/**
 * Template → HTML renderer.
 *
 * Produces a fully self-contained, print-ready HTML document whose CSS is
 * derived from a {@link TemplateSpec} (page size + margins via `@page`,
 * typography, brand colours, embedded logo, running confidentiality line).
 *
 * This is the input to the platform's EXISTING `renderHtmlToPdf()` exporter —
 * so the PDF picks up the client's formatting without introducing a second PDF
 * engine. The function is pure and deterministic, which keeps it unit-testable
 * independent of any headless browser.
 *
 * @module server/services/templates/templateHtml
 */

import { normalizeTemplateSpec, type TemplateSpec } from './templateSpec';
import type { DocxInput, DocxSection, DocxTable } from '../docx/docxFactory';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PAGE_DIMENSIONS: Record<string, string> = {
  letter: '8.5in 11in',
  legal: '8.5in 14in',
  a4: '210mm 297mm',
};

function tableHtml(t: DocxTable): string {
  const head = `<tr>${t.headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const body = t.rows
    .map(r => `<tr>${r.map(c => `<td>${esc(c || '—')}</td>`).join('')}</tr>`)
    .join('');
  const caption = t.caption ? `<p class="table-caption">${esc(t.caption)}</p>` : '';
  return `${caption}<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function sectionHtml(s: DocxSection): string {
  const level = s.sectionCode && s.sectionCode.split('.').length > 2 ? 2 : 1;
  const title = s.sectionCode ? `${esc(s.sectionCode)}&nbsp;&nbsp;${esc(s.title)}` : esc(s.title);
  const parts: string[] = [];
  if (s.pageBreak) parts.push('<div class="page-break"></div>');
  parts.push(`<h${level}>${title}</h${level}>`);
  for (const p of s.paragraphs) parts.push(`<p>${esc(p)}</p>`);
  if (s.bulletItems?.length) {
    parts.push(`<ul>${s.bulletItems.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`);
  }
  if (s.numberedItems?.length) {
    parts.push(`<ol>${s.numberedItems.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`);
  }
  if (s.tables?.length) for (const t of s.tables) parts.push(tableHtml(t));
  return parts.join('\n');
}

/** Render `document` to a print-ready HTML string styled by `spec`. */
export function templateSpecToHtml(specInput: TemplateSpec, document: DocxInput): string {
  const spec = normalizeTemplateSpec(specInput);
  const { page, typography, colors, brand, footer } = spec;
  const m = page.marginsInches;
  const meta = document.metadata;

  const logoImg =
    brand.logo && brand.logo.dataBase64
      ? `<img class="brand-logo" src="data:${brand.logo.mimeType};base64,${brand.logo.dataBase64}" alt="logo" />`
      : '';

  const metaLines = [
    meta.sponsor ? `Sponsor: ${meta.sponsor}` : '',
    meta.product ? `Product: ${meta.product}` : '',
    meta.region ? `Regulatory Region: ${meta.region}` : '',
    meta.version ? `Version: ${meta.version}` : '',
    `Date: ${meta.date || new Date().toISOString().split('T')[0]}`,
  ]
    .filter(Boolean)
    .map(l => `<div class="cover-meta">${esc(l)}</div>`)
    .join('');

  const confidential = brand.confidentialityNotice
    ? `<div class="confidential">${esc(brand.confidentialityNotice)}</div>`
    : '';

  const footerLine = footer?.text ? `<div class="running-footer">${esc(footer.text)}</div>` : '';

  const body = document.sections.map(sectionHtml).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(meta.title)}</title>
<style>
  @page {
    size: ${PAGE_DIMENSIONS[page.size] ?? PAGE_DIMENSIONS.letter}${page.orientation === 'landscape' ? ' landscape' : ''};
    margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "${typography.bodyFont}", serif;
    font-size: ${typography.bodySizePt}pt;
    line-height: ${typography.lineSpacing};
    color: #${colors.text};
  }
  h1, h2, h3 { font-family: "${typography.headingFont}", sans-serif; color: #${colors.text}; }
  h1 { font-size: ${typography.heading1SizePt}pt; }
  h2 { font-size: ${typography.heading2SizePt}pt; }
  h3 { font-size: ${typography.heading3SizePt}pt; }
  p { margin: 0 0 ${typography.paragraphSpaceAfterPt}pt 0; }
  .cover { text-align: center; page-break-after: always; padding-top: 2in; }
  .brand-logo { max-width: 2.4in; max-height: 1in; margin: 0 auto 0.4in; display: block; }
  .cover-title { font-family: "${typography.headingFont}", sans-serif; font-size: ${typography.heading1SizePt + 8}pt; font-weight: 700; }
  .cover-subtitle { font-family: "${typography.headingFont}", sans-serif; font-size: ${typography.heading1SizePt}pt; color: #${colors.muted}; text-transform: uppercase; margin-top: 0.2in; }
  .cover-meta { color: #${colors.muted}; margin-top: 0.05in; }
  .confidential { margin-top: 0.6in; font-style: italic; color: #${colors.muted}; font-size: ${Math.max(typography.bodySizePt - 3, 7)}pt; }
  .running-footer { color: #${colors.muted}; font-size: ${Math.max(typography.bodySizePt - 3, 7)}pt; }
  table { width: 100%; border-collapse: collapse; margin: 0.1in 0 0.2in; }
  th, td { border: 1px solid #${colors.tableBorder}; padding: 4px 6px; font-size: ${Math.max(typography.bodySizePt - 2, 8)}pt; text-align: left; }
  th { background: #${colors.tableHeaderBg}; font-weight: ${spec.table.headerBold ? 700 : 400}; }
  .table-caption { font-style: italic; font-weight: 700; margin: 0.1in 0 0.04in; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
  <section class="cover">
    ${logoImg}
    <div class="cover-title">${esc(meta.title)}</div>
    <div class="cover-subtitle">${esc(meta.submissionType)}</div>
    ${metaLines}
    ${confidential}
  </section>
  <main>
    ${body}
    ${footerLine}
  </main>
</body>
</html>`;
}
