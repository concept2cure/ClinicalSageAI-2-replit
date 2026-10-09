// @vitest-environment jsdom
/**
 * The editor's schema can hold a figure.
 *
 * Before AuthoringImage existed, content containing an <img> was forced into
 * raw-source mode by the fidelity gate — a rich-mode parse would have
 * silently rewritten the figure out of the governed record on the next save.
 * These tests pin the two facts that make rich editing of figure-bearing
 * sections safe: the reference round-trips byte-relevant attributes (src,
 * alt) through parse → serialize, and inserting a figure produces exactly
 * the reference markup the store handed back.
 *
 * And that a figure is ONLY a figure (periodic review 2026-09-28, editor
 * family, SEC-B-1, SEC-B-2): a src that walks out of the image store, or points
 * anywhere else, is never fetched, never displayed, and never parsed in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, generateJSON } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringImage, NOT_A_FIGURE_REF, resolveImageSrc } from '../editor/imageNode';
import { assessFidelity } from '../editor/roundTrip';

const REF = '/api/authoring/images/file_456_def';
// A real 1x1 PNG, inline.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Every src the finding named, and the neighbours a prefix test also let by. */
const WALKS_OUT = [
  '/api/authoring/images/../../tenant-export/full',
  '/api/authoring/images/%2e%2e/%2e%2e/users/me',
  '/api/authoring/images/..\\..\\tenant-export\\full',
  '/api/authoring/images/file_1_a/../../../compliance/gdpr/7/data-subject/42/export',
  '/api/authoring/images/file_1_a?download=1',
];
const NOT_FIGURES = [
  'https://collector.example/p.png?d=secret',
  '//collector.example/p.png',
  'data:image/svg+xml;base64,PHN2Zz4=',
  'data:text/html;base64,PHNjcmlwdD4=',
  'data:image/webp;base64,UklGRg==',
  '/api/c2c/projects',
];

// jsdom has no createObjectURL; the resolver's contract is "an URL an <img>
// can display", represented here by a recognisable stub.
(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => 'blob:test/1';

afterEach(() => {
  vi.clearAllMocks();
});

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), AuthoringImage],
    content,
  });
}

function imageCount(ed: Editor): number {
  let count = 0;
  ed.state.doc.descendants((n) => {
    if (n.type.name === 'image') count++;
    return true;
  });
  return count;
}

describe('figures in the section schema', () => {
  it('a stored <img> reference survives parse → serialize untouched', () => {
    const ed = makeEditor(
      `<p>Before the figure.</p><img src="${REF}" alt="Figure 2 — impurity profile"><p>After it.</p>`,
    );
    const html = ed.getHTML();
    expect(html).toContain(`src="${REF}"`);
    expect(html).toContain('alt="Figure 2 — impurity profile"');
    expect(html).toContain('Before the figure.');
    expect(html).toContain('After it.');
    ed.destroy();
  });

  it('insertAuthoringImage writes the store reference at the caret', () => {
    const ed = makeEditor('<p>Prose.</p>');
    const ok = ed
      .chain()
      .focus()
      .insertAuthoringImage({ src: REF, alt: 'inserted figure' })
      .run();
    expect(ok).toBe(true);
    expect(ed.getHTML()).toContain(`src="${REF}"`);
    expect(imageCount(ed)).toBe(1);
    ed.destroy();
  });

  it('an inline PNG parses and round-trips as it is', () => {
    const ed = makeEditor(`<img src="${PNG}" alt="inline">`);
    expect(imageCount(ed)).toBe(1);
    expect(ed.getHTML()).toContain(`src="${PNG}"`);
    ed.destroy();
  });
});

describe('an image reference is a governed figure or nothing', () => {
  it('fetches a governed reference with the viewer’s credentials', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
    });
    await expect(resolveImageSrc(REF)).resolves.toBe('blob:test/1');
    expect(apiRequest).toHaveBeenCalledWith('GET', REF);
  });

  it('displays an inline PNG as it is, without a request', async () => {
    await expect(resolveImageSrc(PNG)).resolves.toBe(PNG);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each(WALKS_OUT)(
    'never fetches a reference that walks out of the image store: %s',
    async (src) => {
      await expect(resolveImageSrc(src)).rejects.toThrow(NOT_A_FIGURE_REF);
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );

  it.each(NOT_FIGURES)('never hands a src that is not a figure to the browser: %s', async (src) => {
    await expect(resolveImageSrc(src)).rejects.toThrow(NOT_A_FIGURE_REF);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it.each([...WALKS_OUT, ...NOT_FIGURES])('does not parse in stored or set content: %s', (src) => {
    const ed = makeEditor(`<p>Before.</p><img src="${src.replace(/"/g, '&quot;')}" alt="x"><p>After.</p>`);
    expect(imageCount(ed)).toBe(0);
    expect(ed.getHTML()).not.toContain('<img');
    ed.destroy();
  });

  it('stored content holding one fails the fidelity gate on its image count, so it opens in source mode', () => {
    const stored = '<p>Stability.</p><img src="https://collector.example/p.png" alt="Figure 1">';
    const v = assessFidelity(stored, generateJSON(stored, [StarterKit, AuthoringImage]));
    expect(v.structuralDrift).toContain('images');
    expect(v.lossy).toBe(true);
    // A figure does not.
    const ok = `<p>Stability.</p><img src="${REF}" alt="Figure 1">`;
    expect(assessFidelity(ok, generateJSON(ok, [StarterKit, AuthoringImage])).lossy).toBe(false);
  });

  it('does not take one in from pasted or inserted HTML', () => {
    const ed = makeEditor('<p>Prose.</p>');
    ed.commands.insertContent(
      '<p>From a web page.</p><img src="https://collector.example/p.png"><img src="/api/authoring/images/../../tenant-export/full">',
    );
    expect(imageCount(ed)).toBe(0);
    expect(ed.getHTML()).toContain('From a web page.');
    ed.destroy();
  });

  it('a node that arrives without a parse (JSON, live sync) is not fetched and says the figure must be uploaded', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ed = new Editor({
      element: host,
      extensions: [StarterKit, AuthoringImage],
      content: {
        type: 'doc',
        content: [{ type: 'image', attrs: { src: 'https://collector.example/p.png', alt: 'x' } }],
      },
    });
    await vi.waitFor(() => {
      expect(host.querySelector('.rse-img-status')?.textContent).toMatch(/Upload the image to include it/);
    });
    const figure = host.querySelector('figure.rse-img') as HTMLElement;
    expect(figure.dataset.error).toBe('1');
    expect(host.querySelector('img')?.getAttribute('src')).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
    ed.destroy();
    host.remove();
  });
});
