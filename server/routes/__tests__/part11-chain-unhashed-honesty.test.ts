/**
 * Part 11 §11.10(e) — an UNHASHED audit chain is not an intact one.
 *
 * `/audit-trail/chain-integrity` re-computes each row's `record_hash` and reports
 * whether the tamper-evident chain verifies. Its guard used to read
 *
 *     if (row.record_hash && row.record_hash !== expectedHash) { ...broken... }
 *
 * so a row whose `record_hash` is NULL was falsy, skipped the comparison
 * entirely, and still ran `totalVerified++`. `prevHashByOrg[oid]` was then set to
 * that NULL, which also self-disabled the `previous_hash` linkage check (it is
 * null-guarded on both sides). With `brokenLinks` left empty the route answered
 *
 *     chainStatus: 'intact', integrityValid: true, totalEntries: <every row>,
 *     verificationMethod: 'Full re-computation of SHA-256 hash chain from database records'
 *
 * — a positive assertion of cryptographic tamper-evidence over a chain in which
 * nothing was verified. This is not hypothetical: `record_hash` is nullable and
 * the trigger that would populate it,
 * `db/migrations/20260222_audit_events_hash_chain.sql`, is NOT listed in
 * `C2C_MIGRATION_FILES` (scripts/db/migration-set.mjs carries only its
 * `_immutability` sibling), so on a canonically-provisioned database every row
 * is NULL and the console reported a fully verified trail over zero hashes.
 *
 * The honest third state already exists downstream: Part11Console types
 * `integrityValid: boolean | null` and renders null as "Not verifiable". These
 * tests pin the server actually emitting it.
 */
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

import router from '../part11-compliance';

function makeApp() {
  const app = express();
  app.use(express.json());
  (app as any).pool = { query: mockQuery };
  app.use((req: any, _res, next) => {
    req.dbClient = { query: mockQuery };
    req.user = { id: 1, organizationId: 101, roles: ['admin'] };
    req.tenantContext = { organizationId: 101 };
    next();
  });
  app.use('/api/part11', router);
  return app;
}

const TS = new Date('2026-08-14T09:00:00Z');

function row(over: Record<string, unknown> = {}) {
  return {
    id: 1, organization_id: 101, sequence_number: 1, event_type: 'CREATE',
    entity_type: 'doc', entity_id: 'D1', user_id: 'u1', user_name: 'A',
    timestamp: TS, reason: 'r', record_hash: null, previous_hash: null,
    ...over,
  };
}

/** The exact payload + digest the route re-computes, so a row can be made to verify. */
function realHash(r: ReturnType<typeof row>) {
  const payload =
    (r.sequence_number ?? '') + '|' +
    (r.event_type ?? '') + '|' +
    (r.entity_type ?? '') + '|' +
    (r.entity_id ?? '') + '|' +
    (r.user_id ?? '') + '|' +
    (r.user_name ?? '') + '|' +
    (r.timestamp ? new Date(r.timestamp).toISOString().replace('T', ' ').replace('Z', '+00') : '') + '|' +
    (r.reason ?? '') + '|' +
    (r.previous_hash ?? 'GENESIS');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

const get = () => request(makeApp()).get('/api/part11/audit-trail/chain-integrity');

describe('chain-integrity — unhashed rows are never reported as an intact chain', () => {
  beforeEach(() => { mockQuery.mockReset(); });

  it('an all-NULL-hash chain is UNVERIFIABLE, not intact', async () => {
    mockQuery.mockResolvedValue({
      rows: [row({ id: 1, sequence_number: 1 }), row({ id: 2, sequence_number: 2 })],
    });
    const res = await get();
    expect(res.status).toBe(200);
    // The pre-fix answer was 'intact' / true — a fabricated tamper-evidence claim.
    expect(res.body.data.chainStatus).toBe('unverifiable');
    expect(res.body.data.chainStatus).not.toBe('intact');
    expect(res.body.data.integrityValid).toBeNull();
    expect(res.body.data.integrityValid).not.toBe(true);
    expect(res.body.data.unhashedEntries).toBe(2);
    expect(res.body.data.verifiedEntries).toBe(0);
  });

  it('does not claim a full re-computation it never performed', async () => {
    mockQuery.mockResolvedValue({ rows: [row()] });
    const res = await get();
    expect(res.body.data.compliance.verificationMethod).not.toMatch(/^Full re-computation/);
    expect(res.body.data.compliance.verificationMethod).toMatch(/could not be verified/i);
    expect(res.body.data.compliance.tamperEvident).toMatch(/could NOT be verified/i);
  });

  it('does not present a genesis hash that appears in no row as the chain lastHash', async () => {
    mockQuery.mockResolvedValue({ rows: [row()] });
    const res = await get();
    // The `|| lastAuditHash` fallback surfaced a computeHash('GENESIS_BLOCK_TRIALSAGE')
    // derived value as though it were the chain's real last hash.
    expect(res.body.data.lastHash).toBeNull();
  });

  it('one unhashed row taints an otherwise-verifying chain', async () => {
    const good = row({ id: 1, sequence_number: 1 });
    mockQuery.mockResolvedValue({
      rows: [
        { ...good, record_hash: realHash(good) },
        row({ id: 2, sequence_number: 2, record_hash: null }),
      ],
    });
    const res = await get();
    expect(res.body.data.chainStatus).toBe('unverifiable');
    expect(res.body.data.integrityValid).toBeNull();
    expect(res.body.data.verifiedEntries).toBe(1);
    expect(res.body.data.unhashedEntries).toBe(1);
  });

  it('a genuinely verifying chain is still reported intact (fix does not over-refuse)', async () => {
    const good = row({ id: 1, sequence_number: 1 });
    mockQuery.mockResolvedValue({ rows: [{ ...good, record_hash: realHash(good) }] });
    const res = await get();
    expect(res.body.data.chainStatus).toBe('intact');
    expect(res.body.data.integrityValid).toBe(true);
    expect(res.body.data.unhashedEntries).toBe(0);
    expect(res.body.data.verifiedEntries).toBe(1);
    expect(res.body.data.compliance.verificationMethod).toMatch(/^Full re-computation/);
  });

  it('a real tampered row still reads BROKEN, which outranks unverifiable', async () => {
    mockQuery.mockResolvedValue({
      rows: [row({ id: 1, record_hash: 'not-the-right-hash' }), row({ id: 2, sequence_number: 2 })],
    });
    const res = await get();
    expect(res.body.data.chainStatus).toBe('broken');
    expect(res.body.data.integrityValid).toBe(false);
  });
});
