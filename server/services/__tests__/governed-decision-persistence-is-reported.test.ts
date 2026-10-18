/**
 * A governed decision id, and a decision transition, say whether the ledger
 * actually holds them.
 *
 * What the code used to do (until 2026-10-15):
 * - enqueueLedgerWrite counted and logged a failed insert and resolved anyway,
 *   so recordGovernedDecision returned the decision reference whether or not
 *   its row was written, and recordGovernedDecisionSync — the evaluator's hot
 *   path — handed out a decisionId with no way for a caller to learn that the
 *   queued insert had failed.
 * - recordTransitionEvent swallowed a failed INSERT into a log line, and
 *   transitionGovernedDecision then answered success:true. The review queue and
 *   hasUnresolvedGovernedDecisions read ONLY governed_decision_transitions, so a
 *   transition whose event was not written is invisible to both.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GovernedDocumentEvaluation } from '../../../shared/types/governed-document-fabric';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  getByDecisionCode: vi.fn(),
  getById: vi.fn(),
  transition: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock('../decision-record-service.js', () => ({
  decisionRecordService: {
    create: h.create,
    getByDecisionCode: h.getByDecisionCode,
    getById: h.getById,
    transition: h.transition,
  },
}));
vi.mock('../../db.js', () => ({ pool: { query: h.poolQuery }, db: {} }));
vi.mock('../../db', () => ({ pool: { query: h.poolQuery }, db: {} }));

import {
  recordGovernedDecision,
  recordGovernedDecisionSync,
  recordTransitionEvent,
  transitionGovernedDecision,
} from '../governed-decision-repository';
import * as ledger from '../governed-decision-ledger';

const EVALUATION = {
  context: { organizationId: '7', projectId: '11', artifactId: 'art-1', actorId: '42', intendedAction: 'promote' },
  decision: { outcome: 'allow', rationale: 'ok', blockerCount: 0, warningCount: 0, consequenceCount: 0 },
  readiness: { level: 'review_ready', score: 80, blockers: [], warnings: [] },
  placement: { outcome: 'allowed' },
  exportGate: { outcome: 'eligible' },
  publishGate: { outcome: 'insufficient_context' },
} as unknown as GovernedDocumentEvaluation;

/** What governedDecisionPersisted answers for a reference, or a note that the module has no such answer. */
async function persistedFor(reference: object): Promise<boolean | string> {
  const fn = (ledger as unknown as Record<string, unknown>).governedDecisionPersisted;
  if (typeof fn !== 'function') return 'governed-decision-ledger exposes no governedDecisionPersisted';
  return (fn as (r: object) => Promise<boolean>)(reference);
}

beforeEach(() => {
  h.create.mockReset().mockResolvedValue({ id: 'row-1' });
  h.getByDecisionCode.mockReset().mockResolvedValue({ id: 'row-1', actionState: 'under_review' });
  h.getById.mockReset().mockResolvedValue(null);
  h.transition.mockReset().mockResolvedValue({ id: 'row-1', actionState: 'approved' });
  h.poolQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('a governed decision reports whether its ledger row was written', () => {
  it('recordGovernedDecision answers persisted:false when the insert fails', async () => {
    h.create.mockRejectedValue(new Error('23514 check violation'));
    const recorded = await recordGovernedDecision(EVALUATION);
    expect((recorded as { persisted?: unknown }).persisted).toBe(false);
  });

  it('and persisted:true when the row is written (control)', async () => {
    const recorded = await recordGovernedDecision(EVALUATION);
    expect((recorded as { persisted?: unknown }).persisted).toBe(true);
  });

  it('the hot-path reference can be asked whether its queued insert was written — it was not', async () => {
    h.create.mockRejectedValue(new Error('connection reset'));
    const reference = recordGovernedDecisionSync(EVALUATION);
    expect(await persistedFor(reference)).toBe(false);
  });

  it('the hot-path reference whose insert succeeded answers true (control)', async () => {
    const reference = recordGovernedDecisionSync(EVALUATION);
    expect(await persistedFor(reference)).toBe(true);
  });

  it('a hot-path evaluation the repository refuses (no actor) answers false', async () => {
    const reference = recordGovernedDecisionSync({
      ...EVALUATION,
      context: { ...EVALUATION.context, actorId: '' },
    } as GovernedDocumentEvaluation);
    expect(await persistedFor(reference)).toBe(false);
    expect(h.create).not.toHaveBeenCalled();
  });
});

describe('a decision transition is not reported as done when its event row was not written', () => {
  const INPUT = {
    decisionId: 'dec-1',
    organizationId: 7,
    projectId: 11,
    targetState: 'approved' as const,
    performedBy: '42',
    reason: 'reviewed',
  };

  it('recordTransitionEvent answers persisted:false when its INSERT fails', async () => {
    h.poolQuery.mockRejectedValue(new Error('relation "governed_decision_transitions" does not exist'));
    const event = await recordTransitionEvent({
      decisionId: 'dec-1', organizationId: 7, projectRef: '11',
      fromState: 'under_review', toState: 'approved', action: 'approved', actorId: '42',
    });
    expect((event as { persisted?: unknown }).persisted).toBe(false);
  });

  it('transitionGovernedDecision answers success:false, and says the state moved, when the event write fails', async () => {
    h.poolQuery.mockRejectedValue(new Error('relation "governed_decision_transitions" does not exist'));
    const result = await transitionGovernedDecision(INPUT);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/moved to approved, but its transition event was not written/);
    // The database's words stay in the log, not in an answer a route returns.
    expect(result.error).not.toMatch(/does not exist/);
  });

  it('a transition whose event is written answers success:true (control)', async () => {
    const result = await transitionGovernedDecision(INPUT);
    expect(result.success).toBe(true);
  });
});
