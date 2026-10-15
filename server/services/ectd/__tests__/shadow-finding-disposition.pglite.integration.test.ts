/**
 * A critical Shadow Review finding is closed by a named person's signature,
 * never by silence (P-35, docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-15).
 *
 * The dispatch gate blocks on every open critical finding across every run of
 * the sequence, and until now nothing could close one. Each open critical is
 * now dispositioned on its own by a Part 11 signature on `ectd-sequence:<id>`
 * (intent `shadow-finding-disposition`, the finding and the disposition named
 * in the payload, meaning approval or responsibility), with the signer's
 * reason, by someone who did not author the sequence:
 *   - 'accepted' — the finding stands and the signer accepts going forward;
 *   - 'fixed'    — offered only when a completed Shadow Review ran after the
 *                  finding's run (it need not be the clean one).
 * A later review never closes an earlier critical by itself. The signature is
 * used once, names one finding, and a refused act voids it (P-23).
 *
 * Over PGlite with the REAL shadow_review migrations (20260604 + 20261015 +
 * 20261015b), the REAL Gate 1 (governedSignatureVerdict), the REAL leaf-manifest
 * binding, the REAL separation-of-duties check and the REAL chained audit
 * writer. Nothing is stubbed but the database handle.
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
  dispositionShadowFinding,
  freezeSequence,
  waiveShadowReview,
  precheckGovernedStep,
} from '../../submission-service/submission-service';
import {
  criticalsStandingOpen,
  reopenedCriticalSentence,
  shadowFindingDisposable,
  shadowFindingDispositionUpdate,
  withShadowFindingDispositions,
} from '../shadow-finding-disposition';
import { assessSequenceDispatchReadiness } from '../assess-dispatch-readiness';
import { evaluateShadowPresenceWithWaiver } from '../shadow-review-waiver';
import { evaluateDispatchGate, mergeDispatchGates } from '../dispatch-gate';
import { getShadowReviewFindings } from '../../shadow-review/shadow-review-service';

const ORG = 7;
const OTHER_ORG = 8;
/** The signer: holds signing authority, did not create the sequences. */
const SIGNER = 3;
/** Whoever assembled the sequences. */
const AUTHOR = 5;
const ctx = { organizationId: ORG, userId: SIGNER };
const INTENT = 'shadow-finding-disposition';

let h: IndPgliteDb;
const q = (text: string, params?: unknown[]) => h.pglite.query(text, params) as Promise<{ rows: any[] }>;
const queryable = { query: q };
const outcome = (p: Promise<unknown>) => p.then(() => null, (e: any) => e);

function migration(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../../../../', rel), 'utf8');
}

let nextSubmission = 300;
/** A submission and one sequence of it, with one leaf. */
async function makeSequence(status = 'validated', createdBy = AUTHOR, org = ORG): Promise<number> {
  const sub = nextSubmission++;
  await q(
    `INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ($1, 'P-35', 'ind', 'biotech', 'fda', $2, $3)`,
    [sub, org, createdBy],
  );
  const seq = (await q(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, status)
     VALUES ($1, 'fda', '0001', $2, $3, $4) RETURNING id`,
    [sub, org, createdBy, status],
  )).rows[0].id as number;
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, organization_id, created_by)
     VALUES ($1, 'm2.5', 'Clinical Overview', 'new', $2, $3)`,
    [seq, org, createdBy],
  );
  return Number(seq);
}

/** A Shadow Review run, `hoursAgo` old. */
async function run(seq: number, status: string, hoursAgo: number, org = ORG): Promise<number> {
  const r = await q(
    `INSERT INTO shadow_review_runs (sequence_id, region, lens, status, organization_id, created_by, created_at, updated_at)
     VALUES ($1, 'fda', 'fda_filing', $2, $3, $4, now() - make_interval(secs => $5::float8 * 3600), now() - make_interval(secs => $5::float8 * 3600))
     RETURNING id`,
    [seq, status, org, AUTHOR, hoursAgo],
  );
  return Number(r.rows[0].id);
}

/** A finding of a run. */
async function finding(runId: number, severity = 'critical', org = ORG): Promise<number> {
  const r = await q(
    `INSERT INTO shadow_review_findings (run_id, dimension, severity, title, organization_id, created_by)
     VALUES ($1, 'rtf', $2, 'Module 3 drug substance stability data missing', $3, $4) RETURNING id`,
    [runId, severity, org, AUTHOR],
  );
  return Number(r.rows[0].id);
}

const ACCEPT_REASON = 'Risk accepted: stability data follows in the 30-day amendment.';
const FIXED_REASON = 'Fixed: the 12-month stability report is now leaf m3.2.s.7.';

let sigN = 0;
/** An executed governed sign on the sequence, bound to its CURRENT leaf manifest. */
async function sign(
  seq: number,
  payload: Record<string, unknown>,
  opts: { meaning?: string; signer?: number; reason?: string } = {},
): Promise<string> {
  const id = `p35-sig-${++sigN}`;
  const target = `ectd-sequence:${seq}`;
  const meaning = opts.meaning ?? 'responsibility';
  const signer = opts.signer ?? SIGNER;
  const reason = opts.reason ?? ACCEPT_REASON;
  const binding = await deriveGovernedTargetBinding(queryable, target, ORG);
  await q(
    `INSERT INTO c2c_ana_actions (id, org_id, command, target, state, proposed_by, payload) VALUES ($1,$2,'sign',$3,'executed',$4,$5)`,
    [id, ORG, target, signer, JSON.stringify({ meaning, ...payload })],
  );
  await q(
    `INSERT INTO electronic_signatures (organization_id, signed_target, signature_manifest, bound_payload_digest, binding_basis,
       signature_type, signature_purpose, signature_meaning, signer_id, signer_name, signed_at, is_valid, verification_status)
     VALUES ($1,$2,$3,$4,$5,'governed-action',$6,$7,$8,'Dana Reyes',now(),true,'valid')`,
    [ORG, target, JSON.stringify({ actionId: id, target, reason }), binding.digest, binding.basis, reason, meaning, signer],
  );
  return id;
}
const signFor = (seq: number, findingId: number, disposition: string, opts?: { meaning?: string; signer?: number; reason?: string }) =>
  sign(seq, { intent: INTENT, findingId, disposition }, opts);

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

const findingRow = async (id: number) =>
  (await q(
    `SELECT status, disposition_signature_action_id, disposed_by, disposed_at, disposition_reason FROM shadow_review_findings WHERE id = $1`,
    [id],
  )).rows[0] as { status: string; disposition_signature_action_id: string | null; disposed_by: number | null; disposed_at: unknown; disposition_reason: string | null };

/** The dispatch assessor's count: the one it calls (criticalsStandingOpen). */
const openCriticals = async (seq: number) => (await criticalsStandingOpen(queryable, { sequenceId: seq, organizationId: ORG })).count;
/** The assessor's completed-run count (countCompletedShadowRuns). */
const completedRuns = async (seq: number) =>
  Number((await q(
    `SELECT count(*)::int AS n FROM shadow_review_runs WHERE sequence_id=$1 AND organization_id=$2 AND status='complete' AND deleted_at IS NULL`,
    [seq, ORG],
  )).rows[0].n);
/** The dispatch verdict over the two Shadow Review inputs, everything else clear. */
const dispatchVerdict = async (seq: number) =>
  mergeDispatchGates(
    evaluateDispatchGate({ validationErrors: 0, unacknowledgedShadowCriticals: await openCriticals(seq) }),
    evaluateShadowPresenceWithWaiver(await completedRuns(seq), { state: 'none' }),
  );

const dispose = (seq: number, findingId: number, disposition: string, signatureActionId: string, c = ctx) =>
  dispositionShadowFinding({ sequenceId: seq, findingId, disposition: disposition as 'accepted' | 'fixed', signatureActionId }, c);

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true, programSpine: true });
  holder.db = h.db;
  holder.pglite = h.pglite;
  await h.pglite.exec(AUDIT_LOGS_PGLITE_DDL);
  await h.pglite.exec(`
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT);
    INSERT INTO organizations (id, name) VALUES (${ORG}, 'Sponsor'), (${OTHER_ORG}, 'Other') ON CONFLICT DO NOTHING;
    INSERT INTO users (id) VALUES (${SIGNER}), (${AUTHOR});
    CREATE TABLE c2c_ana_actions (id TEXT PRIMARY KEY, org_id INTEGER, command TEXT, target TEXT, state TEXT, proposed_by INTEGER, payload JSONB);
    CREATE TABLE electronic_signatures (
      id SERIAL PRIMARY KEY, organization_id INTEGER, signed_target TEXT, signature_manifest TEXT,
      bound_payload_digest TEXT, binding_basis TEXT, signature_type TEXT, signature_purpose TEXT, signature_meaning TEXT,
      signer_id INTEGER, signer_name TEXT, signed_at TIMESTAMP, superseded_by INTEGER, is_valid BOOLEAN, verification_status TEXT,
      verification_date TIMESTAMP, updated_at TIMESTAMP);
  `);
  await h.pglite.exec(migration('migrations/20260604_shadow_review.sql'));
  await h.pglite.exec(migration('migrations/20261015_shadow_review_waiver.sql'));
  await h.pglite.exec(migration('migrations/20261015b_shadow_finding_disposition.sql'));
}, 120_000);
afterAll(async () => { await h.close(); });

describe('the migration', () => {
  it('replays as a no-op (RULE 1: every deploy re-runs it)', async () => {
    await h.pglite.exec(migration('migrations/20261015b_shadow_finding_disposition.sql'));
    const cols = (await q(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'shadow_review_findings'
         AND column_name IN ('disposition_signature_action_id','disposed_by','disposed_at','disposition_reason') ORDER BY column_name`,
    )).rows.map((r) => r.column_name);
    expect(cols).toEqual(['disposed_at', 'disposed_by', 'disposition_reason', 'disposition_signature_action_id']);
    const fks = (await q(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'shadow_review_findings_disposed_by_fkey'`)).rows[0].n;
    expect(fks).toBe(1);
  });
});

describe('the count this suite reads is the assessor\'s', () => {
  it('the assessor counts through criticalsStandingOpen, and keeps no count of its own beside it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../assess-dispatch-readiness.ts'), 'utf8');
    expect(src, 'the assessor no longer calls criticalsStandingOpen; re-point openCriticals above').toMatch(
      /const shadowCriticals = await criticalsStandingOpen\(/,
    );
    expect(src).toContain('unacknowledgedShadowCriticals = shadowCriticals.count');
    expect(src).not.toContain('countOpenShadowCriticals');
  });
});

describe('accepting a critical', () => {
  it('clears it from the count and from the dispatch verdict, with all else clear, and records who, when, how and why', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    await finding(r1, 'major');
    expect(await openCriticals(seq)).toBe(1);
    expect((await dispatchVerdict(seq)).cleared).toBe(false);

    const sig = await signFor(seq, crit, 'accepted');
    const record = await dispose(seq, crit, 'accepted', sig);
    const { id: signatureId } = await signatureRow(sig);
    expect(record).toMatchObject({
      sequenceId: seq, findingId: crit, runId: r1, disposition: 'accepted', signatureActionId: sig, signatureId,
      dispositionRecord: {
        disposition: 'accepted', disposedBy: SIGNER, disposedByName: 'Dana Reyes', reason: ACCEPT_REASON,
        signatureActionId: sig, signatureId, meaning: 'responsibility', signatureState: 'in-force',
      },
    });

    const row = await findingRow(crit);
    expect(row).toMatchObject({ status: 'accepted', disposition_signature_action_id: sig, disposed_by: SIGNER, disposition_reason: ACCEPT_REASON });
    expect(row.disposed_at).toBeTruthy();

    const audit = await auditRowsNaming(sig);
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'SHADOW_FINDING_DISPOSITIONED', table_name: 'ectd_sequence', record_id: String(seq),
        v: { findingId: crit, runId: r1, disposition: 'accepted', signatureActionId: sig, signatureId },
      }),
    ]);
    expect(audit[0].sha256_chain, 'the disposition is not in the audit chain').toBeTruthy();

    expect(await openCriticals(seq)).toBe(0);
    expect(await dispatchVerdict(seq)).toEqual({ cleared: true, blockers: [] });
  });

  it('the findings read names who closed it, how, when and why, and offers nothing more on it', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const closed = await finding(r1);
    const open = await finding(r1);
    const minor = await finding(r1, 'minor');
    const sig = await signFor(seq, closed, 'accepted', { meaning: 'approval' });
    await dispose(seq, closed, 'accepted', sig);

    const rows = await withShadowFindingDispositions(queryable, { organizationId: ORG, runId: r1 }, await getShadowReviewFindings(r1, { organizationId: ORG }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(closed)).toMatchObject({
      status: 'accepted',
      dispositionsOffered: [],
      disposition: {
        disposition: 'accepted', disposedBy: SIGNER, disposedByName: 'Dana Reyes', reason: ACCEPT_REASON,
        signatureActionId: sig, meaning: 'approval', signatureState: 'in-force', disposedAt: expect.any(String),
      },
    });
    // An open critical: risk acceptance offered; no later completed review, so not "fixed".
    expect(byId.get(open)).toMatchObject({ status: 'open', disposition: null, dispositionsOffered: ['accepted'], laterCompletedRunId: null });
    // A non-critical finding is not gated and is not part of this act.
    expect(byId.get(minor)).toMatchObject({ disposition: null, dispositionsOffered: [] });

    // A later completed review makes "fixed" available for the open critical, and names the run.
    const r2 = await run(seq, 'complete', 1);
    const again = await withShadowFindingDispositions(queryable, { organizationId: ORG, runId: r1 }, await getShadowReviewFindings(r1, { organizationId: ORG }));
    expect(again.find((r) => r.id === open)).toMatchObject({ dispositionsOffered: ['accepted', 'fixed'], laterCompletedRunId: r2 });

    // A revoked disposition signature is said so, not hidden.
    await q(`UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [sig]);
    const revoked = await withShadowFindingDispositions(queryable, { organizationId: ORG, runId: r1 }, await getShadowReviewFindings(r1, { organizationId: ORG }));
    expect(revoked.find((r) => r.id === closed)?.disposition).toMatchObject({ signatureState: 'revoked' });
  });
});

describe('a later review never closes an earlier critical by itself', () => {
  it('a later clean, completed run leaves the earlier critical open and the dispatch blocked', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    await run(seq, 'complete', 1); // clean: no findings at all
    expect(await completedRuns(seq)).toBe(2);
    expect((await findingRow(crit)).status).toBe('open');
    expect(await openCriticals(seq)).toBe(1);
    const verdict = await dispatchVerdict(seq);
    expect(verdict.cleared).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/critical/i);
  });
});

describe("'fixed' needs a completed review after the finding's run", () => {
  it('is refused without one — a failed, running or earlier run does not count — and allowed with one', async () => {
    const seq = await makeSequence();
    await run(seq, 'complete', 4); // before the finding's run: not evidence
    const r1 = await run(seq, 'complete', 3);
    const crit = await finding(r1);
    await run(seq, 'failed', 2);
    await run(seq, 'running', 1);

    const offered = await shadowFindingDisposable(queryable, { sequenceId: seq, organizationId: ORG, findingId: crit });
    expect(offered).toMatchObject({ findingId: crit, runId: r1, offered: ['accepted'], laterCompletedRunId: null });

    const pre = await precheckGovernedStep(seq, INTENT, ctx, { findingId: crit, disposition: 'fixed' });
    expect(pre).toMatchObject({ step: INTENT, cleared: false, refusal: expect.stringMatching(new RegExp(`since run #${r1}`)) });
    expect((await precheckGovernedStep(seq, INTENT, ctx, { findingId: crit, disposition: 'accepted' })).cleared).toBe(true);

    const early = await signFor(seq, crit, 'fixed', { reason: FIXED_REASON });
    const refused = await outcome(dispose(seq, crit, 'fixed', early));
    expect(refused).toMatchObject({ code: 'SHADOW_FINDING_NOT_DISPOSABLE', message: expect.stringMatching(/cannot be marked fixed/) });
    expect((await findingRow(crit)).status).toBe('open');

    // A later completed review — not a clean one: it raised a critical of its own.
    const r2 = await run(seq, 'complete', 0.5);
    const itsOwn = await finding(r2);
    const cleared = await precheckGovernedStep(seq, INTENT, ctx, { findingId: crit, disposition: 'fixed' });
    expect(cleared).toMatchObject({ cleared: true, refusal: null, shadowFindingDisposition: { offered: ['accepted', 'fixed'], laterCompletedRunId: r2 } });

    const sig = await signFor(seq, crit, 'fixed', { reason: FIXED_REASON, meaning: 'approval' });
    const record = await dispose(seq, crit, 'fixed', sig);
    expect(record).toMatchObject({ disposition: 'fixed', dispositionRecord: { disposition: 'fixed', reason: FIXED_REASON } });
    expect(await findingRow(crit)).toMatchObject({ status: 'fixed', disposition_reason: FIXED_REASON });
    // The later run's own critical still blocks: each is closed on its own.
    expect((await findingRow(itsOwn)).status).toBe('open');
    expect(await openCriticals(seq)).toBe(1);
  });
});

describe('a refused disposition', () => {
  it('voids the signature it was given, and the void signature does not serve a later attempt', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    const given = await signFor(seq, crit, 'fixed', { reason: FIXED_REASON });
    const refused = await outcome(dispose(seq, crit, 'fixed', given));
    expect(refused).toMatchObject({ code: 'SHADOW_FINDING_NOT_DISPOSABLE' });
    expect(refused.message).toMatch(/signature given for this Shadow Review finding disposition is now void/);
    expect(await signatureRow(given)).toMatchObject({ is_valid: false, verification_status: 'voided' });
    expect((await auditRowsNaming(given)).map((r) => [r.action, r.v.step])).toEqual([['GOVERNED_SIGNATURE_VOIDED', INTENT]]);

    await run(seq, 'complete', 1);
    const reused = await outcome(dispose(seq, crit, 'fixed', given));
    expect(reused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/so it is void/) });
    expect((await findingRow(crit)).status).toBe('open');
    const fresh = await signFor(seq, crit, 'fixed', { reason: FIXED_REASON });
    await dispose(seq, crit, 'fixed', fresh);
    expect((await findingRow(crit)).status).toBe('fixed');
  });

  it("the sequence's author is refused (separation of duties)", async () => {
    const seq = await makeSequence('validated', SIGNER);
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    const sig = await signFor(seq, crit, 'accepted');
    const refused = await outcome(dispose(seq, crit, 'accepted', sig));
    expect(refused).toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/Separation of duties/) });
    expect(await findingRow(crit)).toMatchObject({ status: 'open', disposed_by: null });
    expect(await openCriticals(seq)).toBe(1);
  });

  it('a signature for finding A cannot disposition finding B, nor give A another disposition', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const a = await finding(r1);
    const b = await finding(r1);
    const forA = await signFor(seq, a, 'accepted');
    const refused = await outcome(dispose(seq, b, 'accepted', forA));
    expect(refused).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(new RegExp(`given for finding #${a}, not finding #${b}`)) });
    expect((await findingRow(a)).status).toBe('open');
    expect((await findingRow(b)).status).toBe('open');

    const acceptA = await signFor(seq, a, 'accepted');
    await run(seq, 'complete', 1);
    const other = await outcome(dispose(seq, a, 'fixed', acceptA));
    expect(other).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/'accepted', not 'fixed'/) });
    expect((await findingRow(a)).status).toBe('open');

    const named = await sign(seq, { intent: INTENT });
    expect(await outcome(dispose(seq, a, 'accepted', named))).toMatchObject({
      code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/names no finding/),
    });
  });

  it('a non-critical, an already closed, or another sequence\'s finding is not disposable', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const major = await finding(r1, 'major');
    const sigMajor = await signFor(seq, major, 'accepted');
    expect(await outcome(dispose(seq, major, 'accepted', sigMajor))).toMatchObject({
      code: 'SHADOW_FINDING_NOT_DISPOSABLE', message: expect.stringMatching(/not critical/),
    });

    const crit = await finding(r1);
    await dispose(seq, crit, 'accepted', await signFor(seq, crit, 'accepted'));
    expect(await outcome(dispose(seq, crit, 'accepted', await signFor(seq, crit, 'accepted')))).toMatchObject({
      code: 'SHADOW_FINDING_NOT_DISPOSABLE', message: expect.stringMatching(/already accepted/),
    });

    const elsewhere = await makeSequence();
    const theirs = await finding(await run(elsewhere, 'complete', 1));
    expect(await outcome(dispose(seq, theirs, 'accepted', await signFor(seq, theirs, 'accepted')))).toMatchObject({
      code: 'SHADOW_FINDING_NOT_DISPOSABLE', message: expect.stringMatching(/not a finding of a Shadow Review run of this sequence/),
    });
    expect((await findingRow(theirs)).status).toBe('open');
  });

  it('a disposition signed as review, not approval or responsibility, is refused', async () => {
    const seq = await makeSequence();
    const crit = await finding(await run(seq, 'complete', 1));
    const sig = await signFor(seq, crit, 'accepted', { meaning: 'review' });
    expect(await outcome(dispose(seq, crit, 'accepted', sig))).toMatchObject({
      code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/approval or responsibility/),
    });
    expect((await findingRow(crit)).status).toBe('open');
  });
});

describe('a disposition signature is used once, and is its own act', () => {
  it('the same signature cannot disposition again, and the attempt does not void it', async () => {
    const seq = await makeSequence();
    const crit = await finding(await run(seq, 'complete', 1));
    const sig = await signFor(seq, crit, 'accepted');
    await dispose(seq, crit, 'accepted', sig);
    const again = await outcome(dispose(seq, crit, 'accepted', sig));
    expect(again).toMatchObject({ code: 'GOVERNED_REQUIRED', message: expect.stringMatching(/already authorized/) });
    expect(await signatureRow(sig)).toMatchObject({ is_valid: true, verification_status: 'valid' });
    expect((await auditRowsNaming(sig)).map((r) => r.action)).toEqual(['SHADOW_FINDING_DISPOSITIONED']);
  });

  it('cannot freeze or waive, and a freeze or waiver signature cannot disposition', async () => {
    const seq = await makeSequence();
    const crit = await finding(await run(seq, 'complete', 1));
    const disposition = await signFor(seq, crit, 'accepted');
    expect(await outcome(freezeSequence(seq, ctx, disposition))).toMatchObject({
      code: 'GOVERNED_REQUIRED', message: expect.stringMatching(new RegExp(`declares intent '${INTENT}', not 'freeze'`)),
    });
    expect(await outcome(waiveShadowReview({ sequenceId: seq, signatureActionId: disposition, failedRunId: 1 }, ctx))).toMatchObject({
      code: 'GOVERNED_REQUIRED', message: expect.stringMatching(new RegExp(`declares intent '${INTENT}', not 'shadow-waiver'`)),
    });
    // Neither refusal is this act's, so neither voids the disposition signature.
    expect(await signatureRow(disposition)).toMatchObject({ is_valid: true });

    for (const intent of ['freeze', 'shadow-waiver']) {
      const sig = await sign(seq, { intent, findingId: crit, disposition: 'accepted' }, { meaning: 'approval' });
      expect(await outcome(dispose(seq, crit, 'accepted', sig))).toMatchObject({
        code: 'GOVERNED_REQUIRED', message: expect.stringMatching(new RegExp(`declares intent '${intent}', not '${INTENT}'`)),
      });
      expect(await signatureRow(sig)).toMatchObject({ is_valid: true, verification_status: 'valid' });
    }
    expect((await findingRow(crit)).status).toBe('open');
  });
});

describe('a closure stands only while its signature is in force', () => {
  const revoke = (actionId: string) =>
    q(`UPDATE electronic_signatures SET is_valid = false, verification_status = 'revoked' WHERE (signature_manifest::jsonb ->> 'actionId') = $1`, [actionId]);
  const assess = (seq: number) => assessSequenceDispatchReadiness({ sequenceId: seq, organizationId: ORG });

  it('a revoked closing signature reopens the critical for the gate, the offer and the read; a new signature closes it again', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    const first = await signFor(seq, crit, 'accepted');
    await dispose(seq, crit, 'accepted', first);
    expect(await openCriticals(seq)).toBe(0);
    const closedVerdict = await assess(seq);
    expect(closedVerdict.unacknowledgedShadowCriticals).toBe(0);

    await revoke(first);
    const standing = await criticalsStandingOpen(queryable, { sequenceId: seq, organizationId: ORG });
    expect(standing).toEqual({ count: 1, reopened: [{ findingId: crit, status: 'accepted', signatureActionId: first }] });
    // The real dispatch verdict: counted, and said by finding and signature, in every governed step's verdict.
    const reopened = await assess(seq);
    expect(reopened.unacknowledgedShadowCriticals).toBe(1);
    const sentence = reopenedCriticalSentence({ findingId: crit, status: 'accepted', signatureActionId: first });
    for (const verdict of [reopened.gate, reopened.freezeGate, reopened.dispatchGateOnSigning]) {
      expect(verdict.cleared).toBe(false);
      expect(verdict.blockers).toContain(sentence);
    }
    expect(reopened.gates.find((g) => g.key === 'structural')?.blockers).toContain(sentence);

    // Offered again, by the act's own rule, saying why.
    const offer = await shadowFindingDisposable(queryable, { sequenceId: seq, organizationId: ORG, findingId: crit });
    expect(offer.offered).toEqual(['accepted']);
    expect(offer.reason).toContain(sentence);
    const [read] = (await withShadowFindingDispositions(queryable, { organizationId: ORG, runId: r1 }, await getShadowReviewFindings(r1, ctx)))
      .filter((f) => f.id === crit);
    expect(read).toMatchObject({ standsOpen: true, dispositionsOffered: ['accepted'], disposition: { signatureState: 'revoked' } });

    // The revoked signature closes nothing again; a new one does.
    expect(await outcome(dispose(seq, crit, 'accepted', first))).toMatchObject({ code: 'GOVERNED_REQUIRED' });
    const second = await signFor(seq, crit, 'accepted');
    await dispose(seq, crit, 'accepted', second);
    expect(await findingRow(crit)).toMatchObject({ status: 'accepted', disposition_signature_action_id: second });
    expect(await openCriticals(seq)).toBe(0);
    expect((await assess(seq)).gate.blockers).not.toContain(sentence);
    // The first closure stays on the chain.
    expect((await auditRowsNaming(first)).map((r) => r.action)).toContain('SHADOW_FINDING_DISPOSITIONED');
  });

  it('a closure with no signature on record, or a status nothing signed, does not hold a critical closed', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const unsigned = await finding(r1);
    const waived = await finding(r1);
    await q(`UPDATE shadow_review_findings SET status = 'accepted' WHERE id = $1`, [unsigned]);
    await q(`UPDATE shadow_review_findings SET status = 'waived' WHERE id = $1`, [waived]);
    const standing = await criticalsStandingOpen(queryable, { sequenceId: seq, organizationId: ORG });
    expect(standing.count).toBe(2);
    expect(standing.reopened.map((r) => r.findingId)).toEqual([unsigned, waived]);
    expect(reopenedCriticalSentence(standing.reopened[0])).toMatch(/with no signature on record, so it blocks dispatch again/);
  });

  it('the act changes only the row it judged: a finding re-closed since is zero rows', async () => {
    const seq = await makeSequence();
    const r1 = await run(seq, 'complete', 2);
    const crit = await finding(r1);
    await dispose(seq, crit, 'accepted', await signFor(seq, crit, 'accepted'));
    const stale = shadowFindingDispositionUpdate({
      sequenceId: seq, organizationId: ORG, signerId: SIGNER, findingId: crit, disposition: 'accepted',
      signatureActionId: 'p35-stale', reason: ACCEPT_REASON, judged: { status: 'open', signatureActionId: null },
    });
    expect((await q(stale.text, stale.params)).rows).toEqual([]);
  });
});
