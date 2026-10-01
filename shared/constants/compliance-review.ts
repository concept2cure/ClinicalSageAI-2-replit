/**
 * The two kinds of periodic review record (P1-25 audit-trail review, P1-43
 * access review; ADR-0014 §8), and the compliance report each kind reads and
 * names by its sealed run (export id and data hash).
 *
 * One definition for both sides: the server checks that the run a review names
 * is this organisation's run of that report (server/services/audit/
 * compliance-reviews.ts), and the client names the run on its screen
 * (client/src/concept2cure/v2/surfaces/complianceReviewModel.ts).
 */
export type ReviewKind = 'audit_trail' | 'access';

/** The report id (server/services/audit/compliance-reports/catalog.ts) a review of each kind reads. */
export const REVIEW_SOURCE_REPORT: Readonly<Record<ReviewKind, string>> = Object.freeze({
  access: 'access-review',
  audit_trail: 'audit-trail-integrity',
});
