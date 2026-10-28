/**
 * CSR numeric-claim reconciliation against qualified, version-bound evidence.
 *
 * Deliberately does not extract facts from prose or infer missing statistics.
 * The caller must provide structured claim receipts and a qualified evidence
 * ledger from the existing governed source/biostatistics path. No new store.
 */
export interface CsrEvidenceFact {
  factId: string;
  sourceId: string;
  sourceSha256: string;
  sourceLocation: string;
  status: 'qualified' | 'unreviewed' | 'withdrawn';
  analysisPopulation: string;
  endpoint: string;
  numerator?: number;
  denominator?: number;
  estimate?: number;
  method?: string;
  unit?: string;
}
export interface CsrClaimReceipt {
  claimId: string;
  section: string;
  factId: string;
  sourceSha256: string;
  analysisPopulation: string;
  endpoint: string;
  numerator?: number;
  denominator?: number;
  estimate?: number;
  method?: string;
  unit?: string;
}
export interface CsrClaimFinding {
  claimId: string;
  code: 'MISSING_SOURCE' | 'DUPLICATE_SOURCE' | 'SOURCE_NOT_QUALIFIED' |
    'SOURCE_VERSION_MISMATCH' | 'MISSING_SOURCE_LOCATION' |
    'POPULATION_MISMATCH' | 'ENDPOINT_MISMATCH' | 'NUMERIC_MISMATCH' |
    'METHOD_MISMATCH' | 'UNIT_MISMATCH' | 'INVALID_CLAIM';
}

const sha = /^[a-f0-9]{64}$/;
const present = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const sameOptionalNumber = (a: number | undefined, b: number | undefined): boolean =>
  a === undefined ? b === undefined : b !== undefined && finite(a) && finite(b) &&
    Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

export function reconcileCsrClaims(
  claims: readonly CsrClaimReceipt[],
  evidence: readonly CsrEvidenceFact[],
): { accepted: boolean; findings: CsrClaimFinding[]; checkedClaims: number } {
  const byId = new Map<string, CsrEvidenceFact[]>();
  for (const fact of evidence) {
    const list = byId.get(fact.factId) ?? [];
    list.push(fact);
    byId.set(fact.factId, list);
  }
  const findings: CsrClaimFinding[] = [];
  const add = (claimId: string, code: CsrClaimFinding['code']) => findings.push({ claimId, code });
  const seen = new Set<string>();
  for (const claim of claims) {
    const id = present(claim.claimId) ? claim.claimId : '<missing>';
    if (!present(claim.claimId) || seen.has(claim.claimId) ||
        !present(claim.section) || !present(claim.factId) ||
        !present(claim.analysisPopulation) || !present(claim.endpoint) ||
        !sha.test(claim.sourceSha256) ||
        (claim.numerator !== undefined && (!Number.isSafeInteger(claim.numerator) || claim.numerator < 0)) ||
        (claim.denominator !== undefined && (!Number.isSafeInteger(claim.denominator) || claim.denominator <= 0)) ||
        (claim.numerator !== undefined && claim.denominator !== undefined && claim.numerator > claim.denominator) ||
        (claim.estimate !== undefined && !finite(claim.estimate))) {
      add(id, 'INVALID_CLAIM');
      continue;
    }
    seen.add(claim.claimId);
    const matches = byId.get(claim.factId) ?? [];
    if (!matches.length) { add(id, 'MISSING_SOURCE'); continue; }
    if (matches.length !== 1) { add(id, 'DUPLICATE_SOURCE'); continue; }
    const fact = matches[0];
    // A qualified label cannot rescue impossible or malformed source-side
    // numbers. Validate the evidence fact independently of the draft claim.
    if ((fact.numerator !== undefined &&
         (!Number.isSafeInteger(fact.numerator) || fact.numerator < 0)) ||
        (fact.denominator !== undefined &&
         (!Number.isSafeInteger(fact.denominator) || fact.denominator <= 0)) ||
        (fact.numerator !== undefined && fact.denominator !== undefined &&
         fact.numerator > fact.denominator) ||
        (fact.estimate !== undefined && !finite(fact.estimate))) {
      add(id, 'INVALID_CLAIM');
    }
    if (fact.status !== 'qualified') add(id, 'SOURCE_NOT_QUALIFIED');
    if (!sha.test(fact.sourceSha256) || claim.sourceSha256 !== fact.sourceSha256) add(id, 'SOURCE_VERSION_MISMATCH');
    if (!present(fact.sourceId) || !present(fact.sourceLocation)) add(id, 'MISSING_SOURCE_LOCATION');
    if (claim.analysisPopulation !== fact.analysisPopulation) add(id, 'POPULATION_MISMATCH');
    if (claim.endpoint !== fact.endpoint) add(id, 'ENDPOINT_MISMATCH');
    if (!sameOptionalNumber(claim.numerator, fact.numerator) ||
        !sameOptionalNumber(claim.denominator, fact.denominator) ||
        !sameOptionalNumber(claim.estimate, fact.estimate)) add(id, 'NUMERIC_MISMATCH');
    if ((claim.method ?? '') !== (fact.method ?? '')) add(id, 'METHOD_MISMATCH');
    if ((claim.unit ?? '') !== (fact.unit ?? '')) add(id, 'UNIT_MISMATCH');
  }
  return { accepted: claims.length > 0 && findings.length === 0, findings, checkedClaims: claims.length };
}
