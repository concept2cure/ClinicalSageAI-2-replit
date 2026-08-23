/**
 * A figure authored in the editor survives export.
 *
 * Before the image block existed, an <img> in stored section HTML was
 * silently DELETED from every DOCX and PDF export: the parser's walker had no
 * img branch (a void tag contributes no children), and the trailing
 * whitespace filter then dropped the empty block. A filed document missing a
 * figure the editor displays is a different document — the exact fabrication
 * the export parser exists to prevent. Per the working agreement ("verify by
 * making the check fail"), the first test pins that failure shape: it fails
 * against the old parser because the parser returned zero blocks for
 * image-only content.
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import * as docx from 'docx';

import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToDocx, orderedListNumbering } from '../authoring-blocks-to-docx';
import { blocksToHtml } from '../authoring-blocks-to-html';
import {
  collectImageSrcs,
  sniffImageDimensions,
  type ResolvedImage,
} from '../authoring-images';

/** 1×1 transparent PNG — a real file. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const REF = '/api/authoring/images/file_123_abc';
const SECTION_HTML = `<p>The stability profile is shown below.</p><img src="${REF}" alt="Figure 1 — 24-month stability"><p>No trend was observed.</p>`;

const resolved = (): Map<string, ResolvedImage> =>
  new Map([[REF, { buffer: PNG_1X1, mimeType: 'image/png', width: 1, height: 1 }]]);

describe('the parser keeps figures', () => {
  it('an <img> becomes an image block instead of vanishing (the old failure)', () => {
    const blocks = sectionContentToBlocks(SECTION_HTML);
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'image', 'paragraph']);
    const img = blocks[1];
    expect(img.src).toBe(REF);
    expect(img.alt).toBe('Figure 1 — 24-month stability');
  });

  it('image-only content is not dropped by the whitespace filter (the trap)', () => {
    const blocks = sectionContentToBlocks(`<img src="${REF}" alt="Figure 1">`);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('image');
  });
});

describe('collectImageSrcs', () => {
  it('finds and deduplicates refs across sections', () => {
    expect(
      collectImageSrcs([SECTION_HTML, `<p>again</p><img src='${REF}'>`, null, '<p>none</p>']),
    ).toEqual([REF]);
  });
});

describe('sniffImageDimensions', () => {
  it('reads PNG, GIF and JPEG headers; refuses garbage', () => {
    expect(sniffImageDimensions(PNG_1X1)).toEqual({ width: 1, height: 1 });

    const gif = Buffer.concat([
      Buffer.from('GIF89a', 'ascii'),
      Buffer.from([0x02, 0x00, 0x03, 0x00, 0, 0, 0, 0]),
    ]);
    expect(sniffImageDimensions(gif)).toEqual({ width: 2, height: 3 });

    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x07, 0x03, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(sniffImageDimensions(jpeg)).toEqual({ width: 7, height: 5 });

    expect(sniffImageDimensions(Buffer.from('not an image at all'))).toBeNull();
  });
});

describe('PDF print HTML', () => {
  it('embeds the resolved figure as a data URI with its caption', () => {
    const html = blocksToHtml(sectionContentToBlocks(SECTION_HTML), resolved());
    expect(html).toContain(`data:image/png;base64,${PNG_1X1.toString('base64')}`);
    expect(html).toContain('<figcaption>Figure 1 — 24-month stability</figcaption>');
    // The raw reference never reaches the renderer — only bytes do.
    expect(html).not.toContain(REF);
  });

  it('states an unresolved figure instead of dropping it', () => {
    const html = blocksToHtml(sectionContentToBlocks(SECTION_HTML), new Map());
    expect(html).toContain('[Figure not exported: Figure 1 — 24-month stability]');
    expect(html).not.toContain('data:image/png');
  });
});

describe('DOCX', () => {
  async function documentXmlAndMedia(images: Map<string, ResolvedImage>) {
    const blocks = sectionContentToBlocks(SECTION_HTML);
    const doc = new docx.Document({
      numbering: orderedListNumbering(docx),
      sections: [{ children: blocksToDocx(docx, blocks, images) as never[] }],
    });
    const buf = await docx.Packer.toBuffer(doc);
    const zip = new AdmZip(buf);
    return {
      xml: zip.getEntry('word/document.xml')!.getData().toString('utf8'),
      media: zip
        .getEntries()
        .filter((e) => e.entryName.startsWith('word/media/') && !e.isDirectory),
    };
  }

  it('the figure is REALLY in the filed .docx — a drawing plus its media part', async () => {
    const { xml, media } = await documentXmlAndMedia(resolved());
    expect(xml).toContain('<w:drawing>');
    expect(media.length).toBe(1);
    expect(media[0].getData().equals(PNG_1X1)).toBe(true);
    // The prose around the figure survives in order.
    expect(xml).toContain('The stability profile is shown below.');
    expect(xml).toContain('No trend was observed.');
  });

  it('an unresolved figure files a stated placeholder, never silence', async () => {
    const { xml, media } = await documentXmlAndMedia(new Map());
    expect(xml).not.toContain('<w:drawing>');
    expect(media.length).toBe(0);
    expect(xml).toContain('[Figure not exported: Figure 1 — 24-month stability]');
  });
});
