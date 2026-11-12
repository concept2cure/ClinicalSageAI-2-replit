// @vitest-environment jsdom
/**
 * The Plan step reaches the project-management engines that were built and never shown (P-122 §3.5, 2026-11-10):
 * section owners, deadlines and milestones (/api/project-sections/summary and /timeline), the project's milestone
 * tasks (/api/concept2cure/projects/:id/tasks, /tasks/summary, the milestone catalogue and its generator) and the
 * project hierarchy's roll-up (/api/project-hierarchy/:id/rollup). Each read is by the verified integer project id;
 * every figure is the server's; a failed read says so and is never drawn as none or 0.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { __resetSurfaceActionBus } from '../surfaceActions';

const PID = '5b2d7c11-2222-4333-8444-555566667777';
const PROJECT = 11;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) as unknown as Response;
const IND = { id: PID, name: 'BX-410', program_type: 'IND', primary_agency: 'FDA', product_type: 'drug', status: 'active', target_submission_date: '2027-05-09' };
const SUMMARY = {
  projectId: PROJECT, progress: 0,
  overall: { total: 2, completed: 0, active: 1, assigned: 1, overdue: 0 },
  modules: [],
  teamWorkload: [{ user_id: 7, user_name: 'Raj Patel', assigned_sections: '1', active_sections: '1', pending_hours: null }],
};
const TIMELINE = { projectId: PROJECT, totalSectionDeadlines: 1, totalMilestones: 1, events: [
  { date: '2026-11-20T00:00:00Z', type: 'section_deadline', title: 'm2.5: Clinical overview', status: 'drafting', metadata: { assignedTo: 'Raj Patel' } },
  { date: '2026-12-01T00:00:00Z', type: 'milestone', title: 'Pre-IND meeting', status: 'on_track', metadata: {} },
] };
const TASKS = [
  { id: 2, name: 'Pre-IND Briefing Document', status: 'todo', moduleType: 'document-prep', dueDate: '2026-12-15T00:00:00Z', metadata: { milestoneOrder: 2 } },
  { id: 1, name: 'Pre-IND Meeting Request', status: 'done', moduleType: 'regulatory', dueDate: '2026-11-15T00:00:00Z', metadata: { milestoneOrder: 1 } },
];
const ROLLUP = { projectId: PROJECT, rollup: { childCount: 2, childStatusSummary: { active: 2 }, totalTasks: 5, completedTasks: 1, blockedTasks: 1, overdueTasks: 2,
  aggregateProgress: 0, worstRiskLevel: 'medium' } };
const CATALOGUE = [{ name: 'Pre-IND Meeting Request', category: 'regulatory', order: 1 }, { name: 'IND Submission to FDA', category: 'submission', order: 2 }];

type Routes = Record<string, () => Response>;
function serve(over: Routes = {}) {
  const routes: Routes = {
    [`/api/project-sections/summary?project_id=${PROJECT}`]: () => ok(SUMMARY),
    [`/api/project-sections/timeline?project_id=${PROJECT}`]: () => ok(TIMELINE),
    [`/api/concept2cure/projects/${PROJECT}/tasks`]: () => ok({ success: true, data: TASKS, meta: { total: 2 } }),
    [`/api/concept2cure/projects/${PROJECT}/tasks/summary`]: () => ok({ success: true, data: { total: 2, completed: 1, overdue: 0, healthScore: 50, completionRate: 50 } }),
    [`/api/project-hierarchy/${PROJECT}/rollup`]: () => ok(ROLLUP),
    '/api/concept2cure/submission-milestones/IND': () => ok({ success: true, data: CATALOGUE }),
    ...over,
  };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'POST' && url === `/api/concept2cure/projects/${PROJECT}/tasks/bulk`) return ok({ success: true, data: [] });
    if (routes[url]) return routes[url]();
    if (url === `/api/c2c/projects/${PID}`) return ok(IND);
    if (url === `/api/c2c/projects/${PID}/team`) return ok({ program_id: PID, project_id: PROJECT, team: [] });
    if (url.startsWith('/api/authoring/docs')) return ok({ documents: [] });
    if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
    return ok({});
  });
}

const schedule = async () => {
  render(<ProjectHome surface={{ id: 'project-home', label: 'Project home' } as never} onAsk={vi.fn()} onNav={vi.fn()} segment="biopharma" />);
  return screen.findByTestId('pj-plan-schedule');
};

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-410' };
});
afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the Plan step shows section owners, deadlines and milestones', () => {
  it('owners and what each holds, and the dated sections and milestones, from the project\'s own id', async () => {
    serve();
    const section = within(await schedule()).getByTestId('pj-schedule-sections');
    await waitFor(() => expect(within(section).getByText('1 of 2 sections have an owner · 0 complete')).toBeTruthy());
    const owners = within(section).getByRole('list', { name: 'Section owners' });
    expect(owners.textContent).toContain('Raj Patel');
    expect(owners.textContent).toContain('1 open of 1 section');
    const dated = within(section).getByRole('list', { name: 'Deadlines and milestones' });
    expect(within(dated).getAllByRole('listitem').map((row) => row.querySelector('.pj-act-w')?.textContent)).toEqual(['m2.5: Clinical overview', 'Pre-IND meeting']);
    expect(dated.textContent).toContain('Section deadline · Raj Patel · Drafting');
    expect(dated.textContent).toContain('Milestone · On track');
  });

  it('no tracked section says so, and a failed read says it failed with a retry', async () => {
    serve({
      [`/api/project-sections/summary?project_id=${PROJECT}`]: () => ok({ ...SUMMARY, overall: { total: 0, completed: 0, assigned: 0, overdue: 0 }, teamWorkload: [] }),
      [`/api/project-sections/timeline?project_id=${PROJECT}`]: fail,
    });
    const section = within(await schedule()).getByTestId('pj-schedule-sections');
    await waitFor(() => expect(within(section).getByText('No CTD sections are tracked on this project yet.')).toBeTruthy());
    expect(within(section).getByText("The project's deadlines and milestones could not be read.")).toBeTruthy();
    expect(within(section).queryByText('No section deadline or milestone is recorded.')).toBeNull();
    expect(within(section).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('a reply without the engine\'s shape', () => {
  it('is a failed read, said in its place, and the rest of the page still renders', async () => {
    serve({ [`/api/project-sections/summary?project_id=${PROJECT}`]: () => ok({}), [`/api/project-hierarchy/${PROJECT}/rollup`]: () => ok({}) });
    const panel = await schedule();
    await waitFor(() => expect(within(panel).getByText("The project's section tracking could not be read.")).toBeTruthy());
    expect(within(panel).getByText("The project's roll-up could not be read.")).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What this IND needs' })).toBeTruthy();
  });
});

describe('the Plan step shows the milestone tasks', () => {
  it('in milestone order, with the server\'s counts', async () => {
    serve();
    const tasks = within(await schedule()).getByTestId('pj-schedule-milestones');
    await waitFor(() => expect(within(tasks).getByText('1 of 2 tasks done')).toBeTruthy());
    const rows = within(within(tasks).getByRole('list', { name: 'Milestone tasks' })).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.pj-act-w')?.textContent)).toEqual(['Pre-IND Meeting Request', 'Pre-IND Briefing Document']);
    expect(rows[0].textContent).toContain('Done');
  });

  it('with none, what the filing type\'s milestones are, and they are added only after the person confirms', async () => {
    serve({ [`/api/concept2cure/projects/${PROJECT}/tasks`]: () => ok({ success: true, data: [] }) });
    const tasks = within(await schedule()).getByTestId('pj-schedule-milestones');
    await waitFor(() => expect(within(tasks).getByText(/An IND's milestones: Pre-IND Meeting Request · IND Submission to FDA/)).toBeTruthy());
    expect(within(tasks).queryByText(/tasks done/)).toBeNull();
    fireEvent.click(within(tasks).getByRole('button', { name: 'Add the 2 IND milestones' }));
    expect(apiRequest).not.toHaveBeenCalledWith('POST', expect.anything(), expect.anything());
    expect(within(tasks).getByText(/Adds 2 tasks, one per milestone, due at even intervals from today to the target submission date/)).toBeTruthy();
    fireEvent.click(within(tasks).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', `/api/concept2cure/projects/${PROJECT}/tasks/bulk`, { submissionType: 'IND', targetDate: '2027-05-09' }));
  });
});

describe('the Plan step shows the project hierarchy\'s roll-up', () => {
  it('its work projects and the tasks across the hierarchy, as counted by the server, and no risk or progress figure', async () => {
    serve();
    const rollup = within(await schedule()).getByTestId('pj-schedule-rollup');
    await waitFor(() => expect(within(rollup).getByText('2 work projects: 2 Active.')).toBeTruthy());
    expect(within(rollup).getByText('Across the hierarchy: 1 of 5 tasks done · 1 blocked · 2 overdue.')).toBeTruthy();
    expect(rollup.textContent).not.toMatch(/medium|%/i);
  });

  it('a project with no verified record says why there is no schedule, and reads nothing for it', async () => {
    serve();
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === `/api/c2c/projects/${PID}`) return ok(IND);
      if (url === `/api/c2c/projects/${PID}/team`) return fail();
      if (url.startsWith('/api/authoring/docs')) return ok({ documents: [] });
      if (url.startsWith('/api/chat/threads')) return ok({ threads: [] });
      return ok({});
    });
    const section = await schedule();
    await waitFor(() => expect(within(section).getByText("This project's record could not be verified, so its schedule is not listed.")).toBeTruthy());
    expect(apiRequest.mock.calls.some(([, url]) => String(url).startsWith('/api/project-sections'))).toBe(false);
  });
});
