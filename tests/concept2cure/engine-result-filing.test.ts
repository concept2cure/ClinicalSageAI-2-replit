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
});
