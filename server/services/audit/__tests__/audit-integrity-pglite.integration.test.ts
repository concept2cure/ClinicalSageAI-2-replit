/**
 * Audit integrity verification — END-TO-END against in-process PGlite.
 *
 * Seeds a real sha256-chained + HMAC-sealed audit_logs chain (via the actual
 * writer, computeAuditChainSealed) and verifies it; then tampers a row and
 * confirms the verifier catches it. No Neon/docker.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { computeAuditChainSealed, type ChainRow, type PoolClient } from '../chain';
import { verifyAuditIntegrity } from '../audit-integrity-service';
import { randomUUID } from 'crypto';

let pglite: PGlite;
const KEY = 'test-audit-hmac-key';

async function appendRow(row: ChainRow): Promise<void> {
  const { sha256Chain, hmacSeal } = await computeAuditChainSealed(pglite as unknown as PoolClient, row);
  await pglite.query(
    `INSERT INTO audit_logs (id, action, actor_id, target, payload_hash, occurred_at, sha256_chain, hmac_seal)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [randomUUID(), row.action, row.actor_id, row.target, row.payload_hash, row.occurred_at, sha256Chain, hmacSeal],
  );
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(AUDIT_LOGS_PGLITE_DDL);
});
afterAll(async () => {
  await pglite.close();
});
beforeEach(async () => {
  process.env.AUDIT_HMAC_KEY = KEY;
  await pglite.exec('DELETE FROM audit_logs;');
});

function row(i: number): ChainRow {
  return {
    action: `act.${i}`,
    actor_id: 7,
    target: `case:${i}`,
    payload_hash: 'a'.repeat(64),
    occurred_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  };
}

describe('verifyAuditIntegrity against PGlite', () => {
  it('reports ok for an intact, sealed chain', async () => {
    for (let i = 0; i < 4; i++) await appendRow(row(i));
    const result = await verifyAuditIntegrity(pglite as unknown as PoolClient);
    expect(result.chain.ok).toBe(true);
    expect(result.seals).toMatchObject({ checked: true, valid: true });
    expect(result.ok).toBe(true);
  });

  it('detects a tampered row (broken sha256 chain)', async () => {
    for (let i = 0; i < 3; i++) await appendRow(row(i));
    await pglite.query(`UPDATE audit_logs SET target = 'tampered' WHERE action = 'act.1'`);
    const result = await verifyAuditIntegrity(pglite as unknown as PoolClient);
    expect(result.chain.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('fails closed (unverifiable, ok=false) when AUDIT_HMAC_KEY is absent', async () => {
    // Part 11 integrity (audit finding B-13): an unsealed/unverifiable chain
    // must NOT report ok=true. The sha256 chain may still be intact, but with
    // no HMAC key the seals cannot be checked, so overall integrity is
    // unverifiable and the verifier fails closed.
    for (let i = 0; i < 2; i++) await appendRow(row(i));
    delete process.env.AUDIT_HMAC_KEY;
    const result = await verifyAuditIntegrity(pglite as unknown as PoolClient);
    expect(result.chain.ok).toBe(true);
    expect(result.seals).toMatchObject({ checked: false });
    expect(result.ok).toBe(false);
  });

  it('is ok for an empty log', async () => {
    const result = await verifyAuditIntegrity(pglite as unknown as PoolClient);
    expect(result.chain.ok).toBe(true);
    expect(result.ok).toBe(true);
  });
});
