// @vitest-environment jsdom
/** All routes between existing protocol work keep pending edits in the shared editor. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({
  ...await original<typeof import('@/lib/queryClient')>(), apiRequest,
}));

import { ProtocolWorkspaceDoc, TABS } from '../surfaces/ProtocolDevWorkspace';
import { __resetSurfaceActionBus, applySurfaceAction } from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const STAMP = '2026-09-21T10:00:00.000Z';
const REASON = 'Recording the reviewed synopsis section status';
const REFUSAL = 'Save the pending section changes before switching work.';
const DOC = {
  id: '41', programId: PID, title: 'Dose-ranging study', shortTitle: 'BX-410-201', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: STAMP,
  completeness: 50, openSection: '101',
  sections: [
    { id: '101', num: '1', title: 'Synopsis', status: 'draft', required: true, updatedAt: STAMP },
    { id: '102', num: '2', title: 'Background', status: 'not_started', required: true, updatedAt: STAMP },
  ],
  content: { 101: [{ p: 'A randomised, double-blind study.' }], 102: [{ p: 'The recorded background.' }] },
  objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};
const ok = (value: unknown) => ({ ok: true, status: 200, json: async () => value }) as Response;
const conflict = () => ({ ok: false, status: 409, json: async () => ({ error: {
  code: 'SECTION_CHANGED', message: 'This section was changed by someone else since you opened it.',
} }) }) as Response;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onChanged = vi.fn();
  const props = { onChanged, onAsk: vi.fn(), onNav: vi.fn() };
  const view = (doc: Record<string, unknown>, reloadError?: string) => <QueryClientProvider client={client}><ProtocolWorkspaceDoc doc={doc} reloadError={reloadError} {...props} /></QueryClientProvider>;
  const rendered = render(view(DOC));
  return { onChanged, update: (doc: Record<string, unknown>, reloadError?: string) => rendered.rerender(view(doc, reloadError)) };
}
const tab = (name: string) => screen.getByRole('tab', { name });
const editor = () => screen.findByRole('textbox', { name: /Section 1 — Synopsis/ });
async function makePending() {
  const canvas = await editor();
  fireEvent.change(screen.getByLabelText(/Section status/), { target: { value: 'complete' } });
  return canvas;
}
function expectPendingCanvas(canvas: HTMLElement) {
  expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
  expect(canvas.isConnected).toBe(true);
  expect(tab('Document').getAttribute('aria-selected')).toBe('true');
  expect((screen.getByLabelText(/Section status/) as HTMLSelectElement).value).toBe('complete');
  expect(screen.getByText(REFUSAL)).toBeTruthy();
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(ok({}));
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the shared protocol editor survives requested navigation with pending changes', () => {
  it('keeps every original tab and refuses a tab switch while the section has pending changes', async () => {
    mount();
    const canvas = await makePending();
    expect(screen.getAllByRole('tab')).toHaveLength(TABS.length);
    fireEvent.click(tab('Objectives'));
    expectPendingCanvas(canvas);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('refuses the suggested study-design step without unmounting the editor', async () => {
    mount();
    const canvas = await makePending();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Study and protocol design' })).getByRole('button', { name: 'Study design' }));
    expectPendingCanvas(canvas);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('refuses a section-outline switch without moving the open section', async () => {
    mount();
    const canvas = await makePending();
    fireEvent.click(screen.getByRole('button', { name: /2\s*Background/ }));
    expectPendingCanvas(canvas);
    expect(screen.getByRole('button', { name: /1\s*Synopsis/ }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: /2\s*Background/ }).hasAttribute('aria-current')).toBe(false);
  });

  it('returns a refusal to AnA instead of reporting a section action as applied', async () => {
    mount();
    const canvas = await makePending();
    const resolved = resolveSurfaceAction('protocol-dev.open-section', { section: '2' });
    if (!resolved.ok) throw new Error('The existing protocol section action did not resolve.');
    let outcome: ReturnType<typeof applySurfaceAction> | undefined;
    act(() => { outcome = applySurfaceAction(resolved.directive, vi.fn()); });
    expect(outcome).toMatchObject({ status: 'failed', reason: REFUSAL });
    expectPendingCanvas(canvas);
  });

  it('keeps keyboard focus on the selected tab when a requested keyboard switch is refused', async () => {
    mount();
    const canvas = await makePending();
    const current = tab('Document');
    current.focus();
    fireEvent.keyDown(current, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(current);
    expectPendingCanvas(canvas);
  });

  it('allows keyboard selection and moves focus when there are no pending section changes', async () => {
    mount();
    await editor();
    const current = tab('Document');
    current.focus();
    fireEvent.keyDown(current, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tab('Objectives'));
    expect(tab('Objectives').getAttribute('aria-selected')).toBe('true');
  });
});

describe('save outcomes and nested dialogs preserve the protocol work', () => {
  it('releases the navigation guard after the save is confirmed and the current record is re-read', async () => {
    const { onChanged, update } = mount();
    const canvas = await makePending();
    apiRequest.mockResolvedValue(ok({ id: 101, status: 'complete', updatedAt: '2026-10-30T17:30:00.000Z' }));
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce());
    expect(apiRequest).toHaveBeenCalledExactlyOnceWith('PATCH', '/api/protocol-development/sections/101', expect.objectContaining({ status: 'complete', reason: REASON, expectedUpdatedAt: STAMP }));
    // A failed re-read leaves the previous recorded status on screen. Keep the
    // chosen status and the guard until the current record confirms it.
    update({ ...DOC }, 'The record could not be read.');
    fireEvent.click(tab('Objectives'));
    expectPendingCanvas(canvas);
    expect(screen.getByText(/last version that loaded rather than the current record/)).toBeTruthy();
    update({ ...DOC, sections: DOC.sections.map(section => section.id === '101' ? { ...section, status: 'complete', updatedAt: '2026-10-30T17:30:00.000Z' } : section) });
    fireEvent.click(tab('Objectives'));
    expect(tab('Objectives').getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('textbox', { name: /Section 1 — Synopsis/ })).toBeNull();
  });

  it('keeps the editor and navigation guard after a concurrent save is refused', async () => {
    const { onChanged } = mount();
    const canvas = await makePending();
    apiRequest.mockResolvedValue(conflict());
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await screen.findByText(/changed by someone else/);
    fireEvent.click(tab('Objectives'));
    expectPendingCanvas(canvas);
    expect(onChanged).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Reason for change/) as HTMLTextAreaElement).value).toBe(REASON);
  });

  it('protects an actual shared-editor content edit while its PATCH is unresolved and after refusal', async () => {
    mount();
    const canvas = await editor();
    // Use the real TipTap instance attached to its DOM node, as the editor's
    // existing proposal tests do. A bare DOM input event does not produce a
    // ProseMirror transaction in jsdom and would not exercise dirty tracking.
    const tiptap = (canvas as HTMLElement & { editor: Editor }).editor;
    expect(tiptap).toBeTruthy();
    act(() => { tiptap.view.dispatch(tiptap.state.tr.insertText('Revised dosing rationale. ', 1)); });
    await waitFor(() => expect(canvas.textContent).toContain('Revised dosing rationale.'));
    fireEvent.click(tab('Objectives'));
    expect(screen.getByText(REFUSAL)).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
    let settle: ((response: Response) => void) | undefined;
    apiRequest.mockImplementation(() => new Promise<Response>(resolve => { settle = resolve; }));
    fireEvent.change(screen.getByLabelText(/Reason for change/), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: /Save section/ }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    expect(apiRequest.mock.calls[0][2]).toEqual(expect.objectContaining({ content: expect.stringContaining('Revised dosing rationale.'), reason: REASON }));
    fireEvent.click(tab('Objectives'));
    expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
    expect(tab('Document').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(REFUSAL)).toBeTruthy();
    await act(async () => { settle?.(conflict()); });
    await screen.findByText(/changed by someone else/);
    fireEvent.click(tab('Objectives'));
    expect(screen.getByRole('textbox', { name: /Section 1 — Synopsis/ })).toBe(canvas);
    expect(canvas.textContent).toContain('Revised dosing rationale.');
    expect(tab('Document').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(REFUSAL)).toBeTruthy();
  });

  it('keeps a nested Create a study design dialog and its inputs when AnA requests a different section', async () => {
    mount();
    await editor();
    fireEvent.click(tab('Study design'));
    fireEvent.click(screen.getByRole('button', { name: 'Create a study design' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a study design' });
    const title = within(dialog).getByLabelText(/Study design title/) as HTMLInputElement;
    fireEvent.change(title, { target: { value: 'Sponsor-reviewed draft design' } });
    const resolved = resolveSurfaceAction('protocol-dev.open-section', { section: '2' });
    if (!resolved.ok) throw new Error('The existing protocol section action did not resolve.');
    let outcome: ReturnType<typeof applySurfaceAction> | undefined;
    act(() => { outcome = applySurfaceAction(resolved.directive, vi.fn()); });
    expect(outcome).toMatchObject({ status: 'failed', reason: expect.stringMatching(/dialog|finish|close/i) });
    expect(screen.getByRole('dialog', { name: 'Create a study design' })).toBe(dialog);
    expect(title.isConnected).toBe(true);
    expect(title.value).toBe('Sponsor-reviewed draft design');
    expect(tab('Study design').getAttribute('aria-selected')).toBe('true');
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
