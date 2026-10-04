/**
 * The export files a figure only when the canvas would show it
 * (periodic review 2026-09-28, editor family, SEC-B-1/2 follow-on a).
 *
 * The canvas, the read view and the section save share one rule for what an
 * image in a section may be (@shared/authoring/figure-refs): a governed
 * reference, compared as the whole string, or an inline PNG, JPEG or GIF. The
 * export kept rules of its own. It loaded any src that merely STARTED with the
 * image route, taking whatever came before the first `/`, `?` or `#` as the
 * file id, and it decoded a data: URI of any image type in any case. So the
 * filed PDF could carry a WebP, an SVG or a TIFF the canvas refused to show,
 * the Word file of the same document printed a placeholder for them, and a src
 * such as `/api/authoring/images/file_1_a/../x` filed the bytes of `file_1_a`.
 * It also read srcs with its own quoted-attribute regex while the export's
 * blocks read them through an HTML parser, so a figure written with a
 * character reference or an unquoted attribute resolved under a key no block
 * carried, and was printed as "[Figure not exported]".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ loadUploadedFile: vi.fn() }));
vi.mock('../../services/ana/uploaded-file-access.js', () => ({
  loadUploadedFile: (...a: unknown[]) => h.loadUploadedFile(...a),
}));

import { resolveAuthoringImages, unfiledFigureLabel } from '../authoring-images';
import { sectionContentToBlocks } from '../authoring-section-content';
import { blocksToHtml } from '../authoring-blocks-to-html';

/** 1×1 PNG — a real file. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_B64, 'base64');
const ORG = 7;

beforeEach(() => {
  h.loadUploadedFile.mockReset();
  h.loadUploadedFile.mockImplementation(async (fileId: string) => ({
    buffer: PNG_BYTES,
    mimeType: 'image/png',
    fileName: `${fileId}.png`,
  }));
});

const img = (src: string) => `<p>Stability results.</p><img src="${src}" alt="Figure 1">`;

describe('an image outside the figure rule is never fetched and never filed', () => {
  it.each([
    ['a dot segment after a real id', '/api/authoring/images/file_1_a/../x'],
    ['a query after a real id', '/api/authoring/images/file_1_a?x'],
    ['an id the store never minted', '/api/authoring/images/notminted'],
    ['percent-encoded dot segments', '/api/authoring/images/%2e%2e/users/me'],
    ['a reference padded with spaces', ' /api/authoring/images/file_1_a '],
  ])('%s: the loader is not called and nothing resolves', async (_label, src) => {
    const images = await resolveAuthoringImages([img(src)], ORG);
    expect(h.loadUploadedFile).not.toHaveBeenCalled();
    expect([...images.keys()]).toEqual([]);
  });

  it.each([
    ['an upper-case type', `data:image/PNG;base64,${PNG_B64}`],
    ['WebP, which Word cannot hold', `data:image/webp;base64,${PNG_B64}`],
    ['SVG, a script container', `data:image/svg+xml;base64,${PNG_B64}`],
    ['TIFF', `data:image/tiff;base64,${PNG_B64}`],
    ['a PNG whose payload holds a newline', `data:image/png;base64,${PNG_B64.slice(0, 20)}\n${PNG_B64.slice(20)}`],
  ])('inline %s: not decoded, not filed', async (_label, src) => {
    const images = await resolveAuthoringImages([img(src)], ORG);
    expect([...images.keys()]).toEqual([]);
  });

  it('the PDF of a section holding an inline WebP states it instead of embedding it', async () => {
    const html = img(`data:image/webp;base64,${PNG_B64}`);
    const printed = blocksToHtml(sectionContentToBlocks(html), await resolveAuthoringImages([html], ORG));
    expect(printed).toContain('[Figure not exported: Figure 1]');
    expect(printed).not.toContain('data:image/webp');
  });
});

describe('a figure resolves under the src its image block carries', () => {
  it('reads srcs the way the export parser does: character references, unquoted and upper-case', async () => {
    const html =
      '<p>x</p><img src="/api/authoring/images/file_1_&#97;" alt="A">' +
      '<table><tbody><tr><td><IMG SRC=/api/authoring/images/file_2_b></td></tr></tbody></table>';
    const images = await resolveAuthoringImages([html], ORG);

    expect(h.loadUploadedFile.mock.calls.map((c) => c[0])).toEqual(['file_1_a', 'file_2_b']);
    const blocks = sectionContentToBlocks(html);
    const blockSrcs = [
      ...blocks.filter((b) => b.kind === 'image').map((b) => b.src),
      ...blocks.flatMap((b) => (b.rows ?? []).flat()).flatMap((c) => c.images ?? []).map((i) => i.src),
    ];
    expect(blockSrcs).toEqual(['/api/authoring/images/file_1_a', '/api/authoring/images/file_2_b']);
    for (const src of blockSrcs) expect(images.has(src as string), String(src)).toBe(true);
  });

  it('still files a governed reference and an inline PNG (guard)', async () => {
    const ref = '/api/authoring/images/file_1727500000000_k3v9qa';
    const inline = `data:image/png;base64,${PNG_B64}`;
    const images = await resolveAuthoringImages([img(ref), img(inline)], ORG);

    expect(h.loadUploadedFile).toHaveBeenCalledWith('file_1727500000000_k3v9qa', ORG);
    expect(images.get(ref)).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 });
    expect(images.get(inline)).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 });
    expect(images.get(inline)?.buffer.equals(PNG_BYTES)).toBe(true);
  });

  it('files an inline JPEG and GIF under their own types (guard)', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.from([2, 0, 3, 0, 0, 0, 0, 0])]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x07, 0x03, 0, 0, 0, 0, 0, 0, 0]);
    const gifSrc = `data:image/gif;base64,${gif.toString('base64')}`;
    const jpegSrc = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
    const images = await resolveAuthoringImages([img(gifSrc), img(jpegSrc)], ORG);

    expect(images.get(gifSrc)).toMatchObject({ mimeType: 'image/gif', width: 2, height: 3 });
    expect(images.get(jpegSrc)).toMatchObject({ mimeType: 'image/jpeg', width: 7, height: 5 });
  });
});

/* What the "[Figure not exported: …]" placeholder names (fix-up). With no alt
   text the renderers printed the src, which for inline data the export now
   declines is the whole payload. The renderers' own test is
   authoring-figure-placeholder.test.ts. */
describe('unfiledFigureLabel', () => {
  const payload = PNG_B64.repeat(4);
  it.each([
    ["the author's alt text, as written", { src: `data:image/webp;base64,${payload}`, alt: 'Figure 2' }, 'Figure 2'],
    ['an inline WebP, in words', { src: `data:image/webp;base64,${payload}` }, 'inline image/webp data'],
    ['an upper-case PNG type, in words', { src: `data:image/PNG;base64,${payload}` }, 'inline image/png data'],
    ['an inline PNG whose bytes did not decode, in words', { src: 'data:image/png;base64,A' }, 'inline image/png data'],
    ['an external address, in words', { src: 'https://collector.example/p.png?d=secret' }, 'from another site'],
    ['a path out of the image route, in words', { src: '/api/authoring/images/../../tenant-export/full' }, 'not from the image store'],
    ['an upload that did not resolve, by its reference', { src: '/api/authoring/images/file_1727500000000_k3v9qa' }, '/api/authoring/images/file_1727500000000_k3v9qa'],
    ['no src at all', {}, 'unresolved image reference'],
  ])('%s', (_label, fig, label) => {
    expect(unfiledFigureLabel(fig)).toBe(label);
  });

  it('never carries a data: payload, whatever its length', () => {
    const src = `data:image/webp;base64,${'QUJD'.repeat(50_000)}`;
    expect(unfiledFigureLabel({ src }).length).toBeLessThan(60);
    expect(unfiledFigureLabel({ src, alt: '' })).toBe('inline image/webp data');
  });
});

/* ── The export files an image only where a browser shows the same one
   (refute-review of the figure rule, 2026-10-04, round 3: D1, D3) ─────────
   The export reads sections with node-html-parser; the save check, the canvas
   and the read view read them as a browser does. The two disagree on a
   duplicated attribute (a browser keeps the first, the parser the last) and on
   markup a browser reads as text or not at all: a comment, a raw-text element,
   a <template>. So the export could file an image the canvas never showed, or
   a different one from the one it showed. Now a section whose two readings of
   its images differ files none of them, and its sources are filed for no
   other section of the export either: every such image prints its placeholder. */
describe('the export files an image only where a browser shows the same one', () => {
  const pngWith = (marker: string) => `data:image/png;base64,${PNG_B64.slice(0, -4)}${marker}==`;
  const A = pngWith('AAAA');
  const B = pngWith('BBBB');

  it.each([
    ['a duplicated src: the browser shows the first, the parser files the last', `<img src="${A}" SRC="${B}" alt="Figure 1">`],
    ['the same, where the second is also shown elsewhere in the section', `<img src="${B}" alt="0"><img src="${A}" SRC="${B}" alt="Figure 1">`],
    ['inside a bogus comment', `<p>x</p><!x<img src="${B}" alt="Figure 1">`],
    ['inside a processing-instruction-shaped comment', `<p>x</p><?x<img src="${B}" alt="Figure 1">`],
    ['inside a textarea', `<textarea><img src="${B}" alt="Figure 1"></textarea>`],
    ['inside an xmp', `<xmp><img src="${B}" alt="Figure 1"></xmp>`],
    ['inside a template', `<template><img src="${B}" alt="Figure 1"></template>`],
    // A browser moves an image that sits in a table but in no cell to before
    // the table (foster parenting); the parser keeps it where it is written.
    // The same two figures, in an order the canvas does not show.
    ['in a table but in no cell', `<table><tbody><tr><td><img src="${A}" alt="1"></td></tr><img src="${B}" alt="2"></tbody></table>`],
  ])('%s: nothing from the section is filed', async (_label, html) => {
    const images = await resolveAuthoringImages([html], ORG);
    expect([...images.keys()].map((k) => k.slice(-8)), 'filed an image the canvas does not show as it is').toEqual([]);
  });

  it('a governed reference behind a duplicated src is not even loaded', async () => {
    const html = '<img src="/api/authoring/images/file_1_a" SRC="/api/authoring/images/file_2_b" alt="Figure 1">';
    const images = await resolveAuthoringImages([html], ORG);
    expect(h.loadUploadedFile).not.toHaveBeenCalled();
    expect([...images.keys()]).toEqual([]);
  });

  it('a source hidden or swapped in one section is filed for no other section of the export', async () => {
    const images = await resolveAuthoringImages([img(B), `<img src="${A}" SRC="${B}" alt="Figure 2">`], ORG);
    expect([...images.keys()]).toEqual([]);
  });

  it('a section both readers read alike still files every figure (guard)', async () => {
    const ref = '/api/authoring/images/file_1727500000000_k3v9qa';
    const html = `<p>Two figures.</p><img src="${ref}" alt="Figure 1"><table><tbody><tr><td><IMG SRC=${A}></td></tr></tbody></table>`;
    const images = await resolveAuthoringImages([html, img(B)], ORG);
    expect([...images.keys()].sort()).toEqual([ref, A, B].sort());
  });
});

/* D5: refusedKind read any 40 characters after `data:` as a type, so a data:
   URI with no type had 40 characters of its payload printed as one. */
describe('a typeless data: URI is named without its payload', () => {
  it.each([
    [`data:${PNG_B64}`, 'inline data'],
    [`data:,${PNG_B64}`, 'inline data'],
    [`data:image/webp;base64,${PNG_B64}`, 'inline image/webp data'],
    ['data:image/svg+xml,<svg/>', 'inline image/svg+xml data'],
  ])('%#', (src, expected) => {
    expect(unfiledFigureLabel({ src })).toBe(expected);
  });
});

/* D2: the export read <pre> as raw text, so a figure inside one printed its
   markup and payload into the PDF and the Word file, and a <code> its tags. */
describe('a <pre> is read as markup by the export', () => {
  it('a figure inside one is a figure: filed, and its payload never printed', async () => {
    const html = `<p>Chromatogram.</p><pre><img src="data:image/png;base64,${PNG_B64}" alt="Figure 1"></pre>`;
    const images = await resolveAuthoringImages([html], ORG);
    expect([...images.keys()]).toEqual([`data:image/png;base64,${PNG_B64}`]);
    const blocks = sectionContentToBlocks(html);
    expect(blocks.some((b) => b.kind === 'image')).toBe(true);
    expect(JSON.stringify(blocks.filter((b) => b.kind !== 'image'))).not.toContain('base64');
  });

  it('a <code> inside one prints its text, not its tags', () => {
    const runs = sectionContentToBlocks('<pre><code>if (x &lt; 1) {}</code></pre>').flatMap((b) => b.runs.map((r) => r.text));
    expect(runs.join('')).toBe('if (x < 1) {}');
  });
});
