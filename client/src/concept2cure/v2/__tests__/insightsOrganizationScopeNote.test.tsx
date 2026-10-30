// @vitest-environment jsdom
/**
 * An organization-scope report under an open project says its counts are the
 * organization's (D2, 2026-10-29; docs/evidence/D2-REPORT-SCOPE-HONESTY/).
 *
 * The domain report types run at `project` scope when a project is open,
 * because their registry row allows it. Their engine still counts the whole
 * organization's records, and the run carries that as `computedScope:
 * 'organization'` (report-engine.ts reportAvailability, computeDomainRun). The
 * report's scope line named the project above those counts, and a pack tile
 * offered "Run report" with no note. The catalog card already said it:
 * "Organization-wide records" / "Counts are not narrowed to the selected
 * project." (InsightsCatalogPanel.tsx). These tests hold that the same
 * statement is on the tile, on the scope line and in the result, read from the
 * carried `computedScope` only, and absent where the run computed the project.
 *
 * Only the transport (`apiRequest`) and the signed-in user are replaced. The
 * rendered documents come from the server's own renderer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => ({ id: 3, role: 'manager', permissions: ['governed:write'] }),
}));
vi.mock('../../../../../server/db', () => ({ pool: {}, db: {}, getPool: () => ({}) }));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import { renderReport } from '../../../../../server/services/report-os/render/render';
import { calculateLifecycleCalendar, LIFECYCLE_CALENDAR_LIMIT } from '../../../../../server/services/report-os/lifecycle-calendar';

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const PROJECT = 'ABC-101';
const ORG_WIDE = 'Organization-wide records';
const NOT_NARROWED = 'Counts are not narrowed to the selected project.';
const REGISTER_SENTENCE = "Counts are the organisation's records of this kind; they are not limited to one program.";
const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

/* The catalog row as the server answers it under an open project
   (insights-canvas-routes.ts catalogFor): runScopeType 'project' with the lead's
   id, and `computedScope` from reportAvailability for that scope. */
const COMPUTED_SCOPE: Record<string, string> = {
  'readiness.executive_digest': 'project',
  'inspection.readiness_pack': 'organization',
  'lifecycle.obligation_calendar': 'organization',
};
const catalog = CANVAS_REPORT_TYPES.map((t) => (COMPUTED_SCOPE[t.typeId]
  ? { ...t, computedScope: COMPUTED_SCOPE[t.typeId], runScopeType: 'project', runScopeId: '12', entitled: true }
  : t));
const LEAD = {
  projectId: 12, code: PROJECT, label: PROJECT, filing: null, indication: null,
  readiness: null, confidence: null, scope: 'project', scopeId: '12', agency: null, pdufa: null, criticalBlockerCount: 0,
};
const overview = () => ({
  data: {
    organizationId: 1, tier: 'enterprise', tierResolved: true, segments: [], reportTypes: catalog,
    leadProgram: LEAD, openProgram: { programId: PROGRAM, state: 'lead' }, programs: [],
    portfolio: { entitled: true, requiredTier: 'enterprise', summary: null, programs: [] },
  },
});

/* What GET /runs/:id/rendered answers, from the server's renderer. */
const providers = [{ provider: 'inspection_readiness', status: 'ready' as const, observedAt: '2026-10-29T00:00:00Z' }];
const inspectionDoc = (scopeType: string, scopeId: string, scopeLabel: string) => renderReport({
  reportTypeId: 'inspection.readiness_pack', reportTypeLabel: 'Inspection Readiness & 483 Response Pack', scopeType, scopeId,
  providers, blockers: [], status: 'partial', generatedAt: '2026-10-29T00:00:00Z',
  summary: { domain: { observations: 4, byStatus: { open: 3, closed: 1 } }, computedScope: 'organization', scopeLabel },
});
const digestDoc = renderReport({
  reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest', scopeType: 'project', scopeId: '12',
  providers: [], blockers: [], status: 'partial', generatedAt: '2026-10-29T00:00:00Z',
  summary: { computedScope: 'project', scopeLabel: PROJECT },
});
const calendar = calculateLifecycleCalendar({ observed_at: '2026-10-29T00:00:00Z', obligation_count: 1, event_count: 0, events: [],
  obligations: [{ id: 2, product_id: null, product_name: null, submission_id: 7, project_id: 31, region: 'fda', obligation_type: 'periodic_report', classification: 'DSUR', title: 'Another project’s obligation', status: 'in_preparation', due_date: '2026-11-20', submitted_date: null, recurrence_months: 12 }],
});
const calendarDoc = renderReport({
  reportTypeId: 'lifecycle.obligation_calendar', reportTypeLabel: 'Lifecycle Obligation Calendar', scopeType: 'project', scopeId: '12',
  providers: [{ provider: 'lifecycle_obligation_calendar', status: 'partial', observedAt: calendar.observedAt }], blockers: [LIFECYCLE_CALENDAR_LIMIT],
  status: 'partial', generatedAt: calendar.observedAt,
  summary: { domain: { lifecycleCalendar: calendar }, computedScope: 'organization', scopeLabel: PROJECT },
});

let rendered: unknown;
beforeEach(() => {
  rendered = inspectionDoc('project', '12', PROJECT);
  window.history.replaceState({}, '', '/');
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: PROJECT, code: PROJECT };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith('/api/insights-canvas/overview')) return ok(overview());
    if (method === 'POST' && url === '/api/report-os/runs') return ok({ data: { run: { id: 9 } } });
    if (url === '/api/report-os/runs/9/rendered') return ok({ data: rendered });
    return ok({ data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

/* The shell's segment preference; the program records no product type, so the
   canvas offers this segment's packs: the "Portfolio oversight pack". */
const renderCanvas = () =>
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="health" onNav={vi.fn()} />);
const ready = () => waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
async function openPack() {
  renderCanvas();
  await ready();
  // "Where to start": the segment's first pack, offered for the open project.
  const opener = await waitFor(() => {
    const button = document.querySelector<HTMLElement>('.rc-opener .rc-preset-btn');
    expect(button?.textContent).toMatch(/Build the Portfolio oversight pack/);
    return button!;
  });
  fireEvent.click(opener);
  await waitFor(() => expect(document.querySelector('.ro-pack-grid')).not.toBeNull());
}
const tile = (title: string) => [...document.querySelectorAll<HTMLElement>('button.ro-pack-card')]
  .find((b) => b.querySelector('.ro-pack-title')?.textContent === title);
const head = () => document.querySelector<HTMLElement>('.ro-rep-head')!;
const resultStatus = () => screen.getByTestId('rc-find-result').querySelector('[role="status"]');

describe('pack tile — an organization-scope type under the open project', () => {
  it('states the catalog card’s note beside "Run report"', async () => {
    await openPack();
    const inspection = tile('Inspection Readiness & 483 Response Pack');
    expect(inspection, 'the inspection register is offered as a run').toBeTruthy();
    expect(inspection!.textContent).toMatch(/Run report/);
    expect(within(inspection!).getByText(ORG_WIDE)).toBeTruthy();
    expect(within(inspection!).getByText(NOT_NARROWED)).toBeTruthy();
  });

  it('says nothing of the kind on a tile whose engine computes the project', async () => {
    await openPack();
    const digest = tile('Executive Readiness Digest');
    expect(digest).toBeTruthy();
    expect(digest!.textContent).not.toMatch(/Organization-wide|not narrowed/);
  });
});

describe('report scope line — what the counts cover', () => {
  it('names the project and says the counts are the organization’s, not the project’s', async () => {
    await openPack();
    fireEvent.click(tile('Inspection Readiness & 483 Response Pack')!);
    expect((await screen.findByTestId('ro-scope')).textContent).toBe(PROJECT);
    expect(within(head()).getByText(ORG_WIDE)).toBeTruthy();
    expect(within(head()).getByText(NOT_NARROWED)).toBeTruthy();
    // The result beside the canvas names the project too, so it says the same.
    await waitFor(() => expect(resultStatus()?.textContent).toMatch(/ran against the governed record/));
    expect(resultStatus()?.textContent).toContain(`${ORG_WIDE}. ${NOT_NARROWED}`);
  });

  it('the lifecycle calendar under the project: the scope line note and the register’s sentence in its body', async () => {
    rendered = calendarDoc;
    renderCanvas();
    await ready();
    fireEvent.click(await screen.findByRole('tab', { name: 'Report catalog' }));
    const card = (await screen.findByText('Lifecycle Obligation Calendar')).closest('.rl-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^Run$/ }));
    expect((await screen.findByTestId('ro-scope')).textContent).toBe(PROJECT);
    expect(within(head()).getByText(NOT_NARROWED)).toBeTruthy();
    const obligations = screen.getByRole('heading', { name: 'Recorded obligation calendar' }).closest('section')!;
    expect(within(obligations).getByText(REGISTER_SENTENCE)).toBeTruthy();
    expect(within(obligations).getByText('Another project’s obligation')).toBeTruthy();
  });

  it('a run whose engine computed the project carries no organization note', async () => {
    rendered = digestDoc;
    await openPack();
    fireEvent.click(tile('Executive Readiness Digest')!);
    expect((await screen.findByTestId('ro-scope')).textContent).toBe(PROJECT);
    expect(head().textContent).not.toMatch(/Organization-wide|not narrowed/);
    await waitFor(() => expect(resultStatus()?.textContent).toMatch(/ran against the governed record/));
    expect(resultStatus()?.textContent).not.toMatch(/Organization-wide|not narrowed/);
  });

  it('an organization (account) run is already headed as the organization and adds nothing', async () => {
    window.history.replaceState({}, '', '/concept2cure/insights?reportRunId=41');
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok(overview());
      if (url === '/api/report-os/runs/41') return ok({ data: { id: 41, runUuid: 'u', reportTypeId: 'inspection.readiness_pack', reportTypeLabel: 'Inspection Readiness & 483 Response Pack', scopeType: 'account', scopeId: '1', scopeLabel: 'Organization', computedScope: 'organization', status: 'partial', confidence: null, createdAt: '2026-10-29T00:00:00Z' } });
      if (url === '/api/report-os/runs/41/rendered') return ok({ data: inspectionDoc('account', '1', 'Organization') });
      return ok({ data: [] });
    });
    renderCanvas();
    expect((await screen.findByTestId('ro-scope')).textContent).toBe('Organization');
    expect(head().textContent).not.toMatch(/not narrowed/);
  });

  it('a stored project run opened from a link says it too, from the run’s own computed scope', async () => {
    window.history.replaceState({}, '', '/concept2cure/insights?reportRunId=41');
    delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url.startsWith('/api/insights-canvas/overview')) return ok({ data: { ...overview().data, leadProgram: null, openProgram: null } });
      if (url === '/api/report-os/runs/41') return ok({ data: { id: 41, runUuid: 'u', reportTypeId: 'inspection.readiness_pack', reportTypeLabel: 'Inspection Readiness & 483 Response Pack', scopeType: 'project', scopeId: '12', scopeLabel: PROJECT, computedScope: 'organization', status: 'partial', confidence: null, createdAt: '2026-10-29T00:00:00Z' } });
      if (url === '/api/report-os/runs/41/rendered') return ok({ data: inspectionDoc('project', '12', PROJECT) });
      return ok({ data: [] });
    });
    renderCanvas();
    expect((await screen.findByTestId('ro-scope')).textContent).toBe(PROJECT);
    expect(within(head()).getByText(NOT_NARROWED)).toBeTruthy();
  });
});
