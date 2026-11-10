// @vitest-environment jsdom
/**
 * Editing a logged batch record (P-122 inventory, finding A11).
 *
 * `PUT /api/cmc/batch-records/:id` has existed — audited since 2026-11-09, with
 * a reason for change and a refusal for a signed disposition — and no screen
 * called it. The Batch records tab could log a batch and release one, and a
 * typo in a batch number, a corrected yield or a deviation that was closed
 * could not be recorded anywhere but the database. The reach sweep did not
 * notice, because the tab's LIST call (GET /batch-records/:projectId) has the
 * same literals as the edit (cmcWorkAreaReach.test.ts, "does not count a list
 * call as the caller of an edit").
 *
 * What must be true:
 *   • a pending batch has an Edit action that PUTs the edited fields and a
 *     reason for change to that batch's own id;
 *   • the server's row is what the table then shows;
 *   • a batch with a signed disposition is not offered an edit, and says why;
 *   • a refused edit changes nothing on screen and says what was refused.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuth: () => ({ user: { id: '7', email: 'a@b.test', displayName: 'A' } }),
}));

import type { SurfaceViewProps } from '../surfaceViews';
import { CmcModule } from '../surfaces/CmcModule';

const PROJECT = 'a3b1c2d4-e5f6-4a1b-8c2d-0123456789ab';
const LIST = '/api/cmc/batch-records/' + PROJECT;
const PENDING = { id: 12, batch_number: 'C2C201-DP-2601', product_name: 'C2C-201 tablets', status: 'in-progress', yield_data: { percent: 92 }, deviations: { open: 1 } };
const RELEASED = { id: 13, batch_number: 'C2C201-DP-2503', product_name: 'C2C-201 tablets', status: 'released', yield_data: { percent: 94 }, deviations: { open: 0 } };

function res(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const calls = () => apiRequest.mock.calls as Array<[string, string, Record<string, unknown>?]>;

function wire(put: (body: Record<string, unknown>) => Response) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method === 'GET' && url === LIST) return res({ success: true, data: [PENDING, RELEASED] });
    if (method === 'PUT' && url === '/api/cmc/batch-records/12') return put(body ?? {});
    return res({ success: true, data: [] });
  });
}

async function openBatches() {
  render(
    <CmcModule
      surface={{ id: 'cmc', label: 'CMC' } as unknown as SurfaceViewProps['surface']}
      onAsk={vi.fn()}
      onNav={vi.fn()}
      segment="biotech"
    />,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Batch records' }));
  await screen.findByText('C2C201-DP-2601');
}
const rowOf = (batch: string) => screen.getByText(batch).closest('tr') as HTMLElement;
const type = (label: string, value: string) =>
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText((c) => c.startsWith(label)), { target: { value } });

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROJECT };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('a logged batch can be edited, with a reason', () => {
  it('PUTs the edited fields and the reason to the batch’s own id, and shows the server’s row', async () => {
    wire((body) => res({ success: true, data: { ...PENDING, yield_data: body.yieldData, deviations: body.deviations } }));
    await openBatches();
    fireEvent.click(within(rowOf('C2C201-DP-2601')).getByRole('button', { name: /Edit/ }));
    type('Yield', '93');
    type('Open deviations', '0');
    type('Reason for change', 'Deviation DV-2026-031 closed; yield recalculated from the executed record.');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Save batch/ }));

    await waitFor(() => expect(calls().some((c) => c[0] === 'PUT')).toBe(true));
    const [, url, body] = calls().find((c) => c[0] === 'PUT')!;
    expect(url).toBe('/api/cmc/batch-records/12');
    expect(body).toMatchObject({
      batchNumber: 'C2C201-DP-2601',
      productName: 'C2C-201 tablets',
      yieldData: { percent: 93 },
      deviations: { open: 0 },
      reason: 'Deviation DV-2026-031 closed; yield recalculated from the executed record.',
    });
    await waitFor(() => expect(within(rowOf('C2C201-DP-2601')).getByText('93%')).toBeTruthy());
  });

  it('offers no edit on a batch with a signed disposition, and says why', async () => {
    wire(() => res({}, 500));
    await openBatches();
    const edit = within(rowOf('C2C201-DP-2503')).getByRole('button', { name: /Edit/ }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.title).toMatch(/signed disposition/i);
  });

  it('changes nothing on screen when the edit is refused, and says what was refused', async () => {
    wire(() => res({ success: false, error: 'This batch carries a signed disposition and is closed to ordinary edits.', code: 'SIGNED_RECORD' }, 409));
    await openBatches();
    fireEvent.click(within(rowOf('C2C201-DP-2601')).getByRole('button', { name: /Edit/ }));
    type('Yield', '50');
    type('Reason for change', 'Typo in the executed record transcription.');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Save batch/ }));
    await waitFor(() => expect(screen.getByText(/closed to ordinary edits/)).toBeTruthy());
    expect(within(rowOf('C2C201-DP-2601')).getByText('92%')).toBeTruthy();
  });
});
