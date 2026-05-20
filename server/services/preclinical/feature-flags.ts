/**
 * Feature flags for the Module 4 preclinical workstream.
 *
 * Both flags fail closed: when unset or any value other than the literal
 * string `'true'`, the corresponding code path returns 503 / no-ops.
 *
 * - PRECLINICAL_INGEST_ENABLED gates the PDF→ctd_nonclinical_studies route.
 * - PRECLINICAL_REVIEWER_ENABLED gates the preclinical reviewer-simulator
 *   intel loader. Personas remain registered either way; when the flag is
 *   off the rules see no nonclinical intel and emit info-level stubs.
 */

export const PRECLINICAL_INGEST_ENABLED =
  process.env.PRECLINICAL_INGEST_ENABLED === 'true';

export const PRECLINICAL_REVIEWER_ENABLED =
  process.env.PRECLINICAL_REVIEWER_ENABLED === 'true';
