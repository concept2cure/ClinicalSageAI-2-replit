/**
 * A recognized filing type with no artifact matrix reports the artifact half as
 * UNASSESSED — not as complete.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * readinessEvaluator.fallback.test.ts (beside this one) already pins the case
 * where the registry id cannot be RESOLVED. This is the same failure one branch
 * over, and it is by far the bigger one: the id resolves, so the fallback never
 * runs, but no artifact matrix is defined for it.
 *
 * `getMandatoryArtifacts` returns `[]` in that case, and the evaluator's
 * `completionPercent: required.length > 0 ? … : 100` turned an empty requirement
 * list into "100% of required artifacts present". `identifyGaps` then iterated
 * the same empty array and produced nothing, so the result read
 * "100% complete, zero gaps" — and the Report-OS orchestrator only raises
 * blockers `if (readiness.gaps.length > 0)`.
 *
 * The scale is the point. There are 9 artifact matrices against 234 entries in
 * GLOBAL_REGISTRY, so this was the behaviour for 225 filing types — ANDA,
 * 505(b)(2), NDA and BLA supplements, DMF, ASMF, EUA among them — not for an
 * exotic edge case. The first test below asserts that ratio directly, so if
 * someone adds matrices the count moves and this file has to be revisited
 * deliberately rather than quietly passing on a changed premise.
 */
import { describe, it, expect } from 'vitest';
import { evaluateReadiness, type ReadinessInput } from '../readinessEvaluator';
import { hasArtifactMatrix } from '../requiredArtifactMatrix';
import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry';

/** A real, common filing that resolves in the registry and has no matrix. */
const UNMODELLED = 'US_ANDA';

const input: ReadinessInput = {
  registryIdOrLegacy: UNMODELLED,
  sections: [
    { code: 'm1', title: 'Module 1', status: 'approved', artifactCount: 1 },
    { code: 'm2', title: 'Module 2', status: 'approved', artifactCount: 1 },
  ],
  artifacts: [{ type: 'cover_letter', status: 'approved' }],
};

describe('the premise this test rests on', () => {
  it('US_ANDA resolves in the registry but has no artifact matrix', () => {
    expect(GLOBAL_REGISTRY.some(e => e.id === UNMODELLED)).toBe(true);
    expect(hasArtifactMatrix(UNMODELLED)).toBe(false);
  });

  it('most of the registry has no artifact matrix, so this is the common path', () => {
    const withMatrix = GLOBAL_REGISTRY.filter(e => hasArtifactMatrix(e.id)).length;
    // 9 of 234 at the time of writing. If this moves, the blast radius of the
    // defect moved too — re-read this file rather than adjusting the number.
    expect(withMatrix).toBeLessThan(GLOBAL_REGISTRY.length / 2);
    expect(GLOBAL_REGISTRY.length).toBeGreaterThan(100);
  });
});

describe('readinessEvaluator — unmodelled artifact requirements', () => {
  it('does NOT report 100% artifact completeness', () => {
    const result = evaluateReadiness(input);
    // The pre-fix behaviour, exactly: required 0 and completionPercent 100.
    expect(result.artifactReadiness.completionPercent).not.toBe(100);
  });

  it('marks the artifact half as not assessed', () => {
    const result = evaluateReadiness(input);
    // A consumer rendering this must be able to tell "nothing required" from
    // "nothing checked". Without the flag those are the same object.
    expect(result.artifactReadiness.assessed).toBe(false);
  });

  it('raises a critical gap naming the cause', () => {
    const result = evaluateReadiness(input);
    const critical = result.gaps.filter(g => g.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.map(g => g.code)).toContain('ARTIFACT_REQUIREMENTS_NOT_MODELLED');
    // The message has to say which filing, or it is not actionable.
    expect(JSON.stringify(result.gaps)).toContain(UNMODELLED);
  });

  it('does not fold a fabricated artifact figure into the overall score', () => {
    const result = evaluateReadiness(input);
    // Sections are fully approved. Under the old weighting that plus a
    // fabricated artifact 100 produced 100. The score must now be the section
    // figure alone — neither inflated by a 100 nor deflated by a 0 the
    // evaluator has no basis for.
    expect(result.score).toBe(result.sectionReadiness.completionPercent);
  });
});

describe('readinessEvaluator — modelled artifact requirements still score normally', () => {
  it('US_IND is assessed, and a missing required artifact still counts against it', () => {
    const result = evaluateReadiness({
      registryIdOrLegacy: 'US_IND',
      sections: [{ code: 'm1', title: 'Module 1', status: 'approved', artifactCount: 1 }],
      artifacts: [],
    });
    // Guards against "fix" by suppression: the assessed path must keep working.
    expect(hasArtifactMatrix('US_IND')).toBe(true);
    expect(result.artifactReadiness.assessed).not.toBe(false);
    expect(result.artifactReadiness.required).toBeGreaterThan(0);
    expect(result.artifactReadiness.completionPercent).toBe(0);
    expect(result.artifactReadiness.missing.length).toBeGreaterThan(0);
  });
});
