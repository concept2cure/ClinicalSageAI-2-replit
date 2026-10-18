/** Actual transactions and canonical snapshot DDL; no production tenant is purged. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Pool } from 'pg';
import { purgeTenant, PURGE_CHILD_TABLES } from '../tenant-offboarding';
import { readCompanyLegalRegistry, syncCompanyLegalRegistry } from '../../company-documents/legal-registry';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { companyExportSnapshot } from '../../tenant-export/company-export-snapshot';
import { exportTenantFull, digestOf, recordExportReceipt } from '../../tenant-export/tenant-full-export.service';

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
      stripe_subscription_id text, updated_at timestamptz, settings jsonb DEFAULT '{}', slug text);
    CREATE TABLE users (id int PRIMARY KEY);
    CREATE TABLE tenant_export_receipts (organization_id int, digest text,
      table_count int, row_count bigint, created_at timestamptz, created_by int);
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int);
    CREATE TABLE qms_documents (id int PRIMARY KEY, organization_id int, status text, metadata jsonb DEFAULT '{}');
    CREATE TABLE authoring_documents (id uuid PRIMARY KEY, tenant_id int);
    CREATE TABLE authoring_sections (id uuid PRIMARY KEY, doc_id uuid, tenant_id int);
    CREATE TABLE submission_orchestrator_runs (run_id uuid PRIMARY KEY, organization_id int);
    CREATE TABLE mdx_notifications (id int PRIMARY KEY, organization_id int, metadata jsonb DEFAULT '{}');
    CREATE TABLE mdx_notification_subscriptions (organization_id int, user_id int, category text);
    CREATE TABLE documents (id int PRIMARY KEY, organization_id int, content text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds (organization_id int,lifted_at timestamptz);
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
    INSERT INTO mdx_notifications(id,organization_id) VALUES (1,11),(2,22);
  `);
  for (const file of [
    'db/migrations/20261014_qms_controlled_authoring_content.sql',
    'db/migrations/20261014_orchestrator_continuation_inputs.sql',
    'migrations/20261014_notification_recipient_receipts.sql',
    'migrations/20261018_company_document_governance.sql',
    'migrations/20260531_template_specs.sql',
    'migrations/20261018_company_document_designs.sql',
    'migrations/20261018_company_legal_registry.sql',
  ]) await db.exec(await readFile(file, 'utf8'));
  await db.exec(await readFile('migrations/20260813b_tenant_export_receipts.sql', 'utf8'));
  await db.exec(await readFile('migrations/20261018_company_document_export_receipts.sql', 'utf8'));
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

const companyMetadata = { version: 1, revision: 4, companyName: 'private-company-name', address: 'private-company-address',
  letterhead: { brand: { logo: { dataBase64: 'private-logo-data' } } },
  legalDocuments: [{ id: 'legal-one', vaultDocumentId: DOCUMENT, programId: PROGRAM, version: '1', kind: 'authorization', contentHash: 'a'.repeat(64), active: true, agencies: ['FDA'], submissionTypes: ['US_IND'], language: 'en', registeredAt: '2026-01-01T00:00:00Z', registeredBy: '7', title: 'private-legal-title', countries: ['US'], effectiveOn: null, expiresOn: '2030-01-01' }] };
const companyPresentation: Partial<typeof companyMetadata> = { ...companyMetadata };
delete companyPresentation.legalDocuments;
async function saveCompany(profile: unknown = companyMetadata) {
  let stored = profile;
  if (profile && typeof profile === 'object' && 'legalDocuments' in profile) {
    const { legalDocuments, ...presentation } = profile as Record<string, unknown>;
    stored = presentation;
    await syncCompanyLegalRegistry(pool, ORG, await readCompanyLegalRegistry(pool, ORG), legalDocuments as CompanyLegalDocument[]);
  }
  return db.query('UPDATE organizations SET settings=$2::jsonb WHERE id=$1',
    [ORG, JSON.stringify({ companyDocuments: stored, unrelatedPreference: 'kept' })]);
}

async function saveDesign() {
  await db.exec(`INSERT INTO c2c_template_specs(id,org_id,name,spec) VALUES ('tpl_company',11,'Retained variant','{"brand":{"logo":{"dataBase64":"variant-logo-bytes"}}}');
    INSERT INTO company_document_designs(id,organization_id,template_id,name,identity,sha256,created_by)
      VALUES ('55555555-5555-4555-8555-555555555555',11,'tpl_company','Company variant','{"companyName":"Subsidiary"}',repeat('a',64),7)`);
}

async function currentCompanyExport() {
  const payload = await companyExportSnapshot(pool, ORG, client => exportTenantFull(client, ORG));
  const digest = digestOf(payload);
  expect(await recordExportReceipt(pool, { organizationId: ORG, digest,
    tableCount: payload.coverage.tablesExported, rowCount: payload.coverage.totalRows, createdBy: ACTOR,
    coverage: payload.coverage })).toMatchObject({ recorded: true });
  return digest;
}
const purgeCompany = (digest: string) => purgeTenant(pool, { organizationId: ORG, purgedByUserId: ACTOR,
  preconditions: { finalExportDigest: digest }, childTables: ['company_document_designs', 'company_legal_registry', 'company_document_revisions', 'company_document_grants', 'company_document_identity_reviews', 'documents'] });

describe('company metadata disposal is bound to its actual complete customer return', () => {
  it('accepts the same complete company return when export and purge enter from different session time zones', async () => {
    await saveCompany();
    await db.exec(`INSERT INTO company_document_grants (organization_id,user_id,manage_legal,updated_by,updated_at)
      VALUES (11,7,true,7,'2026-10-18T01:02:03.123456Z'); SET TIME ZONE 'Pacific/Honolulu'`);
    const digest = await currentCompanyExport();
    expect((await db.query('SHOW TIME ZONE')).rows).toEqual([{ TimeZone: 'Pacific/Honolulu' }]);
    await db.exec("SET TIME ZONE 'Asia/Tokyo'");
    expect((await purgeCompany(digest)).status).toBe('purged');
    expect((await db.query('SHOW TIME ZONE')).rows).toEqual([{ TimeZone: 'Asia/Tokyo' }]);
  });

  it('refuses a legacy receipt when company settings are absent but retained company rows exist', async () => {
    await db.exec(`INSERT INTO company_document_grants (organization_id,user_id,manage_legal,updated_by) VALUES (11,7,true,7)`);
    await expect(purgeCompany(DIGEST)).rejects.toMatchObject({ code: 'COMPANY_DOCUMENTS_EXPORT_UNVERIFIED' });
    await expectNothingPurged();
  });

  it.each(['grant', 'registry', 'revision', 'identity', 'design', 'template'] as const)('refuses company %s rows added after export without relying on a settings revision change', async kind => {
    await saveCompany();
    if (kind === 'template') await saveDesign();
    const digest = await currentCompanyExport();
    if (kind === 'design') await saveDesign();
    if (kind === 'template') await db.exec(`UPDATE c2c_template_specs SET spec='{}' WHERE id='tpl_company'`);
    if (kind === 'grant') await db.exec(`INSERT INTO company_document_grants (organization_id,user_id,manage_legal,updated_by) VALUES (11,7,true,7)`);
    if (kind === 'revision') await db.exec(`INSERT INTO company_document_revisions (organization_id,revision,profile,sha256,created_by,reason)
      VALUES (11,99,'{"companyName":"New variant"}',repeat('f',64),7,'Retained new variant')`);
    if (kind === 'identity') await db.exec(`INSERT INTO company_document_identity_reviews (organization_id,sequence_id,profile_revision,profile_sha256,filing_sha256,company_role,reason,reviewed_by)
      VALUES (11,1,4,repeat('a',64),repeat('b',64),'applicant','New reviewed company role',7)`);
    if (kind === 'registry') {
      const before = await readCompanyLegalRegistry(pool, ORG);
      await syncCompanyLegalRegistry(pool, ORG, before, [...before, { ...before[0], id: 'legal_late', title: 'Late authorization' }]);
    }
    statements.length = 0;
    await expect(purgeCompany(digest)).rejects.toMatchObject({ code: 'COMPANY_DOCUMENTS_EXPORT_UNVERIFIED' });
    await expectNothingPurged();
  });

  it('keeps legacy absent-profile receipts compatible without changing null organization settings', async () => {
    await db.query('UPDATE organizations SET settings=NULL WHERE id=$1', [ORG]);
    expect((await purgeCompany(DIGEST)).status).toBe('purged');
    expect((await db.query<{ settings: unknown }>('SELECT settings FROM organizations WHERE id=$1', [ORG])).rows).toEqual([{ settings: null }]);
  });

  it('refuses a legacy receipt which omitted present company data before deleting anything', async () => {
    await saveCompany(); statements.length = 0;
    await expect(purgeCompany(DIGEST)).rejects.toMatchObject({ code: 'COMPANY_DOCUMENTS_EXPORT_UNVERIFIED' });
    await expectNothingPurged();
    expect((await db.query<{ settings: unknown }>('SELECT settings FROM organizations WHERE id=$1', [ORG])).rows[0].settings).toHaveProperty('companyDocuments', companyPresentation);
  });

});

describe('company metadata transactional disposal', () => {
  it('clears exactly company settings with the purge marker, preserving unrelated settings and other tenants', async () => {
    await saveCompany();
    await saveDesign();
    await db.exec(`INSERT INTO c2c_template_specs(id,org_id,name,spec) VALUES ('tpl_unrelated',11,'Unrelated template','{}'),('tpl_foreign',22,'Foreign template','{}')`);
    await db.query('UPDATE organizations SET settings=$2::jsonb WHERE id=$1', [OTHER, JSON.stringify({ companyDocuments: { companyName: 'Foreign profile' } })]);
    await db.exec(`INSERT INTO company_document_revisions (organization_id,revision,profile,sha256,created_by,reason)
      VALUES (11,4,'{"companyName":"private-company-name"}',repeat('a',64),7,'Reviewed presentation');
      INSERT INTO company_document_grants (organization_id,user_id,manage_brand,updated_by) VALUES (11,7,true,7),(22,7,true,7);
      INSERT INTO company_document_identity_reviews (organization_id,sequence_id,profile_revision,profile_sha256,filing_sha256,company_role,reason,reviewed_by)
      VALUES (11,1,4,repeat('a',64),repeat('b',64),'applicant','Reviewed role difference',7);`);
    const digest = await currentCompanyExport();
    const result = await purgeCompany(digest);
    expect(result.status).toBe('purged');
    for (const table of ['company_document_designs', 'company_legal_registry', 'company_document_revisions', 'company_document_grants', 'company_document_identity_reviews']) {
      expect(PURGE_CHILD_TABLES).toContain(table);
      expect((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE organization_id=$1`, [ORG])).rows).toEqual([{ n: 0 }]);
    }
    expect((await db.query('SELECT id FROM c2c_template_specs ORDER BY id')).rows).toEqual([{ id: 'tpl_foreign' },{ id: 'tpl_unrelated' }]);
    expect(result.deletedRows.c2c_template_specs).toBe(1);
    expect((await db.query('SELECT organization_id FROM company_document_grants')).rows).toEqual([{ organization_id: OTHER }]);
    const rows = (await db.query<{ id: number; status: string; settings: unknown }>('SELECT id,status,settings FROM organizations ORDER BY id')).rows;
    expect(rows).toEqual([{ id: ORG, status: 'purged', settings: { unrelatedPreference: 'kept' } },
      { id: OTHER, status: 'active', settings: { companyDocuments: { companyName: 'Foreign profile' } } }]);
    const audit = (await db.query<{ new_values: Record<string, unknown> }>('SELECT new_values FROM audit_logs WHERE tenant_id=$1', [ORG])).rows[0].new_values;
    expect(audit.companyDocuments).toMatchObject({ schemaVersion: 1, present: true, disposition: 'erased', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(audit)).not.toMatch(/private-company|private-logo|private-legal/);
  });

  it('refuses a once-valid bound receipt after company data changes', async () => {
    await saveCompany();
    const digest = await currentCompanyExport();
    await saveCompany({ ...companyMetadata, revision: 5 }); statements.length = 0;
    await expect(purgeCompany(digest)).rejects.toMatchObject({ code: 'COMPANY_DOCUMENTS_EXPORT_UNVERIFIED' });
    await expectNothingPurged();
  });

  it('binds explicit null company data too, rather than treating a named section as absent', async () => {
    await saveCompany(null); statements.length = 0;
    await expect(purgeCompany(DIGEST)).rejects.toMatchObject({ code: 'COMPANY_DOCUMENTS_EXPORT_UNVERIFIED' });
    await expectNothingPurged();
    expect((await purgeCompany(await currentCompanyExport())).status).toBe('purged');
  });

  it('restores both company data and the purge marker if the chained audit write fails', async () => {
    await saveCompany(); const digest = await currentCompanyExport();
    await db.exec(`CREATE FUNCTION reject_company_purge_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Synthetic audit persistence failure'; END $$;
      CREATE TRIGGER refuse_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_company_purge_audit();`);
    await expect(purgeCompany(digest)).rejects.toThrow('Synthetic audit persistence failure');
    const row = (await db.query('SELECT status,settings FROM organizations WHERE id=$1', [ORG])).rows[0];
    expect(row).toEqual({ status: 'pending_deletion', settings: { companyDocuments: companyPresentation, unrelatedPreference: 'kept' } });
    expect((await db.query('SELECT count(*)::int AS n FROM documents')).rows).toEqual([{ n: 2 }]);
  });

  it('keeps existing legal holds authoritative even with a verified company return', async () => {
    await saveCompany(); const digest = await currentCompanyExport();
    await db.exec('INSERT INTO vault.legal_holds VALUES (11,NULL)');
    statements.length = 0;
    await expect(purgeCompany(digest)).rejects.toMatchObject({ code: 'LEGAL_HOLD_ACTIVE' });
    await expectNothingPurged();
  });
});
