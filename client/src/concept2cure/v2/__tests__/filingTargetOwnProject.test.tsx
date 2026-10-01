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

function serve(rows: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, url: string) => (url === '/api/submissions' ? ok(rows) : ok([])));
}
const open = () =>
  render(<VaultPlaceIntoSubmission documentUuid="22222222-2222-4222-8222-222222222222" documentTitle="CSR" onClose={vi.fn()} />);

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
  it("offers the open project's submissions and unanchored ones, and says how many it does not offer", async () => {
    serve([sub(1, 'Our IND', OPEN.toUpperCase()), sub(2, 'Their IND', OTHER), sub(3, 'Legacy IND', null)]);
    open();
    await waitFor(() => expect(offered().some((t) => t.startsWith('Our IND'))).toBe(true));
    expect(offered().some((t) => t.startsWith('Legacy IND'))).toBe(true);
    expect(offered().some((t) => t.startsWith('Their IND'))).toBe(false);
    expect(screen.getByTestId('vpf-hidden-other-projects').textContent).toBe('1 submission belongs to another project and is not offered: a document is placed only into its own project’s submissions.');
  });

  it("when every submission is another project's, the empty state says so — not 'none in this organization'", async () => {
    serve([sub(2, 'Their IND', OTHER)]);
    open();
    expect(await screen.findByText(/^No submissions of this project yet\. 1 submission belongs to another project and is not offered — create one/)).toBeTruthy();
  });

  it('with no project open, every submission is offered, as before', async () => {
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    serve([sub(1, 'Our IND', OPEN), sub(2, 'Their IND', OTHER)]);
    open();
    await waitFor(() => expect(offered().filter((t) => t.includes('IND'))).toHaveLength(2));
  });
});
