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
 * F1, 2026-11-12 and -13: each row names its project and opens it. Every row of
 * the three reads carries the project it was recorded on and that project's
 * filing project, with the program a card on Projects opens (`project`; a
 * finding about several projects carries `projects`). The server resolves them
 * and names a filing project only when the person can open it. Pinned:
 *   - a row ends with its filing project's name as a link, which opens it by
 *     the program's id;
 *   - a row recorded on a work area inside a project says the work area too;
 *   - a finding about several projects names each filing project once;
 *   - a project the person cannot open, or one with no program, is named in
 *     words with no link; a row with no project says nothing;
 *   - the names are the rows' own: no other read is made, and a label an
 *     engine stored beside an id is never shown.
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
import { clearShellProject, readShellProject } from '../shellProject';

const ok = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as never;
const onNav = vi.fn();
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav, segment: 'biopharma' });
const ROW = { id: 'p-1', title: 'RR5 acceptance IND (synthetic)', ws: 'Biotech', code: 'RAIS', stage: 'Planning', readiness: null,
  status: 'active', lead: 'Rae Okafor', due: '—', due_date: null, activity: 'Updated Oct 30' };
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
const riskReads = () => apiRequest.mock.calls.map(([, u]) => String(u))
  .filter((u) => u.startsWith('/api/sentinel/') || u.startsWith('/api/submission-ops/'));

beforeEach(() => {
  try { window.localStorage.removeItem('c2c-v2-projects-view'); } catch { /* none */ }
  findings = () => ok(FINDINGS);
  blockers = () => ok({ data: [] });
  dueSoon = () => ok({ data: { canonicalTasks: [] }, source: 'c2c_project_work_items' });
  onNav.mockReset();
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/sentinel/findings')) return findings();
    if (url.startsWith('/api/submission-ops/blockers')) return blockers();
    if (url.startsWith('/api/submission-ops/due-soon')) return dueSoon();
    if (url === '/api/c2c/projects') return ok({ data: [ROW], meta: { counts: { total: 1, filingWithin60Days: 0, byWorkstream: {}, byPathway: {} } } });
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

async function ask() {
  render(<Projects {...props()} />);
  await screen.findByText('RR5 acceptance IND (synthetic)');
  expect(riskReads(), 'nothing is read before the person asks').toEqual([]);
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

/* The server's shape (server/services/c2c/program-project-anchor.ts NamedProject): the project a row was recorded
   on, and its filing project with the program a card opens. */
const RR5 = { id: 1, name: 'RR5 acceptance IND (synthetic)', root: { id: 1, name: 'RR5 acceptance IND (synthetic)', programId: 'p-1' } };
const VOR = { id: 2, name: 'Vorelinib NDA', root: { id: 2, name: 'Vorelinib NDA', programId: 'p-2' } };
/** A work area inside Vorelinib NDA: not a card on Projects. */
const VOR_CMC = { id: 21, name: 'CMC', root: VOR.root };
const VOR_STATS = { id: 22, name: 'Biostatistics', root: VOR.root };
const BLOCKER = { blockerId: 'b-1', projectId: 1, severity: 'critical', title: 'Stability data missing for 3.2.P.8',
  nextAction: 'Request the 6-month pull', ownerName: 'Lee Park', dueAt: '2026-11-14T00:00:00.000Z', status: 'open', project: RR5 };
const DUE = { work_item_id: 'w-1', project_id: 21, title: 'Draft the cover letter', owner_name: 'Rae Okafor', status: 'open',
  due_at: '2026-11-12T00:00:00.000Z', project: VOR_CMC };
const rowOf = async (panel: HTMLElement, list: string, text: string) => {
  const items = within(await within(panel).findByRole('list', { name: list })).getAllByRole('listitem');
  const row = items.find((li) => li.textContent?.includes(text));
  if (!row) throw new Error(`no row holding "${text}" in ${list}`);
  return row;
};
/** The last line of a row: where its projects are said. */
const projectLine = (row: HTMLElement) => row.querySelector(':scope > span:last-child')?.textContent ?? '';

describe('Projects: each at-risk row names its project and opens it (F1)', () => {
  beforeEach(() => {
    findings = () => ok({ ...FINDINGS, findings: FINDINGS.findings.map((f) => ({ ...f, project: RR5, projects: [RR5] })) });
    blockers = () => ok({ data: [BLOCKER] });
    dueSoon = () => ok({ data: { canonicalTasks: [DUE] }, source: 'c2c_project_work_items' });
  });

  it('names the filing project of a finding, a blocker and a due item, and makes no other read for it', async () => {
    const panel = await ask();
    const finding = await rowOf(panel, 'Risks Sentinel found', '11 overdue tasks');
    expect(within(finding).getByRole('button', { name: 'Open RR5 acceptance IND (synthetic)' }).textContent).toBe('RR5 acceptance IND (synthetic)');
    const blocker = await rowOf(panel, 'Blockers', 'Stability data missing');
    expect(within(blocker).getByRole('button', { name: 'Open RR5 acceptance IND (synthetic)' })).toBeTruthy();
    const dueRow = await rowOf(panel, 'Due or overdue in the next 7 days', 'Draft the cover letter');
    expect(within(dueRow).getByRole('button', { name: 'Open Vorelinib NDA' })).toBeTruthy();
    // The project list is read once, by Projects itself; the answer reads only its three engines.
    const reads = apiRequest.mock.calls.map(([, u]) => String(u));
    expect(reads.filter((u) => u.startsWith('/api/c2c/projects'))).toEqual(['/api/c2c/projects']);
    expect(riskReads()).toHaveLength(3);
  });

  it('opens the filing project from its row, by the program’s id', async () => {
    const panel = await ask();
    const dueRow = await rowOf(panel, 'Due or overdue in the next 7 days', 'Draft the cover letter');
    fireEvent.click(within(dueRow).getByRole('button', { name: 'Open Vorelinib NDA' }));
    expect(onNav).toHaveBeenCalledWith('project-home');
    expect(readShellProject()).toMatchObject({ id: 'p-2', title: 'Vorelinib NDA' });
  });

  it('says the work area a row was recorded on, beside its filing project', async () => {
    const panel = await ask();
    const dueRow = await rowOf(panel, 'Due or overdue in the next 7 days', 'Draft the cover letter');
    expect(projectLine(dueRow)).toBe('Vorelinib NDA (CMC)');
    const blocker = await rowOf(panel, 'Blockers', 'Stability data missing');
    expect(projectLine(blocker)).toBe('RR5 acceptance IND (synthetic)');
  });

  it('names each filing project of a cross-project finding once, and never a label stored beside an id', async () => {
    findings = () => ok({ findings: [{ finding_id: 'f-9', project_id: 1, analyzer_type: 'cross_project', severity: 'medium', status: 'open',
      title: 'Lee Park is spread across 4 active projects', summary: 'Resource over-allocation: 9 open tasks across 4 projects.',
      // Labels on the wrong ids, as the engine stored them until 2026-11-12: never shown.
      affected_items: [{ type: 'project', id: 1, label: 'A stored label that is wrong' }, { type: 'project', id: 21, label: 'Another wrong label' }],
      project: RR5, projects: [RR5, VOR_CMC, VOR_STATS, VOR], created_at: '2026-11-10T11:15:43.564Z' }], total: 1 });
    const panel = await ask();
    const row = await rowOf(panel, 'Risks Sentinel found', 'spread across 4 active projects');
    expect(within(row).getAllByRole('button').map((b) => b.textContent)).toEqual(['RR5 acceptance IND (synthetic)', 'Vorelinib NDA']);
    expect(projectLine(row)).toBe('RR5 acceptance IND (synthetic) · Vorelinib NDA (CMC, Biostatistics)');
    expect(row.textContent).not.toMatch(/stored label|wrong label/);
  });

  it('names a project the person cannot open, or one with no program, in words with no link', async () => {
    blockers = () => ok({ data: [
      { ...BLOCKER, blockerId: 'b-2', title: 'Method transfer report overdue', project: { id: 31, name: 'Quality', root: null } },
      { ...BLOCKER, blockerId: 'b-3', title: 'Vendor audit not scheduled', project: { id: 40, name: 'Vendor oversight', root: { id: 40, name: 'Vendor oversight', programId: null } } },
    ] });
    const panel = await ask();
    const workOnly = await rowOf(panel, 'Blockers', 'Method transfer report overdue');
    expect(within(workOnly).queryByRole('button')).toBeNull();
    expect(projectLine(workOnly)).toBe('Quality');
    const noProgram = await rowOf(panel, 'Blockers', 'Vendor audit not scheduled');
    expect(within(noProgram).queryByRole('button')).toBeNull();
    expect(projectLine(noProgram)).toBe('Vendor oversight');
  });

  it('says nothing about the project of a row that carries none, or carries something that is not one', async () => {
    blockers = () => ok({ data: [
      { ...BLOCKER, blockerId: 'b-4', title: 'Device master record not located', project: null },
      { ...BLOCKER, blockerId: 'b-5', title: 'Label copy not received', project: { id: 'x', name: 'A name with no project number' } },
      { ...BLOCKER, blockerId: 'b-6', title: 'An older server’s row', project: undefined },
      { ...BLOCKER, blockerId: 'b-7', title: 'Batch record review open', project: { id: 7, name: '   ' } },
    ] });
    const panel = await ask();
    for (const title of ['Device master record not located', 'Label copy not received', 'An older server’s row', 'Batch record review open']) {
      const row = await rowOf(panel, 'Blockers', title);
      expect(within(row).queryByRole('button')).toBeNull();
      expect(row.textContent).toBe(`Critical · ${title}Next: Request the 6-month pull · Lee Park · Due Nov 14`);
    }
    expect(within(panel).queryByRole('alert')).toBeNull();
  });
});
