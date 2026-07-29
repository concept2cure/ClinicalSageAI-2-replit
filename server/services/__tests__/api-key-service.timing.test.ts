/**
 * Pins the timing-side-channel fix on validateApiKey.
 *
 * Pre-fix, the function short-circuited with `return invalid` when
 * the raw key didn't start with `csai_`. That leaked "wrong format"
 * vs "valid format but no match" via response timing: an attacker
 * probing the endpoint could tell when their guess had the right
 * prefix because the no-format path skipped the SQL query.
 *
 * These tests pin the contract that the SQL path runs regardless of
 * format. The reason strings are preserved for caller observability,
 * but the code path is identical (one hash, one query, one branch
 * on result.rows.length).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the DB pool so the query runs synchronously and we can count
// invocations. The exact value returned doesn't matter for the
// timing-shape test — both failure modes hit the same branch.
const poolQueryMock = vi.fn();
vi.mock('../../db.js', () => ({
  pool: { query: poolQueryMock },
}));

describe('validateApiKey — always-hash, always-query (timing fix)', () => {
  beforeEach(() => {
    vi.resetModules();
    poolQueryMock.mockReset();
    poolQueryMock.mockResolvedValue({ rows: [] });
  });

  it('queries the database even when the raw key lacks the csai_ prefix', async () => {
    const { validateApiKey } = await import('../api-key-service');
    const result = await validateApiKey('definitely-not-our-prefix');

    // The SQL path MUST have run — that's the whole point of the
    // fix. A pre-fix implementation would short-circuit before this.
    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid key format');
  });

  it('queries the database when the prefix is right but the key is unknown', async () => {
    const { validateApiKey } = await import('../api-key-service');
    const result = await validateApiKey('csai_unknown-key');

    expect(poolQueryMock).toHaveBeenCalledTimes(1);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('API key not found');
  });

  it('queries the database for empty / non-string input (defensive)', async () => {
    const { validateApiKey } = await import('../api-key-service');
    // @ts-expect-error — testing runtime-coercion behavior intentionally.
    const a = await validateApiKey(undefined);
    // @ts-expect-error
    const b = await validateApiKey(null);
    const c = await validateApiKey('');

    // Each call hashes "" and queries the table — uniform behavior.
    expect(poolQueryMock).toHaveBeenCalledTimes(3);
    expect(a.valid).toBe(false);
    expect(b.valid).toBe(false);
    expect(c.valid).toBe(false);
  });
});
