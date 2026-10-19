/**
 * A submission strategy is recommended only from precedents that record one.
 *
 * With no approved precedent matched, recommendStrategy answered "Standard
 * submission approach" at confidence 0.3 with a "6-12 months (standard)"
 * timeline, and an approved precedent that recorded no strategy was counted
 * as 'Standard'. The key-authed public API (/api/v1/trial-design/suggest),
 * AnA's recommend_strategy and the cortex tool served it — the API and the
 * tool after defaulting the submission type to NDA and 510(k). "successRate"
 * was the share of approved precedents using a strategy, printed as
 * "% success rate".
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const query = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
vi.mock('../../db', () => ({ db: {}, pool: { query }, getPool: () => ({ query }), getDb: () => ({}) }));
vi.mock('../../utils/logger', () => ({
  createScopedLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { precedentEngine } from '../precedent-engine';
import { recommendStrategy } from '../ana-ri/command-executor';

const precedent = (over: Record<string, unknown>) => ({
  id: 'p', decisionOutcome: 'CLEARED', strategySummary: null, testingApproach: null, clearanceType: null,
  fdaComments: null, fdaQuestions: [], ...over,
});
const matching = (rows: Record<string, unknown>[]) => vi.spyOn(precedentEngine, 'search').mockResolvedValue(rows as never);

afterEach(() => vi.restoreAllMocks());

describe('recommendStrategy', () => {
  it('recommends nothing when no approved precedent matched', async () => {
    matching([precedent({ decisionOutcome: 'CRL', fdaComments: 'Insufficient data' })]);
    const r = await precedentEngine.recommendStrategy({ submissionType: 'NDA' } as never);
    expect(r).toMatchObject({ basis: 'no-precedents', recommendedStrategy: null, confidence: null, estimatedTimeline: null });
  });

  it('does not count an approved precedent that records no strategy as "Standard"', async () => {
    matching([precedent({}), precedent({ id: 'q' })]);
    const r = await precedentEngine.recommendStrategy({ submissionType: '510(k)' } as never);
    expect(r.basis).toBe('no-precedents');
    expect(JSON.stringify(r)).not.toMatch(/Standard/);
  });

  it("recommends the approved precedents' most-used strategy, and calls the share a share", async () => {
    matching([
      precedent({ id: 'a', clearanceType: 'Traditional' }),
      precedent({ id: 'b', clearanceType: 'Traditional' }),
      precedent({ id: 'c', clearanceType: 'Special' }),
    ]);
    const r = await precedentEngine.recommendStrategy({ submissionType: '510(k)' } as never);
    expect(r).toMatchObject({ basis: 'precedents', recommendedStrategy: 'Traditional', estimatedTimeline: '90-120 days (traditional 510(k))' });
    expect(r.alternativeStrategies).toEqual([expect.objectContaining({ strategy: 'Special', shareOfApprovedPrecedents: 1 / 3 })]);
    expect(JSON.stringify(r)).not.toMatch(/successRate|success rate/);
  });

  it('gives no timeline for a clearance type it has none for', async () => {
    matching([precedent({ strategySummary: 'Bridging study', clearanceType: 'Unlisted' })]);
    expect((await precedentEngine.recommendStrategy({ submissionType: 'NDA' } as never)).estimatedTimeline).toBeNull();
  });
});

describe("AnA's recommend_strategy", () => {
  it('says nothing was recommended, rather than "generated based on regulatory precedent analysis"', async () => {
    matching([]);
    const r = await recommendStrategy({ organizationId: 3, userId: 7 } as never, { submissionType: 'NDA' });
    expect(r.message).toBe('No approved precedent that records a strategy matched, so no strategy is recommended.');
  });
});
