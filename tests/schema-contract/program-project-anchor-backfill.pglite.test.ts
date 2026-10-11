/**
 * 20261008_program_project_anchor_backfill.sql — every live program has its
 * project record (P-19, docs/LAUNCH_DEFINITION_OF_DONE.md; QA walk 2026-10-08).
 *
 * In QA, BX-256 and Vorelinib had no projects row: the GA demo seed writes
 * regulatory_programs directly, and 20260814's backfill only links an existing
 * projects row by code or name. So the schedule and unified-work routes
 * answered 404 PROGRAM_UNANCHORED and AnA found no project.
 *
 * Run on real SQL (PGlite): organizations, users, client_workspaces and
 * projects as 0000 creates them, regulatory_programs as 20260524 creates it,
 * then the anchor files in C2C_MIGRATION_FILES order, replayed as every deploy
 * replays them (Rule 1):
 *   - an unanchored program gets intake's row, and resolves strict;
 *   - the organisation's own (marked) workspace, else its only one; never a
 *     guess between several, never another organisation's;
 *   - the creator only where the program records one as a user id;
 *   - a second deploy inserts nothing;
 *   - a legacy project 20260814 can link is linked, not duplicated;
 *   - a program another organisation's row names is not given a second row.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { extractTableDdl } from '../golden-journeys/harness';
import { resolveProgramProjectAnchor } from '../../server/services/c2c/program-project-anchor';
import type { RequestDb } from '../../server/db/requestDb';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const BACKFILL = 'migrations/20261008_program_project_anchor_backfill.sql';
const ANCHOR = 'migrations/20260814_projects_regulatory_program_anchor.sql';
/** The anchor-related files, in set order: what one deploy runs of them. */
const DEPLOY = [
  ANCHOR,
  'migrations/20260923_organization_default_client_workspace.sql',
  'migrations/20260926b_program_same_org_keys.sql',
  'migrations/20261001b_projects_one_anchor_per_program.sql',
  BACKFILL,
];

const P = {
  bx256: '099991d1-dac8-43c5-b88a-8baab26194ee',
  intakeSkipped: '20000000-0000-4000-8000-000000000002',
  creatorGone: '20000000-0000-4000-8000-000000000003',
  anchored: '20000000-0000-4000-8000-000000000004',
  deleted: '20000000-0000-4000-8000-000000000005',
  legacy: '20000000-0000-4000-8000-000000000006',
  foreign: '20000000-0000-4000-8000-000000000007',
  marked: '20000000-0000-4000-8000-000000000008',
  ambiguous: '20000000-0000-4000-8000-000000000009',
  noWorkspace: '20000000-0000-4000-8000-00000000000a',
};

let db: PGlite;
const notices: string[][] = [];

async function deploy(): Promise<string[]> {
  const seen: string[] = [];
  for (const f of DEPLOY) await db.exec(read(f), { onNotice: (n) => seen.push(n.message ?? '') });
  return seen;
}
const anchorsOf = async (program: string) =>
  (await db.query<{ id: number; organization_id: number; client_workspace_id: number }>(
    `SELECT id, organization_id, client_workspace_id FROM projects WHERE regulatory_program_id = $1 ORDER BY id`,
    [program],
  )).rows;
const projectSnapshot = async () =>
  (await db.query(`SELECT * FROM projects ORDER BY id`)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['organizations', 'users', 'client_workspaces', 'projects']));
  await db.exec(read('migrations/20260524_program_workbench_schema.sql'));
  await db.exec(read(ANCHOR));
  await db.exec(`
    INSERT INTO organizations (id, name, slug) VALUES
      (1, 'QA sponsor', 'qa'), (2, 'Marked', 'marked'), (3, 'Ambiguous', 'ambiguous'), (4, 'Unprovisioned', 'unprovisioned');
    INSERT INTO users (id, email, name, password_hash) VALUES (21, 'creator@p19.example', 'Creator', 'x');
    -- 1: one unmarked workspace (QA's org 1). 2: a client workspace plus its own,
    -- marked. 3: two, neither marked. 4: none (20260923 gives it one).
    INSERT INTO client_workspaces (id, organization_id, name, slug, metadata) VALUES
      (10, 1, 'Default Workspace', 'default', NULL),
      (20, 2, 'A client', 'client', NULL),
      (21, 2, 'Marked', 'marked', '{"defaultForOrganization": true}'),
      (30, 3, 'Alpha', 'alpha', NULL),
      (31, 3, 'Beta', 'beta', NULL);
    INSERT INTO regulatory_programs
      (id, organization_id, name, code, program_type, product_type, primary_agency, product_name, status, priority, created_by, deleted_at)
    VALUES
      ('${P.bx256}', 1, 'BX-256 · systemic lupus erythematosus (IND)', 'BX-256', 'IND', 'biologic', 'FDA', 'BX-256', 'active', 'high', 'sarah.chen@concept2cure.pro', NULL),
      ('${P.intakeSkipped}', 1, 'Skipped at intake', 'SKP-1', 'ind', 'drug', 'FDA', 'Skp', 'active', NULL, '21', NULL),
      ('${P.creatorGone}', 1, 'Creator gone', 'GONE-1', 'ind', 'drug', 'FDA', 'Gone', 'active', 'low', '999', NULL),
      ('${P.anchored}', 1, 'Already anchored', 'ANC-1', 'ind', 'drug', 'FDA', 'Anc', 'active', 'medium', '21', NULL),
      ('${P.deleted}', 1, 'Soft-deleted', 'DEL-1', 'ind', 'drug', 'FDA', 'Del', 'active', 'medium', '21', now()),
      ('${P.legacy}', 1, 'Legacy linked by code', 'LEG-1', 'ind', 'drug', 'FDA', 'Leg', 'active', 'medium', '21', NULL),
      ('${P.foreign}', 1, 'Anchored by another org', 'FOR-1', 'ind', 'drug', 'FDA', 'For', 'active', 'medium', '21', NULL),
      ('${P.marked}', 2, 'Marked org program', 'MRK-1', '510k', 'device', 'FDA', 'Mrk', 'active', 'medium', NULL, NULL),
      ('${P.ambiguous}', 3, 'Ambiguous org program', 'AMB-1', '510k', 'device', 'FDA', 'Amb', 'active', 'medium', NULL, NULL),
      ('${P.noWorkspace}', 4, 'Unprovisioned org program', 'UNP-1', '510k', 'device', 'FDA', 'Unp', 'active', 'medium', NULL, NULL);
    INSERT INTO projects (id, organization_id, client_workspace_id, name, code, type, regulatory_program_id) VALUES
      (100, 1, 10, 'Already anchored', 'ANC-1', 'regulatory', '${P.anchored}'),
      (101, 1, 10, 'A legacy project', 'LEG-1', 'ind', NULL),
      -- Written unchecked 2026-08-14..09-24: org 2's row names org 1's program.
      (102, 2, 20, 'Foreign anchor', 'FOR-1', 'regulatory', '${P.foreign}');
    SELECT setval(pg_get_serial_sequence('projects', 'id'), 500);
  `);
  notices.push(await deploy());
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('20261008 on the applier', () => {
  it('runs after every file it depends on and before the tenant sweeps', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(BACKFILL);
    expect(at).toBeGreaterThan(-1);
    for (const dep of DEPLOY.slice(0, -1)) expect(files.indexOf(dep), dep).toBeLessThan(at);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });
});

describe('an unanchored program gets the row intake writes', () => {
  it('BX-256 (seeded, no project row) is anchored and resolves strict to it', async () => {
    const [row] = await anchorsOf(P.bx256);
    expect(row).toBeDefined();
    const full = (await db.query(
      `SELECT organization_id, client_workspace_id, name, code, type, status, priority, created_by_id, owner_id,
              parent_project_id, path
         FROM projects WHERE id = $1`, [row.id],
    )).rows[0];
    expect(full).toEqual({
      organization_id: 1, client_workspace_id: 10, name: 'BX-256 · systemic lupus erythematosus (IND)', code: 'BX-256',
      type: 'regulatory', status: 'active', priority: 'high',
      // The seed recorded an e-mail, not a user id: the creator is not inferred.
      created_by_id: null, owner_id: null, parent_project_id: null, path: null,
    });
    const rdb = drizzle(db) as unknown as RequestDb;
    expect(await resolveProgramProjectAnchor(rdb, { programId: P.bx256, orgId: 1, context: 'p19', strict: true })).toBe(row.id);
    expect(await resolveProgramProjectAnchor(rdb, { programId: P.bx256, orgId: 2, context: 'p19', strict: true })).toBeNull();
  });

  it('a program intake created without its row gets its recorded creator; the default priority when none', async () => {
    const [row] = await anchorsOf(P.intakeSkipped);
    const full = (await db.query(`SELECT created_by_id, owner_id, priority FROM projects WHERE id = $1`, [row.id])).rows[0];
    expect(full).toEqual({ created_by_id: 21, owner_id: 21, priority: 'medium' });
  });

  it('a recorded creator who is not a user is not written', async () => {
    const [row] = await anchorsOf(P.creatorGone);
    const full = (await db.query(`SELECT created_by_id, owner_id FROM projects WHERE id = $1`, [row.id])).rows[0];
    expect(full).toEqual({ created_by_id: null, owner_id: null });
  });

  it('the organisation\'s own workspace when it has several; the one 20260923 gave an unprovisioned one', async () => {
    expect((await anchorsOf(P.marked)).map((r) => r.client_workspace_id)).toEqual([21]);
    const [ws] = (await db.query<{ id: number }>(`SELECT id FROM client_workspaces WHERE organization_id = 4`)).rows;
    expect((await anchorsOf(P.noWorkspace)).map((r) => [r.organization_id, r.client_workspace_id])).toEqual([[4, ws.id]]);
  });
});

describe('what it leaves alone', () => {
  it('an anchored program, a soft-deleted one, and one 20260814 links by code get no new row', async () => {
    expect((await anchorsOf(P.anchored)).map((r) => r.id)).toEqual([100]);
    expect(await anchorsOf(P.deleted)).toEqual([]);
    expect((await anchorsOf(P.legacy)).map((r) => r.id)).toEqual([101]);
  });

  it('several workspaces, none marked: no guess, and the deploy log names the organisation', async () => {
    expect(await anchorsOf(P.ambiguous)).toEqual([]);
    expect(notices[0].join('\n')).toMatch(/organization 3 has 1 program\(s\) without a project record: .*several workspaces/);
  });

  it('a program another organisation\'s row names is not given a second row, and is named', async () => {
    expect((await anchorsOf(P.foreign)).map((r) => [r.id, r.organization_id])).toEqual([[102, 2]]);
    expect(notices[0].join('\n')).toMatch(/organization 1 has 1 program\(s\) without a project record: anchored only by another organization/);
  });
});

describe('tenant-correct', () => {
  it('every row it wrote is in its program\'s organisation and in a workspace of that organisation', async () => {
    const crossing = (await db.query(
      `SELECT p.id FROM projects p
         JOIN regulatory_programs g ON g.id = p.regulatory_program_id
         JOIN client_workspaces w ON w.id = p.client_workspace_id
        WHERE p.id > 500 AND (p.organization_id <> g.organization_id OR w.organization_id <> g.organization_id)`,
    )).rows;
    expect(crossing).toEqual([]);
    const [{ n }] = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM projects WHERE id > 500`)).rows;
    expect(n).toBe(5); // bx256, intakeSkipped, creatorGone, marked, noWorkspace
  });
});

describe('Rule 1: replayed on every deploy', () => {
  it('a second deploy inserts nothing and changes nothing', async () => {
    const before = await projectSnapshot();
    const second = await deploy();
    expect(await projectSnapshot()).toEqual(before);
    expect(second.join('\n')).toMatch(/P-19: 0 program\(s\) given their project record/);
  });
});
