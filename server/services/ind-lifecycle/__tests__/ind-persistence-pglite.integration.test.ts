/**
 * IND persistence — END-TO-END against a real (in-process PGlite) Postgres.
 *
 * Proves the DB-backed services actually execute their SQL — no Neon, no docker,
 * no cloud. PGlite is a pure-WASM Postgres; we point the services' `db` import at
 * a drizzle-over-PGlite instance with the IND tables applied, and exercise the
 * real service code paths (insert/select with RETURNING, ordering, jsonb).
 *
 * The audit sink is stubbed (audit_logs lives in the core schema, out of scope
 * for this IND-table harness).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import type { DispatchSnapshotVerdict } from '../ind-dispatch-snapshot-service';

// Holder is hoisted so the db mock can read it lazily (set in beforeAll).
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));

import {
  createDispatchSnapshot,
  listDispatchSnapshots,
  getLatestDispatchSnapshot,
} from '../ind-dispatch-snapshot-service';
import { createSponsor, listSponsors, getSponsor } from '../../ind-master-data/ind-master-data-service';
import auditService from '../../auditService';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };

const verdict = (canDispatch: boolean): DispatchSnapshotVerdict => ({
  canDispatch,
  blockers: canDispatch ? [] : [{ code: 'CROSS_REFERENCE_LOA_MISSING', message: 'x' }],
  warnings: [],
  source: 'assess-dispatch-readiness',
});

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
});
afterAll(async () => {
  await harness.close();
});
afterEach(() => {
  vi.mocked(auditService.logAction).mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
});

describe('master-data service against PGlite', () => {
  it('creates and reads back a sponsor (org-scoped)', async () => {
    const created = await createSponsor({ name: 'Acme Therapeutics', contactEmail: 'ra@acme.example' } as any, ctx);
    expect(created.id).toBeTruthy();
    expect(created.organizationId).toBe(1);

    const got = await getSponsor(created.id, ctx);
    expect(got.name).toBe('Acme Therapeutics');

    const list = await listSponsors(ctx);
    expect(list.map((s) => s.id)).toContain(created.id);
  });

  it('does not leak across organizations', async () => {
    const a = await createSponsor({ name: 'Org-1 Sponsor' } as any, ctx);
    const other = await listSponsors({ organizationId: 2 });
    expect(other.map((s) => s.id)).not.toContain(a.id);
  });
});

describe('dispatch-snapshot service against PGlite', () => {
  for (const failure of ['resolved', 'thrown'] as const) {
    it(`keeps a saved verdict visible after ${failure} supplemental audit failure`, async () => {
      const sink = vi.mocked(auditService.logAction);
      if (failure === 'resolved') sink.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'synthetic private audit detail' });
      else sink.mockRejectedValue(new Error('synthetic private audit detail'));
      const saved = await createDispatchSnapshot({ submissionId: 81, sequenceId: 841, sequenceNumber: '0041', verdict: verdict(false) }, ctx);
      expect(saved).toMatchObject({ canDispatch: false, auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } });
      expect(JSON.stringify(saved)).not.toContain('synthetic private audit detail');
      expect((await listDispatchSnapshots(841, ctx)).some(row => row.id === saved.id)).toBe(true);
    });
  }
  it('persists a verdict and lists it newest-first', async () => {
    const blocked = await createDispatchSnapshot(
      { submissionId: 7, sequenceId: 42, sequenceNumber: '0001', verdict: verdict(false) },
      ctx,
    );
    expect(blocked.canDispatch).toBe(false);
    expect(blocked.blockerCount).toBe(1);
    expect(blocked.blockerCodes).toEqual(['CROSS_REFERENCE_LOA_MISSING']);
    // P-33: the row records the gate that produced it, so cockpit drift can tell an old row from a new one.
    expect((blocked.verdict as { source?: string }).source).toBe('assess-dispatch-readiness');

    const ready = await createDispatchSnapshot(
      { submissionId: 7, sequenceId: 42, sequenceNumber: '0001', verdict: verdict(true) },
      ctx,
    );

    const history = await listDispatchSnapshots(42, ctx);
    expect(history).toHaveLength(2);
    // newest first
    expect(history[0].id).toBe(ready.id);

    const latest = await getLatestDispatchSnapshot(42, ctx);
    expect(latest?.id).toBe(ready.id);
    expect(latest?.canDispatch).toBe(true);
  });

  it('getLatestDispatchSnapshot returns null for a sequence with no snapshots', async () => {
    expect(await getLatestDispatchSnapshot(9999, ctx)).toBeNull();
  });
});
