// @vitest-environment jsdom
/**
 * QmpWorkspace — proves the quality-management surface reads the real
 * /api/quality endpoints (raw JSON, not {data}-wrapped): the plan register and
 * the completeness/risk dashboard.
 *
 * Its writes (activate, archive, create, delete) are governed changes (weekly
 * review 2026-09-22, P2) and are proven against the real C2CForm in
 * qmpWorkspaceGoverned.test.tsx. The two write cases that lived here asserted
 * the old one-click, reasonless calls; once rewritten they duplicated that
 * suite, so they were removed rather than kept twice.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
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
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/quality/plans') return raw(PLANS);
    if (method === 'GET' && url === '/api/quality/dashboard/1') return raw(DASH);
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
});
