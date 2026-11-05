// @vitest-environment jsdom
/**
 * Deviations: CAPA actions, their status, and the signed close (R1).
 *
 * POST /api/protocol-deviations/deviations/:id/capa, PATCH /capa/:id/status and
 * POST /deviations/:id/close were governed and served, and nothing called them:
 * a deviation could be reported and assessed but never corrected or closed.
 * Closing is an electronic signature behind the server's CAPA-closure gate; the
 * card shows that gate's own reasons (`closeBlockers`) and waits while it would
 * refuse. Each CAPA action is addressed by its own id (it used to carry the
 * deviation's: pdev-view-assembler.pglite.integration.test.ts).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DeviationsTab } from '../surfaces/ProtocolDevPanes';
import { submitPdevForm } from '../surfaces/ProtocolDevForms';
import { closeProtocolDeviation } from '../surfaces/ProtocolDevWrites';

const REASON = 'Corrective action agreed at the site visit';
const DEV = (over: Record<string, unknown>) => ({
  id: '3', title: 'Missed visit window', sev: 'major', cat: 'procedure', assessed: true, reportable: false,
  status: 'capa_pending', capa: [{ id: '21', action: 'Retrain site staff', status: 'open' }],
  closeBlockers: ['1 CAPA action(s) are not yet completed/verified.'], ...over,
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 1 }) } as Response);
});
afterEach(cleanup);

describe('the deviation card', () => {
  it('adds a CAPA action to the deviation, and updates an action by its own id', () => {
    const onEdit = vi.fn();
    render(<DeviationsTab doc={{ deviations: [DEV({})] }} onAdd={vi.fn()} onEdit={onEdit} onCloseDeviation={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a CAPA action' }));
    expect(onEdit).toHaveBeenLastCalledWith('capa-add', { id: 3, label: 'Missed visit window' });
    fireEvent.click(screen.getByRole('button', { name: 'Update status: Retrain site staff' }));
    expect(onEdit).toHaveBeenLastCalledWith('capa-status', { id: 21, label: 'Retrain site staff', defaults: { status: 'open' } });
  });

  it('holds the close while the gate would refuse, and says why', () => {
    const onClose = vi.fn();
    render(<DeviationsTab doc={{ deviations: [DEV({})] }} onAdd={vi.fn()} onEdit={vi.fn()} onCloseDeviation={onClose} />);
    const close = screen.getByRole('button', { name: 'Close deviation' });
    expect((close as HTMLButtonElement).disabled).toBe(true);
    expect(close.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('1 CAPA action(s) are not yet completed/verified.')).toBeTruthy();
  });

  it('opens the signing ceremony once the gate has nothing against it', () => {
    const onClose = vi.fn();
    render(<DeviationsTab doc={{ deviations: [DEV({ capa: [{ id: '21', action: 'Retrain site staff', status: 'verified' }], closeBlockers: [] })] }}
      onAdd={vi.fn()} onEdit={vi.fn()} onCloseDeviation={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close deviation' }));
    expect(onClose).toHaveBeenCalledWith({ id: 3, label: 'Missed visit window' });
  });

  it('offers nothing on a closed deviation, or to a reader', () => {
    const { unmount } = render(<DeviationsTab doc={{ deviations: [DEV({ status: 'closed', closeBlockers: ['Deviation is already closed.'] })] }}
      onAdd={vi.fn()} onEdit={vi.fn()} onCloseDeviation={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /CAPA|Update status|Close deviation/ })).toBeNull();
    unmount();
    render(<DeviationsTab doc={{ deviations: [DEV({})] }} onAdd={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Add a CAPA action|Close deviation/ })).toBeNull();
  });
});

describe('the writes', () => {
  it('adds a CAPA action through the capa route', async () => {
    await submitPdevForm('capa-add', 2, { id: 3 }, { action: 'Retrain site staff', owner: 'Site 104 lead', dueDate: '2026-12-01', reason: REASON });
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/protocol-deviations/deviations/3/capa',
      { action: 'Retrain site staff', owner: 'Site 104 lead', dueDate: '2026-12-01', reason: REASON });
  });

  it('sets a CAPA action’s status through the status route, by the action’s id', async () => {
    await submitPdevForm('capa-status', 2, { id: 21 }, { status: 'completed', reason: REASON });
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/api/protocol-deviations/capa/21/status', { status: 'completed', reason: REASON });
  });

  it('closes a deviation in the shared ceremony\u2019s body: password and second factor at the top level', async () => {
    // governed-signed-act.ts signedActBody: { reason, meaning, password, mfaToken? }. A nested `reauth`
    // (the protocol's own signing routes) is refused there as ESIGNATURE_COMPONENT_MISSING.
    await closeProtocolDeviation(3, { meaning: 'approval', reason: REASON, password: 'pw-123456', totp: '123456' });
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/protocol-deviations/deviations/3/close',
      { reason: REASON, meaning: 'approval', password: 'pw-123456', mfaToken: '123456' });
  });

  it('refuses a short reason in the browser: nothing is sent', async () => {
    await expect(submitPdevForm('capa-status', 2, { id: 21 }, { status: 'completed', reason: 'short' })).rejects.toThrow(/Nothing was written/);
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
