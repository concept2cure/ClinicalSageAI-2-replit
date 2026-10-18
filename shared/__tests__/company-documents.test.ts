import { describe, expect, it } from 'vitest';
import { companyLegalDocumentRefusal, companyLegalVersionDateRefusal, companyLegalVersionTargetRefusal, type CompanyLegalDocument } from '../company-documents';

const document: CompanyLegalDocument = {
  id: 'legal-one', title: 'Signed authorization', kind: 'authorization', programId: 'program-one', vaultDocumentId: 'vault-one',
  contentHash: 'a'.repeat(64), version: '1.0', agencies: ['FDA'], countries: ['US'], submissionTypes: ['IND'],
  language: 'en', effectiveOn: '2026-01-01', expiresOn: '2026-12-31', active: true,
  registeredAt: '2026-01-01T00:00:00Z', registeredBy: '1', transmitRefusal: null,
};
const context = { programId: 'program-one', agency: 'fda', country: 'us', submissionType: 'ind', today: '2026-10-17' };

describe('company legal applicability', () => {
  it('matches the actual project, market, application and current approved version', () => {
    expect(companyLegalDocumentRefusal(document, context)).toBeNull();
  });
  it.each([
    [{ active: false }, /archived/], [{ effectiveOn: '2027-01-01' }, /not effective/],
    [{ expiresOn: '2026-10-16' }, /expired/], [{ programId: 'another-program' }, /Copy/],
    [{ agencies: ['EMA'] }, /agency/], [{ countries: ['EU'] }, /country/],
    [{ submissionTypes: ['NDA'] }, /submission type/], [{ transmitRefusal: 'not reviewed' }, /not reviewed/],
    [{ transmitRefusal: undefined }, /could not be verified/],
  ])('refuses an unusable library entry: %j', (patch, reason) => {
    expect(companyLegalDocumentRefusal({ ...document, ...patch }, context)).toMatch(reason as RegExp);
  });
  it('never treats an unknown target as matching a restricted document', () => {
    expect(companyLegalDocumentRefusal(document, { today: context.today })).toMatch(/agency/);
  });
  it('allows genuinely unrestricted applicability without inventing an agency requirement', () => {
    expect(companyLegalDocumentRefusal({ ...document, agencies: [], countries: [], submissionTypes: [] }, { today: context.today })).toBeNull();
  });
  it('keeps an expiry date valid through that calendar day', () => {
    expect(companyLegalDocumentRefusal({ ...document, expiresOn: context.today }, context)).toBeNull();
  });
});

describe('legal validity after placement', () => {
  it('refuses an approved version when its registered validity has since expired', () => {
    expect(companyLegalVersionDateRefusal([document], document.vaultDocumentId, document.contentHash, '2027-01-01')).toMatch(/expired/);
  });
  it('does not apply a retired inventory entry to unrelated Vault filing', () => {
    expect(companyLegalVersionDateRefusal([{ ...document, active: false }], document.vaultDocumentId, document.contentHash, '2027-01-01')).toBeNull();
  });
  it('binds validity to the exact source version and content hash', () => {
    expect(companyLegalVersionDateRefusal([document], 'different-version', document.contentHash, '2027-01-01')).toBeNull();
    expect(companyLegalVersionDateRefusal([document], document.vaultDocumentId, 'b'.repeat(64), context.today)).toMatch(/content hash/);
  });
});

describe('canonical Vault placement and transmission applicability', () => {
  it.each([
    [{ agency: 'EMA' }, /agency/], [{ country: 'EU' }, /country/],
    [{ submissionType: 'NDA' }, /submission type/], [{ programId: 'another-program' }, /Copy/],
    [{ programId: null }, /target program/], [{ agency: undefined }, /agency/],
    [{ today: '2027-01-01' }, /expired/],
  ])('refuses the actual target outside an active legal version scope: %j', (patch, reason) => {
    expect(companyLegalVersionTargetRefusal([document], document.vaultDocumentId, { ...context, ...patch })).toMatch(reason);
  });
  it('allows matching draft placement without granting approval', () => {
    expect(companyLegalVersionTargetRefusal([{ ...document, transmitRefusal: 'draft, not approved' }], document.vaultDocumentId, context)).toBeNull();
    expect(companyLegalDocumentRefusal({ ...document, transmitRefusal: 'draft, not approved' }, context)).toMatch(/not approved/);
  });
  it('preserves ordinary Vault files and retired registry entries', () => {
    expect(companyLegalVersionTargetRefusal([document], 'unregistered-vault-id', {})).toBeNull();
    expect(companyLegalVersionTargetRefusal([{ ...document, active: false }], document.vaultDocumentId, {})).toBeNull();
  });
});
