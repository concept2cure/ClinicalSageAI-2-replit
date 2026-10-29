/**
 * A tenant purge is not stopped by the device and IVD records that name their
 * project with no delete action where their creating file's DDL ran first (D6,
 * 2026-10-29; docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * On an install-fresh database drizzle push creates udi_records,
 * software_lifecycle_items and the IVD tables before the migration set, so
 * their `CREATE TABLE IF NOT EXISTS` is skipped and their program key never
 * exists; ci:purge-coverage, which reads that database, cannot see it. On a
 * database where the creating file ran first, each one's
 * `program_id uuid REFERENCES regulatory_programs(id)` is NO ACTION
 * (migrations/20260507_mdx_beta_surfaces.sql, 20260508_ivd_diagnostic_surfaces.sql),
 * and the IVDR module's validations, clinical evidence and CDx workflows name
 * their classification the same way on every lineage
 * (migrations/001_create_ivdr_tables.sql). One such row and the purge failed
 * with 23503 and rolled back.
 *
 * Real DDL: each table's CREATE TABLE statement from those three files, as
 * written there, in set order. The purge runs the
 * real list in its real order, narrowed to the tables this schema has (as
 * tenant-purge-device-records.pglite.test.ts narrows it). The Part 11 change
 * histories of the IVDR records are not erased (PURGE_REFERRERS_NOT_ERASED): a
 * tenant holding one is not purged, which the last case pins.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { purgeTenant, PURGE_CHILD_TABLES } from '../tenant-offboarding';

vi.mock('../../../middleware/orgMembership', () => ({ invalidateOrgMembershipCache: vi.fn() }));

const ORG = 11;
const OTHER = 22;
const ACTOR = 7;
const DIGEST = 'synthetic-final-export';
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const OTHER_PROGRAM = '22222222-2222-4222-8222-222222222222';

/** The records each tenant files under its project, as the creating files declare them. */
const RECORDS = [
  'udi_records', 'software_lifecycle_items', 'ivd_analytical_performance', 'ivd_clinical_performance',
  'ivd_clia_categorization', 'ivdr_per_documents', 'cdx_pairings', 'cdx_concordance_studies',
  'ivdr_classifications', 'ivdr_analytical_validations', 'ivdr_clinical_evidence', 'ivdr_cdx_workflows',
];

let db: PGlite;
let pool: Pool;

async function file(rel: string): Promise<void> {
  await db.exec(await readFile(rel, 'utf8'));
}

/** One CREATE TABLE statement of a creating file, as written there. */
async function tableDdl(rel: string, table: string): Promise<string> {
  const text = await readFile(rel, 'utf8');
  const m = text.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`${table} not found in ${rel}`);
  return `CREATE TABLE IF NOT EXISTS ${table} (${m[1]}\n);`;
}

/** The creating files' statements for the device and IVD records, in set order. */
const CREATORS: Array<[string, string]> = [
  ['migrations/20260507_mdx_beta_surfaces.sql', 'udi_records'],
  ['migrations/20260507_mdx_beta_surfaces.sql', 'software_lifecycle_items'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'ivd_analytical_performance'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'ivd_clinical_performance'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'ivdr_classifications'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'ivdr_per_documents'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'ivd_clia_categorization'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'cdx_pairings'],
  ['migrations/20260508_ivd_diagnostic_surfaces.sql', 'cdx_concordance_studies'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_analytical_validations'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_validation_parameter_history'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_clinical_evidence'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_evidence_result_history'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_cdx_workflows'],
  ['migrations/001_create_ivdr_tables.sql', 'ivdr_cdx_status_history'],
];

/**
 * One of each record for `org`, under `program`, or with `only`, that record
 * alone and the parents it needs. Returns the validation id, when one is written.
 */
async function fileRecords(org: number, program: string, only?: string): Promise<number> {
  const one = async (sql: string, params: unknown[]) => (await db.query<{ id: number }>(sql, params)).rows[0]?.id;
  const wants = (...tables: string[]) => !only || tables.includes(only);
  if (wants('udi_records')) await one(`INSERT INTO udi_records (organization_id, program_id, device_name, udi_di, issuing_agency) VALUES ($1, $2, 'Pump', '0123', 'GS1') RETURNING id`, [org, program]);
  if (wants('software_lifecycle_items')) await one(`INSERT INTO software_lifecycle_items (organization_id, program_id, doc_level, item_kind, title) VALUES ($1, $2, 'basic', 'srs', 'SRS') RETURNING id`, [org, program]);
  if (wants('ivd_analytical_performance')) await one(`INSERT INTO ivd_analytical_performance (organization_id, program_id, study_type, title) VALUES ($1, $2, 'accuracy', 'Accuracy') RETURNING id`, [org, program]);
  if (wants('ivd_clinical_performance')) await one(`INSERT INTO ivd_clinical_performance (organization_id, program_id, title) VALUES ($1, $2, 'Sensitivity') RETURNING id`, [org, program]);
  if (wants('ivd_clia_categorization')) await one(`INSERT INTO ivd_clia_categorization (organization_id, program_id, test_name, clia_complexity) VALUES ($1, $2, 'Assay', 'moderate') RETURNING id`, [org, program]);
  if (wants('ivdr_per_documents')) await one(`INSERT INTO ivdr_per_documents (organization_id, program_id, device_name, per_version) VALUES ($1, $2, 'Assay', 'v1.0') RETURNING id`, [org, program]);
  if (wants('cdx_pairings', 'cdx_concordance_studies')) {
    const pairing = await one(`INSERT INTO cdx_pairings (organization_id, device_program_id, drug_name) VALUES ($1, $2, 'Drug') RETURNING id`, [org, program]);
    if (wants('cdx_concordance_studies')) await one(`INSERT INTO cdx_concordance_studies (organization_id, cdx_pairing_id, reference_assay, candidate_assay) VALUES ($1, $2, 'Trial assay', 'Device') RETURNING id`, [org, pairing]);
  }
  let validation = 0;
  if (wants('ivdr_classifications', 'ivdr_analytical_validations', 'ivdr_clinical_evidence', 'ivdr_cdx_workflows')) {
    const classification = await one(`INSERT INTO ivdr_classifications (organization_id, program_id, device_name, ivdr_class) VALUES ($1, $2, 'Assay', 'C') RETURNING id`, [org, program]);
    if (wants('ivdr_analytical_validations')) validation = await one(`INSERT INTO ivdr_analytical_validations (organization_id, classification_id, device_name, analyte_name) VALUES ($1, $2, 'Assay', 'HER2') RETURNING id`, [org, classification]) as number;
    if (wants('ivdr_clinical_evidence')) await one(`INSERT INTO ivdr_clinical_evidence (organization_id, classification_id, validation_id, study_title, study_type) VALUES ($1, $2, $3, 'Study', 'retrospective') RETURNING id`, [org, classification, validation || null]);
    if (wants('ivdr_cdx_workflows')) await one(`INSERT INTO ivdr_cdx_workflows (organization_id, classification_id, medicinal_product_name, biomarker) VALUES ($1, $2, 'Drug', 'HER2') RETURNING id`, [org, classification]);
  }
  return validation;
}

let validationOfOrg = 0;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE organizations (id int PRIMARY KEY, name text, status text,
      deletion_requested_at timestamptz, deletion_requested_by int, deletion_reason text,
      purge_eligible_at timestamptz, purged_at timestamptz, purged_by int,
      final_export_digest text, final_export_at timestamptz, api_key text,
      stripe_subscription_id text, updated_at timestamptz, settings jsonb DEFAULT '{}', slug text);
    CREATE TABLE users (id int PRIMARY KEY);
    CREATE TABLE tenant_export_receipts (organization_id int, digest text,
      table_count int, row_count bigint, created_at timestamptz, created_by int);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL);
    CREATE TABLE qms_documents (id int PRIMARY KEY, organization_id int, status text, metadata jsonb DEFAULT '{}');
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id int);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY, doc_id uuid, tenant_id int);
    CREATE TABLE submission_orchestrator_runs (run_id uuid PRIMARY KEY, organization_id int);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds (organization_id int, lifted_at timestamptz);
    CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id int, user_id int, action text,
      table_name text, record_id text, actor_id int, target text, payload_hash text,
      sha256_chain text, occurred_at timestamptz, hmac_seal text, old_values jsonb,
      new_values jsonb, ip_address inet, user_agent text, reason text,
      chain_seq bigint GENERATED ALWAYS AS IDENTITY);
    INSERT INTO organizations (id, name, status, purge_eligible_at) VALUES
      (11, 'Synthetic tenant', 'pending_deletion', now() - interval '1 day'),
      (22, 'Other synthetic tenant', 'active', NULL);
    INSERT INTO users VALUES (7);
    INSERT INTO tenant_export_receipts VALUES (11, 'synthetic-final-export', 5, 9, now(), 7);
    INSERT INTO regulatory_programs VALUES
      ('11111111-1111-4111-8111-111111111111', 11),
      ('22222222-2222-4222-8222-222222222222', 22);
  `);
  for (const f of [
    'db/migrations/20261014_qms_controlled_authoring_content.sql',
    'db/migrations/20261014_orchestrator_continuation_inputs.sql',
    'migrations/20260531_template_specs.sql',
    'migrations/20261018_company_document_governance.sql',
    'migrations/20261018_company_document_designs.sql',
    'migrations/20261018_company_legal_registry.sql',
    'migrations/20260813b_tenant_export_receipts.sql',
    'migrations/20261018_company_document_export_receipts.sql',
  ]) await file(f);
  for (const [f, table] of CREATORS) await db.exec(await tableDdl(f, table));

  validationOfOrg = await fileRecords(ORG, PROGRAM);
  await fileRecords(OTHER, OTHER_PROGRAM);

  const query = async (text: string, params?: unknown[]) => {
    const result = await db.query(text, params);
    return { ...result, rowCount: result.affectedRows };
  };
  pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
}, 60_000);

afterEach(async () => { await db.close(); });

/** The real list, in its real order, narrowed to the tables this schema has. */
const present = async () => {
  const { rows } = await db.query<{ t: string }>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'`);
  const here = new Set(rows.map((r) => r.t));
  return PURGE_CHILD_TABLES.filter((t) => here.has(t));
};
const purge = async () => purgeTenant(pool, {
  organizationId: ORG, purgedByUserId: ACTOR,
  preconditions: { finalExportDigest: DIGEST },
  childTables: await present(),
});
const orgsIn = async (table: string) =>
  (await db.query<{ organization_id: number }>(`SELECT DISTINCT organization_id FROM ${table} ORDER BY organization_id`)).rows
    .map((r) => r.organization_id);

describe('a tenant whose device and IVD records name its project with no delete action', () => {
  it('the creating files give those records that key', async () => {
    const { rows } = await db.query<{ t: string }>(
      `SELECT DISTINCT c.relname AS t FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.contype = 'f' AND con.confrelid = 'regulatory_programs'::regclass AND con.confdeltype = 'a' ORDER BY 1`);
    // submission_orchestrator_inputs (20261014) has one too: a retained record,
    // refused before any purge write when populated (PURGE_RETAINED_RECORDS).
    expect(rows.map((r) => r.t).filter((t) => t !== 'submission_orchestrator_inputs')).toEqual([
      'cdx_pairings', 'ivd_analytical_performance', 'ivd_clia_categorization', 'ivd_clinical_performance',
      'ivdr_classifications', 'ivdr_per_documents', 'software_lifecycle_items', 'udi_records',
    ]);
  });

  it('is purged: every one of them goes, and the other tenant keeps all of its own', async () => {
    const result = await purge();
    expect(result.status).toBe('purged');
    for (const table of [...RECORDS, 'regulatory_programs']) expect(await orgsIn(table), table).toEqual([OTHER]);
  });

  it('the list names each before the project, and the IVDR module tables before their classification', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    for (const t of RECORDS.filter((r) => r !== 'cdx_concordance_studies')) {
      expect(at(t), t).toBeGreaterThan(-1);
      expect(at(t), t).toBeLessThan(at('regulatory_programs'));
    }
    for (const t of ['ivdr_analytical_validations', 'ivdr_clinical_evidence', 'ivdr_cdx_workflows']) {
      expect(at(t), t).toBeLessThan(at('ivdr_classifications'));
    }
    expect(at('ivdr_clinical_evidence')).toBeLessThan(at('ivdr_analytical_validations'));
  });

  // One blocker at a time: a third tenant holding only that record (and the parents it needs).
  it.each(RECORDS)('holding only a %s row, is purged, and the other tenant keeps its own', async (table) => {
    const LONE = 33;
    const LONE_PROGRAM = '33333333-3333-4333-8333-333333333333';
    await db.query(`INSERT INTO organizations (id, name, status, purge_eligible_at) VALUES ($1, 'Lone tenant', 'pending_deletion', now() - interval '1 day')`, [LONE]);
    await db.query(`INSERT INTO tenant_export_receipts VALUES ($1, 'lone-export', 1, 1, now(), 7)`, [LONE]);
    await db.query('INSERT INTO regulatory_programs VALUES ($1, $2)', [LONE_PROGRAM, LONE]);
    await fileRecords(LONE, LONE_PROGRAM, table);
    const result = await purgeTenant(pool, {
      organizationId: LONE, purgedByUserId: ACTOR, preconditions: { finalExportDigest: 'lone-export' }, childTables: await present(),
    });
    expect(result.status).toBe('purged');
    expect(await orgsIn(table)).toEqual([ORG, OTHER]);
  });

  it('holding a Part 11 change history of a validation, is not purged: 23503, rolled back, nothing erased', async () => {
    await db.query(
      `INSERT INTO ivdr_validation_parameter_history (validation_id, parameters, reason) VALUES ($1, '{}', 'Recalibrated')`,
      [validationOfOrg]);
    await expect(purge()).rejects.toMatchObject({ code: '23503' });
    expect((await db.query<{ status: string }>('SELECT status FROM organizations WHERE id = $1', [ORG])).rows[0].status)
      .toBe('pending_deletion');
    for (const table of RECORDS) expect(await orgsIn(table), table).toEqual([ORG, OTHER]);
  });
});
