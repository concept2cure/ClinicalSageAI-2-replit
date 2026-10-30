/**
 * A tenant purge erases the device risk file and the nonconformance log, and is
 * not stopped by them (D6, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/engineering-panels-keyed/).
 *
 * PURGE_CHILD_TABLES did not name risk_items or risk_controls. That was not
 * only residue: risk_items.program_id REFERENCES regulatory_programs(id) with
 * NO ACTION (migrations/20260507_mdx_beta_surfaces.sql), and since 20261029c
 * risk_items_program_same_org_fk is NO ACTION too on that lineage. The purge
 * deletes regulatory_programs and rethrows anything but 42P01/42703, so the
 * purge of any tenant with one hazard filed under a project failed with 23503
 * and rolled back. qms_nonconforming_products gains a program key in 20261029d
 * (ON DELETE SET NULL (program_id), so it never blocks), and its records are
 * the tenant's content, so it is named too.
 *
 * Real DDL: the risk_items and risk_controls statements of 20260507, the
 * qms_nonconforming_products statement of 20260511, then 20261029c and
 * 20261029d. The purge runs the real list in its real order, narrowed to the
 * tables this schema has (as tenant-purge-regulated-retention.pglite.test.ts
 * narrows it), so a table the list does not name is not deleted here either.
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

/** The tables this schema has that a purge of them may name. */
const DEVICE_TABLES = ['risk_controls', 'risk_items', 'qms_nonconforming_products', 'regulatory_programs'];

/** One CREATE TABLE statement of a creating file, as written there. */
async function tableDdl(file: string, table: string): Promise<string> {
  const text = await readFile(file, 'utf8');
  const m = text.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`${table} not found in ${file}`);
  return `CREATE TABLE IF NOT EXISTS ${table} (${m[1]}\n);`;
}

let db: PGlite;
let pool: Pool;

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
      table_count int, row_count bigint, created_at timestamptz, created_by int, export_scope text);
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
    INSERT INTO tenant_export_receipts VALUES (11, 'synthetic-final-export', 5, 9, now(), 7, 'organization');
    INSERT INTO regulatory_programs VALUES
      ('11111111-1111-4111-8111-111111111111', 11),
      ('22222222-2222-4222-8222-222222222222', 22);
  `);
  for (const file of [
    'db/migrations/20261014_qms_controlled_authoring_content.sql',
    'db/migrations/20261014_orchestrator_continuation_inputs.sql',
    'migrations/20260531_template_specs.sql',
    'migrations/20261018_company_document_governance.sql',
    'migrations/20261018_company_document_designs.sql',
    'migrations/20261018_company_legal_registry.sql',
    'migrations/20260813b_tenant_export_receipts.sql',
    'migrations/20261018_company_document_export_receipts.sql',
    // The offboarding certificate the purge writes (P-58).
    'migrations/20261029k_tenant_offboarding_custody.sql',
  ]) await db.exec(await readFile(file, 'utf8'));
  await db.exec(await tableDdl('migrations/20260507_mdx_beta_surfaces.sql', 'risk_items'));
  await db.exec(await tableDdl('migrations/20260507_mdx_beta_surfaces.sql', 'risk_controls'));
  await db.exec(await tableDdl('migrations/20260511_qms_and_labeling.sql', 'qms_nonconforming_products'));
  await db.exec(await readFile('migrations/20261029c_design_controls_and_risk_items_program_keys.sql', 'utf8'));
  await db.exec(await readFile('migrations/20261029d_nonconforming_products_program_key.sql', 'utf8'));

  // Each organization: a hazard filed under its project with a control, one
  // with no project, and a nonconformance filed under its project.
  for (const [org, program] of [[ORG, PROGRAM], [OTHER, OTHER_PROGRAM]] as const) {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO risk_items (organization_id, program_id, hazard, harm, severity, probability)
       VALUES ($1, $2, 'Sensor drift', 'Mis-dosing', 4, 3), ($1, NULL, 'Unscoped hazard', 'Harm', 2, 2) RETURNING id`,
      [org, program],
    );
    await db.query(
      `INSERT INTO risk_controls (risk_item_id, organization_id, description, control_type) VALUES ($1, $2, 'Alarm', 'protective_measure')`,
      [rows[0].id, org],
    );
    await db.query(
      `INSERT INTO qms_nonconforming_products (organization_id, nc_number, description, program_id) VALUES ($1, 'NC-1', 'Weld porosity', $2)`,
      [org, program],
    );
  }

  const query = async (text: string, params?: unknown[]) => {
    const result = await db.query(text, params);
    return { ...result, rowCount: result.affectedRows };
  };
  pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
}, 60_000);

afterEach(async () => { await db.close(); });

const purge = () => purgeTenant(pool, {
  organizationId: ORG, purgedByUserId: ACTOR,
  preconditions: { finalExportDigest: DIGEST },
  childTables: PURGE_CHILD_TABLES.filter((t) => DEVICE_TABLES.includes(t)),
});
const orgsIn = async (table: string) =>
  (await db.query<{ organization_id: number }>(`SELECT DISTINCT organization_id FROM ${table} ORDER BY organization_id`)).rows
    .map((r) => r.organization_id);

describe('a tenant with a hazard filed under a project', () => {
  it('is purged: its risk file, controls, nonconformances and projects go; the other tenant keeps all of its own', async () => {
    const result = await purge();
    expect(result.status).toBe('purged');
    for (const table of ['risk_controls', 'risk_items', 'qms_nonconforming_products', 'regulatory_programs']) {
      expect(await orgsIn(table), table).toEqual([OTHER]);
    }
    expect(result.deletedRows).toMatchObject({ risk_controls: 1, risk_items: 2, qms_nonconforming_products: 1, regulatory_programs: 1 });
  });

  it('the list names the risk file and the nonconformance log before the projects they are filed under', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    for (const t of ['risk_controls', 'risk_items', 'qms_nonconforming_products']) {
      expect(at(t), t).toBeGreaterThan(-1);
      expect(at(t), t).toBeLessThan(at('regulatory_programs'));
    }
    // A control before the hazard it controls: the list must not depend on the cascade.
    expect(at('risk_controls')).toBeLessThan(at('risk_items'));
  });
});
