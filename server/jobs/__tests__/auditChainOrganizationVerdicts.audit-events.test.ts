/**
 * The nightly sweep's verdict on one organisation's audit_events chain, after it
 * moved onto the one walk of that chain (services/audit/audit-event-chain.ts).
 *
 * docs/evidence/D5-AUDIT-EVENT-CHAIN/2026-11-12/. The verdict compared stored
 * pointers over five columns. Three things changed, and each case below fails
 * against the verdict as it was:
 *
 *   - it reads the columns the stored hash was computed over;
 *   - a row altered with its hashes left alone is an incident, and is named as
 *     an altered entry, not a broken link;
 *   - a row that names no predecessor after a hashed one is unverified, not ok.
 *
 * The sweep's own suite (auditChainIntegritySweep.test.ts) covers the alert
 * path and the other stores.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../services/audit/chain.js', () => ({ verifyAuditEventsChainSeals: vi.fn() }));
vi.mock('../../services/audit/audit-integrity-service.js', () => ({
  // No audit_logs row for this organisation: that store gives no verdict here.
  verifyAuditIntegrity: vi.fn(async () => ({ chain: { ok: true, rowsChecked: 0 }, seals: { checked: false, reason: 'not under test' } })),
}));

import { verifyOrganization } from '../auditChainOrganizationVerdicts';
import type { AuditEventChainRow } from '../../services/audit/audit-event-chain';
import { chainRows, soundChain } from '../../services/audit/__tests__/_audit-event-chain-fixtures';

/** A connection that answers the one audit_events read, and records what was asked. */
function clientOf(rows: AuditEventChainRow[]) {
  const asked: string[] = [];
  const client = {
    query: async (sql: string) => {
      asked.push(sql);
      if (sql.includes('FROM audit_events')) return { rows };
      throw new Error(`unexpected query in test: ${sql}`);
    },
  };
  return { client: client as unknown as Parameters<typeof verifyOrganization>[0], asked };
}

const linkageOf = async (rows: AuditEventChainRow[]) => {
  const { client, asked } = clientOf(rows);
  const sweep = await verifyOrganization(client, 1, { present: true, sealKey: false });
  return { linkage: sweep.linkage, asked };
};

describe("one organisation's audit_events verdict", () => {
  it('control: a chain as the trigger writes it is ok, over every row', async () => {
    const { linkage } = await linkageOf(soundChain(1, 3));
    expect(linkage).toMatchObject({ store: 'audit_events.linkage', status: 'ok', rowsChecked: 3 });
  });

  it('reads the columns the stored hash was computed over, the timestamp as the database prints it', async () => {
    const { asked } = await linkageOf(soundChain(1, 2));
    const sql = asked.find((q) => q.includes('FROM audit_events'));
    // Five columns were read. The walk needs every hashed one, and a timestamp
    // re-rendered by the driver can never equal the hashed text.
    expect(sql).toContain('"timestamp"::text AS timestamp_text');
    expect(sql).toMatch(/event_type, entity_type,\s+entity_id, user_id, user_name/);
  });

  it('a row altered with its hashes left alone is broken, and is not called a broken link', async () => {
    const rows = soundChain(1, 3);
    rows[1].reason = 'back-dated after the fact';
    const { linkage } = await linkageOf(rows);
    expect(linkage).toMatchObject({ status: 'broken', firstFailure: String(rows[1].id), rowsChecked: 3 });
    expect(linkage?.reason).toBe('1 entry does not match the hash recorded when it was written.');
  });

  it('a row that names no predecessor after a hashed one is unverified, not ok', async () => {
    const { linkage } = await linkageOf(chainRows([{ id: 1, org: 1, seq: 1 }, { id: 2, org: 1, seq: 2, prev: null }]));
    expect(linkage?.status).toBe('unverifiable');
    expect(linkage?.reason).toMatch(/no previous_hash although their predecessor was hashed/);
  });

  it('an organisation with no audit_events row gives this store no verdict', async () => {
    const { linkage } = await linkageOf([]);
    expect(linkage).toBeNull();
  });
});
