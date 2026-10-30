/** The actual organization projection, catalog sweep and durable receipt bind
 * company metadata without returning any adjacent settings or credentials. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { exportTenantData } from '../tenant-export.service';
import { canonicalize, digestOf, exportTenantFull, findExportReceipt, recordExportReceipt } from '../tenant-full-export.service';
import { companyDocumentsExportEnvelope } from '../company-document-envelope';

let db: PGlite;
const ORG = 7;
const privateMarker = 'adjacent-organization-credential-fixture';
const company = { version: 1, revision: 8, companyName: 'Customer legal name', address: 'Customer address',
  letterhead: { specVersion: 1, brand: { logo: { mimeType: 'image/png', dataBase64: 'retained-logo-bytes' } } },
  legalDocuments: [{ id: 'legal-one', vaultDocumentId: '22222222-2222-4222-8222-222222222222', programId: '11111111-1111-4111-8111-111111111111', title: 'Original authorization', kind: 'authorization', version: '1', contentHash: 'a'.repeat(64), agencies: ['FDA'], submissionTypes: ['US_IND'], language: 'en', effectiveOn: null, registeredAt: '2026-01-01T00:00:00Z', registeredBy: '3', countries: ['US'], expiresOn: '2030-01-01', active: true }],
  futureGovernedMetadata: { evidenceVersion: 1, legalReview: 'customer-owned evidence' } };
const { legalDocuments: originals, ...presentation } = company;
const query = async (sql: string, params?: unknown[]) => {
  const result = await db.query(sql, params);
  return { ...result, rowCount: result.affectedRows };
};
const client = () => ({ query }) as never;
const record = (payload: Awaited<ReturnType<typeof exportTenantFull>>) => recordExportReceipt(client(), {
  organizationId: ORG, digest: digestOf(payload), tableCount: payload.coverage.tablesExported,
  rowCount: payload.coverage.totalRows, createdBy: 3, coverage: payload.coverage,
});

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`CREATE TABLE organizations (id int PRIMARY KEY, slug text, name text, status text, settings jsonb, api_key text);
    CREATE TABLE users (id int PRIMARY KEY); INSERT INTO users VALUES (3);
    CREATE SCHEMA vault; CREATE TABLE vault.legal_holds (organization_id int,lifted_at timestamptz);`);
  await db.query('INSERT INTO organizations VALUES ($1,$2,$3,$4,$5::jsonb,$6)',
    [ORG, 'customer', 'Account name', 'active', JSON.stringify({ companyDocuments: company, connectorCredentials: privateMarker }), privateMarker]);
  await db.query("INSERT INTO organizations VALUES (8,'foreign','Foreign organization','active',$1::jsonb,NULL)",
    [JSON.stringify({ companyDocuments: { companyName: 'Foreign private profile' } })]);
  for (const migration of ['migrations/20261018_company_document_governance.sql', 'migrations/20260531_template_specs.sql', 'migrations/20261018_company_document_designs.sql', 'migrations/20260813b_tenant_export_receipts.sql', 'migrations/20261018_company_document_export_receipts.sql',
    'migrations/20261018_company_document_export_receipts.sql', 'migrations/20261018_company_legal_registry.sql']) await db.exec(readFileSync(migration, 'utf8'));
  // The scope column 20261029k adds (section 0): a receipt records the scope its export was read in.
  await db.exec('ALTER TABLE tenant_export_receipts ADD COLUMN IF NOT EXISTS export_scope text');
  await db.exec(`INSERT INTO c2c_template_specs(id,org_id,name,spec) VALUES ('tpl_company',7,'Company variant','{"brand":{"logo":{"dataBase64":"variant-logo-bytes"}}}'),('tpl_unrelated',7,'Unrelated','{}'),('tpl_foreign',8,'Foreign private profile','{}');
    INSERT INTO company_document_designs(id,organization_id,template_id,name,identity,sha256,created_by) VALUES ('11111111-1111-4111-8111-111111111111',7,'tpl_company','Customer variant','{"companyName":"Subsidiary"}',repeat('a',64),3);
    INSERT INTO company_document_grants (organization_id,user_id,manage_brand,updated_by) VALUES (7,3,true,3),(8,3,false,3);
    INSERT INTO company_document_revisions (organization_id,revision,profile,sha256,created_by,reason)
      VALUES (7,8,'{"companyName":"Customer legal name"}',repeat('a',64),3,'Reviewed presentation'),
             (8,1,'{"companyName":"Foreign private profile"}',repeat('b',64),3,'Reviewed foreign presentation');
    INSERT INTO company_document_identity_reviews (organization_id,sequence_id,profile_revision,profile_sha256,filing_sha256,company_role,reason,reviewed_by)
      VALUES (7,1,8,repeat('a',64),repeat('b',64),'applicant','Reviewed role difference',3),
             (8,2,1,repeat('b',64),repeat('c',64),'sponsor','Reviewed foreign role',3);`);
}, 60_000);
afterAll(async () => { await db?.close(); });

describe('company metadata customer return', () => {
  it('returns the exact company subsection, logo and legal metadata in the complete export', async () => {
    const payload = await exportTenantFull(client(), ORG);
    expect(payload.companyDocuments).toMatchObject({ schemaVersion: 1, organizationId: ORG, present: true, data: presentation });
    expect(payload.coverage.companyDocuments).toEqual({ schemaVersion: 1, present: true, sha256: payload.companyDocuments!.sha256 });
    expect(payload.coverage.tablesFailed).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain(privateMarker);
    expect(JSON.stringify(payload)).not.toContain('Foreign private profile');
    expect(payload.organization).toEqual({ id: ORG, slug: 'customer', name: 'Account name', status: 'active' });
  });

  it('uses the same actual organization projection for the curated export', async () => {
    // Other curated resource stores are separate seams; the company read runs
    // unchanged against PostgreSQL rather than a fabricated organization row.
    const curated = { query: (sql: string, params?: unknown[]) => /FROM organizations|pg_catalog.pg_class|FROM public.company_|FROM public.c2c_template_specs/.test(sql) ? query(sql, params)
      : Promise.resolve({ rows: sql.includes('count(*)') ? [{ count: '0' }] : [] }) } as never;
    const payload = await exportTenantData(curated, ORG);
    expect(payload.companyDocuments?.data).toEqual(presentation);
    expect(payload.companyDocuments?.tables.company_legal_registry[0].document).toEqual(originals[0]);
    expect(payload.companyDocuments?.tables.c2c_template_specs).toHaveLength(1);
    expect(payload.companyDocuments?.tables.c2c_template_specs[0]).toMatchObject({ id: 'tpl_company', spec: { brand: { logo: { dataBase64: 'variant-logo-bytes' } } } });
    expect(JSON.stringify(payload)).not.toContain('tpl_unrelated');
    expect(payload.companyDocuments?.sha256).toBe((await exportTenantFull(client(), ORG)).companyDocuments?.sha256);
    expect(JSON.stringify(payload)).not.toContain(privateMarker);
  });

  it('hashes the exact versioned tenant-bound preimage deterministically', async () => {
    const payload = (await exportTenantFull(client(), ORG)).companyDocuments!;
    const { sha256, ...preimage } = payload;
    expect(sha256).toBe(createHash('sha256').update(canonicalize(preimage)).digest('hex'));
    expect(companyDocumentsExportEnvelope(ORG, { company_documents_present: true,
      company_documents: { futureGovernedMetadata: company.futureGovernedMetadata,
        letterhead: company.letterhead, address: company.address, companyName: company.companyName, revision: 8, version: 1 } }, payload.tables).sha256).toBe(sha256);
    expect(companyDocumentsExportEnvelope(8, { company_documents_present: true, company_documents: company }).sha256).not.toBe(sha256);
  });

  it('naturally exports newly introduced integer-tenant company tables without foreign rows', async () => {
    const payload = await exportTenantFull(client(), ORG);
    for (const table of ['company_document_grants', 'company_document_revisions', 'company_document_identity_reviews', 'company_document_designs', 'company_legal_registry']) {
      expect(payload.tables.find(t => t.table === table)).toMatchObject({ rowCount: 1, rows: [{ organization_id: ORG }] });
    }
  });

  it('persists and reads the envelope binding alongside the full-payload digest', async () => {
    const payload = await exportTenantFull(client(), ORG);
    expect(await record(payload)).toMatchObject({ recorded: true, inserted: true });
    expect(await findExportReceipt(client(), ORG, digestOf(payload))).toMatchObject({
      companyDocumentsVersion: 1, companyDocumentsSha256: payload.companyDocuments!.sha256,
    });
    expect(await findExportReceipt(client(), 8, digestOf(payload))).toBeNull();
  });

  it('does not issue a receipt for a malformed company completeness descriptor', async () => {
    const payload = await exportTenantFull(client(), ORG);
    payload.coverage.companyDocuments = { schemaVersion: 1, present: true, sha256: 'unverified' };
    expect(await record(payload)).toMatchObject({ recorded: false, incomplete: { tablesFailed: ['organizations.companyDocuments'] } });
    expect(await findExportReceipt(client(), ORG, digestOf(payload))).toBeNull();
  });

  it('does not silently represent an unread company section as absent', async () => {
    const unavailable = { query: (sql: string, params?: unknown[]) => sql.includes('FROM organizations')
      ? Promise.reject(new Error('Company section read unavailable')) : query(sql, params) } as never;
    await expect(exportTenantFull(unavailable, ORG)).rejects.toThrow('Company section read unavailable');
    await expect(exportTenantData(unavailable, ORG)).rejects.toThrow('Company section read unavailable');
  });

  it('distinguishes absent profiles from an explicitly stored null without inventing a profile', () => {
    const absent = companyDocumentsExportEnvelope(ORG, { company_documents_present: false, company_documents: null });
    const cleared = companyDocumentsExportEnvelope(ORG, { company_documents_present: true, company_documents: null });
    expect(absent).toMatchObject({ present: false, data: null });
    expect(cleared.sha256).not.toBe(absent.sha256);
  });
});
