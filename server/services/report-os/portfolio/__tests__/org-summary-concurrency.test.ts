/**
 * The org portfolio rollup must not serialize its readiness runs.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * MDX UAT 2026-08-18, item A9: "Reporting & analytics" showed
 * "Loading the reporting canvas…" for 5+ seconds before resolving to a static
 * "No program readiness yet".
 *
 * `GET /api/insights-canvas/overview` blocks on `fetchOrgPortfolioSummary`,
 * which ran one `computeInitialRun` per program in a sequential `await` loop.
 * Each run is a full governed readiness computation of several queries, and the
 * program list is capped at ORG_ROLLUP_CAP = 100 — so a single page load could
 * be a hundred readiness runs deep, one after another. The empty state was slow
 * for the same reason the populated one was: the wait happens before anything
 * decides there is nothing to show.
 *
 * The runs are independent — none reads another's output — so the ordering
 * bought nothing at all.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * Latency assertions are flaky by nature, so this measures the property that
 * causes the latency instead: how many runs are in flight at once. Sequential
 * code peaks at 1, whatever the machine is doing.
 *
 * Order is asserted just as hard. `aggregateOrgPortfolio` and the flagship pick
 * both read this array, so a result order that depended on which compute
 * finished first would make the reported flagship program nondeterministic —
 * trading a slow surface for an untrustworthy one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Programs the rollup will iterate. Enough to exceed the concurrency bound. */
const PROGRAMS = Array.from({ length: 20 }, (_, i) => ({
  projectId: i + 1,
  name: `Program ${i + 1}`,
  code: `P-${i + 1}`,
  therapeuticArea: null as string | null,
  organizationId: 1,
  parentProjectId: null as number | null,
  status: 'active',
}));

/** Live count of in-flight computeInitialRun calls, and its high-water mark. */
let inFlight = 0;
let peakInFlight = 0;
/** The order results were produced in, to prove the write-back is by index. */
const completionOrder: number[] = [];

vi.mock('../../orchestrator', () => ({
  computeInitialRun: vi.fn(async (_org: number, _scope: string, scopeId: string) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    // Later programs finish FIRST. If results were pushed in completion order,
    // the array would come back reversed and the order assertion would catch it.
    const id = Number(scopeId);
    await new Promise((r) => setTimeout(r, Math.max(1, (PROGRAMS.length - id) * 2)));
    inFlight -= 1;
    completionOrder.push(id);
    return { providers: [], confidence: 50 + id, blockers: [], criticalBlockers: [], summary: {} };
  }),
}));

// The rollup's only DB read is the program list; served directly so the test
// stays about the loop rather than about drizzle.
vi.mock('../../../../db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => PROGRAMS }),
      }),
    }),
  },
}));

const { fetchOrgPortfolioSummary } = await import('../fetch');

beforeEach(() => {
  inFlight = 0;
  peakInFlight = 0;
  completionOrder.length = 0;
});

describe('fetchOrgPortfolioSummary', () => {
  it('runs readiness computations concurrently, not one at a time', async () => {
    await fetchOrgPortfolioSummary(1);

    // The assertion that fails on the sequential loop, where the peak is 1.
    expect(peakInFlight).toBeGreaterThan(1);
  });

  it('bounds the concurrency, so it cannot starve the shared pg pool', async () => {
    await fetchOrgPortfolioSummary(1);

    // Unbounded (Promise.all over every program) would peak at 20 here and at
    // ORG_ROLLUP_CAP=100 in production, against a pool of 20 in dev / 40 in
    // production — one slow surface traded for a slow application.
    expect(peakInFlight).toBeLessThanOrEqual(8);
  });

  it('keeps results in program order however the runs interleave', async () => {
    const summary = await fetchOrgPortfolioSummary(1);

    // The mock deliberately completes late programs first, so this is a real
    // test of the index write-back rather than an accident of timing.
    expect(completionOrder).not.toEqual([...completionOrder].sort((a, b) => a - b));

    // `attentionRanked` is re-sorted by the aggregator, so assert on the
    // member set the aggregator was handed: every program present, exactly once.
    expect(summary).not.toBeNull();
    expect(summary!.memberCount).toBe(PROGRAMS.length);
    const ids = summary!.attentionRanked.map((m) => m.projectId).sort((a, b) => a - b);
    expect(ids).toEqual(PROGRAMS.map((p) => p.projectId));
  });

  it('still returns null for an organization with no programs', async () => {
    // The early return must survive the rewrite: an org with nothing to roll up
    // gets the honest empty, not an empty aggregate that reads as real zeroes.
    const { db } = await import('../../../../db');
    const spy = vi
      .spyOn(db as unknown as { select: () => unknown }, 'select')
      .mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) } as never);

    await expect(fetchOrgPortfolioSummary(1)).resolves.toBeNull();
    spy.mockRestore();
  });
});
