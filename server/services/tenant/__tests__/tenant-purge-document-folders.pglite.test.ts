/**
 * A tenant purge erases the project's Vault folders, and is not stopped by them
 * (CI run 42523947924, ci:purge-coverage, 2026-11-08). The fix is the
 * coordinating session's 360d4de53 (docs/evidence/F1/2026-11-08-purge-coverage/),
 * proved there on an installer-built PostgreSQL; this case pins it in the unit
 * suite, on the real DDL, and was red without it.
 *
 * migrations/20261106_document_folders_project_scope.sql (S6, b3abbe5b6) gave
 * public.document_folders a program_id REFERENCES regulatory_programs(id) with
 * NO ACTION. PURGE_CHILD_TABLES did not name document_folders, and the purge
 * deletes regulatory_programs, so the purge of any tenant with one folder in a
 * project failed with 23503 and rolled back: the whole erasure, not just the
 * folder. The folders are the tenant's content (names a person gave them), so
 * they are erased, before the projects they belong to.
 *
 * Real DDL: the 20261106 file, run as the set runs it. The purge runs the real
 * list in its real order, narrowed to the tables this schema has.
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
const FOLDER_TABLES = ['document_folders', 'regulatory_programs'];


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
  await db.exec(await readFile('migrations/20261106_document_folders_project_scope.sql', 'utf8'));


  // Each organization: a folder in its project, a folder inside it, and a folder in no project.
  for (const [org, program] of [[ORG, PROGRAM], [OTHER, OTHER_PROGRAM]] as const) {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO document_folders (organization_id, name, program_id, parent_key, created_by_id)
       VALUES ($1, 'Stability reports', $2, 'bn:3.2.S.7', 7) RETURNING id`,
      [org, program],
    );
    await db.query(
      `INSERT INTO document_folders (organization_id, name, program_id, parent_id) VALUES ($1, 'Long-term', $2, $3)`,
      [org, program, rows[0].id],
    );
    await db.query(`INSERT INTO document_folders (organization_id, name) VALUES ($1, 'Unfiled')`, [org]);
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
  childTables: PURGE_CHILD_TABLES.filter((t) => FOLDER_TABLES.includes(t)),
});
const orgsIn = async (table: string) =>
  (await db.query<{ organization_id: number }>(`SELECT DISTINCT organization_id FROM ${table} ORDER BY organization_id`)).rows
    .map((r) => r.organization_id);

describe('a tenant with a folder in a project Vault', () => {
  it('is purged: its folders, nested ones included, and its projects go; the other tenant keeps all of its own', async () => {
    const result = await purge();
    expect(result.status).toBe('purged');
    for (const table of FOLDER_TABLES) expect(await orgsIn(table), table).toEqual([OTHER]);
    expect(result.deletedRows).toMatchObject({ document_folders: 3, regulatory_programs: 1 });
    expect((await db.query('SELECT 1 FROM document_folders WHERE organization_id = $1', [OTHER])).rows).toHaveLength(3);
  });

  it('the list names the folders before the projects they belong to', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    expect(at('document_folders')).toBeGreaterThan(-1);
    expect(at('document_folders')).toBeLessThan(at('regulatory_programs'));
  });
});
