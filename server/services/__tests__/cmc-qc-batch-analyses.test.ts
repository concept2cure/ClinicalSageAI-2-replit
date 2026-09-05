import { describe, it, expect } from 'vitest';
import { mapQcTestingPayload } from '../cmc-write-through';
import {
  MODULE3_SECTION_RULES,
  composeModule3FromCanonicalSources,
  impactedSectionsForSourceType,
} from '../module3Composer';

/**
 * QC results reaching §3.2.S.4.4 / §3.2.P.5.4 — Batch Analyses.
 *
 * ── The gap ───────────────────────────────────────────────────────────────────
 * `qc_testing` was the ONE CMC register with no write-through to a canonical
 * source object. A QC analyst recorded a release result against its
 * specification, a second person reviewed it under the §11 two-person rule, and
 * none of it reached Module 3 — the two sections whose entire purpose is to
 * carry quantitative batch results were composed without ever seeing the QC
 * file. The CTD authoring guidance for 3.2.P.5.4 is explicit that these sections
 * need "quantitative results for every specification test — not 'conforms'
 * statements", and there was no path for those results to arrive.
 *
 * ── The judgment being pinned ─────────────────────────────────────────────────
 * A QC row with no recorded result is a PENDING TEST. Letting it satisfy the
 * batch-analyses requirement would mark the section complete on the strength of
 * a test nobody has run — the "falsely-green dashboard" the composer's own
 * comments warn against. So presence of a row is not presence of evidence.
 */

const qcRow = (over: Record<string, unknown> = {}) => ({
  sampleId: 'S-001',
  sampleType: 'finished-product',
  testMethod: 'HPLC assay',
  testResults: { assay: '99.2%', relatedSubstances: '0.4%' },
  specifications: { assay: '95.0-105.0%' },
  passFailStatus: 'pass',
  reviewedBy: 9,
  ...over,
});

describe('mapQcTestingPayload', () => {
  it('carries the quantitative results as batchAnalyses', () => {
    const p = mapQcTestingPayload(qcRow());
    expect(p.batchAnalyses).toEqual({ assay: '99.2%', relatedSubstances: '0.4%' });
    expect(p.specifications).toEqual({ assay: '95.0-105.0%' });
    expect(p.passFailStatus).toBe('pass');
    expect(p.sampleId).toBe('S-001');
  });

  it('emits NO batchAnalyses for a pending test', () => {
    // A row exists, but nobody has run the test. This must not read as evidence.
    for (const testResults of [null, undefined, '']) {
      const p = mapQcTestingPayload(qcRow({ testResults, passFailStatus: 'pending' }));
      expect(p.batchAnalyses).toBeNull();
    }
  });

  it('reports whether the result has been reviewed', () => {
    // An unreviewed result is not releasable evidence, and a reader of the
    // composed section needs to know which it is looking at.
    expect(mapQcTestingPayload(qcRow()).reviewed).toBe(true);
    expect(mapQcTestingPayload(qcRow({ reviewedBy: null })).reviewed).toBe(false);
  });

  it('reads snake_case rows too, since the write-through is fed raw DB rows', () => {
    const p = mapQcTestingPayload({
      sample_id: 'S-002',
      sample_type: 'in-process',
      test_method: 'KF water',
      test_results: { water: '0.8%' },
      pass_fail_status: 'pass',
      reviewed_by: 3,
    });
    expect(p.sampleId).toBe('S-002');
    expect(p.testMethod).toBe('KF water');
    expect(p.batchAnalyses).toEqual({ water: '0.8%' });
    expect(p.reviewed).toBe(true);
  });
});

describe('qc_result reaches the batch-analyses sections', () => {
  const ruleFor = (key: string) => MODULE3_SECTION_RULES.find(r => r.sectionKey === key)!;

  it('is a required source for §3.2.S.4 and §3.2.P.5', () => {
    expect(ruleFor('3.2.S.4').requiredSourceTypes).toContain('qc_result');
    expect(ruleFor('3.2.P.5').requiredSourceTypes).toContain('qc_result');
  });

  it('marks exactly those sections stale when a QC result changes', () => {
    // Staleness propagation is what makes an approved section get re-approved
    // after new data lands. Without the source type it propagated nowhere.
    expect(impactedSectionsForSourceType('qc_result').sort()).toEqual(['3.2.P.5', '3.2.S.4']);
  });

  it('does not leak into sections that are not about batch analyses', () => {
    // 3.2.P.3.4 is the executed manufacturing record ('batch'); conflating the
    // two would file a manufacturing record where a results table belongs.
    expect(ruleFor('3.2.P.3').requiredSourceTypes).not.toContain('qc_result');
    expect(ruleFor('3.2.S.7').requiredSourceTypes).not.toContain('qc_result');
  });

  /* A 'finished-product' sample is DRUG PRODUCT evidence, so §3.2.P.5 is the
     section it completes. This test previously asserted on §3.2.S.4 — and
     passed, because completeness was unscoped while the renderer files the
     row only to §3.2.P.5.4: the section went green on a table it never
     rendered. The required fields are side-scoped now
     (drugSubstanceBatchAnalyses / drugProductBatchAnalyses). */
  it('composes the results into the section and counts them as an input', () => {
    const sources = [
      {
        sourceType: 'specification' as const,
        sourcePayload: { acceptanceCriteria: '95.0-105.0%', releaseCriteria: '95.0-105.0%' },
      },
      { sourceType: 'method' as const, sourcePayload: { validationStatus: 'validated', methodName: 'HPLC assay' } },
      { sourceType: 'qc_result' as const, sourcePayload: mapQcTestingPayload(qcRow()) },
    ];
    const composed = composeModule3FromCanonicalSources(sources as never);
    const p5 = composed.find(c => c.sectionKey === '3.2.P.5')!;
    expect(p5.missingInputs).not.toContain('drugProductBatchAnalyses');
    /* §3.2.P.5.5 is the impurity characterisation subsection, so the section
       also requires an impurity profile it can compare to an ICH threshold.
       This fixture records none, and the section says so rather than reporting
       itself served — the recorded QC result satisfies its own input and
       nothing more. */
    expect(p5.missingInputs).toEqual(['drugProductImpurityProfileComplete']);
    expect(p5.completeness).toBe(75);
    // …and the section that will NOT render this row stays honestly short.
    const s4 = composed.find(c => c.sectionKey === '3.2.S.4')!;
    expect(s4.missingInputs).toContain('drugSubstanceBatchAnalyses');
  });

  it('reports batchAnalyses as MISSING when only pending QC exists', () => {
    // The whole point: a section is not complete because a QC row was created.
    const sources = [
      { sourceType: 'specification' as const, sourcePayload: { acceptanceCriteria: '95.0-105.0%' } },
      { sourceType: 'method' as const, sourcePayload: { validationStatus: 'validated' } },
      {
        sourceType: 'qc_result' as const,
        sourcePayload: mapQcTestingPayload(qcRow({ testResults: null, passFailStatus: 'pending' })),
      },
    ];
    const composed = composeModule3FromCanonicalSources(sources as never);
    const p5 = composed.find(c => c.sectionKey === '3.2.P.5')!;
    expect(p5.missingInputs).toContain('drugProductBatchAnalyses');
    expect(p5.completeness).toBeLessThan(100);
  });
});
