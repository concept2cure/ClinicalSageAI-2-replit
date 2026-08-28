/**
 * Regression tests for Finding 4 (audit-2026-07): csr-extractor-service.ts
 * previously HARDCODED processing_metadata.confidence_scores to a fixed
 * 0.92 overall (with fixed per-section scores 0.95/0.9/0.85/...) after the
 * enhanced (AI) PDF extraction try-block, regardless of how much text was
 * actually extracted or the model's uncertainty — and that value was then
 * silently overwritten, again unconditionally, by a second hardcoded 0.85
 * default further down `processCSR`. Neither number ever reflected real
 * extraction reliability, misrepresenting it to reviewers deciding whether
 * human verification of an extracted CSR is needed.
 *
 * `computeConfidenceScores` (and its helper `scoreForExtractedContent`)
 * replace both hardcoded blocks: confidence is now derived from whether/how
 * much real text was actually captured for each section, and a section (or
 * the overall score) with no extracted content is reported as `null`
 * ("not assessed") rather than a fabricated high number.
 *
 * These tests call the private `computeConfidenceScores` method directly
 * (bypassing the DB/PDF/OpenAI machinery in `processCSR`, which requires a
 * live database) via an `as any` cast — a standard pattern for unit-testing
 * a class's internal computation in isolation. They fail against the
 * pre-fix code because `computeConfidenceScores` did not exist there.
 */

import { describe, expect, it } from 'vitest';
import { csrExtractorService } from '../csr-extractor-service';

// Minimal but complete stand-in for the mapped CSR template shape that
// computeConfidenceScores reads from. All text/array fields start empty;
// individual test cases fill in only what they need.
function emptyMappedData() {
  return {
    csr_id: '',
    meta: {
      study_id: '',
      sponsor: '',
      phase: '',
      indication: '',
      molecule: '',
      moa: '',
      submission_date: '',
    },
    summary: { objectives: '', design: '', endpoints: [] as string[], results: '' },
    semantic: {
      design_rationale: '',
      regulatory_classification: '',
      study_type: '',
      statistical_principles: [] as string[],
      deviation_handling_method: '',
      adjustment_for_covariates: '',
      dropout_handling: '',
      safety_monitoring_strategy: '',
      subgroup_analysis_approach: '',
    },
    pharmacology: {
      moa_explained: '',
      dose_selection_justification: '',
      formulation_details: '',
      bioavailability_finding: '',
      pharmacokinetic_profiles: [] as string[],
      pk_parameters: {},
    },
    stats_traceability: {
      primary_model: '',
      multiplicity_adjustment_method: '',
      interim_analysis_details: '',
      power_analysis_basis: '',
      data_sources: [] as string[],
      stratification_factors: [] as string[],
    },
    design: { arms: 0, duration_weeks: 0, randomization: '', blinding: '', flow_diagram: '' },
    population: {
      total_enrolled: 0,
      screen_fail: 0,
      discontinued: 0,
      inclusion_criteria: [] as string[],
      exclusion_criteria: [] as string[],
    },
    efficacy: { primary: [] as string[], secondary: [] as string[], exploratory: [] as string[], analysis_methods: '' },
    safety: { teae_summary: '', sae_summary: '', lab_flags: [] as string[], discontinuations: [] as string[] },
    stats: { method: '', sample_size_calc: '', adjustments: '', population_sets: [] as string[] },
    results: { primary_outcome: '', secondary: '', subgroups: '', charts: [] as string[], p_values: {} },
    regulatory: { findings: '', irb_notes: '', audit_flags: [] as string[] },
    refs: { protocol: '', sap: '', crf: '', literature: [] as string[] },
    vector_embedding: [] as number[],
    processing_metadata: {
      processed_date: '',
      processing_version: '',
      confidence_scores: { overall: 0, sections: {} as Record<string, number> },
    },
  };
}

// Access the private method the same way any unit test reaches into a
// class's internals without exposing it on the public API.
const svc = csrExtractorService as unknown as {
  computeConfidenceScores: (mappedData: ReturnType<typeof emptyMappedData>) => {
    overall: number | null;
    sections: Record<string, number | null>;
  };
};

describe('CSRExtractorService.computeConfidenceScores', () => {
  it('is not a fixed 0.92 (or any fixed number) — reports null when nothing was extracted', () => {
    const result = svc.computeConfidenceScores(emptyMappedData());

    // The old code asserted overall = 0.92 (enhanced path) or 0.85
    // (default path) unconditionally. With genuinely no extracted content,
    // honest behavior is "not assessed", not a fabricated high score.
    expect(result.overall).not.toBe(0.92);
    expect(result.overall).not.toBe(0.85);
    expect(result.overall).toBeNull();

    // None of the per-section scores may be the old hardcoded values either.
    for (const score of Object.values(result.sections)) {
      expect(score).toBeNull();
    }
  });

  it('computes a real, non-hardcoded score from substantial extracted content', () => {
    const mappedData = emptyMappedData();
    mappedData.results.primary_outcome =
      'The study met its primary endpoint, showing a clinically meaningful and durable improvement over the comparator arm across the pre-specified analysis population, with consistent effects observed in key subgroups.';
    mappedData.summary.results =
      'Overall, efficacy findings were consistent with the pre-specified statistical analysis plan and supported the conclusions drawn by the study investigators.';

    const result = svc.computeConfidenceScores(mappedData);

    // Efficacy had substantial real text -> assessed, non-null, and not the
    // old fixed 0.9/0.92 value coincidentally standing in for "we didn't
    // actually check" (it happens to equal 0.9 here only because it crosses
    // our own length threshold, not because it was asserted outright).
    expect(result.sections.efficacy).not.toBeNull();
    expect(typeof result.sections.efficacy).toBe('number');

    // Sections with no extracted content stay honestly unassessed.
    expect(result.sections.meta).toBeNull();
    expect(result.sections.safety).toBeNull();
    expect(result.sections.design).toBeNull();

    // Overall must not be the old hardcoded constants.
    expect(result.overall).not.toBe(0.92);
    expect(result.overall).not.toBe(0.85);
    expect(result.overall).not.toBeNull();
  });

  it('gives a low score to a section with only minimal extracted text, not a fixed high value', () => {
    const mappedData = emptyMappedData();
    mappedData.safety.teae_summary = 'AE noted.'; // 9 chars — minimal real content

    const result = svc.computeConfidenceScores(mappedData);

    expect(result.sections.safety).not.toBeNull();
    // Must scale with the (tiny) amount of real content, not jump straight
    // to the old hardcoded 0.85 safety score.
    expect(result.sections.safety).toBeLessThan(0.85);
  });
});
