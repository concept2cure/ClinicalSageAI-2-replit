// @vitest-environment jsdom
/** The existing launch Reporting UI displays the new engine's actual structured document. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest }));
const currentUser = vi.hoisted(() => ({ id: 3, organizationId: 7, role: 'manager', permissions: ['governed:write'] }));
vi.mock('@/services/portal/authService', () => ({
  useAuthUser: () => currentUser,
  authService: { getUser: () => currentUser, on: () => () => {} },
  default: {},
}));
vi.mock('../../../../../server/db', () => ({ pool: {} }));
import { calculateLabelCurrencyMatrix, LABEL_CURRENCY_LIMIT, LABEL_CURRENCY_TYPE } from '../../../../../server/services/report-os/label-currency-matrix';
import { renderReport } from '../../../../../server/services/report-os/render/render';
import { InsightsCanvas } from '../surfaces/Insights';
import { queryClient } from '@/lib/queryClient';
import { getSurface } from '../../../../../shared/constants/ui-surface-registry';
const programId = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const type = { typeId: LABEL_CURRENCY_TYPE, label: 'Label Currency Matrix', family: 'global_labeling', allowedScopes: ['account', 'program', 'project'], allowedClientSegments: ['pharma'], runnable: true, engine: 'domain', computedScope: 'organization', computedScopes: ['account', 'program', 'project'], entitled: true, truthfulnessRules: { allowPartial: true, requireBlockers: true, forbidFinalIfMissingCritical: true } };
const matrix = calculateLabelCurrencyMatrix({ observed_at: '2026-10-14T00:00:00Z', products: [{ id: 1, organization_id: 7, product_name: 'Recorded product', status: 'active' }], registrations: [{ id: 1, product_id: 1, country: 'US', market_status: 'approved', registration_number: 'ACTUAL-US-77', approval_date: '2026-01-01', renewal_due_date: null }], labels: [{ id: 1, product_id: 1, country: null, label_type: 'core_data_sheet', version: 'Core-1', status: 'draft', approved_date: null }, { id: 2, product_id: 1, country: 'US', label_type: 'uspi', version: 'USPI-recorded-9', status: 'approved', approved_date: '2026-01-03' }], obligations: [{ id: 1, product_id: null, region: 'other', obligation_type: 'annual_report', classification: null, title: 'Unlinked recorded obligation', status: 'planned', due_date: null, submitted_date: null }] });
const report = renderReport({ reportTypeId: LABEL_CURRENCY_TYPE, reportTypeLabel: type.label, scopeType: 'project', scopeId: '11', providers: [{ provider: 'rim_label_currency_matrix', status: 'partial', observedAt: matrix.observedAt }], blockers: [LABEL_CURRENCY_LIMIT], summary: { domain: { labelCurrencyMatrix: matrix }, computedScope: 'organization', scopeLabel: 'Selected project' }, status: 'partial', generatedAt: matrix.observedAt });
afterEach(() => { cleanup(); queryClient.clear(); apiRequest.mockReset(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; sessionStorage.clear(); localStorage.removeItem('currentOrganizationId'); });
describe('existing Insights matrix run', () => {
  it('runs the catalog type and preserves nullable columns, recorded values and explicit unknown currency in the UI', async () => {
    sessionStorage.setItem('trialsage_access_token', 'signed-in-matrix-fixture');
    localStorage.setItem('currentOrganizationId', String(currentUser.organizationId));
    (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: programId, title: 'Selected project', code: 'SEL' };
    apiRequest.mockImplementation(async (method: string, path: string) => {
      let data: unknown = {};
      if (path === '/api/users/me/persona') data = { persona: 'labeling_lead', role: 'manager', availablePersonas: ['labeling_lead'] };
      if (path.startsWith('/api/insights-canvas/overview')) data = { organizationId: 7, tier: 'enterprise', tierResolved: true, segments: ['pharma'], reportTypes: [type], leadProgram: { projectId: 11, code: 'SEL', label: 'Selected project', scope: 'project', scopeId: '11', readiness: null, confidence: null, criticalBlockerCount: 0 }, openProgram: { programId, state: 'lead' }, portfolio: { programs: [] } };
      if (method === 'POST' && path === '/api/report-os/runs') data = { run: { id: 17 } };
      if (path === '/api/report-os/runs/17/rendered') data = report;
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    render(<InsightsCanvas surface={getSurface('insights')!} segment="pharma" onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/users/me/persona');
    expect(await screen.findByText('USPI-recorded-9')).toBeTruthy();
    const matrixSection = screen.getByRole('heading', { name: 'Recorded label matrix' }).closest('section')!;
    const table = within(matrixSection).getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Market (null = unassigned/core)' })).toBeTruthy();
    expect(within(table).getByText('Core-1')).toBeTruthy(); expect(within(table).getByText('2026-01-03')).toBeTruthy();
    expect(screen.getByText('ACTUAL-US-77')).toBeTruthy(); expect(screen.getByText('Unlinked recorded obligation')).toBeTruthy();
    expect(document.body.textContent).toContain('Legal label currency is unknown');
    expect(document.body.textContent).not.toMatch(/Submission readiness not computed|No gaps detected/);
    const bodies = apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/report-os/runs').map(call => call[2]);
    expect(bodies).toEqual([expect.objectContaining({ reportTypeId: LABEL_CURRENCY_TYPE })]);
  });
});
