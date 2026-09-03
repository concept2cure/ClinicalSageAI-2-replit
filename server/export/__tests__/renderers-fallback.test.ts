/**
 * The PDFKit fallback is what actually renders every HTML export.
 *
 * `puppeteer` is an optional transitive dependency of puppeteer-cluster and is
 * not in package.json at all, so `Cluster.launch()` fails with "Cannot find
 * module 'puppeteer'" in every environment and the fallback — not Chromium — is
 * the renderer behind the authoring PDF export, the c2c template export and the
 * pdf-converter's HTML backend. It is the shipped path, not a rare degradation,
 * which is why it is worth holding to a standard.
 *
 * It used to flatten the whole document in one step:
 *
 *     html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')  ->  one doc.text(...)
 *
 * so a results table arrived as a run-on sentence of cell values with no
 * delimiter between them, lists lost their numbering, figures vanished, and
 * only five HTML entities were decoded. Nothing on the page showed that a table
 * had ever been there — the same class of loss as the eCTD leaf defects, on the
 * documents users download by hand.
 *
 * The assertions below are made against text extracted back out of the rendered
 * PDF with pdfjs, because that is the only thing that shows what a reader gets.
 */

import { describe, it, expect } from 'vitest';
import { renderHtmlToPdfTracked } from '../renderers';

const SAMPLE = [
  '<h2>9.2 Efficacy Results</h2>',
  '<table><tr><th>Arm</th><th>n</th><th>ORR</th></tr>',
  '<tr><td>Active 10 mg</td><td>150</td><td>42%</td></tr></table>',
  '<ol><li>Screening</li><li>Randomization</li></ol>',
  '<img src="km.png" alt="Kaplan-Meier curve">',
  '<p>Bioburden &lt; 10<sup>6</sup> CFU/mL at 37&deg;C &plusmn;2.</p>',
  '<style>h2{color:red}</style>',
].join('\n');

async function extractText(pdf: Buffer): Promise<string> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: true }).promise;
  let out = '';
  for (let page = 1; page <= doc.numPages; page++) {
    const content = await (await doc.getPage(page)).getTextContent();
    out += content.items.map((i: any) => i.str).join(' ') + '\n';
  }
  return out.replace(/\s+/g, ' ').trim();
}

describe('renderHtmlToPdf fallback — document structure survives', () => {
  it('keeps table cells, list numbering, figures and entities readable', async () => {
    const { buffer, usedFallback } = await renderHtmlToPdfTracked(SAMPLE);

    // If puppeteer is ever installed this renders through Chromium instead and
    // the assertions below no longer describe the code under test.
    expect(usedFallback, 'puppeteer is installed; this suite covers the fallback').toBe(true);

    const text = await extractText(buffer);

    // Cells must not run together — "Arm n ORR" and "Active 10 mg 150 42%" was
    // the whole table reduced to a sentence.
    expect(text).toContain('Arm | n | ORR');
    expect(text).toContain('Active 10 mg | 150 | 42%');
    expect(text).not.toContain('mg 150 42%');

    // "as described in step 2" needs a step 2.
    expect(text).toContain('1. Screening');
    expect(text).toContain('2. Randomization');

    // A figure leaves a trace instead of disappearing under the prose.
    expect(text).toContain('[Figure: Kaplan-Meier curve]');

    // Entities beyond the original five, and the exponent.
    expect(text).toContain('37°C');
    expect(text).toContain('±2');
    expect(text).toContain('10^6');
    expect(text).not.toMatch(/&[a-z]+;/i);

    // Stylesheet bodies are not document text.
    expect(text).not.toContain('color:red');
  }, 60_000);

  it('renders a placeholder rather than an empty page for empty input', async () => {
    const { buffer } = await renderHtmlToPdfTracked('');
    expect(await extractText(buffer)).toContain('Document content not available');
  }, 60_000);

  it('is deterministic for identical input', async () => {
    // pdf-converter hashes these bytes after stripping metadata, so the text
    // layer must not vary between runs.
    const [a, b] = await Promise.all([
      renderHtmlToPdfTracked(SAMPLE),
      renderHtmlToPdfTracked(SAMPLE),
    ]);
    expect(await extractText(a.buffer)).toBe(await extractText(b.buffer));
  }, 60_000);
});
