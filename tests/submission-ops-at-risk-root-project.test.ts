/**
 * A row of "Which projects are at risk this week" names the project a card carries.
 *
 * `GET /api/submission-ops/blockers` and `/due-soon` answered each row with the id of the project the row was
 * recorded on. A work project (P-111: `parent_project_id` set, no program of its own) is not a card on Projects, so a
 * blocker or a due task recorded on one carried an id nothing on the page could name or open (the CSR lane's critic,
 * 2026-11-12). Each row now carries its project and that project's root: the filing project, with the program a card
 * opens.
 *
 * The root is named only when the reader can open it. A member of a work project gains nothing on its parent
 * (server/services/tasking/task-project.ts), so a reader who can open the work project and not the filing project is
 * told the work project's name and no more.
 *
 * Real SQL on PGlite: the walk is a recursive read and the organization boundary is decided in it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { extractTableDdl } from './golden-journeys/harness';

const pg = new PGlite();
const drizzleDb = drizzle(pg);
const due = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('../server/db', () => ({
  get db() { return drizzleDb; },
  pool: { query: (text: string, params?: unknown[]) => pg.query(text, params), connect: vi.fn() },
}));
vi.mock('../server/routes/c2c/actions', () => ({ recordGovernedAction: vi.fn() }));
vi.mock('../server/submission-ops/policy-engine', () => ({ resolvePolicy: vi.fn(), resolveAllPolicies: vi.fn() }));
vi.mock('../server/submission-ops/readiness-engine', () => ({ computePackageReadiness: vi.fn() }));
vi.mock('../server/submission-ops/automation-runner', () => ({ runAutomationSweep: vi.fn() }));
vi.mock('../server/services/intelligence/index.js', () => ({ getProjectSignals: vi.fn(), analyzeCrossArtifactIntelligence: vi.fn() }));
vi.mock('../server/services/regulatory-correspondence/operating-layer', () => ({
  readCanonicalDueSoonAndWorkload: vi.fn(async () => ({ dueSoon: due.rows, workload: [] })),
}));
vi.mock('../server/src/services/ectd', () => ({ buildECTDZip: vi.fn() }));
vi.mock('../server/services/ectd/package-leaf-bytes', () => ({ packageLeafBytes: vi.fn() }));
const access = vi.hoisted(() => ({ readable: [] as number[] }));
vi.mock('../server/services/c2c/current-program-access', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readCurrentProgramActor: vi.fn(async (_q: unknown, input: { userId?: number }) => ({ userId: input.userId, role: 'member' })),
}));
vi.mock('../server/services/report-os/project-access', () => ({ getAccessibleReportProjectIds: vi.fn(async () => access.readable) }));

import submissionOpsRouter from '../server/routes/submission-ops';

const ORG = 99;
const PROGRAM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
/* 10 is the filing project (a card on Projects); 20 is a work project under it and 30 one under that. 40 is an
   ordinary project with no program. 50 is another organization's project that 60, in ours, wrongly names as parent. */
const FILING = 10, WORK = 20, NESTED = 30, PLAIN = 40, FOREIGN = 50, ORPHAN = 60;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown; userRole: string }).user = { id: '11', userId: '11', organizationId: String(ORG), role: 'member' };
    (req as unknown as { userRole: string }).userRole = 'member';
    next();
  });
  a.use('/api/submission-ops', submissionOpsRouter);
  return a;
}
type Named = { project?: { id: number; name: string; root: { id: number; name: string; programId: string | null } | null } | null };
const blockers = async () => (await request(app()).get('/api/submission-ops/blockers').expect(200)).body.data as Array<Named & { blockerId: string }>;
const dueSoon = async () => (await request(app()).get('/api/submission-ops/due-soon').expect(200)).body.data.canonicalTasks as Array<Named & { work_item_id: string }>;
const of = <T extends { blockerId?: string; work_item_id?: string }>(rows: T[], id: string) => rows.find((r) => (r.blockerId ?? r.work_item_id) === id);

beforeAll(async () => {
  const ddl = extractTableDdl('migrations/0002_phase15_submission_ops.sql', ['c2c_blockers'])
    .replace(/REFERENCES\s+\w+\s*\(\s*\w+\s*\)(\s+ON\s+DELETE\s+(SET\s+NULL|CASCADE|RESTRICT))?/gi, '');
  await pg.exec(ddl);
  await pg.exec(`
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL, name text NOT NULL,
      parent_project_id integer, regulatory_program_id uuid);
    INSERT INTO projects VALUES
      (${FILING}, ${ORG}, 'C2C-101 IND', NULL, '${PROGRAM}'),
      (${WORK}, ${ORG}, 'CMC', ${FILING}, NULL),
      (${NESTED}, ${ORG}, 'Stability', ${WORK}, NULL),
      (${PLAIN}, ${ORG}, 'Ordinary project', NULL, NULL),
      (${FOREIGN}, 7, 'Another sponsor''s filing', NULL, '${PROGRAM}'),
      (${ORPHAN}, ${ORG}, 'Misparented', ${FOREIGN}, NULL);
    INSERT INTO c2c_blockers (blocker_id, org_id, project_id, blocker_type, severity, title, status) VALUES
      ('blk_filing', ${ORG}, ${FILING}, 'missing_section', 'high', 'On the filing project', 'open'),
      ('blk_work', ${ORG}, ${WORK}, 'missing_section', 'high', 'On a work project', 'open'),
      ('blk_nested', ${ORG}, ${NESTED}, 'missing_section', 'low', 'On a work project two levels down', 'open'),
      ('blk_plain', ${ORG}, ${PLAIN}, 'missing_section', 'low', 'On an ordinary project', 'open'),
      ('blk_orphan', ${ORG}, ${ORPHAN}, 'missing_section', 'low', 'On a project whose parent is another organization''s', 'open');
  `);
});
afterAll(async () => { await pg.close(); });
beforeEach(() => {
  access.readable = [FILING, WORK, NESTED, PLAIN, ORPHAN];
  due.rows = [
    { work_item_id: 'wi_work', project_id: WORK, title: 'Due on a work project', due_at: '2026-11-13T00:00:00Z' },
    { work_item_id: 'wi_filing', project_id: FILING, title: 'Due on the filing project', due_at: '2026-11-14T00:00:00Z' },
  ];
});

describe('GET /api/submission-ops/blockers: each row names its project and the project a card carries', () => {
  it('a blocker on a work project names the work project and its filing project, with the program a card opens', async () => {
    const rows = await blockers();
    expect(of(rows, 'blk_work')?.project).toEqual({ id: WORK, name: 'CMC', root: { id: FILING, name: 'C2C-101 IND', programId: PROGRAM } });
    expect(of(rows, 'blk_nested')?.project).toEqual({ id: NESTED, name: 'Stability', root: { id: FILING, name: 'C2C-101 IND', programId: PROGRAM } });
  });

  it('a blocker on a filing project names it as its own root; an ordinary project has no program', async () => {
    const rows = await blockers();
    expect(of(rows, 'blk_filing')?.project).toEqual({ id: FILING, name: 'C2C-101 IND', root: { id: FILING, name: 'C2C-101 IND', programId: PROGRAM } });
    expect(of(rows, 'blk_plain')?.project).toEqual({ id: PLAIN, name: 'Ordinary project', root: { id: PLAIN, name: 'Ordinary project', programId: null } });
  });

  it('a reader who can open the work project and not its filing project is not told the filing project', async () => {
    access.readable = [WORK];
    const rows = await blockers();
    expect(rows.map((r) => r.blockerId)).toEqual(['blk_work']);
    expect(rows[0].project).toEqual({ id: WORK, name: 'CMC', root: null });
  });

  it('the walk never leaves the organization: a parent in another organization is not a root', async () => {
    expect(of(await blockers(), 'blk_orphan')?.project).toEqual({ id: ORPHAN, name: 'Misparented', root: null });
  });

  it('keeps every field the row had, and its order', async () => {
    const rows = await blockers();
    expect(rows).toHaveLength(5);
    expect(rows.slice(0, 2).map((r) => r.blockerId).sort()).toEqual(['blk_filing', 'blk_work']); // most severe first, as before
    expect(of(rows, 'blk_work')).toMatchObject({ blockerId: 'blk_work', projectId: WORK, severity: 'high', title: 'On a work project', status: 'open' });
  });
});

describe('GET /api/submission-ops/due-soon: each task names its project and the project a card carries', () => {
  it('a task due on a work project names its filing project', async () => {
    const rows = await dueSoon();
    expect(of(rows, 'wi_work')).toMatchObject({ work_item_id: 'wi_work', project_id: WORK, title: 'Due on a work project',
      project: { id: WORK, name: 'CMC', root: { id: FILING, name: 'C2C-101 IND', programId: PROGRAM } } });
    expect(of(rows, 'wi_filing')?.project).toEqual({ id: FILING, name: 'C2C-101 IND', root: { id: FILING, name: 'C2C-101 IND', programId: PROGRAM } });
  });

  it('nothing due: no project read, an empty list', async () => {
    due.rows = [];
    expect(await dueSoon()).toEqual([]);
  });
});
