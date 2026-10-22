// @vitest-environment jsdom
/** The Quality host loads and saves through the real canonical TipTap workbench. */
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: request }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: 10, displayName: 'Quality author', email: 'quality@example.test' } }) }));
vi.mock('../../v2/surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../v2/surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../v2/surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../v2/surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
import { ControlledDocumentWorkbench } from '../ControlledDocumentWorkbench';
const PROGRAM = '40000000-0000-4000-8000-000000000001';
const DOC = '40000000-0000-4000-8000-000000000002';
const SECTION = '40000000-0000-4000-8000-000000000003';
const AT = '2026-10-14T00:00:00Z';
const doc = { id: DOC, title: 'Document control', module: null, product_code: null, status: 'DRAFT', updated_at: AT, section_count: 1, c2c_document_id: null };
let content: string;
let editable: boolean;
let revision: number;
const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as Response;
const section = () => ({ id: SECTION, doc_id: DOC, code: '1', title: 'Purpose', content, order_index: 0,
  comment_count: 0, revision_count: revision, citation_count: 0, updated_at: AT });
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Record<string, unknown>[]) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => {
  content = ''; editable = true; revision = 0; localStorage.clear();
  request.mockReset().mockImplementation(async (method: string, url: string, body?: { content?: string }) => {
    if (url === '/api/mdx/qms/documents/4/editor') return ok({ data: { document: doc, programId: PROGRAM, qmsDocument: { id: 4, status: editable ? 'draft' : 'in_review' } } });
    if (url === `/api/authoring/docs/${DOC}`) return ok({ document: doc, access: { edit: { allowed: editable,
      reason: editable ? null : 'This controlled document is under review. Open a controlled revision in the Quality register before changing it.' } } });
    if (url === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section()] });
    if (method === 'PATCH' && url === `/api/authoring/sections/${SECTION}`) {
      content = body?.content ?? ''; revision += 1;
      return ok({ success: true, revision_created: true, section: section() });
    }
    if (url === `/api/c2c/projects/${PROGRAM}`) return ok({ id: PROGRAM, name: 'Sponsor program', phase: 'planning' });
    if (url.startsWith('/api/c2c/documents')) return ok({ documents: [] });
    return ok({ success: true, sources: [], revisions: [], comments: [] });
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
function canvas() { return document.querySelector<HTMLElement>('.rse-body .tiptap'); }
function editor() {
  const element = canvas() as (HTMLElement & { editor?: Editor }) | null;
  if (!element?.editor) throw new Error('Canonical editor is not mounted');
  return element.editor;
}
const props = () => ({ documentId: 4, onBack: vi.fn(), onNavigate: vi.fn(), onAsk: vi.fn() });

describe('Quality → actual Authoring workbench', () => {
  it('authors an empty template section, saves it through the canonical revision path and reloads its saved text', async () => {
    const mounted = render(<ControlledDocumentWorkbench {...props()} />);
    await waitFor(() => expect(canvas()?.getAttribute('role')).toBe('textbox'));
    act(() => { editor().commands.insertContent('This procedure controls the organization’s documents.'); });
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Author the controlled procedure purpose.' } });
    await waitFor(() => expect((screen.getByTestId('save-section') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('save-section'));
    await waitFor(() => expect(request).toHaveBeenCalledWith('PATCH', `/api/authoring/sections/${SECTION}`, expect.objectContaining({
      content: expect.stringContaining('controls the organization'), changeReason: 'Author the controlled procedure purpose.',
    })));
    expect(await screen.findByText(/revision 1 recorded/)).toBeTruthy();
    mounted.unmount(); render(<ControlledDocumentWorkbench {...props()} />);
    await waitFor(() => expect(canvas()?.textContent).toContain('controls the organization'));
    expect(request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1);
  });
  it('honors the canonical current-version read-only decision before offering edits', async () => {
    content = '<p>Saved procedure purpose.</p>'; editable = false;
    render(<ControlledDocumentWorkbench {...props()} />);
    await waitFor(() => expect(screen.getByTestId('save-section').textContent).toContain('Read only'));
    expect((screen.getByTestId('save-section') as HTMLButtonElement).disabled).toBe(true);
    expect(canvas()?.getAttribute('contenteditable')).toBe('false');
    expect(editor().isEditable).toBe(false);
    expect(request.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
  it('uses the canonical unsaved-work decision before returning to the register', async () => {
    const host = props(); render(<ControlledDocumentWorkbench {...host} />);
    await waitFor(() => expect(canvas()).not.toBeNull());
    act(() => { editor().commands.insertContent('Unsaved Quality text.'); });
    fireEvent.click(screen.getByTestId('workbench-back'));
    await screen.findByRole('alertdialog', { name: 'Unsaved changes in 1' });
    expect(host.onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(canvas()?.textContent).toContain('Unsaved Quality text.');
    fireEvent.click(screen.getByTestId('workbench-back'));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    expect(host.onBack).toHaveBeenCalledOnce();
    expect(request.mock.calls.some(([method]) => method === 'PATCH')).toBe(false);
  });
});
