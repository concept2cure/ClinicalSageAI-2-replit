/**
 * The report-pack register gets its own tables (P-91, coverage review C-3).
 *
 * A pack was one `project_memory_entries` row per covered project, titled
 * `bundle:<uuid>`, its run ids inside a JSON string, reconciled newest-first
 * in JavaScript. migrations/20261108_report_bundle_register.sql gives it
 * public.report_bundles, report_bundle_runs and report_bundle_projects, each
 * `organization_id INTEGER NOT NULL`, and carries every existing pack across.
 *
 * CLAUDE.md RULE 1: every file in the set re-runs on every deploy. So this
 * applies the file twice, over legacy rows, and proves:
 *   - each pack is carried once, from its newest copy, with its runs and projects;
 *   - a corrupt legacy row is skipped with a notice, never aborting the deploy;
 *   - a pack that is silently NOT carried fails the deploy (the row-count
 *     assertion), so a partial register is never reported as complete;
 *   - under the set's own tenant sweep, a NOSUPERUSER / NOBYPASSRLS role sees and
 *     writes only its organisation's packs.
 * Nothing is dropped: the legacy rows are still there afterwards.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES, TENANT_ISOLATION_SWEEP } from '../../../scripts/db/migration-set.mjs';

const FILE = 'migrations/20261108_report_bundle_register.sql';
const SWEEP_SQL = fs.readFileSync(path.join(process.cwd(), TENANT_ISOLATION_SWEEP), 'utf8');
const T = 120_000;
const sql = () => fs.readFileSync(path.join(process.cwd(), FILE), 'utf8');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

/** The two tables the file reads or references, as the set has them. */
const PREREQUISITES = `
  CREATE TABLE organizations (id serial PRIMARY KEY);
  INSERT INTO organizations (id) VALUES (7), (8);
  CREATE TABLE project_memory_entries (
    id serial PRIMARY KEY,
    project_id integer NOT NULL,
    organization_id integer NOT NULL REFERENCES organizations(id),
    category text NOT NULL,
    subcategory text,
    title text NOT NULL,
    content text NOT NULL,
    source_document_type text,
    created_at timestamp DEFAULT now() NOT NULL
  );`;

const record = (bundleId: string, organizationId: number, runIds: number[], projectIds: number[], name = 'Pack') =>
  JSON.stringify({ bundleRecord: {
    bundleId, organizationId, name, createdAt: '2026-10-01T10:00:00.000Z', createdBy: 5,
    projectIds, runIds, items: runIds.map((runId) => ({ runId })),
  } });

/** How persistBundleRecord wrote a pack: the same content under each covered project. */
type LegacyPack = { bundleId: string; organizationId: number; runIds: number[]; projectIds: number[]; name?: string; at?: string };
async function legacyPack(pg: PGlite, { bundleId, organizationId, runIds, projectIds, name, at = '2026-10-01 10:00:00' }: LegacyPack) {
  for (const projectId of projectIds) {
    await pg.query(
      `INSERT INTO project_memory_entries (project_id, organization_id, category, subcategory, title, content, source_document_type, created_at)
       VALUES ($1, $2, 'regulatory', 'report_bundle_record', $3, $4, 'report_os_state', $5)`,
      [projectId, organizationId, `bundle:${bundleId}`, record(bundleId, organizationId, runIds, projectIds, name), at],
    );
  }
}

async function rows<T>(pg: PGlite, q: string): Promise<T[]> {
  return (await pg.query<T>(q)).rows;
}

describe(FILE, () => {
  it('is in the deploy set, ahead of the isolation tail', () => {
    const files = C2C_MIGRATION_FILES as readonly string[];
    const at = files.indexOf(FILE);
    expect(at, 'the report-pack register is on no deploy path').toBeGreaterThan(-1);
    expect(at).toBeLessThan(files.indexOf(TENANT_ISOLATION_SWEEP) - 2);
  });

  it('carries every legacy pack once, with its runs and projects, and re-runs as a no-op', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQUISITES);
      await legacyPack(pg, { bundleId: A, organizationId: 7, runIds: [41, 42], projectIds: [1, 2], name: 'Older name', at: '2026-10-01 10:00:00' });
      await legacyPack(pg, { bundleId: A, organizationId: 7, runIds: [41, 42], projectIds: [1, 2], name: 'Newest name', at: '2026-10-02 10:00:00' });
      await legacyPack(pg, { bundleId: B, organizationId: 8, runIds: [51], projectIds: [3] });
      // A corrupt copy is skipped with a notice; it must not abort the deploy.
      await pg.query(`INSERT INTO project_memory_entries (project_id, organization_id, category, subcategory, title, content, source_document_type)
                      VALUES (1, 7, 'regulatory', 'report_bundle_record', 'bundle:${C}', '{not json', 'report_os_state')`);
      const legacyBefore = (await rows<{ n: number }>(pg, `SELECT count(*)::int AS n FROM project_memory_entries`))[0].n;

      for (let deploy = 0; deploy < 2; deploy++) await pg.exec(sql());

      expect(await rows(pg, `SELECT id::text, organization_id, name, byte_length > 0 AS sized, length(payload_hash) AS hash FROM report_bundles ORDER BY id`)).toEqual([
        { id: A, organization_id: 7, name: 'Newest name', sized: true, hash: 64 },
        { id: B, organization_id: 8, name: 'Pack', sized: true, hash: 64 },
      ]);
      expect(await rows(pg, `SELECT bundle_id::text, run_id, position FROM report_bundle_runs ORDER BY bundle_id, position`)).toEqual([
        { bundle_id: A, run_id: 41, position: 1 },
        { bundle_id: A, run_id: 42, position: 2 },
        { bundle_id: B, run_id: 51, position: 1 },
      ]);
      expect(await rows(pg, `SELECT bundle_id::text, project_id, organization_id FROM report_bundle_projects ORDER BY bundle_id, project_id`)).toEqual([
        { bundle_id: A, project_id: 1, organization_id: 7 },
        { bundle_id: A, project_id: 2, organization_id: 7 },
        { bundle_id: B, project_id: 3, organization_id: 8 },
      ]);
      // The manifest is kept whole: every reader decodes the same record as before.
      const [kept] = await rows<{ record: Record<string, unknown> }>(pg, `SELECT record FROM report_bundles WHERE id = '${A}'`);
      expect(kept.record).toMatchObject({ bundleId: A, organizationId: 7, runIds: [41, 42], projectIds: [1, 2] });
      // RULE 1: nothing is dropped. The legacy rows stay where they were.
      expect((await rows<{ n: number }>(pg, `SELECT count(*)::int AS n FROM project_memory_entries`))[0].n).toBe(legacyBefore);
    } finally {
      await pg.close();
    }
  }, T);

  it('refuses a row whose manifest names another pack or organisation', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQUISITES);
      await pg.exec(sql());
      await expect(pg.query(`INSERT INTO report_bundles (id, organization_id, name, created_at, record, byte_length, payload_hash)
        VALUES ('${A}', 7, 'x', now(), '{"bundleId":"${B}","organizationId":7}', 1, 'h')`)).rejects.toThrow(/check constraint/);
      await expect(pg.query(`INSERT INTO report_bundles (id, organization_id, name, created_at, record, byte_length, payload_hash)
        VALUES ('${A}', 7, 'x', now(), '{"bundleId":"${A}","organizationId":8}', 1, 'h')`)).rejects.toThrow(/check constraint/);
    } finally {
      await pg.close();
    }
  }, T);

  it('fails the deploy when a legacy pack is silently not carried', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQUISITES);
      await pg.exec(sql());
      // The register already holds pack A under ANOTHER organisation, so the
      // backfill's ON CONFLICT DO NOTHING would skip organisation 7's pack A
      // without a word. The count must catch it.
      await pg.query(`INSERT INTO report_bundles (id, organization_id, name, created_at, record, byte_length, payload_hash)
        VALUES ('${A}', 8, 'Someone else', now(), '{"bundleId":"${A}","organizationId":8}', 1, 'h')`);
      await legacyPack(pg, { bundleId: A, organizationId: 7, runIds: [41], projectIds: [1] });
      await expect(pg.exec(sql())).rejects.toThrow(/report-pack register/);
    } finally {
      await pg.close();
    }
  }, T);

  it('under the set\'s tenant sweep, an organisation reads and writes only its own packs', async () => {
    const pg = new PGlite();
    try {
      await pg.exec(PREREQUISITES);
      await legacyPack(pg, { bundleId: A, organizationId: 7, runIds: [41], projectIds: [1] });
      await legacyPack(pg, { bundleId: B, organizationId: 8, runIds: [51], projectIds: [3] });
      await pg.exec(sql());
      await pg.exec(SWEEP_SQL);
      await pg.exec(`CREATE ROLE report_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS;
        GRANT SELECT, INSERT ON report_bundles, report_bundle_runs, report_bundle_projects TO report_runtime;`);

      const asOrg = async <R>(org: number, q: string) => {
        await pg.exec(`SET ROLE report_runtime; SET app.rls_enforce = 'on'; SET app.current_tenant_id = '${org}';`);
        try { return (await pg.query<R>(q)).rows; } finally { await pg.exec('RESET ROLE; RESET app.rls_enforce; RESET app.current_tenant_id;'); }
      };
      for (const table of ['report_bundles', 'report_bundle_runs', 'report_bundle_projects']) {
        const col = table === 'report_bundles' ? 'id' : 'bundle_id';
        expect(await asOrg(7, `SELECT ${col}::text AS id FROM ${table}`), table).toEqual([{ id: A }]);
        expect(await asOrg(8, `SELECT ${col}::text AS id FROM ${table}`), table).toEqual([{ id: B }]);
      }
      await expect(asOrg(7, `INSERT INTO report_bundle_projects (bundle_id, organization_id, project_id) VALUES ('${B}', 8, 9)`))
        .rejects.toThrow(/row-level security/);
    } finally {
      await pg.close();
    }
  }, T);
});
