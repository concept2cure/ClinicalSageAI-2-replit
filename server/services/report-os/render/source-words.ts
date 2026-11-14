/**
 * A report's sources and their status, in words (split from render.ts, 2026-11-12).
 *
 * Every report that is not a Quality report printed the engine's ids and stored values to the reader:
 * "artifact_state · ready", "regional_package_manifest · partial" (sales rehearsal E17 and E18). This is the one
 * vocabulary for them: the report's table of sources (render.ts) and the run's evidence table
 * (GET /runs/:id/dependencies) both read it, so a source has one name wherever it is shown. The stored id stays on
 * the record; it is never the label.
 *
 * @module server/services/report-os/render/source-words
 */

/** "activeRegistrations" and "a_new_engine" → "Active registrations", "A new engine". */
export function humanize(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/* Keyed by the id each engine emits (orchestrator.ts, regional/*, quality/*, research-compliance-report-providers.ts,
   lifecycle-calendar.ts, label-currency-matrix.ts, trial-master-file-pack.ts). An id not listed is read as words. */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  artifact_state: 'What the project holds',
  artifact_approval: 'Approved or locked',
  submission_readiness: 'Submission readiness',
  regional_package_manifest: 'Regional package',
  market_support: 'Market support',
  module1_content: 'Module 1 content',
  module1_applicability: 'Module 1 applicability',
  quality_project_evidence: 'Quality evidence',
  rim_label_currency_matrix: 'Label currency',
  rim_registrations: 'Registrations',
  lifecycle_obligation_calendar: 'Lifecycle obligations',
  lifecycle_obligations: 'Lifecycle obligations',
  etmf: 'Trial master file',
  fcoi_disclosures: 'Financial disclosures',
  ha_commitments: 'Health authority commitments',
  iacuc_protocols: 'IACUC protocols',
  ibc_registrations: 'IBC registrations',
  irb_submissions: 'IRB submissions',
  inspections: 'Inspections',
  nonclinical_studies: 'Nonclinical studies',
  controlled_substances: 'Controlled substances',
  effort_certifications: 'Effort certifications',
  grants_portfolio: 'Grants',
  research_admin_scorecard: 'Research administration',
  research_compliance_training: 'Compliance training',
  research_security_coi: 'Research security disclosures',
};

/** A source as a reader names it. */
export function sourceLabel(id: string): string {
  return SOURCE_LABELS[id] ?? humanize(id);
}

/** A source's status in words: the engine's own three, or a value it does not know read as recorded. */
export function sourceStatusWords(status: string): string {
  return humanize(status);
}
