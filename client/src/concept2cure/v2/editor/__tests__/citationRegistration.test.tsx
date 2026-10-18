// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { RichSectionEditor, type RichSectionEditorHandle } from '../RichSectionEditor';

const sources = [{ id: '41', title: 'Current protocol' }, { id: '42', title: 'Superseded report' }];
const base = { onSave: vi.fn(async () => undefined), value: '<p>Study evidence.</p>', ariaLabel: 'Section content' };
afterEach(cleanup);
function choose() {
  fireEvent.click(screen.getByRole('button', { name: /^Cite a source/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Insert$/ }));
}
const marker = () => document.querySelector('.tiptap [data-cite]');
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

describe('citation registration precedes the in-text marker', () => {
  it('inserts no marker when the authoritative source registration is refused', async () => {
    const onCite = vi.fn(async () => false);
    const api = { sources, precedingSourceIds: [], onCite };
    render(<RichSectionEditor {...base} citationsApi={api} />);
    choose();
    await waitFor(() => expect(onCite).toHaveBeenCalledWith('41'));
    expect(marker()).toBeNull();
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('holds insertion until confirmation and keeps the exact selected position', async () => {
    let finish!: (ok: boolean) => void;
    const onCite = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
    render(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], onCite }} />);
    const node = document.querySelector('.tiptap') as unknown as { editor: Editor };
    act(() => { node.editor.commands.setTextSelection(7); });
    choose();
    expect(marker()).toBeNull();
    await act(async () => { finish(true); });
    expect(marker()?.getAttribute('data-cite')).toBe('41');
    expect(node.editor.getHTML()).toMatch(/<p>Study <a[^>]*data-cite="41"[^>]*>Current protocol<\/a>evidence\.<\/p>/);
  });

  it('does not insert when the picker was cancelled during registration', async () => {
    let finish!: (ok: boolean) => void;
    const onCite = () => new Promise<boolean>(resolve => { finish = resolve; });
    render(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], onCite }} />);
    choose();
    fireEvent.click(screen.getByRole('button', { name: 'Close the citation picker' }));
    await act(async () => { finish(true); });
    expect(marker()).toBeNull();
  });

  it('does not insert into content that changed while registration was pending', async () => {
    let finish!: (ok: boolean) => void;
    const onCite = () => new Promise<boolean>(resolve => { finish = resolve; });
    render(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], onCite }} />);
    choose();
    const node = document.querySelector('.tiptap') as unknown as { editor: Editor };
    act(() => { node.editor.commands.insertContent('A newer edit. '); });
    await act(async () => { finish(true); });
    expect(marker()).toBeNull();
    expect(node.editor.getText()).toContain('A newer edit.');
  });

  it('applies the same confirmation gate to insertion through the mounted editor handle', async () => {
    const ref = React.createRef<RichSectionEditorHandle>();
    const onCite = vi.fn(async () => false);
    const api = { sources, precedingSourceIds: [], onCite };
    render(<RichSectionEditor {...base} ref={ref} citationsApi={api} />);
    let result: unknown;
    await act(async () => { result = await ref.current?.insertCitation('41'); });
    expect(result).toBe(false);
    expect(marker()).toBeNull();
  });

  it('refuses a changed selection even when the document text did not change', async () => {
    let finish!: (ok: boolean) => void;
    render(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], onCite: () => new Promise<boolean>(resolve => { finish = resolve; }) }} />);
    choose();
    const node = document.querySelector('.tiptap') as unknown as { editor: Editor };
    act(() => { node.editor.commands.setTextSelection(8); });
    await act(async () => { finish(true); });
    expect(marker()).toBeNull();
  });

  it('refuses an old section confirmation after the host scope changes', async () => {
    let finish!: (ok: boolean) => void;
    const onCite = () => new Promise<boolean>(resolve => { finish = resolve; });
    const view = render(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], scopeKey: 'section-a', onCite }} />);
    choose();
    view.rerender(<RichSectionEditor {...base} citationsApi={{ sources, precedingSourceIds: [], scopeKey: 'section-b', onCite }} />);
    await act(async () => { finish(true); });
    expect(marker()).toBeNull();
  });
});

describe('citation choices and incomplete resolution', () => {
  it('offers only eligible insertion choices while keeping historical names available for existing markers', () => {
    const api = { sources, choices: [sources[0]], precedingSourceIds: [] };
    render(<RichSectionEditor {...base} citationsApi={api} />);
    fireEvent.click(screen.getByRole('button', { name: /^Cite a source/ }));
    expect([...screen.getByRole('combobox', { name: 'Source to cite' }).querySelectorAll('option')].map(option => option.value)).toEqual(['41']);
  });

  it('does not print a plausible number while the source catalogue is incomplete', () => {
    const api = { sources, precedingSourceIds: [], resolutionState: 'loading' as const };
    render(<RichSectionEditor {...base} value='<p>Evidence<a data-cite="41">Current protocol</a>.</p>' citationsApi={api} />);
    expect(marker()?.textContent).not.toMatch(/\[\d+/);
    expect(marker()?.textContent).toMatch(/read|check/i);
  });
});
