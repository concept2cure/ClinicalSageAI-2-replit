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
