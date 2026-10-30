/**
 * migrations/20261030_estar_filing_one_store.sql: one device-filing store,
 * estar_submissions (D2, fold F5 item 1, 2026-10-30; decision P-61 item 1;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * Real DDL, read from each table's creator: organizations, users and projects
 * from the base schema, regulatory_programs (20260524) and the project anchor
 * (20260814), the package store and its milestones from their only creator
 * (migrations/0002_phase15_submission_ops.sql, on no deploy applier, so a
 * deployed database may not hold them), and estar_submissions from the three
 * files on the set. Every deploy replays the file (CLAUDE.md Rule 1), so it is
 * applied three times, with rows between replays.
 *
 * What it pins:
 *   - the file is on the deploy set, after every estar_submissions creator and
 *     before the final sweep pair;
 *   - with no package store it creates the event history and migrates nothing;
 *   - each device package (510(k), De Novo, PMA) on a project of its own
 *     organization becomes one tracked filing, at draft or withdrawn and never
 *     filed, with its import event and its milestones as events; IND, CER and a
 *     package on another organization's project stay where they are; a replay
 *     adds nothing; the package rows are not touched;
 *   - the history is append-only, held to its filing's organization, and goes
 *     with its filing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2C_MIGRATION_FILES, UUID_TENANT_ISOLATION_NONPUBLIC } from '../../scripts/db/migration-set.mjs';
import { extractTableDdl } from '../golden-journeys/harness';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const FILE = 'migrations/20261030_estar_filing_one_store.sql';
const ESTAR = [
  'migrations/20260730_estar_submission.sql',
  'migrations/20260730_estar_submission_project_link.sql',
  'migrations/20260908b_estar_submissions_filed_artifact.sql',
];
const BASE = 'migrations/0000_sweet_joseph.sql';
const PROGRAMS = 'migrations/20260524_program_workbench_schema.sql';
const ANCHOR = 'migrations/20260814_projects_regulatory_program_anchor.sql';
const PACKAGES = 'migrations/0002_phase15_submission_ops.sql';

function baseTables(): string {
  const src = read(BASE);
  return ['organizations', 'users', 'projects'].map((t) => {
    const m = src.match(new RegExp(`CREATE TABLE "${t}" \\([\\s\\S]*?\\n\\);`));
    if (!m) throw new Error(`${t} not found in ${BASE}`);
    return m[0];
  }).join('\n');
}

const code = async (p: Promise<unknown>) => p.then(() => 'ok', (e: { code?: string }) => e.code ?? String(e));

async function schemaWith(packageStore: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(baseTables());
  await db.exec(read(PROGRAMS));
  await db.exec(read(ANCHOR));
  if (packageStore) await db.exec(extractTableDdl(PACKAGES, ['c2c_submission_packages', 'c2c_milestones']));
  for (const f of ESTAR) await db.exec(read(f));
  return db;
}

describe('the file is on the deploy set', () => {
  it('after every estar_submissions creator and before the final sweep pair', () => {
    const at = (f: string) => C2C_MIGRATION_FILES.indexOf(f);
    expect(at(FILE)).toBeGreaterThan(-1);
    for (const f of [...ESTAR, PROGRAMS, ANCHOR]) expect(at(FILE), f).toBeGreaterThan(at(f));
    expect(at(FILE)).toBeLessThan(at(UUID_TENANT_ISOLATION_NONPUBLIC));
  });
});

describe('a database that never had the package store', () => {
  let db: PGlite;
  beforeAll(async () => { db = await schemaWith(false); }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('gets the event history and migrates nothing, on every replay', async () => {
    for (let i = 0; i < 3; i += 1) await db.exec(read(FILE));
    expect((await db.query(`SELECT to_regclass('public.estar_submission_events') AS t`)).rows).toEqual([{ t: 'estar_submission_events' }]);
    expect((await db.query('SELECT count(*)::int AS n FROM estar_submissions')).rows).toEqual([{ n: 0 }]);
  });
});

describe('a database holding device packages', () => {
  let db: PGlite;
  const PROG_DEVICE = '00000000-0000-4000-8000-0000000000d1';
  const PROG_IVD = '00000000-0000-4000-8000-0000000000d2';
  let packagesBefore: unknown[];

  beforeAll(async () => {
    db = await schemaWith(true);
    await db.exec(`
      INSERT INTO organizations (id, name, slug) VALUES (1, 'Acme Devices', 'acme'), (2, 'Other Org', 'other');
      INSERT INTO users (id, email, name, password_hash) VALUES (5, 'ra@acme.test', 'RA lead', 'x'), (6, 'qa@acme.test', 'QA lead', 'x');
      INSERT INTO regulatory_programs (id, organization_id, name, code, program_type, product_type, primary_agency, product_name)
        VALUES ('${PROG_DEVICE}', 1, 'Pump', 'PUMP', '510K', 'device', 'FDA', 'Infusion pump'),
               ('${PROG_IVD}', 1, 'Assay', 'ASSAY', '510K', 'ivd', 'FDA', 'Troponin assay');
      INSERT INTO projects (id, organization_id, client_workspace_id, name, type, regulatory_program_id)
        VALUES (11, 1, 1, 'Pump', 'device', '${PROG_DEVICE}'), (12, 1, 1, 'Assay', 'device', '${PROG_IVD}'),
               (21, 2, 1, 'Theirs', 'device', NULL);
      INSERT INTO c2c_submission_packages (id, package_id, org_id, project_id, package_family, title, description, target_date, status, created_by_id, created_at, updated_at)
        VALUES (1, 'pkg_510k',   1, 11, '510k',    'Pump 510(k)',      'traditional', '2026-12-01', 'active',    5, '2026-08-01', '2026-08-02'),
               (2, 'pkg_pma',    1, 11, 'PMA',     'Pump PMA',          NULL,         NULL,         'completed', 5, '2026-08-03', '2026-08-04'),
               (3, 'pkg_denovo', 1, 11, 'de_novo', 'Pump De Novo',      NULL,         NULL,         'cancelled', 6, '2026-08-05', '2026-08-06'),
               (4, 'pkg_ivd',    1, 12, '510(k)',  'Assay 510(k)',      NULL,         NULL,         'locked',    5, '2026-08-07', '2026-08-08'),
               (5, 'pkg_ind',    1, 11, 'ind',     'Not a device IND',  NULL,         NULL,         'active',    5, '2026-08-09', '2026-08-09'),
               (6, 'pkg_cer',    1, 11, 'cer',     'EU MDR CER',        NULL,         NULL,         'active',    5, '2026-08-10', '2026-08-10'),
               (7, 'pkg_foreign',1, 21, '510k',    'On their project',  NULL,         NULL,         'active',    5, '2026-08-11', '2026-08-11');
      INSERT INTO c2c_milestones (milestone_id, org_id, package_db_id, title, target_date, gate_status, created_by_id, created_at)
        VALUES ('ms_1', 1, 1, 'Biocompatibility report final', '2026-10-01', 'passed', 6, '2026-08-20'),
               ('ms_2', 1, 1, 'Software documentation', NULL, 'open', 5, '2026-08-21'),
               ('ms_ind', 1, 5, 'IND milestone', NULL, 'open', 5, '2026-08-22');
    `);
    packagesBefore = (await db.query('SELECT * FROM c2c_submission_packages ORDER BY id')).rows;
    await db.exec(read(FILE));
    // Rows written between deploys stay as they are on the next replays.
    await db.exec(read(FILE));
    await db.exec(read(FILE));
  }, 60_000);
  afterAll(async () => { await db?.close(); });

  it('makes each device package on its own organization\'s project one tracked filing, never filed', async () => {
    const rows = (await db.query(
      `SELECT source_package_id, organization_id, project_id, catalog_key, program_type, variant, title, status,
              filed_at, created_by, to_char(created_at, 'YYYY-MM-DD') AS created
         FROM estar_submissions ORDER BY source_package_id`)).rows;
    expect(rows).toEqual([
      { source_package_id: 'pkg_510k', organization_id: 1, project_id: 11, catalog_key: '510k', program_type: '510k', variant: 'device', title: 'Pump 510(k)', status: 'draft', filed_at: null, created_by: 5, created: '2026-08-01' },
      { source_package_id: 'pkg_denovo', organization_id: 1, project_id: 11, catalog_key: 'de_novo', program_type: 'de_novo', variant: 'device', title: 'Pump De Novo', status: 'withdrawn', filed_at: null, created_by: 6, created: '2026-08-05' },
      { source_package_id: 'pkg_ivd', organization_id: 1, project_id: 12, catalog_key: '510k', program_type: '510k', variant: 'ivd', title: 'Assay 510(k)', status: 'draft', filed_at: null, created_by: 5, created: '2026-08-07' },
      { source_package_id: 'pkg_pma', organization_id: 1, project_id: 11, catalog_key: 'pma_original', program_type: 'pma', variant: 'device', title: 'Pump PMA', status: 'draft', filed_at: null, created_by: 5, created: '2026-08-03' },
    ]);
  });

  it('names what each package recorded in its import event, and keeps each milestone as an event', async () => {
    const events = (await db.query<{ source: string; event_type: string; to_status: string | null; actor_user_id: number | null; detail: Record<string, unknown> }>(
      `SELECT s.source_package_id AS source, e.event_type, e.to_status, e.actor_user_id, e.detail
         FROM estar_submission_events e JOIN estar_submissions s ON s.id = e.submission_id
        ORDER BY s.source_package_id, e.occurred_at, e.id`)).rows;
    expect(events.map((e) => [e.source, e.event_type])).toEqual([
      ['pkg_510k', 'imported_package'], ['pkg_510k', 'imported_milestone'], ['pkg_510k', 'imported_milestone'],
      ['pkg_denovo', 'imported_package'], ['pkg_ivd', 'imported_package'], ['pkg_pma', 'imported_package'],
    ]);
    const pma = events.find((e) => e.source === 'pkg_pma')!;
    expect(pma).toMatchObject({ to_status: 'draft', actor_user_id: null });
    expect(pma.detail).toMatchObject({ from: 'c2c_submission_packages', packageId: 'pkg_pma', packageFamily: 'PMA', packageStatus: 'completed' });
    expect(String(pma.detail.note)).toMatch(/never carried/);
    const milestone = events.filter((e) => e.event_type === 'imported_milestone')[0];
    expect(milestone).toMatchObject({ actor_user_id: 6, detail: { from: 'c2c_milestones', milestoneId: 'ms_1', title: 'Biocompatibility report final', gateStatus: 'passed' } });
  });

  it('leaves the packages that are not device filings, and the package rows themselves, untouched', async () => {
    const sources = (await db.query<{ s: string }>('SELECT source_package_id AS s FROM estar_submissions')).rows.map((r) => r.s);
    for (const kept of ['pkg_ind', 'pkg_cer', 'pkg_foreign']) expect(sources, kept).not.toContain(kept);
    expect((await db.query('SELECT * FROM c2c_submission_packages ORDER BY id')).rows).toEqual(packagesBefore);
  });

  it('adds nothing on a replay', async () => {
    const counts = async () => (await db.query(
      `SELECT (SELECT count(*)::int FROM estar_submissions) AS filings, (SELECT count(*)::int FROM estar_submission_events) AS events`)).rows[0];
    const before = await counts();
    expect(before).toEqual({ filings: 4, events: 6 });
    await db.exec(read(FILE));
    expect(await counts()).toEqual(before);
  });

  it('keeps a filing\'s history append-only, held to its organization, and gone with its filing', async () => {
    const [{ id }] = (await db.query<{ id: string }>(`SELECT id FROM estar_submissions WHERE source_package_id = 'pkg_510k'`)).rows;
    expect(await code(db.query(`UPDATE estar_submission_events SET detail = '{}'::jsonb WHERE submission_id = $1`, [id]))).toBe('42501');
    expect(await code(db.query('TRUNCATE estar_submission_events'))).toBe('42501');
    expect(await code(db.query(
      `INSERT INTO estar_submission_events (organization_id, submission_id, event_type) VALUES (2, $1, 'created')`, [id]))).toBe('23503');
    expect(await code(db.query(
      `INSERT INTO estar_submission_events (organization_id, submission_id, event_type) VALUES (1, $1, 'invented')`, [id]))).toBe('23514');
    await db.query('DELETE FROM estar_submissions WHERE id = $1', [id]);
    expect((await db.query('SELECT count(*)::int AS n FROM estar_submission_events WHERE submission_id = $1', [id])).rows).toEqual([{ n: 0 }]);
  });
});
