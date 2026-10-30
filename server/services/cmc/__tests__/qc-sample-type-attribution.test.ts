/**
 * A batch analysis is attributed to the material it was actually run on.
 *
 * ## The defect
 *
 * `qc_testing.sample_type` is a free `text` column whose vocabulary lived in a
 * trailing comment, and the create schema did not constrain it. The
 * write-through then read the value as:
 *
 *     sampleType === FINISHED_PRODUCT ? 'drug_product' : 'drug_substance'
 *
 * — so **every unrecognised string became drug-substance batch evidence**, and
 * composed into §3.2.S.4.4 instead of §3.2.P.5.4.
 *
 * Measured on a real database, not hypothesised: seven QC results recorded as
 * `finished_product` (underscore — a value the form cannot produce, sent the
 * way any API caller would) came back
 *
 *     sample_type        batchAnalysisSide
 *     finished_product   drug_substance      ×7
 *
 * and the process-capability report attributed the product's Cpk to the
 * substance. Found while checking an observation left unresolved by the
 * previous slice, which had recorded it as "possibly the mapper's intended
 * fallback or a mis-sort" rather than claiming it either way.
 *
 * `NON_BATCH_SAMPLE_TYPES` fails identically inverted: `reference_standard` is
 * not `reference-standard`, so a reference-standard qualification — a record
 * this mapper exists to EXCLUDE from batch analyses — would have entered the
 * series it is meant to keep out of.
 *
 * ## The rule
 *
 * One vocabulary, closed at the write; and a value outside it is attributed to
 * NEITHER side, in the mapper too, because rows written before that refusal
 * must not keep composing into the wrong section.
 */
import { describe, it, expect } from 'vitest';
import { QC_SAMPLE_TYPES, FINISHED_PRODUCT, NON_BATCH_SAMPLE_TYPES, isKnownSampleType } from '@shared/cmc/qc-sample-types';
import { mapQcTestingPayload } from '../../cmc-write-through';
import { isBatchAnalysisFor, unattributableSampleType } from '../recorded-capability';

const RESULT = { value: '99.4', unit: '%' };
const qc = (sampleType: string) => ({
  sampleId: 'S-1',
  batchNumber: 'B-1',
  sampleType,
  testMethod: 'Assay by HPLC-UV (AM-114)',
  testResults: RESULT,
  specifications: { acceptanceCriteria: '95.0 - 105.0 %' },
  passFailStatus: 'pass',
});

describe('the register has one vocabulary, and it is closed', () => {
  it('holds every sample type the form offers', () => {
    expect([...QC_SAMPLE_TYPES]).toEqual([
      'raw-material', 'in-process', 'finished-product', 'stability', 'reference-standard', 'cleaning-verification',
    ]);
  });

  it('recognises its own members, and nothing else', () => {
    for (const t of QC_SAMPLE_TYPES) expect(isKnownSampleType(t), t).toBe(true);
    /* The exact values that were silently reclassified. */
    for (const t of ['finished_product', 'reference_standard', 'Finished Product', 'fp', '', null, undefined, 42]) {
      expect(isKnownSampleType(t), String(t)).toBe(false);
    }
  });

  it('is case- and whitespace-insensitive, because every reader compares it that way', () => {
    for (const t of ['Finished-Product', ' finished-product ', 'FINISHED-PRODUCT']) {
      expect(isKnownSampleType(t), t).toBe(true);
    }
  });

  it('keeps the two derived sets inside the vocabulary', () => {
    /* A member of either set that the vocabulary does not hold is a rule
       written against a value nothing can produce. */
    expect(QC_SAMPLE_TYPES).toContain(FINISHED_PRODUCT);
    for (const t of NON_BATCH_SAMPLE_TYPES) expect(QC_SAMPLE_TYPES, t).toContain(t);
  });
});

describe('a known sample type is attributed as it always was', () => {
  it('makes a finished-product result drug-product evidence', () => {
    const p = mapQcTestingPayload(qc('finished-product'));
    expect(p.batchAnalysisSide).toBe('drug_product');
    expect(p.drugProductBatchAnalyses).toEqual(RESULT);
    expect(p.drugSubstanceBatchAnalyses).toBeNull();
    expect(p.sampleTypeRecognised).toBe(true);
  });

  it('makes a raw-material or in-process result drug-substance evidence', () => {
    for (const t of ['raw-material', 'in-process', 'stability']) {
      const p = mapQcTestingPayload(qc(t));
      expect(p.batchAnalysisSide, t).toBe('drug_substance');
      expect(p.drugSubstanceBatchAnalyses, t).toEqual(RESULT);
      expect(p.drugProductBatchAnalyses, t).toBeNull();
    }
  });

  it('still keeps a cleaning swab and a standard qualification out of batch analyses', () => {
    for (const t of NON_BATCH_SAMPLE_TYPES) {
      const p = mapQcTestingPayload(qc(t));
      expect(p.isBatchAnalysis, t).toBe(false);
      expect(p.batchAnalysisSide, t).toBeNull();
      expect(p.batchAnalyses, t).toBeNull();
      /* Recognised — it IS a sample type the register knows; it is simply not
         batch evidence. The two facts are separate and stay separate. */
      expect(p.sampleTypeRecognised, t).toBe(true);
    }
  });
});

describe('an unrecognised sample type is attributed to neither material', () => {
  it('does not make `finished_product` drug-substance evidence', () => {
    /* The seven rows that were on the database. */
    const p = mapQcTestingPayload(qc('finished_product'));
    expect(p.batchAnalysisSide).toBeNull();
    expect(p.drugSubstanceBatchAnalyses).toBeNull();
    expect(p.drugProductBatchAnalyses).toBeNull();
    expect(p.batchAnalyses).toBeNull();
    expect(p.isBatchAnalysis).toBe(false);
  });

  it('does not let `reference_standard` into the batch-analysis series', () => {
    /* The inverse failure: the exclusion list is hyphenated, so the
       underscored spelling slipped past it AND past the side test. */
    const p = mapQcTestingPayload(qc('reference_standard'));
    expect(p.isBatchAnalysis).toBe(false);
    expect(p.batchAnalyses).toBeNull();
  });

  it('says the sample type was not recognised, so nothing vanishes silently', () => {
    /* The row is on file. A payload that simply omitted it would read as a
       project with less data than it has, and the correction would never be
       prompted. */
    const p = mapQcTestingPayload(qc('finished_product'));
    expect(p.sampleTypeRecognised).toBe(false);
    expect(p.sampleType).toBe('finished_product');
  });

  it('attributes nothing for an absent or empty sample type', () => {
    for (const t of ['', '   ']) {
      const p = mapQcTestingPayload(qc(t));
      expect(p.batchAnalysisSide, JSON.stringify(t)).toBeNull();
      expect(p.sampleTypeRecognised, JSON.stringify(t)).toBe(false);
    }
    const missing = mapQcTestingPayload({ ...qc('x'), sampleType: undefined });
    expect(missing.batchAnalysisSide).toBeNull();
  });
});

describe('a row written before the fix stops composing into the wrong section', () => {
  /* The rows measured on the database: the mapper read `finished_product` as
     drug substance and PERSISTED that decision, so fixing the mapper alone
     would have left them composing into §3.2.S.4.4 for ever — the reader
     honours the stored decision. The vocabulary is checked where both the
     capability route and the composer read, so the correction reaches them. */
  const stored = {
    sampleId: 'CS401-DP-2601-A',
    batchNumber: 'CS401-DP-2601',
    sampleType: 'finished_product',
    testMethod: 'Assay by HPLC-UV (AM-114)',
    testResults: RESULT,
    specifications: { acceptanceCriteria: '95.0 - 105.0 %' },
    isBatchAnalysis: true,
    batchAnalysisSide: 'drug_substance',
  };

  it('is evidence for neither material, whatever decision is stored beside it', () => {
    expect(isBatchAnalysisFor(stored, 'drug_substance')).toBe(false);
    expect(isBatchAnalysisFor(stored, 'drug_product')).toBe(false);
  });

  it('is named, so a reader learns why it is missing and what to correct', () => {
    expect(unattributableSampleType(stored)).toBe('finished_product');
  });

  it('still honours a stored decision the vocabulary could have produced', () => {
    /* The stored side stays authoritative for a known type — it is the
       mapper's record of what the register decided, and re-deriving it here
       would be a second rule that can drift from the first. */
    const known = { ...stored, sampleType: 'finished-product', batchAnalysisSide: 'drug_product' };
    expect(isBatchAnalysisFor(known, 'drug_product')).toBe(true);
    expect(isBatchAnalysisFor(known, 'drug_substance')).toBe(false);
    expect(unattributableSampleType(known)).toBeNull();
  });

  it('names a row with no sample type at all rather than passing over it', () => {
    expect(unattributableSampleType({ ...stored, sampleType: '' })).toBe('(none recorded)');
    expect(unattributableSampleType({ ...stored, sampleType: undefined })).toBe('(none recorded)');
  });

  it('leaves a recognised non-batch record out, and does not call it unattributable', () => {
    /* A cleaning swab is known AND not batch evidence: two different facts,
       and reporting it as an unrecognised sample type would send someone to
       correct a row that is correct. */
    const swab = { ...stored, sampleType: 'cleaning-verification', batchAnalysisSide: null, isBatchAnalysis: false };
    expect(isBatchAnalysisFor(swab, 'drug_substance')).toBe(false);
    expect(unattributableSampleType(swab)).toBeNull();
  });
});
