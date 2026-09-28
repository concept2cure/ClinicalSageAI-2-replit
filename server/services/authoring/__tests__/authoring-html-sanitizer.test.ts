/**
 * The server's half of "an image reference is a governed figure or nothing"
 * (periodic review 2026-09-28, editor family, SEC-B-1, SEC-B-2).
 *
 * `sanitizeAuthoringSectionHtml` cleans model- and seed-written HTML on its way
 * into the store (POST /docs/from-draft, the draft_authoring_document tool). It
 * kept every `<img src>`: `/api/authoring/images/../../tenant-export/full` and
 * `https://collector.example/p.png?d=…` both reached the record, where every
 * later reader's browser fetched them. It now removes an image that is not a
 * figure, whole.
 *
 * `refusedFigures` is what the section save asks. It reads the HTML the way a
 * browser does, because a browser is what would have fetched the image.
 */
import { describe, expect, it } from 'vitest';

import {
  describeRefusedFigures,
  refusedFigures,
  sanitizeAuthoringSectionHtml,
} from '../authoring-html-sanitizer';

const REF = '/api/authoring/images/file_1727500000000_k3v9qa';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const NOT_FIGURES = [
  '/api/authoring/images/../../tenant-export/full',
  '/api/authoring/images/%2e%2e/%2e%2e/users/me',
  '/api/authoring/images/..\\..\\tenant-export\\full',
  '/api/authoring/images/file_1_a?download=1',
  'https://collector.example/p.png?d=secret',
  '//collector.example/p.png',
  'data:image/svg+xml;base64,PHN2Zz4=',
  'data:text/html;base64,PHNjcmlwdD4=',
  'data:image/webp;base64,UklGRg==',
  'javascript:alert(1)',
];

describe('sanitizeAuthoringSectionHtml', () => {
  it.each(NOT_FIGURES)('removes an image that is not a figure, whole: %s', (src) => {
    const out = sanitizeAuthoringSectionHtml(
      `<p>Before.</p><img src="${src}" alt="planted"><p>After.</p>`,
    );
    expect(out).not.toContain('<img');
    expect(out).not.toContain('planted');
    expect(out).toContain('<p>Before.</p>');
    expect(out).toContain('<p>After.</p>');
  });

  it('keeps a governed reference and an inline PNG exactly as written', () => {
    const html = `<p>Figure.</p><img src="${REF}" alt="Chromatogram"><img src="${PNG}" alt="Inline">`;
    const out = sanitizeAuthoringSectionHtml(html);
    expect(out).toContain(`src="${REF}"`);
    expect(out).toContain(`src="${PNG}"`);
    expect(out).toContain('alt="Chromatogram"');
  });

  it('finds the image wherever the parse puts it: inside a table cell, and in upper case', () => {
    const out = sanitizeAuthoringSectionHtml(
      '<table><tbody><tr><td>Cell <IMG SRC=https://collector.example/p.png></td></tr></tbody></table>',
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('Cell');
  });

  it('still strips scripts and handlers, and leaves the chat-safe rest alone', () => {
    const out = sanitizeAuthoringSectionHtml(
      `<p onclick="x()">Text</p><script>alert(1)</script><img src="${REF}" onerror="steal()">`,
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onerror');
    expect(out).toContain(`src="${REF}"`);
  });

  it('does not leave its image rule on the shared DOMPurify instance', async () => {
    sanitizeAuthoringSectionHtml('<img src="https://collector.example/p.png">');
    const { default: purify } = await import('isomorphic-dompurify');
    const out = (purify as unknown as { sanitize: (h: string) => string }).sanitize(
      '<img src="https://example.com/logo.png">',
    );
    expect(out).toContain('<img');
  });
});

describe('refusedFigures — what the section save refuses', () => {
  it('names nothing in prose, a governed reference, an inline PNG, or an image with no src', async () => {
    expect(await refusedFigures('')).toEqual([]);
    expect(await refusedFigures('<p>A figure is described here.</p>')).toEqual([]);
    expect(await refusedFigures(`<img src="${REF}"><img src="${PNG}"><img alt="no src">`)).toEqual([]);
  });

  it.each(NOT_FIGURES)('names an image that is not a figure: %s', async (src) => {
    const html = `<p>x</p><img src="${REF}"><img src="${src.replace(/"/g, '&quot;')}">`;
    expect(await refusedFigures(html)).toEqual([{ position: 2, src }]);
  });

  it('reads the markup the way a browser does', async () => {
    const cases: Array<[string, string]> = [
      ['<IMG SRC=https://a.example/p.png>', 'https://a.example/p.png'],
      // `<image>` is parsed as <img>.
      ['<image src="https://b.example/p.png">', 'https://b.example/p.png'],
      // A ">" inside a quoted attribute does not end the tag.
      ['<img alt=">" src="https://c.example/p.png">', 'https://c.example/p.png'],
      // Character references are decoded before the browser sees the path.
      ['<img src="/api/authoring/images/&#46;&#46;/&#46;&#46;/tenant-export/full">', '/api/authoring/images/../../tenant-export/full'],
      // Nested where a sanitizer would drop the parent; the canvas parse does not.
      ['<video><img src="https://d.example/p.png"></video>', 'https://d.example/p.png'],
      ['<noscript><img src="https://e.example/p.png"></noscript>', 'https://e.example/p.png'],
      ['<img src="">', ''],
    ];
    for (const [html, src] of cases) {
      expect(await refusedFigures(html), html).toEqual([{ position: 1, src }]);
    }
  });

  it('says which images, by position and kind, without echoing an application path', () => {
    const message = describeRefusedFigures([
      { position: 2, src: 'https://collector.example/p.png' },
      { position: 3, src: '/api/authoring/images/../../tenant-export/full' },
      { position: 5, src: 'data:image/svg+xml;base64,PHN2Zz4=' },
    ]);
    expect(message).toMatch(/^Image 2 \(from another site\), image 3 \(not from the image store\) and image 5 \(inline image\/svg\+xml data\) are not uploaded figures\./);
    expect(message).toMatch(/upload/i);
    // The client hides any message carrying an API route (redactInternals).
    expect(message).not.toContain('/api/');
    expect(describeRefusedFigures([{ position: 1, src: '' }])).toMatch(
      /^Image 1 \(an empty reference\) is not an uploaded figure\./,
    );
  });
});
