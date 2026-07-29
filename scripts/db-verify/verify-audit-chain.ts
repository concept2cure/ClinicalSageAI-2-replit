/**
 * Audit hash-chain integrity verification (run with DATABASE_URL set, via tsx).
 *
 * The governance guarantee has two pillars: RLS (tenant isolation — verify-rls.ts)
 * and the audit_logs sha256 hash-chain (tamper-evidence, 21 CFR Part 11 §11.10(e)).
 * The main harness only checks the chain column is POPULATED; this proves it
 * actually VERIFIES and that tampering is DETECTED, for the governed actions the
 * new research-admin domains write.
 *
 * Run verify-research-compliance.ts first so governed-action rows exist, then:
 *   npx tsx scripts/db-verify/verify-audit-chain.ts
 *
 * Tamper tests run inside transactions that are ROLLED BACK — the real chain is
 * never corrupted.
 */
import { pool } from '../../server/db';
import { verifyAuditChain } from '../../server/services/audit/chain';

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

async function main() {
  const c = await pool.connect();
  try {
    console.log('\n[Audit] hash-chain of governed actions verifies (tamper-evidence)');
    const base = await verifyAuditChain(c);
    ok(base.rowsChecked >= 1, `governed-action audit rows present to verify (${base.rowsChecked})`);
    ok(base.ok === true, `the sha256 hash-chain is intact across all ${base.rowsChecked} rows (re-derivation matches stored)`);

    // ── Tamper a row's CONTENT (rolled back) → re-derivation must break at that row.
    await c.query('BEGIN');
    const mid = await c.query(
      `SELECT id FROM audit_logs WHERE sha256_chain IS NOT NULL
        ORDER BY occurred_at ASC, id ASC
        OFFSET GREATEST(0, (SELECT count(*) FROM audit_logs WHERE sha256_chain IS NOT NULL) / 2) LIMIT 1`);
    const vid = String(mid.rows[0].id);
    await c.query(`UPDATE audit_logs SET target = COALESCE(target, '') || '-TAMPERED' WHERE id = $1`, [vid]);
    const t1 = await verifyAuditChain(c);
    ok(t1.ok === false, 'tampering with a row’s content is DETECTED (chain breaks)');
    ok(t1.brokenAt != null && String(t1.brokenAt.id) === vid, 'the verifier pinpoints the exact tampered row');
    await c.query('ROLLBACK');

    // ── Tamper the STORED hash itself (rolled back) → also detected.
    await c.query('BEGIN');
    const first = await c.query(`SELECT id FROM audit_logs WHERE sha256_chain IS NOT NULL ORDER BY occurred_at ASC, id ASC LIMIT 1`);
    await c.query(`UPDATE audit_logs SET sha256_chain = repeat('f', 64) WHERE id = $1`, [String(first.rows[0].id)]);
    const t2 = await verifyAuditChain(c);
    ok(t2.ok === false, 'tampering with the stored chain hash is DETECTED');
    await c.query('ROLLBACK');

    // ── After rollback, the chain verifies again (no residual corruption from the test).
    const after = await verifyAuditChain(c);
    ok(after.ok === true && after.rowsChecked === base.rowsChecked, 'chain verifies again after the tamper transactions roll back (test left no trace)');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    console.error('HARNESS ERROR', e); fail++;
  } finally {
    c.release();
  }

  console.log(`\n==== AUDIT-CHAIN VERIFICATION: ${pass} passed, ${fail} failed ====`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
