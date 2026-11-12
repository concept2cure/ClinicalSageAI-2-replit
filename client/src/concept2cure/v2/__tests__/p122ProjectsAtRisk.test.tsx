// @vitest-environment jsdom
/**
 * P-122 §3 item 2 (2026-11-10): "Which projects are at risk this week?" is one
 * click on Projects, and the server's risk engines answer it, never the browser.
 *
 * WHY THIS EXISTS
 * 78842ee08 (D2-1) removed the header's "Ask AnA: Which projects are at risk this
 * week?". It had sent the question to the model with no risk data at all. The
 * engines that can answer it run on the server: Sentinel's analyzers (deadline
 * risk, cross-project conflicts, quality drift) write `sentinel_findings`, and the
 * submission operations register holds blockers and the work due within 7 days.
 * None had a client caller, and production refused them until 280035bd9 admitted
 * GET /api/sentinel/findings, /api/submission-ops/blockers and /due-soon for
 * Projects, each limited to the projects the person can open.
 *
 * WHAT IS PINNED
 *   - nothing is read until the person asks; one click reads the three engines;
 *   - each answer lists what its engine returned, in words, in the server's order;
 *   - an empty answer names what was looked at ("No blockers recorded"), never
 *     "no risk"; a failed read is said, never shown as an empty answer;
 *   - the browser counts nothing: the one figure shown is Sentinel's own total.
 *
 * F1, 2026-11-12: each row names its project and opens it. The rows carry the
 * numeric id of a project; the project list carries it as `project_id`. Pinned:
 *   - the names come from the whole list, read only when the person asks, not
 *     from the filtered page Projects shows;
 *   - a row opens its project through the one opener Projects has, by the
 *     program's id, never by the number;
 *   - a finding about several projects names each, and never by the label the
 *     engine stored beside an id;
 *   - a row whose project the list does not hold gets no name and no reason;
 *   - a failed read of the list is said once, and the three answers still stand.
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
  useAuthUser: () => ({ id: 7, organizationId: 5 }),
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Projects } from '../surfaces/Projects';
import { PALETTE_PROJECTS_URL } from '../paletteProjects';
import { clearShellProject, readShellProject } from '../shellProject';

const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as never;
const onNav = vi.fn();
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav, segment: 'biopharma' });
/** `id` is the program's; `project_id` is the number the risk rows carry. */
const ROW = { id: 'p-1', project_id: 1, title: 'RR5 acceptance IND (synthetic)', ws: 'Biotech', code: 'RAIS', stage: 'Planning', readiness: null,
  status: 'active', lead: 'Rae Okafor', due: '—', due_date: null, activity: 'Updated Oct 30' };
const OTHER = { ...ROW, id: 'p-2', project_id: 2, title: 'Vorelinib NDA', code: 'VOR' };
const FINDINGS = {
  findings: [
    { finding_id: 'f-1', project_id: 1, analyzer_type: 'deadline_risk', severity: 'high', status: 'open',
      title: '11 overdue tasks in "RR5 acceptance IND (synthetic)"', summary: 'Eleven tasks are past their due date.', created_at: '2026-11-10T11:15:43.564Z' },
    { finding_id: 'f-2', project_id: 1, analyzer_type: 'quality_drift', severity: 'medium', status: 'open',
      title: 'Quality drift: "RR5 acceptance IND (synthetic)" at 45% task completion', summary: 'Completion is behind plan.', created_at: '2026-10-30T09:22:03.668Z' },
  ],
  total: 7,
};
let findings: () => unknown;
let blockers: () => unknown;
let dueSoon: () => unknown;
/** The whole list, which the answer reads for its rows' names. */
let projectNames: () => unknown;
const listReads = () => apiRequest.mock.calls.map(([, u]) => String(u)).filter((u) => u === PALETTE_PROJECTS_URL);
const riskReads = () => apiRequest.mock.calls.map(([, u]) => String(u))
  .filter((u) => u.startsWith('/api/sentinel/') || u.startsWith('/api/submission-ops/'));

beforeEach(() => {
  try { window.localStorage.removeItem('c2c-v2-projects-view'); } catch { /* none */ }
  findings = () => ok(FINDINGS);
  blockers = () => ok({ data: [] });
  dueSoon = () => ok({ data: { canonicalTasks: [] }, source: 'c2c_project_work_items' });
  projectNames = () => ok({ data: [ROW, OTHER], meta: { count: 2, hasMore: false } });
  onNav.mockReset();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/sentinel/findings')) return findings();
    if (url.startsWith('/api/submission-ops/blockers')) return blockers();
    if (url.startsWith('/api/submission-ops/due-soon')) return dueSoon();
    if (url === PALETTE_PROJECTS_URL) return projectNames();
    if (url === '/api/c2c/projects') return ok({ data: [ROW], meta: { counts: { total: 1, filingWithin60Days: 0, byWorkstream: {}, byPathway: {} } } });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

async function ask() {
  render(<Projects {...props()} />);
  await screen.findByText('RR5 acceptance IND (synthetic)');
  expect(riskReads(), 'nothing is read before the person asks').toEqual([]);
  expect(listReads(), 'the whole list is not read before the person asks').toEqual([]);
  const button = screen.getByRole('button', { name: 'Which projects are at risk this week?' });
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  return screen.findByRole('region', { name: 'Which projects are at risk this week' });
}

describe('Projects: which projects are at risk this week, answered by the server (P-122 §3.2)', () => {
  it('one click reads Sentinel’s open findings, the blockers and the work due within 7 days', async () => {
    const panel = await ask();
    await waitFor(() => expect(riskReads().sort()).toEqual([
      '/api/sentinel/findings?status=open&limit=20', '/api/submission-ops/blockers', '/api/submission-ops/due-soon',
    ]));
    const found = await within(panel).findByRole('list', { name: 'Risks Sentinel found' });
    const items = within(found).getAllByRole('listitem').map((li) => li.textContent);
    expect(items[0]).toContain('High · Deadline risk');
    expect(items[0]).toContain('11 overdue tasks in "RR5 acceptance IND (synthetic)"');
    expect(items[0]).toContain('Eleven tasks are past their due date.');
    expect(items[1]).toContain('Medium · Quality drift');
    // Sentinel's own total, not a count of the rows shown.
    expect(within(panel).getByText(/2 of 7 open findings, most severe first/)).toBeTruthy();
  });

  it('an empty register says what was looked at, never "no risk"', async () => {
    const panel = await ask();
    expect(await within(panel).findByText('No blockers recorded.')).toBeTruthy();
    expect(await within(panel).findByText('Nothing is due or overdue in the next 7 days.')).toBeTruthy();
    expect(panel.textContent).not.toMatch(/no risk|not at risk|all clear/i);
  });

  it('lists the blockers and the due work the server returned', async () => {
    blockers = () => ok({ data: [{ blockerId: 'b-1', projectId: 1, severity: 'critical', title: 'Stability data missing for 3.2.P.8',
      nextAction: 'Request the 6-month pull', ownerName: 'Lee Park', dueAt: '2026-11-14T00:00:00.000Z', status: 'open' }] });
    dueSoon = () => ok({ data: { canonicalTasks: [{ work_item_id: 'w-1', project_id: 1, title: 'Draft the cover letter',
      owner_name: 'Rae Okafor', status: 'open', due_at: '2026-11-12T00:00:00.000Z' }] }, source: 'c2c_project_work_items' });
    const panel = await ask();
    const blocked = await within(panel).findByRole('list', { name: 'Blockers' });
    expect(blocked.textContent).toContain('Critical · Stability data missing for 3.2.P.8');
    expect(blocked.textContent).toContain('Next: Request the 6-month pull');
    expect(blocked.textContent).toContain('Lee Park');
    const due = await within(panel).findByRole('list', { name: 'Due or overdue in the next 7 days' });
    expect(due.textContent).toContain('Draft the cover letter');
    expect(due.textContent).toContain('Rae Okafor');
    expect(due.textContent).toContain('Nov 12');
  });

  it('a failed read is said, never shown as an empty answer', async () => {
    findings = () => ok({ error: 'down' }, 500);
    blockers = () => ok({ error: 'down' }, 503);
    const panel = await ask();
    expect(await within(panel).findByText(/Sentinel’s findings could not be read/)).toBeTruthy();
    expect(await within(panel).findByText(/The blockers could not be read/)).toBeTruthy();
    expect(within(panel).queryByText('No blockers recorded.')).toBeNull();
    expect(panel.textContent).not.toMatch(/no open findings/i);
  });

  it('closes, and asks again on the next click', async () => {
    await ask();
    fireEvent.click(screen.getByRole('button', { name: 'Close the risk answer' }));
    expect(screen.queryByRole('region', { name: 'Which projects are at risk this week' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Which projects are at risk this week?' }).getAttribute('aria-expanded')).toBe('false');
  });
});

const BLOCKER = { blockerId: 'b-1', projectId: 1, severity: 'critical', title: 'Stability data missing for 3.2.P.8',
  nextAction: 'Request the 6-month pull', ownerName: 'Lee Park', dueAt: '2026-11-14T00:00:00.000Z', status: 'open' };
const DUE = { work_item_id: 'w-1', project_id: 2, title: 'Draft the cover letter', owner_name: 'Rae Okafor', status: 'open',
  due_at: '2026-11-12T00:00:00.000Z' };
const rowOf = async (panel: HTMLElement, list: string, text: string) => {
  const items = within(await within(panel).findByRole('list', { name: list })).getAllByRole('listitem');
  const row = items.find((li) => li.textContent?.includes(text));
  if (!row) throw new Error(`no row holding "${text}" in ${list}`);
  return row;
};

describe('Projects: each at-risk row names its project and opens it (F1, 2026-11-12)', () => {
  beforeEach(() => {
    blockers = () => ok({ data: [BLOCKER] });
    dueSoon = () => ok({ data: { canonicalTasks: [DUE] }, source: 'c2c_project_work_items' });
  });

  it('reads the names from the whole list, once the person asks', async () => {
    await ask();
    await waitFor(() => expect(listReads()).toEqual([PALETTE_PROJECTS_URL]));
  });

  it('names the project of a finding, a blocker and a due item', async () => {
    const panel = await ask();
    const finding = await rowOf(panel, 'Risks Sentinel found', '11 overdue tasks');
    expect(await within(finding).findByRole('button', { name: 'Open RR5 acceptance IND (synthetic)' })).toBeTruthy();
    const blocker = await rowOf(panel, 'Blockers', 'Stability data missing');
    expect(within(blocker).getByRole('button', { name: 'Open RR5 acceptance IND (synthetic)' }).textContent).toBe('RR5 acceptance IND (synthetic)');
    const dueRow = await rowOf(panel, 'Due or overdue in the next 7 days', 'Draft the cover letter');
    expect(within(dueRow).getByRole('button', { name: 'Open Vorelinib NDA' })).toBeTruthy();
  });

  it('opens the project from its row, by the program’s id and never by the number', async () => {
    const panel = await ask();
    const dueRow = await rowOf(panel, 'Due or overdue in the next 7 days', 'Draft the cover letter');
    fireEvent.click(await within(dueRow).findByRole('button', { name: 'Open Vorelinib NDA' }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    expect(readShellProject()).toMatchObject({ id: 'p-2', title: 'Vorelinib NDA', code: 'VOR' });
  });

  it('names every project a cross-project finding is about, and never the label stored beside an id', async () => {
    findings = () => ok({ findings: [{ finding_id: 'f-9', project_id: 1, analyzer_type: 'cross_project', severity: 'medium', status: 'open',
      title: 'Lee Park is spread across 4 active projects', summary: 'Resource over-allocation: 9 open tasks across 4 projects.',
      // The engine paired these labels with the wrong ids; the list's own names are the ones shown.
      affected_items: [{ type: 'project', id: 1, label: 'Vorelinib NDA' }, { type: 'project', id: 2, label: 'RR5 acceptance IND (synthetic)' },
        { type: 'task', id: 2, label: 'a task, not a project' }],
      created_at: '2026-11-10T11:15:43.564Z' }], total: 1 });
    const panel = await ask();
    const row = await rowOf(panel, 'Risks Sentinel found', 'spread across 4 active projects');
    const names = (await within(row).findAllByRole('button')).map((b) => b.textContent);
    expect(names).toEqual(['RR5 acceptance IND (synthetic)', 'Vorelinib NDA']);
    fireEvent.click(within(row).getByRole('button', { name: 'Open Vorelinib NDA' }));
    expect(readShellProject()).toMatchObject({ id: 'p-2' });
  });

  it('gives a row whose project the list does not hold no name and no reason', async () => {
    blockers = () => ok({ data: [BLOCKER, { ...BLOCKER, blockerId: 'b-2', projectId: 99, title: 'Device master record not located' }] });
    const panel = await ask();
    const known = await rowOf(panel, 'Blockers', 'Stability data missing');
    await within(known).findByRole('button', { name: 'Open RR5 acceptance IND (synthetic)' });
    const unknown = await rowOf(panel, 'Blockers', 'Device master record not located');
    expect(within(unknown).queryByRole('button')).toBeNull();
    expect(unknown.textContent).toBe('Critical · Device master record not locatedNext: Request the 6-month pull · Lee Park · Due Nov 14');
  });

  it('says a failed read of the project list once, and still gives the three answers', async () => {
    projectNames = () => ok({ error: 'down' }, 500);
    const panel = await ask();
    expect(await within(panel).findByText(/The project list could not be read, so the rows below do not name their projects/)).toBeTruthy();
    const blocker = await rowOf(panel, 'Blockers', 'Stability data missing');
    expect(within(blocker).queryByRole('button')).toBeNull();
    expect(within(panel).getAllByRole('alert')).toHaveLength(1);
    expect(await rowOf(panel, 'Risks Sentinel found', '11 overdue tasks')).toBeTruthy();
  });

  it('does not make a card with no project number, or a number with no card, into a name', async () => {
    // An older server's card carries no project_id: it names nothing, and the read is not a failure.
    projectNames = () => ok({ data: [{ ...ROW, project_id: undefined }, { ...OTHER, project_id: '2' }], meta: { count: 2 } });
    const panel = await ask();
    const blocker = await rowOf(panel, 'Blockers', 'Stability data missing');
    await waitFor(() => expect(listReads()).toHaveLength(1));
    expect(within(blocker).queryByRole('button')).toBeNull();
    expect(within(panel).queryByRole('alert')).toBeNull();
  });
});
