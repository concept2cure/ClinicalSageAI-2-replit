// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import { RichSectionEditor } from '../editor/RichSectionEditor';
import { authService } from '@/services/portal/authService';
import { deviceDraftKey } from '@/lib/deviceDraftCache';

const SAVED = `<h1>Saved study report</h1>
<p>Stored narrative.</p>
<table>
<thead><tr><th>Field</th><th>Stored value</th></tr></thead>
<tbody><tr><td>Purpose</td><td>UI verification only</td></tr></tbody>
</table>`;
const KEY = 'hydration-section';
const cacheKey = deviceDraftKey(7, KEY);
function canvas(): Editor {
  return (document.querySelector('.rse-body .tiptap') as HTMLElement & { editor: Editor }).editor;
}
function beforeUnloadHeld() {
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
}
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(authService, 'getUser').mockReturnValue({ id: '7', email: 'author@example.test', firstName: 'Test', lastName: 'Author',
    displayName: 'Test Author', roles: ['writer'], permissions: [], organizationId: '7', organizationName: 'Test organization',
    mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('a saved workflow table opens clean without creating a device draft', () => {
  it('keeps initial schema normalization clean in StrictMode and writes nothing', async () => {
    const save = vi.fn(); const dirty = vi.fn();
    render(<React.StrictMode><RichSectionEditor value={SAVED} onSave={save} storageKey={KEY} onDirtyChange={dirty} /></React.StrictMode>);
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')?.textContent).toContain('UI verification only'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(screen.queryByText(/A draft cached on this device/)).toBeNull();
    expect(document.querySelector('.rse-save')?.textContent).toMatch(/All changes saved/);
    expect(localStorage.getItem(cacheKey)).toBeNull();
    expect(beforeUnloadHeld()).toBe(false);
    expect(dirty).not.toHaveBeenCalledWith(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('still protects actual writing after hydration and restores it explicitly on return', async () => {
    const save = vi.fn();
    const first = render(<RichSectionEditor value={SAVED} onSave={save} storageKey={KEY} />);
    await waitFor(() => expect(document.querySelector('.rse-save')?.textContent).toMatch(/All changes saved/));
    act(() => { canvas().commands.insertContentAt(1, 'Real unsaved correction. '); });
    await waitFor(() => expect(beforeUnloadHeld()).toBe(true));
    expect(localStorage.getItem(cacheKey)).toContain('Real unsaved correction.'); first.unmount();
    render(<RichSectionEditor value={SAVED} onSave={save} storageKey={KEY} />);
    expect(await screen.findByText(/A draft cached on this device/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore the device draft' }));
    await waitFor(() => expect(document.querySelector('.rse-body .tiptap')?.textContent).toContain('Real unsaved correction.'));
    expect(beforeUnloadHeld()).toBe(true); expect(save).not.toHaveBeenCalled();
  });

  it('does not adopt a real content transaction that arrives before the create callback', async () => {
    render(<RichSectionEditor value={SAVED} onSave={vi.fn()} storageKey={KEY} />);
    act(() => { canvas().commands.insertContentAt(1, 'Early actual writing. '); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(document.querySelector('.rse-save')?.textContent).toMatch(/Unsaved changes/);
    expect(localStorage.getItem(cacheKey)).toContain('Early actual writing.');
    expect(beforeUnloadHeld()).toBe(true);
  });
});
