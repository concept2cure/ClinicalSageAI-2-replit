/** Real saved requirements, Vault approval and placement SQL through both
 * canonical gates. REDPROOF bypasses only the new helper to prove these
 * assertions detect its removal; it is a test-only mutation. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, promises as fs } from 'node:fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import type { CompanyLegalRequirement } from '../../../../shared/company-legal-workflows';
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: vi.fn() } }));
vi.mock('../../../db.js', () => ({ get db() { return holder.db; }, pool: { query: vi.fn() } }));
vi.mock('../../../db/runtime', () => ({ getPool: () => ({ query: vi.fn() }) }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
vi.mock('../release-signature-status', async original => ({ ...(await original<typeof import('../release-signature-status')>()),
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'Signature ceremony is separate from this legal companion proof.' }), isReleaseSignatureRequired: () => false }));
vi.mock('../../company-documents/stored-legal-readiness', async original => {
  const actual = await original<typeof import('../../company-documents/stored-legal-readiness')>();
  return { ...actual,
    assessStoredCompanyLegalRequirements: (...args: Parameters<typeof actual.assessStoredCompanyLegalRequirements>) => process.env.C2C_COMPANY_REQUIREMENTS_REDPROOF === '1' ? Promise.resolve(null) : actual.assessStoredCompanyLegalRequirements(...args),
    requireStoredCompanyLegalRequirements: (...args: Parameters<typeof actual.requireStoredCompanyLegalRequirements>) => process.env.C2C_COMPANY_REQUIREMENTS_REDPROOF === '1' ? Promise.resolve() : actual.requireStoredCompanyLegalRequirements(...args) };
});
import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';
import { assembleSequence } from '../assemble-from-core';
import { assessStoredCompanyLegalRequirements } from '../../company-documents/stored-legal-readiness';

let harness: IndPgliteDb;
const ORG = 7; const USER = 3;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT = '22222222-2222-4222-8222-222222222222';
const HASH = 'a'.repeat(64);
const legal: CompanyLegalDocument = { id: 'legal_authorization', title: 'Applicant authorization', kind: 'authorization', programId: PROGRAM, vaultDocumentId: VAULT,
  contentHash: HASH, version: '1', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_510K'], language: 'en', effectiveOn: null, expiresOn: null,
  active: true, registeredAt: '2026-10-01', registeredBy: String(USER) };
const requirement: CompanyLegalRequirement = { id: 'requirement_authorization', sequenceId: 1, programId: PROGRAM, title: 'Applicant authorization is required', source: 'customer', regionalCode: null,
  kind: 'authorization', agencies: ['FDA'], countries: ['US'], submissionTypes: ['510(k)'], language: 'en', sectionCode: '1.4', applicability: 'required',
  rationale: 'Reviewed applicant-specific legal requirement.', legalDocumentIds: ['legal_authorization'], reviewedAt: '2026-10-01T00:00:00.000Z', reviewedBy: String(USER) };
async function saveRequirements(requirements: CompanyLegalRequirement[]) {
  await harness.pglite.query('UPDATE organizations SET settings=$1::jsonb WHERE id=$2', [JSON.stringify({ companyDocuments: { legalRequirements: requirements } }), ORG]);
}
async function saveLegal(document: CompanyLegalDocument) {
  await harness.pglite.query('INSERT INTO company_legal_registry(organization_id,id,document) VALUES($1,$2,$3::jsonb) ON CONFLICT(organization_id,id) DO UPDATE SET document=excluded.document', [ORG, document.id, JSON.stringify(document)]);
}
const q = { query: async (sql: string, params?: unknown[]) => harness.pglite.query<Record<string, unknown>>(sql, params) };
beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, shadowReview: true }); holder.db = harness.db;
  await harness.pglite.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}'); INSERT INTO organizations(id) VALUES(7);
    CREATE TABLE company_legal_registry(organization_id integer NOT NULL,id text NOT NULL,document jsonb NOT NULL,PRIMARY KEY(organization_id,id));
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,deleted_at timestamptz);
    CREATE SCHEMA IF NOT EXISTS vault; CREATE TABLE vault.documents(id uuid PRIMARY KEY,program_id uuid,organization_id integer,document_code text,supersedes_id uuid,
      document_title text,document_type text,version text,content_hash text,storage_version_id text,file_name text,mime_type text,deleted_at timestamptz);
    INSERT INTO regulatory_programs(id,organization_id) VALUES('${PROGRAM}',${ORG});
    INSERT INTO vault.documents(id,program_id,organization_id,document_code,document_title,document_type,version,content_hash,storage_version_id,file_name,mime_type)
      VALUES('${VAULT}','${PROGRAM}',${ORG},'AUTHORIZATION','Applicant authorization','OTHER','1','${HASH}','stored-v1','authorization.pdf','application/pdf');
    INSERT INTO canonical_documents(canonical_id,organization_id,project_id,title,document_type,stage,has_content,content_hash,source_refs)
      VALUES('canonical-authorization',${ORG},'${PROGRAM}','Applicant authorization','OTHER','approved',true,'${HASH}','{"vault_documents":{"nativeId":"${VAULT}","role":"artifact"}}');
    INSERT INTO submissions(id,title,application_type,client_type,primary_region,organization_id,created_by,program_id)
      VALUES(1,'Device filing','510k','ivd','fda',${ORG},${USER},'${PROGRAM}');
    INSERT INTO ectd_sequences(id,submission_id,region,sequence_number,type,status,organization_id,created_by)
      VALUES(1,1,'fda','0000','original','assembling',${ORG},${USER});`);
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261006_document_data_dispositions.sql', import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await harness.pglite.exec('DELETE FROM submission_leaves; DELETE FROM company_legal_registry');
  await saveLegal(legal); await saveRequirements([requirement]);
});
afterAll(async () => harness?.close());
async function place(pin = HASH) {
  await harness.pglite.query(`INSERT INTO submission_leaves(sequence_id,section_code,title,lifecycle_op,document_table,document_uuid,document_content_sha256,organization_id,created_by)
    VALUES(1,'1.4','Applicant authorization','new','vault_documents',$1::uuid,$2,$3,$4)`, [VAULT, pin, ORG, USER]);
}
async function legalFindings() {
  const result = await assessSequenceDispatchReadiness({ organizationId: ORG, sequenceId: 1, asOf: '2026-10-18' });
  return result.readiness.findings.filter(finding => finding.code === 'COMPANY_LEGAL_REQUIREMENT_INCOMPLETE');
}
describe('saved legal requirements bind canonical release and assembly', () => {
  it('blocks readiness and refuses assembly before staging when a required exact companion is not placed', async () => {
    expect(await legalFindings()).toHaveLength(1);
    const staging = vi.spyOn(fs, 'mkdtemp');
    await expect(assembleSequence({ organizationId: ORG, sequenceId: 1, userId: USER, dryRun: true })).rejects.toMatchObject({ code: 'COMPANY_LEGAL_REQUIREMENTS_INCOMPLETE' });
    expect(staging).not.toHaveBeenCalled(); staging.mockRestore();
  });
  it('requires exact approved placement bytes and rechecks later revocation', async () => {
    await place();
    expect(await legalFindings()).toEqual([]);
    expect((await assessStoredCompanyLegalRequirements(q, { organizationId: ORG, sequenceId: 1 }))?.ready).toBe(true);
    await harness.pglite.query('UPDATE submission_leaves SET document_content_sha256=$1', ['b'.repeat(64)]);
    expect(await legalFindings()).toHaveLength(1);
    await harness.pglite.query('UPDATE submission_leaves SET document_content_sha256=$1', [HASH]);
    await saveLegal({ ...legal, workflow: { custodianUserId: null, reminderDays: [], replacementId: null, revokedAt: '2026-10-18T00:00:00.000Z', revokedBy: '3', revocationReason: 'Authority withdrawn.',
      authority: null, signatureEvidence: null, translationOfId: null, certifiedTranslationEvidence: null, updatedBy: '3', updatedAt: '2026-10-18T00:00:00.000Z' } });
    expect((await legalFindings())[0].message).toMatch(/revoked/i);
  });
  it('does not infer approval from mapped IDs, and keeps a saved unresolved applicability review blocking', async () => {
    await place(); await saveRequirements([{ ...requirement, applicability: 'unresolved' }]);
    expect((await legalFindings())[0].message).toContain('not been resolved');
    await saveRequirements([{ ...requirement, requiresAuthority: true }]);
    expect((await legalFindings())[0].message).toContain('signing-authority evidence');
  });
  it('leaves an unconfigured existing filing unchanged and does not apply another sequence’s policy', async () => {
    await saveRequirements([]); expect(await legalFindings()).toEqual([]);
    await saveRequirements([{ ...requirement, sequenceId: 2 }]); expect(await legalFindings()).toEqual([]);
    await saveRequirements([{ ...requirement, countries: ['EU'], agencies: ['EMA'] }]); expect(await legalFindings()).toEqual([]);
  });
});
