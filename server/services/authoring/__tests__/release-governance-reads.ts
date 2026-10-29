/**
 * The two governance reads every Authoring release route now makes, answered
 * truthfully for a fake database, for suites that test something else.
 *
 * 1. Is this document a CSR? Every freeze, signature, export and filing to
 *    Vault first asks whether the document's stored history makes it one
 *    (services/authoring/csr-scientific-review.ts requiresCsrScientificReview).
 *    A fake that answers with whatever row it returns for everything is
 *    refused CSR_EVIDENCE_IDENTITY_UNAVAILABLE, as it must be. The answer here
 *    is: no stored CSR origin and no earlier scientific-review receipt.
 * 2. Who wrote it? A review or approval signature must come from someone who
 *    is not an author (services/governance/separation-of-duties.ts). The
 *    answer here is: created by member AUTHOR_ID, with no other contributor,
 *    so every other signer is independent. The document id must be a UUID,
 *    as it is in production; any other id leaves the author unresolved.
 *
 * The CSR case and the independence refusals have their own suites
 * (csr-scientific-release-order.test.ts, workflow-import-governance.pglite.test.ts,
 * authoring-approval-independence.test.ts).
 */
export const DOC_ID = 'd0c0d0c0-0000-4000-8000-0000000000d1';
export const AUTHOR_ID = '9';

type Answer = { rowCount: number; rows: Array<Record<string, unknown>> };

export function releaseGovernanceRead(sql: unknown): Answer | null {
  const s = String(sql);
  if (/SELECT EXISTS/.test(s) && /csrScientificEvidence/.test(s)) return { rowCount: 1, rows: [{ required: false }] };
  if (/SELECT d\.created_by FROM authoring_documents d/.test(s)) return { rowCount: 1, rows: [{ created_by: AUTHOR_ID }] };
  if (/SELECT DISTINCT r\.created_by FROM doc_revisions/.test(s)) return { rowCount: 0, rows: [] };
  if (/SELECT actor_id, operation_type, metadata FROM authoring_audit_trail/.test(s)) return { rowCount: 0, rows: [] };
  return null;
}
