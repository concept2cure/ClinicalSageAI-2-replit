// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { RichSectionEditor } from '../editor/RichSectionEditor';

const REF = '/api/authoring/images/file_933_abcdef';
const SAVED = `<p>Saved narrative.</p><img src="${REF}" alt="Stored figure">`;
const createElement = vi.spyOn(window.Document.prototype, 'createElement');
function liveApiImages() {
  return createElement.mock.results.filter((result, index) => result.type === 'return'
    && createElement.mock.contexts[index] === document && result.value?.tagName === 'IMG'
    && result.value.getAttribute('src') === REF).map(result => result.value.getAttribute('src'));
}
function canvas(): Editor {
  return (document.querySelector('.rse-body .tiptap') as HTMLElement & { editor: Editor }).editor;
}
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => {
  createElement.mockClear(); apiRequest.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:authorized-figure', revokeObjectURL: () => {} }));
  apiRequest.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['figure'], { type: 'image/png' }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { createElement.mockRestore(); });

describe('figure hydration and saves cannot start native API image requests', () => {
  it('loads the figure through the authenticated node view without creating a live API img during hydration', async () => {
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    expect(apiRequest).toHaveBeenCalledWith('GET', REF);
    expect(liveApiImages()).toEqual([]);
  });

  it('serializes real edits without a native fetch and retains the original figure reference in saved HTML', async () => {
    const save = vi.fn(async (_serialized: string) => {}); const editorRef = React.createRef<React.ComponentRef<typeof RichSectionEditor>>();
    render(<RichSectionEditor ref={editorRef} value={SAVED} onSave={save} />);
    await waitFor(() => expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    createElement.mockClear();
    act(() => { canvas().commands.insertContentAt(1, 'A deliberate edit. '); });
    await act(async () => { await editorRef.current?.save(); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toContain(`src="${REF}"`);
    expect(save.mock.calls[0][0]).toContain('alt="Stored figure"');
    expect(save.mock.calls[0][0]).toContain('A deliberate edit.');
    expect(liveApiImages()).toEqual([]);
  });

  it('keeps the authenticated figure view when React teardown clears direct nodeViews', async () => {
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    createElement.mockClear();
    act(() => { canvas().view.setProps({ nodeViews: {} }); });
    expect(liveApiImages()).toEqual([]);
    await waitFor(() => expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    expect(apiRequest.mock.calls.every(([method, url]) => method === 'GET' && url === REF)).toBe(true);
  });

  it('preserves current permission refusals when direct nodeViews are cleared', async () => {
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} />);
    await waitFor(() => expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBe('blob:authorized-figure'));
    apiRequest.mockRejectedValue(new Error('Permission denied.'));
    createElement.mockClear();
    act(() => { canvas().view.setProps({ nodeViews: {} }); });
    expect(liveApiImages()).toEqual([]);
    await waitFor(() => expect(document.querySelector('.rse-img-status')?.textContent).toContain('may not have access'));
    expect(document.querySelector('.rse-img img')?.getAttribute('src')).toBeNull();
  });
});
