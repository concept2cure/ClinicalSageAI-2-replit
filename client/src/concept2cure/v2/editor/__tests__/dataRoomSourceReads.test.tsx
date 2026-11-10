// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* The panel also reads what the project uses (GET …/evidence, S2 step 3); it answers "nothing yet" here, so
   these cases count and answer the sources reads alone, as they always did. */
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => String(args[1]).endsWith('/evidence')
    ? Promise.resolve(new Response(JSON.stringify({ evidence: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : apiRequest(...args) }));
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

/* The founder, 2026-11-05: a feature can be not licensed, not relevant to the project, blocked by
   missing evidence, or unavailable to this user, and those are never one generic failure. The
   Data Room said "could not be read" with a retry for every refusal, as the Vault did before
   3c84ddc6ac. A refusal is now said as itself through the one read classifier, with no retry;
   only a failure to answer offers one. */
const refused = (status: number, code?: string) =>
  Object.assign(new Error('Request refused.'), { name: 'ApiRequestError', status, ...(code ? { code } : {}) });

describe('a Data Room refusal is said as itself, never as a failed read', () => {
  it.each([
    { name: 'a plan without the feature', err: refused(403, 'MODULE_NOT_LICENSED'), title: 'Not enabled for your organization' },
    { name: 'a feature not in this release', err: refused(403, 'LAUNCH_SCOPE'), title: 'Not in this release' },
    { name: 'a role that cannot read it', err: refused(403, 'FORBIDDEN'), title: 'Your role cannot do this' },
    { name: 'an unconfirmed organization', err: refused(403, 'TENANT_REQUIRED'), title: 'Your organization could not be confirmed' },
    { name: 'a project not in this organization', err: refused(404, 'PROJECT_NOT_FOUND'), title: 'Not found in your organization' },
    { name: 'an expired session', err: refused(401, 'UNAUTHORIZED'), title: 'Your session has expired' },
  ])('$name: its own words, no retry, and no "could not be read"', async ({ err, title }) => {
    apiRequest.mockRejectedValue(err);
    render(<DataRoomSourcesPanel programId={programId} />);
    await screen.findByText(title);
    expect(screen.queryByText('The data room could not be read')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('No sources in this project yet')).toBeNull();
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'a server failure', err: refused(500) },
    { name: 'a store that did not answer', err: refused(503, 'STORE_UNAVAILABLE') },
    { name: 'no response at all', err: new Error('Failed to fetch') },
  ])('$name stays a failed read that offers a retry', async ({ err }) => {
    apiRequest.mockRejectedValueOnce(err).mockResolvedValue(ok(page()));
    render(<DataRoomSourcesPanel programId={programId} />);
    await screen.findByText('The data room could not be read');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText(source.title);
  });
});

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
    // The data layer's read signature: no body, no options, and the read's own abort signal.
    expect(apiRequest).toHaveBeenLastCalledWith('GET', expect.stringContaining(`${otherProgram}/sources?limit=50&offset=0`),
      undefined, undefined, expect.any(AbortSignal));
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
