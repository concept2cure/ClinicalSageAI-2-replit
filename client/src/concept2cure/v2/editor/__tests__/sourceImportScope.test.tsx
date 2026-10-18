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

const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
const PROGRAM_B = '22222222-2222-4222-8222-222222222222';
const source = { kind: 'data-room' as const, sourceId: 42 };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const saved = (programId = PROGRAM_A, id = '42', kind = 'data-room') => ok({ success: true, data: {
  doc: { id: 'working-copy-a', title: 'Source A working copy' }, sections: [],
  origin: { kind, id, programId, sha256: 'ab'.repeat(32), conversion: 'extracted-text' },
  warnings: [], reused: false,
} });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function createCopy() {
  fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Review the saved source' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
}
const upload = { id: 'upload-a', docId: 'upload-a', title: 'Source A.pdf', src: 'upload', num: '', type: 'Report',
  status: 'unfiled', pct: null, owner: '', ver: '', updated: '', preview: '' };
const vault = (tree: unknown[]) => ok({ success: true, data: { tree } });
const panelProps = { programName: 'Current program', fireToast: vi.fn(), onOpenDocument: vi.fn() };
beforeEach(() => { apiRequest.mockReset(); downloadBlob.mockClear(); panelProps.fireToast.mockClear(); panelProps.onOpenDocument.mockClear(); });
afterEach(() => cleanup());

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
