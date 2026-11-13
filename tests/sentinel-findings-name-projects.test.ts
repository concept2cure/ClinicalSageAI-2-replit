/**
 * A Sentinel finding says which project it is about, as the other "at risk this week" rows do.
 *
 * `GET /api/sentinel/findings` answered each finding with `project_id`, a number nothing on the Projects page could
 * name, and with `affected_items`, whose stored labels were on the wrong ids until 2026-11-12
 * (docs/evidence/F1/2026-11-12-sentinel-over-allocation-pairs/). The blockers and the work due carry `project` since
 * ea181e30ed: the project a row was recorded on and its filing project, the one a card on Projects carries, with the
 * program that card opens. A finding now carries the same, from the same resolver: `project` for its own project, and
 * `projects` for every project it names, its own first.
 *
 * The scheduler and the resolver are mocked at the one call the route makes of each; the resolver's own walk is
 * proved on a real engine in tests/submission-ops-at-risk-root-project.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const ORG = 99;
const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  readable: [] as number[],
  resolved: [] as Array<{ orgId: unknown; ids: number[]; openable: number[] }>,
  fail: false,
}));
/** What the resolver knows: 1 and 2 are filing projects; 21 is a work area inside 2. 77 is not held. */
const NAMED = new Map([
  [1, { id: 1, name: 'RR5 acceptance IND', root: { id: 1, name: 'RR5 acceptance IND', programId: 'p-1' } }],
  [2, { id: 2, name: 'Vorelinib NDA', root: { id: 2, name: 'Vorelinib NDA', programId: 'p-2' } }],
  [21, { id: 21, name: 'CMC', root: { id: 2, name: 'Vorelinib NDA', programId: 'p-2' } }],
]);

vi.mock('../server/db', () => ({ getPool: () => ({ query: vi.fn() }), pool: { query: vi.fn() } }));
vi.mock('../server/services/sentinel/scheduler', () => ({
  getSentinelScheduler: () => ({
    getSentinel: () => ({ getFindings: vi.fn(async () => ({ findings: state.rows, total: 7 })) }),
  }),
}));
vi.mock('../server/services/c2c/current-program-access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readCurrentProgramActor: vi.fn(async (_q: unknown, input: { userId?: number }) => ({ userId: input.userId, role: 'member' })),
}));
vi.mock('../server/services/report-os/project-access', () => ({ getAccessibleReportProjectIds: vi.fn(async () => state.readable) }));
vi.mock('../server/services/c2c/program-project-anchor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  namedProjectsWithRoot: vi.fn(async (_client: unknown, orgId: unknown, ids: readonly number[], openable: ReadonlySet<number>) => {
    if (state.fail) throw new Error('the project names could not be read');
    state.resolved.push({ orgId, ids: [...ids], openable: [...openable] });
    return new Map(ids.filter((id) => NAMED.has(id)).map((id) => [id, NAMED.get(id)!]));
  }),
}));

import sentinelRouter from '../server/routes/sentinel-routes';
import { findingNamedProjectIds } from '../server/services/sentinel/sentinel';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: '31', userId: '31', organizationId: String(ORG) };
    next();
  });
  a.use('/api/sentinel', sentinelRouter);
  return a;
}
const read = () => request(app()).get('/api/sentinel/findings?status=open&limit=20');

const DEADLINE = { finding_id: 'f-1', project_id: 1, analyzer_type: 'deadline_risk', severity: 'high', status: 'open',
  title: '11 overdue tasks in "RR5 acceptance IND"', affected_items: [{ type: 'project', id: 1, label: 'RR5 acceptance IND' }] };
const SPREAD = { finding_id: 'f-2', project_id: 1, analyzer_type: 'cross_project', severity: 'medium', status: 'open',
  title: 'Lee Park is spread across 4 active projects',
  affected_items: [{ type: 'project', id: 1, label: 'a label' }, { type: 'project', id: 21, label: 'a label' },
    { type: 'project', id: 2, label: 'a label' }, { type: 'task', id: 2, label: 'a task' }, { type: 'project', id: 'x' }] };

beforeEach(() => {
  state.rows = [DEADLINE, SPREAD];
  state.readable = [1, 2, 21];
  state.resolved = [];
  state.fail = false;
});

describe('GET /api/sentinel/findings: each finding carries the projects it names', () => {
  it('gives a finding its own project, in the shape the blockers and the work due carry', async () => {
    const res = await read();
    expect(res.status).toBe(200);
    expect(res.body.findings[0].project).toEqual(NAMED.get(1));
    expect(res.body.findings[0].projects).toEqual([NAMED.get(1)]);
  });

  it('gives a finding about several projects each of them once, its own first, and no item that is not a project', async () => {
    const res = await read();
    expect(res.body.findings[1].project).toEqual(NAMED.get(1));
    expect(res.body.findings[1].projects).toEqual([NAMED.get(1), NAMED.get(21), NAMED.get(2)]);
  });

  it('keeps every field, the order and the total the engine answered', async () => {
    const res = await read();
    expect(res.body.total).toBe(7);
    expect(res.body.findings.map((f: { finding_id: string }) => f.finding_id)).toEqual(['f-1', 'f-2']);
    for (const [i, row] of [DEADLINE, SPREAD].entries()) expect(res.body.findings[i]).toMatchObject(row);
  });

  it('asks for the names once, inside the organisation, and names a filing project only among those the reader can open', async () => {
    await read();
    expect(state.resolved).toEqual([{ orgId: ORG, ids: [1, 21, 2], openable: [1, 2, 21] }]);
  });

  it('answers null and an empty list for a project the organisation does not hold', async () => {
    state.rows = [{ ...DEADLINE, finding_id: 'f-3', project_id: 77, affected_items: [{ type: 'project', id: 77, label: 'gone' }] }];
    state.readable = [77];
    const res = await read();
    expect(res.body.findings[0].project).toBeNull();
    expect(res.body.findings[0].projects).toEqual([]);
  });

  it('fails the read when the names cannot be read, and sends no finding without them', async () => {
    state.fail = true;
    const res = await read();
    expect(res.status).toBe(500);
    expect(res.body.findings).toBeUndefined();
  });

  it('asks for no names when there is no finding', async () => {
    state.rows = [];
    const res = await read();
    expect(res.body).toEqual({ findings: [], total: 7 });
  });
});

describe('findingNamedProjectIds: the projects a stored finding names', () => {
  it('is its own project, then each project among its affected items, once each', () => {
    expect(findingNamedProjectIds({ ...SPREAD, affected_items: SPREAD.affected_items.slice(0, 4) })).toEqual([1, 21, 2]);
    expect(findingNamedProjectIds({ project_id: 5, affected_items: null })).toEqual([5]);
  });
  it('keeps a project it cannot read as a number in the list, so the finding is not taken for one the caller can open', () => {
    // Not-a-number stays on purpose: the update route refuses a finding unless every id it names is one the caller
    // can open, and NaN is in no such list. The findings read leaves it out when it asks for names.
    expect(findingNamedProjectIds({ project_id: null, affected_items: [{ type: 'project', id: 3 }] })).toEqual([NaN, 3]);
    expect(findingNamedProjectIds(SPREAD)).toEqual([1, 21, 2, NaN]);
  });
});
