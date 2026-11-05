// @vitest-environment jsdom
/**
 * The project's program plan in its Plan step (S11, P-82): the filing's work
 * breakdown with this project's progress. A status is written to the project's
 * own route, reverted and said when refused; a filing with no work breakdown is
 * told so; a failed read is said, never an empty plan.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
import { ProjectProgramPlan } from '../surfaces/PyramidProject';

const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const PATH = `/api/v1/pyramids/by-project/${PROGRAM}`;
const ok = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data, headers: new Headers() }) as Response;
const task = (id: string, phase: string, over: Record<string, unknown> = {}) => ({
  id, phase, name: `Task ${id}`, role: 'regulatory', hours: 10, status: 'todo', critical: false, deps: [], ctd: [], ...over });
const PYRAMID = { id: 'IND', label: 'Investigational New Drug', phases: [
  { id: 'p1', order: 1, name: 'Strategy', weeks: 2 }, { id: 'p2', order: 2, name: 'Authoring', weeks: 6 }],
  tasks: [task('t1', 'p1', { critical: true }), task('t2', 'p2'), task('t3', 'p2', { critical: true })] };
let reads: unknown;
beforeEach(() => {
  reads = { success: true, data: { programId: PROGRAM, type: 'IND', label: 'Investigational New Drug', filing: 'us_ind', pyramid: PYRAMID, statuses: { t1: 'done' } } };
  apiRequest.mockReset();
  apiRequest.mockImplementation((method: string) => Promise.resolve(method === 'PATCH' ? ok({ success: true, data: {} }) : ok(reads)));
});
afterEach(() => cleanup());

const mount = () => render(<ProjectProgramPlan programId={PROGRAM} onNav={vi.fn()} onAsk={vi.fn()} />);

describe("the project's program plan", () => {
  it("reads the project's own pyramid and states its progress from the project's statuses", async () => {
    mount();
    await screen.findByRole('heading', { name: 'Program plan' });
    expect(apiRequest.mock.calls[0][1]).toBe(PATH);
    // From the first render that shows the plan: it never claims, even for a moment, that nothing is done.
    expect(document.querySelector('[data-testid="pj-program-plan"] .pj-desc')?.textContent)
      .toMatch(/^1 of 3 tasks done · critical path 50% done · about 20 hours of work remaining\./);
    expect(screen.getByText('The work breakdown: 2 phases, 3 tasks')).toBeTruthy();
  });

  it("records a task's status on the project's route", async () => {
    mount();
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    fireEvent.change(screen.getByLabelText('Status of Task t2'), { target: { value: 'in-progress' } });
    await waitFor(() => expect(apiRequest.mock.calls.some(([m]) => m === 'PATCH')).toBe(true));
    const [, path, body] = apiRequest.mock.calls.find(([m]) => m === 'PATCH')!;
    expect(path).toBe(`${PATH}/progress/t2`);
    expect(body).toEqual({ status: 'in-progress' });
  });

  it('reverts a refused status and says it was not saved', async () => {
    apiRequest.mockImplementation((method: string) => Promise.resolve(method === 'PATCH'
      ? ok({ error: { code: 'PROJECT_ARCHIVED', message: 'This project is archived.' } }, 403) : ok(reads)));
    mount();
    fireEvent.click(await screen.findByText('The work breakdown: 2 phases, 3 tasks'));
    const select = screen.getByLabelText('Status of Task t2') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'done' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/^The status was not saved/);
    expect(select.value).toBe('todo');
  });

  it('says a filing has no work breakdown, and invents none', async () => {
    reads = { success: true, data: { programId: PROGRAM, type: null, filing: 'ca_nds' } };
    mount();
    expect((await screen.findByTestId('pj-program-none')).textContent).toMatch(/This project.s filing \(ca_nds\) has none yet/);
    expect(screen.queryByRole('heading', { name: 'Program plan' })).toBeNull();
  });

  it('says the plan could not be read when the read fails', async () => {
    apiRequest.mockImplementation(() => Promise.resolve(ok({ error: 'down' }, 503)));
    mount();
    await screen.findByText("This project's program plan could not be read.");
  });
});
