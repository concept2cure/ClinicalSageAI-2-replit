// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { DataRoomSourcesPanel } from '../DataRoomSourcesPanel';

const programId = '11111111-1111-4111-8111-111111111111';
const otherProgram = '22222222-2222-4222-8222-222222222222';
const source = { id: 9, title: 'Protocol source', checksum: null, extractionStatus: 'extracted', textAvailable: true, extractionMethod: 'text',
  isCurrent: true, dataEligible: true, originalFileAvailable: true };
const page = (projectId = programId, title = source.title) => ({ projectId, sources: [{ ...source, title }], total: 1,
  currentTotal: 1, page: { limit: 50, offset: 0 }, window: { shown: 1, truncated: false } });
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('Data Room reads preserve their exact project and search', () => {
  it('hides earlier actionable sources immediately while a different search is pending', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes('&q=') ? new Promise(() => {}) : ok(page()));
    render(<DataRoomSourcesPanel programId={programId} onAsk={vi.fn()} />);
    await screen.findByText(source.title);
    fireEvent.change(screen.getByLabelText('Search the data room catalogue'), { target: { value: 'Investigator' } });
    expect(screen.queryByText(source.title)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ask AnA to study' })).toBeNull();
    expect(screen.getByText('Loading project sources…')).toBeTruthy();
  });

  it.each([
    { ...page(), projectId: otherProgram },
    { ...page(), total: undefined },
    { ...page(), page: { limit: 50, offset: 50 } },
    { ...page(), sources: [{ ...source, dataEligible: undefined }] },
  ])('reports unconfirmed page metadata as a recoverable read failure (%j)', async data => {
    apiRequest.mockResolvedValue(ok(data));
    render(<DataRoomSourcesPanel programId={programId} />);
    await screen.findByText('The data room could not be read');
    expect(screen.queryByText(source.title)).toBeNull();
    expect(screen.queryByText('No sources in this project yet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  });

  it('resets search, page and selected import when the project changes', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(page(url.includes(otherProgram) ? otherProgram : programId,
      url.includes(otherProgram) ? 'Other project source' : source.title)));
    const view = render(<DataRoomSourcesPanel programId={programId} />);
    fireEvent.click(await screen.findByText(source.title));
    fireEvent.click(screen.getByRole('button', { name: 'Work on document' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    view.rerender(<DataRoomSourcesPanel programId={otherProgram} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByLabelText('Search the data room catalogue') as HTMLInputElement).value).toBe('');
    await screen.findByText('Other project source');
    expect(apiRequest).toHaveBeenLastCalledWith('GET', expect.stringContaining(`${otherProgram}/sources?limit=50&offset=0`));
  });

  it('ignores an old project completion after a switch', async () => {
    let finish!: (response: ReturnType<typeof ok>) => void;
    apiRequest.mockImplementation(async (_method: string, url: string) => url.includes(otherProgram)
      ? ok(page(otherProgram, 'Other project source')) : new Promise(resolve => { finish = resolve; }));
    const view = render(<DataRoomSourcesPanel programId={programId} />);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    view.rerender(<DataRoomSourcesPanel programId={otherProgram} />);
    await screen.findByText('Other project source');
    await act(async () => finish(ok(page())));
    expect(screen.queryByText(source.title)).toBeNull();
  });
});
