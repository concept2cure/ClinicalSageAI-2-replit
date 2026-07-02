/**
 * Blocking CI gate for the AI grounding / anti-hallucination property.
 *
 * The offline eval harness (`runGroundingEval`) is also driven by the advisory
 * script `scripts/eval-grounding.ts`. That script only runs when invoked
 * manually. This test expresses the SAME invariants as a vitest case so the
 * CI `test` job (which runs all `tests/**\/*.test.ts`) enforces them on every
 * push — turning an advisory artifact into a blocking regression gate.
 *
 * Invariants asserted here mirror the script's exit condition exactly
 * (`report.failed === 0 && report.fabrication.recall === 1`) so the gate can
 * never diverge from the script:
 *   - every curated fixture case passes, and
 *   - fabrication recall === 1.0 (no fabricated citation slips through).
 *
 * The harness is fully offline and deterministic: `runGroundingEval` calls
 * `verifyAnswerGrounding`, which is pure string/regex logic — no model call,
 * no network, no API keys, no env dependencies — so this gate is safe to run
 * unconditionally in CI (never flaky, never skipped).
 */
import { describe, it, expect } from 'vitest';
import {
  runGroundingEval,
  GROUNDING_EVAL_FIXTURES,
} from '../../server/services/evidence/grounding-eval.js';

describe('AI safety: grounding / hallucination eval (blocking gate)', () => {
  const report = runGroundingEval();

  it('runs the full curated fixture set', () => {
    expect(report.total).toBe(GROUNDING_EVAL_FIXTURES.length);
    expect(report.total).toBeGreaterThan(0);
    expect(report.cases).toHaveLength(report.total);
  });

  it('reports an aggregate metrics object of the expected shape', () => {
    expect(report).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        passed: expect.any(Number),
        failed: expect.any(Number),
        passRate: expect.any(Number),
        meanGroundingRatio: expect.any(Number),
        cases: expect.any(Array),
        fabrication: expect.objectContaining({
          truePositive: expect.any(Number),
          falsePositive: expect.any(Number),
          trueNegative: expect.any(Number),
          falseNegative: expect.any(Number),
          precision: expect.any(Number),
          recall: expect.any(Number),
          f1: expect.any(Number),
        }),
      })
    );
  });

  // Mirrors the script's exit condition: `report.failed === 0`.
  it('passes every fixture case (no eval regression)', () => {
    const failures = report.cases
      .filter(c => !c.passed)
      .map(c => `${c.category} · ${c.name}: ${c.notes.join('; ')}`);
    expect(failures, `failing cases:\n${failures.join('\n')}`).toEqual([]);
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
    expect(report.passRate).toBe(1);
  });

  // Mirrors the script's exit condition: `report.fabrication.recall === 1`.
  // Recall 1.0 means every fixture that SHOULD raise a fabrication flag did —
  // no fabricated registry/literature/FDA identifier or unsupported quote
  // slipped through undetected.
  it('detects every fabrication (recall === 1.0, no hallucination slips through)', () => {
    expect(report.fabrication.recall).toBe(1);
    expect(report.fabrication.falseNegative).toBe(0);
  });
});
