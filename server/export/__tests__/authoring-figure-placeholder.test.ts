/**
 * A figure the export does not file is named in its placeholder, never printed
 * (periodic review 2026-09-28, editor family, SEC-B-1/2 follow-on a, fix-up).
 *
 * Both renderers print "[Figure not exported: …]" for a figure whose bytes did
 * not resolve, and named it by its alt text or, with no alt, by its src. Until
 * the export applied the figure rule that line was reached for an external
 * address or a missing upload, whose src is short. Now the export also declines
 * inline data it used to embed (WebP, SVG, an upper-case type), and for such an
 * image with no alt the src IS the payload: a filed PDF or Word file printed
 * hundreds of kilobytes of base64 as a line of text. The placeholder now names
 * the kind of src in words, as the section save's refusal does.
 */
import { describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';

vi.mock('../../services/ana/uploaded-file-access.js', () => ({
  loadUploadedFile: vi.fn(async () => {
    throw new Error('not in this test');
  }),
}));

import { resolveAuthoringImages } from '../authoring-images';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';

/** About 150 KB of base64: the size of a small screenshot pasted inline. */
const PAYLOAD = Buffer.alloc(112_500, 0x5a).toString('base64');
const ORG = 7;

const PLACEHOLDER = /\[Figure not exported: [^\]]*\]/g;

async function pdfHtml(section: string): Promise<string> {
  return blocksToHtml(sectionContentToBlocks(section), await resolveAuthoringImages([section], ORG));
}

async function docxXml(section: string): Promise<{ xml: string; media: number }> {
  const blocks = sectionContentToBlocks(section);
  const doc = new docx.Document({
    numbering: orderedListNumbering(docx),
    sections: [{ children: blocksToDocx(docx, blocks, await resolveAuthoringImages([section], ORG)) as never[] }],
  });
  const zip = new AdmZip(await docx.Packer.toBuffer(doc));
  return {
    xml: zip.getEntry('word/document.xml')!.getData().toString('utf8'),
    media: zip.getEntries().filter((e) => e.entryName.startsWith('word/media/') && !e.isDirectory).length,
  };
}

describe('an inline image the export declines, with no alt text', () => {
  it.each([
    ['WebP', `data:image/webp;base64,${PAYLOAD}`, 'inline image/webp data'],
    ['an upper-case PNG type', `data:image/PNG;base64,${PAYLOAD}`, 'inline image/png data'],
    ['SVG', `data:image/svg+xml;base64,${PAYLOAD}`, 'inline image/svg+xml data'],
  ])('%s: the PDF names its kind and prints no base64', async (_label, src, kind) => {
    const printed = await pdfHtml(`<p>Stability.</p><img src="${src}"><p>No trend.</p>`);

    expect(printed.match(PLACEHOLDER)).toEqual([`[Figure not exported: ${kind}]`]);
    expect(printed).not.toContain(PAYLOAD.slice(0, 64));
    expect(printed.length).toBeLessThan(1_000);
  });

  it.each([
    ['WebP', `data:image/webp;base64,${PAYLOAD}`, 'inline image/webp data'],
    ['an upper-case PNG type', `data:image/PNG;base64,${PAYLOAD}`, 'inline image/png data'],
  ])('%s: the Word file names its kind and prints no base64', async (_label, src, kind) => {
    const { xml, media } = await docxXml(`<p>Stability.</p><img src="${src}"><p>No trend.</p>`);

    expect(media).toBe(0);
    expect(xml.match(PLACEHOLDER)).toEqual([`[Figure not exported: ${kind}]`]);
    expect(xml).not.toContain(PAYLOAD.slice(0, 64));
    expect(xml.length).toBeLessThan(10_000);
  });

  it('a figure in a table cell is named the same way', async () => {
    const printed = await pdfHtml(
      `<table><tbody><tr><td><img src="data:image/webp;base64,${PAYLOAD}"></td></tr></tbody></table>`,
    );
    expect(printed.match(PLACEHOLDER)).toEqual(['[Figure not exported: inline image/webp data]']);
    expect(printed).not.toContain(PAYLOAD.slice(0, 64));
  });
});

describe('what the placeholder still says (guards)', () => {
  it("the author's alt text, when there is one", async () => {
    const printed = await pdfHtml(`<img src="data:image/webp;base64,${PAYLOAD}" alt="Figure 2 — dissolution">`);
    expect(printed.match(PLACEHOLDER)).toEqual(['[Figure not exported: Figure 2 — dissolution]']);
  });

  it('an upload that did not resolve, by its reference, which the rule keeps short', async () => {
    const ref = '/api/authoring/images/file_1727500000000_k3v9qa';
    const { xml } = await docxXml(`<p>Stability.</p><img src="${ref}">`);
    expect(xml.match(PLACEHOLDER)).toEqual([`[Figure not exported: ${ref}]`]);
  });
});
