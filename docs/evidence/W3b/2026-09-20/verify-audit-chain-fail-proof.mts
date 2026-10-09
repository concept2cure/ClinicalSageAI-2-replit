/**
 * Verify-by-making-it-fail for scripts/ops/verify-audit-chain.mjs.
 * Everything happens inside ONE transaction that is ROLLED BACK: rows are
 * inserted into the three chained tables, verified (OK), then each table has
 * one row corrupted (immutability trigger disabled inside the same transaction,
 * as superuser) and verified again (BROKEN, first break named). Nothing persists.
 */
import pg from 'pg';
import { createHash, createHmac } from 'node:crypto';
import { TamperProofAuditLog } from '../../../../server/lib/tamper-proof-audit.ts';
import { computeAuditChainSealed } from '../../../../server/services/audit/chain.ts';
import { verifyAuditChains, renderReport } from '../../../../scripts/ops/verify-audit-chain.mjs';

const SECRET = 'fail-proof-audit-hmac-secret-0123456789abcdef';
const SEAL_KEY = 'fail-proof-audit-hmac-seal-key-0123456789abcdef';
const env = { ...process.env, AUDIT_HMAC_SECRET: SECRET, AUDIT_HMAC_KEY: SEAL_KEY, NODE_ENV: 'development' };
process.env.AUDIT_HMAC_KEY = SEAL_KEY; // chain.ts maybeSeal reads process.env
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const counts = async () => (await client.query("SELECT (SELECT count(*) FROM audit.tamper_proof_log) a, (SELECT count(*) FROM audit_logs) b, (SELECT count(*) FROM audit_events) c")).rows[0];
console.log('row counts before:', await counts());
await client.query('BEGIN');
try {
  // ── seed audit.tamper_proof_log with the writer's own recipe ──
  let prev = '0'.repeat(64);
  for (let i = 1; i <= 3; i++) {
    const ts = new Date(Date.UTC(2026, 8, 20, 12, 0, i));
    const details = { zeta: i, alpha: 'fail-proof' };
    const content = TamperProofAuditLog.buildContentData({ eventType: 'DOCUMENT_CREATED', action: `seed-${i}`, details, timestamp: ts, userId: '1' });
    const contentHash = sha(TamperProofAuditLog.stringifyForHash(content));
    const chainHash = sha(contentHash + prev);
    await client.query(
      `INSERT INTO audit.tamper_proof_log (id, event_type, event_timestamp, user_id, action, details, previous_hash, content_hash, chain_hash, signature)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      ['DOCUMENT_CREATED', ts, '1', `seed-${i}`, JSON.stringify(details), prev, contentHash, chainHash, createHmac('sha256', SECRET).update(chainHash).digest('hex')]);
    prev = chainHash;
  }
  // ── seed public.audit_logs through the shared sealed chain writer ──
  for (let i = 1; i <= 3; i++) {
    const row = { action: `seed.${i}`, actor_id: 1, target: `doc:${i}`, payload_hash: sha(`p${i}`), occurred_at: new Date(Date.UTC(2026, 8, 20, 12, 1, i)) };
    const sealed = await computeAuditChainSealed(client, row);
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, table_name, record_id, actor_id, target, payload_hash, sha256_chain, occurred_at, hmac_seal)
       VALUES (1, 1, $1, 'documents', $2, 1, $3, $4, $5, $6, $7)`,
      [row.action, String(i), row.target, row.payload_hash, sealed.sha256Chain, row.occurred_at, sealed.hmacSeal]);
  }
  // ── seed public.audit_events (the DB trigger chains them; seals deferred per the HMAC plan) ──
  for (let i = 1; i <= 3; i++) {
    await client.query(`INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_name, reason) VALUES (1, 'CREATE', 'document', $1, 'seed', $2)`, [i, `seed reason ${i}`]);
  }
  console.log('row counts inside transaction:', await counts());

  const intact = await verifyAuditChains(client, env);
  console.log('\n=== intact ===\n' + renderReport(intact));
  if (intact.verdict !== 'ok') throw new Error('expected OK on intact seeded chains');

  const corruptions: Array<[string, string]> = [
    ['audit.tamper_proof_log', `ALTER TABLE audit.tamper_proof_log DISABLE TRIGGER trg_prevent_audit_mutation; UPDATE audit.tamper_proof_log SET action = 'TAMPERED' WHERE sequence_number = (SELECT min(sequence_number) + 1 FROM audit.tamper_proof_log)`],
    ['public.audit_logs', `ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_no_update; UPDATE audit_logs SET payload_hash = repeat('f', 64) WHERE action = 'seed.2'`],
    ['public.audit_events', `ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_no_update; UPDATE audit_events SET reason = 'TAMPERED' WHERE reason = 'seed reason 2'`],
  ];
  for (const [table, sql] of corruptions) {
    await client.query('SAVEPOINT corrupt');
    await client.query(sql);
    const r = await verifyAuditChains(client, env);
    const t = r.tables.find((x: any) => x.table === table);
    console.log(`\n=== corrupted one row in ${table} ===\nverdict: ${r.verdict.toUpperCase()} exitCode=${r.exitCode}\n${table}: ${t.status.toUpperCase()} firstBreak=${JSON.stringify(t.firstBreak)}`);
    if (r.verdict !== 'broken' || t.status !== 'broken') throw new Error(`verifier did not catch the corruption in ${table}`);
    await client.query('ROLLBACK TO SAVEPOINT corrupt');
  }
  const again = await verifyAuditChains(client, env);
  console.log(`\nafter rolling each corruption back to its savepoint: ${again.verdict.toUpperCase()}`);
} finally {
  await client.query('ROLLBACK');
  console.log('\nROLLBACK issued. row counts after:', await counts());
  await client.end();
}
