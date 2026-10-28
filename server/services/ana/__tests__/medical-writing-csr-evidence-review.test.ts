import { describe, expect, it } from 'vitest';
import { reviewCsrWithEvidence } from '../medical-writing-review';
import type { CsrClaimReceipt, CsrEvidenceFact } from '../csr-claim-reconciliation';

const hash = 'a'.repeat(64);
const fact: CsrEvidenceFact = {
  factId: 'TLF-14.2.1:LMN201', sourceId: 'vault:analysis-01',
  sourceSha256: hash, sourceLocation: 'Table 14.2.1 treatment row',
  status: 'qualified', analysisPopulation: 'ITT', endpoint: 'Global cure',
  numerator: 190, denominator: 250, estimate: 0.76,
  method: 'observed proportion', unit: 'proportion',
};
const claim: CsrClaimReceipt = {
  claimId: 'csr-11.4-001', section: '11.4', factId: fact.factId,
  sourceSha256: hash, analysisPopulation: 'ITT', endpoint: 'Global cure',
  numerator: 190, denominator: 250, estimate: 0.76,
  method: 'observed proportion', unit: 'proportion',
};
describe('AnA CSR medical-writing review with evidence receipts', () => {
  it('never implies a heading-only review is scientific approval', () => {
    const result = reviewCsrWithEvidence('# Clinical Study Report');
    expect(result.claims.status).toBe('not_assessed');
    expect(result.readyForApproval).toBe(false);
    expect(result.writing.scientificCompleteness).toBe('not_assessed');
  });
  it('reconciles qualified numerical receipts but still requires human review', () => {
    const result = reviewCsrWithEvidence('# Clinical Study Report', [claim], [fact]);
    expect(result.claims.status).toBe('reconciled_pending_human_review');
    expect(result.claims.findings).toEqual([]);
    expect(result.readyForApproval).toBe(false);
  });
  it('blocks a changed denominator or source version', () => {
    const wrong = reviewCsrWithEvidence('CSR', [{ ...claim, denominator: 249 }], [fact]);
    expect(wrong.claims.status).toBe('blocked');
    expect(wrong.claims.findings.some(f => f.code === 'NUMERIC_MISMATCH')).toBe(true);
    const version = reviewCsrWithEvidence('CSR', [{ ...claim, sourceSha256: 'b'.repeat(64) }], [fact]);
    expect(version.claims.findings.some(f => f.code === 'SOURCE_VERSION_MISMATCH')).toBe(true);
  });
  it('does not promote withdrawn evidence', () => {
    const result = reviewCsrWithEvidence('CSR', [claim], [{ ...fact, status: 'withdrawn' }]);
    expect(result.claims.status).toBe('blocked');
    expect(result.readyForApproval).toBe(false);
  });
});
