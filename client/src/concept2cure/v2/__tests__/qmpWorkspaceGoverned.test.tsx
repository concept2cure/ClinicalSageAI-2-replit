// @vitest-environment jsdom
/**
 * QmpWorkspace — create, activate and delete are governed changes.
 *
 * A quality-management plan sets the gates every governed document is
 * validated against. "Activate" used to PATCH {status:'active'} on a single
 * click, with no confirmation and no reason, and a refusal was reported as
 * "HTTP 0" because `apiRequest` throws on a non-2xx and the surface's reader
 * swallowed the error. Pinned here, against the REAL C2CForm drawer:
 *   - Activate / New plan / Delete open a governed reason dialog and send
 *     nothing until it is confirmed;
 *   - the request body carries the reason;
 *   - a reason under 8 characters is refused before anything is sent;
 *   - a server refusal is rendered as an error in the server's own words and
 *     the plan is not shown as changed; success is rendered as success;
 *   - the ACTIVE plan (the one whose gates are in force) is never offered for
 *     deletion — it is offered Archive, a governed PATCH that keeps the record;
 *   - the server's authority refusal (403, a viewer) is shown as a refusal.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { QmpWorkspace } from '../surfaces/QmpWorkspace';

function raw(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}
const props = () => ({ surface: { id: 'qmp', label: 'QMP' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const PLANS = [{ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft', description: null }];
const DASH = {
  qmp: { id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft' },
  sections: { totalSections: 10, sectionsByGateLevel: { hard: 3, soft: 5, info: 2 }, activeSections: 8, inactiveSections: 2, sectionsAllowingOverride: 1 },
  factors: { totalFactors: 6, factorsByRiskLevel: { high: 2, medium: 3, low: 1 }, activeFactors: 5, inactiveFactors: 1, requiredFactors: 4 },
  overallCompleteness: 75,
  riskProfile: { highRiskPercentage: 33, mediumRiskPercentage: 50, lowRiskPercentage: 17 },
};
const REASON = 'Activating for the Q4 CER filings.';

const writes = () => apiRequest.mock.calls.filter((c) => c[0] !== 'GET');

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
    if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
    if (method === 'POST' && url === '/api/quality/plans') return raw({ id: 2, name: body.name, version: '1.0', status: 'draft' }, 201);
    if (method === 'PATCH' && url === '/api/quality/plans/1') return raw({ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'active' });
    if (method === 'DELETE' && url === '/api/quality/plans/1') return raw({ success: true, message: 'Quality Management Plan deleted successfully' });
    return raw({});
  });
});

async function mounted() {
  render(<QmpWorkspace {...props()} />);
  await screen.findByText('CER Quality Plan');
}
function reasonBox(dialog: HTMLElement) {
  return within(dialog).getByLabelText(/Reason/) as HTMLTextAreaElement;
}
function toastFor(text: RegExp) {
  return screen.getByText(text).closest('.de-toast') as HTMLElement;
}

describe('QmpWorkspace — Activate is a governed change', () => {
  it('opens the reason dialog and does not PATCH until it is confirmed', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    expect(reasonBox(dialog)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it('sends the reason with the activation and reports success as success', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate plan/ }));
    await waitFor(() => {
      const call = writes().find((c) => c[0] === 'PATCH' && c[1] === '/api/quality/plans/1');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ status: 'active', reason: REASON });
    });
    expect(await screen.findByText(/Plan activated/)).toBeTruthy();
    expect(toastFor(/Plan activated/).getAttribute('data-tone')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses a reason under 8 characters without sending anything', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    fireEvent.change(reasonBox(dialog), { target: { value: '  short ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate plan/ }));
    expect(await screen.findByText(/at least 8 characters/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(screen.getByRole('dialog', { name: /Activate/ })).toBeTruthy();
  });

  it("renders a server refusal as an error in the server's words and leaves the plan unchanged", async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'PATCH') {
        const payload = { error: 'AUDIT_WRITE_FAILED', message: 'The plan was not activated because its audit record could not be written. Nothing was changed.' };
        throw new ApiRequestError(payload.message, 500, payload, 'AUDIT_WRITE_FAILED');
      }
      return raw({});
    });
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate plan/ }));
    const msg = await screen.findByText(/audit record could not be written/);
    expect(msg.closest('.de-toast')?.getAttribute('data-tone')).toBe('error');
    expect(screen.queryByText(/Plan activated/)).toBeNull();
    // Still offered for activation: the row was not adopted as active.
    const row = screen.getByText('CER Quality Plan').closest('tr') as HTMLElement;
    expect(within(row).getByText('draft')).toBeTruthy();
  });
});

describe('QmpWorkspace — what activation claims, and an outcome nobody can confirm', () => {
  it('does not claim activation switches the gates on: validation uses a plan by id, whatever its status', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    expect(within(dialog).queryByText(/Once active/)).toBeNull();
    expect(within(dialog).getByText(/Marks this plan active in the register/)).toBeTruthy();
  });

  it('a COMMIT the server could not confirm is not reported as "not activated", and the register is re-read', async () => {
    let planReads = 0;
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/quality/plans') { planReads += 1; return raw(PLANS); }
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'PATCH') {
        const payload = { error: 'OUTCOME_UNKNOWN', message: 'The change could not be confirmed. Reload to check whether the plan was changed before trying again.' };
        throw new ApiRequestError(payload.message, 500, payload, 'OUTCOME_UNKNOWN');
      }
      return raw({});
    });
    await mounted();
    const readsBefore = planReads;
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate plan/ }));
    expect(await screen.findByText(/could not be confirmed/)).toBeTruthy();
    expect(screen.queryByText(/Plan not activated/)).toBeNull();
    await waitFor(() => expect(planReads).toBeGreaterThan(readsBefore));
  });

  it('a double click sends one create, not two', async () => {
    let release: () => void = () => undefined;
    apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
      if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'POST') {
        await new Promise<void>((r) => { release = r; });
        return raw({ id: 2, name: body.name, version: '1.0', status: 'draft' }, 201);
      }
      return raw({});
    });
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /New plan/ }));
    const dialog = await screen.findByRole('dialog', { name: /New quality-management plan/ });
    fireEvent.change(within(dialog).getByLabelText(/Plan name/), { target: { value: 'CER Plan 2027' } });
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    const submit = within(dialog).getByRole('button', { name: /Create plan/ });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(writes()).toHaveLength(1));
    release();
    expect(await screen.findByText(/Quality-management plan created/)).toBeTruthy();
    expect(writes()).toHaveLength(1);
  });
});

describe('QmpWorkspace — create and delete are governed changes', () => {
  it('create carries the reason in the POST body', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /New plan/ }));
    const dialog = await screen.findByRole('dialog', { name: /New quality-management plan/ });
    fireEvent.change(within(dialog).getByLabelText(/Plan name/), { target: { value: 'New QP' } });
    fireEvent.change(reasonBox(dialog), { target: { value: 'Quality plan for the 2027 CER cycle.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create plan/ }));
    await waitFor(() => {
      const call = writes().find((c) => c[0] === 'POST' && c[1] === '/api/quality/plans');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ name: 'New QP', reason: 'Quality plan for the 2027 CER cycle.' });
    });
    expect(await screen.findByText(/plan created/i)).toBeTruthy();
  });

  it('delete opens the reason dialog, sends nothing until confirmed, then sends the reason', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog', { name: /Delete/ });
    expect(writes()).toHaveLength(0);
    fireEvent.change(reasonBox(dialog), { target: { value: 'Superseded by the 2027 plan.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete plan/ }));
    await waitFor(() => {
      const call = writes().find((c) => c[0] === 'DELETE' && c[1] === '/api/quality/plans/1');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ reason: 'Superseded by the 2027 plan.' });
    });
    expect(await screen.findByText(/Plan deleted/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('CER Quality Plan')).toBeNull());
  });

  it("renders a refused delete in the server's words and keeps the plan listed", async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'DELETE') {
        const payload = { error: 'Cannot delete Quality Management Plan that is in use', message: 'This QMP is currently used in section gating rules. Please delete those rules first.' };
        throw new ApiRequestError(payload.message, 400, payload);
      }
      return raw({});
    });
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('dialog', { name: /Delete/ });
    fireEvent.change(reasonBox(dialog), { target: { value: 'Superseded by the 2027 plan.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete plan/ }));
    const msg = await screen.findByText(/used in section gating rules/);
    expect(msg.closest('.de-toast')?.getAttribute('data-tone')).toBe('error');
    expect(screen.queryByText(/Plan deleted/)).toBeNull();
    expect(screen.getAllByText('CER Quality Plan').length).toBeGreaterThan(0);
  });
});

describe('QmpWorkspace — the active plan is archived, never deleted', () => {
  const ACTIVE = [{ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'active', description: null }];
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/quality/plans') return raw(ACTIVE);
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'PATCH' && url === '/api/quality/plans/1') return raw({ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'archived' });
      return raw({});
    });
  });

  it('offers no Delete on the active plan', async () => {
    await mounted();
    const row = screen.getByText('CER Quality Plan').closest('tr') as HTMLElement;
    expect(within(row).queryByRole('button', { name: /Delete/ })).toBeNull();
    expect(within(row).queryByRole('button', { name: /Activate/ })).toBeNull();
    expect(within(row).getByRole('button', { name: /Archive/ })).toBeTruthy();
  });

  it('archives through the reason dialog, sending the reason, and then offers Delete', async () => {
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Archive/ }));
    const dialog = await screen.findByRole('dialog', { name: /Archive/ });
    expect(writes()).toHaveLength(0);
    fireEvent.change(reasonBox(dialog), { target: { value: 'Superseded by the 2027 plan.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Archive plan/ }));
    await waitFor(() => {
      const call = writes().find((c) => c[0] === 'PATCH' && c[1] === '/api/quality/plans/1');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ status: 'archived', reason: 'Superseded by the 2027 plan.' });
    });
    expect(await screen.findByText(/Plan archived/)).toBeTruthy();
    const row = screen.getAllByText('CER Quality Plan')[0].closest('tr') as HTMLElement;
    await waitFor(() => expect(within(row).getByText('archived')).toBeTruthy());
    expect(within(row).getByRole('button', { name: /Delete/ })).toBeTruthy();
  });
});

describe('QmpWorkspace — the server authority refusal', () => {
  it('renders a 403 as a refusal and leaves the plan as it was', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
      if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
      if (method === 'PATCH') throw new ApiRequestError('Insufficient permissions', 403, { error: 'Insufficient permissions' });
      return raw({});
    });
    await mounted();
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    const dialog = await screen.findByRole('dialog', { name: /Activate/ });
    fireEvent.change(reasonBox(dialog), { target: { value: REASON } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Activate plan/ }));
    const msg = await screen.findByText(/Plan not activated — Insufficient permissions/);
    expect(msg.closest('.de-toast')?.getAttribute('data-tone')).toBe('error');
    const row = screen.getByText('CER Quality Plan').closest('tr') as HTMLElement;
    expect(within(row).getByText('draft')).toBeTruthy();
  });
});
