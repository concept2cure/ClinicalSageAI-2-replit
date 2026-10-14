// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GOVERNED_REASON_MAX, GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { SourceImportDialog } from '../SourceImportDialog';
import { DataRoomSourcesPanel } from '../DataRoomSourcesPanel';

const programId = '11111111-1111-4111-8111-111111111111';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const source = { id: 9, title: 'Protocol source', extractionStatus: 'extracted', textAvailable: true, extractionMethod: 'text', dataEligible: true };
const sourcePage = (sources: Array<typeof source & { originalFileAvailable?: boolean }>) => ({
  projectId: programId, sources: sources.map(row => ({ isCurrent: true, originalFileAvailable: true, ...row })),
  total: sources.length, currentTotal: sources.length, page: { limit: 50, offset: 0 }, window: { shown: sources.length, truncated: false },
});
beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('governed source intake rules', () => {
  it('explains the reason rule and refuses a short or overlong reason before sending', () => {
    render(<SourceImportDialog programId={programId} source={{ kind: 'data-room', sourceId: source.id }} title={source.title} onClose={() => {}} />);
    const field = screen.getByLabelText('Reason for creating a working copy') as HTMLTextAreaElement;
    const submit = screen.getByRole('button', { name: 'Create working copy' }) as HTMLButtonElement;
    expect(field.getAttribute('aria-required')).toBe('true');
    expect(document.getElementById(field.getAttribute('aria-describedby')!)?.textContent).toContain(`Use ${GOVERNED_REASON_MIN}–${GOVERNED_REASON_MAX} characters`);
    fireEvent.change(field, { target: { value: ' x '.repeat(2) } });
    fireEvent.click(submit);
    expect(submit.disabled).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: 'x'.repeat(GOVERNED_REASON_MAX + 1) } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(field, { target: { value: 'x'.repeat(GOVERNED_REASON_MIN) } });
    expect(submit.disabled).toBe(false);
  });
});

describe('source catalogue disclosures and availability', () => {
  it('shows exclusion before expansion and explains the disabled work and AnA actions', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    apiRequest.mockResolvedValue(ok(sourcePage([{ ...source, dataEligible: false }])));
    render(<DataRoomSourcesPanel programId={programId} onAsk={onAsk} />);
    const title = await screen.findByText(source.title);
    const disclosure = title.closest('details') as HTMLElement;
    expect(screen.getByText('Excluded from active data use').closest('summary')).toBeTruthy();
    expect(disclosure.hasAttribute('open')).toBe(false);
    await user.click(title);
    expect(disclosure.hasAttribute('open')).toBe(true);
    const work = screen.getByRole('button', { name: 'Work on document' }) as HTMLButtonElement;
    const ask = screen.getByRole('button', { name: 'Ask AnA to study' }) as HTMLButtonElement;
    expect(work.disabled).toBe(true);
    expect(ask.disabled).toBe(true);
    expect(work.title).toBe('This source is excluded from active data use.');
    expect(document.getElementById(work.getAttribute('aria-describedby')!)?.textContent).toContain('Excluded from active data use');
    await user.click(work);
    await user.click(ask);
    expect(onAsk).not.toHaveBeenCalled();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('keeps retained readable text available to AnA when the original file is unavailable', async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    apiRequest.mockResolvedValue(ok(sourcePage([{ ...source, originalFileAvailable: false }])));
    render(<DataRoomSourcesPanel programId={programId} onAsk={onAsk} />);
    await user.click(await screen.findByText(source.title));
    const work = screen.getByRole('button', { name: 'Work on document' }) as HTMLButtonElement;
    expect(work.disabled).toBe(true);
    expect(work.title).toContain('original file is unavailable');
    await user.click(screen.getByRole('button', { name: 'Ask AnA to study' }));
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining(`source id ${source.id}`));
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('recovers from no search matches by clearing the search rather than hiding project sources', async () => {
    apiRequest.mockImplementation(async (_method: string, url: string) => ok(sourcePage(url.includes('&q=') ? [] : [source])));
    render(<DataRoomSourcesPanel programId={programId} />);
    await screen.findByText(source.title);
    const search = screen.getByLabelText('Search the data room catalogue') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'Missing source' } });
    await screen.findByText('No sources match');
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await screen.findByText(source.title);
    expect(search.value).toBe('');
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('GET', expect.not.stringContaining('&q=')));
  });
});
