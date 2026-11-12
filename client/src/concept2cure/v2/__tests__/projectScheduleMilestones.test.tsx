// @vitest-environment jsdom
/**
 * The Schedule records a milestone, moves its date and marks it done (P-122, 2026-11-10).
 *
 * "Section owners and deadlines" lists the project's milestones (GET /api/project-sections/timeline). A person who may
 * change the project records one there ("Record a milestone": name, due date, optional linked CTD sections; POST
 * /api/project-sections/milestones), and moves an open one's date or marks it done ("Update"; PATCH
 * /api/project-sections/milestones/:id). Both go through the existing form drawer (C2CForm); the list is read again
 * after a change, never patched in the browser. A refusal keeps the drawer open and says nothing was changed. A person
 * who may not change the project is offered neither.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectSchedule } from '../surfaces/ProjectSchedule';

const PROJECT = 11;
const TIMELINE_URL = `/api/project-sections/timeline?project_id=${PROJECT}`;
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const SUMMARY = { overall: { total: 2, completed: 0, assigned: 1, overdue: 0 }, teamWorkload: [] };
const TIMELINE = { events: [
  { date: '2026-11-20T00:00:00.000Z', type: 'section_deadline', title: 'm2.5: Clinical overview', status: 'drafting', metadata: { sectionCode: 'm2.5', assignedTo: 'Raj Patel' } },
  { date: '2026-12-01T00:00:00.000Z', type: 'milestone', title: 'Pre-IND meeting', status: 'on_track', metadata: { milestoneId: 31, linkedSections: ['m1.2', 'm2.5'], completedAt: null } },
  { date: '2026-12-20T00:00:00.000Z', type: 'milestone', title: 'Briefing package sent', status: 'completed', metadata: { milestoneId: 32, linkedSections: [], completedAt: '2026-11-09T10:00:00.000Z' } },
] };

let writes: Array<[string, string, unknown]>;
let refuse: Response | null;
/** Set to hold every timeline read after a write until it is released. */
let hold: Promise<void> | null;
function serve() {
  writes = [];
  refuse = null;
  hold = null;
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method !== 'GET') {
      writes.push([method, url, body]);
      return refuse ?? json(200, { success: true, milestone: { id: 40 } });
    }
    if (url === `/api/project-sections/summary?project_id=${PROJECT}`) return json(200, SUMMARY);
    if (url === TIMELINE_URL) {
      if (hold && writes.length) await hold;
      return json(200, TIMELINE);
    }
    if (url === `/api/concept2cure/projects/${PROJECT}/tasks`) return json(200, { success: true, data: [] });
    if (url === `/api/project-hierarchy/${PROJECT}/rollup`) return json(200, { rollup: null });
    return json(200, {});
  });
}
const timelineReads = () => apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === TIMELINE_URL).length;

async function sections(canChange = true) {
  render(<ProjectSchedule projectId={PROJECT} unverified={null} filingType="IND" targetDate="2027-05-09" canChange={canChange} />);
  const module = screen.getByTestId('pj-schedule-sections');
  await waitFor(() => expect(within(module).getByRole('list', { name: 'Deadlines and milestones' })).toBeTruthy());
  return module;
}
const dialog = () => screen.getByRole('dialog');
/* A required field's label carries its marker ("Name*"), so a field is found by its label's start. */
const field = (label: string) => within(dialog()).getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });

beforeEach(() => { apiRequest.mockReset(); serve(); });
afterEach(cleanup);

describe('Record a milestone', () => {
  it('records it with its name, due date and linked sections, for this project, and reads the list again', async () => {
    const module = await sections();
    const before = timelineReads();
    fireEvent.click(within(module).getByRole('button', { name: 'Record a milestone' }));
    expect(field('Name')).toBeTruthy();
    type('Name', 'Pre-IND briefing package sent');
    type('Due date', '2027-01-08');
    type('Linked CTD sections', '1.2, 2.5 3.2.s.4');
    expect(dialog().textContent).toContain('Reads as 1.2, 2.5, 3.2.S.4.');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(writes).toEqual([['POST', '/api/project-sections/milestones', {
      project_id: PROJECT, name: 'Pre-IND briefing package sent', target_date: '2027-01-08', linked_sections: ['m1.2', 'm2.5', 'm3.2.S.4'],
    }]]);
    await waitFor(() => expect(timelineReads()).toBeGreaterThan(before));
    expect(await screen.findByText('Milestone "Pre-IND briefing package sent" recorded.')).toBeTruthy();
  });

  it('keeps the list, and the button that opened the drawer, on screen while the list is read again', async () => {
    const module = await sections();
    let release = () => {};
    hold = new Promise<void>((resolve) => { release = resolve; });
    fireEvent.click(within(module).getByRole('button', { name: 'Record a milestone' }));
    type('Name', 'IND submitted');
    type('Due date', '2027-05-09');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === TIMELINE_URL).length).toBe(2));
    expect(within(module).getByRole('list', { name: 'Deadlines and milestones' })).toBeTruthy();
    expect(within(module).getByRole('button', { name: 'Record a milestone' })).toBeTruthy();
    expect(within(module).queryByText("Reading the project's deadlines and milestones…")).toBeNull();
    release();
  });

  it('sends no linked sections when none are given, and needs a name and a due date', async () => {
    const module = await sections();
    fireEvent.click(within(module).getByRole('button', { name: 'Record a milestone' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    expect(within(dialog()).getByRole('alert').textContent).toContain('Complete the required fields: Name, Due date');
    type('Name', 'IND submitted');
    type('Due date', '2027-05-09');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0][2]).toEqual({ project_id: PROJECT, name: 'IND submitted', target_date: '2027-05-09', linked_sections: [] });
  });

  it('refuses a linked section that is not a CTD section number, and sends nothing', async () => {
    const module = await sections();
    fireEvent.click(within(module).getByRole('button', { name: 'Record a milestone' }));
    type('Name', 'Module 2 drafted');
    type('Due date', '2027-02-01');
    type('Linked CTD sections', '2.5, clinical');
    expect(dialog().textContent).toContain('"clinical" is not a CTD section number');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    expect(dialog().textContent).toContain('Nothing was recorded');
    expect(writes).toEqual([]);
  });

  it('a refused record keeps the drawer open, says why, and says nothing was recorded', async () => {
    const module = await sections();
    refuse = json(403, { error: 'Your current role and project permissions do not allow changes to this record.', code: 'PROJECT_WRITE_PERMISSION_DENIED' });
    fireEvent.click(within(module).getByRole('button', { name: 'Record a milestone' }));
    type('Name', 'Module 2 drafted');
    type('Due date', '2027-02-01');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Record milestone/ }));
    await waitFor(() => expect(dialog().textContent).toContain('Nothing was recorded'));
    expect(dialog().textContent).toContain('do not allow changes to this record');
  });
});

describe('Update a milestone', () => {
  it('moves an open milestone\'s date', async () => {
    const module = await sections();
    const row = within(module).getAllByRole('listitem').find((r) => r.textContent?.includes('Pre-IND meeting'))!;
    expect(row.textContent).toContain('Sections 1.2, 2.5');
    fireEvent.click(within(row).getByRole('button', { name: 'Update Pre-IND meeting' }));
    expect(field('Due date').value).toBe('2026-12-01');
    type('Due date', '2026-12-15');
    fireEvent.click(within(dialog()).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(writes).toEqual([['PATCH', '/api/project-sections/milestones/31', { target_date: '2026-12-15' }]]));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('marks it done', async () => {
    const module = await sections();
    fireEvent.click(within(module).getByRole('button', { name: 'Update Pre-IND meeting' }));
    fireEvent.click(within(dialog()).getByRole('radio', { name: 'Done' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(writes).toEqual([['PATCH', '/api/project-sections/milestones/31', { status: 'completed' }]]));
  });

  it('a done milestone and a section deadline offer no update', async () => {
    const module = await sections();
    expect(within(module).queryByRole('button', { name: 'Update Briefing package sent' })).toBeNull();
    expect(within(module).queryByRole('button', { name: /Update m2\.5/ })).toBeNull();
    expect(within(module).getAllByRole('button', { name: /^Update / })).toHaveLength(1);
  });
});

describe('a person who may not change the project', () => {
  it('is offered neither control', async () => {
    const module = await sections(false);
    expect(within(module).queryByRole('button', { name: 'Record a milestone' })).toBeNull();
    expect(within(module).queryByRole('button', { name: /^Update / })).toBeNull();
  });
});
