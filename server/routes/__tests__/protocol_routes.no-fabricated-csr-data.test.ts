/**
 * Regression tests for Finding 3 (audit-2026-07): protocol_routes.ts
 * previously fabricated efficacy/significance claims about real, named CSRs
 * regardless of what those CSRs' fetched outcome/efficacy_data/safety_data
 * actually said.
 *
 * Specifically:
 *   - generateSuggestions() unconditionally asserted "successfully
 *     demonstrated efficacy" and "sufficient to detect statistically
 *     significant differences" for ANY matched CSR, even one whose real
 *     `outcome` recorded a failed/negative result.
 *   - enrichCsrsWithDetailedInsights()'s fallback (used whenever the
 *     Protocol Knowledge Service is unreachable/empty) fabricated boilerplate
 *     evidence — "P-value of primary outcome was statistically significant
 *     (p < 0.05)" and "Time-to-event analysis showed significant separation
 *     from control by week N" — without ever reading the real
 *     csr.outcome / csr.efficacy_data / csr.safety_data fields that were
 *     already fetched from the database.
 *
 * These tests fail against the pre-fix code: the old generateSuggestions
 * always pushed the "successfully demonstrated efficacy" / "statistically
 * significant differences" strings verbatim, and the old fallback always
 * pushed the "p < 0.05" / "Time-to-event analysis" strings verbatim,
 * regardless of csr.outcome.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyOutcome,
  describeField,
  enrichCsrsWithDetailedInsights,
  generateSuggestions,
} from '../protocol_routes';

const FAILURE_OUTCOME =
  'The study did not meet its primary endpoint; the difference versus placebo was not statistically significant (p=0.34).';

const SUCCESS_OUTCOME =
  'The study met the primary endpoint, demonstrating a statistically significant reduction in body weight versus placebo (p<0.001).';

describe('classifyOutcome', () => {
  it('classifies a real negative/failed outcome as failure', () => {
    expect(classifyOutcome(FAILURE_OUTCOME)).toBe('failure');
  });

  it('classifies a real positive outcome as success', () => {
    expect(classifyOutcome(SUCCESS_OUTCOME)).toBe('success');
  });

  it('classifies a missing/empty outcome as unknown, never success', () => {
    expect(classifyOutcome(undefined)).toBe('unknown');
    expect(classifyOutcome(null)).toBe('unknown');
    expect(classifyOutcome('')).toBe('unknown');
    expect(classifyOutcome('   ')).toBe('unknown');
  });
});

describe('describeField', () => {
  it('returns the honest fallback for empty/missing values, never fabricated text', () => {
    expect(describeField(null, 'not available for this record')).toBe(
      'not available for this record'
    );
    expect(describeField(undefined, 'not available for this record')).toBe(
      'not available for this record'
    );
    expect(describeField('', 'not available for this record')).toBe(
      'not available for this record'
    );
    expect(describeField([], 'not available for this record')).toBe(
      'not available for this record'
    );
  });

  it('surfaces the real value verbatim when present', () => {
    expect(describeField('Real recorded outcome text', 'fallback')).toBe(
      'Real recorded outcome text'
    );
  });
});

describe('generateSuggestions — must be derived from the real fetched outcome', () => {
  it('does NOT assert efficacy/significance for a CSR whose real outcome failed', () => {
    const failingCsr = {
      id: 1,
      design: 'randomized double-blind placebo-controlled',
      sample_size: 240,
      duration_weeks: 26,
      primary_endpoint: 'Change in HbA1c from baseline',
      outcome: FAILURE_OUTCOME,
    };

    const suggestions = generateSuggestions(failingCsr, 'type 2 diabetes', 'phase3');
    const joined = suggestions.join(' ').toLowerCase();

    // The old code asserted these verbatim for every CSR, success or not.
    expect(joined).not.toContain('successfully demonstrated efficacy');
    expect(joined).not.toContain('sufficient to detect statistically significant differences');

    // The real, negative outcome must be surfaced instead of being ignored.
    expect(suggestions.some(s => s.includes(FAILURE_OUTCOME))).toBe(true);
  });

  it('surfaces the real outcome text for a CSR that genuinely succeeded', () => {
    const successCsr = {
      id: 2,
      design: 'randomized double-blind placebo-controlled',
      sample_size: 180,
      duration_weeks: 52,
      primary_endpoint: 'Percent weight loss from baseline',
      outcome: SUCCESS_OUTCOME,
    };

    const suggestions = generateSuggestions(successCsr, 'obesity', 'phase3');
    expect(suggestions.some(s => s.includes(SUCCESS_OUTCOME))).toBe(true);
  });

  it('says outcome is not available rather than fabricating success when outcome is unknown', () => {
    const unknownCsr = {
      id: 3,
      design: 'open-label single-arm',
      sample_size: 50,
      primary_endpoint: 'Objective response rate',
      // no `outcome` field fetched/available
    };

    const suggestions = generateSuggestions(unknownCsr, 'oncology', 'phase2');
    const joined = suggestions.join(' ').toLowerCase();

    expect(joined).not.toContain('successfully demonstrated efficacy');
    expect(joined).not.toContain('statistically significant');
    expect(joined).toContain('not available');
  });
});

describe('enrichCsrsWithDetailedInsights fallback — must be derived from real fetched fields', () => {
  it('does not fabricate a p-value or "statistically significant" evidence for a CSR that failed', async () => {
    const csr = {
      id: 42,
      design: 'randomized parallel-group',
      sample_size: 320,
      duration_weeks: 24,
      primary_endpoint: 'Overall Survival',
      outcome: 'The study did not meet its primary endpoint of overall survival versus control.',
      efficacy_data: null,
      safety_data: null,
      insight: null,
    };

    const [enriched] = await enrichCsrsWithDetailedInsights([csr], 'lung cancer', 'phase3');

    const evidenceText = (enriched.detailed_insights as Array<{ evidence: string }>)
      .map(i => i.evidence)
      .join(' ')
      .toLowerCase();

    // The old fallback asserted these fabricated boilerplate strings
    // regardless of csr.outcome.
    expect(evidenceText).not.toContain('p < 0.05');
    expect(evidenceText).not.toContain('statistically significant');
    expect(evidenceText).not.toContain('time-to-event analysis showed significant separation');

    // The real (negative) outcome must be surfaced somewhere in the evidence.
    expect(evidenceText).toContain('did not meet its primary endpoint');

    // efficacy_outcomes must not invent a p-value/effect size when
    // csr.efficacy_data was never populated; it must fall back to the real
    // outcome text or an honest "not available" statement.
    expect(enriched.efficacy_outcomes).toHaveLength(1);
    expect(enriched.efficacy_outcomes[0]).not.toMatch(/p\s*=\s*0\.\d+/i);
    expect(enriched.efficacy_outcomes[0]).not.toMatch(/cohen's d/i);

    // safety_outcomes must not invent an AE rate when csr.safety_data is null.
    expect(enriched.safety_outcomes[0]).toBe('Safety data not available for this record');

    // statistical_approach must not invent MMRM/ANCOVA keyed off csr.id.
    expect(enriched.statistical_approach).toBe(
      'Statistical methodology not available for this record'
    );
  });

  it('surfaces real efficacy_data/safety_data/insight verbatim when they are present', async () => {
    const csr = {
      id: 7,
      design: 'randomized double-blind',
      sample_size: 400,
      duration_weeks: 52,
      primary_endpoint: 'HbA1c change',
      outcome: SUCCESS_OUTCOME,
      efficacy_data: 'Least-squares mean difference -0.8% (95% CI -1.0, -0.6), p<0.001 vs placebo.',
      safety_data: 'Most common AE was nausea (12%); no unexpected safety signals identified.',
      insight: 'Consistent treatment effect across prespecified subgroups.',
    };

    const [enriched] = await enrichCsrsWithDetailedInsights([csr], 'type 2 diabetes', 'phase3');

    expect(enriched.efficacy_outcomes[0]).toBe(csr.efficacy_data);
    expect(enriched.safety_outcomes[0]).toBe(csr.safety_data);
    expect(enriched.key_learnings[0]).toBe(csr.insight);
  });
});
