/**
 * AnA's write-action lock and per-organisation action cap hold across server
 * processes (U21).
 *
 * A governed write action (AnA Command → POST /api/ai-actions/execute) locks
 * its target, and each organisation may run a capped number of actions at
 * once. Both were Redis with an in-memory fallback; production runs no Redis,
 * so with two API tasks behind a non-sticky load balancer two writes on one
 * document both ran, one on each task, and the cap was doubled.
 *
 * Each "task" is a fresh module graph; both share one real PostgreSQL as the
 * non-superuser runtime role with RLS_ENFORCE=on and the table's tenant
 * policy, using the migration's own DDL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

vi.mock('../../server/services/ai-actions/redis-manager', () => ({ getRedisClient: () => null, isRedisAvailable: () => false }));

type Lock = typeof import('../../server/services/ai-actions/distributed-lock');
type Limiter = typeof import('../../server/services/ai-actions/concurrency-limiter');

const DDL = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261001f_coordination_leases.sql'), 'utf8');

let env: SchedulerDb;
const pools: Array<{ end(): Promise<void> }> = [];

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dblease2', DDL, ['coordination_leases']);
}, 120_000);

afterAll(async () => {
  for (const p of pools) await p.end().catch(() => undefined);
  if (env) await env.destroy();
});

async function task(): Promise<{ lock: Lock; limiter: Limiter }> {
  vi.resetModules();
  const lock = await import('../../server/services/ai-actions/distributed-lock');
  const limiter = await import('../../server/services/ai-actions/concurrency-limiter');
  pools.push((await import('../../server/db/runtime')).getPool());
  return { lock, limiter };
}

describe('AnA action coordination across server processes', () => {
  it('a write action holding a document\'s lock on one task blocks the same write on the other', async () => {
    const a = await task();
    const b = await task();
    const held = await a.lock.acquireLock('document:42', 'action-a', 30_000, 31);
    expect(held).not.toBeNull();
    expect(await b.lock.acquireLock('document:42', 'action-b', 30_000, 31)).toBeNull();
    await held!.release();
    const next = await b.lock.acquireLock('document:42', 'action-b', 30_000, 31);
    expect(next).not.toBeNull();
    await next!.release();
  });

  it('one organisation\'s lock never blocks another organisation\'s target with the same id', async () => {
    const a = await task();
    const held = await a.lock.acquireLock('document:7', 'action-a', 30_000, 31);
    const other = await (await task()).lock.acquireLock('document:7', 'action-x', 30_000, 32);
    expect(held).not.toBeNull();
    expect(other).not.toBeNull();
    await held!.release();
    await other!.release();
  });

  it('a lapsed lock is taken over', async () => {
    const a = await task();
    expect(await a.lock.acquireLock('document:9', 'crashed', 1_000, 31)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 1_200));
    const b = await task();
    const taken = await b.lock.acquireLock('document:9', 'action-b', 30_000, 31);
    expect(taken).not.toBeNull();
    await taken!.release();
  });

  it('the per-organisation cap counts every task\'s running actions', async () => {
    const a = await task();
    const b = await task();
    const s1 = await a.limiter.acquireConcurrencySlot(33, 2);
    const s2 = await b.limiter.acquireConcurrencySlot(33, 2);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(await a.limiter.acquireConcurrencySlot(33, 2)).toBeNull();
    expect(await b.limiter.acquireConcurrencySlot(33, 2)).toBeNull();
    await s1!.release();
    const s3 = await b.limiter.acquireConcurrencySlot(33, 2);
    expect(s3).not.toBeNull();
    await s2!.release();
    await s3!.release();
  });
});
