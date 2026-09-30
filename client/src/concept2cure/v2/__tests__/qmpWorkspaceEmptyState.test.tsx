// @vitest-environment jsdom
/**
 * QmpWorkspace — what the plan register offers when there is nothing in it,
 * and what it says when it could not read it.
 *
 * Found by the D2 launch sweep of an EMPTY org: under "No quality plans yet"
 * the header's filled primary button was "Explain this plan", which asked AnA
 * to explain "this quality-management plan" — one that did not exist — while
 * the action that state needs, New plan, was a small text link. Pinned:
 *   - with no plans, "Explain this plan" is not offered, and the empty state
 *     carries New plan as its action (which opens the governed create dialog);
 *   - with a plan selected, "Explain this plan" is offered and names that plan.
 *
 * And the read failures beside it:
 *   - a 403 is "you don't have access", not "the register didn't respond";
 *   - a 5xx is a failure with a retry that re-reads, not an empty register;
 *   - a 2xx whose body is not the plan list is a failure, not "No quality plans yet".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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
const onAsk = vi.fn();
const props = () => ({ surface: { id: 'qmp', label: 'QMP' } as any, onAsk, onNav: vi.fn(), segment: 'biopharma' });

const PLANS = [{ id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft', description: null }];
const DASH = {
  qmp: { id: 1, name: 'CER Quality Plan', version: '1.0', status: 'draft' },
  sections: { totalSections: 10, sectionsByGateLevel: { hard: 3, soft: 5, info: 2 }, activeSections: 8, inactiveSections: 2, sectionsAllowingOverride: 1 },
  factors: { totalFactors: 6, factorsByRiskLevel: { high: 2, medium: 3, low: 1 }, activeFactors: 5, inactiveFactors: 1, requiredFactors: 4 },
  overallCompleteness: 75,
  riskProfile: { highRiskPercentage: 33, mediumRiskPercentage: 50, lowRiskPercentage: 17 },
};

/** Serve the plan list as `plans` (a body, or a thrown failure). */
function servePlans(plans: () => Promise<Response>) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/quality/plans') return plans();
    if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
    return raw({});
  });
}
const planReads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && c[1] === '/api/quality/plans').length;

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  onAsk.mockReset();
});

describe('QmpWorkspace — an empty plan register', () => {
  it('does not offer "Explain this plan" when there is no plan', async () => {
    servePlans(async () => raw([]));
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('No quality plans yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Explain this plan/ })).toBeNull();
  });

  it('carries New plan as the empty state’s action, and it opens the governed create dialog', async () => {
    servePlans(async () => raw([]));
    render(<QmpWorkspace {...props()} />);
    const empty = (await screen.findByText('No quality plans yet')).closest('[role="status"]') as HTMLElement;
    fireEvent.click(within(empty).getByRole('button', { name: 'New plan' }));
    expect(await screen.findByRole('dialog', { name: /New quality-management plan/ })).toBeTruthy();
  });
});

describe('QmpWorkspace — a register with a plan', () => {
  it('offers "Explain this plan" and names the selected plan in the prompt', async () => {
    servePlans(async () => raw(PLANS));
    render(<QmpWorkspace {...props()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Explain this plan/ }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(String(onAsk.mock.calls[0][0])).toContain('“CER Quality Plan”');
  });
});

describe('QmpWorkspace — a plan read that did not succeed', () => {
  it('names a 403 as no access, with no retry and no "didn’t respond"', async () => {
    servePlans(async () => { throw new ApiRequestError('You do not have permission to view quality plans.', 403, { error: 'FORBIDDEN' }, 'FORBIDDEN'); });
    render(<QmpWorkspace {...props()} />);
    const alert = (await screen.findByText('You don’t have access to quality plans')).closest('[role="alert"]') as HTMLElement;
    expect(within(alert).queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText(/didn’t respond/)).toBeNull();
    expect(screen.queryByText('No quality plans yet')).toBeNull();
    expect(screen.queryByRole('button', { name: /Explain this plan/ })).toBeNull();
  });

  it('shows a 500 as a failure with a retry that re-reads the register', async () => {
    servePlans(async () => { throw new ApiRequestError('Internal error', 500, { error: 'INTERNAL_ERROR' }, 'INTERNAL_ERROR'); });
    render(<QmpWorkspace {...props()} />);
    const alert = (await screen.findByText('Couldn’t load quality plans')).closest('[role="alert"]') as HTMLElement;
    expect(screen.queryByText('No quality plans yet')).toBeNull();
    const before = planReads();
    servePlans(async () => raw(PLANS));
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(planReads()).toBe(before + 1));
    expect(await screen.findByText('CER Quality Plan')).toBeTruthy();
  });

  it('does not read a 2xx that is not the plan list as an empty register', async () => {
    servePlans(async () => raw({ data: {} }));
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('Couldn’t load quality plans')).toBeTruthy();
    expect(screen.queryByText('No quality plans yet')).toBeNull();
  });
});
