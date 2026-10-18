/**
 * The signed Shadow Review waiver: when one is offered, whether one stands, and
 * what the dispatch verdict's presence gate says with it (P-34,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, decided 2026-10-15).
 *
 * Shadow Review stays a dispatch gate: a never-reviewed dossier is not cleared
 * for dispatch. An AI outage must not stop a regulatory deadline, so —
 *
 *   - A waiver is OFFERED only when the sequence has no completed Shadow Review
 *     and its newest run failed because every AI provider failed or was
 *     overloaded, recorded on the run as a closed failure code
 *     (shared/constants/shadow-review-failure.ts) within the last 24 hours, and the sequence is
 *     not yet frozen (shadowReviewWaivable).
 *   - The waiver is a Part 11 signature on `ectd-sequence:<id>` with intent
 *     `shadow-waiver` and the meaning responsibility or approval, by someone
 *     with signing authority who did not author the sequence. The act that
 *     records it is submission-service waiveShadowReview; this module holds its
 *     rules, so the precheck and the act cannot disagree.
 *   - It is used once, binds the leaf manifest it was signed over and LAPSES
 *     when the leaves change; revoked or lapsed, it blocks with its own sentence
 *     (resolveShadowReviewWaiver, evaluateShadowPresenceWithWaiver).
 *   - It answers only "no review has run". It never waives a critical finding:
 *     the presence gate is the only gate it touches.
 *
 * The dispatch assessor (assess-dispatch-readiness.ts) calls
 * resolveShadowReviewWaiver and evaluateShadowPresenceWithWaiver for its
 * presence gate; the gate it replaced (evaluateShadowPresenceGate) is deleted,
 * and NO_SHADOW_REVIEW_BLOCKER is its sentence, word for word, so a sequence
 * with no waiver reads exactly as it did.
 *
 * @module server/services/ectd/shadow-review-waiver
 */
import {
  BINDING_BASIS,
  deriveGovernedTargetBinding,
  isSignatureWithdrawn,
} from '../part11/signature-persistence';
import { DECISION_ACT_MEANINGS } from '../part11/signature-meanings';
import {
  describeShadowReviewFailure,
  isWaivableShadowReviewFailure,
  type ShadowReviewFailureCode,
  type WaivableShadowReviewFailureCode,
} from '../../../shared/constants/shadow-review-failure';
import type { DispatchGateResult } from './dispatch-gate';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('shadow-review-waiver');

/** Where the reads run: the pool, or a transaction's client. */
export type WaiverQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** The declared intent of a waiver signature (c2c_ana_actions.payload.intent). */
export const SHADOW_WAIVER_INTENT = 'shadow-waiver' as const;
/** The chained audit action that records a waiver, and spends its signature. */
export const SHADOW_REVIEW_WAIVED_ACTION = 'SHADOW_REVIEW_WAIVED';
/** The §11.50(a)(3) meanings a waiver may carry: the signer approves it, or answers for it. */
export const SHADOW_WAIVER_MEANINGS = DECISION_ACT_MEANINGS;
/** P-34's window: an outage within the last 24 hours. */
export const SHADOW_REVIEW_WAIVER_WINDOW_HOURS = 24;
/** A waiver is recorded before the freeze: the freeze verdict carries the presence gate. */
export const WAIVABLE_SEQUENCE_STATUSES: readonly string[] = ['draft', 'assembling', 'validated'];

/**
 * The window in hours. SHADOW_REVIEW_WAIVER_WINDOW_HOURS may shorten it, never
 * lengthen it: 24 hours is the founder's decision, not a deployment setting.
 * Anything unreadable is the decision's 24.
 */
export function shadowReviewWaiverWindowHours(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env.SHADOW_REVIEW_WAIVER_WINDOW_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return SHADOW_REVIEW_WAIVER_WINDOW_HOURS;
  return Math.min(raw, SHADOW_REVIEW_WAIVER_WINDOW_HOURS);
}

/** Why a waiver signature's declared meaning is refused, or null. */
export function shadowWaiverMeaningRefusal(meaning: unknown): string | null {
  return (SHADOW_WAIVER_MEANINGS as readonly unknown[]).includes(meaning)
    ? null
    : `the signature declares the meaning '${String(meaning)}'; a Shadow Review waiver is signed with the meaning ` +
        'responsibility or approval';
}

// ── When a waiver is offered ─────────────────────────────────────────────────

export interface ShadowReviewWaivability {
  eligible: boolean;
  /** The failed run a waiver would rely on (eligible), or the newest run (refused). */
  failedRunId?: number;
  failureCode?: ShadowReviewFailureCode | null;
  /** Why it is offered, or why not, as one calm sentence. */
  reason: string;
}

type NewestRun = { id: number; status: string; failure_code: string | null; failed_at: unknown };

const OFFERED_ONLY_AFTER =
  'A waiver is offered only after a run fails because every AI provider was unavailable or overloaded.';

/** The newest run's verdict on a waiver. Pure. */
function newestRunWaivability(run: NewestRun | undefined, now: Date, hours: number): ShadowReviewWaivability {
  if (!run) return { eligible: false, reason: `No Shadow Review has been attempted for this sequence. ${OFFERED_ONLY_AFTER}` };
  const id = Number(run.id);
  if (run.status === 'waived') {
    return {
      eligible: false,
      reason: `The newest Shadow Review record for this sequence is waiver #${id}. A further waiver needs a newer run that failed for a provider outage: run Shadow Review again.`,
    };
  }
  if (run.status !== 'failed') {
    return { eligible: false, failedRunId: id, reason: `Shadow Review run #${id} is ${run.status}. ${OFFERED_ONLY_AFTER}` };
  }
  const code = (run.failure_code ?? null) as ShadowReviewFailureCode | null;
  if (code === null) {
    return {
      eligible: false, failedRunId: id, failureCode: null,
      reason: `Run #${id} failed before failures were recorded, so it cannot be shown to be an AI provider outage and Shadow Review cannot be waived for it. Run Shadow Review again.`,
    };
  }
  if (!isWaivableShadowReviewFailure(code)) {
    return {
      eligible: false, failedRunId: id, failureCode: code,
      reason: `Run #${id} failed because ${describeShadowReviewFailure(code)}, which is not an AI provider outage, so Shadow Review cannot be waived for it. Run Shadow Review again.`,
    };
  }
  const failedAt = new Date(run.failed_at as string);
  if (Number.isNaN(failedAt.getTime()) || now.getTime() - failedAt.getTime() > hours * 3_600_000) {
    return {
      eligible: false, failedRunId: id, failureCode: code,
      reason: `Run #${id} failed for a provider outage more than ${hours} hours ago. Run Shadow Review again; a waiver is offered for an outage within the last ${hours} hours.`,
    };
  }
  return {
    eligible: true, failedRunId: id, failureCode: code,
    reason: `Run #${id} failed because ${describeShadowReviewFailure(code)}. A signed waiver may stand in for Shadow Review until the sequence's leaves change; the dossier will not have been adversarially reviewed.`,
  };
}

/**
 * Is a Shadow Review waiver offered for this sequence now? Read on `q`, so the
 * waiver act re-asks it under the sequence row lock. Throws on a failed read:
 * a caller that cannot tell is not told "eligible".
 */
export async function shadowReviewWaivable(
  q: WaiverQueryable,
  params: { sequenceId: number; organizationId: number; now?: Date },
): Promise<ShadowReviewWaivability> {
  const { sequenceId, organizationId } = params;
  const seq = (await q.query(
    `SELECT status FROM ectd_sequences WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [sequenceId, organizationId],
  )).rows[0] as { status: string } | undefined;
  if (!seq) return { eligible: false, reason: 'Sequence not found for this organization.' };
  if (!WAIVABLE_SEQUENCE_STATUSES.includes(seq.status)) {
    return {
      eligible: false,
      reason: `Shadow Review can be waived only before the sequence is frozen; this sequence is ${seq.status}.`,
    };
  }
  if ((await completedShadowReviewRuns(q, { sequenceId, organizationId })) > 0) {
    return { eligible: false, reason: 'A completed Shadow Review exists for this sequence, so there is no missing review to waive.' };
  }
  const newest = (await q.query(
    `SELECT id, status, failure_code, COALESCE(updated_at, created_at) AS failed_at FROM shadow_review_runs
      WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 1`,
    [sequenceId, organizationId],
  )).rows[0] as NewestRun | undefined;
  return newestRunWaivability(newest, params.now ?? new Date(), shadowReviewWaiverWindowHours());
}

/** Completed, non-deleted Shadow Review runs of a sequence, read on `q` (the pool or a transaction's client). */
export async function completedShadowReviewRuns(
  q: WaiverQueryable,
  params: { sequenceId: number; organizationId: number },
): Promise<number> {
  const row = (await q.query(
    `SELECT count(*)::int AS n FROM shadow_review_runs
      WHERE sequence_id = $1 AND organization_id = $2 AND status = 'complete' AND deleted_at IS NULL`,
    [params.sequenceId, params.organizationId],
  )).rows[0] as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

/** Why a waiver citing `failedRunId` is refused, given what is offered, or null. Pure. */
export function shadowWaiverRunRefusal(offered: ShadowReviewWaivability, failedRunId: number): string | null {
  if (!offered.eligible) return offered.reason;
  if (offered.failedRunId !== failedRunId) {
    return (
      `The waiver cites run #${failedRunId}, but the run that failed for a provider outage, and the one a waiver ` +
      `may rely on, is #${offered.failedRunId}.`
    );
  }
  return null;
}

/**
 * The 'waived' row, copied from the failed run it relies on: its sequence,
 * region and lens, this organization, the signer as creator. One row, or none
 * when the failed run is not (or no longer) a failed run of this sequence.
 */
export function shadowWaiverInsert(p: {
  sequenceId: number;
  organizationId: number;
  signerId: number;
  signatureActionId: string;
  failedRunId: number;
  failureCode: ShadowReviewFailureCode;
}): { text: string; params: unknown[] } {
  const summary =
    `Shadow Review waived by signature: run #${p.failedRunId} failed because ${describeShadowReviewFailure(p.failureCode)}. ` +
    'Not adversarially reviewed.';
  return {
    text: `INSERT INTO shadow_review_runs
             (sequence_id, region, lens, status, summary, organization_id, created_by, waiver_signature_action_id, waived_failed_run_id)
           SELECT f.sequence_id, f.region, f.lens, 'waived', $1, f.organization_id, $2, $3, f.id
             FROM shadow_review_runs f
            WHERE f.id = $4 AND f.sequence_id = $5 AND f.organization_id = $6 AND f.status = 'failed' AND f.deleted_at IS NULL
           RETURNING id`,
    params: [summary, p.signerId, p.signatureActionId, p.failedRunId, p.sequenceId, p.organizationId],
  };
}

// ── Whether a waiver stands ──────────────────────────────────────────────────

export type ShadowReviewWaiverState = 'none' | 'active' | 'lapsed' | 'revoked' | 'undetermined';

export interface ShadowReviewWaiverStatus {
  state: ShadowReviewWaiverState;
  /** The 'waived' shadow_review_runs row. */
  waiverRunId?: number;
  signatureActionId?: string;
  /** electronic_signatures.id of the waiver signature. */
  signatureId?: number;
  signerName?: string | null;
  signedAt?: string | null;
  failedRunId?: number;
  failureCode?: ShadowReviewFailureCode | null;
  /** Why the state is undetermined, for the log and the client; never a raw error. */
  detail?: string;
}

/** What the waive act answers: the waiver it recorded, as it now resolves. */
export interface ShadowReviewWaiverRecord {
  sequenceId: number;
  failedRunId: number;
  failureCode: WaivableShadowReviewFailureCode;
  signatureActionId: string;
  signatureId: number | null;
  waiver: ShadowReviewWaiverStatus;
}

const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

type WaivedRow = { id: number; waiver_signature_action_id: string | null; waived_failed_run_id: number | null; failure_code: string | null };
type SignatureRow = {
  id: number; signer_name: string | null; signed_at: unknown; bound_payload_digest: string | null;
  binding_basis: string | null; superseded_by: unknown; is_valid: unknown; verification_status: unknown;
};

async function waiverSignatureState(
  q: WaiverQueryable,
  target: string,
  organizationId: number,
  sig: SignatureRow,
): Promise<{ state: ShadowReviewWaiverState; detail?: string }> {
  if (isSignatureWithdrawn(sig)) return { state: 'revoked' };
  if (sig.binding_basis !== BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST || !sig.bound_payload_digest) {
    return { state: 'undetermined', detail: 'the waiver signature is not bound to the sequence leaf manifest' };
  }
  const current = await deriveGovernedTargetBinding(q, target, organizationId);
  if (current.basis !== BINDING_BASIS.ECTD_SEQUENCE_LEAF_MANIFEST || !current.digest) {
    return { state: 'undetermined', detail: 'the sequence leaf manifest could not be re-derived' };
  }
  return current.digest === sig.bound_payload_digest ? { state: 'active' } : { state: 'lapsed' };
}

async function readWaiver(q: WaiverQueryable, sequenceId: number, organizationId: number): Promise<ShadowReviewWaiverStatus> {
  const w = (await q.query(
    `SELECT r.id, r.waiver_signature_action_id, r.waived_failed_run_id, f.failure_code
       FROM shadow_review_runs r
       LEFT JOIN shadow_review_runs f ON f.id = r.waived_failed_run_id AND f.organization_id = r.organization_id
      WHERE r.sequence_id = $1 AND r.organization_id = $2 AND r.status = 'waived' AND r.deleted_at IS NULL
      ORDER BY r.created_at DESC NULLS LAST, r.id DESC LIMIT 1`,
    [sequenceId, organizationId],
  )).rows[0] as WaivedRow | undefined;
  if (!w) return { state: 'none' };
  const base: ShadowReviewWaiverStatus = {
    state: 'undetermined',
    waiverRunId: Number(w.id),
    ...(w.waiver_signature_action_id ? { signatureActionId: w.waiver_signature_action_id } : {}),
    ...(w.waived_failed_run_id != null ? { failedRunId: Number(w.waived_failed_run_id) } : {}),
    failureCode: (w.failure_code ?? null) as ShadowReviewFailureCode | null,
  };
  if (!w.waiver_signature_action_id) return { ...base, detail: 'the waiver names no signature' };
  const target = `ectd-sequence:${sequenceId}`;
  const sig = (await q.query(
    `SELECT id, signer_name, signed_at, bound_payload_digest, binding_basis, superseded_by, is_valid, verification_status
       FROM electronic_signatures
      WHERE organization_id = $1 AND signed_target = $2 AND (signature_manifest::jsonb ->> 'actionId') = $3
      ORDER BY id DESC LIMIT 1`,
    [organizationId, target, w.waiver_signature_action_id],
  )).rows[0] as SignatureRow | undefined;
  if (!sig) return { ...base, detail: 'no electronic signature record is bound to the waiver' };
  const signed = { ...base, signatureId: Number(sig.id), signerName: sig.signer_name ?? null, signedAt: iso(sig.signed_at) };
  return { ...signed, ...(await waiverSignatureState(q, target, organizationId, sig)) };
}

/**
 * The sequence's newest Shadow Review waiver and whether it stands: 'active'
 * only when its signature is in force and still binds the current leaf
 * manifest; 'lapsed' when the leaves changed after it was signed; 'revoked'
 * when the signature was taken out of force; 'none' when no waiver was
 * recorded. A failed lookup is 'undetermined' — never 'active'.
 */
export async function resolveShadowReviewWaiver(
  q: WaiverQueryable,
  params: { sequenceId: number; organizationId: number },
): Promise<ShadowReviewWaiverStatus> {
  try {
    return await readWaiver(q, params.sequenceId, params.organizationId);
  } catch (err) {
    log.warn('Shadow Review waiver lookup failed; reporting undetermined', {
      sequenceId: params.sequenceId,
      organizationId: params.organizationId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { state: 'undetermined', detail: 'the Shadow Review waiver could not be read' };
  }
}

// ── The presence gate, with a waiver ─────────────────────────────────────────

/** The presence gate's sentence when no review has run and no waiver stands —
 *  the one copy of it (the assessor's former evaluateShadowPresenceGate). */
export const NO_SHADOW_REVIEW_BLOCKER =
  'No completed Shadow Review has run for this sequence. A never-reviewed dossier is not cleared for dispatch — run Shadow Review before transmitting.';

export interface ShadowPresenceVerdict extends DispatchGateResult {
  /** Set only when a waiver clears the gate: cleared, and not assessed by Shadow Review. */
  notAssessed?: string;
}

const signatureLabel = (w: ShadowReviewWaiverStatus): string =>
  String(w.signatureId ?? w.signatureActionId ?? 'of record');

/**
 * The presence gate given the completed-run count and the resolved waiver.
 * A completed review clears it whatever the waiver says. With none, only an
 * ACTIVE waiver clears it, and then as not assessed — who waived it, under
 * which signature, because of which failed run. Every other state blocks with
 * its own sentence. Pure. It answers only "has a review run": open critical
 * findings are the structural gate's, and a waiver never reaches them.
 */
export function evaluateShadowPresenceWithWaiver(
  shadowReviewRunCount: number,
  waiver: ShadowReviewWaiverStatus,
): ShadowPresenceVerdict {
  if (shadowReviewRunCount > 0) return { cleared: true, blockers: [] };
  const sig = signatureLabel(waiver);
  switch (waiver.state) {
    case 'active':
      return {
        cleared: true,
        blockers: [],
        notAssessed:
          `Shadow Review waived under signature ${sig} by ${waiver.signerName ?? 'the signer of record'} because the AI provider ` +
          `was ${waiver.failureCode === 'provider_overloaded' ? 'overloaded' : 'unavailable'} (run #${waiver.failedRunId ?? 'not recorded'}); ` +
          'this dossier was not adversarially reviewed.',
      };
    case 'lapsed':
      return {
        cleared: false,
        blockers: [
          `The Shadow Review waiver under signature ${sig} has lapsed: the sequence's leaves changed after it was signed, so it ` +
            'does not cover this dossier. Run Shadow Review, or record a new waiver after a new run fails for a provider outage.',
        ],
      };
    case 'revoked':
      return {
        cleared: false,
        blockers: [
          `The Shadow Review waiver under signature ${sig} was revoked, so it no longer stands in for a review. Run Shadow Review before dispatching.`,
        ],
      };
    case 'undetermined':
      return {
        cleared: false,
        blockers: [
          'Whether a Shadow Review waiver applies to this sequence could not be determined, so none is relied on. ' +
            'No completed Shadow Review has run for this sequence; run Shadow Review, or try again.',
        ],
      };
    default:
      return { cleared: false, blockers: [NO_SHADOW_REVIEW_BLOCKER] };
  }
}
