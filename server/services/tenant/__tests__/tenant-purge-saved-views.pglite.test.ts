/**
 * A tenant purge erases the tenant's saved queries and Vault saved views (D6,
 * P-46, 2026-10-29; docs/design/VAULT_SAVED_VIEWS_2026-10-29.md §3.8, test T8).
 *
 * PURGE_CHILD_TABLES did not name saved_precedent_queries, so a purged tenant's
 * precedent searches survived it (residue in purge-coverage-baseline.json). Since
 * the table holds Vault saved views, a project view would go with its project
 * (spq_program_same_org_fk ON DELETE CASCADE), but a library view and every
 * precedent row have no cascade and are reached only by naming the table.
 *
 * Real DDL: the table's only creator, as amended. The purge runs the real list
 * in its real order, narrowed to the tables this schema has.
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
const TABLES = ['saved_precedent_queries', 'regulatory_programs'];

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
  await db.exec(await readFile('migrations/20260505_saved_precedent_queries.sql', 'utf8'));

  // Each organisation: a precedent search, a personal library view and an
  // organisation view of its project.
  const scope = (filters: Record<string, string[]>) => JSON.stringify({ v: 1, filters, includeSuperseded: false });
  for (const [org, program] of [[ORG, PROGRAM], [OTHER, OTHER_PROGRAM]] as const) {
    await db.query(
      `INSERT INTO saved_precedent_queries (organization_id, user_id, label, query, surface, visibility, program_id, scope) VALUES
         ($1, NULL, 'Predicates', 'pump', 'precedent', 'org_public', NULL, NULL),
         ($1, 7, 'My CSRs', '', 'vault', 'private', NULL, $3::jsonb),
         ($1, 7, 'Module 3', '', 'vault', 'org_public', $2, $4::jsonb)`,
      [org, program, scope({ documentType: ['CSR'] }), scope({ folderId: ['module-3'] })],
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
  childTables: PURGE_CHILD_TABLES.filter((t) => TABLES.includes(t)),
});
const orgsIn = async (table: string) =>
  (await db.query<{ organization_id: number }>(`SELECT DISTINCT organization_id FROM ${table} ORDER BY organization_id`)).rows
    .map((r) => r.organization_id);

describe('a tenant with saved queries and saved views', () => {
  it('is purged: its precedent searches, library views and project views go; the other tenant keeps all of its own', async () => {
    const result = await purge();
    expect(result.status).toBe('purged');
    expect(await orgsIn('saved_precedent_queries')).toEqual([OTHER]);
    expect(await orgsIn('regulatory_programs')).toEqual([OTHER]);
    const other = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM saved_precedent_queries WHERE organization_id = $1`, [OTHER]);
    expect(other.rows[0].n).toBe(3);
  });

  it('the list names the store before the projects its views are filed under', () => {
    const at = (t: string) => PURGE_CHILD_TABLES.indexOf(t);
    expect(at('saved_precedent_queries')).toBeGreaterThan(-1);
    expect(at('saved_precedent_queries')).toBeLessThan(at('regulatory_programs'));
  });
});
