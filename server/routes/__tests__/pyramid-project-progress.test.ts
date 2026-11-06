/**
 * The project's pyramid (S11, P-82; docs/design/THE_PROGRAM_2026-11-01.md §7.2).
 *
 * Progress was kept per organisation and submission type, so every project of
 * one filing type shared one board: two NDAs, one set of statuses. These routes
 * key it on the project. They hold that:
 *   • the pyramid is the one the project's recorded filing resolves to, and a
 *     filing with none is said, never given another type's plan;
 *   • a status is recorded under the project's own key, never the type's, and
 *     the per-type rows stay as they are;
 *   • the project is admitted (read for GET, write for PATCH) before anything
 *     is read or written, and a refusal writes nothing;
 *   • a task that is not in the project's pyramid is refused.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const { query, insert, update, admission, programRow, projectRef, programSql, programParams } = vi.hoisted(() => ({
  query: vi.fn(), insert: vi.fn(), update: vi.fn(),
  admission: vi.fn(), programRow: vi.fn(), projectRef: vi.fn(), programSql: [] as string[], programParams: [] as unknown[][],
}));
vi.mock('../../utils/feature-persistence.js', () => ({
  createFeatureStore: () => ({ query, insert, update, getById: vi.fn(), remove: vi.fn() }),
}));
vi.mock('../../auth.js', () => ({ authMiddleware: (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../middleware/tenantLifecycleGuard.js', () => ({
  enforceTenantLifecycle: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../db/requestDb', () => ({
  requestDb: () => ({}),
  requestPgClient: () => ({ query: async (sql: string, params: unknown[]) => { programSql.push(sql); programParams.push(params); return { rows: programRow() }; } }),
}));
vi.mock('../../services/c2c/program-project-anchor.js', () => ({ strictProjectRowForRef: (...a: unknown[]) => projectRef(...a) }));
vi.mock('../c2c/project-access', async (original) => {
  const real = await original<typeof import('../c2c/project-access')>();
  return { ...real, requireProjectAdmission: (...a: unknown[]) => admission(...a) };
});

import pyramidRouter from '../pyramid.routes';
import { ProjectAdmissionRefusal } from '../c2c/project-access';

const PROGRAM = '7abb1c22-1111-4222-8333-444455556666';
const PATH = `/api/v1/pyramids/by-project/${PROGRAM}`;
function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => { (req as unknown as { user: unknown }).user = { organizationId: 7, id: 3 }; next(); });
  a.use('/api/v1', pyramidRouter);
  return a;
}
let indTask: string;

beforeEach(async () => {
  for (const f of [query, insert, update, admission, programRow, projectRef]) f.mockReset();
  programSql.length = 0;
  programParams.length = 0;
  query.mockResolvedValue([]);
  admission.mockResolvedValue(undefined);
  projectRef.mockResolvedValue(51);
  programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind' }]);
  indTask = (await request(app()).get('/api/v1/pyramids/IND')).body.data.tasks[0].id;
});

describe('GET /pyramids/by-project/:ref', () => {
  it("gives the project's own pyramid, from its recorded filing, with its own statuses", async () => {
    query.mockResolvedValue([{ id: 9, statuses: { [indTask]: 'done' } }]);
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ programId: PROGRAM, type: 'IND', filing: 'us_ind', statuses: { [indTask]: 'done' } });
    expect(res.body.data.pyramid.tasks.length).toBeGreaterThan(0);
    expect(query).toHaveBeenCalledWith(7, `project:${PROGRAM}:IND`);
    expect(admission.mock.calls[0][2]).toBe(false);
  });

  it("reads the recorded filing where intake keeps it: metadata.submissionTypeId, else program_type", async () => {
    // regulatory_programs has no submission_type_id column (the read model lifts it from metadata,
    // projects.ts serializeProgramDetail); naming one failed every read in the running app (2026-11-04).
    await request(app()).get(PATH);
    expect(programSql.join('\n')).toMatch(/COALESCE\(NULLIF\(rp\.metadata->>'submissionTypeId', ''\), rp\.program_type\)/);
    expect(programSql.join('\n')).not.toMatch(/rp\.submission_type_id/);
  });

  it('says a filing has no work breakdown rather than giving it another type', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'ca_nds' }]);
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ programId: PROGRAM, type: null, filing: 'ca_nds' });
    expect(query).not.toHaveBeenCalled();
  });

  it('says the progress store is not provisioned when its table is absent, even through the ORM\'s wrapper', async () => {
    // Drizzle wraps the driver's error: the 42P01 is on `cause`.
    query.mockRejectedValue(Object.assign(new Error('Failed query: select … from project_memory_entries'), { cause: { code: '42P01' } }));
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ type: 'IND', statuses: {}, pendingStore: true });
    const write = await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'done' });
    expect(write.status).toBe(503);
    expect(write.body.error.code).toBe('PROGRESS_STORE_UNPROVISIONED');
  });

  it('reads nothing for a project the person is not admitted to', async () => {
    admission.mockRejectedValue(new ProjectAdmissionRefusal(403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this project.'));
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('404s an unknown project', async () => {
    projectRef.mockResolvedValue(null);
    expect((await request(app()).get(PATH)).status).toBe(404);
  });
});

describe('PATCH /pyramids/by-project/:ref/progress/:taskId', () => {
  it("records the status under the project's key, admitted for write", async () => {
    const res = await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'in-progress' });
    expect(res.status).toBe(200);
    expect(admission.mock.calls[0][2]).toBe(true);
    expect(insert).toHaveBeenCalledWith(7, `project:${PROGRAM}:IND`, expect.any(String),
      { type: 'IND', programId: PROGRAM, statuses: { [indTask]: 'in-progress' } });
    // The per-type row ('IND') is never touched.
    expect(query.mock.calls.every((c) => c[1] !== 'IND')).toBe(true);
  });

  it("updates the project's existing row, and 'todo' clears the task", async () => {
    query.mockResolvedValue([{ id: 9, statuses: { [indTask]: 'done', other: 'blocked' } }]);
    const res = await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'todo' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(9, 7, { type: 'IND', programId: PROGRAM, statuses: { other: 'blocked' } });
  });

  it('refuses a task that is not in the project pyramid, and an unknown status, writing nothing', async () => {
    expect((await request(app()).patch(`${PATH}/progress/not-a-task`).send({ status: 'done' })).status).toBe(404);
    expect((await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'finished' })).status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when the person may not change the project', async () => {
    admission.mockRejectedValue(new ProjectAdmissionRefusal(403, 'PROJECT_ARCHIVED', 'This project is archived.'));
    const res = await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'done' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROJECT_ARCHIVED');
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a filing with no pyramid', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'ca_nds' }]);
    expect((await request(app()).patch(`${PATH}/progress/${indTask}`).send({ status: 'done' })).status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });
});

// S11 step 3 (THE_PROGRAM §3.3, §7.2): each task's due date, back-scheduled by the engine from the project's target
// submission date. The target is the project's own recorded field, read inside the same admitted, tenant-scoped query.
describe("GET /pyramids/by-project/:ref — the project's schedule", () => {
  it('back-schedules every task from the recorded target date', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: '2027-06-04' }]);
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(200);
    const { data } = res.body;
    expect(data.target).toBe('2027-06-04');
    expect(data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.schedule.anchorTaskId).toBe('phase8.complete');
    expect(data.schedule.tasks['phase8.complete'].due).toBe('2027-06-04');
    expect(Object.keys(data.schedule.tasks)).toHaveLength(data.pyramid.tasks.length);
    // A predecessor is due before its successor starts.
    const submit = data.pyramid.tasks.find((t: { id: string }) => t.id === 'phase8.submit');
    for (const d of submit.deps) expect(data.schedule.tasks[d].due < data.schedule.tasks['phase8.submit'].start).toBe(true);
  });

  it('reads the target as a calendar date, in the tenant-scoped project query', async () => {
    await request(app()).get(PATH);
    expect(programSql.join('\n')).toMatch(/to_char\(rp\.target_submission_date, 'YYYY-MM-DD'\) AS target/);
    expect(programSql.join('\n')).toMatch(/p\.organization_id = \$2/);
    expect(programParams[0]).toEqual([51, 7]);
    // The project is resolved in the session's organisation, never one the request names.
    expect(projectRef.mock.calls[0][1]).toMatchObject({ orgId: 7, ref: PROGRAM });
  });

  it('gives no dates when no target date is recorded, rather than assuming one', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: null }]);
    const { body } = await request(app()).get(PATH);
    expect(body.data).toMatchObject({ target: null, schedule: null });
  });

  it('gives no schedule to a person not admitted to the project', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: '2027-06-04' }]);
    admission.mockRejectedValue(new ProjectAdmissionRefusal(403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this project.'));
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(403);
    expect(res.body.data).toBeUndefined();
    expect(programSql).toHaveLength(0);
  });

  it("gives no schedule for another organisation's project: it is not found in this one", async () => {
    projectRef.mockResolvedValue(null);
    const res = await request(app()).get(PATH);
    expect(res.status).toBe(404);
    expect(programSql).toHaveLength(0);
  });
});

// S11 (THE_PROGRAM §5, §8 items 3–4, §9 step 6): each workstream's milestone, the agency's clock after the filing, and
// the portfolio line read for a page of Projects cards.
describe("the plan's workstream milestones and review clock", () => {
  it("gives each phase its completing task, the workstream's milestone", async () => {
    const { body } = await request(app()).get(PATH);
    for (const ph of body.data.pyramid.phases) expect(ph.gate).toBe(`${ph.id}.complete`);
  });

  it("gives an IND the 30-day review from its own pyramid, dated from the target", async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: '2027-06-04' }]);
    const { body } = await request(app()).get(PATH);
    expect(body.data.reviewClock).toMatchObject({ authority: 'FDA', basis: '21 CFR 312.40', days: 30, ends: '2027-07-04' });
  });

  it("gives a 510(k) the published MDUFA goal and its interim milestones, from regulatory-timelines", async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: '510k', target: '2027-06-04' }]);
    const { body } = await request(app()).get(PATH);
    expect(body.data.type).toBe('510K');
    expect(body.data.reviewClock).toMatchObject({ authority: 'FDA (CDRH)', days: 90, ends: '2027-09-02', label: 'MDUFA decision', clockStops: true });
    expect(body.data.reviewClock.milestones.map((m: { day: number }) => m.day)).toEqual([15, 60]);
  });

  it('gives no clock without a target date', async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: null }]);
    expect((await request(app()).get(PATH)).body.data.reviewClock).toBeNull();
  });
});

describe('GET /pyramids/by-project?refs= — the portfolio line', () => {
  const OTHER = '9c9c9c9c-1111-4222-8333-444455556666';
  const lines = (refs: string) => request(app()).get(`/api/v1/pyramids/by-project?refs=${refs}`);

  it("gives each admitted project its plan in a few figures, from the engine's summary", async () => {
    programRow.mockReturnValue([{ program_id: PROGRAM, filing: 'us_ind', target: '2027-06-04' }]);
    const res = await lines(PROGRAM);
    expect(res.status).toBe(200);
    const line = res.body.data.lines[PROGRAM];
    expect(line).toMatchObject({ type: 'IND', target: '2027-06-04', summary: { total: 58, done: 0 } });
    expect(['on-track', 'at-risk']).toContain(line.summary.status);
    expect(res.body.data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Read under the project's own key, in the session's organisation.
    expect(query).toHaveBeenCalledWith(7, `project:${PROGRAM}:IND`);
    expect(admission.mock.calls[0][2]).toBe(false);
  });

  it('admits each project on its own: a refused one says only that it is unavailable', async () => {
    admission.mockImplementation(async (_req: unknown, projectId: string) => {
      if (projectId === '52') throw new ProjectAdmissionRefusal(403, 'PROJECT_ACCESS_DENIED', 'You do not have access to this project.');
    });
    projectRef.mockImplementation(async (_db: unknown, a: { ref: string }) => (a.ref === OTHER ? 52 : 51));
    const res = await lines(`${PROGRAM},${OTHER}`);
    expect(res.body.data.lines[OTHER]).toEqual({ unavailable: true });
    expect(res.body.data.lines[PROGRAM].summary).toBeTruthy();
  });

  it("says a project of another organisation is unavailable, resolved in the session's organisation only", async () => {
    projectRef.mockResolvedValue(null);
    const res = await lines(PROGRAM);
    expect(res.body.data.lines[PROGRAM]).toEqual({ unavailable: true });
    expect(projectRef.mock.calls[0][1]).toMatchObject({ orgId: 7 });
    expect(query).not.toHaveBeenCalled();
  });

  it('says a filing with no work breakdown has none, and an unscheduled project is unscheduled', async () => {
    programRow.mockReturnValueOnce([{ program_id: PROGRAM, filing: 'ca_nds', target: null }])
      .mockReturnValueOnce([{ program_id: OTHER, filing: 'us_ind', target: null }]);
    const res = await lines(`${PROGRAM},${OTHER}`);
    expect(res.body.data.lines[PROGRAM]).toEqual({ type: null, filing: 'ca_nds' });
    expect(res.body.data.lines[OTHER].summary.status).toBe('unscheduled');
  });

  it('refuses an empty or oversized batch', async () => {
    expect((await request(app()).get('/api/v1/pyramids/by-project')).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `ref-${i}`).join(',');
    expect((await lines(many)).status).toBe(400);
  });

  it("is never read as a submission type ('by-project' is not a pyramid)", async () => {
    const res = await request(app()).get('/api/v1/pyramids/by-project?refs=' + PROGRAM);
    expect(res.body.data.lines).toBeTruthy();
  });
});
