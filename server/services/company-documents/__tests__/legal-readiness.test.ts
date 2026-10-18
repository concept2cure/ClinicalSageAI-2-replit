import { describe, expect, it, vi } from 'vitest';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { companyLegalRenewal, companyScopeMatches, normalizeCompanyScopes, type CompanyLegalRequirement } from '../../../../shared/company-legal-workflows';
vi.mock('../profile', () => ({ context: vi.fn(), loadCompanyDocumentProfile: vi.fn(), readCompanyDocumentProfile: vi.fn(), CompanyDocumentsError: class extends Error {} }));
vi.mock('../../submission-service/submission-request-read', () => ({ readSubmissionSequenceForRequest: vi.fn(), requireSubmissionReadStillCurrent: vi.fn() }));
vi.mock('../../vault/vault-lifecycle', () => ({ readVaultLifecycleSource: vi.fn(), vaultVersionNotTransmittable: vi.fn() }));
import { assessCompanyLegalReadiness, companyLegalRequirementCatalog, regionalLegalRequirements } from '../legal-readiness';

const target = { programId: 'program', submissionId: 1, sequenceId: 2, agency: 'FDA', country: 'US', submissionType: 'IND' };
const document: CompanyLegalDocument = { id: 'legal_a', title: 'Authorization', kind: 'authorization', programId: 'program',
  vaultDocumentId: 'vault-a', contentHash: 'a'.repeat(64), version: '2', agencies: ['FDA'], countries: ['US'], submissionTypes: ['US_IND'], language: 'en',
  effectiveOn: '2026-01-01', expiresOn: '2026-12-31', active: true, registeredAt: '2026-01-01', registeredBy: '3', transmitRefusal: null };
const requirement: CompanyLegalRequirement = { id: 'requirement_a', title: 'Sponsor authorization', source: 'customer', regionalCode: null,
  kind: 'authorization', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'], language: 'en', sectionCode: 'm1.4',
  applicability: 'required', rationale: 'Reviewed against the applicant legal checklist.', legalDocumentIds: ['legal_a'], reviewedBy: '3', reviewedAt: '2026-10-01T00:00:00.000Z' };
const placement = { documentId: 'vault-a', contentHash: 'a'.repeat(64), sectionCode: '1.4' };
const assess = (overrides: Partial<Parameters<typeof assessCompanyLegalReadiness>[0]> = {}) => assessCompanyLegalReadiness({ target,
  documents: [document], requirements: [requirement], placements: [placement], today: '2026-10-18', ...overrides });

describe('canonical company legal scopes', () => {
  it('uses the platform region and submission registries, including aliases', () => {
    expect(normalizeCompanyScopes({ agencies: ['Health Canada', 'health_canada'], countries: ['Canada'], submissionTypes: ['510(k)', 'FDA_510K'] }))
      .toEqual({ agencies: ['Health_Canada'], countries: ['CA'], submissionTypes: ['US_510K'] });
    expect(companyScopeMatches(['IND'], 'US_IND', 'submissionType')).toBe(true);
    expect(companyScopeMatches(['unknown agency'], 'FDA', 'agency')).toBe(false);
    expect(companyScopeMatches(['FDA'], null, 'agency')).toBe(false);
    expect(() => normalizeCompanyScopes({ agencies: ['invented regulator'], countries: [], submissionTypes: [] })).toThrow('recognized agency');
  });
  it('keeps unsupported filing checklists unresolved, instead of applying an NDA checklist to an IND', () => {
    expect(regionalLegalRequirements(target)).toEqual([]);
    expect(assess({ requirements: [] }).ready).toBe(false);
    expect(assess({ requirements: [] }).coverage).toBe('customer_review_required');
    const initial = regionalLegalRequirements({ ...target, submissionType: 'NDA' });
    expect(initial.find(item => item.regionalCode === 'us_debarment')?.applicability).toBe('unresolved');
    expect(companyLegalRequirementCatalog().requirements.find(item => item.code === 'ch_gmp')?.kind).toBe('certificate');
  });
});
describe('reviewed legal companion coverage', () => {
  it('requires explicit review, mapping, exact version/hash and correct actual placement', () => {
    expect(assess().ready).toBe(true);
    expect(assess({ requirements: [{ ...requirement, reviewedBy: '' }] }).items[0].status).toBe('unresolved');
    expect(assess({ requirements: [{ ...requirement, legalDocumentIds: [] }] }).items[0].status).toBe('missing');
    expect(assess({ placements: [{ ...placement, contentHash: 'b'.repeat(64) }] }).items[0].status).toBe('blocked');
    expect(assess({ placements: [{ ...placement, sectionCode: 'm1.5' }] }).items[0].status).toBe('blocked');
    expect(assess({ placements: [{ ...placement, operation: 'delete' }] }).ready).toBe(false);
  });
  it('never infers acceptance from a matching title, and refuses expired/unapproved/wrong-language documents', () => {
    expect(assess({ requirements: [{ ...requirement, legalDocumentIds: [] }], documents: [{ ...document, title: requirement.title }] }).ready).toBe(false);
    expect(assess({ documents: [{ ...document, expiresOn: '2026-10-17' }] }).items[0].findings.join(' ')).toContain('expired');
    expect(assess({ documents: [{ ...document, transmitRefusal: 'Approval is pending.' }] }).ready).toBe(false);
    expect(assess({ documents: [{ ...document, language: 'ja' }] }).ready).toBe(false);
    expect(assess({ documents: [{ ...document, kind: 'certificate' }] }).ready).toBe(false);
  });
  it('returns no hidden legal IDs and cannot satisfy a mapping with another program’s document', () => {
    const result = assess({ documents: [{ ...document, programId: 'private-program' }] });
    expect(result.ready).toBe(false);
    expect(result.items[0].requirement.legalDocumentIds).toEqual([]);
    expect(result.items[0].matchedDocumentIds).toEqual([]);
  });
  it('retains a reasoned not-applicable review and distinguishes this from the overall dispatch assessment', () => {
    const result = assess({ requirements: [{ ...requirement, applicability: 'not_applicable', legalDocumentIds: [] }] });
    expect(result.ready).toBe(true);
    expect(result.items[0].status).toBe('not_applicable');
    expect(result.disclaimer).toContain('cryptographic signature');
  });
  it('binds a review to its sequence and specializes an organization policy without changing that policy', () => {
    const policy = { ...requirement, id: 'policy' };
    const specialized = { ...requirement, id: 'filing-review', policyId: 'policy', sequenceId: target.sequenceId, programId: target.programId,
      applicability: 'not_applicable' as const, legalDocumentIds: [] };
    const result = assess({ requirements: [policy, specialized] });
    expect(result.items).toHaveLength(1); expect(result.items[0].requirement.id).toBe('filing-review');
    expect(result.ready).toBe(true);
    expect(assess({ requirements: [{ ...specialized, sequenceId: 999 }] }).items).toHaveLength(0);
  });
  it('requires separate current evidence when the reviewed requirement calls for authority or signature verification', () => {
    expect(assess({ requirements: [{ ...requirement, requiresAuthority: true }] }).ready).toBe(false);
    expect(assess({ requirements: [{ ...requirement, requiresSignatureEvidence: true }] }).ready).toBe(false);
    expect(assess({ requirements: [{ ...requirement, requiresCertifiedTranslation: true }] }).ready).toBe(false);
  });
});
describe('renewal queue', () => {
  const workflow = { custodianUserId: '3', reminderDays: [30, 7, 0], replacementId: null, revokedAt: null, revokedBy: null, revocationReason: null,
    authority: null, signatureEvidence: null, translationOfId: null, certifiedTranslationEvidence: null, updatedBy: '3', updatedAt: '2026-10-01' };
  it('calculates the task due date and stops renewal for revoked or archived entries', () => {
    const entry = { ...document, workflow, expiresOn: '2026-10-25' };
    expect(companyLegalRenewal(entry, '2026-10-18')).toEqual({ status: 'due', daysRemaining: 7, dueOn: '2026-09-25' });
    expect(companyLegalRenewal({ ...entry, workflow: { ...workflow, revokedAt: '2026-10-18' } }, '2026-10-18').status).toBe('revoked');
    expect(companyLegalRenewal({ ...entry, active: false }, '2026-10-18').status).toBe('archived');
    expect(companyLegalRenewal({ ...entry, workflow: { ...workflow, custodianUserId: null } }, '2026-10-18').status).toBe('unassigned');
    expect(companyLegalRenewal(entry, '2026-10-26').status).toBe('expired');
  });
});
