// @vitest-environment jsdom
/**
 * AuthoredHtml — the read-only figure contract, pinned.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * The document view rendered stored section HTML through the CHAT sanitiser,
 * whose allowlist has no <img> — a figure the author placed, saved and could
 * see on the canvas was SILENTLY ABSENT from the assembled document. And a
 * governed reference (`/api/authoring/images/<id>`) cannot load from a bare
 * <img src> because the API authenticates by Authorization header only.
 *
 * The mechanism is pinned too: resolution happens in the STRING before React
 * renders it (a post-injection DOM mutation was discarded whenever React
 * re-injected the dangerouslySetInnerHTML content — StrictMode does this by
 * design, which is exactly how the first implementation failed live).
 *
 * And a figure is ONLY a figure (periodic review 2026-09-28, editor family,
 * SEC-B-1, SEC-B-2). A reference that walks out of the image store with dot
 * segments was fetched in the reader's identity, and an external address was
 * fetched from its host by every reader. Neither is fetched now; both are
 * stated as a figure that must be uploaded.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoredHtml } from '../AuthoredHtml';

// jsdom has no createObjectURL; the resolver's contract is "an URL an <img>
// can display", which the test represents with a recognizable stub.
let urlSeq = 0;
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
  `blob:test/${++urlSeq}`;

const okImage = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
  } as unknown as Response);

const UPLOAD_NOTE = /Upload the image to include it/;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthoredHtml', () => {
  it('renders sanitized prose and keeps a governed figure, resolved to displayable bytes', async () => {
    apiRequest.mockImplementation(okImage);
    // Unique reference per test — the resolver caches per src for the module's lifetime.
    const ref = '/api/authoring/images/file_101_ok';
    const { container } = render(
      <AuthoredHtml
        className="ed-full-sec-body"
        html={`<p>before</p><img src="${ref}" alt="Chromatogram"><script>alert(1)</script>`}
      />,
    );
    // Prose is there, script is not, and the reference rendered immediately
    // (src-less placeholder) rather than firing an unauthenticated request.
    expect(container.querySelector('p')?.textContent).toBe('before');
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('data-authsrc')).toBe(ref);
    // Resolution lands IN THE RENDERED STRING: the img gains a displayable src.
    await waitFor(() => {
      const resolved = container.querySelector('img');
      expect(resolved?.getAttribute('src') ?? '').toMatch(/^blob:test\//);
    });
    expect(apiRequest).toHaveBeenCalledWith('GET', ref);
  });

  it('states a failed reference instead of leaving a broken glyph', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    const { container } = render(
      <AuthoredHtml html={'<p>text</p><img src="/api/authoring/images/file_102_gone" alt="x">'} />,
    );
    await waitFor(() => {
      // A 404 is a store-side refusal — the line states the actual cause the
      // resolver reported, not a guess between two.
      expect(container.querySelector('.ed-figure-missing')?.textContent).toMatch(
        /Couldn’t load this figure — the image store returned an error/,
      );
    });
    // The failed reference is REPLACED by the statement — no img remains.
    expect(container.querySelector('img')).toBeNull();
    // The prose is untouched by the failure.
    expect(container.querySelector('p:not(.ed-figure-missing)')?.textContent).toBe('text');
  });

  it('refuses a reference OUTSIDE the governed images route — no authenticated fetch fires', async () => {
    apiRequest.mockImplementation(okImage);
    // DOMPurify keeps data-* attributes, so a directly-authored data-authsrc
    // survives sanitization: the RESOLVER is the gate. A same-app API path
    // that is not a figure reference must never be fetched with the viewer's
    // credentials on the author's behalf.
    const { container } = render(
      <AuthoredHtml html={'<img data-authsrc="/api/authoring/docs/other-doc/audit" alt="x">'} />,
    );
    await waitFor(() => {
      expect(container.querySelector('.ed-figure-missing')?.textContent).toMatch(UPLOAD_NOTE);
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each([
    '/api/authoring/images/../../tenant-export/full',
    '/api/authoring/images/%2e%2e/%2e%2e/users/me',
    '/api/authoring/images/..\\..\\tenant-export\\full',
    '/api/authoring/images/file_1_a/../../../compliance/gdpr/7/data-subject/42/export',
    '/api/authoring/images/file_1_a?download=1',
  ])('never fetches a reference that walks out of the image store: %s', async (src) => {
    apiRequest.mockImplementation(okImage);
    // Through src (what the editor stores) and through a stored data-authsrc
    // (which DOMPurify keeps): both reach the same resolver.
    const { container } = render(
      <AuthoredHtml
        html={`<p>text</p><img src="${src}" alt="a"><img data-authsrc="${src}" alt="b">`}
      />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('.ed-figure-missing')).toHaveLength(2);
    });
    for (const note of Array.from(container.querySelectorAll('.ed-figure-missing'))) {
      expect(note.textContent).toMatch(UPLOAD_NOTE);
    }
    expect(apiRequest).not.toHaveBeenCalled();
    expect(container.querySelector('img')).toBeNull();
  });

  it.each([
    'https://collector.example/p.png?d=secret',
    '//collector.example/p.png',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/webp;base64,UklGRg==',
  ])('never displays a src that is not a figure, and says it must be uploaded: %s', async (src) => {
    apiRequest.mockImplementation(okImage);
    const { container } = render(<AuthoredHtml html={`<img src="${src}" alt="ext">`} />);
    // Not live on the FIRST paint either: the placeholder carries no src.
    expect(container.querySelector('img')?.getAttribute('src')).toBeNull();
    await waitFor(() => {
      expect(container.querySelector('.ed-figure-missing')?.textContent).toMatch(UPLOAD_NOTE);
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('collector.example');
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('displays an inline PNG as it is, with no request and no statement', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const { container } = render(<AuthoredHtml html={`<img src="${png}" alt="inline">`} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(png);
    expect(container.querySelector('.ed-figure-missing')).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
