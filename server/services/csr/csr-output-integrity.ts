/** Deterministic final gate for saved CSR section content (W1/D2).
 * Reuse the existing job/output tables; never infer completeness from row count alone.
 * No model call, no private data logging, and no new source store.
 */
import { createHash } from 'node:crypto';

export interface CsrSavedSection {
  sectionNumber: string;
  content: string | null;
  contentHash: string | null;
}
export interface CsrSavedIntegrity {
  missing: string[];
  mismatched: string[];
  covered: string[];
}
export function verifySavedCsrSectionIntegrity(
  targetNumbers: readonly string[],
  saved: readonly CsrSavedSection[],
): CsrSavedIntegrity {
  if (targetNumbers.length === 0 || new Set(targetNumbers).size !== targetNumbers.length) {
    throw new Error('CSR_TARGETS_INVALID: expected nonempty unique section targets');
  }
  const seen = new Map<string, CsrSavedSection>();
  const mismatched = new Set<string>();
  const targets = new Set(targetNumbers);
  for (const row of saved) {
    if (!targets.has(row.sectionNumber)) continue;
    if (seen.has(row.sectionNumber)) mismatched.add(row.sectionNumber);
    seen.set(row.sectionNumber, row);
  }
  const missing: string[] = [];
  const covered: string[] = [];
  for (const number of targetNumbers) {
    const row = seen.get(number);
    if (!row || typeof row.content !== 'string' || !row.content.trim()) {
      missing.push(number);
      continue;
    }
    const expected = createHash('sha256').update(row.content, 'utf8').digest('hex');
    if (typeof row.contentHash !== 'string' || row.contentHash !== expected) {
      mismatched.add(number);
    } else {
      covered.push(number);
    }
  }
  return { missing, mismatched: [...mismatched].sort(), covered };
}
