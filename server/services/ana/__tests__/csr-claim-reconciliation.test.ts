import { describe, expect, it } from 'vitest';
import { reconcileCsrClaims, type CsrEvidenceFact, type CsrClaimReceipt } from '../csr-claim-reconciliation';

const hash = 'a'.repeat(64);
const fact: CsrEvidenceFact = {
  factId: 'TLF-14.2.1:treatment', sourceId: 'vault:verified-analysis',
  sourceSha256: hash, sourceLocation: 'Table 14.2.1 row treatment',
  status: 'qualified', analysisPopulation: 'ITT', endpoint: 'Global cure',
  numerator: 190, denominator: 250, estimate: 0.76, method: 'observed proportion',
  unit: 'proportion',
};
const claim: CsrClaimReceipt = {
  claimId: 'csr-11.4-treatment', section: '11.4', factId: fact.factId,
  sourceSha256: hash, analysisPopulation: 'ITT', endpoint: 'Global cure',
  numerator: 190, denominator: 250, estimate: 0.76, method: 'observed proportion',
  unit: 'proportion',
};
const check = (c: CsrClaimReceipt = claim, f: CsrEvidenceFact = fact) =>
  reconcileCsrClaims([c], [f]);
describe('CSR evidence-bound claim reconciliation', () => {
  it('accepts an exactly matching, qualified synthetic TLF receipt', () => {
    expect(check()).toEqual({ accepted: true, findings: [], checkedClaims: 1 });
  });
  it('refuses missing and duplicate source records', () => {
    expect(reconcileCsrClaims([claim], []).findings[0].code).toBe('MISSING_SOURCE');
    expect(reconcileCsrClaims([claim], [fact, fact]).findings[0].code).toBe('DUPLICATE_SOURCE');
  });
  it('refuses unreviewed or withdrawn source records', () => {
    expect(check(claim, { ...fact, status: 'unreviewed' }).findings[0].code).toBe('SOURCE_NOT_QUALIFIED');
    expect(check(claim, { ...fact, status: 'withdrawn' }).accepted).toBe(false);
  });
  it('detects changed source version or missing page/table locator', () => {
    expect(check({ ...claim, sourceSha256: 'b'.repeat(64) }).findings[0].code).toBe('SOURCE_VERSION_MISMATCH');
    expect(check(claim, { ...fact, sourceLocation: '' }).findings[0].code).toBe('MISSING_SOURCE_LOCATION');
  });
  it('detects analysis population and endpoint substitution', () => {
    expect(check({ ...claim, analysisPopulation: 'Safety' }).findings[0].code).toBe('POPULATION_MISMATCH');
    expect(check({ ...claim, endpoint: 'Recurrence' }).findings[0].code).toBe('ENDPOINT_MISMATCH');
  });
  it('detects denominator, numerator and estimate drift', () => {
    for (const change of [{ numerator: 191 }, { denominator: 249 }, { estimate: 0.81 }]) {
      expect(check({ ...claim, ...change }).findings[0].code).toBe('NUMERIC_MISMATCH');
    }
  });
  it('refuses unsupported inference or changed units', () => {
    expect(check({ ...claim, method: 'adjusted Bayesian model' }).findings[0].code).toBe('METHOD_MISMATCH');
    expect(check({ ...claim, unit: 'percent' }).findings[0].code).toBe('UNIT_MISMATCH');
    expect(check({ ...claim, estimate: undefined }).accepted).toBe(false);
  });
  it('refuses invalid counts and duplicate claim identifiers', () => {
    expect(check({ ...claim, numerator: 251 }).findings[0].code).toBe('INVALID_CLAIM');
    expect(reconcileCsrClaims([claim, claim], [fact]).accepted).toBe(false);
  });
  it('never equates no claims with a passed CSR', () => {
    expect(reconcileCsrClaims([], [fact]).accepted).toBe(false);
  });
});
