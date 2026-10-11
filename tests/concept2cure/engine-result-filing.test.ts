/**
 * BP-W2-4 — an engine result filed as a section SURVIVES export, stamp intact.
 *
 * The formatter promises to emit only markup the export parser's allowlist
 * knows, and to carry the full inputs hash. That promise is what this file
 * verifies against the REAL export pipeline: formatter → section content →
 * block model → the HTML/PDF branch and the DOCX branch.
 */
import { describe, it, expect } from 'vitest';
import * as docx from 'docx';
import AdmZip from 'adm-zip';

import { engineResultToHtml, provenanceStampHtml } from '../../client/src/concept2cure/v2/engineResultHtml';
import { sectionContentToBlocks } from '../../server/export/authoring-section-content';
import { blocksToHtml } from '../../server/export/authoring-blocks-to-html';
import { blocksToDocx, orderedListNumbering } from '../../server/export/authoring-blocks-to-docx';

const FULL_HASH = 'c88e6cd0d3e70f1dc2b07dcccd8e270b747df2e6d04bbb9b83edf13a83ce8d07';

const PROV = {
  engine: 'c2c-stats',
  engineVersion: '1.0.0',
  method: 'assurance-two-sample-means',
  seed: 12345,
  inputsSha256: FULL_HASH,
  reproducible: true,
};

const RESULT_HTML = engineResultToHtml({
  title: 'Assurance — engine result',
  rows: [
    ['Assurance', 0.771146],
    ['Power at prior mean', 0.872528],
  ],
  provenance: PROV,
});

async function toDocumentXml(html: string): Promise<string> {
  const blocks = sectionContentToBlocks(html);
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    sections: [{ children: blocksToDocx(docx, blocks) }],
  });
  const buf = await docx.Packer.toBuffer(doc);
  return new AdmZip(buf).readAsText('word/document.xml');
}

describe('engine result → authored section → export', () => {
  it('parses to a real table block plus the stamp paragraph — nothing is dropped', () => {
    const blocks = sectionContentToBlocks(RESULT_HTML);
    const table = blocks.find((b) => b.kind === 'table');
    expect(table, 'the result table vanished in parsing').toBeTruthy();
    const flat = JSON.stringify(blocks);
    expect(flat).toContain('0.771146');
    expect(flat).toContain(FULL_HASH);
    expect(flat).toContain('reproducible');
  });

  it('the stamp reaches the DOCX as document text with the FULL hash', async () => {
    const xml = await toDocumentXml(RESULT_HTML);
    expect((xml.match(/<w:tbl>/g) || []).length).toBe(1);
    expect(xml).toContain('0.771146');
    expect(xml).toContain(FULL_HASH);
  });

  it('the HTML/PDF branch keeps the table and the italic stamp', () => {
    const html = blocksToHtml(sectionContentToBlocks(RESULT_HTML));
    expect(html).toContain('<table');
    expect(html).toContain(FULL_HASH);
    expect(html).toMatch(/<i>.*reproducible.*<\/i>/);
  });

  it('escapes hostile values instead of letting them become markup', () => {
    const html = engineResultToHtml({
      title: 'x',
      rows: [['label', '<script>alert(1)</script>']],
      provenance: PROV,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('the stamp alone is allowlist-safe markup', () => {
    const stamp = provenanceStampHtml(PROV);
    expect(stamp.startsWith('<p><i>')).toBe(true);
    expect(stamp).toContain(FULL_HASH);
  });

  it('carries structured tables, heterogeneous columns and exact values through both export branches', async () => {
    const html = engineResultToHtml({
      title: 'OC — engine result',
      rows: [['Type I error', 0.025]],
      tables: [{
        label: 'Operating characteristics',
        columns: [{ key: 'drift', label: 'Drift' }, { key: 'power', label: 'Power' }],
        rows: [
          { drift: 0, power: 0.0250000000000123 },
          { drift: 2, power: 0.876543210987654, stoppedEarly: false, bounds: { lower: null, upper: 3.14 } },
          null,
        ],
      }],
      provenance: PROV,
    });
    const blocks = sectionContentToBlocks(html);
    const tables = blocks.filter((b) => b.kind === 'table');
    expect(tables).toHaveLength(2);
    const flat = JSON.stringify(blocks);
    for (const expected of ['Operating characteristics', 'Drift', 'Power', 'stoppedEarly', 'bounds', '0.0250000000000123', '0.876543210987654', '{"lower":null,"upper":3.14}', FULL_HASH]) {
      expect(flat).toContain(expected.replaceAll('"', '\\"'));
    }
    expect(html).toContain('<td>no</td>');
    expect(html).toContain('<td>—</td>');
    const exportedHtml = blocksToHtml(blocks);
    expect((exportedHtml.match(/<table/g) ?? [])).toHaveLength(2);
    expect(exportedHtml).toContain('0.876543210987654');
    expect(exportedHtml).toContain(FULL_HASH);
    const xml = await toDocumentXml(html);
    expect((xml.match(/<w:tbl>/g) ?? [])).toHaveLength(2);
    expect(xml).toContain('0.876543210987654');
    expect(xml).toContain('stoppedEarly');
    expect(xml).toContain(FULL_HASH);
  });

  it('escapes every structured-table label and cell as text, including nested values', () => {
    const html = engineResultToHtml({
      title: '<img src=x onerror=alert(1)>',
      rows: [],
      tables: [{
        label: '<script>table</script>',
        columns: [{ key: 'value', label: '<svg onload=alert(2)> & value' }],
        rows: [{ value: '<img src=x onerror=alert(3)>', extra: { note: '<script>alert(4)</script>' } }],
      }],
      provenance: { ...PROV, method: '<script>method</script>' },
    });
    expect(html).not.toMatch(/<(script|img|svg)\b/);
    for (const text of ['&lt;img src=x onerror=alert(1)&gt;', '&lt;script&gt;table&lt;/script&gt;', '&lt;svg onload=alert(2)&gt; &amp; value', '&lt;img src=x onerror=alert(3)&gt;', '&lt;script&gt;alert(4)&lt;/script&gt;']) {
      expect(html).toContain(text);
    }
    const exportedHtml = blocksToHtml(sectionContentToBlocks(html));
    expect(exportedHtml).not.toMatch(/<(script|img|svg)\b/);
    expect(exportedHtml).toContain('&lt;img src=x onerror=alert(3)&gt;');
  });

  it('does not truncate a structured table at the screen preview limit', () => {
    const html = engineResultToHtml({
      title: 'OC', rows: [], provenance: PROV,
      tables: [{ label: 'Grid', rows: Array.from({ length: 65 }, (_, i) => ({ drift: i, power: i / 100 })) }],
    });
    expect(html).toContain('<td>64</td><td>0.64</td>');
    expect((html.match(/<td>/g) ?? [])).toHaveLength(130);
    expect(html).toContain(FULL_HASH);
  });
});
