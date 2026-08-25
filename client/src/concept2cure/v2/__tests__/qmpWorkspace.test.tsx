// @vitest-environment jsdom
/**
 * QmpWorkspace — proves the quality-management surface is wired to the real
 * /api/quality endpoints (raw JSON, not {data}-wrapped): loads plans + the
 * completeness/risk dashboard, activates a plan, and creates one. C2CForm is
 * stubbed so the test drives the backend wiring.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('../C2CForm', () => ({
  C2CForm: ({ config, onSubmit }: any) => (
    <button data-testid="form-submit" onClick={() => onSubmit({ name: 'New QP', version: '1.0', status: 'draft', description: '' })}>{config.submitLabel}</button>
  ),
}));

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

afterEach(() => cleanup());
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: any) => {
    if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
    if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
    if (method === 'POST' && url === '/api/quality/plans') return raw({ id: 2, name: body.name, version: '1.0', status: 'draft' }, 201);
    if (method === 'PATCH' && url === '/api/quality/plans/1') return raw({ id: 1, name: 'CER Quality Plan', status: 'active' });
    return raw({});
  });
});

describe('QmpWorkspace — real quality backend', () => {
  it('loads plans and the completeness/risk dashboard', async () => {
    render(<QmpWorkspace {...props()} />);
    expect(await screen.findByText('CER Quality Plan')).toBeTruthy();
    expect(await screen.findByText('75% complete')).toBeTruthy();
    expect(screen.getByText(/high 2/)).toBeTruthy();
  });

  it('activates a plan via PATCH', async () => {
    render(<QmpWorkspace {...props()} />);
    await screen.findByText('CER Quality Plan');
    fireEvent.click(screen.getByRole('button', { name: /Activate/ }));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'PATCH' && c[1] === '/api/quality/plans/1');
      expect(call).toBeTruthy();
      expect(call![2]).toEqual({ status: 'active' });
    });
    expect(await screen.findByText(/Plan activated/)).toBeTruthy();
  });

  it('creates a plan via POST', async () => {
    render(<QmpWorkspace {...props()} />);
    await screen.findByText('CER Quality Plan');
    fireEvent.click(screen.getByRole('button', { name: /New plan/ }));
    fireEvent.click(screen.getByTestId('form-submit'));
    await waitFor(() => {
      const call = apiRequest.mock.calls.find((c) => c[0] === 'POST' && c[1] === '/api/quality/plans');
      expect(call).toBeTruthy();
      expect(call![2]).toMatchObject({ name: 'New QP', version: '1.0' });
    });
    expect(await screen.findByText(/plan created/i)).toBeTruthy();
  });
});
