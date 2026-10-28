/**
 * Complete-document CSR evidence preflight over the existing saved authoring
 * section and source receipts. No database writes, model inference or approval.
 * Callers must fetch all records from one authorized tenant/version snapshot.
 */
import {
  verifyCsrSectionEvidenceBinding,
  type CsrSectionEvidenceBinding,
  type CsrSectionSnapshot,
  type CsrBindingIssue,
} from './csr-section-evidence-binding';
import type { CsrClaimReceipt, CsrEvidenceFact } from './csr-claim-reconciliation';

export interface CsrDocumentSectionEvidence {
  snapshot: CsrSectionSnapshot;
  binding: CsrSectionEvidenceBinding | null;
  claims: CsrClaimReceipt[];
}
export interface CsrDocumentEvidenceIssue {
  sectionId: string;
  code: CsrBindingIssue | 'MISSING_SECTION' | 'DUPLICATE_SECTION' |
    'UNEXPECTED_SECTION' | 'EMPTY_SECTION' | 'EMPTY_MANIFEST';
}
export interface CsrDocumentEvidenceResult {
  status: 'blocked' | 'reconciled_pending_human_review';
  checkedSections: number;
  checkedClaims: number;
  issues: CsrDocumentEvidenceIssue[];
}

/**
 * The manifest must be the exact full saved document section set, never an
 * optional subset supplied by a model. Even a successful check is NOT approval.
 */
export function verifyCsrDocumentEvidence(
  expectedSectionIds: readonly string[],
  sections: readonly CsrDocumentSectionEvidence[],
  facts: readonly CsrEvidenceFact[],
): CsrDocumentEvidenceResult {
  const issues: CsrDocumentEvidenceIssue[] = [];
  const expected = new Set(expectedSectionIds);
  if (!expectedSectionIds.length || expected.size !== expectedSectionIds.length ||
      expectedSectionIds.some(id => typeof id !== 'string' || !id.trim())) {
    return { status: 'blocked', checkedSections: 0, checkedClaims: 0,
      issues: [{ sectionId: '', code: 'EMPTY_MANIFEST' }] };
  }
  const byId = new Map<string, CsrDocumentSectionEvidence>();
  for (const entry of sections) {
    const id = entry.snapshot?.sectionId ?? '';
    if (!expected.has(id)) issues.push({ sectionId: id, code: 'UNEXPECTED_SECTION' });
    if (byId.has(id)) issues.push({ sectionId: id, code: 'DUPLICATE_SECTION' });
    byId.set(id, entry);
  }
  let checkedClaims = 0;
  for (const id of expectedSectionIds) {
    const entry = byId.get(id);
    if (!entry) { issues.push({ sectionId: id, code: 'MISSING_SECTION' }); continue; }
    if (typeof entry.snapshot.savedContent !== 'string' || !entry.snapshot.savedContent.trim()) {
      issues.push({ sectionId: id, code: 'EMPTY_SECTION' });
      continue;
    }
    const checked = verifyCsrSectionEvidenceBinding(
      entry.snapshot, entry.binding, entry.claims, facts);
    checkedClaims += checked.checkedClaims;
    for (const code of checked.issues) issues.push({ sectionId: id, code });
  }
  return { status: issues.length ? 'blocked' : 'reconciled_pending_human_review',
    checkedSections: expectedSectionIds.length, checkedClaims, issues };
}
