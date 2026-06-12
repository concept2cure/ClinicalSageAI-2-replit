/**
 * Offline grounding/hallucination eval harness — tests.
 * Runs the harness over the curated fixtures and asserts perfect fabrication
 * detection (precision = recall = 1) and that every case meets its expectation —
 * this doubles as the regression gate that proves the anti-hallucination property.
 */
import { describe, it, expect } from 'vitest';
import {
  runGroundingEval,
  evaluateCase,
  GROUNDING_EVAL_FIXTURES,
  type GroundingEvalCase,
} from '../grounding-eval';

describe('grounding eval harness', () => {
  it('every curated fixture meets its expected outcome', () => {
    const report = runGroundingEval();
    const failures = report.cases.filter(c => !c.passed);
    // Surface the specific failing cases for a readable diagnostic.
    expect(failures.map(f => `${f.name}: ${f.notes.join(' ')}`)).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
  });

  it('achieves perfect fabrication detection on the fixture set', () => {
    const { fabrication } = runGroundingEval();
    expect(fabrication.recall).toBe(1); // no hallucination slips through
    expect(fabrication.precision).toBe(1); // no grounded claim falsely flagged
    expect(fabrication.f1).toBe(1);
    expect(fabrication.falseNegative).toBe(0);
    expect(fabrication.falsePositive).toBe(0);
  });

  it('grounded cases have a mean grounding ratio of 1', () => {
    expect(runGroundingEval().meanGroundingRatio).toBe(1);
  });

  it('flags a fabricated identifier and reports its kind', () => {
    const c: GroundingEvalCase = {
      name: 'ad-hoc',
      category: 'test',
      answer: 'The predicate is K000000.',
      evidence: '{"predicate":{"kNumber":"K181234"}}',
      expectFabrication: true,
      expectKinds: ['fda_510k'],
    };
    const r = evaluateCase(c);
    expect(r.passed).toBe(true);
    expect(r.fabricationDetected).toBe(true);
    expect(r.unsupportedKinds).toContain('fda_510k');
  });

  it('detects a deliberately broken expectation (harness self-check)', () => {
    // A genuinely grounded answer asserted to be a fabrication must FAIL the case,
    // proving the harness does not rubber-stamp.
    const c: GroundingEvalCase = {
      name: 'self-check',
      category: 'test',
      answer: 'Study NCT04267848 is relevant.',
      evidence: '{"studies":[{"nctId":"NCT04267848"}]}',
      expectFabrication: true,
    };
    expect(evaluateCase(c).passed).toBe(false);
  });

  it('covers every checkable identifier kind across the fixtures', () => {
    const kinds = new Set(
      GROUNDING_EVAL_FIXTURES.flatMap(f => f.expectKinds ?? [])
    );
    for (const k of ['nct', 'doi', 'pmid', 'fda_510k', 'fda_pma', 'fda_nda', 'quote']) {
      expect(kinds.has(k)).toBe(true);
    }
  });
});
