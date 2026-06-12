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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import type { DispatchGateVerdict } from '../ind-dispatch-gate';

// Holder is hoisted so the db mock can read it lazily (set in beforeAll).
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import {
  createDispatchSnapshot,
  listDispatchSnapshots,
  getLatestDispatchSnapshot,
} from '../ind-dispatch-snapshot-service';
import { createSponsor, listSponsors, getSponsor } from '../../ind-master-data/ind-master-data-service';

let harness: IndPgliteDb;
const ctx = { organizationId: 1, userId: 9 };

const verdict = (canDispatch: boolean): DispatchGateVerdict => ({
  canDispatch,
  blockers: canDispatch ? [] : [{ code: 'MISSING_CHECKSUMS', message: 'x' }],
  warnings: [],
  summary: { missingRequiredSections: 0, totalLeaves: 3, missingChecksums: canDispatch ? 0 : 1, criticalActions: 0, unknownSections: 0 },
});

beforeAll(async () => {
  harness = await createIndPgliteDb();
  holder.db = harness.db;
});
afterAll(async () => {
  await harness.close();
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
  it('persists a verdict and lists it newest-first', async () => {
    const blocked = await createDispatchSnapshot(
      { submissionId: 7, sequenceId: 42, sequenceNumber: '0001', verdict: verdict(false) },
      ctx,
    );
    expect(blocked.canDispatch).toBe(false);
    expect(blocked.blockerCount).toBe(1);
    expect(blocked.blockerCodes).toEqual(['MISSING_CHECKSUMS']);

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
