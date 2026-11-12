// @vitest-environment jsdom
/**
 * S11, THE_PROGRAM §8 item 1 and step 3's open item:
 *  - the Plan step opens with the project's regulatory strategy, part of the objective of record (one governed form,
 *    one write, a new version with a reason), read again wherever the record is shown;
 *  - "Use the schedule's date" moves an owner's task to the plan's date through tasking's governed reschedule.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null as null | { id: string; permissions: string[] } }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => auth }));

import { PlanStrategy, ProjectObjective } from '../surfaces/ProjectObjective';
import { buildRescheduleBody, UseScheduleDate, type PlanAssignment } from '../surfaces/PlanAssign';
import { MoveToSchedule } from '../surfaces/PyramidProject';

const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const PATH = `/api/charters/by-project/${PROGRAM}/objectives`;
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data, headers: new Headers() }) as Response;
const record = (strategy: string | null, version = 2) => ({ success: true, data: { charterId: 4, canChange: true,
  current: { content: { objective: 'File the IND for BX-204.', successCriteria: null, strategy, sources: [{ kind: 'protocol', title: 'Protocol BX-204-201' }] },
    version, updatedAt: '2026-11-09T10:00:00Z' },
  history: [{ version, eventType: 'updated', occurredAt: '2026-11-09T10:00:00Z', reason: 'r' }] } });
let stored: unknown;
let puts: Record<string, unknown>[];
beforeEach(() => {
  auth.user = null;
  puts = [];
  stored = record(null);
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (url === PATH && method === 'PUT') { puts.push(body ?? {}); stored = record(String(body?.strategy ?? '') || null, 3); return ok({ success: true, data: {} }); }
    if (url === PATH) return ok(stored);
    return ok({ success: true, data: {} });
  });
});
afterEach(cleanup);

describe('the strategy at the head of the Plan step', () => {
  it('says none is recorded, and offers to state it', async () => {
    render(<PlanStrategy programId={PROGRAM} canEdit />);
    const sec = await screen.findByTestId('pj-plan-strategy');
    expect(sec.textContent).toContain('No regulatory strategy is recorded yet: how this project will reach its objective.');
    expect(within(sec).getByRole('button', { name: 'State the strategy' })).toBeTruthy();
  });

  it('says there is no objective either, when nothing is recorded', async () => {
    stored = { success: true, data: { charterId: null, current: null, history: [], canChange: true } };
    render(<PlanStrategy programId={PROGRAM} canEdit />);
    expect((await screen.findByTestId('pj-plan-strategy')).textContent).toContain('No objective or regulatory strategy is recorded yet.');
  });

  it('shows the recorded strategy and the version it was recorded with', async () => {
    stored = record('505(b)(2), one pivotal study.');
    render(<PlanStrategy programId={PROGRAM} canEdit={false} />);
    const sec = await screen.findByTestId('pj-plan-strategy');
    expect(sec.querySelector('.pj-strategy-t')?.textContent).toBe('505(b)(2), one pivotal study.');
    expect(sec.textContent).toContain('Recorded with the objective, version 2, Nov 9, 2026.');
    // A reader is not offered the edit.
    expect(within(sec).queryByRole('button')).toBeNull();
  });

  it('says a failed read as a failure, never as no strategy', async () => {
    apiRequest.mockImplementation(async () => ok({ error: 'down' }, 503));
    render(<PlanStrategy programId={PROGRAM} canEdit />);
    expect((await screen.findByTestId('pj-plan-strategy')).textContent).toBe('The project’s regulatory strategy could not be read.'.replace('’', "'"));
  });

  it('records the strategy as a new version of the objective of record, keeping the objective and its sources, with the reason', async () => {
    render(<><ProjectObjective programId={PROGRAM} canEdit /><PlanStrategy programId={PROGRAM} canEdit /></>);
    const sec = await screen.findByTestId('pj-plan-strategy');
    fireEvent.click(within(sec).getByRole('button', { name: 'State the strategy' }));
    const drawer = await screen.findByRole('dialog');
    // The form is named for what the person came to state.
    expect(within(drawer).getByText("Record the project's regulatory strategy")).toBeTruthy();
    fireEvent.change(within(drawer).getByLabelText(/Regulatory strategy/), { target: { value: 'Priority review; rolling submission.' } });
    fireEvent.change(within(drawer).getByLabelText(/^Reason/), { target: { value: 'Agreed at the pre-IND meeting' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Record strategy' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ objective: 'File the IND for BX-204.', strategy: 'Priority review; rolling submission.',
      reason: 'Agreed at the pre-IND meeting', sources: [{ kind: 'protocol', title: 'Protocol BX-204-201' }] });
    // Both readers of the record read it again: the plan shows the strategy, the block under the name the new version.
    await waitFor(() => expect(screen.getByTestId('pj-plan-strategy').querySelector('.pj-strategy-t')?.textContent).toBe('Priority review; rolling submission.'));
    await waitFor(() => expect(document.querySelector('.pj-objective summary')?.textContent).toMatch(/^Version 3,/));
  });

  it('keeps a recorded strategy when the objective is edited from the block under the name', async () => {
    stored = record('Keep me.');
    render(<ProjectObjective programId={PROGRAM} canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Reason/), { target: { value: 'Reworded' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Record objective' }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].strategy).toBe('Keep me.');
  });
});

describe("Use the schedule's date", () => {
  const OWNER: PlanAssignment = { taskId: 'TASK-9', assigneeName: 'Dana Ruiz', dueDate: '2027-05-28T17:00:00.000Z', status: 'pending' };
  const mount = (onMoved = vi.fn()) => { render(<UseScheduleDate assignment={OWNER} scheduleDay="2027-06-04" scheduleWords="Jun 4, 2027" onMoved={onMoved} />); return onMoved; };
  const confirm = async (reason = 'The target date moved') => {
    fireEvent.click(screen.getByRole('button', { name: /Use the schedule.s date/ }));
    const drawer = await screen.findByRole('dialog');
    fireEvent.change(within(drawer).getByLabelText(/^Reason/), { target: { value: reason } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Change the due date' }));
  };

  it("sends tasking's governed reschedule: the schedule's day, the date shown, and the reason", async () => {
    const onMoved = mount();
    await confirm();
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    const [method, url, body] = apiRequest.mock.calls.find(([m]) => m === 'PATCH')!;
    expect([method, url]).toEqual(['PATCH', '/api/tasks/tasks/TASK-9']);
    expect(body).toMatchObject({ action: 'reschedule', expectedDueDate: '2027-05-28T17:00:00.000Z', reason: 'The target date moved' });
    expect(String(body.dueDate)).toMatch(/^2027-06-0[45]T/);
    expect(screen.getByRole('status').textContent).toBe('The task is now due Jun 4, 2027.');
  });

  it('says a refusal, with nothing changed, and does not claim the move', async () => {
    apiRequest.mockImplementation(async () => ok({ success: false, code: 'CONFLICT_STALE', error: 'This task changed. Reload its current assignment before trying again.' }, 409));
    const onMoved = mount();
    await confirm();
    expect((await screen.findByRole('alert')).textContent).toBe('The due date was not changed: This task changed. Reload its current assignment before trying again.');
    expect(onMoved).not.toHaveBeenCalled();
  });

  it('reads the task again when the save could not be confirmed', async () => {
    apiRequest.mockImplementation(async () => ok({ success: false, error: 'OUTCOME_UNKNOWN' }, 500));
    const onMoved = mount();
    await confirm();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be confirmed/);
    expect(onMoved).toHaveBeenCalled();
  });

  it('is not offered to a viewer', () => {
    auth.user = { id: '3', permissions: ['read'] };
    mount();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sends no expected date for a task that had none', () => {
    expect(buildRescheduleBody('2027-06-04', null, 'r')).toMatchObject({ action: 'reschedule', expectedDueDate: null, reason: 'r' });
  });

  it("is offered only where an unfinished owner's task is due on another day than the plan's", () => {
    const slot = { start: '2027-06-01', due: '2027-06-04', workingDays: 4, basis: 'typical-duration' as const };
    const offered = (owner: PlanAssignment | undefined, ownerDay: string | null) => {
      const { container, unmount } = render(<MoveToSchedule owner={owner} slot={slot} ownerDay={ownerDay} onMoved={vi.fn()} />);
      const shown = container.querySelector('button') !== null;
      unmount();
      return shown;
    };
    expect(offered(OWNER, '2027-05-28')).toBe(true);
    expect(offered(OWNER, '2027-06-04')).toBe(false);
    expect(offered({ ...OWNER, status: 'completed' }, '2027-05-28')).toBe(false);
    expect(offered(undefined, null)).toBe(false);
  });
});
