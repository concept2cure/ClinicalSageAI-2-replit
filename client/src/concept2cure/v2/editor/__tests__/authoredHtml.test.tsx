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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthoredHtml', () => {
  it('renders sanitized prose and keeps a governed figure, resolved to displayable bytes', async () => {
    apiRequest.mockImplementation(okImage);
    // Unique reference per test — the resolver caches per src for the module's lifetime.
    const ref = '/api/authoring/images/file_ok_1';
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
      <AuthoredHtml html={'<p>text</p><img src="/api/authoring/images/file_gone_1" alt="x">'} />,
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
      expect(container.querySelector('.ed-figure-missing')?.textContent).toMatch(
        /its reference points outside the image store/,
      );
    });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('leaves external images alone and never calls the API for them', async () => {
    apiRequest.mockImplementation(okImage);
    const { container } = render(
      <AuthoredHtml html={'<img src="https://example.com/fig.png" alt="ext">'} />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/fig.png');
    expect(img?.hasAttribute('data-authsrc')).toBe(false);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
