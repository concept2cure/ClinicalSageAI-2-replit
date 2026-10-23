// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('../../download', async original => ({ ...(await original<typeof import('../../download')>()), downloadBlob }));
import { SourceImportDialog } from '../SourceImportDialog';
import { ProjectFilesPanel } from '../ProjectFilesPanel';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';
import { clearShellProject, publishShellProject } from '../../shellProject';

const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';
const source = { kind: 'data-room' as const, sourceId: 42 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const DOC = '33333333-3333-4333-8333-333333333333';
const saved = (programId = PROGRAM_A, id = '42', kind = 'data-room') => {
  const origin = { kind, id, programId, title: 'Source A working copy', fileName: 'Source A.pdf', mimeType: 'application/pdf',
    documentType: 'Report', sectionCode: null, sha256: 'ab'.repeat(32), conversion: 'extracted-text' };
  return ok({ success: true, data: { doc: { id: DOC, title: 'Source A working copy', tenant_id: 12, client_program_id: programId,
    created_by: 7, status: 'DRAFT', provenance: { source: 'import', importSource: { ...origin, reason: 'Review the saved source', warnings: [] } } },
    sections: [{ id: '44444444-4444-4444-8444-444444444444', doc_id: DOC, tenant_id: 12, code: 'source.1', title: 'Source A', content: 'Recorded text', order_index: 0 }],
    origin, warnings: [], reused: false } });
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function createCopy() {
  fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review the saved source' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
}
const upload = { id: '55555555-5555-4555-8555-555555555555', docId: '55555555-5555-4555-8555-555555555555', title: 'Source A.pdf', src: 'upload', num: '', type: 'Report',
  status: 'unfiled', pct: null, owner: '', ver: '', updated: '', preview: '' };
const vault = (tree: unknown[]) => ok({ success: true, data: { tree } });
const panelProps = { programName: 'Current program', fireToast: vi.fn(), onOpenDocument: vi.fn() };
beforeEach(() => {
  authService.endSession(null); clearAuthToken(); localStorage.clear(); sessionStorage.clear();
  authService.setToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 12 }))}.synthetic`,
    { id: '7', organizationId: '12', roles: ['admin'], permissions: ['governed:write'] }, 'fixture-refresh', 3600);
  publishShellProject({ id: PROGRAM_A }); apiRequest.mockReset(); downloadBlob.mockClear(); panelProps.fireToast.mockClear(); panelProps.onOpenDocument.mockClear();
});
afterEach(() => { cleanup(); authService.endSession(null); clearAuthToken(); clearShellProject(); localStorage.clear(); sessionStorage.clear(); });

describe('source working copies stay in their selected scope', () => {
  it('discards a completed result and reason when the selected source changes', async () => {
    apiRequest.mockResolvedValue(saved());
    const onOpenDocument = vi.fn();
    const view = render(<SourceImportDialog programId={PROGRAM_A} source={source} title="Source A" onClose={() => {}} onOpenDocument={onOpenDocument} />);
    createCopy();
    await screen.findByRole('button', { name: 'Open working copy' });
    view.rerender(<SourceImportDialog programId={PROGRAM_A} source={{ kind: 'data-room', sourceId: 43 }} title="Source B" onClose={() => {}} onOpenDocument={onOpenDocument} />);
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect((screen.getByLabelText('Reason for creating a working copy') as HTMLTextAreaElement).value).toBe('');
    expect(onOpenDocument).not.toHaveBeenCalled();
  });

  it('ignores a late import result after a program change and allows a new request', async () => {
    const old = deferred<ReturnType<typeof ok>>();
    apiRequest.mockReturnValueOnce(old.promise).mockResolvedValueOnce(saved(PROGRAM_B));
    const view = render(<SourceImportDialog programId={PROGRAM_A} source={source} title="Source" onClose={() => {}} />);
    createCopy();
    act(() => publishShellProject({ id: PROGRAM_B }));
    view.rerender(<SourceImportDialog programId={PROGRAM_B} source={source} title="Source" onClose={() => {}} />);
    await act(async () => { old.resolve(saved()); await old.promise; });
    expect(screen.queryByTestId('source-import-result')).toBeNull();
    createCopy();
    await screen.findByTestId('source-import-result');
    expect(apiRequest.mock.calls[1][2]).toMatchObject({ programId: PROGRAM_B });
  });

  it('clears a source intake and selection when the files rail changes program', async () => {
    const old = deferred<ReturnType<typeof ok>>();
    apiRequest.mockImplementation((method: string, url: string) => method === 'POST' ? old.promise : Promise.resolve(vault(url.endsWith(PROGRAM_A) ? [upload] : [])));
    const view = render(<ProjectFilesPanel programId={PROGRAM_A} {...panelProps} />);
    fireEvent.click(await screen.findByText(upload.title));
    fireEvent.click(screen.getByRole('button', { name: 'Work on document' }));
    createCopy();
    act(() => publishShellProject({ id: PROGRAM_B }));
    view.rerender(<ProjectFilesPanel programId={PROGRAM_B} {...panelProps} />);
    expect(screen.queryByTestId('source-import-dialog')).toBeNull();
    expect(screen.queryByText(upload.title)).toBeNull();
    await act(async () => { old.resolve(saved(PROGRAM_A, upload.docId, 'vault')); await old.promise; });
    expect(screen.queryByRole('button', { name: 'Open working copy' })).toBeNull();
    expect(panelProps.onOpenDocument).not.toHaveBeenCalled();
  });

  it('does not download or announce a file that finishes after the files rail changes program', async () => {
    const old = deferred<unknown>();
    apiRequest.mockImplementation((_method: string, url: string) => url.endsWith('/download') ? old.promise : Promise.resolve(vault(url.endsWith(PROGRAM_A) ? [upload] : [])));
    const view = render(<ProjectFilesPanel programId={PROGRAM_A} {...panelProps} />);
    fireEvent.click(await screen.findByText(upload.title));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    act(() => publishShellProject({ id: PROGRAM_B }));
    view.rerender(<ProjectFilesPanel programId={PROGRAM_B} {...panelProps} />);
    await act(async () => {
      old.resolve({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'text/plain' }), arrayBuffer: async () => new TextEncoder().encode('Source A text').buffer });
      await old.promise;
    });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(panelProps.fireToast).not.toHaveBeenCalled();
    expect(document.querySelector('iframe')).toBeNull();
  });
});
