/**
 * Governed Decision Stack — what the reads say when the database cannot answer.
 *
 * This file used to assert the opposite: that every read FULFILLED with a
 * database it could not reach, as an empty list, a zeroed summary, an empty
 * review queue, or "no unresolved decisions". That swallow is how an outage
 * read as "this project has nothing unresolved" to the two gates built on
 * hasUnresolvedGovernedDecisions: the CMC final export gate, and governed AnA
 * execution (ledger L186).
 *
 * A read that could not run now rejects. Both gates already treat a rejection
 * as blocking: final-export-gate.ts refuses the export and says the evaluation
 * did not happen, and executeGovernedAnaOperation does not mutate. The HTTP
 * routes answer 500. The positive controls below show the reads still report
 * what a database that answers holds.
 *
 * The database is mocked at both doors the repository uses: the decision record
 * service, and the pool for the transition log. `../db.js` has a compiled twin
 * beside `db.ts`, so both specifiers are mocked, whichever one resolves.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { database, answer } = vi.hoisted(() => {
  const database = {
    up: true,
    searchRows: [] as unknown[],
    byId: null as unknown,
    queryRows: [] as unknown[],
  };
  /** What the database gives back: `value`, or a rejection while it is down. */
  const answer = <T>(value: () => T) =>
    database.up ? Promise.resolve(value()) : Promise.reject(new Error('database unavailable'));
  return { database, answer };
});

vi.mock('../server/services/decision-record-service', () => ({
  decisionRecordService: {
    search: () => answer(() => database.searchRows),
    getById: () => answer(() => database.byId),
  },
}));
vi.mock('../server/db.js', () => ({ pool: { query: () => answer(() => ({ rows: database.queryRows })) }, db: {} }));
vi.mock('../server/db', () => ({ pool: { query: () => answer(() => ({ rows: database.queryRows })) }, db: {} }));

import {
  getRecentGovernedDecisions,
  getGovernedDecisionSummary,
  getArtifactDecisionTrace,
  getGovernedDecision,
  getDecisionTimeline,
  getProjectReviewQueue,
  hasUnresolvedGovernedDecisions,
  recordTransitionEvent,
  isValidTransition,
  GOVERNED_DECISION_REPOSITORY_VERSION,
} from '../server/services/governed-decision-repository';

beforeEach(() => {
  database.up = true;
  database.searchRows = [];
  database.byId = null;
  database.queryRows = [];
});

describe('Governed decision reads: a database that cannot answer is an error, never an empty result (L186)', () => {
  beforeEach(() => {
    database.up = false;
  });

  it('getRecentGovernedDecisions rejects rather than answering "no decisions"', async () => {
    await expect(
      getRecentGovernedDecisions({ organizationId: '7', projectId: '11', limit: 10 })
    ).rejects.toThrow('database unavailable');
  });

  it('getGovernedDecisionSummary rejects rather than answering a zeroed summary', async () => {
    await expect(getGovernedDecisionSummary({ organizationId: '7', projectId: '11' })).rejects.toThrow(
      'database unavailable'
    );
  });

  it('getArtifactDecisionTrace rejects rather than answering an empty trace', async () => {
    await expect(getArtifactDecisionTrace('11', 'doc-1', 7)).rejects.toThrow('database unavailable');
  });

  it('getGovernedDecision rejects rather than answering "not found"', async () => {
    await expect(getGovernedDecision('d-1', 7)).rejects.toThrow('database unavailable');
  });

  it('getDecisionTimeline rejects rather than answering an empty history', async () => {
    await expect(getDecisionTimeline('d-1', 7)).rejects.toThrow('database unavailable');
  });

  it('getProjectReviewQueue rejects rather than answering empty queues', async () => {
    await expect(getProjectReviewQueue(11, 7)).rejects.toThrow('database unavailable');
  });

  it('hasUnresolvedGovernedDecisions rejects rather than answering "nothing unresolved" — the gate case', async () => {
    await expect(hasUnresolvedGovernedDecisions(11, 7)).rejects.toThrow('database unavailable');
  });
});

describe('Governed decision reads: a database that answers is reported as it is', () => {
  it('no decisions is an empty list and a zeroed summary', async () => {
    expect(await getRecentGovernedDecisions({ organizationId: '7', projectId: '11' })).toEqual([]);
    const summary = await getGovernedDecisionSummary({ organizationId: '7', projectId: '11' });
    expect(summary.total).toBe(0);
    expect(summary.byOutcome).toHaveProperty('allow');
  });

  it('a decision that does not exist is null', async () => {
    expect(await getGovernedDecision('d-1', 7)).toBeNull();
  });

  it('decisions under review or escalated are unresolved, and counted', async () => {
    database.queryRows = [
      { decision_id: 'd-1', to_state: 'under_review' },
      { decision_id: 'd-2', to_state: 'escalated' },
      { decision_id: 'd-3', to_state: 'deferred' },
    ];
    expect(await hasUnresolvedGovernedDecisions(11, 7)).toEqual({
      hasUnresolved: true,
      unresolvedCount: 2,
      escalatedCount: 1,
      states: { under_review: 1, escalated: 1, deferred: 1, rejected: 0 },
    });
  });

  it('a review queue the database reports empty is nothing unresolved', async () => {
    expect((await hasUnresolvedGovernedDecisions(11, 7)).hasUnresolved).toBe(false);
  });

  it('repository version is 2.0.0', () => {
    expect(GOVERNED_DECISION_REPOSITORY_VERSION).toBe('2.0.0');
  });

  it('isValidTransition is pure logic — no DB dependency', () => {
    expect(isValidTransition('recommended_only', 'under_review')).toBe(true);
    expect(isValidTransition('superseded', 'approved')).toBe(false);
    expect(isValidTransition('approved', 'executed')).toBe(true);
    expect(isValidTransition('executed', 'approved')).toBe(false);
  });

  it('recordTransitionEvent returns a complete event structure', async () => {
    const event = await recordTransitionEvent({
      decisionId: 'test-decision-integration',
      organizationId: 999999,
      projectId: 999999,
      fromState: 'recommended_only',
      toState: 'under_review',
      action: 'review',
      actorId: 'test-actor',
      reason: 'Integration test',
    });

    expect(event.id).toBeTruthy();
    expect(event.id.length).toBeGreaterThan(10); // UUID format
    expect(event.decisionId).toBe('test-decision-integration');
    expect(event.fromState).toBe('recommended_only');
    expect(event.toState).toBe('under_review');
    expect(event.actorId).toBe('test-actor');
    expect(event.reason).toBe('Integration test');
    expect(event.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
  });
});
