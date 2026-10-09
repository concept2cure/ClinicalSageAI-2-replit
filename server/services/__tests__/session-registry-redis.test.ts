/**
 * The concurrent-session registry with Redis answering (security audit
 * 2026-09-24, IAM-06; plan P1-1; the security-auditor review of 2026-09-26).
 *
 * Redis is shared by every task, so when it answers, its decision is the only
 * one: the memory tier, which knows only the sessions this task opened and
 * still lists the ones signed out elsewhere, must not add its own evictions. And
 * the decision must be one atomic script, not a read on one round trip and an
 * eviction on the next, or two sign-ins at once both read the same count and
 * one eviction is lost. Here Redis is a double that runs the script's
 * semantics in JavaScript and counts what it was asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Zset = Map<string, number>;
const fake = vi.hoisted(() => {
  const state = {
    zsets: new Map<string, Zset>(),
    kv: new Map<string, string>(),
    calls: [] as string[],
    failEval: false,
  };
  const zset = (key: string) => {
    let z = state.zsets.get(key);
    if (!z) {
      z = new Map();
      state.zsets.set(key, z);
    }
    return z;
  };
  const client = {
    async get(key: string) {
      state.calls.push('get');
      return state.kv.get(key) ?? null;
    },
    async mget(...keys: string[]) {
      state.calls.push('mget');
      return keys.map(k => state.kv.get(k) ?? null);
    },
    async set(key: string, value: string) {
      state.calls.push('set');
      state.kv.set(key, value);
      return 'OK';
    },
    async zrem(key: string, ...members: string[]) {
      state.calls.push('zrem');
      const z = zset(key);
      for (const m of members) z.delete(m);
      return members.length;
    },
    async zadd() {
      state.calls.push('zadd');
      throw new Error('zadd outside the script');
    },
    async zcard() {
      state.calls.push('zcard');
      throw new Error('zcard outside the script');
    },
    /** The registration script: prune, add, count, evict the oldest beyond the limit, never the new one. */
    async eval(_script: string, _numKeys: number, ...args: string[]) {
      const [key, cutoff, started, sid, , limit] = args;
      state.calls.push('eval');
      if (state.failEval) throw new Error('redis away');
      const z = zset(key);
      for (const [id, score] of z) if (score <= Number(cutoff)) z.delete(id);
      z.set(sid, Number(started));
      const excess = z.size - Number(limit);
      if (excess <= 0) return [];
      const evicted = [...z.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id)
        .filter(id => id !== sid)
        .slice(0, excess);
      for (const id of evicted) z.delete(id);
      return evicted;
    },
  };
  return { state, client };
});

vi.mock('../ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => true, getRedisClient: () => fake.client }));

import { newSessionClaims, registerSession, resetSessionActivityForTests, sessionInactivityReason } from '../session-inactivity';

const MINUTE = 60_000;
const T0 = Date.parse('2026-09-26T09:00:00Z');
const claimsOf = (s: { sid: string; sst: number; idl: number }) => ({ ...s, iat: s.sst, userId: '42' });

beforeEach(() => {
  resetSessionActivityForTests();
  fake.state.zsets.clear();
  fake.state.kv.clear();
  fake.state.calls = [];
  fake.state.failEval = false;
});

describe('the registry when Redis answers', () => {
  it('decides in one atomic script: no read on one round trip and an eviction on the next', async () => {
    await registerSession(42, newSessionClaims(undefined, T0), 2, T0);
    expect(fake.state.calls.filter(c => c === 'eval')).toHaveLength(1);
    expect(fake.state.calls).not.toContain('zadd');
    expect(fake.state.calls).not.toContain('zcard');
  });

  it("Redis's decision is the only one: a session signed out on another task does not make this task end a live one", async () => {
    const live = newSessionClaims(undefined, T0);
    const other = newSessionClaims(undefined, T0 + MINUTE);
    expect(await registerSession(42, live, 2, T0)).toEqual([]);
    expect(await registerSession(42, other, 2, T0 + MINUTE)).toEqual([]);
    // The holder signs `other` out on a different task: Redis forgets it, this task's memory tier does not.
    await fake.client.zrem('c2c:user-sessions:42', other.sid);
    const third = newSessionClaims(undefined, T0 + 2 * MINUTE);
    expect(await registerSession(42, third, 2, T0 + 2 * MINUTE), 'the memory tier ended a session Redis kept').toEqual([]);
    expect(await sessionInactivityReason('t', claimsOf(live), { now: T0 + 3 * MINUTE })).toBeNull();
  });

  it('a session superseded on one task is refused on another: the marker lives in Redis', async () => {
    const first = newSessionClaims(undefined, T0);
    await registerSession(42, first, 1, T0);
    expect(await registerSession(42, newSessionClaims(undefined, T0 + MINUTE), 1, T0 + MINUTE)).toEqual([first.sid]);
    resetSessionActivityForTests(); // another task: an empty memory tier
    expect(await sessionInactivityReason('t', claimsOf(first), { now: T0 + 2 * MINUTE })).toBe('superseded');
  });

  it('when Redis fails, the memory tier decides for this task', async () => {
    fake.state.failEval = true;
    const first = newSessionClaims(undefined, T0);
    expect(await registerSession(42, first, 1, T0)).toEqual([]);
    expect(await registerSession(42, newSessionClaims(undefined, T0 + MINUTE), 1, T0 + MINUTE)).toEqual([first.sid]);
    expect(await sessionInactivityReason('t', claimsOf(first), { now: T0 + 2 * MINUTE })).toBe('superseded');
  });
});
