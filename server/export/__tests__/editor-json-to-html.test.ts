/**
 * The PDF branch and the DOCX branch must not disagree about the same document.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * renderers.ts converts one TipTap document twice: `editorNodeToDocxElements`
 * for .docx and `nodeToHtml` for the HTML that becomes every PDF. The DOCX side
 * reads `node.marks` (textNodeToRun handles bold, italic, underline, strike,
 * superscript, subscript) and builds real tables. The HTML side did neither —
 * its text case was `escapeHtml(node.text || '')`, with `marks` never read, and
 * anything it had no branch for fell through to a bare join of its children.
 *
 * So one authored section exported two ways said two different things:
 *
 *   DOCX:  Bioburden 10⁶ CFU/mL          PDF:  Bioburden 106 CFU/mL
 *
 * That is wrong by five orders of magnitude, and it looks entirely normal.
 * The same silence covered three more losses on the PDF side:
 *
 *   - an `image` node has no `content`, so it returned '' — figures vanished
 *     from 510(k) and CER submission PDFs with nothing left in their place;
 *   - `table` fell through to the generic join, so every cell ran together with
 *     no delimiter — the exact defect already fixed in the eCTD leaf renderer;
 *   - `insertion`/`deletion` are MARKS (suggestions.ts renders them as
 *     <ins>/<del>), so an unresolved tracked change lost both sides and the PDF
 *     stated one settled value. A decision nobody made, filed as fact.
 *
 * The downstream machinery was already correct and complete — inlineMarksToText
 * turns <sup>/<ins>/<del> into ^, [+…+] and [-…-], and htmlToPlainText walks
 * tables and figures properly. It simply never received any of it. Emitting the
 * marks and the structure is what connects the two.
 */
import { describe, it, expect } from 'vitest';
import { renderPdfBuffersPerSection, renderDocxForDocType } from '../renderers';
import { stylePacks } from '../stylePacks/config';
import { htmlToPlainText } from '../../services/ectd/leaf-pdf-renderer';

/** The internal converter is not exported; exercise it through the real path. */
async function pdfTextFor(doc: any): Promise<string> {
  const [{ buffer }] = await renderPdfBuffersPerSection(doc, stylePacks['510k_v1']);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    out += (await (await pdf.getPage(p)).getTextContent()).items.map((i: any) => i.str).join(' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

const text = (t: string, marks?: any[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });

const DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('9.2 Microbiology')] },
    {
      type: 'paragraph',
      content: [
        text('Bioburden 10'),
        text('6', [{ type: 'superscript' }]),
        text(' CFU/mL in CO'),
        text('2', [{ type: 'subscript' }]),
        text('.'),
      ],
    },
    {
      type: 'paragraph',
      content: [
        text('Administer '),
        text('100 mg', [{ type: 'deletion', attrs: { 'data-author-name': 'QA' } }]),
        text('200 mg', [{ type: 'insertion', attrs: { 'data-author-name': 'QA' } }]),
        text(' daily.'),
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [text('Arm')] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [text('ORR')] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [text('Active 10 mg')] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [text('42%')] }] },
          ],
        },
      ],
    },
    { type: 'image', attrs: { src: 'km.png', alt: 'Kaplan-Meier curve' } },
  ],
};

describe('editor JSON → HTML keeps what the DOCX branch keeps', () => {
  it('a superscript stays a magnitude in the PDF, as it already does in the DOCX', async () => {
    const out = await pdfTextFor(DOC);
    // ^6 is how the shared reducer writes a superscript in plain text.
    expect(out).toContain('10^6 CFU/mL');
    expect(out).not.toContain('106 CFU/mL');
  }, 60_000);

  it('a subscript reads as the conventional formula', async () => {
    expect(await pdfTextFor(DOC)).toContain('CO2');
  }, 60_000);

  it('an unresolved tracked change stays unresolved', async () => {
    /* Both sides survive marked. Silently settling either one puts a decision
       nobody made into a filed document. */
    const out = await pdfTextFor(DOC);
    expect(out).toContain('[-100 mg-]');
    expect(out).toContain('[+200 mg+]');
    expect(out).not.toContain('Administer 100 mg200 mg');
  }, 60_000);

  it('table cells keep a delimiter instead of running together', async () => {
    const out = await pdfTextFor(DOC);
    expect(out).toContain('Arm | ORR');
    expect(out).toContain('Active 10 mg | 42%');
  }, 60_000);

  it('a figure leaves a trace instead of disappearing', async () => {
    expect(await pdfTextFor(DOC)).toContain('[Figure: Kaplan-Meier curve]');
  }, 60_000);

  it('the DOCX branch still produces a document for the same input', async () => {
    /* The two branches are meant to agree; this pins that fixing the HTML side
       did not disturb the side that was already right. */
    const buf = await renderDocxForDocType('510k', DOC);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
  }, 60_000);
});
