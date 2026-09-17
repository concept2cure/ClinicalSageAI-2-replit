/**
 * WO-16C finding 124 — the orchestration recommendation engine stamps every
 * recommendation with a confidence percentage nothing computed.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * All eight analyzers in server/services/orchestration/recommendation-engine.ts
 * are deterministic filters over real project state — a document with no
 * validation row, an unrouted document, a `lastModified` older than the stale
 * threshold, a task with `isBlocked` / `isOverdue`, a validation row with
 * critical/major counts. Each one nevertheless passed a per-rule literal
 * (0.95, 0.9, 0.85, 0.8, 0.7) into `makeRecommendation`, which assigned it
 * verbatim, and `deriveNextBestAction` copied the top rule's literal. No
 * payload field, count, score or threshold distance influenced the number.
 *
 * That constant then did two things a computed score is allowed to do and a
 * constant is not: it was the intra-severity tie-break sort key, so an overdue
 * task always outranked an equally severe blocked high-priority task on no
 * stated basis; and POST /api/orchestration/recommendations returned it to
 * client/src/concept2cure/v2/surfaces/AnaCommand.tsx, which painted it as an
 * unlabeled "95%" chip on every card of the AnA Command "Next best actions"
 * column — no label, no tooltip, no legend telling the reader it is a literal.
 *
 * ── How the failure is injected ──────────────────────────────────────────────
 * There is no dependency to fail: the defect is a hardcoded constant, so the
 * injection is the FIXTURE. `PAYLOAD` below is a hand-built
 * CrossObjectReasoningPayload that trips seven of the eight analyzers plus the
 * next-best-action rule, and the assertions read what the engine stamped on the
 * way out. On the pre-fix engine the first assertion reported
 * `expected 0.95 to be null` for the unvalidated-content rule, and the ordering
 * assertion reported the confidence-sorted order.
 *
 * ── What is pinned ───────────────────────────────────────────────────────────
 *  1. Every recommendation carries `confidence: null` and
 *     `sourceType: 'rules_based'` — the vocabulary the sibling engine already
 *     documents (server/services/intelligence/recommendation-engine.ts:39,
 *     "0-100, null for rules_based").
 *  2. No numeric confidence survives anywhere in the serialized set, so nothing
 *     downstream can render a percentage.
 *  3. Ordering inside one severity band follows the engine's declared rule
 *     precedence, not a score.
 */
import { describe, expect, it } from 'vitest';

import { generateRecommendations } from '../recommendation-engine';
import type { CrossObjectReasoningPayload } from '../../../../shared/types/orchestration';

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * One project whose real state trips, in analyzer order:
 *   unvalidated_content  — doc 101 is in review and has no validation row
 *   unrouted_document    — doc 103 is approved and unrouted
 *   stale_content        — doc 103 was last touched 200 days ago
 *   validation_failure   — validation on doc 104 has 2 critical findings
 *   readiness_gap        — Module 1 holds 1 of the 3 expected documents
 *   blocked_workflow     — task 201 is blocked at high priority
 *   overdue_task         — task 202 is past its due date
 *   weak_content         — validation on doc 103 scores 40 with no criticals
 * plus the derived next_best_action.
 */
const PAYLOAD: CrossObjectReasoningPayload = {
  project: {
    id: 7,
    name: 'BX-114 IND',
    status: 'active',
    progress: 42,
    totalDocuments: 3,
    totalTasks: 2,
    blockedTasks: 1,
    overdueTasks: 1,
  },
  documents: [
    {
      id: 101,
      title: 'Investigator Brochure §4',
      type: 'ib',
      status: 'in_review',
      module: 'Module 1',
      lastModified: daysAgo(2),
      hasValidation: false,
      isRouted: true,
    },
    {
      id: 103,
      title: 'Legacy Protocol v1',
      type: 'protocol',
      status: 'approved',
      lastModified: daysAgo(200),
      hasValidation: true,
      isRouted: false,
    },
  ],
  artifacts: [],
  validations: [
    {
      documentId: 104,
      documentTitle: 'CMC Overview',
      isValid: false,
      complianceScore: 30,
      criticalCount: 2,
      majorCount: 1,
      minorCount: 0,
      validatedAt: daysAgo(1),
      findings: [],
    },
    {
      documentId: 103,
      documentTitle: 'Legacy Protocol v1',
      isValid: false,
      complianceScore: 40,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 4,
      validatedAt: daysAgo(1),
      findings: [],
    },
  ],
  tasks: [
    {
      id: 201,
      title: 'Resolve CMC query',
      status: 'blocked',
      priority: 'high',
      isBlocked: true,
      isOverdue: false,
    },
    {
      id: 202,
      title: 'Submit annual report',
      status: 'open',
      priority: 'medium',
      dueDate: daysAgo(10),
      isBlocked: false,
      isOverdue: true,
    },
  ],
  moduleMap: [
    {
      module: 'Module 1',
      documentCount: 1,
      artifactCount: 0,
      completenessPercent: 20,
      hasValidation: false,
      missingItems: ['Cover letter'],
    },
  ],
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
  assembledAt: new Date(NOW).toISOString(),
  lastSignalAt: null,
  scope: { organizationId: 3, projectId: 7 },
};

describe('orchestration recommendation engine — no fabricated confidence', () => {
  it('trips the analyzers this fixture is built for', () => {
    const set = generateRecommendations(PAYLOAD);
    const types = new Set(set.recommendations.map((r) => r.recommendationType));
    for (const t of [
      'unvalidated_content',
      'unrouted_document',
      'stale_content',
      'validation_failure',
      'readiness_gap',
      'blocked_workflow',
      'overdue_task',
      'weak_content',
      'next_best_action',
    ]) {
      expect(types.has(t as never), `expected fixture to produce ${t}`).toBe(true);
    }
  });

  it('reports every rules-based recommendation as rules_based with no confidence', () => {
    const set = generateRecommendations(PAYLOAD);
    expect(set.recommendations.length).toBeGreaterThan(0);

    for (const r of set.recommendations) {
      expect(r.sourceType, `${r.recommendationType} sourceType`).toBe('rules_based');
      expect(r.confidence, `${r.recommendationType} confidence`).toBeNull();
    }
  });

  it('lets no numeric confidence reach the wire', () => {
    const set = generateRecommendations(PAYLOAD);
    const onWire = JSON.parse(JSON.stringify(set)) as {
      recommendations: Array<Record<string, unknown>>;
    };
    const numeric = onWire.recommendations.filter((r) => typeof r.confidence === 'number');
    expect(numeric).toEqual([]);
  });

  it('orders one severity band by the declared rule precedence, not by a score', () => {
    const set = generateRecommendations(PAYLOAD);
    const high = set.recommendations
      .filter((r) => r.severity === 'high')
      .map((r) => r.recommendationType);

    // Precedence, declared in the engine: how blocking the item is for a
    // submission. next_best_action restates whichever recommendation is already
    // top of the list, so it sits last in its band.
    expect(high).toEqual([
      'unvalidated_content',
      'readiness_gap',
      'overdue_task',
      'blocked_workflow',
      'weak_content',
      'next_best_action',
    ]);
  });

  it('is deterministic across runs', () => {
    const a = generateRecommendations(PAYLOAD).recommendations.map((r) => [
      r.severity,
      r.recommendationType,
      r.targetObjectId,
    ]);
    const b = generateRecommendations(PAYLOAD).recommendations.map((r) => [
      r.severity,
      r.recommendationType,
      r.targetObjectId,
    ]);
    expect(a).toEqual(b);
  });
});
