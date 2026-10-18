import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';

const h = vi.hoisted(() => ({ q: undefined as unknown as RequestSqlClient, organizationId: 7, userId: 3,
  source: vi.fn(), failPolicy: false, revokeDuringRead: false, statements: [] as string[] }));
vi.mock('../../../db', () => ({ getPool: () => h.q }));
vi.mock('../profile', () => ({
  context: async () => ({ q: h.q, organizationId: h.organizationId, userId: h.userId }),
  companyLegalSourceVerdict: h.source,
  companyDocumentsFailure: (error: { status?: number; code?: string; message?: string }) => ({ status: error.status ?? 503,
    code: error.code ?? 'LEGAL_INVENTORY_UNAVAILABLE', message: error.message ?? 'Legal inventory unavailable' }),
}));
import { readCompanyLegalInventory } from '../legal-inventory';
import router from '../../../routes/company-legal-inventory';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PRIVATE = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const req = {} as Request;
const app = express(); app.use('/company', router);
let db: PGlite;

function document(id: string, overrides: Partial<CompanyLegalDocument> = {}): CompanyLegalDocument {
  return { id, title: `Authorization ${id}`, kind: 'authorization', programId: PROGRAM,
    vaultDocumentId: '44444444-4444-4444-8444-444444444444', contentHash: 'a'.repeat(64), version: '1',
    agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_IND'], language: 'en',
    effectiveOn: null, expiresOn: null, active: true, registeredAt: '2026-10-01T00:00:00Z', registeredBy: '3', ...overrides };
}
async function insert(documents: CompanyLegalDocument[], organizationId = 7) {
  await db.query(`INSERT INTO company_legal_registry(organization_id,id,document)
    SELECT $1,d->>'id',d FROM jsonb_array_elements($2::jsonb) d`, [organizationId, JSON.stringify(documents)]);
  for (const doc of documents) await db.query('INSERT INTO source_verdicts VALUES($1,$2,NULL)', [organizationId, doc.id]);
}
function workflow(revokedAt: string | null, invalid = false): NonNullable<CompanyLegalDocument['workflow']> {
  return { custodianUserId: null, reminderDays: [], replacementId: null, revokedAt, revokedBy: revokedAt ? '3' : null,
    revocationReason: revokedAt ? 'Recorded legal revocation' : null, authority: null, signatureEvidence: invalid ? {
      result: 'invalid', verification: 'recorded_external_evidence', verifiedAt: '2026-10-01T00:00:00Z',
      reviewedBy: '3', recordedAt: '2026-10-01T00:00:00Z', method: 'manual_evidence', tool: 'External signed report',
      evidence: { vaultDocumentId: '55555555-5555-4555-8555-555555555555', programId: PROGRAM, contentHash: 'b'.repeat(64), version: '1' },
    } : null, translationOfId: null, certifiedTranslationEvidence: null, updatedBy: '3', updatedAt: '2026-10-01T00:00:00Z' };
}
beforeAll(async () => {
  db = new PGlite();
  h.q = { query: async (sql, params) => {
    h.statements.push(sql);
    if (h.failPolicy && sql.includes('FROM projects p LEFT JOIN project_visibility_settings')) throw new Error('Sharing policy unavailable');
    const result = await db.query<Record<string, unknown>>(sql, params);
    if (h.revokeDuringRead && sql.includes('WITH base AS')) {
      h.revokeDuringRead = false;
      await db.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=3");
    }
    return result;
  } };
  await db.exec(`CREATE TABLE organizations(id int PRIMARY KEY,status text,settings json NOT NULL DEFAULT '{}');
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE regulatory_programs(id uuid PRIMARY KEY,organization_id int,deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY,organization_id int,client_workspace_id int,regulatory_program_id uuid,
      owner_id int,created_by_id int,settings jsonb,status text DEFAULT 'active');
    CREATE TABLE project_visibility_settings(project_id int,organization_id int,visibility text);
    CREATE TABLE project_members(project_id int,organization_id int,user_id int,role text,status text);
    CREATE TABLE concept2cure_review_assignments(reviewer_id int,organization_id int,artifact_id uuid,status text);
    CREATE TABLE concept2cure_artifacts(id uuid PRIMARY KEY,project_id int,organization_id int);
    CREATE TABLE source_verdicts(organization_id int,id text,refusal text);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds(organization_id integer,lifted_at timestamptz);
    INSERT INTO organizations(id,status) VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(3,'active');
    INSERT INTO organization_users VALUES(7,3,'readonly');
    INSERT INTO regulatory_programs VALUES('${PROGRAM}',7,NULL),('${PRIVATE}',7,NULL),('${FOREIGN}',8,NULL);
    INSERT INTO projects VALUES(11,7,71,'${PROGRAM}',99,99,'{}','active'),(12,7,71,'${PRIVATE}',99,99,'{}','active'),
      (21,8,81,'${FOREIGN}',3,3,'{}','active');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'private'),(21,8,'private');
    INSERT INTO project_members VALUES(11,7,3,'use','active');`);
  await db.exec(await readFile('migrations/20261018_company_legal_registry.sql', 'utf8'));
}, 60_000);
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
  h.organizationId = 7; h.userId = 3; h.failPolicy = false; h.revokeDuringRead = false; h.source.mockReset();
  await db.exec(`UPDATE organizations SET status='pending_deletion';
    SELECT set_config('app.current_user_role','app_super_admin',false);
    DELETE FROM company_legal_registry; DELETE FROM source_verdicts;
    UPDATE organizations SET status='active'; UPDATE users SET status='active';
    DELETE FROM organization_users; INSERT INTO organization_users VALUES(7,3,'readonly');
    UPDATE project_members SET status='active'; SELECT set_config('app.current_user_role','',false);`);
  h.source.mockImplementation(async (q: RequestSqlClient, org: number, doc: CompanyLegalDocument) => {
    const { rows } = await q.query('SELECT refusal FROM source_verdicts WHERE organization_id=$1 AND id=$2', [org, doc.id]);
    return rows.length === 1 ? rows[0].refusal : 'The exact current source cannot be verified.';
  });
  h.statements.length = 0;
});
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => { await db.close(); });

describe('public legal inventory copy privacy', () => {
  it('retains canonical source ancestry for gate checks while omitting inaccessible ancestor pointers from the public page', async () => {
    const sourceOriginal = { registryId: 'private_ancestor_registry', vaultDocumentId: PRIVATE, programId: PRIVATE, version: '9', contentHash: 'c'.repeat(64) };
    await insert([document('copy', { sourceOriginal })]);
    const result = await readCompanyLegalInventory(req, {});
    expect(result.data[0]).not.toHaveProperty('sourceOriginal');
    expect(JSON.stringify(result)).not.toContain('private_ancestor_registry');
    expect(JSON.stringify(result)).not.toContain(PRIVATE);
    expect(h.source).toHaveBeenCalledWith(h.q, 7, expect.objectContaining({ sourceOriginal }));
    expect((await db.query<{ document: CompanyLegalDocument }>("SELECT document FROM company_legal_registry WHERE id='copy'")).rows[0].document.sourceOriginal).toEqual(sourceOriginal);
  });

});

describe('SQL-paged company legal inventory with canonical current project access', () => {
  it('filters private and foreign records before metadata, counts, facets and pagination', async () => {
    await insert([document('public'), document('hidden', { programId: PRIVATE, agencies: ['EMA'], language: 'fr', title: 'PRIVATE TITLE' })]);
    await insert([document('foreign', { programId: FOREIGN, language: 'ja' })], 8);
    const result = await readCompanyLegalInventory(req, {});
    expect(result.data.map(doc => doc.id)).toEqual(['public']);
    expect(result.page).toEqual({ total: 1, availableTotal: 1, limit: 10, offset: 0, hasMore: false, nextOffset: null });
    expect(result.facets).toEqual({ agencies: ['FDA'], languages: ['en'] });
    expect(JSON.stringify(result)).not.toContain('PRIVATE TITLE');
    expect(h.source).toHaveBeenCalledTimes(1);
  });

  it('admits an optional exact program before any registry query and does not expose denied counts over HTTP', async () => {
    await insert([document('allowed'), document('hidden', { programId: PRIVATE })]);
    const denied = await request(app).get('/company/legal-documents').query({ programId: PRIVATE });
    expect(denied.status).toBe(403); expect(denied.body).not.toHaveProperty('page');
    expect(h.statements.some(sql => sql.includes('company_legal_registry'))).toBe(false);
    const allowed = await request(app).get('/company/legal-documents').query({ programId: PROGRAM, limit: 1 });
    expect(allowed.status).toBe(200); expect(allowed.body.data[0].id).toBe('allowed'); expect(allowed.body.page.total).toBe(1);
  });

  it('pages larger libraries in SQL and verifies current sources only for the visible metadata page', async () => {
    await insert(Array.from({ length: 1005 }, (_, index) => document(`entry-${String(index).padStart(4, '0')}`)));
    const result = await readCompanyLegalInventory(req, { limit: '10', offset: '1000' });
    expect(result.data).toHaveLength(5); expect(result.data[0].id).toBe('entry-1000');
    expect(result.page).toMatchObject({ total: 1005, availableTotal: 1005, hasMore: false, nextOffset: null });
    expect(h.source).toHaveBeenCalledTimes(5);
    expect(h.statements.find(sql => sql.includes('WITH filtered AS'))).toContain('LIMIT');
  });

  it('binds literal search/filter values, canonicalizes agency aliases and retains unrestricted applicability', async () => {
    await insert([document('a', { title: 'Authority 100%_signed', agencies: ['US'], language: 'EN', kind: 'certificate' }),
      document('b', { title: 'Authority 100 percent', agencies: [], language: 'EN', kind: 'certificate' }),
      document('c', { agencies: ['EMA'], language: 'fr' })]);
    const exact = await readCompanyLegalInventory(req, { q: '100%_', agency: 'FDA', language: 'en', kind: 'certificate' });
    expect(exact.data.map(doc => doc.id)).toEqual(['a']); expect(exact.page.availableTotal).toBe(3);
    const agency = await readCompanyLegalInventory(req, { agency: 'FDA' });
    expect(agency.data.map(doc => doc.id)).toEqual(['b', 'a']);
  });

  it('keeps UTC expiry boundaries inclusive and distinguishes future, expired, revoked and archived views', async () => {
    await insert([document('today', { expiresOn: '2026-10-18' }), document('horizon', { expiresOn: '2026-11-17' }),
      document('later', { expiresOn: '2026-11-18' }), document('expired', { expiresOn: '2026-10-17' }),
      document('future', { effectiveOn: '2026-10-19' }), document('revoked', { workflow: workflow('2026-10-17T00:00:00Z') }),
      document('archived', { active: false })]);
    expect((await readCompanyLegalInventory(req, { validity: 'expiring' })).data.map(doc => doc.id)).toEqual(['horizon', 'today']);
    expect((await readCompanyLegalInventory(req, { validity: 'expired' })).data.map(doc => doc.id)).toEqual(['expired']);
    expect((await readCompanyLegalInventory(req, { validity: 'future' })).data.map(doc => doc.id)).toEqual(['future']);
    expect((await readCompanyLegalInventory(req, { validity: 'revoked' })).data.map(doc => doc.id)).toEqual(['revoked']);
    const archived = await readCompanyLegalInventory(req, { validity: 'archived' });
    expect(archived.data.map(doc => doc.id)).toEqual(['archived']); expect(archived.page.availableTotal).toBe(7);
  });

  it('uses canonical approval and legal eligibility before approval-filter counts and pagination', async () => {
    await insert([document('approved'), document('pending'), document('expired', { expiresOn: '2026-10-17' }),
      document('future', { effectiveOn: '2026-10-19' }), document('revoked', { workflow: workflow('2026-10-17') }),
      document('invalid-signature', { workflow: workflow(null, true) }), document('archived', { active: false })]);
    await db.query("UPDATE source_verdicts SET refusal='The exact version is not currently approved.' WHERE id='pending'");
    const approved = await readCompanyLegalInventory(req, { validity: 'approved', includeArchived: 'true', limit: '1' });
    expect(approved.data.map(doc => doc.id)).toEqual(['approved']); expect(approved.page.total).toBe(1);
    expect(h.source).toHaveBeenCalledTimes(7);
    h.source.mockClear();
    const blocked = await readCompanyLegalInventory(req, { validity: 'unapproved', includeArchived: 'true', limit: '2' });
    expect(blocked.data).toHaveLength(2); expect(blocked.page).toMatchObject({ total: 6, hasMore: true, nextOffset: 2 });
    expect(h.source).toHaveBeenCalledTimes(7);
  });

  it('returns stable title, expiry and recent ordering with honest empty pages beyond the end', async () => {
    await insert([document('b', { title: 'Beta', expiresOn: '2027-01-01', registeredAt: '2026-10-01' }),
      document('a', { title: 'Alpha', expiresOn: null, registeredAt: '2026-10-02' })]);
    expect((await readCompanyLegalInventory(req, { sort: 'title' })).data.map(doc => doc.id)).toEqual(['a', 'b']);
    expect((await readCompanyLegalInventory(req, { sort: 'expiry' })).data.map(doc => doc.id)).toEqual(['b', 'a']);
    expect((await readCompanyLegalInventory(req, { sort: 'recent' })).data.map(doc => doc.id)).toEqual(['a', 'b']);
    const end = await readCompanyLegalInventory(req, { offset: '20' });
    expect(end.data).toEqual([]); expect(end.page).toMatchObject({ total: 2, offset: 20, hasMore: false, nextOffset: null });
    const largeOffset = await readCompanyLegalInventory(req, { offset: '2147483648' });
    expect(largeOffset.data).toEqual([]);
    expect(largeOffset.page).toMatchObject({ total: 2, offset: 2147483648, hasMore: false, nextOffset: null });
  });

  it('fails closed on observed sharing revocation during the multi-read response, rather than returning stale counts', async () => {
    await insert([document('private-to-reader')]); h.revokeDuringRead = true;
    await expect(readCompanyLegalInventory(req, {})).rejects.toMatchObject({ code: 'PROJECT_ACCESS_CHANGED' });
  });

  it('fails before registry reads when current membership or project-policy verification is unavailable', async () => {
    await insert([document('not-disclosed')]); h.failPolicy = true;
    await expect(readCompanyLegalInventory(req, {})).rejects.toMatchObject({ code: 'PROJECT_ACCESS_UNAVAILABLE' });
    expect(h.statements.some(sql => sql.includes('company_legal_registry'))).toBe(false);
    h.failPolicy = false; await db.query("UPDATE users SET status='inactive' WHERE id=3"); h.statements.length = 0;
    await expect(readCompanyLegalInventory(req, {})).rejects.toMatchObject({ status: 403 });
    expect(h.statements.some(sql => sql.includes('company_legal_registry'))).toBe(false);
  });

  it('distinguishes actual empty inventory from a source-verification failure and rejects unsupported query parameters', async () => {
    expect((await readCompanyLegalInventory(req, {})).page.total).toBe(0);
    await insert([document('source-failure')]); h.source.mockRejectedValue(new Error('Approval service unavailable'));
    await expect(readCompanyLegalInventory(req, {})).rejects.toThrow('Approval service unavailable');
    const invalid = await request(app).get('/company/legal-documents').query({ limit: 101, includeArchived: 'false', organizationId: 8 });
    expect(invalid.status).toBe(400); expect(invalid.body).not.toHaveProperty('data');
    await expect(readCompanyLegalInventory(req, { includeArchived: 'FALSE' })).rejects.toMatchObject({ status: 400 });
  });
});
