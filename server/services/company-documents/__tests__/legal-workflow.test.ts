import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanyDocumentProfile, CompanyLegalDocument } from '../../../../shared/company-documents';
import { DEFAULT_TEMPLATE_SPEC } from '../../../../shared/templates/template-spec';
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn(), write: vi.fn(), load: vi.fn(), source: vi.fn(), approval: vi.fn(), access: vi.fn(), actor: vi.fn(), placements: vi.fn(), estar: vi.fn(), cmc: vi.fn(), notify: vi.fn(), query: vi.fn(), sequence: vi.fn(), still: vi.fn() }));
vi.mock('../profile', () => ({ context: mocks.context, readCompanyLegalDocument: mocks.read, writeProfile: mocks.write, loadCompanyDocumentProfile: mocks.load,
  readCompanyDocumentProfile: vi.fn(), CompanyDocumentsError: class CompanyDocumentsError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } } }));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: mocks.source, vaultVersionNotTransmittable: mocks.approval }));
vi.mock('../../vault/vault-where-used', () => ({ readVaultPlacements: mocks.placements, readVaultEstarUses: mocks.estar, readVaultCmcEvidenceUses: mocks.cmc }));
vi.mock('../../c2c/current-program-access', () => ({ requireCurrentProgramAccess: mocks.access, readCurrentProgramActor: mocks.actor,
  ProgramReadAccessError: class ProgramReadAccessError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } } }));
vi.mock('../../notifications/notification-service', () => ({ createNotification: mocks.notify }));
vi.mock('../../submission-service/submission-request-read', () => ({ readSubmissionSequenceForRequest: mocks.sequence, requireSubmissionReadStillCurrent: mocks.still }));
import { readCompanyLegalLifecycle, updateCompanyLegalWorkflow, updateCompanyLegalRequirement, notifyCompanyLegalRenewal } from '../legal-workflow';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT = '22222222-2222-4222-8222-222222222222';
const EVIDENCE = '33333333-3333-4333-8333-333333333333';
const HASH = 'a'.repeat(64);
const document: CompanyLegalDocument = { id: 'legal_a', title: 'Authorization', kind: 'authorization', programId: PROGRAM, vaultDocumentId: VAULT,
  contentHash: HASH, version: '1', agencies: [], countries: [], submissionTypes: [], language: 'en', effectiveOn: null, expiresOn: '2026-10-25', active: true,
  registeredAt: '2026-01-01', registeredBy: '3', transmitRefusal: null };
const req = {} as Request;
const q = { query: mocks.query };
let profile: CompanyDocumentProfile;
const workflowInput = () => ({ expectedRevision: 4, reason: 'Record reviewed authority evidence', workflow: { custodianUserId: '8', reminderDays: [30, 7, 0], replacementId: null,
  authority: { signatoryName: 'Authorized Signatory', role: 'Director', delegationLegalDocumentId: null, evidenceVaultDocumentIds: [EVIDENCE] },
  signatureEvidence: { method: 'external_tool', result: 'valid', tool: 'Customer validation report', verifiedAt: '2026-10-01T00:00:00.000Z', evidenceVaultDocumentId: EVIDENCE },
  translationOfId: null, certifiedTranslationEvidenceVaultDocumentId: null } });

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
  profile = { version: 1, revision: 4, companyName: 'Company', address: '', contact: '', registrationDetails: '', letterhead: structuredClone(DEFAULT_TEMPLATE_SPEC),
    importedFrom: null, applyToReports: false, applyToSubmissionCorrespondence: false, legalDocuments: [structuredClone(document)] };
  mocks.context.mockResolvedValue({ organizationId: 7, userId: 3, q, capabilities: { manageLegal: true } });
  mocks.read.mockImplementation(async (_req, id) => ({ organizationId: 7, userId: 3, q, profile: structuredClone(profile), document: structuredClone(profile.legalDocuments.find(item => item.id === id)) }));
  mocks.load.mockImplementation(async () => structuredClone(profile));
  mocks.access.mockResolvedValue({ programId: PROGRAM, projectId: 10 });
  mocks.actor.mockResolvedValue({ userId: 8, role: 'member' });
  mocks.approval.mockResolvedValue(null);
  mocks.source.mockImplementation(async (_q, _org, id) => ({ id, programId: PROGRAM, current: true, version: '1', contentHash: HASH }));
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.notify.mockResolvedValue(99);
  mocks.placements.mockResolvedValue(new Map()); mocks.estar.mockResolvedValue(new Map()); mocks.cmc.mockResolvedValue(new Map());
  mocks.sequence.mockResolvedValue({ organizationId: 7, userId: 3, submissionId: 2, sequenceId: 1, programId: PROGRAM, projectId: 10, applicationType: 'IND', sequenceRegion: 'fda' });
  mocks.still.mockResolvedValue(undefined);
  mocks.write.mockImplementation(async (_req, revision, _reason, transform, options) => {
    if (revision !== profile.revision) throw new Error('Revision changed');
    expect(options.capability).toBe('legal');
    const before = structuredClone(profile); const after = transform(structuredClone(profile)); after.revision++;
    // Canonical writer commits only after this composition callback succeeds.
    if (options.beforeCommit) await options.beforeCommit(q, before, after);
    profile = after;
    return { data: structuredClone(profile), canManage: false, capabilities: { manageLegal: true } };
  });
});
afterEach(() => vi.useRealTimers());
describe('governed legal lifecycle composition', () => {
  it('uses all canonical where-used readers with the current actor and exact original version', async () => {
    mocks.estar.mockResolvedValue(new Map([[VAULT, [{ record: 'audit', recordId: 'receipt-1', exportedAt: '2026-10-01', slot: 'declaration', chapter: null, fileName: 'attachment.pdf', retainedAs: null }]]]));
    const result = await readCompanyLegalLifecycle(req, 'legal_a');
    expect(result.estarUses?.[0].recordId).toBe('receipt-1');
    for (const reader of [mocks.placements, mocks.estar, mocks.cmc]) expect(reader).toHaveBeenCalledWith(q, 7, [VAULT], { userId: 3 });
  });
  it('resolves approved evidence server-side, retains exact hashes and records a separate external-evidence fact', async () => {
    const saved = await updateCompanyLegalWorkflow(req, 'legal_a', workflowInput());
    const workflow = saved.data.legalDocuments[0].workflow!;
    expect(workflow.authority?.evidence[0]).toEqual({ vaultDocumentId: EVIDENCE, programId: PROGRAM, version: '1', contentHash: HASH });
    expect(workflow.signatureEvidence).toMatchObject({ reviewedBy: '3', verification: 'recorded_external_evidence', evidence: { contentHash: HASH } });
    expect(workflow.signatureEvidence).not.toHaveProperty('evidenceVaultDocumentId');
    expect(workflow.reminderDays).toEqual([30, 7, 0]);
    expect(mocks.query.mock.calls.some(([sql]) => /company_legal_renewal/.test(sql))).toBe(true);
    expect(mocks.notify).toHaveBeenCalledOnce();
  });
  it('refuses evidence from another project or without current Vault approval before metadata is saved', async () => {
    mocks.source.mockImplementation(async (_q, _org, id) => ({ id, programId: id === EVIDENCE ? 'private-program' : PROGRAM, current: true, version: '1', contentHash: HASH }));
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', workflowInput())).rejects.toMatchObject({ code: 'LEGAL_EVIDENCE_UNAVAILABLE' });
    expect(profile.revision).toBe(4); expect(mocks.write).not.toHaveBeenCalled();
    mocks.source.mockImplementation(async (_q, _org, id) => ({ id, programId: PROGRAM, current: true, version: '1', contentHash: HASH }));
    mocks.approval.mockResolvedValue('Draft approval is required.');
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', workflowInput())).rejects.toMatchObject({ code: 'LEGAL_EVIDENCE_UNAPPROVED' });
  });
  it('rechecks exact sources before commit and does not save a workflow when supporting evidence changes', async () => {
    let evidenceReads = 0;
    mocks.source.mockImplementation(async (_q, _org, id) => ({ id, programId: PROGRAM, current: true, version: '1', contentHash: id === EVIDENCE && ++evidenceReads > 2 ? 'b'.repeat(64) : HASH }));
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', workflowInput())).rejects.toMatchObject({ code: 'LEGAL_EVIDENCE_CHANGED' });
    expect(profile.revision).toBe(4); expect(profile.legalDocuments[0].workflow).toBeUndefined();
  });
  it('refuses forged review fields and preserves revocation through later metadata edits', async () => {
    const forged = workflowInput();
    Object.assign(forged.workflow.signatureEvidence, { verification: 'application_verified', reviewedBy: '999' });
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', forged)).rejects.toMatchObject({ code: 'INVALID_COMPANY_DOCUMENTS' });
    const input = workflowInput(); Object.assign(input.workflow, { revocation: { reason: 'The signatory withdrew authorization.' } });
    await updateCompanyLegalWorkflow(req, 'legal_a', input);
    const revoked = profile.legalDocuments[0].workflow?.revokedAt;
    await updateCompanyLegalWorkflow(req, 'legal_a', { ...workflowInput(), expectedRevision: 5 });
    expect(profile.legalDocuments[0].workflow?.revokedAt).toBe(revoked);
  });
  it('treats a notification/projection failure as an uncommitted lifecycle change', async () => {
    mocks.notify.mockRejectedValue(new Error('Notification storage unavailable'));
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', workflowInput())).rejects.toThrow('Notification storage unavailable');
    expect(profile.revision).toBe(4);
  });
  it('cannot clear a recorded invalid-signature finding by removing its evidence', async () => {
    const first = workflowInput(); first.workflow.signatureEvidence.result = 'invalid';
    await updateCompanyLegalWorkflow(req, 'legal_a', first);
    const input = { ...workflowInput(), expectedRevision: 5, workflow: { ...workflowInput().workflow, signatureEvidence: null } };
    await expect(updateCompanyLegalWorkflow(req, 'legal_a', input)).rejects.toMatchObject({ code: 'INVALID_SIGNATURE_EVIDENCE_REQUIRES_REVIEW' });
    expect(profile.revision).toBe(5); expect(profile.legalDocuments[0].workflow?.signatureEvidence?.result).toBe('invalid');
  });
  it('deduplicates each expiry threshold and custodian using durable notification evidence', async () => {
    await updateCompanyLegalWorkflow(req, 'legal_a', workflowInput());
    mocks.notify.mockClear(); mocks.query.mockResolvedValue({ rows: [{ id: 99 }] });
    expect(await notifyCompanyLegalRenewal(q, 7, profile.legalDocuments[0])).toBeNull();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
describe('reviewed requirement mapping', () => {
  const customer = () => ({ title: 'Authorization is required', source: 'customer', regionalCode: null, kind: 'authorization', agencies: ['fda'], countries: ['US'], submissionTypes: ['ind'],
    language: 'en', sectionCode: 'm1.4', applicability: 'required', rationale: 'Reviewed against the current applicant checklist.', legalDocumentIds: ['legal_a'] });
  it('derives a filing review’s program from admitted sequence data and retains its organization policy', async () => {
    await updateCompanyLegalRequirement(req, { expectedRevision: 4, reason: 'Record organization policy', requirement: customer() });
    const policy = structuredClone(profile.legalRequirements![0]);
    const saved = await updateCompanyLegalRequirement(req, { expectedRevision: 5, reason: 'Review policy for this filing', requirement: { ...customer(), id: policy.id, sequenceId: 1 } });
    expect(saved.data.legalRequirements).toHaveLength(2);
    expect(saved.data.legalRequirements?.find(item => item.id === policy.id)).toEqual(policy);
    expect(saved.data.legalRequirements?.find(item => item.id !== policy.id)).toMatchObject({ sequenceId: 1, programId: PROGRAM, policyId: policy.id });
    expect(mocks.still).toHaveBeenCalledOnce();
  });
  it('refuses target spoofing instead of evaluating a client-selected jurisdiction', async () => {
    await expect(updateCompanyLegalRequirement(req, { expectedRevision: 4, reason: 'Review filing requirements', requirement: { ...customer(), sequenceId: 1, agencies: ['EMA'], countries: ['EU'] } }))
      .rejects.toMatchObject({ code: 'REQUIREMENT_TARGET_MISMATCH' });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('stores the legal custodian’s exact reviewed mapping without inferring approval', async () => {
    const saved = await updateCompanyLegalRequirement(req, { expectedRevision: 4, reason: 'Record sponsor-specific requirement', requirement: {
      title: 'Authorization is required', source: 'customer', regionalCode: null, kind: 'authorization', agencies: ['fda'], countries: ['US'], submissionTypes: ['ind'],
      language: 'en', sectionCode: 'm1.4', applicability: 'required', rationale: 'Reviewed against the current applicant checklist.', legalDocumentIds: ['legal_a'] } });
    expect(saved.data.legalRequirements?.[0]).toMatchObject({ reviewedBy: '3', agencies: ['FDA'], submissionTypes: ['US_IND'], legalDocumentIds: ['legal_a'] });
  });
  it('rejects a regional marketing checklist applied to an investigational filing', async () => {
    await expect(updateCompanyLegalRequirement(req, { expectedRevision: 4, reason: 'Review regional requirements', requirement: {
      title: 'Cover letter', source: 'regional', regionalCode: 'us_cover_letter', kind: 'cover_letter', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'],
      language: null, sectionCode: 'm1.2', applicability: 'required', rationale: 'Reviewed against the current applicant checklist.', legalDocumentIds: [] } }))
      .rejects.toMatchObject({ code: 'REGIONAL_REQUIREMENT_SCOPE_INVALID' });
  });
});
