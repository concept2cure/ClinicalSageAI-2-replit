import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyCsrSectionEvidenceBinding } from '../csr-section-evidence-binding';
import type { CsrEvidenceFact, CsrClaimReceipt } from '../csr-claim-reconciliation';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const snapshot = { sectionId: 'section-11.4', savedContent: '190 of 250 synthetic subjects achieved the endpoint.', anaRunId: 'ana-123' };
const binding = { sectionId: snapshot.sectionId, sectionSha256: digest(snapshot.savedContent), anaRunId: snapshot.anaRunId, claimIds: ['claim-1'] };
const fact: CsrEvidenceFact = { factId: 'tlf-1', sourceId: 'vault-1', sourceSha256: 'a'.repeat(64),
  sourceLocation: 'Table 14.2.1, row 1', status: 'qualified', analysisPopulation: 'ITT',
  endpoint: 'Global cure', numerator: 190, denominator: 250, estimate: 0.76,
  method: 'observed proportion', unit: 'proportion' };
const claim: CsrClaimReceipt = { claimId: 'claim-1', section: snapshot.sectionId,
  factId: fact.factId, sourceSha256: fact.sourceSha256, analysisPopulation: fact.analysisPopulation,
  endpoint: fact.endpoint, numerator: 190, denominator: 250, estimate: 0.76,
  method: 'observed proportion', unit: 'proportion' };
const verify = (snap = snapshot, bind = binding, cs: CsrClaimReceipt[] = [claim], fs: CsrEvidenceFact[] = [fact]) =>
  verifyCsrSectionEvidenceBinding(snap, bind, cs, fs);
describe('CSR section/version evidence binding', () => {
  it('accepts an exact qualified section and source receipt without claiming approval', () => {
    expect(verify()).toEqual({ accepted: true, issues: [], checkedClaims: 1 });
  });
  it('fails on edited saved text', () => {
    expect(verify({ ...snapshot, savedContent: snapshot.savedContent + ' changed' }).issues).toContain('SECTION_VERSION_CHANGED');
  });
  it('fails on different section identity or AnA run', () => {
    expect(verify({ ...snapshot, sectionId: 'other' }).issues).toContain('SECTION_ID_MISMATCH');
    expect(verify({ ...snapshot, anaRunId: 'other' }).issues).toContain('RUN_ID_MISMATCH');
  });
  it('fails on missing, duplicate, extra or cross-section claim receipts', () => {
    expect(verify(snapshot, binding, []).issues).toContain('CLAIM_COVERAGE_MISMATCH');
    expect(verify(snapshot, { ...binding, claimIds: ['claim-1', 'claim-1'] }).issues).toContain('CLAIM_COVERAGE_MISMATCH');
    expect(verify(snapshot, binding, [claim, { ...claim, claimId: 'extra' }]).issues).toContain('CLAIM_COVERAGE_MISMATCH');
    expect(verify(snapshot, binding, [{ ...claim, section: 'other' }]).issues).toContain('CLAIM_COVERAGE_MISMATCH');
  });
  it('fails on withdrawn or changed source evidence', () => {
    expect(verify(snapshot, binding, [claim], [{ ...fact, status: 'withdrawn' }]).issues).toContain('EVIDENCE_RECONCILIATION_FAILED');
    expect(verify(snapshot, binding, [claim], [{ ...fact, numerator: 191 }]).accepted).toBe(false);
  });
  it('fails closed on missing binding and empty claims', () => {
    expect(verifyCsrSectionEvidenceBinding(snapshot, null, [claim], [fact]).issues).toEqual(['BINDING_MISSING']);
  });
});
