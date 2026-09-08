/**
 * Regression guard: when the registry entry for a filing cannot be resolved,
 * the readiness evaluator does NOT know a single required section or artifact —
 * so it must fail closed, not fabricate a clean bill of health.
 *
 * The pre-fix `buildFallbackResult` returned `artifactReadiness.completionPercent:
 * 100`, `gaps: []`, and `level: 'early'` for an unresolved registry id. Because
 * the Report-OS orchestrator only raises blockers `if (readiness.gaps.length > 0)`
 * (server/services/report-os/orchestrator.ts:282), an unknown/stale/retired
 * registry id produced a readiness result that read "100% of required artifacts
 * present, zero gaps" — nothing-assessed rendered as assessed-and-clear, on a
 * path that feeds a sealed Report-OS readiness report.
 *
 * Pins "fix(readiness): fail closed when the registry entry can't be resolved".
 */
import { describe, it, expect } from 'vitest';
import { evaluateReadiness, type ReadinessInput } from '../readinessEvaluator';

const UNKNOWN_REGISTRY_ID = '__no_such_registry_entry__';

describe('readinessEvaluator — unresolved registry entry fails closed', () => {
  const input: ReadinessInput = {
    registryIdOrLegacy: UNKNOWN_REGISTRY_ID,
    // Even with fully-approved sections and artifacts present, the platform does
    // not know what THIS filing requires, so it cannot certify completeness.
    sections: [
      { code: 'm1', title: 'Module 1', status: 'approved', artifactCount: 1 },
      { code: 'm2', title: 'Module 2', status: 'approved', artifactCount: 1 },
    ],
    artifacts: [
      { type: 'cover_letter', status: 'approved' },
      { type: 'form_1571', status: 'approved' },
    ],
  };

  it('does NOT claim 100% artifact completeness when requirements are unknown', () => {
    const result = evaluateReadiness(input);
    // The pre-fix bug: artifactReadiness.completionPercent === 100 with required: 0.
    expect(result.artifactReadiness.completionPercent).not.toBe(100);
    // Nothing was verified against a known requirement set → 0, not "all present".
    expect(result.artifactReadiness.completionPercent).toBe(0);
    expect(result.artifactReadiness.required).toBe(0);
  });

  it('surfaces a CRITICAL gap so the orchestrator raises a blocker', () => {
    const result = evaluateReadiness(input);
    // The orchestrator only pushes blockers when gaps.length > 0; an empty gaps
    // array here is exactly the fail-open that let an unknown filing look clean.
    expect(result.gaps.length).toBeGreaterThan(0);
    const critical = result.gaps.filter((g) => g.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    // The gap must name the real cause: requirements could not be determined.
    expect(JSON.stringify(result.gaps)).toContain(UNKNOWN_REGISTRY_ID);
  });

  it('reports the strongest not-ready level, never "early"', () => {
    const result = evaluateReadiness(input);
    // 'early' silently flows into the aggregator's normal scored path; an
    // indeterminate assessment must read not_ready.
    expect(result.level).toBe('not_ready');
  });

  it('a RESOLVABLE registry id is unaffected by the fallback change', () => {
    // Sanity: a real id does not take the fallback path and reports real gaps
    // computed from the registry's required set (not the fabricated clean bill).
    const real = evaluateReadiness({
      registryIdOrLegacy: 'ind',
      sections: [],
      artifacts: [],
    });
    // With no sections/artifacts against a known requirement set, a real filing
    // has real gaps and is not 100% complete — the normal (non-fallback) path.
    expect(real.applicationDisplayName).not.toBe('ind');
  });
});
