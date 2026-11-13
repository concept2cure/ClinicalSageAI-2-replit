/**
 * A broken audit chain is recorded in the chain of the organisation it belongs
 * to.
 *
 * On a break, the monitor wrote its `audit.chain_integrity_failure` event with
 * organization_id hard-coded to 1: every tenant's broken chain was reported in
 * organisation 1's audit trail, with the other organisations' link details in
 * its metadata, and never in the trail of the organisation whose records were
 * affected. Each affected organisation now gets one event, in its own chain,
 * naming only its own broken links.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../background-jobs-metrics', () => ({
  recordBackgroundJobRun: () => undefined,
  registerBackgroundJob: () => undefined,
  BACKGROUND_JOB: { AUDIT_CHAIN_MONITOR: 'audit-chain-monitor' },
}));

import { runOnDemandCheck, startChainMonitor, stopChainMonitor } from '../chainIntegrityMonitor';
import { chainRows } from './_audit-event-chain-fixtures';

describe('chain integrity failure event', () => {
  it('goes to each affected organisation, with only that organisation\'s links', async () => {
    const inserts: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/^\s*SELECT/i.test(sql) && /FROM audit_events/i.test(sql)) {
          return { rows: [
            // Hashed as the trigger hashes them (the walk re-computes each row):
            // organisations 7 and 12 each carry one wrong pointer, 9 is sound.
            ...chainRows([
              { id: 1, org: 7, seq: 1 },
              { id: 2, org: 7, seq: 2, prev: 'TAMPERED' },
              { id: 3, org: 9, seq: 1 },
              { id: 4, org: 9, seq: 2 },
              { id: 5, org: 12, seq: 1 },
              { id: 6, org: 12, seq: 2, prev: 'WRONG' },
            ]),
          ] };
        }
        if (/INSERT INTO audit_events/i.test(sql)) inserts.push({ sql, params });
        return { rows: [] };
      }),
    };
    startChainMonitor(pool as never, 60_000);
    stopChainMonitor();
    const status = await runOnDemandCheck();
    expect(status.status).toBe('broken');

    expect(inserts.map((i) => i.params[0]).sort()).toEqual([12, 7]);
    for (const i of inserts) {
      expect(i.sql).not.toMatch(/VALUES\s*\(\s*1\s*,/);
      const meta = JSON.parse(String(i.params[2]));
      expect(meta.brokenLinks.every((l: { orgId: number }) => l.orgId === i.params[0])).toBe(true);
    }
  });
});
