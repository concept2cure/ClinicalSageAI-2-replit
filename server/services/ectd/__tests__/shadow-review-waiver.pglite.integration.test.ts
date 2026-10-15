/**
 * The signed Shadow Review waiver (P-34, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * A never-reviewed dossier is not cleared for dispatch, and an AI outage must
 * not stop a regulatory deadline. So a waiver is offered only when the
 * sequence has no completed Shadow Review and its newest run failed because
 * every AI provider failed or was overloaded, within 24 hours. It is a Part 11
 * signature on `ectd-sequence:<id>` with intent `shadow-waiver` and the meaning
 * responsibility or approval, by someone who did not author the sequence; it is
 * used once, binds the leaf manifest it was signed over and lapses when the
 * leaves change. A refused waive voids its signature (P-23). It is not a
 * release, and it cannot freeze or dispatch.
 *
 * Over PGlite with the REAL shadow_review_runs migrations (20260604 + 20261015),
 * the REAL Gate 1 (governedSignatureVerdict), the REAL leaf-manifest binding,
 * the REAL separation-of-duties check, the REAL chained audit writer and the
 * REAL release-signature resolver. Nothing is stubbed but the database handle.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
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

import { createIndPgliteDb, AUDIT_LOGS_PGLITE_DDL, type IndPgliteDb } from '../../../db/pglite-harness';
import { deriveGovernedTargetBinding } from '../../part11/signature-persistence';
import {
  waiveShadowReview,
  freezeSequence,
  dispatchSequence,
  precheckGovernedStep,
} from '../../submission-service/submission-service';
import {
  shadowReviewWaivable,
  resolveShadowReviewWaiver,
  evaluateShadowPresenceWithWaiver,
  NO_SHADOW_REVIEW_BLOCKER,
} from '../shadow-review-waiver';
import { resolveSequenceReleaseSignature } from '../sequence-release-signature';
import { evaluateDispatchGate, mergeDispatchGates } from '../dispatch-gate';
import { listShadowReviewRuns } from '../../shadow-review/shadow-review-service';
import { assembleOrgShadowReview } from '../../shadow-review/shadow-review-view-assembler';
import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';

const ORG = 7;
/** The signer: holds signing authority, did not create the sequences. */
const SIGNER = 3;
/** Whoever assembled the sequences. */
const AUTHOR = 5;
const ctx = { organizationId: ORG, userId: SIGNER };

let h: IndPgliteDb;
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const queryable = { query: q };
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

let nextSubmission = 100;
/** A submission and one sequence of it, with one leaf. */
async function makeSequence(status = 'validated', createdBy = AUTHOR): Promise<number> {
  const sub = nextSubmission++;
  await q(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ($1, 'P-34', 'ind', 'biotech', 'fda', $2, $3)`,
    [sub, ORG, createdBy],
  );
  const seq = (await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, status)
     VALUES ($1, 'fda', '0001', $2, $3, $4) RETURNING id`,
    [sub, ORG, createdBy, status],
  )).rows[0].id as number;
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
     VALUES ($1, 'm2.5', 'Clinical Overview', 'new', $2, $3)`,
    [seq, ORG, createdBy],
  );
  return Number(seq);
}

/** A Shadow Review run with a recorded outcome, `hoursAgo` old. */
async function run(seq: number, status: string, failureCode: string | null, hoursAgo = 1): Promise<number> {
  const r = await q(
    `INSERT INTO shadow_review_runs (sequence_id, region, lens, status, failure_code, organization_id, created_by, created_at, updated_at)
     VALUES ($1, 'fda', 'fda_filing', $2, $3, $4, $5, now() - make_interval(hours => $6), now() - make_interval(hours => $6))
     RETURNING id`,
    [seq, status, failureCode, ORG, AUTHOR, hoursAgo],
  );
  return Number(r.rows[0].id);
}

let sigN = 0;
/** An executed governed sign on the sequence, bound to its CURRENT leaf manifest. */
async function sign(seq: number, intent: string, meaning = 'responsibility', signer = SIGNER): Promise<string> {
  const id = `p34-sig-${++sigN}`;
  const target = `ectd-sequence:${seq}`;
  const binding = await deriveGovernedTargetBinding(queryable, target, ORG);
  await q(
    `INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload) VALUES ($1,$2,'sign',$3,'executed',$4,$5)`,
    [id, ORG, target, signer, JSON.stringify({ intent, meaning })],
  );
  await q(
    `INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis,
       signature_type, signer_id, signer_name, signed_at, is_valid, verification_status)
     VALUES ($1,$2,$3,$4,$5,'governed-action',$6,'Dana Reyes',now(),true,'valid')`,
    [ORG, target, JSON.stringify({ actionId: id, target }), binding.digest, binding.basis, signer],
  );
  return id;
}

const signatureRow = async (actionId: string) =>
  (await q(
    `SELECT id, is_valid, verification_status FROM electronic_signatures WHERE (signature_manifest::jsonb ->> 'actionId') = $1`,
    [actionId],
  )).rows[0] as { id: number; is_valid: boolean; verification_status: string };

const auditRowsNaming = async (actionId: string) =>
  (await q(
    `SELECT action, table_name, record_id, new_values::jsonb AS v, sha256_chain FROM audit_logs
      WHERE (new_values::jsonb ->> 'signatureActionId') = $1 ORDER BY occurred_at, id`,
    [actionId],
  )).rows as Array<{ action: string; table_name: string; record_id: string; v: Record<string, unknown>; sha256_chain: string | null }>;

const waivedRows = async (seq: number) =>
  (await q(
    `SELECT id, status, created_by, waiver_signature_action_id, waived_failed_run_id, organization_id
       FROM shadow_review_runs WHERE sequence_id = $1 AND status = 'waived'`,
    [seq],
  )).rows;

/** The count the dispatch assessor's presence gate reads (countCompletedShadowRuns). */
const completedRuns = async (seq: number) =>
  Number((await q(
    `SELECT count(*)::int AS n FROM shadow_review_runs WHERE sequence_id=$1 AND organization_id=$2 AND status='complete' AND deleted_at IS NULL`,
    [seq, ORG],
  )).rows[0].n);

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Sponsor') ON CONFLICT DO NOTHING;
    INSERT INTO users (id) VALUES (${SIGNER}), (${AUTHOR});
    CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY, org_id INTEGER, command TEXT, target TEXT, state TEXT, proposed_by INTEGER, payload JSONB);
    CREATE TABLE electronic_signatures (
      id SERIAL PRIMARY KEY, organization_id INTEGER, signed_target TEXT, signature_manifest TEXT,
      bound_payload_digest TEXT, binding_basis TEXT, signature_type TEXT, signer_id INTEGER, signer_name TEXT,
      signed_at TIMESTAMP, superseded_by INTEGER, is_valid BOOLEAN, verification_status TEXT,
      verification_date TIMESTAMP, updated_at TIMESTAMP);
  `);
  await h.pglite.exec(migration('migrations/20260604_shadow_review.sql'));
  await h.pglite.exec(migration('migrations/20261015_shadow_review_waiver.sql'));
  // The dispatch assessor reads who closed each critical (P-35).
  await h.pglite.exec(migration('migrations/20261015b_shadow_finding_disposition.sql'));
}, 120_000);
afterAll(async () => { await h.close(); });

describe('when a waiver is offered (shadowReviewWaivable)', () => {
  it('only after the newest run failed for a provider outage, within 24 hours', async () => {
    const seq = await makeSequence();
    expect(await shadowReviewWaivable(queryable, { sequenceId: seq, organizationId: ORG })).toMatchObject({
      eligible: false, reason: expect.stringMatching(/No Shadow Review has been attempted/),
    });
    const failed = await run(seq, 'failed', 'provider_unavailable');
    expect(await shadowReviewWaivable(queryable, { sequenceId: seq, organizationId: ORG })).toMatchObject({
      eligible: true, failedRunId: failed, failureCode: 'provider_unavailable',
    });
  });

  it.each([
    ['invalid_ai_response', /not an assessment/],
    ['policy_blocked', /governance/],
    ['placement_refused', /placement/],
    ['rate_limited', /rate limit/],
    ['no_provider_configured', /no AI provider is configured/i],
    ['model_not_qualified', /approved/],
    [null, /before failures were recorded/],
  ])('never for a run that failed as %s', async (code, says) => {
    const seq = await makeSequence();
    await run(seq, 'failed', code);
    const w = await shadowReviewWaivable(queryable, { sequenceId: seq, organizationId: ORG });
    expect(w.eligible).toBe(false);
    expect(w.reason).toMatch(says);
    expect(w.reason).toMatch(/not an AI provider outage|cannot be shown to be an AI provider outage/);
  });

  it('not when the outage is more than 24 hours old, a newer run exists, or a review completed', async () => {
    const stale = await makeSequence();
    await run(stale, 'failed', 'provider_overloaded', 25);
    expect((await shadowReviewWaivable(queryable, { sequenceId: stale, organizationId: ORG })).reason).toMatch(/more than 24 hours ago/);

    const newer = await makeSequence();
    await run(newer, 'failed', 'provider_unavailable', 2);
    await run(newer, 'failed', 'invalid_ai_response', 1);
    expect((await shadowReviewWaivable(queryable, { sequenceId: newer, organizationId: ORG })).eligible).toBe(false);

    const reviewed = await makeSequence();
    await run(reviewed, 'complete', null, 3);
    await run(reviewed, 'failed', 'provider_unavailable', 1);
    expect((await shadowReviewWaivable(queryable, { sequenceId: reviewed, organizationId: ORG })).reason).toMatch(/completed Shadow Review/);
  });

  it('not once the sequence is frozen', async () => {
    const seq = await makeSequence('frozen');
    await run(seq, 'failed', 'provider_unavailable');
    expect((await shadowReviewWaivable(queryable, { sequenceId: seq, organizationId: ORG })).reason).toMatch(/frozen/);
  });

  it('the precheck answers from the same rule, before anyone signs', async () => {
    const seq = await makeSequence();
    await run(seq, 'failed', 'invalid_ai_response');
    const refused = await precheckGovernedStep(seq, 'shadow-waiver', ctx);
    expect(refused).toMatchObject({ step: 'shadow-waiver', cleared: false, refusal: expect.stringMatching(/not an AI provider outage/) });
    const failed = await run(seq, 'failed', 'provider_unavailable', 0);
    const cleared = await precheckGovernedStep(seq, 'shadow-waiver', ctx);
    expect(cleared).toMatchObject({ cleared: true, refusal: null, shadowWaiver: { eligible: true, failedRunId: failed } });
  });
});

describe('the waiver act', () => {
  it('records a waived row and a chained SHADOW_REVIEW_WAIVED row, and clears the presence gate as not assessed', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const sig = await sign(seq, 'shadow-waiver', 'responsibility');

    const record = await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    const { id: signatureId } = await signatureRow(sig);
    expect(record).toMatchObject({
      sequenceId: seq, failedRunId: failed, failureCode: 'provider_unavailable', signatureActionId: sig, signatureId,
      waiver: { state: 'active', signatureActionId: sig, signatureId, signerName: 'Dana Reyes', failedRunId: failed, failureCode: 'provider_unavailable' },
    });

    expect(await waivedRows(seq)).toEqual([
      expect.objectContaining({ created_by: SIGNER, waiver_signature_action_id: sig, waived_failed_run_id: failed, organization_id: ORG }),
    ]);
    const audit = await auditRowsNaming(sig);
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'SHADOW_REVIEW_WAIVED', table_name: 'ectd_sequence', record_id: String(seq),
        v: { signatureActionId: sig, signatureId, failedRunId: failed, failureCode: 'provider_unavailable' },
      }),
    ]);
    expect(audit[0].sha256_chain, 'the waiver is not in the audit chain').toBeTruthy();

    // A waiver is not a review: nothing that counts reviews counts it.
    expect(await completedRuns(seq)).toBe(0);
    const [waived] = await waivedRows(seq);
    // The surface's per-lens rows are org-wide (an earlier case completed a run); the waiver is never one of them.
    expect((await assembleOrgShadowReview(ORG)).map((r) => r.runId)).not.toContain(waived.id);
    const runs = await listShadowReviewRuns(seq, { organizationId: ORG });
    expect(runs.map((r) => [r.status, r.failureCode, r.waivedFailedRunId])).toEqual([
      ['waived', null, failed],
      ['failed', 'provider_unavailable', null],
    ]);

    const gate = evaluateShadowPresenceWithWaiver(0, await resolveShadowReviewWaiver(queryable, { sequenceId: seq, organizationId: ORG }));
    expect(gate.cleared).toBe(true);
    expect(gate.blockers).toEqual([]);
    expect(gate.notAssessed).toBe(
      `Shadow Review waived under signature ${signatureId} by Dana Reyes because the AI provider was unavailable ` +
        `(run #${failed}); this dossier was not adversarially reviewed.`,
    );
    // A second waiver needs a newer failed run.
    expect((await precheckGovernedStep(seq, 'shadow-waiver', ctx)).cleared).toBe(false);
  });

  it('is used once: the same signature cannot waive again', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_overloaded');
    const sig = await sign(seq, 'shadow-waiver', 'approval');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    await run(seq, 'failed', 'provider_overloaded', 0);
    const again = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx));
    expect(again).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/already authorized/) });
    expect(await waivedRows(seq)).toHaveLength(1);
    // The spent signature is not voided by the attempt: it still stands for its waiver.
    expect(await signatureRow(sig)).toMatchObject({ is_valid: true, verification_status: 'valid' });
    expect((await resolveShadowReviewWaiver(queryable, { sequenceId: seq, organizationId: ORG })).state).toBe('active');
  });

  it('lapses when the leaves change, and blocks with its own sentence', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const sig = await sign(seq, 'shadow-waiver');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
       VALUES ($1, 'm2.4', 'Nonclinical Overview', 'new', $2, $3)`,
      [seq, ORG, AUTHOR],
    );
    const waiver = await resolveShadowReviewWaiver(queryable, { sequenceId: seq, organizationId: ORG });
    expect(waiver).toMatchObject({ state: 'lapsed', signatureActionId: sig, failedRunId: failed });
    const gate = evaluateShadowPresenceWithWaiver(0, waiver);
    expect(gate.cleared).toBe(false);
    expect(gate.blockers.join(' ')).toMatch(/leaves changed after it was signed/);
    expect(gate.notAssessed).toBeUndefined();
  });

  it('a revoked waiver blocks with its own sentence', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const sig = await sign(seq, 'shadow-waiver');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    await q(`UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [sig]);
    const waiver = await resolveShadowReviewWaiver(queryable, { sequenceId: seq, organizationId: ORG });
    expect(waiver.state).toBe('revoked');
    const gate = evaluateShadowPresenceWithWaiver(0, waiver);
    expect(gate.cleared).toBe(false);
    expect(gate.blockers.join(' ')).toMatch(/was revoked/);
  });

});

describe('a refused waive', () => {
  it('a waiver citing a run that was not an outage is refused 409, and its signature is void', async () => {
    const seq = await makeSequence();
    const notAnOutage = await run(seq, 'failed', 'invalid_ai_response');
    const given = await sign(seq, 'shadow-waiver');
    const refused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: given, failedRunId: notAnOutage }, ctx));
    expect(refused).toMatchObject({
      code: 'SHADOW_WAIVER_NOT_ELIGIBLE',
      message: expect.stringMatching(/not an AI provider outage/),
    });
    expect(refused.message).toMatch(/signature given for this Shadow Review waiver is now void/);
    expect(await waivedRows(seq)).toEqual([]);
    expect(await signatureRow(given)).toMatchObject({ is_valid: false, verification_status: 'voided' });
    expect((await auditRowsNaming(given)).map((r) => [r.action, r.v.step])).toEqual([['GOVERNED_SIGNATURE_VOIDED', 'shadow-waiver']]);

    // An outage is then recorded. The void signature does not serve it; a fresh one does.
    const outage = await run(seq, 'failed', 'provider_unavailable', 0);
    const reused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: given, failedRunId: outage }, ctx));
    expect(reused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/so it is void/) });
    const fresh = await sign(seq, 'shadow-waiver');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: fresh, failedRunId: outage }, ctx);
    expect(await waivedRows(seq)).toHaveLength(1);
  });

  it('a waiver naming a failed run other than the newest is refused', async () => {
    const seq = await makeSequence();
    const older = await run(seq, 'failed', 'provider_unavailable', 2);
    await run(seq, 'failed', 'provider_unavailable', 1);
    const sig = await sign(seq, 'shadow-waiver');
    const refused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: older }, ctx));
    expect(refused).toMatchObject({ code: 'SHADOW_WAIVER_NOT_ELIGIBLE', message: expect.stringMatching(new RegExp(`cites run #${older}`)) });
  });

  it("the sequence's creator cannot waive its review (separation of duties)", async () => {
    const seq = await makeSequence('validated', SIGNER);
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const sig = await sign(seq, 'shadow-waiver');
    const refused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx));
    expect(refused).toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/Separation of duties/) });
    expect(await waivedRows(seq)).toEqual([]);
  });

  it('a waiver signed as review, not responsibility or approval, is refused', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const sig = await sign(seq, 'shadow-waiver', 'review');
    const refused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx));
    expect(refused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/responsibility or approval/) });
    expect(await waivedRows(seq)).toEqual([]);
  });
});

describe('a waiver signature is its own act', () => {
  it('is not a release signature, and cannot freeze or dispatch', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    const waiver = await sign(seq, 'shadow-waiver');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: waiver, failedRunId: failed }, ctx);

    expect((await resolveSequenceReleaseSignature({ sequenceId: seq, organizationId: ORG })).verdict).toBe('unsigned');
    const freeze = await outcome(freezeSequence(seq, ctx, waiver));
    expect(freeze).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/declares intent 'shadow-waiver', not 'freeze'/) });

    const frozen = await makeSequence('frozen');
    const unspent = await sign(frozen, 'shadow-waiver');
    const dispatch = await outcome(dispatchSequence(frozen, ctx, unspent));
    expect(dispatch).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/declares intent 'shadow-waiver', not 'dispatch'/) });
    // Neither refusal is the waiver's act, so neither voids the waiver signature.
    expect(await signatureRow(waiver)).toMatchObject({ is_valid: true });
    expect(await signatureRow(unspent)).toMatchObject({ is_valid: true });
  });

  it('a freeze or dispatch signature cannot waive', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');
    for (const intent of ['freeze', 'dispatch']) {
      const sig = await sign(seq, intent, 'approval');
      const refused = await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx));
      expect(refused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(new RegExp(`declares intent '${intent}', not 'shadow-waiver'`)) });
      expect(await signatureRow(sig)).toMatchObject({ is_valid: true, verification_status: 'valid' });
    }
    expect(await waivedRows(seq)).toEqual([]);
  });
});

describe('the presence gate with a waiver (evaluateShadowPresenceWithWaiver)', () => {
  it('a completed review clears it whatever the waiver; no waiver blocks with the existing sentence', () => {
    expect(evaluateShadowPresenceWithWaiver(1, { state: 'revoked' })).toEqual({ cleared: true, blockers: [] });
    expect(evaluateShadowPresenceWithWaiver(0, { state: 'none' })).toEqual({ cleared: false, blockers: [NO_SHADOW_REVIEW_BLOCKER] });
    expect(NO_SHADOW_REVIEW_BLOCKER).toMatch(/A never-reviewed dossier is not cleared for dispatch/);
  });

  it('an undetermined waiver is never active', () => {
    const gate = evaluateShadowPresenceWithWaiver(0, { state: 'undetermined' });
    expect(gate.cleared).toBe(false);
    expect(gate.blockers.join(' ')).toMatch(/could not be determined/);
  });

  it('never waives an unacknowledged critical finding: it answers only "no review has run"', () => {
    const presence = evaluateShadowPresenceWithWaiver(0, {
      state: 'active', signatureActionId: 'a', signatureId: 9, signerName: 'Dana Reyes', failedRunId: 4, failureCode: 'provider_unavailable',
    });
    const structural = evaluateDispatchGate({ validationErrors: 0, unacknowledgedShadowCriticals: 1 });
    expect(mergeDispatchGates(structural, presence).cleared).toBe(false);
  });
});

describe('the dispatch verdict reads the waiver (assessSequenceDispatchReadiness)', () => {
  const assess = (seq: number) => assessSequenceDispatchReadiness({ sequenceId: seq, organizationId: ORG });
  const presenceOf = (a: Awaited<ReturnType<typeof assess>>) => a.gates.find((g) => g.key === 'shadowPresence');

  it('offers the waiver, then clears the presence gate as not assessed once it is signed — in every verdict', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_unavailable');

    const before = await assess(seq);
    expect(before.shadowReviewWaiver).toEqual({ state: 'none' });
    expect(before.shadowReviewWaivable).toMatchObject({ eligible: true, failedRunId: failed, failureCode: 'provider_unavailable' });
    expect(presenceOf(before)).toMatchObject({ cleared: false, blockers: [NO_SHADOW_REVIEW_BLOCKER] });
    expect(presenceOf(before)?.notAssessed).toBeUndefined();
    for (const verdict of [before.gate, before.freezeGate, before.dispatchGateOnSigning]) {
      expect(verdict.blockers).toContain(NO_SHADOW_REVIEW_BLOCKER);
    }

    const sig = await sign(seq, 'shadow-waiver');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    const { id: signatureId } = await signatureRow(sig);

    const after = await assess(seq);
    expect(after.shadowReviewWaiver).toMatchObject({ state: 'active', signatureActionId: sig, signatureId, failedRunId: failed });
    // Still never reviewed, and nothing further to waive.
    expect(after.shadowReviewMissing).toBe(true);
    expect(after.shadowReviewRunCount).toBe(0);
    expect(after.shadowReviewWaivable).toMatchObject({ eligible: false });
    expect(presenceOf(after)).toMatchObject({ cleared: true, blockers: [] });
    expect(presenceOf(after)?.notAssessed).toMatch(new RegExp(`waived under signature ${signatureId} by Dana Reyes`));
    for (const verdict of [after.gate, after.freezeGate, after.dispatchGateOnSigning]) {
      expect(verdict.blockers.join(' ')).not.toMatch(/Shadow Review/);
    }
    // The gate views' blockers are still exactly the verdict's.
    expect(after.gates.flatMap((g) => g.blockers)).toEqual(after.gate.blockers);
  });

  it('a lapsed waiver blocks the verdict with its own sentence, and no note says it was waived', async () => {
    const seq = await makeSequence();
    const failed = await run(seq, 'failed', 'provider_overloaded');
    const sig = await sign(seq, 'shadow-waiver', 'approval');
    await waiveShadowReview({ sequenceId: seq, signatureActionId: sig, failedRunId: failed }, ctx);
    await q(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
       VALUES ($1, 'm2.4', 'Nonclinical Overview', 'new', $2, $3)`,
      [seq, ORG, AUTHOR],
    );
    const a = await assess(seq);
    expect(a.shadowReviewWaiver.state).toBe('lapsed');
    expect(presenceOf(a)?.cleared).toBe(false);
    expect(presenceOf(a)?.notAssessed).toBeUndefined();
    expect(a.gate.blockers.join(' ')).toMatch(/waiver under signature .* has lapsed/);
    expect(a.freezeGate.blockers.join(' ')).toMatch(/has lapsed/);
  });

  it('a completed review needs no waiver: none is offered, and the gate clears without a note', async () => {
    const seq = await makeSequence();
    await run(seq, 'complete', null);
    const a = await assess(seq);
    expect(a.shadowReviewWaivable).toBeUndefined();
    expect(presenceOf(a)).toMatchObject({ cleared: true, blockers: [] });
    expect(presenceOf(a)?.notAssessed).toBeUndefined();
  });
});
