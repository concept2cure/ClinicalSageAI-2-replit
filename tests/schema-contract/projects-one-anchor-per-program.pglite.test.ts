/**
 * 20261001b_projects_one_anchor_per_program.sql — a program has at most one
 * anchor row in projects (PF-08, D2/D5).
 *
 * Run on real SQL (PGlite): projects as 0000 creates it, the anchor column and
 * its backfill from 20260814, then this file, each replayed as every deploy
 * replays them (Rule 1):
 *   - with two anchors for one program, the index is skipped and a NOTICE names
 *     the program and both project ids; the deploy does not fail;
 *   - once the duplicate is resolved, the next replay creates it, and a second
 *     anchor is refused;
 *   - the 20260814 backfill, replayed after the index exists, still runs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { extractTableDdl } from '../golden-journeys/harness';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const ANCHOR = 'migrations/20260814_projects_regulatory_program_anchor.sql';
const ONE_ANCHOR = 'migrations/20261001b_projects_one_anchor_per_program.sql';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const P3 = '33333333-3333-4333-8333-333333333333';

let db: PGlite;

/** Apply one file, returning the NOTICE lines it raised. */
async function apply(file: string): Promise<string[]> {
  const notices: string[] = [];
  await db.exec(read(file), { onNotice: (n) => notices.push(n.message ?? '') });
  return notices;
}
const indexExists = async () =>
  (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'projects_one_anchor_per_program'`))
    .rows[0].n === 1;
const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE organizations (id integer PRIMARY KEY); CREATE TABLE users (id integer PRIMARY KEY);
                 CREATE TABLE client_workspaces (id integer PRIMARY KEY);
                 CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL,
                   code text, name text, deleted_at timestamptz);`);
  await db.exec(extractTableDdl('migrations/0000_sweet_joseph.sql', ['projects']));
  await apply(ANCHOR);
  await db.exec(`
    INSERT INTO organizations VALUES (1);
    INSERT INTO client_workspaces VALUES (1);
    INSERT INTO regulatory_programs (id, organization_id, code, name) VALUES ('${P1}', 1, 'ALPHA', 'Alpha'), ('${P2}', 1, 'BETA', 'Beta'), ('${P3}', 1, 'GAMMA', 'Gamma');
    INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id) VALUES
      (10, 1, 1, 'Alpha anchor', 'regulatory', '${P1}'),
      (11, 1, 1, 'Alpha second anchor', 'regulatory', '${P1}'),
      (20, 1, 1, 'Unanchored', 'regulatory', NULL),
      (21, 1, 1, 'Unanchored too', 'regulatory', NULL),
      -- A cross-organization pair, writable unchecked 2026-08-14..09-24: the NOTICE names each row's organization.
      (22, 1, 1, 'Beta anchor', 'regulatory', '${P2}'),
      (23, 2, 1, 'Beta, written by another organization', 'regulatory', '${P2}');
  `);
}, 60_000);
afterAll(async () => {
  await db?.close();
});

describe('20261001b on the applier', () => {
  it('runs after the anchor column it indexes and before the tenant sweep', () => {
    const files = C2C_MIGRATION_FILES as string[];
    const at = files.indexOf(ONE_ANCHOR);
    expect(at).toBeGreaterThan(-1);
    expect(files.indexOf(ANCHOR)).toBeLessThan(at);
    expect(at).toBeLessThan(files.indexOf(UUID_TENANT_ISOLATION_NONPUBLIC as string));
  });
});

describe('a program has at most one anchor row', () => {
  it('with two anchors for one program, every replay skips the index and names both rows', async () => {
    for (let deploy = 0; deploy < 2; deploy++) {
      const notices = await apply(ONE_ANCHOR);
      expect(notices).toEqual([
        `PF-08: program ${P1} has 2 anchor rows (project@organization: 10@1, 11@1); one-anchor index not created`,
        `PF-08: program ${P2} has 2 anchor rows (project@organization: 22@1, 23@2); one-anchor index not created`,
      ]);
      expect(await indexExists()).toBe(false);
    }
    // Nothing was rewritten to make it fit.
    const rows = await db.query<{ id: number }>(`SELECT id FROM projects WHERE regulatory_program_id = $1 ORDER BY id`, [P1]);
    expect(rows.rows.map((r) => r.id)).toEqual([10, 11]);
  });

  it('once the duplicate is resolved, the next replay creates a partial unique index', async () => {
    // Same organization: the higher id's anchor cleared. Cross organization: the foreign row's.
    await db.exec(`UPDATE projects SET regulatory_program_id = NULL WHERE id IN (11, 23)`);
    expect(await apply(ONE_ANCHOR)).toEqual([]);
    expect(await indexExists()).toBe(true);
    const def = await db.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'projects_one_anchor_per_program'`);
    expect(def.rows[0].indexdef).toMatch(/CREATE UNIQUE INDEX .* \(regulatory_program_id\) WHERE \(regulatory_program_id IS NOT NULL\)/);
    // A replay is a no-op.
    expect(await apply(ONE_ANCHOR)).toEqual([]);
  });

  it('a second anchor for the program is refused, from any organization; unanchored rows and other programs are not', async () => {
    expect(await code(db.query(`UPDATE projects SET regulatory_program_id = $1 WHERE id = 11`, [P1]))).toBe('23505');
    expect(await code(db.query(`UPDATE projects SET regulatory_program_id = $1 WHERE id = 23`, [P2]))).toBe('23505');
    expect(
      await code(
        db.query(`INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id) VALUES (12, 1, 1, 'x', 'regulatory', $1)`, [P1]),
      ),
    ).toBe('23505');
    expect(await code(db.query(`UPDATE projects SET regulatory_program_id = $1 WHERE id = 20`, [P3]))).toBe('ok');
    const nulls = await db.query<{ id: number }>(`SELECT id FROM projects WHERE regulatory_program_id IS NULL ORDER BY id`);
    expect(nulls.rows.map((r) => r.id)).toEqual([11, 21, 23]);
  });

  it('the 20260814 backfill, replayed after the index, still runs and links no second row', async () => {
    // Project 21 renamed to Alpha's name: a name match against a program already anchored.
    await db.exec(`UPDATE projects SET name = 'Alpha' WHERE id = 21`);
    await expect(apply(ANCHOR)).resolves.toBeDefined();
    const rows = await db.query<{ id: number }>(`SELECT id FROM projects WHERE regulatory_program_id = $1 ORDER BY id`, [P1]);
    expect(rows.rows.map((r) => r.id)).toEqual([10]);
  });
});
