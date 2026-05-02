/**
 * Policy loader tests — verifies loadAnaToolPolicy reads from
 * organizations.settings.anaToolPolicy correctly and returns an empty
 * policy on every "not configured" path.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadAnaToolPolicy } from '../mdx-tool-policy';

function poolReturning(rows: unknown[]) {
  return { query: vi.fn(async () => ({ rows })) };
}

describe('loadAnaToolPolicy', () => {
  it('returns empty policy when org row is missing', async () => {
    const policy = await loadAnaToolPolicy(poolReturning([]) as any, 1);
    expect(policy).toEqual({});
  });

  it('returns empty policy when settings is null', async () => {
    const policy = await loadAnaToolPolicy(
      poolReturning([{ settings: null }]) as any,
      1,
    );
    expect(policy).toEqual({});
  });

  it('returns empty policy when anaToolPolicy field is absent', async () => {
    const policy = await loadAnaToolPolicy(
      poolReturning([{ settings: { otherFlag: true } }]) as any,
      1,
    );
    expect(policy).toEqual({});
  });

  it('reads deny + allow lists correctly', async () => {
    const policy = await loadAnaToolPolicy(
      poolReturning([
        {
          settings: {
            anaToolPolicy: {
              deny: ['k510_workflow.transmit'],
              allow: ['q_sub.create', 'q_sub.commitment.set_rolled_in'],
            },
          },
        },
      ]) as any,
      1,
    );
    expect(policy).toEqual({
      deny: ['k510_workflow.transmit'],
      allow: ['q_sub.create', 'q_sub.commitment.set_rolled_in'],
    });
  });

  it('filters out non-string entries (defense against malformed config)', async () => {
    const policy = await loadAnaToolPolicy(
      poolReturning([
        {
          settings: {
            anaToolPolicy: {
              deny: ['ok', 42, null, 'also-ok'],
              allow: 'not-an-array',
            },
          },
        },
      ]) as any,
      1,
    );
    expect(policy.deny).toEqual(['ok', 'also-ok']);
    expect(policy.allow).toBeUndefined();
  });

  it('returns empty policy for invalid orgId', async () => {
    const pool = poolReturning([]);
    expect(await loadAnaToolPolicy(pool as any, 0)).toEqual({});
    expect(await loadAnaToolPolicy(pool as any, -1)).toEqual({});
    expect(await loadAnaToolPolicy(pool as any, NaN as any)).toEqual({});
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('is fail-soft when the DB throws', async () => {
    const pool = { query: vi.fn(async () => { throw new Error('connection lost'); }) };
    const policy = await loadAnaToolPolicy(pool as any, 1);
    expect(policy).toEqual({});
  });
});
