/**
 * A cascade no user started is logged as the change router, by name — not 'system'.
 *
 * Until 2026-10-15 the router handed the reactive-dependency service
 * `triggeredBy: req.userId ?? 'system'`, so every propagation the Drift
 * Sentinel (or any caller without a user) fanned out was recorded in
 * impact_propagation_log as triggered by 'system' — an actor no reader can
 * identify. A caller's stated user is still recorded as given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  reactive: vi.fn(async (..._a: unknown[]) => ({
    triggerType: 'assumption_updated',
    triggerObjectId: '42',
    downstreamImpacted: 0,
    actions: [],
  })),
}));

vi.mock('../../regulatory-graph/defense-packet-staleness.service', () => ({
  propagateClaimChange: async () => ({ affectedPacketIds: [], markedStaleCount: 0 }),
  propagateEvidenceChange: async () => ({ affectedPacketIds: [], markedStaleCount: 0 }),
  propagatePredicateChange: async () => ({ affectedPacketIds: [], markedStaleCount: 0 }),
  propagateRiskVocabChange: async () => ({ affectedPacketIds: [], markedStaleCount: 0 }),
}));
vi.mock('../../reactive-dependency-service', () => ({
  reactiveDependencyService: { propagateChange: (a: unknown) => h.reactive(a) },
}));
vi.mock('../../../db', () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));

import { propagateRegulatoryChange } from '../change-router.service';

const REQ = {
  organizationId: 11,
  programId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  legacyProgramId: 99,
  event: 'claim_changed' as const,
  sourceId: '42',
};

beforeEach(() => h.reactive.mockClear());

describe('propagateRegulatoryChange — who triggered the cascade', () => {
  it('names the change router when no user started it', async () => {
    await propagateRegulatoryChange({ ...REQ });
    expect(h.reactive).toHaveBeenCalledTimes(1);
    expect(h.reactive.mock.calls[0][0]).toMatchObject({ triggeredBy: 'system+change-router@concept2cure.local' });
  });

  it('records the user a caller stated, as given', async () => {
    await propagateRegulatoryChange({ ...REQ, userId: '3' });
    expect(h.reactive.mock.calls[0][0]).toMatchObject({ triggeredBy: '3' });
  });
});
