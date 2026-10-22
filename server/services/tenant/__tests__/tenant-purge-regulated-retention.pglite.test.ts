/** Actual transactions and canonical snapshot DDL; no production tenant is purged. */
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
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const RUN = '44444444-4444-4444-8444-444444444444';

let db: PGlite;
let statements: string[];
let pool: Pool;

beforeEach(async () => {
  db = new PGlite();
  statements = [];
  await db.exec(`
    CREATE TABLE organizations (id int PRIMARY KEY, name text, status text,
      deletion_requested_at timestamptz, deletion_requested_by int, deletion_reason text,
      purge_eligible_at timestamptz, purged_at timestamptz, purged_by int,
      final_export_digest text, final_export_at timestamptz, api_key text,
      stripe_subscription_id text, updated_at timestamptz);
    CREATE TABLE users (id int PRIMARY KEY);
    CREATE TABLE tenant_export_receipts (organization_id int, digest text,
      table_count int, row_count bigint, created_at timestamptz, created_by int);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int);
    CREATE TABLE qms_documents (id int PRIMARY KEY, organization_id int, status text, metadata jsonb DEFAULT '{}');
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id int);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY, doc_id uuid, tenant_id int);
    CREATE TABLE submission_orchestrator_runs (run_id uuid PRIMARY KEY, organization_id int);
    CREATE TABLE mdx_notifications (id int PRIMARY KEY, organization_id int);
    CREATE TABLE mdx_notification_subscriptions (organization_id int, user_id int, category text);
    CREATE TABLE documents (id int PRIMARY KEY, organization_id int, content text);
    CREATE TABLE audit_logs (id uuid PRIMARY KEY, tenant_id int, user_id int, action text,
      table_name text, record_id text, actor_id int, target text, payload_hash text,
      sha256_chain text, occurred_at timestamptz, hmac_seal text, old_values jsonb,
      new_values jsonb, ip_address inet, user_agent text, reason text,
      chain_seq bigint GENERATED ALWAYS AS IDENTITY);
    INSERT INTO organizations (id,name,status,purge_eligible_at) VALUES
      (11,'Synthetic tenant','pending_deletion',now()-interval '1 day'),
      (22,'Other synthetic tenant','active',NULL);
    INSERT INTO users VALUES (7);
    INSERT INTO tenant_export_receipts VALUES (11,'synthetic-final-export',5,9,now(),7);
    INSERT INTO regulatory_programs VALUES
      ('11111111-1111-4111-8111-111111111111',11),
      ('22222222-2222-4222-8222-222222222222',22);
    INSERT INTO documents VALUES (1,11,'Synthetic document'),(2,22,'Other synthetic document');
    INSERT INTO mdx_notifications VALUES (1,11),(2,22);
  `);
  for (const file of [
    'db/migrations/20261014_qms_controlled_authoring_content.sql',
    'db/migrations/20261014_orchestrator_continuation_inputs.sql',
    'migrations/20261014_notification_recipient_receipts.sql',
  ]) await db.exec(await readFile(file, 'utf8'));
  await db.query('INSERT INTO mdx_notification_receipts (organization_id,notification_id,user_id) VALUES (11,1,7),(22,2,7)');
  const query = async (text: string, params?: unknown[]) => {
    statements.push(text);
    const result = await db.query(text, params);
    return { ...result, rowCount: result.affectedRows };
  };
  pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
});

afterEach(async () => { await db.close(); });

async function qmsVersion(org: number, kind: 'signed' | 'legacy-registry') {
  if (kind === 'signed') await db.query('INSERT INTO authoring_documents VALUES ($1,$2)', [DOCUMENT, org]);
  await db.query('INSERT INTO qms_documents (id,organization_id,status) VALUES (101,$1,$2)', [org, 'effective']);
  await db.query(`INSERT INTO qms_document_versions
    (organization_id,document_id,version,authoring_document_id,record_kind,controlled_document,sections,content_digest,signature_id,approved_at)
    VALUES ($1,101,'1.0',$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)`, [
    org, kind === 'signed' ? DOCUMENT : null, kind,
    JSON.stringify({ title: 'Synthetic controlled procedure', source: 'test fixture' }),
    JSON.stringify(kind === 'signed' ? [{ content: 'Synthetic retained controlled prose' }] : []), 'a'.repeat(64),
    kind === 'signed' ? 1 : null, kind === 'signed' ? new Date() : null,
  ]);
}

async function frozenInputs(org: number) {
  await db.query('INSERT INTO submission_orchestrator_runs VALUES ($1,$2)', [RUN, org]);
  await db.query(`INSERT INTO submission_orchestrator_inputs
    (run_id,organization_id,program_id,input_snapshot,input_digest)
    VALUES ($1,$2,$3,$4::jsonb,$5)`, [
    RUN, org, org === ORG ? PROGRAM : OTHER_PROGRAM,
    JSON.stringify({ clinicalSummary: 'Synthetic frozen study content' }), 'b'.repeat(64),
  ]);
}

const purge = () => purgeTenant(pool, {
  organizationId: ORG, purgedByUserId: ACTOR,
  preconditions: { finalExportDigest: DIGEST },
  childTables: ['mdx_notification_receipts', 'mdx_notifications', 'documents', 'regulatory_programs'],
});

async function expectNothingPurged() {
  expect((await db.query('SELECT status FROM organizations WHERE id=$1', [ORG])).rows).toEqual([{ status: 'pending_deletion' }]);
  expect((await db.query('SELECT count(*)::int AS n FROM documents')).rows).toEqual([{ n: 2 }]);
  expect((await db.query('SELECT count(*)::int AS n FROM regulatory_programs')).rows).toEqual([{ n: 2 }]);
  expect((await db.query('SELECT count(*)::int AS n FROM mdx_notification_receipts')).rows).toEqual([{ n: 2 }]);
  expect((await db.query('SELECT count(*)::int AS n FROM audit_logs')).rows).toEqual([{ n: 0 }]);
  expect(statements.some((sql) => /^DELETE|^\s*UPDATE organizations|^\s*INSERT INTO audit_logs/.test(sql))).toBe(false);
  expect(statements).toContain('ROLLBACK');
  expect(statements).not.toContain('COMMIT');
}

describe('regulated content retention preflight', () => {
  it.each(['signed', 'legacy-registry', 'frozen-inputs'] as const)('refuses %s content before any erasure or success record', async (kind) => {
    if (kind === 'frozen-inputs') await frozenInputs(ORG);
    else await qmsVersion(ORG, kind);
    await expect(purge()).rejects.toMatchObject({ code: 'REGULATED_CONTENT_RETENTION_REVIEW_REQUIRED' });
    await expectNothingPurged();
    expect(statements.some((sql) => /FOR UPDATE/.test(sql))).toBe(true);
  });

  it('allows an empty requested tenant while preserving another tenant’s retained content', async () => {
    await qmsVersion(OTHER, 'signed');
    await frozenInputs(OTHER);
    const result = await purge();
    expect(result.status).toBe('purged');
    expect(result.deletedRows.mdx_notification_receipts).toBe(1);
    expect((await db.query('SELECT organization_id FROM documents')).rows).toEqual([{ organization_id: OTHER }]);
    expect((await db.query('SELECT organization_id FROM mdx_notification_receipts')).rows).toEqual([{ organization_id: OTHER }]);
    expect((await db.query('SELECT organization_id FROM qms_document_versions')).rows).toEqual([{ organization_id: OTHER }]);
    expect((await db.query('SELECT organization_id FROM submission_orchestrator_inputs')).rows).toEqual([{ organization_id: OTHER }]);
    expect((await db.query('SELECT action,tenant_id FROM audit_logs')).rows).toEqual([{ action: 'tenant_purged', tenant_id: ORG }]);
    expect(PURGE_CHILD_TABLES.indexOf('mdx_notification_receipts')).toBeLessThan(PURGE_CHILD_TABLES.indexOf('mdx_notifications'));
  });

  it('refuses an unavailable retained store instead of assuming it is empty', async () => {
    await db.exec('DROP TABLE qms_document_versions');
    await expect(purge()).rejects.toMatchObject({ code: 'REGULATED_RETENTION_CHECK_UNAVAILABLE' });
    await expectNothingPurged();
  });

  it('refuses an unreadable retained store through real database permissions', async () => {
    await db.exec(`CREATE ROLE retention_reader;
      GRANT USAGE ON SCHEMA public TO retention_reader;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO retention_reader;
      GRANT UPDATE ON organizations TO retention_reader;
      REVOKE SELECT ON qms_document_versions FROM retention_reader;
      SET ROLE retention_reader;`);
    await expect(purge()).rejects.toMatchObject({ code: 'REGULATED_RETENTION_CHECK_UNAVAILABLE' });
    await db.exec('RESET ROLE');
    await expectNothingPurged();
  });
});
