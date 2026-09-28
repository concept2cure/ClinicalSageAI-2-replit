/**
 * What an image in a governed section may point at, pinned on the cases the
 * rule exists to refuse (periodic review 2026-09-28, editor family, SEC-B-1
 * and SEC-B-2).
 *
 * The canvas (imageNode.ts), the read view (renderSafeMarkdown.ts and
 * AuthoredHtml.tsx) and the server (authoring-html-sanitizer.ts and the section
 * save) all ask these predicates. A src that passes here is fetched or shown
 * by all of them, and one that is refused here is refused by all of them.
 */
import { describe, expect, it } from 'vitest';

import {
  AUTHORING_IMAGE_URL_PREFIX,
  isFigureSrc,
  isGovernedImageRef,
  isInlineFigureImage,
} from '../authoring/figure-refs';

const REF = `${AUTHORING_IMAGE_URL_PREFIX}file_1727500000000_k3v9qa`;
// A real 1x1 PNG.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('a governed figure reference', () => {
  it('is the store route followed by an id in the shape the store mints', () => {
    expect(isGovernedImageRef(REF)).toBe(true);
    expect(isGovernedImageRef(`${AUTHORING_IMAGE_URL_PREFIX}file_1_a`)).toBe(true);
    // Math.random().toString(36) can be shorter than six characters after
    // the "0.", and the store still mints the id.
    expect(isGovernedImageRef(`${AUTHORING_IMAGE_URL_PREFIX}file_1727500000000_i`)).toBe(true);
    expect(isGovernedImageRef(`${AUTHORING_IMAGE_URL_PREFIX}file_1727500000000_`)).toBe(true);
    expect(isFigureSrc(REF)).toBe(true);
  });

  it.each([
    ['dot segments', '/api/authoring/images/../../tenant-export/full'],
    ['dot segments after a valid id', '/api/authoring/images/file_1_a/../../../tenant-export/full'],
    ['a trailing dot segment', '/api/authoring/images/file_1_a/..'],
    ['percent-encoded dot segments', '/api/authoring/images/%2e%2e/%2e%2e/users/me'],
    ['upper-case percent-encoding', '/api/authoring/images/%2E%2E/%2E%2E/users/me'],
    ['a half-encoded dot segment', '/api/authoring/images/.%2e/.%2e/users/me'],
    ['backslash segments', '/api/authoring/images/..\\..\\tenant-export\\full'],
    ['an extra segment', '/api/authoring/images/file_1_a/export'],
    ['a query', '/api/authoring/images/file_1_a?download=1'],
    ['a fragment', '/api/authoring/images/file_1_a#x'],
    ['leading whitespace', ' /api/authoring/images/file_1_a'],
    ['a trailing newline', '/api/authoring/images/file_1_a\n'],
    ['a tab inside the id', '/api/authoring/images/file_1\t_a'],
    ['an absolute URL to the route', 'https://app.example/api/authoring/images/file_1_a'],
    ['a protocol-relative URL', '//evil.example/api/authoring/images/file_1_a'],
    ['a doubled slash', '/api/authoring/images//file_1_a'],
    ['an id the store does not mint', '/api/authoring/images/77'],
    ['an upper-case id', '/api/authoring/images/FILE_1_A'],
    ['the bare route', '/api/authoring/images/'],
    ['another API route', '/api/tenant-export/full'],
  ])('is not %s', (_label, src) => {
    expect(isGovernedImageRef(src)).toBe(false);
    expect(isFigureSrc(src)).toBe(false);
  });
});

describe('an inline figure', () => {
  it('is a base64 PNG, JPEG or GIF: the formats both export branches file', () => {
    expect(isInlineFigureImage(PNG)).toBe(true);
    expect(isInlineFigureImage('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(isInlineFigureImage('data:image/gif;base64,R0lGODlhAQABAAAAACw=')).toBe(true);
    expect(isFigureSrc(PNG)).toBe(true);
  });

  it.each([
    ['WebP, which Word cannot hold', 'data:image/webp;base64,UklGRg=='],
    ['SVG, a script container', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['SVG as text', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['HTML', 'data:text/html;base64,PHNjcmlwdD4='],
    ['image/jpg, which the export does not embed', 'data:image/jpg;base64,/9j/4AAQ'],
    ['a payload that is not base64', 'data:image/png,rawbytes'],
    ['a payload carrying markup', 'data:image/png;base64,AAAA"><script>'],
    ['an empty payload', 'data:image/png;base64,'],
  ])('is not %s', (_label, src) => {
    expect(isInlineFigureImage(src)).toBe(false);
    expect(isFigureSrc(src)).toBe(false);
  });
});

describe('anything else', () => {
  it.each([
    'https://collector.example/p.png?d=secret',
    'http://example.com/fig.png',
    'javascript:alert(1)',
    'blob:https://app.example/0b3c',
    'x.png',
    '',
  ])('is not a figure: %j', (src) => {
    expect(isFigureSrc(src)).toBe(false);
  });

  it('a value that is not a string is not a figure', () => {
    expect(isFigureSrc(null)).toBe(false);
    expect(isFigureSrc(undefined)).toBe(false);
    expect(isFigureSrc(7)).toBe(false);
  });
});
