/**
 * WO-16C finding 58 — the readiness engine substituted the constant 50 for two
 * compliance dimensions it never measured.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `computeReadinessAssessment` in server/services/orchestration/readiness-engine.ts
 * returned a bare literal on two early-return guards:
 *
 *     computeComplianceScore:  if (!hasValidations && !hasCmcSignals) return 50; // Unknown = neutral
 *     computeConsistencyScore: if (checks === 0) return 50;                      // No checks applicable
 *
 * Neither branch reads a single payload value — the real computation starts
 * only after each guard. `ReadinessAssessment.scores` then carried no field
 * distinguishing "assessed and scored 50" from "never assessed", so the two
 * constants were indistinguishable from measurements downstream:
 *
 *   - POST /api/orchestration/pre-submission-gate returns the subscores raw
 *     (server/routes/orchestration.ts), and the AnA Command gate modal paints
 *     each as a labelled chip — "compliance 50", "consistency 50" — on a
 *     pre-submission compliance gate with no assessment behind either number.
 *   - The two constants carry 20% and 10% weight, so a project with NO
 *     documents at all scored 15/100 and derived status 'in_progress' rather
 *     than 'not_started'; that 15 is written as `readinessScore` into a
 *     regulatory_audit_logs row flagged `isGxpRelevant: true`.
 *   - The AnA system prompt (server/services/lumen-context-builder.ts) is told
 *     "Compliance: 50%" and instructed to reference it.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * There is no dependency to fail: the defect is a hardcoded constant, so the
 * injection is the FIXTURE. `emptyPayload()` below is a real, well-formed
 * CrossObjectReasoningPayload for a project that has nothing in it — exactly
 * what assembleCrossObjectPayload returns for a project whose documents,
 * validations and CMC tables are empty — and the assertions read what the
 * engine stamped on the way out. Nothing in the module under test is mocked.
 *
 * RED on the pre-fix head: `scores.compliance` was 50, `scores.consistency`
 * was 50, `overallScore` was 15 and `status` was 'in_progress' for a project
 * with nothing in it.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 *  1. An unassessed dimension is `null`, never a number.
 *  2. Every `null` carries a reason, in `unassessedDimensions` — the same
 *     "a third state always states why" rule as server/lib/verification-outcome.ts
 *     and the checksRun/checksNotRun bookkeeping in authoring-actions.
 *  3. `overallScore` is the weighted average over the dimensions that WERE
 *     assessed (weights renormalised), so an empty project is 0/not_started
 *     and an unassessed dimension neither inflates nor deflates the total.
 *  4. A dimension that really was measured still reports its number, and is
 *     absent from `unassessedDimensions`.
 */
import { describe, expect, it } from 'vitest';

import { computeReadinessAssessment } from '../readiness-engine';
import type { CrossObjectReasoningPayload } from '../../../../shared/types/orchestration';

const NOW = new Date().toISOString();

/** A project with nothing in it, shaped exactly as the resolver returns. */
function emptyPayload(): CrossObjectReasoningPayload {
  return {
    project: {
      id: 42,
      name: 'BX-220 IND',
      status: 'active',
      progress: 0,
      totalDocuments: 0,
      totalTasks: 0,
      blockedTasks: 0,
      overdueTasks: 0,
    },
    documents: [],
    artifacts: [],
    validations: [],
    tasks: [],
    moduleMap: [],
    recentActions: [],
    evidence: [],
    cmcSignals: {
      sourceObjectCount: 0,
      sourceTypeBreakdown: {},
      sectionCount: 0,
      staleSectionCount: 0,
      contradictions: [],
      contradictionCounts: { critical: 0, high: 0, medium: 0, low: 0, open: 0, resolved: 0 },
    },
    assembledAt: NOW,
    lastSignalAt: null,
    scope: { organizationId: 9, projectId: 42 },
  };
}

describe('readiness engine — a dimension nothing measured is null, not 50', () => {
  it('reports compliance and consistency as unassessed for an empty project', () => {
    const a = computeReadinessAssessment(emptyPayload());

    expect(a.scores.compliance).toBeNull();
    expect(a.scores.consistency).toBeNull();

    const unassessed = a.unassessedDimensions.map((u) => u.dimension).sort();
    expect(unassessed).toEqual(['compliance', 'consistency']);
    for (const u of a.unassessedDimensions) {
      expect(typeof u.reason).toBe('string');
      expect(u.reason.length).toBeGreaterThan(0);
    }
  });

  it('scores an empty project 0 / not_started rather than 15 / in_progress', () => {
    const a = computeReadinessAssessment(emptyPayload());

    expect(a.overallScore).toBe(0);
    expect(a.status).toBe('not_started');
  });

  it('renormalises the weights over the assessed dimensions only', () => {
    // Three draft documents in Module 1, none routed, none validated, no CMC.
    // completeness = 100*0.6 + (3/15*100)*0.4 = 68 ; quality = 0 ; routing = 0.
    // compliance and consistency are unassessed, so the total is taken over the
    // 0.30 + 0.25 + 0.15 of weight that was: round(68*0.30 / 0.70) = 29.
    // The pre-fix engine answered 35 — 20.4 + (50*0.20) + (50*0.10).
    const p = emptyPayload();
    p.moduleMap = [
      {
        module: 'Module 1',
        documentCount: 3,
        artifactCount: 0,
        completenessPercent: 100,
        hasValidation: false,
        missingItems: [],
      },
    ];
    p.documents = [1, 2, 3].map((id) => ({
      id,
      title: `Draft ${id}`,
      type: 'protocol',
      status: 'draft',
      module: 'Module 1',
      hasValidation: false,
      isRouted: false,
    }));

    const a = computeReadinessAssessment(p);

    expect(a.scores.completeness).toBe(68);
    expect(a.scores.quality).toBe(0);
    expect(a.scores.routing).toBe(0);
    expect(a.scores.compliance).toBeNull();
    expect(a.scores.consistency).toBeNull();
    expect(a.overallScore).toBe(29);
  });

  it('still reports a number for a dimension that really was measured', () => {
    const p = emptyPayload();
    p.moduleMap = [
      {
        module: 'Module 1',
        documentCount: 1,
        artifactCount: 0,
        completenessPercent: 100,
        hasValidation: true,
        missingItems: [],
      },
    ];
    p.documents = [
      {
        id: 11,
        title: 'Cover letter',
        type: 'cover_letter',
        status: 'approved',
        module: 'Module 1',
        hasValidation: true,
        isRouted: true,
        lastModified: NOW,
      },
    ];
    p.validations = [
      {
        documentId: 11,
        documentTitle: 'Cover letter',
        isValid: true,
        complianceScore: 92,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 1,
        validatedAt: NOW,
        findings: [],
      },
    ];

    const a = computeReadinessAssessment(p);

    // compliance: a real validation exists, so the guard does not fire
    expect(a.scores.compliance).toBe(100);
    // consistency: one routed document, and it is validated
    expect(a.scores.consistency).toBe(100);
    expect(a.unassessedDimensions).toEqual([]);
  });

  it('marks only the dimension that was not assessed', () => {
    // A routed, validated document makes consistency measurable and compliance
    // measurable too — remove the validation and both go unassessed together,
    // so the discriminating case is CMC-only: a CMC signal with no validations
    // assesses compliance, while nothing routed or promoted leaves consistency
    // unassessed.
    const p = emptyPayload();
    p.cmcSignals.sourceObjectCount = 4;
    p.cmcSignals.staleSectionCount = 1;

    const a = computeReadinessAssessment(p);

    expect(typeof a.scores.compliance).toBe('number');
    expect(a.scores.consistency).toBeNull();
    expect(a.unassessedDimensions.map((u) => u.dimension)).toEqual(['consistency']);
  });
});
