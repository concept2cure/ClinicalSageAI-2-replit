/**
 * A governed-fabric decision row records what its evaluation stated and who
 * asked for it — nothing filled in.
 *
 * What the code used to do (until 2026-10-15):
 * - recordGovernedDecision wrote decision_records.confidence_level as a bucket
 *   of the READINESS score (>= 75 'high', >= 40 'moderate', else 'low'). A gate
 *   evaluation states no confidence, and the governance boundary's
 *   minimumConfidence gate reads that column — so a completeness figure was
 *   rating a decision's confidence.
 * - An evaluation with no actor was recorded as decided by 'system'
 *   (`decidedBy: actorId || 'system'`), and a row read back with no decided_by
 *   was reported as acted on by 'system'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GovernedDocumentEvaluation } from '../../../shared/types/governed-document-fabric';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  search: vi.fn(),
}));

vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: { create: h.create, search: h.search },
}));

import { recordGovernedDecision, getRecentGovernedDecisions } from '../governed-decision-repository';

function evaluation(over: { actorId?: string; score?: number } = {}): GovernedDocumentEvaluation {
  return {
    context: {
      organizationId: '7',
      projectId: '11',
      artifactId: 'art-1',
      actorId: 'actorId' in over ? over.actorId : '42',
      intendedAction: 'promote',
      ctdSection: 'm2.5',
    },
    decision: { outcome: 'allow', rationale: 'All gates clear.', blockerCount: 0, warningCount: 0, consequenceCount: 0 },
    readiness: { level: 'review_ready', score: over.score ?? 90, blockers: [], warnings: [] },
    placement: { outcome: 'allowed' },
    exportGate: { outcome: 'eligible' },
    publishGate: { outcome: 'insufficient_context' },
  } as unknown as GovernedDocumentEvaluation;
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({ id: 'row-1' });
  h.search.mockReset();
});

describe('confidence: a gate evaluation states none, so none is recorded (finding 13)', () => {
  it.each([90, 50, 10])('records no confidence for an evaluation whose readiness score is %i', async (score) => {
    await recordGovernedDecision(evaluation({ score }));
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].confidenceLevel ?? null).toBeNull();
  });
});

describe('actor: an evaluation that names no one is refused, not filed as "system" (finding 27)', () => {
  it.each(['', '   ', 'undefined', 'null', '0'])('refuses actorId %j and writes nothing', async (actorId) => {
    await expect(recordGovernedDecision(evaluation({ actorId }))).rejects.toThrow(/names no actor/);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('records the actor the evaluation names (control)', async () => {
    const recorded = await recordGovernedDecision(evaluation({ actorId: '42' }));
    expect(h.create.mock.calls[0][0].decidedBy).toBe('42');
    expect(recorded.actorId).toBe('42');
  });

  it('reads a row that records no decider back with no actor, not "system"', async () => {
    h.search.mockResolvedValue([
      {
        id: 'row-1',
        organizationId: 7,
        projectId: 11,
        decidedBy: null,
        recommendationSummary: 'x',
        createdAt: '2026-10-15T00:00:00.000Z',
        notes: '{}',
        decisionContext: { governedDecisionId: 'dec-1', kind: 'governed-fabric-decision' },
      },
    ]);
    const [record] = await getRecentGovernedDecisions({ organizationId: '7', projectId: '11' });
    expect(record.actorId).toBeNull();
  });
});
