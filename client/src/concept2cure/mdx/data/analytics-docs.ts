/**
 * Documents the Analytics surface produces.
 *
 * Analytics is a read-only surface, so the documents are scheduled exports
 * (portfolio readiness reports, quarterly performance briefs) and
 * on-demand dossiers (reviewer-velocity comparison for a product code,
 * blocker-cluster postmortems).
 *
 * Wire shape: GET /api/mdx/analytics/reports
 */

export const ANL_DOC_FRAMEWORKS = [
  { id: 'portfolio', label: 'Portfolio',    desc: 'Cross-program rollups' },
  { id: 'pathway',   label: 'Pathway',      desc: '510(k) / PMA / CER specific' },
  { id: 'reviewer',  label: 'Reviewer',     desc: 'FDA cohort comparisons' },
];

/*
 * `ANL_DOCUMENTS` — removed.
 *
 * These were example regulatory documents, and several asserted
 * `esigState: 'signed'` with a named signer and a date: an electronic
 * signature that never happened. AnalyticsSurface no longer has a document
 * panel fed from here — it renders an honest empty state until the
 * live endpoint returns rows.
 *
 * The frameworks above stay: they are the real published taxonomy,
 * not an assessment of anything.
 */
