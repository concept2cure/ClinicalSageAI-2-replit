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
vi.mock('../../../../../server/db', () => ({ pool: {}, db: {}, getPool: () => ({}) }));
import { calculateLifecycleCalendar, LIFECYCLE_CALENDAR_LIMIT, LIFECYCLE_CALENDAR_TYPE } from '../../../../../server/services/report-os/lifecycle-calendar';
import { renderReport } from '../../../../../server/services/report-os/render/render';
import { InsightsCanvas } from '../surfaces/Insights';
import { queryClient } from '@/lib/queryClient';
import { getSurface } from '../../../../../shared/constants/ui-surface-registry';
const programId = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const type = { typeId: LIFECYCLE_CALENDAR_TYPE, label: 'Lifecycle Obligation Calendar', family: 'lifecycle', allowedScopes: ['account', 'program', 'project'], allowedClientSegments: ['pharma'], runnable: true, engine: 'domain', computedScope: 'organization', computedScopes: ['account', 'program', 'project'], entitled: true, truthfulnessRules: { allowPartial: true, requireBlockers: true, forbidFinalIfMissingCritical: true } };
const calendar = calculateLifecycleCalendar({ observed_at: '2026-10-17T00:00:00Z', obligation_count: 2, event_count: 2,
  obligations: [
    { id: 1, product_id: null, product_name: null, submission_id: null, project_id: null, region: 'other', obligation_type: 'annual_report', classification: null, title: 'Unlinked undated obligation', status: 'planned', due_date: null, submitted_date: null, recurrence_months: null },
    { id: 2, product_id: 1, product_name: 'Recorded product', submission_id: 7, project_id: 11, region: 'fda', obligation_type: 'periodic_report', classification: 'DSUR', title: 'Recorded private-source obligation', status: 'in_preparation', due_date: '2026-10-20', submitted_date: null, recurrence_months: 12 },
  ], events: [
    { id: 1, obligation_id: 2, title: 'Undated persisted occurrence', project_id: 11, period_start: null, period_end: null, due_date: null, status: 'pending', submitted_date: null },
    { id: 2, obligation_id: 2, title: 'Dated persisted occurrence', project_id: 11, period_start: '2025-01-01', period_end: '2025-12-31', due_date: '2026-03-01', status: 'submitted', submitted_date: '2026-02-20' },
  ],
});
const report = renderReport({ reportTypeId: LIFECYCLE_CALENDAR_TYPE, reportTypeLabel: type.label, scopeType: 'project', scopeId: '11', providers: [{ provider: 'lifecycle_obligation_calendar', status: 'partial', observedAt: calendar.observedAt }], blockers: [LIFECYCLE_CALENDAR_LIMIT], summary: { domain: { lifecycleCalendar: calendar }, computedScope: 'organization', scopeLabel: 'Selected project' }, status: 'partial', generatedAt: calendar.observedAt });
afterEach(() => { cleanup(); queryClient.clear(); apiRequest.mockReset(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; sessionStorage.clear(); localStorage.removeItem('currentOrganizationId'); });
describe('existing Insights lifecycle run', () => {
  it('runs the catalog type and displays actual obligation/occurrence dates and legal limits through the mounted Insights renderer', async () => {
    sessionStorage.setItem('trialsage_access_token', 'signed-in-matrix-fixture');
    localStorage.setItem('currentOrganizationId', String(currentUser.organizationId));
    (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: programId, title: 'Selected project', code: 'SEL' };
    apiRequest.mockImplementation(async (method: string, path: string) => {
      let data: unknown = {};
      if (path === '/api/users/me/persona') data = { persona: 'regulatory_lead', role: 'manager', availablePersonas: ['regulatory_lead'] };
      if (path.startsWith('/api/insights-canvas/overview')) data = { organizationId: 7, tier: 'enterprise', tierResolved: true, segments: ['pharma'], reportTypes: [type], leadProgram: { projectId: 11, code: 'SEL', label: 'Selected project', scope: 'project', scopeId: '11', readiness: null, confidence: null, criticalBlockerCount: 0 }, openProgram: { programId, state: 'lead' }, portfolio: { programs: [] } };
      if (method === 'POST' && path === '/api/report-os/runs') data = { run: { id: 17 } };
      if (path === '/api/report-os/runs/17/rendered') data = report;
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    render(<InsightsCanvas surface={getSurface('insights')!} segment="pharma" onNav={vi.fn()} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Run$/ }));
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/users/me/persona');
    expect(await screen.findByText('Recorded private-source obligation')).toBeTruthy();
    const obligations = screen.getByRole('heading', { name: 'Recorded obligation calendar' }).closest('section')!;
    const obligationTable = within(obligations).getAllByRole('table')[1];
    expect(within(obligationTable).getByRole('columnheader', { name: 'Due date' })).toBeTruthy();
    expect(within(obligationTable).getByText('2026-10-20')).toBeTruthy();
    expect(within(obligationTable).getByText('Unlinked undated obligation')).toBeTruthy();
    const occurrences = screen.getByRole('heading', { name: 'Persisted lifecycle occurrences' }).closest('section')!;
    const occurrenceTable = within(occurrences).getAllByRole('table')[1];
    for (const value of ['Period start', 'Period end', 'Due date', 'Submitted date']) expect(within(occurrenceTable).getByRole('columnheader', { name: value })).toBeTruthy();
    for (const value of ['2025-01-01', '2025-12-31', '2026-03-01', '2026-02-20']) expect(within(occurrenceTable).getByText(value)).toBeTruthy();
    expect(document.body.textContent).toContain('Legal applicability, completeness and regulatory currency are not assessed');
    expect(document.body.textContent).toContain('due date unknown');
    expect(document.body.textContent).not.toMatch(/Submission readiness not computed|No gaps detected/);
    const bodies = apiRequest.mock.calls.filter(([method, path]) => method === 'POST' && path === '/api/report-os/runs').map(call => call[2]);
    expect(bodies).toEqual([expect.objectContaining({ reportTypeId: LIFECYCLE_CALENDAR_TYPE })]);
  });
});
