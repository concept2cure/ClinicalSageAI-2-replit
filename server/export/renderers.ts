import fs from 'fs/promises';
import fsSync from 'node:fs';
import PDFDocument from 'pdfkit';
import { Cluster } from 'puppeteer-cluster';
// The structure-preserving HTML reducer the eCTD leaf renderer uses. Shared
// rather than reimplemented: a second copy is a second thing to forget.
import { htmlToPlainText } from '../services/ectd/leaf-pdf-renderer';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  UnderlineType,
  convertInchesToTwip,
} from 'docx';
import { stylePacks, StylePack } from './stylePacks/config';

const MAX_CONTENT_CHARS = 500000;
let clusterPromise: Promise<Cluster | null> | null = null;

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

/**
 * Chromium locations tried when the driver is `puppeteer-core`, which ships no
 * browser of its own. Same list and same reasoning as
 * scripts/visual-qa/playwright.mjs. `undefined` means "let the driver decide",
 * which is correct for full `puppeteer` and for a machine that downloaded one.
 */
const CHROMIUM_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
];

/**
 * Resolve a Puppeteer driver without requiring one.
 *
 * `puppeteer` is a peerDependency of puppeteer-cluster and is deliberately not
 * a dependency here: it downloads a ~200MB Chromium on every install, for a
 * feature many deployments do not exercise. But puppeteer-cluster also accepts
 * a driver explicitly, so `puppeteer-core` — a few hundred KB, no bundled
 * browser — is enough when a Chromium already exists on the host, which is the
 * common case in a container that has one for other reasons.
 *
 * So both are tried and neither is required. An operator who wants styled
 * output installs either one; nothing else changes. Until then the fallback
 * runs, and — since this function is the reason it runs — it now says which of
 * the two things is missing, the driver or the browser, rather than leaving
 * "Cannot find module 'puppeteer'" to be interpreted.
 */
async function resolvePuppeteer(): Promise<{ mod: any; executablePath?: string } | null> {
  for (const name of ['puppeteer', 'puppeteer-core']) {
    let mod: any;
    try {
      mod = await import(/* @vite-ignore */ name);
    } catch {
      continue; // not installed here — try the next
    }
    const driver = mod?.default ?? mod;
    if (!driver?.launch) continue;

    // Full `puppeteer` knows where its own browser is; `puppeteer-core` does not.
    if (name === 'puppeteer') return { mod: driver };

    const executablePath = CHROMIUM_CANDIDATES.find((c) => c && fsSync.existsSync(c));
    if (!executablePath) {
      console.warn(
        '[Renderers] puppeteer-core is installed but no Chromium was found. Set ' +
          'PUPPETEER_EXECUTABLE_PATH, or install `puppeteer`, to restore styled rendering.',
      );
      return null;
    }
    return { mod: driver, executablePath };
  }
  return null;
}

async function getCluster(): Promise<Cluster | null> {
  if (!clusterPromise) {
    clusterPromise = (async () => {
      const resolved = await resolvePuppeteer();
      if (!resolved) {
        console.warn(
          '[Renderers] No Puppeteer driver installed — every HTML export is rendered by ' +
            'the PDFKit fallback, which produces a plain-text document with no style-pack ' +
            'CSS applied. Install `puppeteer`, or `puppeteer-core` alongside an existing ' +
            'Chromium, to restore styled rendering.',
        );
        return null;
      }
      return Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 2,
        puppeteer: resolved.mod,
        puppeteerOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          ...(resolved.executablePath ? { executablePath: resolved.executablePath } : {}),
        },
      });
    })().catch((err: any) => {
      console.warn(
        '[Renderers] Puppeteer cluster failed to launch — every HTML export will be ' +
          'rendered by the PDFKit fallback, which produces a plain-text document with ' +
          'no style-pack CSS applied. Cause: ' + (err?.message || err),
      );
      return null;
    }) as Promise<Cluster | null>;
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

/**
 * TipTap marks → the tags the rest of the export pipeline already understands.
 *
 * The DOCX branch of this same file has always read `node.marks` (see
 * textNodeToRun); the HTML branch never did, so one authored section exported
 * two ways said two different things — "10⁶ CFU/mL" in the .docx and "106
 * CFU/mL" in the PDF. `insertion`/`deletion` matter most: suggestions.ts
 * renders them as <ins>/<del>, and downstream inlineMarksToText keeps both
 * sides of an unresolved change visible as [+…+] and [-…-]. Dropping the mark
 * here settled the change silently, one layer above the module built to stop
 * exactly that.
 *
 * Order is outermost-first and fixed, so identical input yields identical
 * bytes — pdf-converter hashes these renders.
 */
const MARK_TAGS: Array<[string, string]> = [
  ['insertion', 'ins'],
  ['deletion', 'del'],
  ['bold', 'strong'],
  ['italic', 'em'],
  ['underline', 'u'],
  ['strike', 's'],
  ['code', 'code'],
  ['superscript', 'sup'],
  ['subscript', 'sub'],
];

function applyMarks(html: string, marks: any[]): string {
  let out = html;
  // Innermost first, so the array order above ends up as the nesting order.
  for (let i = MARK_TAGS.length - 1; i >= 0; i--) {
    const [markType, tag] = MARK_TAGS[i];
    if (marks.some((m: any) => m?.type === markType)) out = `<${tag}>${out}</${tag}>`;
  }
  const link = marks.find((m: any) => m?.type === 'link');
  const href = link?.attrs?.href;
  if (typeof href === 'string' && href) out = `<a href="${escapeHtml(href)}">${out}</a>`;
  return out;
}

/** Cell text for a table cell, whose children are block nodes. */
function cellToHtml(cell: any): string {
  const inner = (cell.content || []).map(nodeToHtml).join('');
  // Strip the wrapping <p> a single-paragraph cell produces; a block inside a
  // cell is what made the reducer break the row.
  const single = inner.match(/^<p>([\s\S]*)<\/p>$/);
  return single ? single[1] : inner;
}

function nodeToHtml(node: any): string {
  if (!node) return '';
  if (node.type === 'text') {
    return applyMarks(escapeHtml(node.text || ''), node.marks || []);
  }
  if (node.type === 'hardBreak') return '<br>';
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'image') {
    /* An image node has no `content`, so the generic fall-through returned ''
       and figures disappeared out of 510(k) and CER PDFs with nothing left to
       show one had been there. htmlToPlainText turns this into
       "[Figure: <alt>]". */
    const src = String(node.attrs?.src ?? '');
    const alt = String(node.attrs?.alt ?? node.attrs?.title ?? '');
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
  }
  if (node.type === 'paragraph') {
    const text = (node.content || []).map(nodeToHtml).join('');
    return text.trim() ? `<p>${text}</p>` : '';
  }
  if (node.type === 'heading') {
    // Through the children, not nodeToText: a heading carries marks too.
    const text = (node.content || []).map(nodeToHtml).join('').trim();
    const level = node.attrs?.level || 2;
    const safeLevel = Math.min(Math.max(level, 1), 4);
    return `<h${safeLevel}>${text}</h${safeLevel}>`;
  }
  if (node.type === 'blockquote') {
    const inner = (node.content || []).map(nodeToHtml).join('');
    return inner.trim() ? `<blockquote>${inner}</blockquote>` : '';
  }
  if (node.type === 'codeBlock') {
    return `<pre><code>${escapeHtml(nodeToText(node))}</code></pre>`;
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
  if (node.type === 'table') {
    /* Fell through to a bare join of its children, so every cell ran together
       with no delimiter — the same defect already fixed in the eCTD leaf
       renderer, on the other document the same content is filed as. */
    const rows = (node.content || [])
      .filter((r: any) => r?.type === 'tableRow')
      .map(nodeToHtml)
      .join('');
    return rows ? `<table>${rows}</table>` : '';
  }
  if (node.type === 'tableRow') {
    const cells = (node.content || [])
      .filter((c: any) => c?.type === 'tableCell' || c?.type === 'tableHeader')
      .map((c: any) => {
        const tag = c.type === 'tableHeader' ? 'th' : 'td';
        // colspan/rowspan carried through so a merged cell is not silently
        // renumbered into the wrong column.
        const colspan = Number(c.attrs?.colspan) > 1 ? ` colspan="${Number(c.attrs.colspan)}"` : '';
        const rowspan = Number(c.attrs?.rowspan) > 1 ? ` rowspan="${Number(c.attrs.rowspan)}"` : '';
        return `<${tag}${colspan}${rowspan}>${cellToHtml(c)}</${tag}>`;
      })
      .join('');
    return cells ? `<tr>${cells}</tr>` : '';
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
    // puppeteer is an optional transitive dep of puppeteer-cluster and is not
    // installed in this environment, so the Page type is unavailable here.
    const buffer: Buffer = await cluster.execute(async ({ page }: { page: any }) => {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    });
    return { buffer, usedFallback: false };
  }

  const buffer = await renderFallbackPdf(html);
  return { buffer, usedFallback: true };
}

/**
 * The PDF used when the Puppeteer cluster cannot launch.
 *
 * This is not a rare degradation. `puppeteer` is an optional transitive
 * dependency of puppeteer-cluster and is not in package.json at all, so
 * `Cluster.launch()` fails with "Cannot find module 'puppeteer'" in every
 * environment and THIS is the renderer that produces every HTML export the
 * platform ships today.
 *
 * It used to reduce the whole document to a single unstructured blob:
 *
 *   html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')  ->  one doc.text(...)
 *
 * which destroyed every heading, table row, list and paragraph boundary in one
 * step. A results table came out as a run-on sentence of cell values with no
 * delimiter — "Arm n ORR Active 10 mg 150 42%" — and only five HTML entities
 * were decoded, so "37&deg;C" printed literally. Nothing on the page indicated
 * that a table had ever been there.
 *
 * It now reduces the document through htmlToPlainText, the same tree walk the
 * eCTD leaf renderer uses: table cells keep a delimiter, lists keep their
 * numbering and nesting, figures leave a marker instead of vanishing, tracked
 * changes stay marked, and the full named and numeric entity set is decoded.
 * One implementation rather than a second copy to forget — these reducers had
 * already drifted apart on the identical table-cell defect once.
 *
 * It remains a plain-text rendering: the style pack's CSS is not applied, which
 * is why callers get `usedFallback`.
 *
 * ── Why the page says so itself ──────────────────────────────────────────────
 * `usedFallback` only helps a caller that reads it, and most do not:
 * renderHtmlToPdf() exists to discard it, and the 510(k), PMA, CER, per-section
 * and authoring exports all go through that. So the document came back looking
 * like the finished thing, was attached to a filing, and nothing anywhere —
 * not the file, not an audit record — said it was a plain-text stand-in for a
 * styled, paginated document. That is the failure this repo's second working
 * rule names directly: an error is never rendered as an empty result.
 *
 * A flag a caller may ignore cannot carry that. The artifact has to. So the
 * notice is on page one, where the person about to file it reads it, and it
 * survives every caller that throws the flag away. It states what happened and
 * what is missing; it does not apologise or instruct.
 *
 * It is deliberately NOT a watermark or a diagonal DRAFT stamp: this is a real
 * export of real content and the content is intact — what is missing is the
 * typesetting. Overstating that would push people to ignore it.
 */

/** Set on page one of every fallback render. Asserted by the tests. */
export const FALLBACK_PDF_NOTICE =
  'Plain-text rendering. The document styling could not be applied, so this ' +
  'file shows the content without its page layout, fonts or table rules. The ' +
  'text is complete and unmodified. Do not file this rendering as the ' +
  'formatted document.';

/** Exported so the fallback's own guarantees can be tested directly, rather
 *  than only when the ambient environment happens to lack a driver. */
export function renderFallbackPdf(html: string): Promise<Buffer> {
  return new Promise(resolve => {
    const doc = new PDFDocument({
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      size: 'A4',
    });
    const chunks: Buffer[] = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // The notice precedes the content, boxed off from it so no reader mistakes
    // it for part of the document.
    doc.fontSize(9);
    doc.text(FALLBACK_PDF_NOTICE, { align: 'left' });
    doc.moveDown(0.4);
    doc.text('\u2500'.repeat(64), { align: 'left' });
    doc.moveDown(0.8);

    const text = htmlToPlainText(html);

    // Line by line, so the block boundaries the reducer computed survive: a
    // single text() call with the whole string lets PDFKit reflow across them.
    doc.fontSize(11);
    if (!text) {
      doc.text('Document content not available.', { align: 'left' });
    } else {
      for (const line of text.split('\n')) {
        // An empty line is a paragraph break, not a line of text.
        if (line.trim() === '') doc.moveDown(0.5);
        else doc.text(line, { align: 'left' });
      }
    }

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

/**
 * Render ONE PDF per top-level section (H1) of the editor document, in
 * document order, with no bucket selection and no placeholder for anything
 * absent. The fixed-slot renderers above pick one heading per named bucket
 * and print "content not found" for the rest — honest for a six-slot 510(k)
 * package, lossy for a governed 67-section 21 CFR 814.20 outline, where most
 * authored sections match no bucket and are silently dropped. Here every
 * authored section is a file; nothing that was not authored is invented.
 */
export async function renderPdfBuffersPerSection(
  content: any,
  pack: StylePack,
): Promise<Array<{ title: string; buffer: Buffer }>> {
  const sections = extractSectionsFromEditor(content);
  return Promise.all(
    sections.map(async (section) => {
      const html = buildSectionHtml(section.title, section.html, 'This section has no body text.');
      const buffer = await renderHtmlToPdf(await renderHtmlWithStylePack(html, pack));
      return { title: section.title, buffer };
    }),
  );
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

/** Build a TextRun from a TipTap text node, respecting its marks (bold, italic, etc.) */
function textNodeToRun(child: any, fontSize: number = 22): TextRun {
  if (child.type !== 'text') {
    return new TextRun({ text: nodeToText(child), size: fontSize });
  }
  const marks: any[] = child.marks || [];
  const bold = marks.some((m: any) => m.type === 'bold');
  const italic = marks.some((m: any) => m.type === 'italic');
  const hasUnderline = marks.some((m: any) => m.type === 'underline');
  const strikethrough = marks.some((m: any) => m.type === 'strike');
  const superscript = marks.some((m: any) => m.type === 'superscript');
  const subscript = marks.some((m: any) => m.type === 'subscript');

  return new TextRun({
    text: child.text || '',
    bold,
    italics: italic,
    underline: hasUnderline ? { type: UnderlineType.SINGLE } : undefined,
    strike: strikethrough,
    superScript: superscript,
    subScript: subscript,
    size: fontSize,
  });
}

/**
 * Convert TipTap editor nodes into rich DOCX elements with proper formatting.
 * Supports: headings, paragraphs with marks, bullet/ordered lists, tables,
 * blockquotes, and horizontal rules.
 */
function editorNodeToDocxElements(node: any): (Paragraph | Table)[] {
  if (!node) return [];

  // ── Headings ──
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

  // ── Paragraphs with rich text marks ──
  if (node.type === 'paragraph') {
    const runs = (node.content || []).map((child: any) => textNodeToRun(child));

    if (runs.length === 0) {
      return [new Paragraph({ spacing: { after: 100 } })];
    }

    return [
      new Paragraph({
        children: runs,
        spacing: { after: 120 },
      }),
    ];
  }

  // ── Bullet lists ──
  if (node.type === 'bulletList') {
    return (node.content || []).flatMap((item: any) => {
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
  }

  // ── Ordered lists ──
  if (node.type === 'orderedList') {
    let idx = 1;
    return (node.content || []).flatMap((item: any) => {
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
  }

  // ── Tables ──
  if (node.type === 'table') {
    const rows: TableRow[] = (node.content || [])
      .filter((row: any) => row.type === 'tableRow')
      .map((row: any, rowIdx: number) => {
        const cells: TableCell[] = (row.content || [])
          .filter((cell: any) => cell.type === 'tableCell' || cell.type === 'tableHeader')
          .map((cell: any) => {
            const isHeader = cell.type === 'tableHeader' || rowIdx === 0;
            const cellText = nodeToText(cell).trim() || '';
            return new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cellText,
                      bold: isHeader,
                      size: isHeader ? 22 : 20,
                    }),
                  ],
                }),
              ],
              width: { size: 100, type: WidthType.AUTO },
            });
          });

        return new TableRow({ children: cells });
      });

    if (rows.length > 0) {
      return [
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
        new Paragraph({ spacing: { after: 120 } }), // spacing after table
      ];
    }
    return [];
  }

  // ── Blockquotes ──
  if (node.type === 'blockquote') {
    const text = nodeToText(node).trim();
    if (!text) return [];
    return [
      new Paragraph({
        children: [
          new TextRun({ text, italics: true, size: 22, color: '555555' }),
        ],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 120, after: 120 },
        border: {
          left: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 10 },
        },
      }),
    ];
  }

  // ── Horizontal rule ──
  if (node.type === 'horizontalRule') {
    return [
      new Paragraph({
        children: [new TextRun({ text: '─'.repeat(60), size: 16, color: 'CCCCCC' })],
        spacing: { before: 200, after: 200 },
        alignment: AlignmentType.CENTER,
      }),
    ];
  }

  // ── Fallback: recurse into child content ──
  if (Array.isArray(node.content)) {
    return node.content.flatMap(editorNodeToDocxElements);
  }

  const text = nodeToText(node).trim();
  if (text) {
    return [new Paragraph({ children: [new TextRun({ text, size: 22 })], spacing: { after: 120 } })];
  }
  return [];
}

export async function renderDocxForDocType(docType: string, content: any) {
  const editorContent = Array.isArray(content?.content) ? content.content : [];
  const children: (Paragraph | Table)[] = [];

  // Title page
  const docTypeLabel =
    docType === 'cerv2_510k' ? '510(k) Premarket Notification'
    : docType === 'cerv2_pma' ? 'Premarket Approval Application'
    : docType === 'cerv2_cer' ? 'Clinical Evaluation Report'
    : 'Regulatory Submission Document';

  children.push(
    new Paragraph({
      children: [new TextRun({ text: docTypeLabel, bold: true, size: 48 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 2400, after: 480 },
    }),
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
    }),
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

  // Convert each editor node into DOCX elements (Paragraphs + Tables)
  for (const node of editorContent) {
    children.push(...editorNodeToDocxElements(node));
  }

  // Fallback: if editor JSON had no content nodes, try text extraction
  if (editorContent.length === 0) {
    const sections = extractSectionsFromEditor(content);
    for (const section of sections) {
      children.push(new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1 }));
      const lines = (section.text || '').split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        children.push(new Paragraph({ text: 'Section content not found in the current document.' }));
      } else {
        lines.forEach(line =>
          children.push(new Paragraph({ children: [new TextRun({ text: line, size: 22 })] }))
        );
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
      children,
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
