/**
 * eCTD submission-agent subsystem — reachability + isolation contract (C-32).
 *
 * `server/services/ectd-submission-agent.ts` sits behind MOUNTED routes
 * (`ectd-submission-agent.routes`, registered by bootstrap/register-document-
 * routes.ts) and writes five tables: ectd_agency_configs, ectd_submissions,
 * ectd_submission_documents, ectd_submission_validations,
 * ectd_submission_status_history. Their only creator,
 * db/migrations/082_ectd_submission_agent.sql, was on NO durable apply path — not
 * `_gcc_`, not in the drizzle journal, not in any applier's list — and none of
 * those tables is on the drizzle push surface either. So every endpoint on that
 * router 500'd with a missing-relation error on a real deploy, while
 * ci:unbacked-tables reported the tables "backed" (it counts any .sql file as a
 * creator, whether or not an applier runs it — the blind spot C-32 closes).
 *
 * This pins the fix at the level that actually matters:
 *   1. the file is on C2C_MIGRATION_FILES — the list deploy-migrate.mjs and
 *      apply-c2c-migrations.mjs consume — not merely present in the repo;
 *   2. applying it to a real (PGlite) Postgres creates all five tables and is
 *      re-runnable (a deploy applies the whole set on every run);
 *   3. the service's real INSERT executes against the result, including the
 *      ectd_submissions → ectd_agency_configs FK that ordering must satisfy;
 *   4. the four org_id lifecycle tables are tenant-isolated, and that isolation
 *      genuinely blocks a cross-tenant read under RLS_ENFORCE=on — 0021 has
 *      already run on this apply path and would never revisit a new table, so
 *      without C-32's policy block every tenant's submission history would be
 *      readable by every other tenant;
 *   5. ectd_agency_configs is deliberately NOT policied — global gateway
 *      reference data with no org_id, seeded for all tenants.
 *
 * @compliance 21 CFR Part 11 — submission records and their status history are
 *             regulatory evidence; storage that does not exist keeps none.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../../scripts/db/migration-set.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = 'db/migrations/082_ectd_submission_agent.sql';

const SUBSYSTEM_TABLES = [
  'ectd_agency_configs',
  'ectd_submissions',
  'ectd_submission_documents',
  'ectd_submission_validations',
  'ectd_submission_status_history',
];
/** The four that carry org_id and must be tenant-isolated. */
const TENANT_TABLES = SUBSYSTEM_TABLES.filter((t) => t !== 'ectd_agency_configs');

let pg: PGlite;

beforeAll(async () => {
  pg = new PGlite();
  const sql = fs.readFileSync(path.join(REPO_ROOT, MIGRATION), 'utf8');
  // Applied TWICE: a deploy re-runs the whole migration set on every deploy, so a
  // non-idempotent file would break the second one.
  await pg.exec(sql);
  await pg.exec(sql);

  // RLS is enforced only for NON-superusers; PGlite's default session role is a
  // superuser, which bypasses every policy even under FORCE (FORCE binds the
  // table OWNER, not a superuser). The isolation assertions run as a plain role.
  await pg.exec(
    `CREATE ROLE app_user NOSUPERUSER;
     GRANT SELECT ON ectd_submissions TO app_user;`,
  );
});

afterAll(async () => {
  await pg.close();
});

describe('C-32: the subsystem is on a durable apply path', () => {
  it('082_ectd_submission_agent.sql is in C2C_MIGRATION_FILES', () => {
    // Presence in db/migrations/ provisions nothing — an applier must name it.
    expect(C2C_MIGRATION_FILES).toContain(MIGRATION);
  });

  it('applying it creates all five tables, and re-applying is a clean no-op', async () => {
    const { rows } = await pg.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const have = new Set(rows.map((r) => r.table_name));
    const missing = SUBSYSTEM_TABLES.filter((t) => !have.has(t));
    expect(missing, `not created: ${missing.join(', ')}`).toEqual([]);
  });

  it('seeds the four agency gateway configs exactly once across both applications', async () => {
    // The seed is ON CONFLICT (agency_code) DO NOTHING; a second apply must not
    // duplicate it.
    const { rows } = await pg.query<{ agency_code: string }>(
      `SELECT agency_code FROM ectd_agency_configs ORDER BY agency_code`,
    );
    expect(rows.map((r) => r.agency_code)).toEqual(['EMA', 'FDA', 'HC', 'PMDA']);
  });
});

describe("C-32: the service's real SQL executes against the provisioned schema", () => {
  it('prepareSubmission-shaped INSERT succeeds, satisfying the agency FK', async () => {
    const { rows } = await pg.query<{ id: number; submission_uid: string }>(
      `INSERT INTO ectd_submissions
         (org_id, project_id, submission_type, application_type, application_number,
          sequence_number, agency, center, applicant_name, drug_name, indication)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, submission_uid`,
      [1, 10, 'initial', 'IND', 'IND-123456', '0000', 'FDA', 'CDER', 'Acme', 'Drug X', 'Onc'],
    );
    expect(rows[0]?.id).toBeGreaterThan(0);
    expect(rows[0]?.submission_uid).toMatch(/^sub_/);
  });

  it('rejects an agency the config table does not know (the FK is real)', async () => {
    await expect(
      pg.query(
        `INSERT INTO ectd_submissions (org_id, submission_type, agency) VALUES (1, 'initial', 'NOPE')`,
      ),
    ).rejects.toThrow();
  });

  it('status-history and document children cascade from their submission', async () => {
    const { rows } = await pg.query<{ id: number }>(
      `INSERT INTO ectd_submissions (org_id, submission_type, agency) VALUES (1, 'initial', 'FDA') RETURNING id`,
    );
    const id = rows[0].id;
    await pg.query(
      `INSERT INTO ectd_submission_status_history (submission_id, org_id, from_status, to_status, change_reason)
       VALUES ($1, 1, 'draft', 'assembling', 'test')`,
      [id],
    );
    await pg.query(
      `INSERT INTO ectd_submission_documents
         (submission_id, org_id, module, section_code, document_path, file_name, md5_checksum)
       VALUES ($1, 1, 'm2', '2.5', 'm2/25-clin-over.pdf', '25-clin-over.pdf', 'abc123')`,
      [id],
    );
    await pg.query(`DELETE FROM ectd_submissions WHERE id = $1`, [id]);
    const hist = await pg.query(
      `SELECT id FROM ectd_submission_status_history WHERE submission_id = $1`,
      [id],
    );
    const docs = await pg.query(
      `SELECT id FROM ectd_submission_documents WHERE submission_id = $1`,
      [id],
    );
    expect(hist.rows).toHaveLength(0);
    expect(docs.rows).toHaveLength(0);
  });
});

describe('C-32: tenant isolation is part of the unit', () => {
  it('every org_id lifecycle table carries tenant_isolation_policy', async () => {
    const { rows } = await pg.query<{ tablename: string }>(
      `SELECT tablename FROM pg_policies WHERE policyname = 'tenant_isolation_policy'`,
    );
    const policied = new Set(rows.map((r) => r.tablename));
    const unpolicied = TENANT_TABLES.filter((t) => !policied.has(t));
    expect(unpolicied, `no tenant_isolation_policy on: ${unpolicied.join(', ')}`).toEqual([]);
  });

  it('ectd_agency_configs is intentionally NOT policied (global reference data)', async () => {
    const { rows } = await pg.query(
      `SELECT 1 FROM pg_policies WHERE tablename = 'ectd_agency_configs'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('under RLS_ENFORCE=on a foreign tenant cannot read another tenant’s submissions', async () => {
    await pg.exec(`RESET ROLE; SET app.rls_enforce = 'off';`);
    const { rows } = await pg.query<{ id: number }>(
      `INSERT INTO ectd_submissions (org_id, submission_type, agency, application_number)
       VALUES (7, 'initial', 'FDA', 'IND-TENANT-7') RETURNING id`,
    );
    const id = rows[0].id;

    const readAs = async (tenant: string) => {
      await pg.exec(`RESET ROLE; SET app.rls_enforce = 'on'; SET app.current_tenant_id = '${tenant}'; SET ROLE app_user;`);
      const r = await pg.query(`SELECT id FROM ectd_submissions WHERE id = $1`, [id]);
      await pg.exec('RESET ROLE;');
      return r.rows.length;
    };

    expect(await readAs('7')).toBe(1); // the owner still sees it
    expect(await readAs('8')).toBe(0); // a different tenant does not
  });

  it('shadow mode (the raw-pool default) passes rows through unchanged', async () => {
    await pg.exec(`RESET ROLE; SET app.rls_enforce = 'off'; SET app.current_tenant_id = '999'; SET ROLE app_user;`);
    const r = await pg.query(`SELECT id FROM ectd_submissions WHERE application_number = 'IND-TENANT-7'`);
    await pg.exec('RESET ROLE;');
    expect(r.rows).toHaveLength(1);
  });
});
