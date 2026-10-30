/** CSR claim receipts bound to an exact saved authoring section version.
 * Pure check; callers must retrieve section text, claims and facts from the
 * same authorized tenant snapshot. No new store, no approval side effect.
 */
import { createHash } from 'node:crypto';
import { reconcileCsrClaims, type CsrClaimFinding, type CsrClaimReceipt, type CsrEvidenceFact } from './csr-claim-reconciliation';

export interface CsrSectionEvidenceBinding {
  sectionId: string;
  sectionSha256: string;
  anaRunId: string;
  claimIds: string[];
}
export interface CsrSectionSnapshot {
  sectionId: string;
  savedContent: string;
  anaRunId: string;
}
export type CsrBindingIssue = 'BINDING_MISSING' | 'SECTION_VERSION_CHANGED' |
  'SECTION_ID_MISMATCH' | 'RUN_ID_MISMATCH' | 'CLAIM_COVERAGE_MISMATCH' |
  'EVIDENCE_RECONCILIATION_FAILED';

const sha = /^[a-f0-9]{64}$/;
const nonblank = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

/** A pass is a machine check only; human scientific approval remains separate. */
export function verifyCsrSectionEvidenceBinding(
  snapshot: CsrSectionSnapshot,
  binding: CsrSectionEvidenceBinding | null | undefined,
  claims: readonly CsrClaimReceipt[],
  evidence: readonly CsrEvidenceFact[],
): { accepted: boolean; issues: CsrBindingIssue[]; checkedClaims: number; findings: CsrClaimFinding[] } {
  const issues: CsrBindingIssue[] = [];
  if (!binding || !nonblank(binding.sectionId) || !nonblank(binding.anaRunId) ||
      !sha.test(binding.sectionSha256) || !Array.isArray(binding.claimIds)) {
    return { accepted: false, issues: ['BINDING_MISSING'], checkedClaims: 0, findings: [] };
  }
  if (!nonblank(snapshot.sectionId) || binding.sectionId !== snapshot.sectionId)
    issues.push('SECTION_ID_MISMATCH');
  if (!nonblank(snapshot.anaRunId) || binding.anaRunId !== snapshot.anaRunId)
    issues.push('RUN_ID_MISMATCH');
  const actualHash = createHash('sha256').update(snapshot.savedContent, 'utf8').digest('hex');
  if (binding.sectionSha256 !== actualHash) issues.push('SECTION_VERSION_CHANGED');
  const expected = binding.claimIds;
  const actual = claims.map(c => c.claimId);
  if (!expected.length || new Set(expected).size !== expected.length ||
      new Set(actual).size !== actual.length ||
      expected.length !== actual.length ||
      expected.some(id => !nonblank(id) || !actual.includes(id)) ||
      claims.some(c => c.section !== snapshot.sectionId)) {
    issues.push('CLAIM_COVERAGE_MISMATCH');
  }
  const checked = reconcileCsrClaims(claims, evidence);
  if (!checked.accepted) issues.push('EVIDENCE_RECONCILIATION_FAILED');
  // CSR slice 5 (2026-10-30): the claim-level findings travel with the
  // section verdict, so a caller can name the exact cell that failed.
  return { accepted: issues.length === 0, issues, checkedClaims: checked.checkedClaims, findings: checked.findings };
}
