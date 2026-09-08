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
import { renderHtmlToPdfTracked, renderFallbackPdf, FALLBACK_PDF_NOTICE } from '../renderers';

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
    /* Called directly rather than through renderHtmlToPdfTracked, which picks
       whichever renderer the ambient environment offers. These assertions are
       about the fallback specifically, and they must hold on a machine that
       has a Puppeteer driver installed as much as on one that does not. */
    const text = await extractText(await renderFallbackPdf(SAMPLE));

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
    expect(await extractText(await renderFallbackPdf(''))).toContain(
      'Document content not available',
    );
  }, 60_000);

  it('is deterministic for identical input', async () => {
    // pdf-converter hashes these bytes after stripping metadata, so the text
    // layer must not vary between runs.
    const [a, b] = await Promise.all([renderFallbackPdf(SAMPLE), renderFallbackPdf(SAMPLE)]);
    expect(await extractText(a)).toBe(await extractText(b));
  }, 60_000);

  it('says on the page that it is a plain-text rendering', async () => {
    /* `usedFallback` only helps a caller that reads it, and the 510(k), PMA,
       CER, per-section and authoring exports all go through renderHtmlToPdf(),
       which exists to discard it. Without a notice in the file itself, a
       plain-text stand-in for a styled document reaches a filing looking like
       the finished thing, with nothing anywhere saying otherwise. */
    const text = await extractText(await renderFallbackPdf(SAMPLE));
    // Compared word-for-word against the exported constant, normalized the same
    // way the extractor normalizes, so the two cannot drift apart.
    expect(text).toContain(FALLBACK_PDF_NOTICE.replace(/\s+/g, ' ').trim());
  });

  it('puts the notice before the content, not after it', async () => {
    const text = await extractText(await renderFallbackPdf(SAMPLE));
    const notice = text.indexOf('Plain-text rendering.');
    const content = text.indexOf('9.2 Efficacy Results');
    expect(notice).toBeGreaterThan(-1);
    expect(content).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(content);
  });

  it('does not alter the content it is warning about', async () => {
    /* The notice says the text is complete and unmodified; that has to be true.
       The structural assertions above still hold with it present. */
    const text = await extractText(await renderFallbackPdf(SAMPLE));
    expect(text).toContain('Bioburden < 10^6 CFU/mL at 37\u00b0C \u00b12.');
  });

  it('is the renderer actually in use unless a Puppeteer driver is installed', async () => {
    /* The one assertion that is about the environment rather than the code.
       `puppeteer` is not a dependency — it downloads a ~200MB Chromium — so
       unless someone has installed it, or `puppeteer-core` alongside a browser,
       the fallback is what produces every HTML export this platform ships.
       Stated as a conditional so an environment that HAS a driver reports that
       fact instead of failing. */
    let driverInstalled = false;
    for (const name of ['puppeteer', 'puppeteer-core']) {
      try {
        await import(/* @vite-ignore */ name);
        driverInstalled = true;
      } catch {
        /* not installed */
      }
    }
    const { usedFallback } = await renderHtmlToPdfTracked(SAMPLE);
    if (!driverInstalled) expect(usedFallback).toBe(true);
    else expect(typeof usedFallback).toBe('boolean');
  }, 120_000);
});
