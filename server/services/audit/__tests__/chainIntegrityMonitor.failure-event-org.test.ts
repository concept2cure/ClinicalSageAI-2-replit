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

describe('chain integrity failure event', () => {
  it('goes to each affected organisation, with only that organisation\'s links', async () => {
    const inserts: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        if (/^\s*SELECT/i.test(sql) && /FROM audit_events/i.test(sql)) {
          return { rows: [
            { id: 1, organization_id: 7, sequence_number: 1, record_hash: 'a1', previous_hash: null },
            { id: 2, organization_id: 7, sequence_number: 2, record_hash: 'a2', previous_hash: 'TAMPERED' },
            { id: 3, organization_id: 9, sequence_number: 1, record_hash: 'b1', previous_hash: null },
            { id: 4, organization_id: 9, sequence_number: 2, record_hash: 'b2', previous_hash: 'b1' },
            { id: 5, organization_id: 12, sequence_number: 1, record_hash: 'c1', previous_hash: null },
            { id: 6, organization_id: 12, sequence_number: 2, record_hash: 'c2', previous_hash: 'WRONG' },
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
