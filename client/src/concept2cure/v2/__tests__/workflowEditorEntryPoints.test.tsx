// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { displayName: 'Author', email: 'author@example.test' } }) }));
vi.mock('../clinicalRegulatoryGraphFlag', () => ({ isClinicalRegulatoryGraphEnabled: () => false }));
vi.mock('../editor/SourceImportDialog', async original => ({ ...(await original<typeof import('../editor/SourceImportDialog')>()),
  SourceImportDialog: ({ programId, source, onOpenDocument }: { programId: string; source: unknown; onOpenDocument: (id: string, code: string) => void }) =>
    <div data-testid="selected-source">{JSON.stringify({ programId, source })}<button onClick={() => onOpenDocument('saved-working-copy', 'actual-returned-code')}>Open confirmed copy</button></div> }));
import { CsrWorkflow } from '../surfaces/BiopharmaProject';
import { ProtocolWorkspaceDoc } from '../surfaces/ProtocolDevWorkspace';
import { publishShellProject } from '../shellProject';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
const PID = '11111111-1111-4111-8111-111111111111';
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const doc = { id: '7', title: 'Stored protocol', sections: [{ id: '10', num: '1', title: 'Synopsis', status: 'draft', required: true }], content: { '10': [{ p: 'Saved protocol narrative.' }] } };
const props = { onNav: vi.fn(), onAsk: vi.fn(), surface: { id: 'csr-workflow' } as never, segment: 'biotech' };
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = () => [];
  if (typeof proto.getBoundingClientRect !== 'function') proto.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}
beforeEach(() => { apiRequest.mockReset(); props.onNav.mockClear(); props.onAsk.mockClear(); publishShellProject({ id: PID, title: 'Current program' }); });
afterEach(() => { cleanup(); delete window.C2C_PROJECT; clearEditorTarget(); });

describe('stored workflow entry points reuse the canonical intake', () => {
  it('CSR selects the actual saved job and requested E3 parent before exact returned-ID navigation', async () => {
    apiRequest.mockResolvedValue(ok({ success: true, data: { program: { title: 'Study CSR', code: 'E3', readiness: 10 },
      meta: { jobId: 14, projectId: 2, programId: PID }, sections: [{ num: '11', label: 'Efficacy', status: 'draft' }] } }));
    render(<CsrWorkflow {...props} />); fireEvent.click(await screen.findByRole('button', { name: /11 Efficacy draft/ }));
    expect(screen.getByTestId('selected-source').textContent).toContain(JSON.stringify({ programId: PID, source: { kind: 'csr', jobId: 14, sectionNumbers: ['11'] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmed copy' }));
    expect(peekEditorTarget()).toMatchObject({ docId: 'saved-working-copy', sectionCode: 'actual-returned-code', programId: PID, docType: null });
    expect(props.onAsk).not.toHaveBeenCalled();
  });
  it('protocol selects its numeric stored document and current explicit target', async () => {
    render(<ProtocolWorkspaceDoc doc={doc} onAsk={props.onAsk} onNav={props.onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open saved draft in editor' }));
    expect(screen.getByTestId('selected-source').textContent).toContain(JSON.stringify({ programId: PID, source: { kind: 'protocol', documentId: 7 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Open confirmed copy' }));
    expect(peekEditorTarget()).toMatchObject({ docId: 'saved-working-copy', sectionCode: 'actual-returned-code', programId: PID });
  });
  it('protocol dirty content blocks saved-copy navigation and preserves the source editor', async () => {
    render(<ProtocolWorkspaceDoc doc={doc} onAsk={props.onAsk} onNav={props.onNav} />);
    await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Saved protocol narrative.'));
    const editor = (document.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    act(() => { editor.commands.insertContentAt(0, 'Unfinished revision. '); });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Open saved draft in editor' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Open saved draft in editor' }));
    expect(screen.queryByTestId('selected-source')).toBeNull(); expect(document.querySelector('.tiptap')?.textContent).toContain('Unfinished revision.');
    expect(props.onNav).not.toHaveBeenCalled();
  });
});
