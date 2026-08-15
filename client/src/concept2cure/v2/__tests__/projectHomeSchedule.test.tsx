// @vitest-environment jsdom
/**
 * ProjectHome — the plan stage's Schedule panel.
 *
 * The panel renders AnA's real schedule of events
 * (GET /api/concept2cure/projects/:id/schedule-of-events — plan header +
 * milestones reusing project_workflow_stages) and never a fixture.
 *
 * The behaviour these tests pin is mostly about honesty:
 *   - live milestones render exactly what the store holds (status, due date,
 *     regulatory basis, owner role) — no invented progress, no invented dates;
 *   - a project with no generated schedule says so, and offers only REAL
 *     affordances (the AnA composer prompt + the real POST generate endpoint);
 *   - a UUID-keyed program — whose id-space the numeric schedule store cannot
 *     resolve — gets the honest id-space empty and NO doomed fetch;
 *   - a failed read says so instead of rendering as "no schedule".
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

/** Numeric-keyed ident — the id-space the schedule store actually resolves. */
const NUM_PID = 'proj_12';
const SCHED_URL = `/api/concept2cure/projects/${NUM_PID}/schedule-of-events`;
/** The normal v2 case: a regulatory_programs UUID. */
const UUID_PID = '11111111-1111-4111-8111-111111111111';

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

function milestone(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    key: 'pre_ind_meeting',
    title: 'Pre-IND meeting',
    status: 'not_started',
    targetDate: '2026-11-02T00:00:00Z',
    isCritical: true,
    regulatoryBasis: '21 CFR 312.82',
    ownerRole: 'Regulatory lead',
    slipDays: null,
    ...over,
  };
}

function view(over: Record<string, unknown> = {}) {
  return {
    plan: {
      regulatoryFramework: 'FDA IND',
      version: 2,
      targetDate: '2027-03-01T00:00:00Z',
      confidence: 'moderate',
    },
    milestones: [milestone()],
    goals: [],
    revisions: [],
    health: { overallStatus: 'on_track', summary: 'All milestones on track.' },
    ...over,
  };
}

const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

/** Route every ProjectHome read; only the schedule read carries a payload. */
function mockApi(scheduleResponse: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === SCHED_URL) return scheduleResponse();
    return ok({});
  });
}

/** The Schedule panel lives in the 'plan' lifecycle stage. */
function openPlanStage() {
  fireEvent.click(screen.getByTitle('Strategy, precedent, agency meetings & timeline'));
}

afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

describe('ProjectHome — schedule of events (numeric-keyed project)', () => {
  beforeEach(() => {
    (window as any).C2C_PROJECT = { id: NUM_PID, title: 'BX-301' };
  });

  it('renders the real milestones with due date, regulatory basis and owner role', async () => {
    mockApi(() => ok(view()));
    render(<ProjectHome {...props()} />);
    openPlanStage();

    expect(await screen.findByText('Pre-IND meeting')).toBeTruthy();
    // Every displayed value is the store's own: basis, owner, status, due date.
    expect(screen.getByText(/21 CFR 312\.82/)).toBeTruthy();
    expect(screen.getByText(/Regulatory lead/)).toBeTruthy();
    expect(screen.getByText('not started')).toBeTruthy();
    expect(document.body.textContent).toMatch(/Nov 2, 2026/);
    // Plan header facts, from the plan row itself.
    expect(document.body.textContent).toMatch(/FDA IND · v2/);
    expect(screen.getByText('All milestones on track.')).toBeTruthy();
  });

  it('shows no fabricated date for a milestone whose due date is not set', async () => {
    mockApi(() => ok(view({ milestones: [milestone({ targetDate: null })] })));
    render(<ProjectHome {...props()} />);
    openPlanStage();

    await screen.findByText('Pre-IND meeting');
    expect(screen.getByText(/no due date/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Nov 2, 2026/);
  });

  it('reports a slipped milestone with its real slip, not a progress bar', async () => {
    mockApi(() =>
      ok(view({ milestones: [milestone({ status: 'slipped', slipDays: 9 })] })),
    );
    render(<ProjectHome {...props()} />);
    openPlanStage();

    await screen.findByText('Pre-IND meeting');
    expect(screen.getByText('slipped')).toBeTruthy();
    expect(document.body.textContent).toMatch(/9d late/);
  });

  it('summarizes completed milestones instead of listing them as upcoming', async () => {
    mockApi(() =>
      ok(
        view({
          milestones: [
            milestone({ id: 1, key: 'a', title: 'Done thing', status: 'completed' }),
            milestone({ id: 2, key: 'b', title: 'Next thing' }),
          ],
        }),
      ),
    );
    render(<ProjectHome {...props()} />);
    openPlanStage();

    await screen.findByText('Next thing');
    expect(screen.queryByText('Done thing')).toBeNull();
    expect(document.body.textContent).toMatch(/1 completed/);
    expect(document.body.textContent).toMatch(/2 milestones total/);
  });

  it('renders the honest empty state with only real affordances, and wires the AnA prompt', async () => {
    mockApi(() => ok(view({ plan: null, milestones: [] })));
    const p = props();
    render(<ProjectHome {...p} />);
    openPlanStage();

    expect(await screen.findByText('No schedule generated')).toBeTruthy();

    // The composer affordance reaches the real generate_schedule_of_events tool.
    fireEvent.click(screen.getByRole('button', { name: /Ask AnA to generate one/ }));
    expect(p.onAsk).toHaveBeenCalledTimes(1);
    expect(String(p.onAsk.mock.calls[0][0])).toMatch(/schedule of events/i);
  });

  it('generates via the REAL POST endpoint and reloads the schedule', async () => {
    let scheduleCalls = 0;
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === SCHED_URL) {
        scheduleCalls += 1;
        // Empty before generation; populated after.
        return ok(scheduleCalls > 1 ? view() : view({ plan: null, milestones: [] }));
      }
      if (url === `${SCHED_URL}/generate` && method === 'POST') return ok(view());
      return ok({});
    });
    render(<ProjectHome {...props()} />);
    openPlanStage();

    fireEvent.click(await screen.findByText('Generate schedule'));

    expect(await screen.findByText('Pre-IND meeting')).toBeTruthy();
    const postCall = apiRequest.mock.calls.find((c) => c[0] === 'POST');
    expect(postCall?.[1]).toBe(`${SCHED_URL}/generate`);
  });

  it('distinguishes a failed read from "no schedule generated"', async () => {
    mockApi(() => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    render(<ProjectHome {...props()} />);
    openPlanStage();

    expect(await screen.findByText(/Couldn't load the schedule/)).toBeTruthy();
    expect(screen.queryByText('No schedule generated')).toBeNull();
    expect(screen.queryByText('Generate schedule')).toBeNull();
  });
});

describe('ProjectHome — schedule of events (UUID program)', () => {
  beforeEach(() => {
    (window as any).C2C_PROJECT = { id: UUID_PID, title: 'BX-301' };
  });

  it('renders the honest id-space empty and sends NO schedule request', async () => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({}));
    render(<ProjectHome {...props()} />);
    openPlanStage();

    expect(
      await screen.findByText(/Schedule isn't wired to this workspace yet/),
    ).toBeTruthy();
    // No phantom actions in an id-space where neither endpoint nor tool can
    // resolve this project, and no doomed request that could truncate the UUID
    // into another project's numeric id.
    expect(screen.queryByText('Generate schedule')).toBeNull();
    await waitFor(() => {
      const scheduleReqs = apiRequest.mock.calls.filter((c) =>
        String(c[1]).includes('schedule-of-events'),
      );
      expect(scheduleReqs).toHaveLength(0);
    });
  });
});
