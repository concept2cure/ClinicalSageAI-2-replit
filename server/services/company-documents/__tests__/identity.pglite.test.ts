import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import type { Request } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';

const h = vi.hoisted(() => ({ q: null as unknown as RequestSqlClient, profile: null as unknown as CompanyDocumentProfile,
  admission: vi.fn(), recheck: vi.fn(), audit: vi.fn(), queries: [] as string[], sequenceId: 0 }));
vi.mock('../profile', async () => {
  const { CompanyDocumentsError } = await import('../validation');
  return { context: async () => ({ q: h.q, organizationId: 7, userId: 3 }), loadCompanyDocumentProfile: async () => globalThis.structuredClone(h.profile), CompanyDocumentsError };
});
vi.mock('../../submission-service/submission-request-read', () => ({
  readSubmissionSequenceForRequest: h.admission, requireSubmissionReadStillCurrent: h.recheck,
}));
vi.mock('../../auditService', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../designs', () => ({ readPublishedCompanyVariant: async (_q: unknown, _org: number, variantId: string) =>
  ({ ...globalThis.structuredClone(h.profile), variantId }) }));
import { compareCompanyFilingIdentity, readCompanyFilingIdentity, reviewCompanyFilingIdentity } from '../identity';
import { CompanyDocumentsError } from '../validation';

let db: PGlite;
const req = {} as Request;
const programId = '11111111-1111-4111-8111-111111111111';
const sponsorId = '22222222-2222-4222-8222-222222222222';
const otherSponsorId = '33333333-3333-4333-8333-333333333333';
beforeAll(async () => {
  db = new PGlite();
  h.q = { query: async (sql: string, parameters?: unknown[]) => { h.queries.push(sql); return db.query(sql, parameters); } } as RequestSqlClient;
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,name text,status text);
    CREATE TABLE users(id integer PRIMARY KEY);
    CREATE SCHEMA vault; CREATE TABLE vault.legal_holds(organization_id integer,lifted_at timestamptz);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id integer,sponsor_address text,application_number text,deleted_at timestamptz,
      primary_agency text,applicant_sponsor_id uuid);
    CREATE TABLE ind_sponsors(id uuid PRIMARY KEY,organization_id integer,name text,duns text,contact_name text,contact_phone text,contact_email text);
    CREATE TABLE submissions(id integer PRIMARY KEY,organization_id integer,program_id uuid,primary_region text,application_number text,deleted_at timestamptz);
    INSERT INTO organizations VALUES(7,'Tenant account','active'); INSERT INTO users VALUES(3);
    INSERT INTO regulatory_programs VALUES('${programId}',7,'Filing Street','IND-123',NULL,'FDA','${sponsorId}');
    INSERT INTO ind_sponsors VALUES('${sponsorId}',7,'Applicant Ltd','123456789','Regulatory Contact','+1 617 555 0100','contact@example.test'),
      ('${otherSponsorId}',7,'Applicant Ltd','123456789','Regulatory Contact','+1 617 555 0100','contact@example.test');
    INSERT INTO submissions VALUES(20,7,'${programId}','fda',NULL,NULL);`);
  await db.exec(await readFile('migrations/20261018_company_document_governance.sql', 'utf8'));
}, 60_000);
beforeEach(async () => {
  h.sequenceId++;
  h.queries = [];
  h.admission.mockReset(); h.recheck.mockReset(); h.audit.mockReset();
  h.admission.mockImplementation(async (_q, _ctx, id: number) => ({ organizationId: 7, userId: 3, programId, projectId: 10, sequenceId: id,
    submissionId: 20, applicationType: 'IND', sequenceRegion: 'fda' }));
  h.recheck.mockResolvedValue(undefined); h.audit.mockResolvedValue({ id: 'recorded' });
  h.profile = { version: 1, revision: 4, companyName: 'Parent Brand', address: 'Brand Street', contact: '', registrationDetails: '',
    letterhead: globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null, applyToReports: false,
    applyToSubmissionCorrespondence: true, legalDocuments: [] };
  await db.exec(`UPDATE organizations SET name='Tenant account'; UPDATE regulatory_programs SET sponsor_address='Filing Street',application_number='IND-123',
    primary_agency='FDA',applicant_sponsor_id='${sponsorId}';
    UPDATE ind_sponsors SET name='Applicant Ltd',contact_name='Regulatory Contact';
    UPDATE submissions SET primary_region='fda',application_number=NULL;`);
});
afterAll(async () => { await db.close(); });
async function reviewInput() {
  const { data } = await readCompanyFilingIdentity(req, h.sequenceId);
  return { sequenceId: h.sequenceId, expectedRevision: data.profileRevision, profileHash: data.profileHash, filingHash: data.filingHash,
    companyRole: 'parent_brand', reason: 'Reviewed parent brand and applicant subsidiary relationship' };
}
describe('filing identity reconciliation against actual recorded facts', () => {
  it('normalizes whitespace/case, but retains meaningful legal-name and address differences', () => {
    expect(compareCompanyFilingIdentity({ companyName: ' Applicant  Ltd ', address: 'Filing\nStreet' }, { applicantName: 'applicant ltd', sponsorAddress: 'filing street' })).toEqual([]);
    expect(compareCompanyFilingIdentity({ companyName: 'Applicant Group', address: 'Other Street' }, { applicantName: 'Applicant Ltd', sponsorAddress: 'Filing Street' })).toHaveLength(2);
  });
  it('reports the separate brand/applicant identities without changing either recorded source', async () => {
    const result = await readCompanyFilingIdentity(req, h.sequenceId);
    expect(result.data.status).toBe('needs_review');
    expect(result.data.filing).toMatchObject({ applicantName: 'Applicant Ltd', applicationNumber: 'IND-123', agency: 'FDA' });
    expect(result.data.differences).toHaveLength(2);
    expect(h.queries.every(sql => sql.startsWith('SELECT'))).toBe(true);
  });
  it('retains a reasoned role difference bound to exact company and filing hashes', async () => {
    const input = await reviewInput();
    expect((await reviewCompanyFilingIdentity(req, input)).status).toBe('reviewed_difference');
    expect((await db.query<{ name: string }>('SELECT name FROM organizations WHERE id=7')).rows[0].name).toBe('Tenant account');
    expect(h.profile.companyName).toBe('Parent Brand');
    expect(h.audit.mock.calls[0][1].details).toMatchObject({ profileHash: input.profileHash, filingHash: input.filingHash, companyRole: 'parent_brand' });
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain('Filing Street');
  });
  it('invalidates the old role review after the actual applicant changes', async () => {
    await reviewCompanyFilingIdentity(req, await reviewInput());
    await db.exec("UPDATE ind_sponsors SET name='New legal applicant'");
    expect((await readCompanyFilingIdentity(req, h.sequenceId)).data.status).toBe('needs_review');
  });
  it('requires separate review for identically styled default and named presentations', async () => {
    const firstVariant = '22222222-2222-4222-8222-222222222222';
    const secondVariant = '33333333-3333-4333-8333-333333333333';
    const first = (await readCompanyFilingIdentity(req, h.sequenceId, firstVariant)).data;
    await reviewCompanyFilingIdentity(req, { ...await reviewInput(), variantId: firstVariant,
      profileHash: first.profileHash, filingHash: first.filingHash });
    const reviewed = (await readCompanyFilingIdentity(req, h.sequenceId, firstVariant)).data;
    const other = (await readCompanyFilingIdentity(req, h.sequenceId, secondVariant)).data;
    const organizationDefault = (await readCompanyFilingIdentity(req, h.sequenceId)).data;
    expect(reviewed.status).toBe('reviewed_difference');
    expect(other.profileHash).toBe(first.profileHash);
    expect(organizationDefault.profileHash).toBe(first.profileHash);
    expect(new Set([reviewed.filingHash, other.filingHash, organizationDefault.filingHash]).size).toBe(3);
    expect(other.status).toBe('needs_review');
    expect(organizationDefault.status).toBe('needs_review');
    await expect(reviewCompanyFilingIdentity(req, { ...await reviewInput(), variantId: secondVariant,
      profileHash: first.profileHash, filingHash: first.filingHash })).rejects.toMatchObject({ code: 'FILING_IDENTITY_CHANGED' });
  });
  it('refuses a review prepared against an earlier company revision', async () => {
    const input = await reviewInput(); h.profile.revision++;
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toMatchObject({ code: 'FILING_IDENTITY_CHANGED' });
    expect((await db.query('SELECT id FROM company_document_identity_reviews WHERE sequence_id=$1', [h.sequenceId])).rows).toHaveLength(0);
  });
  it('does not let a reason replace missing application identity', async () => {
    await db.exec("UPDATE regulatory_programs SET application_number=NULL");
    const input = await reviewInput();
    expect((await readCompanyFilingIdentity(req, h.sequenceId)).data).toMatchObject({ status: 'unresolved', unresolvedFields: ['application number'] });
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toMatchObject({ code: 'FILING_IDENTITY_INCOMPLETE' });
  });
  it('rolls the review back if its chained audit cannot be written', async () => {
    const input = await reviewInput(); h.audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toThrow('Audit unavailable');
    expect((await db.query('SELECT id FROM company_document_identity_reviews WHERE sequence_id=$1', [h.sequenceId])).rows).toHaveLength(0);
  });
  it('refuses a changed submission admission before the review commits', async () => {
    const input = await reviewInput(); h.recheck.mockReset();
    h.recheck.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new CompanyDocumentsError(503, 'SOURCE_SCOPE_CHANGED', 'Project access changed'));
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toMatchObject({ code: 'SOURCE_SCOPE_CHANGED' });
    expect((await db.query('SELECT id FROM company_document_identity_reviews WHERE sequence_id=$1', [h.sequenceId])).rows).toHaveLength(0);
  });
  it('does not query applicant or review records before target admission succeeds', async () => {
    h.admission.mockRejectedValueOnce(new CompanyDocumentsError(404, 'TARGET_NOT_FOUND', 'Not found'));
    await expect(readCompanyFilingIdentity(req, h.sequenceId)).rejects.toMatchObject({ status: 404 });
    expect(h.queries).toEqual([]);
  });
});
describe('company reconciliation follows recorded package applicant and market authority', () => {
  it('uses the added market number rather than the home project number', async () => {
    h.admission.mockResolvedValue({ organizationId: 7, userId: 3, programId, projectId: 10, sequenceId: h.sequenceId,
      submissionId: 20, applicationType: 'IND', sequenceRegion: 'ema' });
    await db.exec("UPDATE submissions SET primary_region='ema',application_number='EU-654321'");
    const { data } = await readCompanyFilingIdentity(req, h.sequenceId);
    expect(data.filing).toMatchObject({ applicantName: 'Applicant Ltd', applicationNumber: 'EU-654321', country: 'EU', sponsorAddress: 'Filing Street' });
  });
  it('cannot acknowledge a missing added-market number using the home number', async () => {
    h.admission.mockResolvedValue({ organizationId: 7, userId: 3, programId, projectId: 10, sequenceId: h.sequenceId,
      submissionId: 20, applicationType: 'IND', sequenceRegion: 'ema' });
    await db.exec("UPDATE submissions SET primary_region='ema'");
    const input = await reviewInput();
    expect((await readCompanyFilingIdentity(req, h.sequenceId)).data).toMatchObject({ status: 'unresolved', unresolvedFields: ['application number'] });
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toMatchObject({ code: 'FILING_IDENTITY_INCOMPLETE' });
  });
  it('invalidates reviewed facts when the bound sponsor changes even with the same name', async () => {
    const input = await reviewInput();
    await reviewCompanyFilingIdentity(req, input);
    await db.query('UPDATE regulatory_programs SET applicant_sponsor_id=$1', [otherSponsorId]);
    const { data } = await readCompanyFilingIdentity(req, h.sequenceId);
    expect(data.status).toBe('needs_review');
    expect(data.filingHash).not.toBe(input.filingHash);
    await expect(reviewCompanyFilingIdentity(req, input)).rejects.toMatchObject({ code: 'FILING_IDENTITY_CHANGED' });
  });
  it('invalidates reviewed facts when the bound regulatory contact changes', async () => {
    const input = await reviewInput();
    await reviewCompanyFilingIdentity(req, input);
    await db.exec("UPDATE ind_sponsors SET contact_name='New Regulatory Contact'");
    expect((await readCompanyFilingIdentity(req, h.sequenceId)).data.status).toBe('needs_review');
  });
  it.each([null, '44444444-4444-4444-8444-444444444444'])('does not label a tenant as the FDA applicant when sponsor binding is %s', async bound => {
    await db.query('UPDATE regulatory_programs SET applicant_sponsor_id=$1', [bound]);
    const { data } = await readCompanyFilingIdentity(req, h.sequenceId);
    expect(data.filing.applicantName).toBeNull();
    expect(data.status).toBe('unresolved');
    await expect(reviewCompanyFilingIdentity(req, await reviewInput())).rejects.toMatchObject({ code: 'FILING_IDENTITY_INCOMPLETE' });
  });
});
