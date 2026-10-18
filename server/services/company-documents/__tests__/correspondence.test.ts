import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { normalizeTemplateSpec } from '../../../../shared/templates/template-spec';
import type { CompanyDocumentProfile } from '../../../../shared/company-documents';

const mocks = vi.hoisted(() => ({ query: vi.fn(), admit: vi.fn(), still: vi.fn(), retain: vi.fn(), load: vi.fn(), read: vi.fn(), create: vi.fn(), actor: vi.fn(), variant: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { query: mocks.query, connect: vi.fn() } }));
vi.mock('../../submission-service/submission-request-read', () => ({ readSubmissionSequenceForRequest: mocks.admit, requireSubmissionReadStillCurrent: mocks.still }));
vi.mock('../../authoring/authoring-from-draft', () => ({ createDocumentFromDraft: mocks.create }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: mocks.actor }));
vi.mock('../history', () => ({ retainCompanyPresentationRevision: mocks.retain }));
vi.mock('../designs', () => ({ readPublishedCompanyVariant: mocks.variant }));
vi.mock('../profile', async () => {
  const { CompanyDocumentsError } = await import('../validation');
  const { companyProfileHash } = await import('../provenance');
  return { loadCompanyDocumentProfile: mocks.load, readCompanyDocumentProfile: mocks.read, CompanyDocumentsError, companyProfileHash };
});

import { createSubmissionCorrespondenceDraft, prepareSubmissionCorrespondence } from '../correspondence';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const profile: CompanyDocumentProfile = { version: 1, revision: 4, companyName: 'Presentation brand', address: 'Brand address', contact: '', registrationDetails: '',
  letterhead: normalizeTemplateSpec({}), importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: true, legalDocuments: [] };
const q = { query: mocks.query };
const req = { organizationId: 7, userId: 3, user: { id: 3, organizationId: 7, email: 'author@example.test' }, tenantContext: { organizationId: 7 }, dbClient: q,
  headers: { 'user-agent': 'test' }, ip: '127.0.0.1' } as unknown as Request;
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.admit.mockResolvedValue({ organizationId: 7, userId: 3, programId: PROGRAM, projectId: 42, submissionId: 5, sequenceId: 9, sequenceRegion: 'fda', applicationType: 'ind' });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('s.title,e.sequence_number')) return { rows: [{ title: 'Recorded submission', sequence_number: '0002' }] };
    if (sql.includes('SELECT name FROM organizations')) return { rows: [{ name: 'Recorded applicant' }] };
    if (sql.includes('SELECT application_number')) return { rows: [{ application_number: 'IND123456' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });
  mocks.load.mockResolvedValue(profile); mocks.read.mockResolvedValue({ data: profile, canManage: false });
  mocks.actor.mockResolvedValue({ userId: 3, role: 'regulatory-author' });
  mocks.create.mockImplementation(async (_ctx, _input, options) => {
    await options.companyCorrespondence.reserve(q);
    return { kind: 'created', document: { id: DOC }, sections: [], binding: { documentId: null } };
  });
});

describe('admitted company correspondence', () => {
  it('derives every filing fact from the admitted sequence and canonical identity reader', async () => {
    const context = await prepareSubmissionCorrespondence(req, 9, profile);
    expect(context.origin).toMatchObject({ organizationId: 7, programId: PROGRAM, projectId: 42, submissionId: 5, sequenceId: 9,
      sequenceNumber: '0002', submissionTitle: 'Recorded submission', applicationNumber: 'IND123456', applicantName: 'Recorded applicant',
      country: 'US', agency: 'FDA', recipient: { authority: 'FDA', basis: 'recorded_filing_market' }, companyDocumentRevision: 4 });
    expect(mocks.admit).toHaveBeenCalledWith(q, { organizationId: 7, userId: 3 }, 9);
    await context.assertCurrent();
    expect(mocks.retain).toHaveBeenCalledWith(q, 7, profile, 3, expect.any(String));
  });

  it('selects only an explicit published variant in the actual admitted market and retains its variant identity', async () => {
    const variantId = '44444444-4444-4444-8444-444444444444';
    mocks.variant.mockResolvedValue({ ...profile, companyName: 'Published subsidiary', applyToSubmissionCorrespondence: false, variantId });
    const context = await prepareSubmissionCorrespondence(req, 9, profile, variantId);
    expect(context.origin.variantId).toBe(variantId); expect(context.profile.companyName).toBe('Published subsidiary');
    expect(context.origin.companyBrandingApplied).toBe(true); expect(context.origin.explicitSelection).toBe(true);
    expect(mocks.variant).toHaveBeenCalledWith(q, 7, variantId, { userId: 3, programId: PROGRAM, market: 'US' });
    await context.assertCurrent(); expect(mocks.retain).not.toHaveBeenCalled();
  });

  it('refuses a filing identity change during render or before the canonical create transaction', async () => {
    const context = await prepareSubmissionCorrespondence(req, 9, profile);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('s.title,e.sequence_number')) return { rows: [{ title: 'Recorded submission', sequence_number: '0003' }] };
      if (sql.includes('SELECT name FROM organizations')) return { rows: [{ name: 'Recorded applicant' }] };
      if (sql.includes('SELECT application_number')) return { rows: [{ application_number: 'IND123456' }] };
      throw new Error('unexpected');
    });
    await expect(context.assertCurrent()).rejects.toMatchObject({ code: 'CORRESPONDENCE_CONTEXT_CHANGED' });
    expect(mocks.retain).not.toHaveBeenCalled();
  });

  it('saves through the canonical Authoring creator with server origin, sanitized text and explicit reason', async () => {
    const result = await createSubmissionCorrespondenceDraft(req, { sequenceId: 9, title: 'Response to FDA', paragraphs: ['<script>user text</script>'], reason: 'Prepare response for review' });
    expect(result).toMatchObject({ authoringDocId: DOC, programId: PROGRAM, submissionId: 5, sequenceId: 9, documentStatus: 'draft', filedInVault: false });
    const [ctx, input, options] = mocks.create.mock.calls[0];
    expect(ctx.actor).toEqual({ id: '3', email: 'author@example.test' });
    expect(input).toMatchObject({ programId: PROGRAM, module: 'M1', documentType: 'company_correspondence', provenance: { source: 'seed' } });
    expect(input.sections[0].content).toContain('&lt;script&gt;user text&lt;/script&gt;');
    expect(options.changeReason).toBe('Prepare response for review');
    expect(options.companyCorrespondence.origin).toMatchObject({ applicantName: 'Recorded applicant', companyDocumentRevision: 4 });
    expect(mocks.retain).toHaveBeenCalledTimes(1);
  });

  it('rejects spoofed project, recipient and company presentation fields before creating a draft', async () => {
    await expect(createSubmissionCorrespondenceDraft(req, { sequenceId: 9, title: 'Letter', paragraphs: [], reason: 'Prepare correspondence', agency: 'EMA', programId: PROGRAM, companyDocumentRevision: 999 }))
      .rejects.toMatchObject({ code: 'INVALID_COMPANY_DOCUMENTS', status: 400 });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.admit).not.toHaveBeenCalled();
  });

  it('does not substitute company branding for an unknown applicant or application number', async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes('s.title,e.sequence_number')
      ? { rows: [{ title: 'Recorded submission', sequence_number: '0002' }] } : { rows: [] });
    const context = await prepareSubmissionCorrespondence(req, 9, profile);
    expect(context.origin.applicantName).toBeNull(); expect(context.origin.applicationNumber).toBeNull();
  });
});
