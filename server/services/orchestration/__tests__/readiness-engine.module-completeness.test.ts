/**
 * Module completeness was a figure with no denominator.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `resolveModulePlacements` in cross-object-resolver.ts computed
 *
 *     completenessPercent: items.length > 0 ? Math.min(100, items.length * 20) : 0,
 *     hasValidation: false,
 *     missingItems: items.length === 0 ? [`No documents assigned to ${mod}`] : [],
 *
 * so FIVE documents of any kind read as "100% complete" with nothing missing —
 * for a Module 3 that needs the whole 3.2.S / 3.2.P / 3.2.A tree. Executed
 * against the live database for a real project: Module 3 returned
 * completenessPercent 100, status "ready", missingItems [], validatedCount 0,
 * from 21 rows.
 *
 * That figure is not decorative. It is 30% of each module's score and the whole
 * of the completeness subscore in readiness-engine.ts, it is rendered under the
 * caption "Deterministic gate computed by the readiness engine", and it is
 * pushed into AnA's system prompt with an instruction to reference it. A
 * fabricated number dressed as a deterministic one is the specific thing the
 * repository's rules forbid.
 *
 * A second invented denominator sat beside it in computeCompletenessScore:
 *
 *     const docFactor = Math.min(100, (docCount / 15) * 100); // 15 docs = 100%
 *
 * ── The fix these tests hold ─────────────────────────────────────────────────
 * Module 3 is measured against the section set composeModule3FromCanonicalSources
 * produces — the same set the export gate enforces, so the dashboard and the
 * gate cannot disagree. Every other module has no required-section list, so its
 * completeness is NULL: not assessed. Null must never be averaged, scored or
 * rendered as zero.
 *
 * @module server/services/orchestration/__tests__/readiness-engine.module-completeness
 */

import { describe, expect, it } from 'vitest';
import { computeReadinessAssessment } from '../readiness-engine';
import type { CrossObjectReasoningPayload, ModulePlacementSnapshot } from '../../../../shared/types/orchestration';

const NOW = '2026-09-28T00:00:00.000Z';

function payloadWithModules(moduleMap: ModulePlacementSnapshot[]): CrossObjectReasoningPayload {
  return {
    project: {
      id: 42, name: 'BX-220 IND', status: 'active', progress: 0,
      totalDocuments: 0, totalTasks: 0, doneTasks: 0, blockedTasks: 0, overdueTasks: 0, taskCountsPartial: false,
    },
    documents: [], artifacts: [], validations: [], tasks: [],
    moduleMap, recentActions: [], evidence: [],
    cmcSignals: {
      sourceObjectCount: 0, sourceTypeBreakdown: {}, sectionCount: 0, staleSectionCount: 0,
      contradictions: [],
      contradictionCounts: { critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0 },
    },
    assembledAt: NOW, lastSignalAt: null,
    scope: { organizationId: 9, projectId: 42 },
  } as CrossObjectReasoningPayload;
}

function mod(module: string, completenessPercent: number | null, documentCount = 5): ModulePlacementSnapshot {
  return {
    module, documentCount, artifactCount: documentCount,
    completenessPercent, hasValidation: false, missingItems: [],
  };
}

describe('an unassessed module is not a zero-percent module', () => {
  it('scores completeness over the measured modules only', () => {
    /* Module 3 measured at 100; four modules with no required-section list.
       Averaging the nulls in as zero would give 20 — an invention in the other
       direction, and just as wrong. */
    const assessment = computeReadinessAssessment(
      payloadWithModules([
        mod('Module 3', 100),
        mod('Module 1', null), mod('Module 2', null),
        mod('Module 4', null), mod('Module 5', null),
      ]),
    );
    expect(assessment.scores.completeness).toBe(100);
  });

  it('gives no completeness score at all when nothing was measured', () => {
    const assessment = computeReadinessAssessment(
      payloadWithModules([mod('Module 1', null), mod('Module 3', null)]),
    );
    expect(assessment.scores.completeness).toBe(0);
  });

  it('does not let an unmeasured module contribute a completeness term to its own score', () => {
    /* Two modules identical but for the completeness field. The unassessed one
       must not score HIGHER than the one measured at zero, and must not score
       as though it had been measured at 100. */
    const measuredZero = computeReadinessAssessment(payloadWithModules([mod('Module 3', 0)]));
    const unassessed = computeReadinessAssessment(payloadWithModules([mod('Module 3', null)]));
    expect(unassessed.scores.completeness).toBe(measuredZero.scores.completeness);
  });

  it('is not fooled by document count alone', () => {
    /* The old formula: five documents -> 100%. The denominator is the section
       set now, so document count moves nothing on its own. */
    const five = computeReadinessAssessment(payloadWithModules([mod('Module 3', null, 5)]));
    const fifty = computeReadinessAssessment(payloadWithModules([mod('Module 3', null, 50)]));
    expect(five.scores.completeness).toBe(fifty.scores.completeness);
  });
});
