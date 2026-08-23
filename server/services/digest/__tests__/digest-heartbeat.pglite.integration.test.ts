/**
 * Digest heartbeat — AnA's unprompted surface no longer requires Redis.
 *
 * WHAT WENT WRONG
 * The proactive digest — the platform's ONLY unprompted surface — fired from a
 * Bull cron (`0 7 * * 1-5`), and Bull needs Redis. On a Redis-less deploy,
 * initScheduledJobs logged one warn and no-opped: every proactive signal was
 * then computed only inside a user's request, so a user who never opened chat
 * was never told anything, ever, and nothing said so. The heartbeat is a
 * second TRIGGER for the same runProactiveDigest (never a second digest
 * implementation), in the plain-interval pattern the submission-chat sweep
 * proves works without Redis.
 *
 * This suite drives the tick against a real (PGlite) database because the
 * once-per-org-per-day guarantee IS a database question: the idempotency read
 * must see the notification row whichever trigger created it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

let pg: PGlite;

const pgliteClient = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

vi.mock('../../../db/runtime', () => ({
  pool: { query: (sql: string, p?: unknown[]) => pgliteClient.query(sql, p) },
}));

// The digest itself is covered by run-proactive-digest.test.ts; here it is a
// recorder so the suite can assert WHEN the heartbeat invokes it. created:true
// also inserts the notification row, because the DB idempotency under test is
// keyed on that row existing.
const digest = vi.hoisted(() => ({
  runProactiveDigest: vi.fn(),
}));
vi.mock('../proactive-digest', () => ({
  PROACTIVE_DIGEST_CATEGORY: 'proactive_digest',
  runProactiveDigest: digest.runProactiveDigest,
}));

import {
  runDigestHeartbeatTick,
  isWithinDigestWindow,
  digestWindowStart,
  __resetDigestHeartbeatStateForTests,
} from '../digest-heartbeat';

/** Tuesday 2026-08-18, 09:30 UTC — inside the window. */
const IN_WINDOW = new Date('2026-08-18T09:30:00.000Z');
/** Tuesday, 05:00 UTC — before the window opens. */
const TOO_EARLY = new Date('2026-08-18T05:00:00.000Z');
/** Saturday, 09:30 UTC — weekend. */
const WEEKEND = new Date('2026-08-22T09:30:00.000Z');

async function insertDigestNotification(orgId: number, createdAt: string) {
  await pg.query(
    `INSERT INTO mdx_notifications (organization_id, category, severity, title, created_at)
     VALUES ($1, 'proactive_digest', 'warning', 'Regulatory attention needed', $2)`,
    [orgId, createdAt]
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY, name text, status text DEFAULT 'active');
    CREATE TABLE mdx_notifications (
      id serial PRIMARY KEY,
      organization_id integer NOT NULL,
      recipient_user_id integer,
      category text NOT NULL,
      severity text NOT NULL,
      title text NOT NULL,
      body text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE organizations, mdx_notifications RESTART IDENTITY');
  __resetDigestHeartbeatStateForTests();
  digest.runProactiveDigest.mockReset();
  digest.runProactiveDigest.mockImplementation(async (orgId: number) => {
    await insertDigestNotification(orgId, new Date('2026-08-18T09:31:00.000Z').toISOString());
    return { created: true, notificationId: 1 };
  });
});

describe('the window mirrors the cron it stands in for (0 7 * * 1-5, UTC)', () => {
  it('weekday at/after 07:00 UTC is in; earlier or weekend is out', () => {
    expect(isWithinDigestWindow(IN_WINDOW)).toBe(true);
    expect(isWithinDigestWindow(TOO_EARLY)).toBe(false);
    expect(isWithinDigestWindow(WEEKEND)).toBe(false);
  });

  it('the idempotency window starts at 07:00 UTC of the same day', () => {
    expect(digestWindowStart(IN_WINDOW).toISOString()).toBe('2026-08-18T07:00:00.000Z');
  });
});

describe('one digest per org per day, whoever fires it', () => {
  it('runs the digest for every active org, once', async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a'), ('b')`);
    await pg.query(`INSERT INTO organizations (name, status) VALUES ('inactive', 'suspended')`);

    const result = await runDigestHeartbeatTick(IN_WINDOW);

    expect(result.digestsCreated).toBe(2);
    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(2);
    expect(digest.runProactiveDigest.mock.calls.map(c => c[0]).sort()).toEqual([1, 2]);
  });

  it('a second tick the same day does nothing more', async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);

    await runDigestHeartbeatTick(IN_WINDOW);
    const second = await runDigestHeartbeatTick(new Date('2026-08-18T13:30:00.000Z'));

    expect(second.digestsCreated).toBe(0);
    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(1);
  });

  it('after a RESTART, the database row still prevents a duplicate', async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);
    await runDigestHeartbeatTick(IN_WINDOW);

    // New process: in-memory attempt tracking is gone; the row is not.
    __resetDigestHeartbeatStateForTests();
    const afterRestart = await runDigestHeartbeatTick(new Date('2026-08-18T14:00:00.000Z'));

    expect(afterRestart.digestsCreated).toBe(0);
    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(1);
  });

  it("a digest the CRON delivered counts too — the guard is the row, not the trigger", async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);
    await insertDigestNotification(1, '2026-08-18T07:00:30.000Z'); // Bull got there first

    const result = await runDigestHeartbeatTick(IN_WINDOW);

    expect(result.digestsCreated).toBe(0);
    expect(digest.runProactiveDigest).not.toHaveBeenCalled();
  });

  it("yesterday's digest does not satisfy today", async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);
    await insertDigestNotification(1, '2026-08-17T09:00:00.000Z');

    const result = await runDigestHeartbeatTick(IN_WINDOW);

    expect(result.digestsCreated).toBe(1);
    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(1);
  });
});

describe('honest quiet behavior', () => {
  it('outside the window nothing runs and nothing is queried', async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);

    for (const now of [TOO_EARLY, WEEKEND]) {
      const result = await runDigestHeartbeatTick(now);
      expect(result.skipped).toBe('outside_window');
    }
    expect(digest.runProactiveDigest).not.toHaveBeenCalled();
  });

  it("an org inside its own quiet hours RETRIES on a later tick — the org's evening is not the day's end", async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);
    digest.runProactiveDigest.mockResolvedValueOnce({ created: false, skipped: 'quiet_hours' });

    await runDigestHeartbeatTick(IN_WINDOW);
    const later = await runDigestHeartbeatTick(new Date('2026-08-18T12:00:00.000Z'));

    expect(later.digestsCreated).toBe(1);
    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(2);
  });

  it('an org whose digest found nothing material is not re-queried all day', async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a')`);
    digest.runProactiveDigest.mockResolvedValue({ created: false, skipped: 'nothing_material' });

    await runDigestHeartbeatTick(IN_WINDOW);
    await runDigestHeartbeatTick(new Date('2026-08-18T12:00:00.000Z'));

    expect(digest.runProactiveDigest).toHaveBeenCalledTimes(1);
  });

  it("one org's failure never starves the rest, and the failed org retries", async () => {
    await pg.query(`INSERT INTO organizations (name) VALUES ('a'), ('b')`);
    digest.runProactiveDigest.mockImplementation(async (orgId: number) => {
      if (orgId === 1) throw new Error('org 1 exploded');
      await insertDigestNotification(orgId, '2026-08-18T09:31:00.000Z');
      return { created: true, notificationId: 1 };
    });

    const first = await runDigestHeartbeatTick(IN_WINDOW);
    expect(first.digestsCreated).toBe(1); // org 2 still delivered

    digest.runProactiveDigest.mockImplementation(async (orgId: number) => {
      await insertDigestNotification(orgId, '2026-08-18T12:01:00.000Z');
      return { created: true, notificationId: 2 };
    });
    const second = await runDigestHeartbeatTick(new Date('2026-08-18T12:00:00.000Z'));
    expect(second.digestsCreated).toBe(1); // org 1 recovered
  });
});

describe('the boot path actually starts the fallback (source contract)', () => {
  // What broke before was silence: no Redis → one warn → zero unprompted
  // surface, and nothing anywhere said so. These pins keep the hand-off lines
  // from being lost the way buildContradictionWatchBlock's caller was (L71).
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

  it('startup consults the scheduler and starts the heartbeat when Bull did not come up', () => {
    const src = read('server/startup/services.ts');
    expect(src).toContain('isSchedulerQueueActive');
    expect(src).toContain('startDigestHeartbeat');
    expect(src).toMatch(/Redis is not configured.*unprompted surface/s);
  });

  it('scheduled-jobs exposes whether its queue came up', () => {
    const src = read('server/services/automation/scheduled-jobs.ts');
    expect(src).toMatch(/export function isSchedulerQueueActive\(\): boolean/);
  });
});
