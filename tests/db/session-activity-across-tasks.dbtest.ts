/**
 * A sign-in session is the same session on every server process (U20).
 *
 * Production runs two API tasks and a worker, behind a load balancer with no
 * stickiness, and no Redis. The inactivity logoff kept each session's last
 * activity, the account's session registry and the superseded markers in each
 * process's memory, and a process that had not seen a session measured it
 * from its token's issue time — the sign-in, since access tokens last a day.
 * So:
 *   - every deploy (new tasks, empty memory) signed out everyone who had signed
 *     in more than the idle window ago, in the middle of their work, and their
 *     refresh was refused too;
 *   - a session the concurrent-session limit ended on one task kept working on
 *     the other;
 *   - the limit counted only the sessions each task had opened.
 *
 * Each "task" is a fresh module graph (vi.resetModules): its own copy of the
 * service and its memory, its own pool. All share one real PostgreSQL, as the
 * tasks share RDS, and run as the non-superuser runtime role with
 * RLS_ENFORCE=on and the table's tenant policy, using the migration's own DDL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';

vi.mock('../../server/services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));

type Service = typeof import('../../server/services/session-inactivity');

const DDL = fs.readFileSync(path.resolve(__dirname, '../../migrations/20261001e_session_activity.sql'), 'utf8');
const MIN = 60_000;

let env: SchedulerDb;
const pools: Array<{ end(): Promise<void> }> = [];

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbsess', DDL, ['session_activity']);
}, 120_000);

afterAll(async () => {
  for (const p of pools) await p.end().catch(() => undefined);
  if (env) await env.destroy();
});

/** A server process: a fresh copy of the service, with nothing in its memory. */
async function task(): Promise<Service> {
  vi.resetModules();
  const service = await import('../../server/services/session-inactivity');
  const runtime = await import('../../server/db/runtime');
  pools.push(runtime.getPool());
  return service;
}

/** The decoded access token a sign-in at `signedInAt` hands the client. */
function tokenOf(userId: number, claims: { sid: string; sst: number; idl: number }) {
  return { token: `access-${claims.sid}`, decoded: { userId, ...claims, iat: claims.sst } };
}

describe('sessions across server processes', () => {
  it('a deploy does not sign out a session that was active a minute ago', async () => {
    const now = Date.now();
    const a = await task();
    const claims = await a.openSession(901, undefined, now - 40 * MIN);
    const { token, decoded } = tokenOf(901, claims);
    // Working steadily since signing in, on the old tasks.
    for (const ago of [35, 28, 21, 14, 7, 1]) {
      expect(await a.sessionInactivityReason(token, decoded, { now: now - ago * MIN })).toBeNull();
    }

    const afterDeploy = await task();
    expect(await afterDeploy.sessionInactivityReason(token, decoded, { now })).toBeNull();
    expect(await afterDeploy.refreshInactivityReason(decoded, now)).toBeNull();
  });

  it('a session idle past its window is refused on every process', async () => {
    const now = Date.now();
    const a = await task();
    const claims = await a.openSession(902, undefined, now - 35 * MIN);
    const { token, decoded } = tokenOf(902, claims);
    expect(await a.sessionInactivityReason(token, decoded, { now: now - 30 * MIN })).toBeNull();
    const b = await task();
    expect(await b.sessionInactivityReason(token, decoded, { now })).toBe('idle');
  });

  it('the concurrent-session limit counts every process\'s sign-ins, and a session it ends is ended everywhere', async () => {
    const now = Date.now();
    const settings = { security: { maxConcurrentSessions: 2 } };
    const a = await task();
    const b = await task();
    const first = await a.openSession(903, settings, now - 3 * MIN);
    await a.openSession(903, settings, now - 2 * MIN);
    await b.openSession(903, settings, now - MIN);

    const { token, decoded } = tokenOf(903, first);
    const c = await task();
    expect(await a.sessionInactivityReason(token, decoded, { now })).toBe('superseded');
    expect(await c.sessionInactivityReason(token, decoded, { now })).toBe('superseded');
    expect(await c.refreshInactivityReason(decoded, now)).toBe('superseded');
  });

  it('signing out on one process frees the slot for every process', async () => {
    const now = Date.now();
    const settings = { security: { maxConcurrentSessions: 1 } };
    const a = await task();
    const b = await task();
    const first = await a.openSession(904, settings, now - 2 * MIN);
    await b.unregisterSession(904, first.sid);
    const second = await b.openSession(904, settings, now - MIN);
    expect(await a.sessionInactivityReason(...Object.values(tokenOf(904, second)) as [string, unknown], { now })).toBeNull();
    const { rows } = await env.owner.query(
      `SELECT count(*)::int AS n FROM ${env.t('session_activity')} WHERE account = '904' AND superseded_at IS NOT NULL`,
    );
    expect(rows[0].n).toBe(0);
  });
});
