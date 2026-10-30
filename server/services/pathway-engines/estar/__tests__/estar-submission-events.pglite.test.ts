/**
 * A tracked filing's event history is written with the change it records (D2,
 * fold F5 item 1, 2026-10-30; decision P-61 item 1;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-f5-device-filing/).
 *
 * The device-submission screen showed a package's milestone log; its home is
 * the tracked filing's own history (FUNCTION_PARITY.md, "Milestone activity
 * log"). The §11.10(e) audit row is written after the commit and may be
 * missing (audit-write-outcome.ts), so it cannot be the history a screen states
 * as fact. This pins, against a real engine (PGlite) and the real tables from
 * their creators on the deploy set:
 *   - starting to track a filing writes its `created` event, and a status change
 *     its `status_changed` event, each on the change's own transaction: when the
 *     event cannot be written the change does not land;
 *   - the history is read in order, for the filing's organization only;
 *   - a filing migrated from a package with no review clock of its own takes the
 *     catalogue's when it is filed.
 * The audit row and the project-membership check are stubbed: each has its own
 * tests (audit-write-outcome, project-membership.pglite).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
vi.mock('../../../../db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('../../../audit/audit-write-outcome', () => ({ recordAuditRow: vi.fn(async () => ({ persisted: true, chained: true })) }));
vi.mock('../../../cmc/project-membership', () => ({ projectBelongsToTenant: async (p: { organizationId: number }) => p.organizationId === 1 }));
vi.mock('../../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(), verifyReauth: vi.fn() }));

import * as schema from '../../../../../shared/schema/estar-submission';
import {
  advanceEstarSubmission,
  createEstarSubmission,
  EstarSubmissionError,
  listEstarSubmissionEvents,
  reviewGoalDaysOf,
} from '../estar-submission-service';

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');
const ESTAR = [
  'migrations/20260730_estar_submission.sql',
  'migrations/20260730_estar_submission_project_link.sql',
  'migrations/20260908b_estar_submissions_filed_artifact.sql',
  'migrations/20261030_estar_filing_one_store.sql',
];
const CTX = { organizationId: 1, userId: 5 };

beforeAll(async () => {
  holder.pg = new PGlite();
  // users from the base schema: the history names who acted.
  const users = read('migrations/0000_sweet_joseph.sql').match(/CREATE TABLE "users" \([\s\S]*?\n\);/)![0];
  await holder.pg.exec(users);
  await holder.pg.exec(`INSERT INTO users (id, email, name, password_hash) VALUES (5, 'ra@acme.test', 'RA lead', 'x')`);
  for (const f of ESTAR) await holder.pg.exec(read(f));
  holder.db = drizzle(holder.pg, { schema });
}, 60_000);
afterAll(async () => { await holder.pg?.close(); });

/** A test-only refusal of every history write, so the change's own transaction is observable. */
async function historyRefuses(on: boolean) {
  await holder.pg.exec(on
    ? `CREATE OR REPLACE FUNCTION f5_refuse() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'history unavailable'; END $$;
       CREATE TRIGGER f5_refuse BEFORE INSERT ON estar_submission_events FOR EACH ROW EXECUTE FUNCTION f5_refuse();`
    : 'DROP TRIGGER IF EXISTS f5_refuse ON estar_submission_events;');
}
beforeEach(async () => { await historyRefuses(false); });

/** The refusal, through drizzle's "Failed query" wrapper, which keeps the engine's error as its cause. */
const refusal = (p: Promise<unknown>) => p.then(() => 'resolved', (e: { message?: string; cause?: { message?: string } }) => `${e.message ?? ''} ${e.cause?.message ?? ''}`);

const eventsOf = async (id: string) => (await holder.pg.query(
  'SELECT event_type, from_status, to_status, actor_user_id, detail FROM estar_submission_events WHERE submission_id = $1 ORDER BY occurred_at, id', [id])).rows;

describe('the filing and its history commit together', () => {
  it('starting to track a filing writes its created event', async () => {
    const row = await createEstarSubmission({ catalogKey: '510k', projectId: 11 }, CTX);
    expect(await eventsOf(row.id)).toEqual([
      { event_type: 'created', from_status: null, to_status: 'draft', actor_user_id: 5, detail: { catalogKey: '510k', programType: '510k', variant: 'device', projectId: 11 } },
    ]);
  });

  it('a filing whose created event cannot be written is not tracked', async () => {
    const before = (await holder.pg.query('SELECT count(*)::int AS n FROM estar_submissions')).rows[0].n;
    await historyRefuses(true);
    expect(await refusal(createEstarSubmission({ catalogKey: 'de_novo' }, CTX))).toMatch(/history unavailable/);
    expect((await holder.pg.query('SELECT count(*)::int AS n FROM estar_submissions')).rows[0].n).toBe(before);
  });

  it('a status change writes its event, and does not land without it', async () => {
    const row = await createEstarSubmission({ catalogKey: 'pma_original', projectId: 11 }, CTX);
    await historyRefuses(true);
    expect(await refusal(advanceEstarSubmission(row.id, { toStatus: 'withdrawn' }, CTX))).toMatch(/history unavailable/);
    expect((await holder.pg.query('SELECT status FROM estar_submissions WHERE id = $1', [row.id])).rows).toEqual([{ status: 'draft' }]);
    await historyRefuses(false);
    await advanceEstarSubmission(row.id, { toStatus: 'withdrawn' }, CTX);
    expect((await eventsOf(row.id)).map((e: any) => [e.event_type, e.from_status, e.to_status, e.actor_user_id]))
      .toEqual([['created', null, 'draft', 5], ['status_changed', 'draft', 'withdrawn', 5]]);
  });
});

describe('reading the history', () => {
  it('in order, for the filing\'s organization only', async () => {
    const row = await createEstarSubmission({ catalogKey: '510k', projectId: 11 }, CTX);
    await advanceEstarSubmission(row.id, { toStatus: 'withdrawn' }, CTX);
    const events = await listEstarSubmissionEvents(row.id, { organizationId: 1 });
    expect(events.map((e) => [e.eventType, e.fromStatus, e.toStatus, e.actorUserId, e.actorName])).toEqual([
      ['created', null, 'draft', 5, 'RA lead'], ['status_changed', 'draft', 'withdrawn', 5, 'RA lead'],
    ]);
    expect(typeof events[0].occurredAt).toBe('string');
    const err = await listEstarSubmissionEvents(row.id, { organizationId: 2 }).catch((e) => e);
    expect(err).toBeInstanceOf(EstarSubmissionError);
    expect((err as EstarSubmissionError).code).toBe('NOT_FOUND');
  });
});

describe('a migrated filing\'s review clock', () => {
  it('is the catalogue\'s when the filing recorded none, and its own otherwise', () => {
    expect(reviewGoalDaysOf({ catalogKey: '510k', reviewGoalDays: null })).toBe(90);
    expect(reviewGoalDaysOf({ catalogKey: '510k', reviewGoalDays: 30 })).toBe(30);
    expect(reviewGoalDaysOf({ catalogKey: 'not-a-catalog-key', reviewGoalDays: null })).toBeNull();
  });
});
