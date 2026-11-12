// @vitest-environment jsdom
import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const request = vi.hoisted(() => vi.fn());
/* The dialog now lists the study's earlier loads (rbmLoadHistory.test.tsx), a GET. This file is about the load
   itself, so `request` stays the write it has always counted and the history read is answered apart, as empty. */
vi.mock('@/lib/queryClient', async original => ({
  ...(await original<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => (args[0] === 'GET'
    ? Promise.resolve(new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : request(...args)),
}));
import { RbmIngestDialog } from '../surfaces/RbmIngest';

const PROGRAM = '11111111-2222-4333-8444-555555555555';
const CSV_A = 'metric_key,value\nQuery rate,1';
const CSV_B = 'metric_key,value\nQuery rate,2';
let readers: HeldReader[];
/** Reads are controlled independently so completion ordering is observable. */
class HeldReader {
  static LOADING = 1;
  readyState = 1;
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  readAsText(file: File) {
    readers.push(this);
    if (file.name === 'throws.csv') throw new Error('Read could not start');
  }
  abort() { this.readyState = 2; this.onabort?.(); }
  complete(text: string) { this.result = text; this.readyState = 2; this.onload?.(); }
  fail() { this.readyState = 2; this.onerror?.(); }
}
const paste = () => screen.getByLabelText(/paste the rows/) as HTMLTextAreaElement;
const load = () => screen.getByRole('button', { name: 'Load extract' });
function pick(name: string) {
  fireEvent.change(screen.getByLabelText(/^Extract file/), {
    target: { files: [new File(['synthetic metric input'], name, { type: 'text/csv' })] },
  });
  return readers.at(-1)!;
}
function mount() { return render(<RbmIngestDialog programId={PROGRAM} onClose={vi.fn()} onReload={vi.fn()} />); }
const result = {
  runId: 12, status: 'succeeded', received: 1, accepted: 1, rejected: 0, rejects: [],
  projection: { kriReadings: 1, qtlUpdates: 0, subjectProfiles: 0, siteObservations: 0, unmatched: [] },
};
beforeEach(() => {
  readers = []; vi.stubGlobal('FileReader', HeldReader); request.mockReset();
  request.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: result }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('RBM extract bytes belong to the current input choice', () => {
  it('cannot submit previous rows under the name of a file still being read', () => {
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); pick('replacement.csv');
    expect(load()).toHaveProperty('disabled', true);
    fireEvent.click(load()); expect(request).not.toHaveBeenCalled();
  });
  it('submits the newest file even if an older read completes last', async () => {
    mount(); const old = pick('old.csv'), current = pick('current.csv');
    act(() => { current.complete(CSV_B); old.complete(CSV_A); });
    fireEvent.click(load());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0]).toEqual(['POST', '/api/mdx/rbm-metric-ingest', expect.objectContaining({ csv: CSV_B, sourceRef: 'current.csv' })]);
  });
  it('keeps paste as the current source when an earlier file callback arrives', async () => {
    mount(); const old = pick('old.csv');
    fireEvent.change(paste(), { target: { value: CSV_B } }); act(() => old.complete(CSV_A));
    fireEvent.click(load()); await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][2]).toMatchObject({ csv: CSV_B, sourceRef: null });
  });
  it('ignores an older read error while the replacement file is pending', async () => {
    mount(); const old = pick('old.csv'), current = pick('current.csv');
    act(() => old.fail());
    expect(screen.queryByText(/selected file could not be read/i)).toBeNull();
    expect(screen.getByText('Reading the selected file…')).toBeTruthy();
    act(() => current.complete(CSV_B)); fireEvent.click(load());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][2]).toMatchObject({ csv: CSV_B, sourceRef: 'current.csv' });
  });
  it('clears stale rows on read failure and permits reading the same file again', async () => {
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); const failed = pick('unreadable.csv');
    act(() => failed.fail());
    expect(await screen.findByText(/selected file could not be read/i)).toBeTruthy();
    expect(paste().value).toBe(''); expect(load()).toHaveProperty('disabled', true);
    const next = pick('unreadable.csv'); act(() => next.complete(CSV_B)); fireEvent.click(load());
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(request.mock.calls[0][2]).toMatchObject({ csv: CSV_B, sourceRef: 'unreadable.csv' });
  });
  it('handles a read that cannot start without retaining the previous extract', async () => {
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); pick('throws.csv');
    expect(await screen.findByText(/selected file could not be read/i)).toBeTruthy();
    expect(load()).toHaveProperty('disabled', true); expect(request).not.toHaveBeenCalled();
  });
  it.each(['paste', 'file'])('withdraws duplicate reprocessing authorization for new %s content', async input => {
    request.mockRejectedValueOnce(new Error('This extract was already loaded as run 11.'));
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    await screen.findByText('Already loaded.');
    fireEvent.change(screen.getByLabelText(/^Reason for reprocessing/), { target: { value: 'Correct mapping' } });
    if (input === 'file') { const next = pick('current.csv'); act(() => next.complete(CSV_B)); }
    else fireEvent.change(paste(), { target: { value: CSV_B } });
    expect(screen.queryByRole('button', { name: 'Reprocess and replace that run' })).toBeNull();
    fireEvent.click(load()); await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][2]).toMatchObject({ csv: CSV_B, sourceRef: input === 'file' ? 'current.csv' : null });
    expect(request.mock.calls[1][2]).not.toHaveProperty('reprocess');
  });
  it('keeps a successfully read current file and its provenance paired', async () => {
    mount(); const current = pick('current.csv'); act(() => current.complete(CSV_B));
    fireEvent.click(load()); await screen.findByText('Run 12 — succeeded');
    expect(request.mock.calls[0][2]).toMatchObject({ programId: PROGRAM, source: 'edc', csv: CSV_B, sourceRef: 'current.csv' });
  });
  it.each([['Source feed', 'lab'], ['Data cutoff', '2026-11-06']])('withdraws stale duplicate authorization when %s changes', async (label, value) => {
    request.mockRejectedValueOnce(new Error('This extract was already loaded as run 11.'));
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    await screen.findByText('Already loaded.');
    fireEvent.change(screen.getByLabelText(/^Reason for reprocessing/), { target: { value: 'Correct mapping' } });
    fireEvent.change(screen.getByLabelText(new RegExp('^' + label)), { target: { value } });
    expect(screen.queryByRole('button', { name: 'Reprocess and replace that run' })).toBeNull();
    fireEvent.click(load()); await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][2]).not.toHaveProperty('reprocess');
    expect(request.mock.calls[1][2]).toMatchObject(label === 'Source feed' ? { source: value } : { dataCutoff: value });
  });
  it('does not enable an empty file as an extract', () => {
    mount(); const current = pick('empty.csv'); act(() => current.complete(''));
    expect(load()).toHaveProperty('disabled', true); expect(request).not.toHaveBeenCalled();
  });
});

describe('RBM saved run receipts survive their parent refresh', () => {
  it('keeps the saved outcome visible until closing before refreshing its parent board', async () => {
    const reload = vi.fn();
    function Parent() {
      const [open, setOpen] = useState(true);
      return open ? <RbmIngestDialog programId={PROGRAM} onClose={() => setOpen(false)} onReload={() => { reload(); setOpen(false); }} /> : <div>Refreshed board</div>;
    }
    render(<Parent />); fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    expect(await screen.findByText('Run 12 — succeeded')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(reload).toHaveBeenCalledTimes(1); expect(screen.getByText('Refreshed board')).toBeTruthy();
  });
  it('keeps duplicate recovery visible without refreshing an unchanged board', async () => {
    request.mockRejectedValueOnce(new Error('This extract was already loaded as run 11.'));
    const reload = vi.fn();
    function Parent() {
      const [open, setOpen] = useState(true);
      return open ? <RbmIngestDialog programId={PROGRAM} onClose={() => setOpen(false)} onReload={() => { reload(); setOpen(false); }} /> : null;
    }
    render(<Parent />); fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    await screen.findByText('Already loaded.'); expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(reload).not.toHaveBeenCalled();
  });
  it('still refreshes a saved load when another input clears its displayed outcome', async () => {
    const reload = vi.fn(); render(<RbmIngestDialog programId={PROGRAM} onClose={vi.fn()} onReload={reload} />);
    fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    await screen.findByText('Run 12 — succeeded'); expect(reload).not.toHaveBeenCalled();
    fireEvent.change(paste(), { target: { value: CSV_B } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(reload).toHaveBeenCalledTimes(1);
  });
  it('shows duplicate recovery after trying to load the saved extract again', async () => {
    request.mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ data: result }) })
      .mockRejectedValueOnce(new Error('This extract was already loaded as run 12.'));
    mount(); fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    await screen.findByText('Run 12 — succeeded');
    fireEvent.click(screen.getByRole('button', { name: 'Load again' }));
    await screen.findByText('Already loaded.'); expect(screen.queryByText('Run 12 — succeeded')).toBeNull();
  });
  it('keeps an in-flight save mounted on Escape and refreshes after its receipt is dismissed', async () => {
    let finish!: (response: Response) => void;
    request.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const close = vi.fn(), reload = vi.fn();
    render(<RbmIngestDialog programId={PROGRAM} onClose={close} onReload={reload} />);
    fireEvent.change(paste(), { target: { value: CSV_A } }); fireEvent.click(load());
    fireEvent.keyDown(document, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
    await act(async () => { finish({ ok: true, status: 201, json: async () => ({ data: result }) } as Response); });
    await screen.findByText('Run 12 — succeeded'); fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1); expect(reload).toHaveBeenCalledTimes(1);
  });
});
