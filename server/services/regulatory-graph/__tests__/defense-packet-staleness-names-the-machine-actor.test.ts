/**
 * A packet marked stale by a propagation no user started is audited as the
 * staleness service, by name — not as 'system'.
 *
 * What the code used to do (until 2026-10-15): markPacketsStale wrote each
 * DEFENSE_PACKET_STALE_DETECTED audit event with `userId: ctx.userId ?? 'system'`,
 * so every push propagation without a stated user (the change router's
 * cascades, a route with no session user) was attributed to 'system' — an actor
 * no reader can identify. A stated user is still recorded as given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  audit: vi.fn(async (..._a: unknown[]) => ({ persisted: true, chained: true, tamperProof: true })),
  downstream: vi.fn(async (..._a: unknown[]) => ({ nodes: [] as unknown[], edges: [] as unknown[] })),
}));

vi.mock('../../../db', () => {
  const select = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => h.rows,
      then: (resolve: (rows: unknown[]) => void) => resolve(h.rows),
    };
    return chain;
  };
  return {
    pool: { query: async (text: string, values: unknown[]) => {
      if (text.startsWith('UPDATE predicate.defense_packets')) {
        return { rows: (h.rows as Array<{ id: string; status: string }>).filter(row => row.status === 'RENDERED' && (values[1] as string[]).includes(row.id)).map(row => ({ id: row.id })) };
      }
      return { rows: h.rows };
    } },
    db: {
      select,
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  };
});
vi.mock('../../data-lineage-service', () => ({
  recordLineageBatch: async () => 0,
  traceDownstream: (...a: unknown[]) => h.downstream(...a),
  traceUpstream: async () => ({ nodes: [], edges: [] }),
}));
vi.mock('../../audit/auditLogger', () => ({ logAuditEvent: (e: unknown) => h.audit(e) }));

import {
  propagateEvidenceChange,
  TARGET_TYPE_DEFENSE_PACKET,
} from '../defense-packet-staleness.service';

const ORG = 42;

beforeEach(() => {
  h.audit.mockClear();
  h.rows = [{ id: 'pkt-1', status: 'RENDERED', organizationId: ORG }];
  h.downstream.mockResolvedValue({
    nodes: [{ objectType: TARGET_TYPE_DEFENSE_PACKET, objectId: 'pkt-1' }],
    edges: [],
  });
});

describe('markPacketsStale — who the stale-packet audit event names', () => {
  it('names the staleness service when no user started the propagation', async () => {
    const out = await propagateEvidenceChange(ORG, 'ev-A');
    expect(out.markedStaleCount).toBe(1);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      action: 'DEFENSE_PACKET_STALE_DETECTED',
      userId: 'system+defense-packet-staleness@concept2cure.local',
    });
  });

  it('records the user a caller stated, as given', async () => {
    await propagateEvidenceChange(ORG, 'ev-A', 'evidence_changed', '3');
    expect(h.audit.mock.calls[0][0]).toMatchObject({ userId: '3' });
  });
});
