/**
 * The QC sample-type vocabulary the batch-analyses rule is written in.
 *
 * It lived in server/services/module3Composer.ts and was imported from there
 * by the write-through mapper. The capability assessment (services/cmc/
 * recorded-capability) needs the same rule and the composer imports IT, so
 * holding the constants in the composer would have made a cycle. They are
 * facts about the register's vocabulary, not about composition, so they live
 * here; the composer re-exports them and every existing importer is unchanged.
 *
 * @module shared/cmc/qc-sample-types
 */

/** The QC sample types that are NOT tests of the material: a cleaning swab
 *  belongs to GMP cleaning records, a reference-standard qualification to
 *  §3.2.S.5/§3.2.P.6. Neither is batch-analyses evidence. */
export const NON_BATCH_SAMPLE_TYPES = ['cleaning-verification', 'reference-standard'];

/** The sample type that makes a QC result DRUG PRODUCT evidence (§3.2.P.5.4). */
export const FINISHED_PRODUCT = 'finished-product';

/**
 * Every sample type this register accepts — the whole vocabulary, in one place.
 *
 * ── Why it moved here (2026-10-26) ──────────────────────────────────────────
 * The client's form held this list and the server held none: `sample_type` is a
 * free `text` column whose vocabulary lived in a trailing comment, and the
 * create schema did not constrain it. So a caller that is not the form — an
 * AnA tool, a script, an integration — could write any string, and
 * `mapQcTestingPayload` read it through
 *
 *     sampleType === FINISHED_PRODUCT ? 'drug_product' : 'drug_substance'
 *
 * which makes every unrecognised value **drug-substance batch evidence**.
 * Measured on a real database: seven results recorded as `finished_product`
 * (underscore — not a value the form can produce) were all classified
 * `drug_substance`, and composed into §3.2.S.4.4 rather than §3.2.P.5.4.
 *
 * `NON_BATCH_SAMPLE_TYPES` fails the same way in the other direction:
 * `reference_standard` is not `reference-standard`, so a reference-standard
 * qualification — a record the mapper exists to exclude — would have entered
 * the batch-analysis series.
 *
 * A misattributed batch analysis is a false statement about which material was
 * tested, in a filed section. So the vocabulary is now closed at the write,
 * shared by both sides, and an unrecognised value is attributed to NEITHER.
 */
export const QC_SAMPLE_TYPES = [
  'raw-material',
  'in-process',
  'finished-product',
  'stability',
  'reference-standard',
  'cleaning-verification',
] as const;

export type QcSampleType = (typeof QC_SAMPLE_TYPES)[number];

/** Is this a sample type the register knows? Compared lower-case and trimmed,
 *  because that is how every reader of the column already compares it. */
export function isKnownSampleType(value: unknown): value is QcSampleType {
  const t = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (QC_SAMPLE_TYPES as readonly string[]).includes(t);
}
