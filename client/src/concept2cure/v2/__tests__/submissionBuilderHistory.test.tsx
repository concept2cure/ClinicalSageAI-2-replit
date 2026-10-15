// @vitest-environment jsdom
/**
 * The Builder shows the sequence's history (filing-spine design review, open
 * item 3, 2026-10-15): who created the submission, and every placement in the
 * sequence (who, when, at which section, why), with the server's verdict on the
 * audit chain. It was recorded and never shown. A failed read says so; it is
 * never an empty history. The view is the Vault's document history, shared
 * (RecordHistory.tsx), not a second one.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { BuilderWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };
const HISTORY = {
  entries: [
    { id: 'AUD-3', event: 'Leaf Removed', section: '2.5', actor: 'Rita Reviewer', at: '2026-10-15T11:00:00.000Z', when: '2026-10-15 11:00', hash: 'c'.repeat(64), seq: 3, reason: 'Superseded by the new overview' },
    { id: 'AUD-2', event: 'Leaf Created', section: '2.5', actor: 'Sam Author', at: '2026-10-15T10:30:00.000Z', when: '2026-10-15 10:30', hash: 'b'.repeat(64), seq: 2, reason: 'Clinical overview for the original' },
    { id: 'AUD-1', event: 'Submission Created', section: null, actor: 'Sam Author', at: '2026-10-15T10:00:00.000Z', when: '2026-10-15 10:00', hash: 'a'.repeat(64), seq: 1, reason: null },
  ],
  chain: { ok: true, rowsChecked: 3, legacyRows: 0 },
  truncated: false,
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

function mockApi(history: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') return ok([]);
    if (method === 'GET' && url === '/api/submissions/sequences/21/history') return history as Response;
    return ok([]);
  });
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe("the Builder shows the sequence's history", () => {
  it('names who created the submission, and who placed and removed what, when and why', async () => {
    mockApi(ok({ success: true, data: HISTORY }));
    render(<BuilderWorkspace seq={SEQ as never} />);
    const history = await screen.findByTestId('sc-sequence-history');
    expect(await within(history).findByText(/Audit chain verified — 3 rows checked/)).toBeTruthy();
    const text = history.textContent ?? '';
    expect(text).toContain('Submission Created');
    expect(text).toMatch(/2026-10-15 10:00 · Sam Author/);
    expect(text).toContain('Section 2.5 · Leaf Created');
    expect(text).toContain('Section 2.5 · Leaf Removed');
    expect(within(history).getAllByTestId('sc-history-reason').map((n) => n.textContent)).toEqual([
      'Reason: Superseded by the new overview',
      'Reason: Clinical overview for the original',
    ]);
  });

  it('a history that could not be read says so, and shows no entries', async () => {
    mockApi({ ok: false, status: 503, json: async () => ({ error: { code: 'SUBMISSION_ACCESS_CHANGED' } }) });
    render(<BuilderWorkspace seq={SEQ as never} />);
    const history = await screen.findByTestId('sc-sequence-history');
    expect((await within(history).findByRole('alert')).textContent).toMatch(/This sequence's history could not be read/);
    expect(history.textContent).not.toMatch(/No history events/);
  });
});
