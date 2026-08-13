/**
 * Tamper-proof audit log — content-hash write/verify symmetry.
 *
 * Regression for a defect where verifyChain() recomputed the content hash over
 * a DIFFERENT field set than log() hashed at write time: the writer folded the
 * full client context (including ip_address / user_agent) into the content
 * hash, but the verifier omitted ip_address / user_agent. Consequences:
 *   1. An untampered entry written WITH an IP/userAgent failed verification
 *      (false "content tampered" report).
 *   2. ip_address / user_agent were not actually covered by the hash, so
 *      tampering with those audit fields went undetected.
 *
 * These tests drive log() + verifyChain() through an in-memory fake Pool (no
 * real Postgres) so the write and verify hash paths must agree byte-for-byte.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Pool } from 'pg';
import { TamperProofAuditLog } from '../tamper-proof-audit';

beforeAll(() => {
  // Deterministic signature key; not production-sensitive in a unit test.
  process.env.AUDIT_HMAC_SECRET = 'test-tamper-proof-secret';
});

interface StoredRow {
  id: string;
  sequence_number: number;
  event_type: string;
  event_timestamp: Date;
  user_id: string | null;
  user_name: string | null;
  session_id: string | null;
  correlation_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  details: unknown;
  previous_hash: string;
  content_hash: string;
  chain_hash: string;
  signature: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Re-key an object the way Postgres re-keys a `jsonb` value: keys are stored
 * shortest-first, then bytewise, NOT in the order they were written.
 *
 * This matters because `details` is a jsonb column. The original FakePool
 * round-tripped it with `JSON.parse`, which preserves insertion order — so the
 * fake agreed with the writer's key order in a way real Postgres never does,
 * and the suite passed green while every multi-key entry failed verification on
 * an actual database. Emulating the reordering here is what makes these tests
 * able to see that class of defect at all.
 */
function jsonbReorder<T>(value: T): T {
  if (Array.isArray(value)) return value.map(jsonbReorder) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const src = value as Record<string, unknown>;
    const keys = Object.keys(src).sort((a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = jsonbReorder(src[k]);
    return out as unknown as T;
  }
  return value;
}

/**
 * Minimal in-memory stand-in for a pg Pool that supports exactly the queries
 * TamperProofAuditLog.log()/verifyChain() issue: the advisory chain lock, the
 * lockless tail lookup, the INSERT, BEGIN/COMMIT/ROLLBACK, and the ORDER BY
 * sequence_number scan.
 *
 * Deliberately STRICT: an unrecognized query throws instead of returning empty
 * rows. That is what caught the append path gaining `pg_advisory_xact_lock`
 * (the chain-fork fix) — 6 tests failed loudly in CI rather than passing
 * against a silently-absorbed query, which is exactly how a strict fake should
 * age. When the class's SQL changes, extend this list; never soften the throw.
 */
class FakePool {
  rows: StoredRow[] = [];
  private seq = 0;

  private async run(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    const s = sql.trim();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
      return { rows: [] };
    }
    if (/pg_advisory_xact_lock/i.test(s)) {
      // The append path takes a transaction-scoped advisory lock so concurrent
      // writers serialize (LIMIT 1 FOR UPDATE locked nothing on an empty table
      // and the chain forked — see tests/db/part11-audit-store.dbtest.ts, which
      // proves the concurrency behavior against real Postgres). This fake is
      // single-threaded, so the lock is a no-op here; hash symmetry is what
      // these tests own.
      return { rows: [] };
    }
    if (/ORDER BY sequence_number DESC LIMIT 1/i.test(s)) {
      const last = this.rows[this.rows.length - 1];
      return { rows: last ? [{ chain_hash: last.chain_hash, sequence_number: last.sequence_number }] : [] };
    }
    if (s.startsWith('INSERT INTO audit.tamper_proof_log')) {
      const [
        id, event_type, event_timestamp, user_id, user_name, session_id,
        correlation_id, resource_type, resource_id, action, details,
        previous_hash, content_hash, chain_hash, signature, ip_address, user_agent,
      ] = params as any[];
      this.rows.push({
        id, sequence_number: ++this.seq, event_type, event_timestamp,
        user_id: user_id ?? null, user_name: user_name ?? null, session_id: session_id ?? null,
        correlation_id: correlation_id ?? null, resource_type: resource_type ?? null,
        resource_id: resource_id ?? null, action,
        // jsonb, not text: Postgres hands this back re-keyed, so the fake must too.
        details: jsonbReorder(typeof details === 'string' ? JSON.parse(details) : details),
        previous_hash, content_hash, chain_hash, signature: signature ?? null,
        ip_address: ip_address ?? null, user_agent: user_agent ?? null,
      });
      return { rows: [] };
    }
    if (/FROM audit\.tamper_proof_log/i.test(s) && /ORDER BY sequence_number ASC/i.test(s)) {
      return { rows: this.rows.map((r) => ({ ...r })) };
    }
    throw new Error(`FakePool: unhandled query: ${s.slice(0, 80)}`);
  }

  query = (sql: string, params?: unknown[]) => this.run(sql, params);
  connect = async () => ({
    query: (sql: string, params?: unknown[]) => this.run(sql, params),
    release: () => {},
  });
}

function newLog(): { log: TamperProofAuditLog; pool: FakePool } {
  const pool = new FakePool();
  const log = new TamperProofAuditLog(pool as unknown as Pool);
  return { log, pool };
}

describe('TamperProofAuditLog content-hash symmetry', () => {
  it('verifies an untampered entry written WITH ip_address and user_agent', async () => {
    const { log } = newLog();
    await log.log(
      'USER_LOGIN',
      'User authenticated',
      { method: 'password' },
      {
        userId: 'u-1',
        userName: 'Alice',
        sessionId: 's-1',
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (regression-test)',
      },
    );

    const result = await log.verifyChain();
    // Before the fix the writer hashed ip/userAgent but the verifier did not,
    // so this untampered chain was reported as content-tampered.
    expect(result.valid).toBe(true);
    expect(result.invalidReason).toBeUndefined();
  });

  it('detects tampering with ip_address (now covered by the content hash)', async () => {
    const { log, pool } = newLog();
    await log.log(
      'RECORD_UPDATED',
      'Updated record',
      { field: 'x' },
      { userId: 'u-2', ipAddress: '198.51.100.1', userAgent: 'agent/1' },
    );

    // Tamper the stored ip_address directly (simulating a DB-level edit).
    pool.rows[0].ip_address = '10.0.0.1';

    const result = await log.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.invalidReason).toMatch(/content_hash mismatch/i);
  });

  it('still verifies an entry written WITHOUT optional client context', async () => {
    const { log } = newLog();
    await log.log('SYSTEM_STARTUP', 'boot', {}, {});
    const result = await log.verifyChain();
    expect(result.valid).toBe(true);
  });

  /**
   * Regression for the defect that made audit_chain_integrity fail on a fresh
   * database with a single, untampered entry — and therefore blocked boot in
   * production, where that self-test check is critical.
   *
   * `details` is jsonb, so Postgres returns its keys shortest-first rather than
   * in write order. Hashing with plain JSON.stringify made the writer's bytes
   * and the verifier's bytes differ for any details object with two or more
   * keys, and the row was reported as "Content tampered".
   *
   * The details shape below is the exact one that surfaced it: the entry
   * verifyChain() writes about itself.
   */
  it('verifies an entry whose details keys are reordered by jsonb storage', async () => {
    const { log, pool } = newLog();
    await log.log(
      'AUDIT_VERIFICATION_PASSED',
      'Audit chain verification completed successfully',
      { entriesVerified: 0, startSequence: 1, endSequence: 9, verifiedAt: '2026-08-06T01:00:45.794Z' },
      { correlationId: 'verify-1' },
    );

    // Guard the guard: if the fake ever stops reordering, this test would pass
    // for the wrong reason and the defect could return unseen.
    // Shortest key first, then bytewise: verifiedAt(10) < endSequence(11) <
    // startSequence(13) < entriesVerified(15) — i.e. nothing like write order.
    expect(Object.keys(pool.rows[0].details as Record<string, unknown>)).toEqual([
      'verifiedAt',
      'endSequence',
      'startSequence',
      'entriesVerified',
    ]);

    const result = await log.verifyChain();
    expect(result.invalidReason).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it('detects tampering with details even though key order is normalized', async () => {
    const { log, pool } = newLog();
    await log.log(
      'RECORD_UPDATED',
      'Updated record',
      { field: 'dose', from: '10mg', to: '20mg' },
      { userId: 'u-3' },
    );

    // Reordering keys must NOT be treated as tampering; changing a value must.
    (pool.rows[0].details as Record<string, unknown>).to = '200mg';

    const result = await log.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.invalidReason).toMatch(/content_hash mismatch/i);
  });

  it('verifies nested objects regardless of the order jsonb returns them in', async () => {
    const { log } = newLog();
    await log.log(
      'DOCUMENT_SIGNED',
      'Signature applied',
      { signature: { meaning: 'approval', signedBy: 'u-9', reason: 'QA release' }, sectionCount: 12 },
      { userId: 'u-9', resourceType: 'document', resourceId: 'doc-1' },
    );

    const result = await log.verifyChain();
    expect(result.valid).toBe(true);
  });
});
