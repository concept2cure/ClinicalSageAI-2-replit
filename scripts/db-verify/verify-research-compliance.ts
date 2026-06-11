/**
 * DB verification harness (run with DATABASE_URL set, via tsx).
 * Exercises the GOVERNED service paths end-to-end against real Postgres:
 * audit chain + provenance + domain invariants. Not committed — verification only.
 */
import { pool } from '../../server/db';
import { recordGovernedAction } from '../../server/routes/c2c/actions';
import * as fcoi from '../../server/services/financial-disclosures/fcoi-service';
import * as ha from '../../server/services/ha-interactions/ha-service';
import * as iacuc from '../../server/services/iacuc/iacuc-service';
import * as cs from '../../server/services/controlled-substances/cs-service';

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

async function tx<T>(fn: (c: any) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

async function main() {
  const ORG = 1, USER = 1;
  await pool.query(`INSERT INTO organizations(id,name) VALUES ($1,'Org A') ON CONFLICT DO NOTHING`, [ORG]);
  await pool.query(`INSERT INTO users(id,email) VALUES ($1,'u@x') ON CONFLICT DO NOTHING`, [USER]);
  await pool.query(`INSERT INTO submissions(id,organization_id) VALUES (1,$1) ON CONFLICT DO NOTHING`, [ORG]);

  console.log('\n[FCOI] create → certify → provenance → audit → signature invalidation');
  const auditBefore = Number((await pool.query(`SELECT count(*) n FROM audit_logs`)).rows[0].n);
  const { discId } = await tx(async (c) => {
    const inv = await fcoi.createInvestigatorTx(c, ORG, USER, { fullName: 'Dr Verify', role: 'principal_investigator' });
    const d = await fcoi.createDisclosureTx(c, ORG, USER, { investigatorId: inv.id, submissionId: 1, hasDisclosableInterests: true, disclosurePeriodStart: '2025-01-01', disclosurePeriodEnd: '2026-01-01' });
    ok(d.formType === 'FDA_3455', 'disclosure derives FDA_3455 from hasDisclosableInterests=true');
    await fcoi.addInterestTx(c, ORG, USER, d.id, { interestType: 'EQUITY_INTEREST', description: 'options', arrangementsToMinimizeBias: 'blinded' });
    const cert = await fcoi.certifyDisclosureTx(c, ORG, USER, d.id, 'Certified');
    ok(cert.contentHash.length === 64, 'certify computed a sha256 content hash');
    ok(cert.provenanceLinkId != null, 'certify wrote a provenance link to Module 1');
    await recordGovernedAction(c, { orgId: ORG, userId: USER, command: 'sign', target: `financial-disclosure:${d.id}`, reason: 'verify certify', domain: 'fcoi' });
    return { discId: d.id };
  });
  const link = await pool.query(`SELECT * FROM provenance_links WHERE source_type='financial_disclosure' AND source_id=$1`, [discId]);
  ok(link.rows.length === 1 && link.rows[0].target_type === 'submission_module1', 'provenance_links row: financial_disclosure → submission_module1');
  const signed = await pool.query(`SELECT status, content_hash FROM financial_disclosures WHERE id=$1`, [discId]);
  ok(signed.rows[0].status === 'signed' && signed.rows[0].content_hash, 'disclosure persisted as signed with content_hash');
  const auditAfter = Number((await pool.query(`SELECT count(*) n FROM audit_logs`)).rows[0].n);
  ok(auditAfter > auditBefore, `audit_logs rows written (${auditBefore} → ${auditAfter})`);
  const chain = await pool.query(`SELECT sha256_chain FROM audit_logs WHERE sha256_chain IS NOT NULL ORDER BY occurred_at DESC, id DESC LIMIT 1`);
  ok(chain.rows[0]?.sha256_chain?.length === 64, 'audit sha256 hash-chain populated');
  const acts = await pool.query(`SELECT count(*) n FROM c2c_ana_actions WHERE domain='fcoi'`);
  ok(Number(acts.rows[0].n) >= 1, 'c2c_ana_actions ledger row written (domain=fcoi)');
  // signature invalidation on edit
  const upd = await tx((c) => fcoi.updateDisclosureTx(c, ORG, discId, { hasDisclosableInterests: true, reason: 'edit' } as any));
  ok(upd.signatureInvalidated === true, 'editing a signed disclosure invalidates the signature');
  const reverted = await pool.query(`SELECT status, content_hash FROM financial_disclosures WHERE id=$1`, [discId]);
  ok(reverted.rows[0].status === 'draft' && reverted.rows[0].content_hash === null, 'post-edit: status→draft, content_hash cleared');

  console.log('\n[Controlled Substances] perpetual ledger — negative inventory rejected');
  const subId = await tx(async (c) => {
    const reg = await cs.createRegistrationTx(c, ORG, USER, { registrantName: 'Lab', deaNumber: 'BX1234567', businessActivity: 'researcher', schedules: ['II'] });
    const s = await cs.createSubstanceTx(c, ORG, USER, { substanceName: 'Test-II', deaSchedule: 'II', deaRegistrationId: reg.id });
    return s.id;
  });
  const t1 = await tx((c) => cs.recordTransactionTx(c, ORG, USER, subId, { transactionType: 'receipt', quantity: 10 }));
  ok(t1.balanceAfter === 10, 'receipt sets balance to 10');
  const t2 = await tx((c) => cs.recordTransactionTx(c, ORG, USER, subId, { transactionType: 'use', quantity: 4 }));
  ok(t2.balanceAfter === 6, 'use 4 → balance 6');
  let rejected = false;
  try { await tx((c) => cs.recordTransactionTx(c, ORG, USER, subId, { transactionType: 'use', quantity: 100 })); }
  catch (e: any) { rejected = e?.code === 'INVALID_STATE'; }
  ok(rejected, 'use 100 on balance 6 is REJECTED (no negative inventory)');
  const bal = await pool.query(`SELECT current_balance FROM controlled_substances WHERE id=$1`, [subId]);
  ok(Number(bal.rows[0].current_balance) === 6, 'balance remains 6 after rejected transaction');

  console.log('\n[HA] commitment threads provenance to submission');
  const commitProv = await tx(async (c) => {
    const ix = await ha.createInteractionTx(c, ORG, USER, { interactionType: 'pre_nda', agency: 'fda', title: 'pre-NDA', submissionId: 1 });
    const cm = await ha.createCommitmentTx(c, ORG, USER, { commitmentType: 'pmr', description: 'PMR study', submissionId: 1, sourceInteractionId: ix.id });
    return cm.provenanceLinkIds.length;
  });
  ok(commitProv === 2, 'commitment wrote 2 provenance links (interaction→commitment, commitment→submission)');

  console.log('\n[IACUC] approval stamps 3-yr expiration + Module 4 provenance');
  await pool.query(`INSERT INTO clinical_studies(id,organization_id,study_id,title) VALUES (1,$1,'S1','t') ON CONFLICT DO NOTHING`, [ORG]);
  const iacucRes = await tx(async (c) => {
    const p = await iacuc.createProtocolTx(c, ORG, USER, { protocolNumber: 'A1', title: 'tox', painCategory: 'C', submissionId: 1, threeRsReplacement: 'x', threeRsReduction: 'y', threeRsRefinement: 'z' });
    const r = await iacuc.recordReviewTx(c, ORG, USER, p.id, { reviewType: 'designated_member_review', outcome: 'approved', determinationDate: '2026-01-01' });
    return r;
  });
  ok(iacucRes.expirationDate === '2029-01-01', `approval set 3-year expiration (${iacucRes.expirationDate})`);
  ok(iacucRes.provenanceLinkId != null, 'IACUC approval wrote provenance link to Module 4');

  console.log(`\n==== DB VERIFICATION: ${pass} passed, ${fail} failed ====`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
