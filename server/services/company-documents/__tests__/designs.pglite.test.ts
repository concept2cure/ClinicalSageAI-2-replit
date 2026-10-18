import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';

const h = vi.hoisted(() => ({ q: undefined as unknown as RequestSqlClient, organizationId: 7, userId: 3,
  active: true, brand: true, failAudit: false, write: vi.fn<typeof import('../profile').writeProfile>(), programs: ['11111111-1111-4111-8111-111111111111'] }));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../auditService', () => ({
  writeChainedAuditRow: async (q: RequestSqlClient, entry: Record<string, unknown>) => {
    if (h.failAudit) throw new Error('Audit store unavailable');
    await q.query('INSERT INTO design_audits(organization_id,user_id,action,details) VALUES($1,$2,$3,$4::jsonb)',
      [entry.organizationId, entry.userId, entry.action, JSON.stringify(entry.details)]);
  },
  auditService: { logAction: vi.fn() },
}));
vi.mock('../profile', () => ({
  context: async (_req: Request, manage: boolean | string = false) => {
    if (!h.active || (manage && !h.brand)) throw Object.assign(new Error('Current brand permission required'), { code: 'COMPANY_PERMISSION_REQUIRED', status: 403 });
    return { organizationId: h.organizationId, userId: h.userId, q: h.q, canManage: true,
      capabilities: { manageBrand: h.brand, manageLegal: false, managePermissions: false } };
  },
  loadCompanyDocumentProfile: async (org: number, q: RequestSqlClient) => {
    const { rows } = await q.query('SELECT settings FROM organizations WHERE id=$1', [org]);
    return (rows[0].settings as { companyDocuments: CompanyDocumentProfile }).companyDocuments;
  },
  writeProfile: h.write,
}));
vi.mock('../../c2c/current-program-access', () => ({
  readCurrentProgramActor: async () => {
    if (!h.active) throw Object.assign(new Error('Current membership required'), { status: 403 });
    return { role: 'admin' };
  },
  requireCurrentProgramAccess: async (_q: RequestSqlClient, input: { programId: string }) => {
    if (!h.programs.includes(input.programId)) throw Object.assign(new Error('Project access refused'), { status: 403, code: 'PROGRAM_ACCESS_DENIED' });
    return { projectId: 21 };
  },
  getCurrentAccessibleProgramScope: async () => ({ programIds: h.programs }),
  requireProgramScopeStillCurrent: vi.fn(),
}));
vi.mock('../../submission-service/submission-request-read', () => ({
  readSubmissionSequenceForRequest: async () => ({ programId: h.programs[0], sequenceRegion: 'FDA' }),
}));

import { activateCompanyDefaultDesign, companyDefaultPresentationHash, listCompanyDesigns, publishCompanyDesign,
  readApprovedCompanyDefaultDesign, readCompanyDesign, readPublishedCompanyVariant,
  reviewCompanyDesign, stageCompanyDesign, validateApprovedCompanyDefault } from '../designs';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const PRIVATE = '22222222-2222-4222-8222-222222222222';
const req = {} as Request;
let db: PGlite;
function currentProfile(): CompanyDocumentProfile {
  return { version: 1, revision: 4, companyName: 'Current organization default', address: 'Default address', contact: '',
    registrationDetails: '', letterhead: globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null,
    applyToReports: false, applyToSubmissionCorrespondence: false, brandingAdopted: true, legalDocuments: [] };
}
function stageInput(scope: Record<string, unknown> = {}) {
  return { expectedRevision: 4, reason: 'Stage exact presentation for independent review', name: 'French subsidiary letterhead',
    scope: { programId: null, market: null, language: null, subsidiary: null, ...scope },
    candidate: { companyName: 'Subsidiary presentation', address: 'Company address for stationery', contact: 'Recorded contact',
      registrationDetails: '', letterhead: globalThis.structuredClone(DEFAULT_TEMPLATE_SPEC), importedFrom: null,
      applyToReports: false, applyToSubmissionCorrespondence: false } };
}
async function reviewedDesign(scope: Record<string, unknown> = {}) {
  h.userId = 3;
  const draft = await stageCompanyDesign(req, stageInput(scope));
  h.userId = 4;
  return reviewCompanyDesign(req, draft.design.id, { expectedHash: draft.design.sha256, reason: 'Independently reviewed actual design proof' });
}
async function publishedDesign(scope: Record<string, unknown> = {}) {
  const reviewed = await reviewedDesign(scope);
  return publishCompanyDesign(req, reviewed.design.id, { expectedRevision: 4, expectedHash: reviewed.design.sha256,
    reason: 'Publish this explicitly selected stationery variant' });
}
beforeAll(async () => {
  db = new PGlite(); h.q = db as unknown as RequestSqlClient;
  await db.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text NOT NULL,name text,settings jsonb NOT NULL);
    CREATE TABLE users(id integer PRIMARY KEY);
    CREATE SCHEMA vault;
    CREATE TABLE vault.legal_holds(organization_id integer,lifted_at timestamptz);
    CREATE TABLE design_audits(organization_id integer,user_id integer,action text,details jsonb);
    INSERT INTO organizations VALUES(7,'active','Org','{}'),(8,'active','Other','{}');
    INSERT INTO users VALUES(3),(4);`);
  await db.exec(await readFile('migrations/20260531_template_specs.sql', 'utf8'));
  await db.exec(await readFile('migrations/20260716_template_doc_types.sql', 'utf8'));
  await db.exec(await readFile('migrations/20261018_company_document_governance.sql', 'utf8'));
  await db.exec(await readFile('migrations/20261018_company_document_designs.sql', 'utf8'));
}, 60_000);
beforeEach(async () => {
  h.organizationId = 7; h.userId = 3; h.active = true; h.brand = true; h.failAudit = false; h.programs = [PROGRAM];
  h.write.mockReset();
  // Exercise the eligible platform-purge disposal path instead of disabling
  // the evidence guards or truncating protected revision history.
  await db.exec(`UPDATE organizations SET status='pending_deletion';
    SELECT set_config('app.current_user_role','app_super_admin',false);
    DELETE FROM company_document_designs;
    DELETE FROM company_document_revisions;
    DELETE FROM c2c_template_specs;
    DELETE FROM design_audits;
    UPDATE organizations SET status='active';
    SELECT set_config('app.current_user_role','',false);`);
  await db.query('UPDATE organizations SET settings=$1::jsonb', [JSON.stringify({ companyDocuments: currentProfile() })]);
});

describe('trusted approval for the organization default', () => {
  it('admits only an independently reviewed, published and completely unrestricted design', async () => {
    const draft = await stageCompanyDesign(req, stageInput());
    await expect(readApprovedCompanyDefaultDesign(h.q, 7, draft.design.id)).rejects.toMatchObject({ code: 'COMPANY_DEFAULT_NOT_APPROVED' });
    const published = await publishedDesign();
    expect((await readCompanyDesign(req, published.design.id)).canActivateDefault).toBe(true);
    const approved = await readApprovedCompanyDefaultDesign(h.q, 7, published.design.id);
    expect(approved).toMatchObject({ designId: published.design.id, designHash: published.design.sha256, publishedRevision: 1 });
    for (const scope of [{ programId: PROGRAM }, { market: 'US' }, { language: 'en' }, { subsidiary: 'Local entity' }]) {
      const scoped = await publishedDesign(scope);
      await expect(readApprovedCompanyDefaultDesign(h.q, 7, scoped.design.id)).rejects.toMatchObject({ code: 'COMPANY_DEFAULT_SCOPED_DESIGN' });
      expect((await readCompanyDesign(req, scoped.design.id)).canActivateDefault).toBe(false);
    }
    await expect(readApprovedCompanyDefaultDesign(h.q, 8, published.design.id)).rejects.toMatchObject({ code: 'COMPANY_DESIGN_NOT_FOUND' });
  });

  it('pins the retained identity, logo and style while allowing revision, library and automatic-use changes', async () => {
    const published = await publishedDesign();
    const selected = await readPublishedCompanyVariant(h.q, 7, published.design.id, { userId: 4 });
    const profile = { ...selected, revision: 81, brandingApprovalRequired: true, approvedDefaultDesignId: published.design.id,
      applyToReports: true, applyToSubmissionCorrespondence: true, legalRequirements: [] };
    await expect(validateApprovedCompanyDefault(h.q, 7, profile)).resolves.toBeUndefined();
    expect(companyDefaultPresentationHash(profile)).toBe(companyDefaultPresentationHash(selected));
    for (const changed of [{ companyName: 'Unreviewed company' }, { address: 'Unreviewed address' }, { contact: 'Changed contact' },
      { registrationDetails: 'Changed registration' }, { letterhead: { ...profile.letterhead, header: { text: 'Unreviewed header', alignment: 'left' as const } } }]) {
      await expect(validateApprovedCompanyDefault(h.q, 7, { ...profile, ...changed })).rejects.toMatchObject({ code: 'COMPANY_DEFAULT_APPROVAL_MISMATCH' });
    }
    await expect(validateApprovedCompanyDefault(h.q, 7, { ...profile, approvedDefaultDesignId: null })).rejects.toMatchObject({ code: 'COMPANY_DEFAULT_APPROVAL_REQUIRED' });
    // Published proof is retained independently of mutable canonical editing templates.
    await db.query("UPDATE c2c_template_specs SET spec='{}',is_active=false WHERE id=$1", [published.design.templateId]);
    await expect(validateApprovedCompanyDefault(h.q, 7, profile)).resolves.toBeUndefined();
  });

  it('requires intact retained publication evidence and refuses a missing retained presentation', async () => {
    const published = await publishedDesign();
    await db.exec("UPDATE organizations SET status='pending_deletion'; SELECT set_config('app.current_user_role','app_super_admin',false);");
    await db.query('DELETE FROM company_document_revisions WHERE variant_id=$1', [published.design.id]);
    await db.exec("UPDATE organizations SET status='active'; SELECT set_config('app.current_user_role','',false);");
    await expect(readApprovedCompanyDefaultDesign(h.q, 7, published.design.id)).rejects.toMatchObject({ code: 'COMPANY_REVISION_NOT_FOUND' });
  });

  it('delegates explicit activation to the canonical writer with preserved legal/policy state and mandatory same-transaction evidence', async () => {
    const published = await publishedDesign();
    const body = { expectedRevision: 4, expectedHash: published.design.sha256, reason: 'Activate independently reviewed organization default',
      applyToReports: true, applyToSubmissionCorrespondence: false };
    h.write.mockResolvedValue({ data: currentProfile(), canManage: true });
    await activateCompanyDefaultDesign(req, published.design.id, body);
    expect(h.write).toHaveBeenCalledTimes(1);
    const [request, revision, reason, transform, options] = h.write.mock.calls[0];
    expect(request).toBe(req); expect(revision).toBe(4); expect(reason).toBe(body.reason); expect(options?.capability).toBe('brand');
    if (!options?.beforeCommit) throw new Error('Default activation must enlist its verification in the canonical writer transaction.');
    const before: CompanyDocumentProfile = { ...currentProfile(), brandingApprovalRequired: true, variantId: published.design.id,
      legalRequirements: [{ id: 'retain-legal-policy', title: 'Retained authorization requirement', source: 'customer', regionalCode: null,
        kind: 'authorization', agencies: [], countries: [], submissionTypes: [], language: null, sectionCode: null,
        applicability: 'unresolved', rationale: 'Retain the independently managed legal requirement during branding activation.',
        legalDocumentIds: [], reviewedBy: '3', reviewedAt: '2026-10-18T00:00:00Z' }] };
    const after = { ...transform(before), revision: 5 };
    expect(after).toMatchObject({ companyName: 'Subsidiary presentation', approvedDefaultDesignId: published.design.id,
      brandingApprovalRequired: true, applyToReports: true, applyToSubmissionCorrespondence: false, legalRequirements: before.legalRequirements });
    expect(after).not.toHaveProperty('variantId');
    await options.beforeCommit(h.q, before, after);
    expect((await db.query<{ details: Record<string, unknown> }>("SELECT details FROM design_audits WHERE action='company_documents.design_default_activated'")).rows[0].details)
      .toMatchObject({ designId: published.design.id, designHash: published.design.sha256, defaultRevision: 5, applyToReports: true });
    h.failAudit = true;
    await expect(options.beforeCommit(h.q, before, after)).rejects.toThrow('Audit store unavailable');
    // Publication and the adapter itself never write defaults outside the canonical writer.
    expect((await db.query<{ settings: { companyDocuments: CompanyDocumentProfile } }>('SELECT settings FROM organizations WHERE id=7')).rows[0].settings)
      .toEqual({ companyDocuments: currentProfile() });
  });

  it('refuses stale, scoped, unreviewed, client-approval and unauthorized activation before invoking the default writer', async () => {
    const published = await publishedDesign();
    const body = { expectedRevision: 4, expectedHash: published.design.sha256, reason: 'Explicit activation of reviewed default',
      applyToReports: false, applyToSubmissionCorrespondence: false };
    await expect(activateCompanyDefaultDesign(req, published.design.id, { ...body, expectedHash: 'f'.repeat(64) }))
      .rejects.toMatchObject({ code: 'COMPANY_DESIGN_REVIEW_STALE' });
    await expect(activateCompanyDefaultDesign(req, published.design.id, { ...body, approvedDefaultDesignId: published.design.id }))
      .rejects.toMatchObject({ status: 400 });
    const scoped = await publishedDesign({ market: 'US' });
    await expect(activateCompanyDefaultDesign(req, scoped.design.id, { ...body, expectedHash: scoped.design.sha256 }))
      .rejects.toMatchObject({ code: 'COMPANY_DEFAULT_SCOPED_DESIGN' });
    h.brand = false;
    await expect(activateCompanyDefaultDesign(req, published.design.id, body)).rejects.toMatchObject({ code: 'COMPANY_PERMISSION_REQUIRED' });
    expect(h.write).not.toHaveBeenCalled();
  });
});
afterAll(async () => { await db.close(); });

describe('governed named company design publication', () => {
  it('stores the editable spec only in the canonical template store, with immutable identity/hash metadata', async () => {
    const draft = await stageCompanyDesign(req, stageInput({ programId: PROGRAM, market: 'EMA', language: 'fr-ca' }));
    expect(draft.design).toMatchObject({ state: 'draft', scope: { programId: PROGRAM, market: 'EU', language: 'fr-CA' } });
    expect(draft.canReview).toBe(false);
    const template = (await db.query<{ spec: { brand: { organizationName: string } }; project_id: string }>('SELECT spec,project_id FROM c2c_template_specs')).rows[0];
    expect(template.spec.brand.organizationName).toBe('Subsidiary presentation');
    expect(template.project_id).toBe(PROGRAM);
    const metadata = (await db.query<{ identity: Record<string, unknown> }>('SELECT identity FROM company_document_designs')).rows[0];
    expect(metadata.identity).not.toHaveProperty('letterhead');
    expect(metadata.identity).not.toHaveProperty('legalDocuments');
    const audits = JSON.stringify((await db.query('SELECT details FROM design_audits')).rows);
    expect(audits).not.toContain('Subsidiary presentation');
    expect(audits).not.toContain('Company address for stationery');
  });

  it('requires a separate reviewer and binds review/publication to the exact candidate hash', async () => {
    const draft = await stageCompanyDesign(req, stageInput());
    await expect(reviewCompanyDesign(req, draft.design.id, { expectedHash: draft.design.sha256, reason: 'Attempt creator self approval' }))
      .rejects.toMatchObject({ code: 'COMPANY_DESIGN_INDEPENDENT_REVIEW' });
    h.userId = 4;
    expect((await readCompanyDesign(req, draft.design.id)).canReview).toBe(true);
    await expect(reviewCompanyDesign(req, draft.design.id, { expectedHash: 'a'.repeat(64), reason: 'Review stale loaded presentation' }))
      .rejects.toMatchObject({ code: 'COMPANY_DESIGN_REVIEW_STALE' });
    await expect(publishCompanyDesign(req, draft.design.id, { expectedRevision: 4, expectedHash: draft.design.sha256, reason: 'Attempt publication before independent review' }))
      .rejects.toMatchObject({ code: 'COMPANY_DESIGN_NOT_REVIEWED' });
    const review = await reviewCompanyDesign(req, draft.design.id, { expectedHash: draft.design.sha256, reason: 'Reviewed actual layout and identity proof' });
    expect(review).toMatchObject({ canPublish: true, design: { state: 'reviewed', reviewedBy: 4 } });
  });

  it('publishes retained stationery without changing the organization default or its revision', async () => {
    const before = (await db.query('SELECT settings FROM organizations WHERE id=7')).rows[0];
    const published = await publishedDesign();
    expect(published.design).toMatchObject({ state: 'published', publishedRevision: 1, publishedBy: 4 });
    expect((await db.query('SELECT settings FROM organizations WHERE id=7')).rows[0]).toEqual(before);
    const selected = await readPublishedCompanyVariant(h.q, 7, published.design.id, { userId: 4 });
    expect(selected).toMatchObject({ variantId: published.design.id, revision: 1, companyName: 'Subsidiary presentation',
      applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [] });
    expect((await db.query('SELECT * FROM company_document_revisions WHERE variant_id=$1', [published.design.id])).rows).toHaveLength(1);
  });

  it('refuses template drift after review, and published variants continue using immutable history after later template edits', async () => {
    const reviewed = await reviewedDesign();
    await db.query("UPDATE c2c_template_specs SET spec=jsonb_set(spec,'{brand,organizationName}','\"Changed after review\"') WHERE id=$1", [reviewed.design.templateId]);
    await expect(publishCompanyDesign(req, reviewed.design.id, { expectedRevision: 4, expectedHash: reviewed.design.sha256, reason: 'Try to publish altered backing template' }))
      .rejects.toMatchObject({ code: 'COMPANY_DESIGN_CHANGED' });
    const published = await publishedDesign();
    await db.query("UPDATE c2c_template_specs SET spec='{}',is_active=false WHERE id=$1", [published.design.templateId]);
    expect((await readPublishedCompanyVariant(h.q, 7, published.design.id, { userId: 4 })).companyName).toBe('Subsidiary presentation');
  });

  it('refuses stale default revisions, missing current brand grants and failed mandatory audits without retaining partial writes', async () => {
    await expect(stageCompanyDesign(req, { ...stageInput(), expectedRevision: 3 })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    h.brand = false;
    await expect(stageCompanyDesign(req, stageInput())).rejects.toMatchObject({ code: 'COMPANY_PERMISSION_REQUIRED' });
    h.brand = true; h.failAudit = true;
    await expect(stageCompanyDesign(req, stageInput())).rejects.toThrow('Audit store unavailable');
    expect((await db.query('SELECT * FROM c2c_template_specs')).rows).toHaveLength(0);
    expect((await db.query('SELECT * FROM company_document_designs')).rows).toHaveLength(0);
  });

  it('rolls back a publication and its retained variant when its audit cannot be recorded', async () => {
    const reviewed = await reviewedDesign(); h.failAudit = true;
    await expect(publishCompanyDesign(req, reviewed.design.id, { expectedRevision: 4, expectedHash: reviewed.design.sha256, reason: 'Publish reviewed variant during audit outage' })).rejects.toThrow('Audit store unavailable');
    expect((await db.query('SELECT state FROM company_document_designs WHERE id=$1', [reviewed.design.id])).rows[0]).toEqual({ state: 'reviewed' });
    expect((await db.query('SELECT * FROM company_document_revisions')).rows).toHaveLength(0);
  });

  it('refuses direct metadata editing, self review in SQL and deletion of retained design evidence', async () => {
    const draft = await stageCompanyDesign(req, stageInput());
    await expect(db.query('UPDATE company_document_designs SET name=$2 WHERE id=$1', [draft.design.id, 'Changed outside review'])).rejects.toThrow('immutable');
    await expect(db.query("UPDATE company_document_designs SET state='reviewed',reviewed_by=3,reviewed_at=now() WHERE id=$1", [draft.design.id])).rejects.toThrow();
    await expect(db.query('DELETE FROM company_document_designs WHERE id=$1', [draft.design.id])).rejects.toThrow('retained evidence');
    await expect(db.exec('TRUNCATE company_document_designs')).rejects.toThrow('retained evidence');
  });
});

describe('current access and explicit stationery scope', () => {
  it('fails closed for unknown or mismatched filing/project/language/entity facts, then accepts an exact admitted target', async () => {
    const published = await publishedDesign({ programId: PROGRAM, market: 'US', language: 'en-US', subsidiary: 'Local sponsor' });
    for (const target of [{}, { programId: PROGRAM }, { programId: PROGRAM, market: 'EMA' },
      { programId: PROGRAM, market: 'FDA', language: 'en-US' }, { programId: PROGRAM, market: 'FDA', language: 'en-US', subsidiary: 'Other entity' }]) {
      await expect(readPublishedCompanyVariant(h.q, 7, published.design.id, { userId: 4, ...target })).rejects.toMatchObject({ code: 'COMPANY_VARIANT_SCOPE' });
    }
    const target = { userId: 4, programId: PROGRAM, market: 'FDA', language: 'en-us', subsidiary: 'Local sponsor' };
    expect((await readPublishedCompanyVariant(h.q, 7, published.design.id, target)).variantId).toBe(published.design.id);
    h.programs = [];
    await expect(readPublishedCompanyVariant(h.q, 7, published.design.id, target)).rejects.toMatchObject({ code: 'PROGRAM_ACCESS_DENIED' });
    h.active = false;
    await expect(readPublishedCompanyVariant(h.q, 7, published.design.id, target)).rejects.toThrow('membership');
  });

  it('never returns another tenant’s candidate and filters inaccessible project metadata from lists', async () => {
    const own = await stageCompanyDesign(req, stageInput());
    h.programs = [PROGRAM, PRIVATE];
    await stageCompanyDesign(req, stageInput({ programId: PRIVATE }));
    h.programs = [PROGRAM];
    expect((await listCompanyDesigns(req, {})).data.map(entry => entry.id)).toEqual([own.design.id]);
    h.organizationId = 8;
    await expect(readCompanyDesign(req, own.design.id)).rejects.toMatchObject({ code: 'COMPANY_DESIGN_NOT_FOUND' });
    await expect(readPublishedCompanyVariant(h.q, 8, own.design.id, { userId: 4 })).rejects.toMatchObject({ code: 'COMPANY_DESIGN_NOT_FOUND' });
  });

  it('filters published choices against server-admitted sequence facts without inventing language/entity facts', async () => {
    const allowed = await publishedDesign({ programId: PROGRAM, market: 'US' });
    await publishedDesign({ programId: PROGRAM, market: 'EU' });
    await publishedDesign({ programId: PROGRAM, language: 'en' });
    const options = await listCompanyDesigns(req, { state: 'published', sequenceId: '10' });
    expect(options.data.map(entry => entry.id)).toEqual([allowed.design.id]);
  });

  it('paginates stable named choices without silently auto-selecting any design', async () => {
    await stageCompanyDesign(req, stageInput()); await stageCompanyDesign(req, stageInput());
    const first = await listCompanyDesigns(req, { limit: '1' });
    expect(first.data).toHaveLength(1); expect(first.nextBefore).toBe(first.data[0].id);
    const next = await listCompanyDesigns(req, { limit: '1', before: first.nextBefore });
    expect(next.data).toHaveLength(1); expect(next.data[0].id).not.toBe(first.data[0].id); expect(next.nextBefore).toBeNull();
  });
});
