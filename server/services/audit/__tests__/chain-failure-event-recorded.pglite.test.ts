/**
 * A broken audit chain is recorded in each affected organisation's own
 * trail — actually recorded — by both writers.
 *
 * The in-process monitor (server/services/audit/chainIntegrityMonitor.ts) and
 * the cron script (scripts/run-chain-verify.mjs) wrote their
 * audit.chain_integrity_failure event as user_id 0, named 'system', from
 * 127.0.0.1. audit_events.user_id references users
 * (migrations/0000_sweet_joseph.sql, audit_events_user_id_users_id_fk) and
 * there is no user 0, so every such insert was refused; both writers only
 * logged the refusal. The script also filed every organisation's breaks
 * under organisation 1.
 *
 * Run against PGlite carrying that foreign key.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

vi.mock('../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: () => undefined,
  registerBackgroundJob: () => undefined,
  BACKGROUND_JOB: { AUDIT_CHAIN_MONITOR: 'audit-chain-monitor' },
}));

import { runOnDemandCheck, startChainMonitor, stopChainMonitor } from '../chainIntegrityMonitor';
// @ts-expect-error — a plain .mjs script, no declarations.
import { recordChainFailures as recordFromScript } from '../../../../scripts/run-chain-verify.mjs';

type Link = { id: number; organizationId: number; sequenceNumber: number };
type Outcome = { organizationId: number; recorded: boolean; error?: string };
const recordChainFailures = recordFromScript as (
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  broken: Link[],
  ctx: { window: string; totalEntries: number },
) => Promise<Outcome[]>;

const SCHEMA = `
  CREATE TABLE users (id SERIAL PRIMARY KEY, username TEXT NOT NULL);
  INSERT INTO users (username) VALUES ('someone');
  CREATE TABLE audit_events (
    id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, event_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL, entity_id INTEGER NOT NULL,
    user_id INTEGER, user_name TEXT NOT NULL, user_role TEXT, ip_address TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT now(), reason TEXT, metadata JSON,
    regulatory_significant BOOLEAN DEFAULT false, gxp_relevant BOOLEAN DEFAULT false,
    sequence_number INTEGER, record_hash TEXT, previous_hash TEXT);
  ALTER TABLE audit_events ADD CONSTRAINT audit_events_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id);`;
/** Refuses the failure event for one organisation, as any refused write would. */
const REFUSE_ORG_9 = `
  CREATE FUNCTION refuse_org_9() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN IF NEW.organization_id = 9 THEN RAISE EXCEPTION 'refused for organisation 9'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER refuse_org_9 BEFORE INSERT ON audit_events FOR EACH ROW
    WHEN (NEW.event_type = 'audit.chain_integrity_failure') EXECUTE FUNCTION refuse_org_9();`;
/** Two organisations' chains, each with one link whose previous_hash does not match. */
const TWO_BROKEN_CHAINS = `INSERT INTO audit_events
  (organization_id, event_type, entity_type, entity_id, user_id, user_name, sequence_number, record_hash, previous_hash) VALUES
  (7, 'document.updated', 'document', 1, 1, 'someone', 1, 'a1', NULL),
  (7, 'document.updated', 'document', 1, 1, 'someone', 2, 'a2', 'TAMPERED'),
  (9, 'document.updated', 'document', 2, 1, 'someone', 1, 'b1', NULL),
  (9, 'document.updated', 'document', 2, 1, 'someone', 2, 'b2', 'WRONG'),
  (12, 'document.updated', 'document', 3, 1, 'someone', 1, 'c1', NULL),
  (12, 'document.updated', 'document', 3, 1, 'someone', 2, 'c2', 'c1')`;

let pg: PGlite;
const pool = () => ({ query: (sql: string, params?: unknown[]) => pg.query(sql, params) });
const failureEvents = async () => (await pg.query<Record<string, unknown>>(
  `SELECT organization_id, user_id, user_name, user_role, ip_address, metadata FROM audit_events
    WHERE event_type = 'audit.chain_integrity_failure' ORDER BY organization_id`)).rows;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(SCHEMA);
});
afterEach(async () => {
  await pg.close();
});

describe('the in-process chain monitor', () => {
  const scan = async () => {
    startChainMonitor(pool() as never, 60_000);
    stopChainMonitor();
    return runOnDemandCheck();
  };

  it("records the failure in each affected organisation's trail, as itself", async () => {
    await pg.exec(TWO_BROKEN_CHAINS);
    const status = await scan();
    expect(status.status).toBe('broken');
    const events = await failureEvents();
    expect(events.map(({ metadata: _m, ...actor }) => actor)).toEqual([7, 9].map((organization_id) => ({
      organization_id, user_id: null, user_name: 'audit chain integrity monitor', user_role: 'system', ip_address: null,
    })));
    expect(status.failureEventsNotRecorded).toBeUndefined();
  }, 60_000);

  it('says which organisation it could not record the failure for', async () => {
    await pg.exec(TWO_BROKEN_CHAINS + ';' + REFUSE_ORG_9);
    const status = await scan();
    expect(status.status).toBe('broken');
    expect(status.failureEventsNotRecorded).toEqual([9]);
    expect((await failureEvents()).map((e) => e.organization_id)).toEqual([7]);
  }, 60_000);
});

describe('the chain-verify cron script', () => {
  const broken: Link[] = [
    { id: 2, organizationId: 7, sequenceNumber: 2 },
    { id: 4, organizationId: 9, sequenceNumber: 2 },
    { id: 8, organizationId: 7, sequenceNumber: 5 },
  ];

  it('records one event per affected organisation, under that organisation, as itself', async () => {
    const outcomes = await recordChainFailures(pool(), broken, { window: '24h', totalEntries: 40 });
    expect(outcomes).toEqual([{ organizationId: 7, recorded: true }, { organizationId: 9, recorded: true }]);
    const events = await failureEvents();
    expect(events.map(({ metadata: _m, ...actor }) => actor)).toEqual([7, 9].map((organization_id) => ({
      organization_id, user_id: null, user_name: 'chain-verify scheduled job', user_role: 'system', ip_address: null,
    })));
    expect(events[0].metadata).toMatchObject({ window: '24h', brokenLinkCount: 2, totalEntries: 40 });
    expect((events[1].metadata as { brokenLinks: Link[] }).brokenLinks).toEqual([broken[1]]);
  }, 60_000);

  it('reports an event it could not record', async () => {
    await pg.exec(REFUSE_ORG_9);
    const outcomes = await recordChainFailures(pool(), broken, { window: 'full', totalEntries: 40 });
    expect(outcomes).toEqual([
      { organizationId: 7, recorded: true },
      { organizationId: 9, recorded: false, error: expect.stringMatching(/refused for organisation 9/) },
    ]);
  }, 60_000);
});
