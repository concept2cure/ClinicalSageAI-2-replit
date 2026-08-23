/**
 * The gate both work orders end on:
 *
 *   "Author the subject-versus-predicate comparison table. Save it. Reload.
 *    Export to Word. The table must be a real table in the exported .docx."
 *   — MDX_WORK_ORDER W1-1 / W1-3
 *   "Author a Module 3.2.P.8.3 stability table … the table must be a real
 *    table in the .docx."  — BIOPHARMA_WORK_ORDER BP-W1-1
 *
 * It failed for one reason: `ContentBlock` had no table kind, so `td`/`th` were
 * joined with tabs into an ordinary paragraph and the DOCX branch built nothing
 * but paragraphs. The text arrived, the structure did not.
 *
 * These assertions are over the emitted OOXML, not over the block model, so
 * they cannot pass on a renderer that produces the right intermediate shape and
 * the wrong document. `w:tbl` / `w:tr` / `w:tc` are the elements Word treats as
 * a table; a tab-separated paragraph has none of them.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';
import {
  sectionContentToBlocks,
  blocksToPlainText,
  countPendingSuggestions,
} from '../authoring-section-content';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';
import { blocksToHtml } from '../authoring-blocks-to-html';

/** Render blocks through the same path the export route uses, return document.xml. */
async function renderToDocumentXml(html: string): Promise<string> {
  const blocks = sectionContentToBlocks(html);
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    sections: [{ children: blocksToDocx(docx, blocks) as never[] }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  expect(buf.subarray(0, 2).toString('latin1')).toBe('PK'); // it really is OOXML
  return new AdmZip(buf).getEntry('word/document.xml')!.getData().toString('utf8');
}

/** Section 5.6 of the AeroFlow 510(k) Summary — the work order's test article. */
const SE_TABLE = `<h2>5.6 Substantial Equivalence</h2>
<table>
  <thead><tr><th>Characteristic</th><th>Subject Device</th><th>Predicate K18XXXX</th><th>Discussion</th></tr></thead>
  <tbody>
    <tr><td>Indications for Use</td><td>OTC home monitoring</td><td>OTC home monitoring</td><td>Identical</td></tr>
    <tr><td>Measurement range</td><td>60-900 L/min</td><td>60-800 L/min</td><td>Minor difference</td></tr>
    <tr><td>Accuracy</td><td>&#177;10%</td><td>&#177;10%</td><td>Identical</td></tr>
  </tbody>
</table>
<p>The subject device is <strong>substantially equivalent</strong> to the predicate.</p>`;

describe('a table authored in the editor survives export to Word', () => {
  it('parses to a table block rather than tab-separated paragraphs', () => {
    const blocks = sectionContentToBlocks(SE_TABLE);
    const table = blocks.find((b) => b.kind === 'table');
    expect(table, 'no table block was produced').toBeTruthy();
    expect(table!.rows).toHaveLength(4);
    expect(table!.rows![0].every((c) => c.header)).toBe(true);
    expect(table!.rows![0].map((c) => c.runs.map((r) => r.text).join(''))).toEqual([
      'Characteristic',
      'Subject Device',
      'Predicate K18XXXX',
      'Discussion',
    ]);
    // The old behaviour, pinned so it cannot return: no tab-joined cell prose.
    expect(blocks.some((b) => b.kind === 'paragraph' && b.runs.some((r) => r.text.includes('\t')))).toBe(false);
  });

  it('emits a real w:tbl with every row, cell and value intact', async () => {
    const xml = await renderToDocumentXml(SE_TABLE);
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
    expect((xml.match(/<w:tr\b/g) || []).length).toBe(4);
    expect((xml.match(/<w:tc>/g) || []).length).toBe(16);
    for (const v of ['Characteristic', '60-900 L/min', '60-800 L/min', 'Minor difference', '±10%']) {
      expect(xml, `cell value ${v} missing from the exported document`).toContain(v);
    }
    // Surrounding prose still exports, and its formatting with it.
    expect(xml).toContain('substantially equivalent');
    expect(xml).toMatch(/<w:b\b/);
  });

  it('is falsifiable: prose with no table produces no w:tbl', async () => {
    const xml = await renderToDocumentXml('<p>No table here, only a sentence.</p>');
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(0);
    expect(xml).toContain('No table here');
  });

  it('carries merged header cells rather than silently unmerging them', async () => {
    const xml = await renderToDocumentXml(
      '<table><tr><th colspan="2">Performance testing</th></tr>' +
        '<tr><td>Bench</td><td>Pass</td></tr></table>',
    );
    expect(xml).toMatch(/<w:gridSpan w:val="2"/);
  });

  it('keeps a caption with its table', async () => {
    const blocks = sectionContentToBlocks(
      '<table><caption>Table 5-1. Comparison</caption><tr><td>a</td></tr></table>',
    );
    expect(blocks[0].caption).toBe('Table 5-1. Comparison');
    const xml = await renderToDocumentXml(
      '<table><caption>Table 5-1. Comparison</caption><tr><td>a</td></tr></table>',
    );
    expect(xml).toContain('Table 5-1. Comparison');
  });
});

describe('a Module 3.2.P.8.3 stability table — the biopharma wave gate', () => {
  /* 3 storage conditions x 5 timepoints, with assay, degradants and appearance,
     exactly as BIOPHARMA_WORK_ORDER's verification step specifies. */
  const CONDITIONS = ['25°C/60% RH', '30°C/65% RH', '40°C/75% RH'];
  const TIMEPOINTS = ['0 M', '3 M', '6 M', '9 M', '12 M'];
  const PARAMS = ['Assay (%)', 'Total degradants (%)', 'Appearance'];
  const html =
    '<table><thead><tr><th>Condition</th><th>Parameter</th>' +
    TIMEPOINTS.map((t) => `<th>${t}</th>`).join('') +
    '</tr></thead><tbody>' +
    CONDITIONS.flatMap((c) =>
      PARAMS.map(
        (p) =>
          `<tr><td>${c}</td><td>${p}</td>` +
          TIMEPOINTS.map(() => '<td>Conforms</td>').join('') +
          '</tr>',
      ),
    ).join('') +
    '</tbody></table>';

  it('round-trips 10 rows x 7 columns into the .docx as a real table', async () => {
    const xml = await renderToDocumentXml(html);
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
    expect((xml.match(/<w:tr\b/g) || []).length).toBe(1 + CONDITIONS.length * PARAMS.length);
    expect((xml.match(/<w:tc>/g) || []).length).toBe((1 + CONDITIONS.length * PARAMS.length) * 7);
    for (const c of CONDITIONS) expect(xml).toContain(c);
    expect(xml).toContain('Total degradants (%)');
  });

  it('keeps every cell reachable as text, so nothing is lost to consumers that only read text', () => {
    const text = blocksToPlainText(sectionContentToBlocks(html));
    for (const c of CONDITIONS) expect(text).toContain(c);
    expect(text.split('\n')).toHaveLength(1 + CONDITIONS.length * PARAMS.length);
  });
});

describe('ordered lists keep their numbers', () => {
  it('marks ol items ordered and ul items not', () => {
    const blocks = sectionContentToBlocks(
      '<ol><li>Condition the device</li><li>Record three readings</li></ol><ul><li>Note</li></ul>',
    );
    expect(blocks.filter((b) => b.kind === 'list-item').map((b) => Boolean(b.ordered))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('exports an ordered list against a real numbering definition, not as a bullet', async () => {
    const xml = await renderToDocumentXml('<ol><li>Condition the device</li><li>Record readings</li></ol>');
    expect(xml).toMatch(/<w:numPr>/);
    expect(xml).toContain('Condition the device');
  });

  it('counts unresolved suggestions inside table cells', () => {
    const blocks = sectionContentToBlocks(
      '<table><tr><td>Range <ins>60-900</ins><del>60-800</del> L/min</td></tr></table>',
    );
    expect(countPendingSuggestions(blocks)).toEqual({ insertions: 1, deletions: 1 });
  });
});

describe('the PDF branch renders the same structure as the DOCX branch', () => {
  it('emits a real HTML table with header cells and every value', () => {
    const html = blocksToHtml(sectionContentToBlocks(SE_TABLE));
    expect(html).toContain('<table>');
    expect((html.match(/<tr>/g) || []).length).toBe(4);
    expect((html.match(/<th>/g) || []).length).toBe(4);
    expect((html.match(/<td>/g) || []).length).toBe(12);
    expect(html).toContain('60-900 L/min');
    expect(html).toContain('<b>substantially equivalent</b>');
  });

  it('groups consecutive items into one real ol or ul, not a run of paragraphs', () => {
    const html = blocksToHtml(
      sectionContentToBlocks(
        '<ol><li>Condition</li><li>Record</li></ol><p>Then</p><ul><li>Note</li><li>Caveat</li></ul>',
      ),
    );
    expect(html).toBe(
      '<ol><li>Condition</li><li>Record</li></ol><p>Then</p><ul><li>Note</li><li>Caveat</li></ul>',
    );
  });

  it('escapes text and never passes stored markup through raw', () => {
    const html = blocksToHtml(
      sectionContentToBlocks('<table><tr><td>a &lt;script&gt;alert(1)&lt;/script&gt; b</td></tr></table>'),
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('carries a pending suggestion into the PDF as redline, not as a settled edit', () => {
    const html = blocksToHtml(
      sectionContentToBlocks('<table><tr><td>Range <ins>60-900</ins><del>60-800</del></td></tr></table>'),
    );
    expect(html).toContain('<ins>60-900</ins>');
    expect(html).toContain('<del>60-800</del>');
  });

  it('agrees with the DOCX branch on table shape — the two formats cannot drift', async () => {
    const blocks = sectionContentToBlocks(SE_TABLE);
    const html = blocksToHtml(blocks);
    const xml = await renderToDocumentXml(SE_TABLE);
    const htmlRows = (html.match(/<tr>/g) || []).length;
    const xmlRows = (xml.match(/<w:tr\b/g) || []).length;
    expect(htmlRows).toBe(xmlRows);
    const htmlCells = (html.match(/<t[hd][ >]/g) || []).length;
    const xmlCells = (xml.match(/<w:tc>/g) || []).length;
    expect(htmlCells).toBe(xmlCells);
  });

  it('superscript and subscript reach the DOCX as vertical alignment, not flattened text (BP-W1-1)', async () => {
    // Before the sup/sub marks were modeled, "cm<sup>2</sup>" exported as
    // "cm2" — the run text survived and the meaning did not.
    const xml = await renderToDocumentXml('<p>BSA in cm<sup>2</sup>; CO<sub>2</sub> ≤ 5%.</p>');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
  });

  it('superscript and subscript survive the HTML/PDF branch too', () => {
    const html = blocksToHtml(sectionContentToBlocks('<p>cm<sup>2</sup> and CO<sub>2</sub></p>'));
    expect(html).toContain('<sup>2</sup>');
    expect(html).toContain('<sub>2</sub>');
  });

  it('sup/sub inside a table cell keep their alignment in the DOCX', async () => {
    const xml = await renderToDocumentXml(
      '<table><tr><th>Parameter</th></tr><tr><td>AUC<sub>0–t</sub> (µg·h/mL)</td></tr></table>',
    );
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
  });
});
