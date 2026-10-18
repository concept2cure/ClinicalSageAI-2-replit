/**
 * A freeze or dispatch that goes forward on a signed Shadow Review waiver
 * (P-34) says so on its §11.10(e) row: which signature, which waived run, which
 * failed run and why it failed. And what the verdict relied on is asked again
 * under the transition lock: the assessment runs unlocked, seconds before the
 * commit, so a waiver revoked in that window (P-34), or a critical whose
 * closing signature was revoked (P-35), refuses the step.
 *
 * Over PGlite with the REAL governed transition (Gate 1, the package gate's
 * assembly, the lock, the chained audit row), the REAL waiver resolution and
 * the REAL critical count on the transaction's client. The dispatch assessor is
 * stubbed with what it reported at assessment time, the way
 * freeze-gate-binding.pglite.test.ts stubs it, so the window can be opened.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, assessment: null as any }));
vi.mock('../../../db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    const r = await holder.pglite.query(sql, params);
    return { ...r, rowCount: r.affectedRows ?? r.rows.length };
  };
  return {
    get db() { return holder.db; },
    pool: { query: run, connect: async () => ({ query: run, release: () => {} }) },
  };
});
vi.mock('../../ectd/assess-dispatch-readiness', () => ({ assessSequenceDispatchReadiness: async () => holder.assessment }));

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { ORG, USER, FREEZE_GATE_SEED_SQL, freezeGateHelpers } from './_freeze-gate-fixture';
import { freezeSequence } from '../submission-service';
import { resolveShadowReviewWaiver } from '../../ectd/shadow-review-waiver';

let h: IndPgliteDb;
const ctx = { organizationId: ORG, userId: USER };
const { sign, statusOf } = freezeGateHelpers(() => h);
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);
const CLEAR = { gate: { cleared: true, blockers: [] }, freezeGate: { cleared: true, blockers: [] }, validationErrors: 0, unacknowledgedShadowCriticals: 0 };

let nextSeq = 9100;
/** A validated sequence 0000 of a submission of its own (so no filing-order rule joins two cases), with two approved leaves. */
async function validatedSequence(): Promise<number> {
  const id = nextSeq++;
  await q(`INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by) VALUES ($1, 'P-34 reliance', 'ind', 'biotech', 'fda', ${ORG}, ${USER})`, [id]);
  await q(`INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, status) VALUES ($1, $1, 'fda', '0000', ${ORG}, ${USER}, 'validated')`, [id]);
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by) VALUES
       ($1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 200, ${ORG}, ${USER}),
       ($1, 'm2.3', 'Quality Overall Summary', 'new', 'coauthor_documents', 202, ${ORG}, ${USER})`,
    [id],
  );
  return id;
}
const runOf = async (seq: number, status: string, extra: Record<string, unknown> = {}) =>
  Number((await q(
    `INSERT INTO shadow_review_runs (sequence_id, status, organization_id, created_by, failure_code, waiver_signature_action_id, waived_failed_run_id)
     VALUES ($1, $2, ${ORG}, ${USER}, $3, $4, $5) RETURNING id`,
    [seq, status, extra.failureCode ?? null, extra.waiverSignature ?? null, extra.failedRunId ?? null],
  )).rows[0].id);
/** A recorded waiver on the sequence, as the waive act leaves it: a failed run, a waived row, its signature. */
async function waived(seq: number) {
  const failedRunId = await runOf(seq, 'failed', { failureCode: 'provider_unavailable' });
  const waiverSignature = await sign(seq, 'shadow-waiver', 'responsibility');
  const waiverRunId = await runOf(seq, 'waived', { waiverSignature, failedRunId });
  const signatureId = Number((await q(`SELECT id FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [waiverSignature])).rows[0].id);
  return { failedRunId, waiverSignature, waiverRunId, signatureId };
}
const revoke = (actionId: string) =>
  q(`UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [actionId]);
const frozenRow = async (seq: number) =>
  (await q(`SELECT new_values::jsonb AS v FROM audit_logs WHERE table_name = 'ectd_sequence' AND record_id = $1 AND action = 'SEQUENCE_FROZEN'`, [String(seq)])).rows;

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, leafSources: true, shadowReview: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(FREEZE_GATE_SEED_SQL);
  // What the waiver and closure reads name on a signature (the real table's columns).
  await h.pglite.exec(`ALTER TABLE electronic_signatures ADD COLUMN IF NOT EXISTS signer_name TEXT, ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT now(),
    ADD COLUMN IF NOT EXISTS signature_meaning TEXT, ADD COLUMN IF NOT EXISTS signature_purpose TEXT;`);
}, 120_000);
afterAll(async () => { await h.close(); });

describe('a freeze that goes forward on a signed Shadow Review waiver', () => {
  it('names the waiver on its §11.10(e) row: signature, waived run, failed run and why it failed', async () => {
    const seq = await validatedSequence();
    const w = await waived(seq);
    const waiver = await resolveShadowReviewWaiver({ query: q }, { sequenceId: seq, organizationId: ORG });
    expect(waiver.state).toBe('active');
    holder.assessment = { ...CLEAR, shadowReviewRunCount: 0, shadowReviewWaiver: waiver };
    await freezeSequence(seq, ctx, await sign(seq, 'freeze', 'approval'));
    expect((await statusOf(seq)).status).toBe('frozen');
    expect((await frozenRow(seq)).map((r) => r.v.shadowReviewWaiver)).toEqual([
      { signatureActionId: w.waiverSignature, signatureId: w.signatureId, waiverRunId: w.waiverRunId, failedRunId: w.failedRunId, failureCode: 'provider_unavailable' },
    ]);
  }, 120_000);

  it('is refused when the waiver is revoked after the assessment and before the lock, and its signature is void', async () => {
    const seq = await validatedSequence();
    const w = await waived(seq);
    holder.assessment = { ...CLEAR, shadowReviewRunCount: 0, shadowReviewWaiver: await resolveShadowReviewWaiver({ query: q }, { sequenceId: seq, organizationId: ORG }) };
    await revoke(w.waiverSignature);
    const freezeSig = await sign(seq, 'freeze', 'approval');
    const err = await outcome(freezeSequence(seq, ctx, freezeSig));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/the Shadow Review waiver it relied on no longer stands/) });
    expect((await statusOf(seq)).status).toBe('validated');
    expect(await frozenRow(seq)).toEqual([]);
    expect((await q(`SELECT verification_status FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [freezeSig])).rows[0].verification_status).toBe('voided');
  }, 120_000);

  it('is refused when a critical it counted as closed reopens before the lock (its closing signature revoked)', async () => {
    const seq = await validatedSequence();
    const run = await runOf(seq, 'complete');
    const closer = await sign(seq, 'shadow-finding-disposition', 'approval');
    await q(
      `INSERT INTO shadow_review_findings (run_id, dimension, severity, title, status, organization_id, disposition_signature_action_id)
       VALUES ($1, 'rtf', 'critical', 'Stability data missing', 'accepted', ${ORG}, $2)`,
      [run, closer],
    );
    holder.assessment = { ...CLEAR, shadowReviewRunCount: 1, shadowReviewWaiver: { state: 'none' } };
    await revoke(closer);
    const err = await outcome(freezeSequence(seq, ctx, await sign(seq, 'freeze', 'approval')));
    expect(err).toMatchObject({ code: 'DISPATCH_BLOCKED', message: expect.stringMatching(/a critical Shadow Review finding blocks dispatch again/) });
    expect(err.message).toContain(`under signature ${closer}, which is no longer in force`);
    expect((await statusOf(seq)).status).toBe('validated');
  }, 120_000);

  it('a freeze on a completed review names no waiver', async () => {
    const seq = await validatedSequence();
    await runOf(seq, 'complete');
    holder.assessment = { ...CLEAR, shadowReviewRunCount: 1, shadowReviewWaiver: { state: 'none' } };
    await freezeSequence(seq, ctx, await sign(seq, 'freeze', 'approval'));
    expect((await frozenRow(seq)).map((r) => r.v.shadowReviewWaiver)).toEqual([undefined]);
  }, 120_000);
});
