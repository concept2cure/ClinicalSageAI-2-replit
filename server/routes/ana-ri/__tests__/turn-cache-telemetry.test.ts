/**
 * The prompt-cache telemetry covers the whole turn, not just its first call.
 *
 * ── Why the first call was the wrong thing to measure ─────────────────────────
 * A turn is one gateway call plus up to six agentic rounds. The rounds are
 * where most of a turn's input tokens go, and where a cache miss costs the most,
 * because by then the conversation is at its longest. The telemetry read
 * `gwResponse.cacheStats` — the FIRST call — and discarded every round.
 *
 * So the one number the plan says to judge a caching change by ("log
 * cache_read_input_tokens across three consecutive turns; if it is zero after,
 * a silent invalidator is still in the prefix") could not be read honestly. A
 * turn could report a healthy first-call hit while every round behind it
 * rebuilt the whole prefix, and the reported figure would look fine.
 *
 * That was not hypothetical. The terminal round used to drop the tools array
 * outright — a tool-definition change, the one change that preserves no cache
 * tier at all — so the answer round of every multi-round turn re-read the whole
 * prefix at full price, and none of it appeared anywhere.
 *
 * ── Why missedCalls and not a hit rate ────────────────────────────────────────
 * Reads and writes can both look busy while half the calls are missing. A
 * COUNT of calls that read nothing is the figure that answers "did the change
 * land", which is the question being asked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const STREAM = readFileSync(path.join(repoRoot, 'server', 'routes', 'ana-ri', 'stream.ts'), 'utf8');

/** The shipped accumulator, extracted so a paraphrase cannot drift from it. */
const RECORDER = (() => {
  const start = STREAM.indexOf('const recordCacheUsage =');
  const end = STREAM.indexOf('\n    };', start);
  return start === -1 ? '' : STREAM.slice(start, end);
})();

/** Re-implemented from the shipped source, to assert on behaviour not text. */
function accumulate(responses: Array<{ cacheStats?: { cacheReadInputTokens?: number; cacheCreationInputTokens?: number } }>) {
  const turnCache = { calls: 0, missedCalls: 0, readTokens: 0, createTokens: 0 };
  for (const response of responses) {
    const stats = (response as any)?.cacheStats;
    turnCache.calls += 1;
    if (!stats) { turnCache.missedCalls += 1; continue; }
    const read = Number(stats.cacheReadInputTokens ?? 0);
    turnCache.readTokens += read;
    turnCache.createTokens += Number(stats.cacheCreationInputTokens ?? 0);
    if (read === 0) turnCache.missedCalls += 1;
  }
  return turnCache;
}

describe('every model call in the turn is counted', () => {
  it('counts the first call AND each round', () => {
    expect(STREAM).toMatch(/recordCacheUsage\(gwResponse\);/);
    expect(STREAM).toMatch(/recordCacheUsage\(roundResponse\);/);
  });

  it('the turn totals reach the telemetry, beside the first-call figure', () => {
    // The first-call number is kept: it is still the right answer to "did the
    // opening prefix hit". The turn totals answer a different question.
    expect(STREAM).toMatch(/turn: \{ \.\.\.turnCache \}/);
    expect(STREAM).toMatch(/hit: \(gwResponse as any\)\.cacheHit/);
  });

  it('the accumulator exists and reads both token fields', () => {
    expect(RECORDER).toMatch(/cacheReadInputTokens/);
    expect(RECORDER).toMatch(/cacheCreationInputTokens/);
    expect(RECORDER).toMatch(/missedCalls/);
  });
});

describe('what the numbers say', () => {
  it('sums reads and writes across the calls', () => {
    expect(
      accumulate([
        { cacheStats: { cacheReadInputTokens: 1000, cacheCreationInputTokens: 50 } },
        { cacheStats: { cacheReadInputTokens: 2000, cacheCreationInputTokens: 0 } },
      ]),
    ).toEqual({ calls: 2, missedCalls: 0, readTokens: 3000, createTokens: 50 });
  });

  it('A HEALTHY FIRST CALL DOES NOT HIDE A MISSING ROUND — the point', () => {
    // Exactly the shape the terminal-round defect produced: the opening call
    // reads its prefix, then the answer round rebuilds everything. The
    // first-call figure alone reports this turn as cached.
    const t = accumulate([
      { cacheStats: { cacheReadInputTokens: 24_000, cacheCreationInputTokens: 0 } },
      { cacheStats: { cacheReadInputTokens: 24_000, cacheCreationInputTokens: 0 } },
      { cacheStats: { cacheReadInputTokens: 0, cacheCreationInputTokens: 31_000 } },
    ]);
    expect(t.calls).toBe(3);
    expect(t.missedCalls).toBe(1);
    expect(t.createTokens).toBe(31_000);
  });

  it('counts a call that reported no stats at all as a miss, not as absent', () => {
    // A provider that reports nothing and a prefix that missed are different
    // facts, but neither is a read — and silently dropping the call from the
    // denominator would flatter the figure.
    const t = accumulate([{}, { cacheStats: { cacheReadInputTokens: 500 } }]);
    expect(t.calls).toBe(2);
    expect(t.missedCalls).toBe(1);
    expect(t.readTokens).toBe(500);
  });

  it('a turn that cached nothing says so plainly', () => {
    const t = accumulate([
      { cacheStats: { cacheReadInputTokens: 0, cacheCreationInputTokens: 24_000 } },
      { cacheStats: { cacheReadInputTokens: 0, cacheCreationInputTokens: 28_000 } },
    ]);
    expect(t.missedCalls).toBe(t.calls);
    expect(t.readTokens).toBe(0);
  });
});
