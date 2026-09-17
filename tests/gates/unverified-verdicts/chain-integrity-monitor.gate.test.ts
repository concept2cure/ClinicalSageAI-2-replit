/**
 * WO-16C finding 72 — the §11.10(e) continuous chain-integrity monitor.
 *
 * `runCheck` in server/services/audit/chainIntegrityMonitor.ts had two states
 * for three outcomes. `findBrokenChainLinks` never compares a row that carries
 * no `record_hash` (line 93 assigned that NULL into `prevHashByOrg`, so line
 * 86's `expectedPrev !== null` guard short-circuited the successor too) and
 * never counted the rows it skipped. `runCheck` then read
 * `brokenDetails.length === 0` as `status: 'healthy'`, published
 * `totalEntries: rows.length` — every row, checked or not — with
 * `brokenLinks: 0`, and logged
 *
 *     chain integrity verified — all links intact { entries: N }
 *
 * every five minutes. Over an audit_events table whose rows predate the
 * 2026-09-10 hash-chain trigger deploy, nothing was verified and the monitor
 * named the full row count as verified. That verdict is returned verbatim as
 * `data` by GET /api/audit/chain-monitor/status and POST
 * /api/audit/chain-monitor/check, whose own comment calls it §11.10(e)
 * compliance evidence. The empty table had the same defect in its own branch:
 * zero rows returned 'healthy'. The two sibling surfaces — signedAuditExport's
 * snapshot and the part11-compliance chain-integrity route — were given a
 * fourth state and an unhashed counter in a668d73e2 (WO-16B); this monitor was
 * not in that commit.
 *
 * HOW THE FAILURE IS INJECTED: at the dependency. `startChainMonitor(pool)`
 * takes the pg Pool, so the test hands it a pool whose `query()` answers the
 * chain SELECT the way a database would — with rows that carry no
 * `record_hash`, with a mixture, with none at all. Nothing in the module under
 * test is mocked; only the logger is intercepted, to read the line an inspector
 * would be shown.
 *
 * RED on the pre-fix head: 'healthy' for the unhashed, mixed and empty cases,
 * and the "all links intact" line emitted over rows nothing could check.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logs = vi.hoisted(() => ({
  info: [] as Array<{ msg: string; ctx: unknown }>,
  warn: [] as Array<{ msg: string; ctx: unknown }>,
  error: [] as Array<{ msg: string; ctx: unknown }>,
}));

vi.mock('../../../server/utils/logger', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../server/utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({
      info: (msg: string, ctx?: unknown) => void logs.info.push({ msg, ctx }),
      warn: (msg: string, ctx?: unknown) => void logs.warn.push({ msg, ctx }),
      error: (msg: string, ctx?: unknown) => void logs.error.push({ msg, ctx }),
      debug: () => {},
    }),
  };
});

import {
  runOnDemandCheck,
  startChainMonitor,
  stopChainMonitor,
} from '../../../server/services/audit/chainIntegrityMonitor';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

type Row = {
  id: number;
  organization_id: number;
  sequence_number: number;
  record_hash: string | null;
  previous_hash: string | null;
};

const row = (
  id: number,
  org: number,
  seq: number,
  recordHash: string | null,
  previousHash: string | null,
): Row => ({
  id,
  organization_id: org,
  sequence_number: seq,
  record_hash: recordHash,
  previous_hash: previousHash,
});

/** A pool that answers the monitor's chain SELECT with `rows`. */
function poolServing(rows: Row[]) {
  const calls: string[] = [];
  return {
    calls,
    query: (sql: string) => {
      calls.push(sql);
      if (/INSERT INTO audit_events/i.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows, rowCount: rows.length });
    },
  };
}

const INTACT_LOG = 'chain integrity verified — all links intact';
const sawIntactLog = () => logs.info.some(l => l.msg === INTACT_LOG);

beforeEach(() => {
  // The monitor schedules a first check 10s after start and then an interval.
  // Fake timers keep both out of this test's way; only runOnDemandCheck runs.
  vi.useFakeTimers();
  logs.info.length = 0;
  logs.warn.length = 0;
  logs.error.length = 0;
});

afterEach(() => {
  stopChainMonitor();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('chain integrity monitor: a verdict only when something was verified', () => {
  it('a table in which no row carries a record_hash is "unverified", not "healthy"', async () => {
    const pool = poolServing([
      row(1, 1, 1, null, null),
      row(2, 1, 2, null, null),
      row(3, 1, 3, null, null),
    ]);
    startChainMonitor(pool as any, 60_000);

    const status = await runOnDemandCheck();

    expect(status.status).toBe('unverified');
    expect(status.totalEntries).toBe(3);
    expect(status.hashedEntries).toBe(0);
    expect(status.unhashedEntries).toBe(3);
    expect(status.brokenLinks).toBe(0);
    expect(status.reason).toMatch(/no row carries a record_hash/i);
    expect(sawIntactLog()).toBe(false);
    assertNoVerdictClaims(status, 'chain-monitor status (no row hashed)');
  });

  it('a partly-hashed table is "unverified" and says how many links could not be checked', async () => {
    // The shape a database takes after 05957d6e8 put the hash-chain trigger on
    // the applier: pre-existing rows stay NULL forever (UPDATE is blocked by
    // the immutability trigger), new rows are hashed.
    const pool = poolServing([
      row(1, 1, 1, null, null),
      row(2, 1, 2, null, null),
      row(3, 1, 3, 'h3', null),
      row(4, 1, 4, 'h4', 'h3'),
    ]);
    startChainMonitor(pool as any, 60_000);

    const status = await runOnDemandCheck();

    expect(status.status).toBe('unverified');
    expect(status.totalEntries).toBe(4);
    expect(status.hashedEntries).toBe(2);
    expect(status.unhashedEntries).toBe(2);
    expect(status.brokenLinks).toBe(0);
    expect(status.reason).toMatch(/2 of 4/);
    expect(sawIntactLog()).toBe(false);
    assertNoVerdictClaims(status, 'chain-monitor status (partly hashed)');
  });

  it('an empty audit_events is "unverified" with a reason — nothing to verify is not verified', async () => {
    const pool = poolServing([]);
    startChainMonitor(pool as any, 60_000);

    const status = await runOnDemandCheck();

    expect(status.status).toBe('unverified');
    expect(status.totalEntries).toBe(0);
    expect(status.hashedEntries).toBe(0);
    expect(status.unhashedEntries).toBe(0);
    expect(status.reason).toMatch(/no entries/i);
    expect(sawIntactLog()).toBe(false);
  });

  it('a fully hashed, intact chain is still "healthy" — and only then is the log line emitted', async () => {
    const pool = poolServing([
      row(1, 1, 1, 'h1', null),
      row(2, 1, 2, 'h2', 'h1'),
      row(3, 1, 3, 'h3', 'h2'),
    ]);
    startChainMonitor(pool as any, 60_000);

    const status = await runOnDemandCheck();

    expect(status.status).toBe('healthy');
    expect(status.totalEntries).toBe(3);
    expect(status.hashedEntries).toBe(3);
    expect(status.unhashedEntries).toBe(0);
    expect(status.brokenLinks).toBe(0);
    expect(sawIntactLog()).toBe(true);
    expect(logs.info.find(l => l.msg === INTACT_LOG)?.ctx).toMatchObject({ entries: 3 });
  });

  it('a positive finding of tampering outranks "cannot tell"', async () => {
    const pool = poolServing([
      row(1, 1, 1, 'h1', null),
      row(2, 1, 2, 'h2', 'h1'),
      row(3, 1, 3, 'h3', 'TAMPERED'),
      row(4, 1, 4, null, null), // unhashed as well — 'broken' must still win
    ]);
    startChainMonitor(pool as any, 60_000);

    const status = await runOnDemandCheck();

    expect(status.status).toBe('broken');
    expect(status.brokenLinks).toBe(1);
    expect(status.details).toEqual([{ id: 3, sequenceNumber: 3, orgId: 1 }]);
    expect(status.unhashedEntries).toBe(1);
    expect(sawIntactLog()).toBe(false);
  });
});
