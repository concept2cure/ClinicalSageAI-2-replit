/**
 * Section-lock SQL — END-TO-END against a real (in-process PGlite) Postgres.
 *
 * WHY THIS FILE EXISTS
 * The takeover statement shipped broken and every unit test passed, because a
 * stubbed pool does not enforce a unique index. The original statement was
 *
 *   WITH prior AS (SELECT …), del AS (DELETE FROM … WHERE lock_key = $4)
 *   INSERT INTO collab_section_locks (…) VALUES (…)   -- no ON CONFLICT
 *
 * which raises 23505 on EVERY takeover of an existing row — the only case
 * takeover exists for. And it is not an ordering bug: all sub-statements of one
 * statement share a command id, and the unique-index probe runs under
 * SnapshotDirty, where a tuple deleted by the same command is still seen as
 * live. Referencing `del`, or reordering the CTEs, would not have helped. Only
 * ON CONFLICT does — which is exactly the kind of claim that can only be
 * settled by executing it.
 *
 * So these tests run the router's REAL statements against a real engine, with
 * the real migration applied. PGlite is pure-WASM Postgres — no server, no
 * docker, no cloud.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = path.join(
  __dirname,
  '../../../db/migrations/20260807_collab_section_locks.sql'
);

let pg: PGlite;

/** The takeover statement as the router issues it (realtime-collab.ts). */
const TAKEOVER_SQL = `
  WITH prior AS (
    SELECT locked_by, locked_by_label, expires_at
    FROM collab_section_locks
    WHERE lock_key = $4 AND tenant_id = $1
  )
  INSERT INTO collab_section_locks
    (tenant_id, document_id, section_id, lock_key, locked_by, locked_by_label,
     lock_type, reason, locked_at, expires_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)
  ON CONFLICT (lock_key) DO UPDATE SET
    locked_by = EXCLUDED.locked_by,
    locked_by_label = EXCLUDED.locked_by_label,
    lock_type = EXCLUDED.lock_type,
    reason = EXCLUDED.reason,
    locked_at = NOW(),
    expires_at = EXCLUDED.expires_at
  RETURNING *,
    (SELECT locked_by FROM prior)       AS prev_locked_by,
    (SELECT locked_by_label FROM prior) AS prev_locked_by_label,
    (SELECT expires_at FROM prior)      AS prev_expires_at`;

/** The non-takeover acquire, which must still refuse a live foreign holder. */
const ACQUIRE_SQL = `
  INSERT INTO collab_section_locks
    (tenant_id, document_id, section_id, lock_key, locked_by, locked_by_label,
     lock_type, reason, locked_at, expires_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)
  ON CONFLICT (lock_key) DO UPDATE SET
    locked_by = EXCLUDED.locked_by,
    locked_by_label = EXCLUDED.locked_by_label,
    lock_type = EXCLUDED.lock_type,
    reason = EXCLUDED.reason,
    locked_at = NOW(),
    expires_at = EXCLUDED.expires_at
  WHERE collab_section_locks.locked_by = EXCLUDED.locked_by
     OR collab_section_locks.expires_at <= NOW()
  RETURNING *`;

const KEY = 't7:doc-1:sec-1';

function params(user: string, minutesFromNow: number) {
  return [
    7, 'doc-1', 'sec-1', KEY, user, `${user}@example.test`,
    'exclusive', 'editing', new Date(Date.now() + minutesFromNow * 60_000),
  ];
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(fs.readFileSync(MIGRATION, 'utf8'));
});

afterAll(async () => { await pg?.close(); });

beforeEach(async () => { await pg.exec('DELETE FROM collab_section_locks'); });

describe('collab_section_locks — migration applies to a real Postgres', () => {
  it('creates the table with lock_key UNIQUE (the constraint the bug collided with)', async () => {
    const cols = await pg.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'collab_section_locks'`
    );
    const names = cols.rows.map(r => r.column_name);
    expect(names).toEqual(expect.arrayContaining([
      'tenant_id', 'document_id', 'section_id', 'lock_key',
      'locked_by', 'locked_by_label', 'lock_type', 'reason',
      'locked_at', 'expires_at',
    ]));

    // A second row on the same lock_key must be rejected — this is what makes
    // the whole exercise meaningful. If this ever stops holding, the takeover
    // test below stops proving anything.
    await pg.query(ACQUIRE_SQL, params('userA', 30));
    await expect(
      pg.query(
        `INSERT INTO collab_section_locks
           (tenant_id, document_id, section_id, lock_key, locked_by,
            locked_by_label, lock_type, reason, locked_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)`,
        params('userB', 30)
      )
    ).rejects.toThrow();
  });

  it('applies idempotently', async () => {
    await expect(pg.exec(fs.readFileSync(MIGRATION, 'utf8'))).resolves.toBeDefined();
  });
});

describe('takeover', () => {
  it('displaces a LIVE holder and reports them, leaving exactly one row', async () => {
    await pg.query(ACQUIRE_SQL, params('userA', 30));

    // Before the fix this call rejected with 23505 and takeover was 100% dead.
    const res = await pg.query<Record<string, unknown>>(TAKEOVER_SQL, params('userB', 30));

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].locked_by).toBe('userB');
    // `prior` is read-only and evaluated on the pre-command snapshot, so the
    // displaced holder is still reported even though the row was overwritten —
    // this is what the route's `stolen` computation and the displaced-author
    // notification depend on.
    expect(res.rows[0].prev_locked_by).toBe('userA');
    expect(res.rows[0].prev_locked_by_label).toBe('userA@example.test');

    const all = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM collab_section_locks WHERE lock_key = $1`, [KEY]
    );
    expect(all.rows[0].n).toBe(1);
  });

  it('also succeeds against an EXPIRED but unreaped row', async () => {
    // Expiry is only reaped opportunistically on list, so a stale row is a real
    // state a takeover has to survive.
    await pg.query(ACQUIRE_SQL, params('userA', -30));
    const res = await pg.query<Record<string, unknown>>(TAKEOVER_SQL, params('userB', 30));
    expect(res.rows[0].locked_by).toBe('userB');
    // Present, but expired — so the route reports no displaced holder.
    expect(new Date(res.rows[0].prev_expires_at as string).getTime()).toBeLessThan(Date.now());
  });

  it('succeeds when there is no prior row at all', async () => {
    const res = await pg.query<Record<string, unknown>>(TAKEOVER_SQL, params('userB', 30));
    expect(res.rows[0].locked_by).toBe('userB');
    expect(res.rows[0].prev_locked_by).toBeNull();
  });
});

describe('ordinary acquire still refuses a live foreign holder', () => {
  it('returns no row when someone else holds an unexpired lock', async () => {
    await pg.query(ACQUIRE_SQL, params('userA', 30));
    const res = await pg.query(ACQUIRE_SQL, params('userB', 30));
    // The DO UPDATE ... WHERE guard suppresses the write; the route turns an
    // empty result into the 409 that offers "Take over".
    expect(res.rows).toHaveLength(0);
  });

  it('lets the same holder refresh, and lets anyone reclaim an expired lock', async () => {
    await pg.query(ACQUIRE_SQL, params('userA', 30));
    const refreshed = await pg.query<Record<string, unknown>>(ACQUIRE_SQL, params('userA', 60));
    expect(refreshed.rows).toHaveLength(1);

    await pg.exec(`UPDATE collab_section_locks SET expires_at = NOW() - INTERVAL '1 minute'`);
    const reclaimed = await pg.query<Record<string, unknown>>(ACQUIRE_SQL, params('userB', 30));
    expect(reclaimed.rows).toHaveLength(1);
    expect(reclaimed.rows[0].locked_by).toBe('userB');
  });
});
