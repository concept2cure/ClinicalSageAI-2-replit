// @vitest-environment jsdom
/**
 * The filing picker offers only the project's own submissions (PF-11).
 *
 * The server refuses a placement into another project's submission (409
 * CROSS_PROJECT, 39dfd9b7), but the picker listed every submission of the
 * organization, so a person could choose one only to be refused. It now offers
 * the open project's submissions, plus unanchored ones the server cannot judge
 * either. It says how many it does not offer, rather than silently showing fewer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultPlaceIntoSubmission } from '../surfaces/VaultPlaceIntoSubmission';

const OPEN = '11111111-1111-4111-8111-111111111111';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const sub = (id: number, title: string, programId: string | null) => ({
  id, title, applicationType: 'ind', primaryRegion: 'us', status: 'draft', programId,
});

/* The server's contract for the list: with ?programId it returns only that
   program's submissions (an unanchored one is not among them) and says how many
   it did not return; without it, the bare organization list, as before. */
function serve(rows: Array<{ programId: string | null }>) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const u = new URL(url, 'http://localhost');
    if (u.pathname !== '/api/submissions') return ok([]);
    const program = u.searchParams.get('programId');
    if (!program) return ok(rows);
    const own = rows.filter((row) => row.programId?.toLowerCase() === program.toLowerCase());
    return ok({ data: own, meta: { notOffered: rows.length - own.length } });
  });
}
const open = (projectId?: string) =>
  render(<VaultPlaceIntoSubmission projectId={projectId} documentUuid="22222222-2222-4222-8222-222222222222" documentTitle="CSR" onClose={vi.fn()} />);

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: OPEN, title: 'BX-301' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

const offered = () => Array.from(document.querySelectorAll('select option')).map((o) => o.textContent ?? '');

describe('the filing picker and the project', () => {
  it('uses the document project even when a different shell project is open', async () => {
    serve([sub(1, 'Shell IND', OPEN), sub(2, 'Document IND', OTHER)]);
    open(OTHER);
    await waitFor(() => expect(offered().some((t) => t.startsWith('Document IND'))).toBe(true));
    expect(offered().some((t) => t.startsWith('Shell IND'))).toBe(false);
  });

  it("offers only the open project's submissions, and says how many it does not offer, unanchored ones included", async () => {
    serve([sub(1, 'Our IND', OPEN.toUpperCase()), sub(2, 'Their IND', OTHER), sub(3, 'Legacy IND', null)]);
    open();
    await waitFor(() => expect(offered().some((t) => t.startsWith('Our IND'))).toBe(true));
    expect(offered().some((t) => t.startsWith('Legacy IND'))).toBe(false);
    expect(offered().some((t) => t.startsWith('Their IND'))).toBe(false);
    expect(screen.getByTestId('vpf-hidden-other-projects').textContent).toBe('2 submissions belong to other projects or to no project and are not offered: a document is placed only into its own project’s submissions.');
  });

  it("asks the server for the open project's submissions, so the list is scoped where it is read", async () => {
    serve([sub(1, 'Our IND', OPEN)]);
    open();
    await waitFor(() => expect(offered().some((t) => t.startsWith('Our IND'))).toBe(true));
    const urls = apiRequest.mock.calls.map((call) => call[1] as string);
    expect(urls).toContain(`/api/submissions?programId=${OPEN}`);
  });

  it('does not offer an unanchored submission even when the server returns one, because the picker checks the same rule', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url.startsWith('/api/submissions?') ? ok([sub(3, 'Legacy IND', null), sub(1, 'Our IND', OPEN)]) : ok([]));
    open();
    await waitFor(() => expect(offered().some((t) => t.startsWith('Our IND'))).toBe(true));
    expect(offered().some((t) => t.startsWith('Legacy IND'))).toBe(false);
  });

  it("when every submission is another project's, the empty state says so — not 'none in this organization'", async () => {
    serve([sub(2, 'Their IND', OTHER)]);
    open();
    expect(await screen.findByText(/^No submissions of this project yet\. 1 submission belongs to another project or to no project and is not offered — create one/)).toBeTruthy();
  });

  it('with no project open, every submission is offered, as before', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    serve([sub(1, 'Our IND', OPEN), sub(2, 'Their IND', OTHER)]);
    open();
    await waitFor(() => expect(offered().filter((t) => t.includes('IND'))).toHaveLength(2));
  });
});
