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
 * Minimal in-memory stand-in for a pg Pool that supports exactly the queries
 * TamperProofAuditLog.log()/verifyChain() issue: the FOR UPDATE tail lookup,
 * the INSERT, BEGIN/COMMIT/ROLLBACK, and the ORDER BY sequence_number scan.
 */
class FakePool {
  rows: StoredRow[] = [];
  private seq = 0;

  private async run(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
    const s = sql.trim();
    if (s.startsWith('BEGIN') || s.startsWith('COMMIT') || s.startsWith('ROLLBACK')) {
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
        details: typeof details === 'string' ? JSON.parse(details) : details,
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
});
