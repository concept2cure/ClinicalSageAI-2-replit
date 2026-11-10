// @vitest-environment jsdom
/**
 * The global schedule in Reporting & analytics (S11 step 6b; THE_PROGRAM §5 "one global schedule. It shows each
 * region's filing date and review clock side by side", and §9 step 6).
 *
 * One row per project the reader can open, on one shared date axis, sorted by target date. Each row is the Plan
 * step's line: the work from its start to the target submission (a filled dot), the agency's review clock dashed to
 * its decision goal, the next phase to complete as a dot, and today. Every date is the engine's back-schedule or the
 * agency clock's, read once for the page from GET /api/v1/pyramids/by-project?refs=… (the read that serves the
 * portfolio line on Projects). Nothing is computed in Reporting.
 *
 * A project that cannot be drawn says why, in words; a failed read is said, never an empty chart.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import { GlobalSchedule } from '../surfaces/PyramidProject';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: 'down' }) }) as unknown as Response;

const summary = (over: Record<string, unknown> = {}) => ({ total: 58, done: 3, blocked: 0, overdue: 0, lateToStart: 0,
  next: { phaseId: 'phase2', phaseName: 'Pre-IND Engagement', taskId: 'phase2.complete', due: '2027-01-12' }, status: 'on-track', ...over });
const INDCLOCK = { authority: 'FDA', basis: '21 CFR 312.40', days: 30, ends: '2027-07-04', label: 'Study may proceed', caveat: '', clockStops: false, milestones: [] };
const MDUFA = { authority: 'FDA (CDRH)', basis: 'FD&C Act §510(k)', days: 90, ends: '2027-07-29', label: 'MDUFA decision', caveat: '', clockStops: true, milestones: [] };

const PROJECTS = [
  { programId: 'p-ind', code: 'C2C-101', label: 'C2C-101 anti-IL-23' },
  { programId: 'p-510k', code: 'WALK-510K', label: 'Walk 510(k)' },
  { programId: 'p-late', code: 'BX-204', label: 'BX-204' },
  { programId: 'p-notarget', code: 'NT-1', label: 'No target' },
  { programId: 'p-noplan', code: 'CA-9', label: 'Canada NDS' },
];
const LINES: Record<string, unknown> = {
  'p-ind': { type: 'IND', filing: 'us_ind', target: '2027-06-04', start: '2026-09-01', reviewClock: INDCLOCK, summary: summary() },
  'p-510k': { type: '510K', filing: 'us_510k', target: '2027-04-30', start: '2027-04-08', reviewClock: MDUFA, summary: summary({ status: 'blocked', blocked: 1, next: null }) },
  'p-late': { type: 'NDA', filing: 'us_nda', target: '2027-02-01', start: '2026-03-02', reviewClock: null, summary: summary({ status: 'at-risk', overdue: 21 }) },
  'p-notarget': { type: 'IND', filing: 'us_ind', target: null, start: null, reviewClock: null, summary: summary({ status: 'unscheduled' }) },
  'p-noplan': { type: null, filing: 'ca_nds' },
};
let batch: 'ok' | 'fail';

beforeEach(() => {
  batch = 'ok';
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (String(url).startsWith('/api/v1/pyramids/by-project?refs=')) {
      return batch === 'ok' ? ok({ success: true, data: { asOf: '2026-11-09', lines: LINES } }) : fail();
    }
    if (String(url).includes('/api/insights-canvas/overview')) return ok(overview());
    return ok({});
  });
});
afterEach(cleanup);

const projects = PROJECTS.map((p) => ({ programId: p.programId, name: p.code }));
const rows = () => Array.from(document.querySelectorAll('[data-testid="global-schedule-row"]')) as HTMLElement[];

describe('GlobalSchedule', () => {
  it('reads every project once, for the whole chart', async () => {
    render(<GlobalSchedule projects={projects} />);
    await waitFor(() => expect(rows().length).toBeGreaterThan(0));
    const reads = apiRequest.mock.calls.filter(([, u]) => String(u).startsWith('/api/v1/pyramids/by-project'));
    expect(reads).toHaveLength(1);
    expect(decodeURIComponent(String(reads[0][1]).split('refs=')[1]).split(',')).toEqual(PROJECTS.map((p) => p.programId));
  });

  it('draws one row per scheduled project, sorted by target date, each saying its filing, agency and where its plan stands', async () => {
    render(<GlobalSchedule projects={projects} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(rows().map((r) => r.querySelector('.py-gs-name')?.textContent)).toEqual(['BX-204', 'WALK-510K', 'C2C-101']);
    const ind = rows()[2];
    expect(ind.textContent).toMatch(/IND/);
    expect(ind.textContent).toMatch(/On schedule · Pre-IND Engagement by Jan 12, 2027/);
    expect(rows()[0].textContent).toMatch(/21 tasks past due/);
    expect(rows()[0].querySelector('[data-tone="warn"]')).not.toBeNull();
    expect(rows()[1].textContent).toMatch(/FDA \(CDRH\)/);
  });

  it("marks the filing date and the agency's clock in words a reader can reach, from the read's dates only", async () => {
    render(<GlobalSchedule projects={projects} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    const ind = rows()[2];
    const marks = Array.from(ind.querySelectorAll('.py-line-dot')).map((d) => d.getAttribute('aria-label'));
    expect(marks).toContain('Submission (target date), Jun 4, 2027');
    expect(marks).toContain('Study may proceed (day 30), Jul 4, 2027');
    expect(marks).toContain('Pre-IND Engagement complete, Jan 12, 2027');
    expect(ind.querySelector('.py-line-clock')).not.toBeNull();
    // No clock is held for this NDA here: none is drawn, and none is invented.
    expect(rows()[0].querySelector('.py-line-clock')).toBeNull();
    expect(Array.from(rows()[0].querySelectorAll('.py-line-dot')).map((d) => d.getAttribute('data-kind'))).not.toContain('decision');
  });

  it('puts every row on one axis: a later date is further right in every row', async () => {
    render(<GlobalSchedule projects={projects} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    const left = (row: HTMLElement, kind: string) => parseFloat((row.querySelector(`.py-line-dot[data-kind="${kind}"]`) as HTMLElement).style.left);
    // BX-204 files Feb 1, 2027; C2C-101 Jun 4, 2027; the 510(k) Apr 30, 2027.
    expect(left(rows()[0], 'submission')).toBeLessThan(left(rows()[1], 'submission'));
    expect(left(rows()[1], 'submission')).toBeLessThan(left(rows()[2], 'submission'));
    // Today is the same mark in every row.
    const today = rows().map((r) => (r.querySelector('.py-line-today') as HTMLElement).style.left);
    expect(new Set(today).size).toBe(1);
  });

  it('says why a project is not on the schedule, never leaving it out silently', async () => {
    render(<GlobalSchedule projects={projects} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    const off = screen.getByTestId('global-schedule-off').textContent ?? '';
    expect(off).toMatch(/NT-1 \(no target date\)/);
    expect(off).toMatch(/CA-9 \(no work breakdown for its filing\)/);
  });

  it('says a failed read, never an empty chart', async () => {
    batch = 'fail';
    render(<GlobalSchedule projects={projects} />);
    await screen.findByTestId('portfolio-lines-error');
    expect(rows()).toHaveLength(0);
  });

  it('opens a project from its row when asked to', async () => {
    const onOpen = vi.fn();
    render(<GlobalSchedule projects={projects} onOpen={onOpen} />);
    await waitFor(() => expect(rows()).toHaveLength(3));
    fireEvent.click(within(rows()[2]).getByRole('button', { name: 'C2C-101' }));
    expect(onOpen).toHaveBeenCalledWith('p-ind');
  });
});

function overview() {
  return {
    data: {
      organizationId: 1,
      dataScope: 'accessible_projects',
      tier: 'standard',
      tierResolved: true,
      segments: ['biotech'],
      leadProgram: {
        projectId: 1, code: 'C2C-101', label: 'C2C-101 anti-IL-23', filing: null, indication: null,
        readiness: 0, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 4,
      },
      programs: PROJECTS,
      portfolio: { entitled: false, requiredTier: 'enterprise', summary: null, programs: null },
    },
  };
}

describe('the global schedule in Reporting & analytics', () => {
  async function open() {
    render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="biotech" onNav={() => {}} />);
    await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
  }

  it('is offered among the suggestions and opens on every plan, not only Enterprise', async () => {
    await open();
    const group = screen.getByRole('group', { name: 'Find suggestions' });
    fireEvent.click(within(group).getByRole('button', { name: /When does each project file\?/ }));
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(document.querySelector('.ro-dash h2')?.textContent).toBe('Global schedule');
    expect(screen.getByTestId('rc-find-result').textContent).toMatch(/5 projects you can open/);
  });

  it('is reached from the find field by asking for the schedule or the timeline', async () => {
    await open();
    const field = document.querySelector('[data-work-area="insights"] .rc-find input') as HTMLInputElement;
    fireEvent.change(field, { target: { value: 'show the filing timeline' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(rows()).toHaveLength(3));
  });
});
