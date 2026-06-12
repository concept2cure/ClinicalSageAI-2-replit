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
import * as roster from '../../server/services/research-compliance/roster-service';
import { resolveComplianceChecklist, evaluateTrainingGate } from '../../server/services/research-compliance/compliance-checklist';
import { computeDomainReport } from '../../server/services/report-os/research-compliance-report-providers';
import { emitDeadlineTask } from '../../server/services/research-compliance/tasking-bridge';
import * as effort from '../../server/services/effort-certification/effort-service';
import * as coi from '../../server/services/research-security/coi-service';
import { bridgeIngestedStudyTx, mapStudyType } from '../../server/services/preclinical/preclinical-governed-bridge';
import * as grants from '../../server/services/grants/grants-service';

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

  console.log('\n[Foundation] training gate — no index until trained');
  const profile = { involvesHumanSubjects: true, involvesAnimals: false, involvesRecombinantDNA: false, involvesHumanGeneTransfer: false, fundingSource: 'nih' as const, region: 'us' as const };
  const checklist = resolveComplianceChecklist(profile);
  ok(checklist.requiredApprovals.some((a) => a.committee === 'IRB'), 'checklist requires IRB for NIH human research');
  const piId = await tx((c) => roster.createPersonnelTx(c, ORG, USER, { fullName: 'Dr Gate', role: 'principal_investigator' })).then((r:any)=>r.id);
  let g = evaluateTrainingGate((await roster.loadRosterForGate(ORG, [piId])).personnel, checklist.requiredTraining, (await roster.loadRosterForGate(ORG, [piId])).records, '2026-06-10');
  ok(g.cleared === false && g.missing.length > 0, 'gate BLOCKS a PI with no training');
  for (const t of ['citi_human_subjects','citi_gcp','citi_rcr','fcoi_disclosure']) {
    await tx((c) => roster.addTrainingTx(c, ORG, USER, piId, { trainingType: t as any, completedDate: '2025-01-01', expiresDate: '2027-01-01' }));
  }
  const loaded = await roster.loadRosterForGate(ORG, [piId]);
  g = evaluateTrainingGate(loaded.personnel, checklist.requiredTraining, loaded.records, '2026-06-10');
  ok(g.cleared === true, 'gate CLEARS once the PI completes all required training (DB-backed)');

  console.log('\n[Reports] domain providers compute real numbers from the DB');
  const fcoiRep = await computeDomainReport('fcoi.disclosure_register', ORG);
  ok(fcoiRep != null && (fcoiRep!.summary.disclosures as number) >= 1 && fcoiRep!.provider.status === 'ready', `fcoi.disclosure_register computes (disclosures=${fcoiRep?.summary.disclosures})`);
  const csRep = await computeDomainReport('controlled_substances.inventory_ledger', ORG);
  ok(csRep != null && (csRep!.summary.substances as number) >= 1, `controlled_substances.inventory_ledger computes (substances=${csRep?.summary.substances})`);
  const haRep = await computeDomainReport('ha.commitment_register', ORG);
  ok(haRep != null && (haRep!.summary.commitments as number) >= 1, `ha.commitment_register computes (commitments=${haRep?.summary.commitments})`);
  const unknown = await computeDomainReport('not.a.domain.report', ORG);
  ok(unknown === null, 'unknown report type → null (generic orchestrator unchanged)');

  console.log('\n[Effort Certification] add-on — lines, validation gate, certify, content hash');
  // Reuse the trained PI (piId) as the certifier subject.
  const certId = await tx((c) => effort.createCertificationTx(c, ORG, USER, { personnelId: piId, periodStart: '2026-01-01', periodEnd: '2026-06-30' })).then((r: any) => r.id);
  await tx((c) => effort.addLineTx(c, ORG, USER, certId, { activityLabel: 'R01', committedPct: 40, actualPct: 40, awardId: null }));
  await tx((c) => effort.addLineTx(c, ORG, USER, certId, { activityLabel: 'Teaching', committedPct: 60, actualPct: 60, awardId: null }));
  const certRes = await tx((c) => effort.certifyTx(c, ORG, USER, certId));
  ok(certRes.contentHash.length === 64, 'effort certify computes a sha256 content hash');
  const certRow = await pool.query(`SELECT status, content_hash FROM effort_certifications WHERE id=$1`, [certId]);
  ok(certRow.rows[0].status === 'certified' && certRow.rows[0].content_hash, 'effort statement persisted as certified with content_hash');
  // Over-100% statement must be REJECTED at certify (deterministic gate is the floor).
  const badCert = await tx((c) => effort.createCertificationTx(c, ORG, USER, { personnelId: piId, periodStart: '2026-07-01', periodEnd: '2026-12-31' })).then((r: any) => r.id);
  await tx((c) => effort.addLineTx(c, ORG, USER, badCert, { activityLabel: 'A', committedPct: 70, actualPct: 70, awardId: null }));
  await tx((c) => effort.addLineTx(c, ORG, USER, badCert, { activityLabel: 'B', committedPct: 50, actualPct: 50, awardId: null }));
  let effortRejected = false;
  try { await tx((c) => effort.certifyTx(c, ORG, USER, badCert)); } catch (e: any) { effortRejected = e?.code === 'INVALID_STATE'; }
  ok(effortRejected, 'certify REJECTED when total committed > 100% (no over-commit certify)');

  console.log('\n[Research Security / COI] add-on — disclosure, foreign-nexus flag, review');
  const coiRes = await tx((c) => coi.createDisclosureTx(c, ORG, USER, { personnelId: piId, disclosureType: 'foreign_appointment', entityName: 'Overseas University', country: 'CN' }));
  ok(coiRes.foreignFlag === true, 'foreign_appointment disclosure raises the research-security foreign flag');
  const coiUs = await tx((c) => coi.createDisclosureTx(c, ORG, USER, { personnelId: piId, disclosureType: 'financial_interest', entityName: 'US Startup', country: 'US' }));
  ok(coiUs.foreignFlag === false, 'US financial interest does not raise the foreign flag');
  await tx((c) => coi.reviewDisclosureTx(c, ORG, USER, coiRes.id, { status: 'managed', managementPlan: 'recuse from review' }));
  const coiRow = await pool.query(`SELECT status, management_plan FROM coi_disclosures WHERE id=$1`, [coiRes.id]);
  ok(coiRow.rows[0].status === 'managed' && coiRow.rows[0].management_plan != null, 'COI review persists status=managed + management plan');

  console.log('\n[Reports] effort + research-security domain providers compute real numbers');
  const effRep = await computeDomainReport('effort.certification_register', ORG);
  ok(effRep != null && (effRep!.summary.statements as number) >= 1 && (effRep!.summary.certified as number) >= 1, `effort.certification_register computes (statements=${effRep?.summary.statements}, certified=${effRep?.summary.certified})`);
  const coiRep = await computeDomainReport('research_security.coi_register', ORG);
  ok(coiRep != null && (coiRep!.summary.disclosures as number) >= 2 && (coiRep!.summary.foreignNexus as number) >= 1, `research_security.coi_register computes (disclosures=${coiRep?.summary.disclosures}, foreignNexus=${coiRep?.summary.foreignNexus})`);

  console.log('\n[Preclinical bridge] digested study → governed registry + Module 4 provenance');
  ok(mapStudyType('genotox') === 'genotoxicity' && mapStudyType('dart') === 'reproductive_tox' && mapStudyType('tk') === 'adme_pk', 'mapStudyType maps extraction taxonomy → CTD Module 4 study-type union');
  const SYNTHETIC_CTD_ID = 90001; // provenance source int (ctd_nonclinical_studies row); generic spine, no FK
  const synthData: any = {
    studyType: 'repeat_dose_tox', studyTitle: '13-week oral toxicity in rat', species: 'Rattus norvegicus',
    strain: 'Sprague-Dawley', glpCompliant: true, noael: '50 mg/kg/day', studyReportNumber: 'TX-2026-013',
    testingFacility: 'Acme GLP Labs', extractionConfidence: 0.92,
  };
  const bridged = await tx(async (c) => {
    const b = await bridgeIngestedStudyTx(c, ORG, USER, { ctdStudyId: SYNTHETIC_CTD_ID, data: synthData, sourcePdfId: 'pdf-verify-1', submissionId: 1, iacucProtocolId: null });
    await recordGovernedAction(c, { orgId: ORG, userId: USER, command: 'create', target: `nonclinical-study:${b.governedStudyId}`, reason: 'verify preclinical bridge', domain: 'nonclinical', surface: 'preclinical-ingest' });
    return b;
  });
  ok(bridged.governedStudyId > 0 && bridged.ctdSection.startsWith('4.2'), `bridge created governed study (id ${bridged.governedStudyId}, CTD ${bridged.ctdSection})`);
  const govRow = await pool.query(`SELECT study_type, species, glp_compliant, submission_id FROM nonclinical_studies WHERE id=$1`, [bridged.governedStudyId]);
  ok(govRow.rows[0].study_type === 'repeat_dose_tox' && govRow.rows[0].glp_compliant === true && Number(govRow.rows[0].submission_id) === 1, 'governed study persisted with mapped type, GLP flag, submission link');
  const derivedLink = await pool.query(`SELECT * FROM provenance_links WHERE source_type='ctd_nonclinical_study' AND source_id=$1 AND target_type='nonclinical_study' AND target_id=$2`, [SYNTHETIC_CTD_ID, bridged.governedStudyId]);
  ok(derivedLink.rows.length === 1 && derivedLink.rows[0].link_role === 'derived_from', 'provenance: ctd_nonclinical_study → nonclinical_study (derived_from)');
  const m4Link = await pool.query(`SELECT * FROM provenance_links WHERE source_type='nonclinical_study' AND source_id=$1 AND target_type='submission_module4'`, [bridged.governedStudyId]);
  ok(m4Link.rows.length === 1 && m4Link.rows[0].link_role === 'supports', 'provenance: nonclinical_study → submission_module4 (supports)');
  const ncRep = await computeDomainReport('nonclinical.study_send_register', ORG);
  ok(ncRep != null && (ncRep!.summary.studies as number) >= 1, `nonclinical.study_send_register computes (studies=${ncRep?.summary.studies})`);

  console.log('\n[Grants] milestone lifecycle + closeout (2 CFR 200.344) — finalize is gated');
  const awardId = await tx((c) => grants.createAwardTx(c, ORG, USER, { awardNumber: `AWD-${Date.now()}`, fundingAgency: 'nih', periodStart: '2024-01-01', periodEnd: '2025-01-01' })).then((r: any) => r.id);
  const mid = await tx((c) => grants.addMilestoneTx(c, ORG, USER, awardId, { title: 'Year-1 RPPR', milestoneType: 'progress_report', dueDate: '2024-12-01' })).then((r: any) => r.id);
  await tx((c) => grants.setMilestoneStatusTx(c, ORG, mid, 'met', null));
  const mrow = await pool.query(`SELECT status, completed_date FROM grant_milestones WHERE id=$1`, [mid]);
  ok(mrow.rows[0].status === 'met' && mrow.rows[0].completed_date != null, 'milestone → met stamps completed_date (lifecycle completed)');

  const co = await tx((c) => grants.openCloseoutTx(c, ORG, USER, awardId));
  ok(co.closeoutDueDate === '2025-05-01', `closeout opened with 2 CFR 200.344 due date period_end+120 (${co.closeoutDueDate})`);
  // Opening a second closeout for the same award is rejected (one per award).
  let dupRejected = false;
  try { await tx((c) => grants.openCloseoutTx(c, ORG, USER, awardId)); } catch (e: any) { dupRejected = e?.code === 'INVALID_STATE'; }
  ok(dupRejected, 'a second closeout for the same award is REJECTED (one per award)');
  // Finalize with outstanding items is blocked by the deterministic gate.
  let prematureBlocked = false;
  try { await tx((c) => grants.finalizeCloseoutTx(c, ORG, USER, awardId)); } catch (e: any) { prematureBlocked = e?.code === 'INVALID_STATE'; }
  ok(prematureBlocked, 'finalize BLOCKED while closeout items are outstanding (gate is the floor)');
  await tx((c) => grants.updateCloseoutTx(c, ORG, USER, awardId, { finalRpprSubmitted: true, finalFfrSubmitted: true, equipmentInventoryReturned: true, finalInvoicesReconciled: true }));
  const fin = await tx((c) => grants.finalizeCloseoutTx(c, ORG, USER, awardId));
  ok(fin.closedAward === true, 'finalize succeeds once all four items complete; closes the award');
  const arow = await pool.query(`SELECT a.status AS award_status, c.status AS closeout_status FROM grant_awards a JOIN grant_closeout_records c ON c.award_id=a.id WHERE a.id=$1`, [awardId]);
  ok(arow.rows[0].award_status === 'closed' && arow.rows[0].closeout_status === 'completed', 'award status=closed, closeout status=completed after finalize');
  const grRep = await computeDomainReport('grants.portfolio_register', ORG);
  ok(grRep != null && grRep!.summary.closeoutsByStatus != null && (grRep!.summary.closeoutsByStatus as any).completed >= 1, 'grants.portfolio_register reports closeout rollup (completed >= 1)');

  console.log('\n[Tasking] deadline event → central unified_tasks');
  const taskId = await emitDeadlineTask({ organizationId: ORG, title: 'Verify milestone due', sourceEntityType: 'grant_milestone', sourceEntityId: 999, dueDate: '2026-12-01', taskType: 'milestone' });
  ok(typeof taskId === 'string' && taskId.length > 0, 'emitDeadlineTask created a unified_tasks row (best-effort bridge)');
  if (taskId) {
    const row = await pool.query(`SELECT module_type, source_entity_type, title FROM unified_tasks WHERE task_id=$1`, [taskId]);
    ok(row.rows[0]?.module_type === 'ResearchCompliance' && row.rows[0]?.source_entity_type === 'grant_milestone', 'task is module ResearchCompliance, source grant_milestone');
  }

  console.log(`\n==== DB VERIFICATION: ${pass} passed, ${fail} failed ====`);
  await pool.end();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
