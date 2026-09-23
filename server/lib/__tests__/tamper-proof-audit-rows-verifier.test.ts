/**
 * verifyTamperProofLogRows — the pure walk the class's verifyChain and the ops
 * verifier (scripts/ops/verify-audit-chain.mjs) both run. Rows are produced by
 * the SAME static helpers the writer uses, then each integrity property is
 * broken in turn and the verifier must name it.
 */
import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'crypto';
import { TamperProofAuditLog, verifyTamperProofLogRows, type TamperProofLogRow } from '../tamper-proof-audit';

const SECRET = 'unit-test-audit-hmac-secret-0123456789abcdef';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function chain(n: number, secret = SECRET): TamperProofLogRow[] {
  const rows: TamperProofLogRow[] = [];
  let prev = '0'.repeat(64);
  for (let i = 1; i <= n; i++) {
    const ts = new Date(Date.UTC(2026, 8, 20, 0, 0, i));
    const details = { zeta: i, alpha: 'x' }; // jsonb re-keys; the canonical form must not care
    const content = TamperProofAuditLog.buildContentData({ eventType: 'DOCUMENT_CREATED', action: `a${i}`, details, timestamp: ts, userId: '7' });
    const content_hash = sha256(TamperProofAuditLog.stringifyForHash(content));
    const chain_hash = sha256(content_hash + prev);
    rows.push({
      sequence_number: i, event_type: 'DOCUMENT_CREATED', action: `a${i}`, details: { alpha: 'x', zeta: i },
      event_timestamp: ts, user_id: '7', previous_hash: prev, content_hash, chain_hash,
      signature: createHmac('sha256', secret).update(chain_hash).digest('hex'),
    });
    prev = chain_hash;
  }
  return rows;
}

describe('verifyTamperProofLogRows', () => {
  it('an intact chain verifies, with every signature counted', () => {
    const r = verifyTamperProofLogRows(chain(5), { hmacSecret: SECRET });
    expect(r).toMatchObject({ valid: true, entriesVerified: 5, signedEntries: 5 });
    expect(r.lastChainHash).toBe(chain(5)[4].chain_hash);
  });
  it('an empty table is valid with zero entries', () => {
    expect(verifyTamperProofLogRows([], { hmacSecret: SECRET })).toMatchObject({ valid: true, entriesVerified: 0 });
  });
  it('names a content edit', () => {
    const rows = chain(4);
    rows[2].action = 'edited';
    expect(verifyTamperProofLogRows(rows, { hmacSecret: SECRET })).toMatchObject({ valid: false, firstInvalidEntry: 3, invalidReason: expect.stringMatching(/Content tampered/) });
  });
  it('names a broken link (previous_hash)', () => {
    const rows = chain(4);
    rows[1].previous_hash = 'f'.repeat(64);
    expect(verifyTamperProofLogRows(rows, { hmacSecret: SECRET })).toMatchObject({ valid: false, firstInvalidEntry: 2, invalidReason: expect.stringMatching(/previous_hash mismatch/) });
  });
  it('names a recomputed-but-unsigned forgery (chain_hash consistent, signature under the wrong secret)', () => {
    const rows = chain(3, 'attacker-secret');
    expect(verifyTamperProofLogRows(rows, { hmacSecret: SECRET })).toMatchObject({ valid: false, firstInvalidEntry: 1, invalidReason: expect.stringMatching(/Signature invalid/) });
  });
  it('a deleted row breaks the row after it', () => {
    const rows = chain(4);
    rows.splice(1, 1);
    expect(verifyTamperProofLogRows(rows, { hmacSecret: SECRET })).toMatchObject({ valid: false, firstInvalidEntry: 3 });
  });
  it('accepts the pre-canonicalization legacy content hash', () => {
    const rows = chain(1);
    const content = TamperProofAuditLog.buildContentData({ eventType: 'DOCUMENT_CREATED', action: 'a1', details: { alpha: 'x', zeta: 1 }, timestamp: rows[0].event_timestamp, userId: '7' });
    rows[0].content_hash = sha256(TamperProofAuditLog.legacyStringifyForVerify(content));
    rows[0].chain_hash = sha256(rows[0].content_hash + rows[0].previous_hash);
    rows[0].signature = createHmac('sha256', SECRET).update(rows[0].chain_hash).digest('hex');
    expect(verifyTamperProofLogRows(rows, { hmacSecret: SECRET }).valid).toBe(true);
  });
});
