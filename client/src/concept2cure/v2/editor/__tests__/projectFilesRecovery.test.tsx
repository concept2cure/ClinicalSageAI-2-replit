// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectFilesPanel } from '../ProjectFilesPanel';

const programId = '11111111-1111-4111-8111-111111111111';
const hit = { id: 'source-1', title: 'Protocol source', fileName: 'protocol.docx', documentType: 'Protocol',
  size: null, folderId: null, ctdSection: null, placementStatus: 'unfiled', snippet: null };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
function panel() {
  render(<ProjectFilesPanel programId={programId} programName="IND project" fireToast={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Search the project vault'), { target: { value: 'Protocol' } });
}
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('project files recovery and availability', () => {
  it('retries a failed vault search without changing its query', async () => {
    let searches = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.includes('/search?')) return ok({ tree: [], documentCount: 0 });
      searches += 1;
      return searches === 1 ? { ok: false, status: 503, json: async () => ({ message: 'Search temporarily unavailable' }) }
        : ok({ results: [hit], total: 1 });
    });
    panel();
    await screen.findByRole('button', { name: 'Try again' });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(hit.title);
    expect(searches).toBe(2);
    expect((screen.getByLabelText('Search the project vault') as HTMLInputElement).value).toBe('Protocol');
  });

  it.each([
    { originalFileAvailable: false }, { disposition: 'remove_data' }, { current: false },
  ])('disables working-copy intake from unavailable search metadata %j', async availability => {
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(url.includes('/search?')
      ? { results: [{ ...hit, ...availability }], total: 1 } : { tree: [], documentCount: 0 }));
    panel();
    fireEvent.click(await screen.findByText(hit.title));
    const work = await screen.findByRole('button', { name: 'Work on document' }) as HTMLButtonElement;
    expect(work.disabled).toBe(true);
    expect(work.title).not.toBe('');
    fireEvent.click(work);
    await waitFor(() => expect(screen.queryByTestId('source-import-dialog')).toBeNull());
  });
});
