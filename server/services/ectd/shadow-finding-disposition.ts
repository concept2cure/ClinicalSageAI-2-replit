/**
 * Closing a critical Shadow Review finding by a named person's signature, never
 * by silence (P-35, docs/LAUNCH_DEFINITION_OF_DONE.md, decided 2026-10-15).
 *
 * The dispatch gate blocks on every open critical finding across every
 * non-deleted run of the sequence (assess-dispatch-readiness
 * countOpenShadowCriticals: severity 'critical' AND status 'open'), and until
 * this module nothing in the product could close one. So —
 *
 *   - Each open critical finding is dispositioned ON ITS OWN by a Part 11
 *     signature on `ectd-sequence:<id>` with intent `shadow-finding-disposition`,
 *     the finding and the disposition named in the signature's payload
 *     ({ findingId, disposition }), the meaning approval or responsibility, by
 *     someone with signing authority who did not author the sequence.
 *   - 'accepted' (risk accepted): the finding stands and the signer accepts
 *     going forward with it.
 *   - 'fixed': the signer states what changed. Offered only when a COMPLETED
 *     Shadow Review ran after the finding's run. It does not need to be the
 *     clean one — a model's silence is not proof — but one must have run.
 *   - A later review never closes an earlier critical by itself: nothing here,
 *     or anywhere, changes a finding's status except the signed act.
 *   - The signer's reason is the signature's own (electronic_signatures
 *     signature_purpose), copied onto the finding with who and when; the act and
 *     its signature are in the audit chain (SHADOW_FINDING_DISPOSITIONED, which
 *     also spends the signature).
 *   - A non-critical finding is not gated and is not part of this act.
 *
 * The act that records it is submission-service dispositionShadowFinding — the
 * governed steps' Gate 1, its single-use ledger and its void-on-refusal (P-23)
 * are there. This module holds the rules, the SQL and the read, so the precheck,
 * the act and the findings read cannot disagree. No AnA tool reaches it
 * (ana-cannot-disposition-shadow-finding.test.ts).
 *
 * @module server/services/ectd/shadow-finding-disposition
 */
import { isSignatureWithdrawn } from '../part11/signature-persistence';
import { DECISION_ACT_MEANINGS } from '../part11/signature-meanings';
// Where the reads run: the pool, or a transaction's client. The same one-method executor the
// document-data disposition declares; this module declared an identical copy until 2026-10-15.
import type { DispositionQueryable } from '../document-data-disposition/types';

/** The declared intent of a disposition signature (c2c_ana_actions.payload.intent). */
export const SHADOW_FINDING_DISPOSITION_INTENT = 'shadow-finding-disposition' as const;
/** The chained audit action that records a disposition, and spends its signature. */
export const SHADOW_FINDING_DISPOSITIONED_ACTION = 'SHADOW_FINDING_DISPOSITIONED';
/** The §11.50(a)(3) meanings a disposition may carry: the signer approves it, or answers for it. */
export const SHADOW_FINDING_DISPOSITION_MEANINGS = DECISION_ACT_MEANINGS;
/** The two ways a signed act closes a critical finding. */
export const SHADOW_FINDING_DISPOSITIONS = ['accepted', 'fixed'] as const;
export type ShadowFindingDisposition = (typeof SHADOW_FINDING_DISPOSITIONS)[number];

export function isShadowFindingDisposition(v: unknown): v is ShadowFindingDisposition {
  return (SHADOW_FINDING_DISPOSITIONS as readonly unknown[]).includes(v);
}

/** What the request asks: this finding, closed this way. */
export interface ShadowFindingDispositionRequest {
  findingId: number;
  disposition: ShadowFindingDisposition;
}

// ── What the signature must say ──────────────────────────────────────────────

/** Why a disposition signature's declared meaning is refused, or null. */
export function shadowFindingDispositionMeaningRefusal(meaning: unknown): string | null {
  return (SHADOW_FINDING_DISPOSITION_MEANINGS as readonly unknown[]).includes(meaning)
    ? null
    : `the signature declares the meaning '${String(meaning)}'; a Shadow Review finding is closed with the meaning ` +
        'approval or responsibility';
}

/**
 * Why the signature's payload does not authorize THIS request, or null. A
 * disposition signature names one finding and one disposition: one given to
 * accept finding A neither closes finding B nor marks A fixed. Pure.
 */
export function shadowFindingDispositionPayloadRefusal(
  payload: Record<string, unknown> | null | undefined,
  request: ShadowFindingDispositionRequest,
): string | null {
  const raw = payload?.findingId;
  const signedFinding = typeof raw === 'number' || (typeof raw === 'string' && /^\d+$/.test(raw)) ? Number(raw) : null;
  if (signedFinding === null) {
    return 'the signature names no finding; each Shadow Review finding is closed by a signature that names it';
  }
  if (signedFinding !== request.findingId) {
    return (
      `the signature was given for finding #${signedFinding}, not finding #${request.findingId}; ` +
      'each finding is closed by its own signature'
    );
  }
  const signedAs = payload?.disposition;
  if (signedAs !== request.disposition) {
    return (
      `the signature was given to close finding #${request.findingId} as '${String(signedAs ?? 'nothing')}', ` +
      `not '${request.disposition}'; sign this disposition on its own`
    );
  }
  return null;
}

// ── When a disposition is offered ────────────────────────────────────────────

export interface ShadowFindingDisposability {
  findingId: number;
  /** The run the finding was raised in, when it is a finding of this sequence. */
  runId?: number;
  /** The dispositions a signature may record now: none, accepted, or accepted and fixed. */
  offered: ShadowFindingDisposition[];
  /** The newest completed run after the finding's run — what 'fixed' rests on — or null. */
  laterCompletedRunId: number | null;
  /** Why these are offered, or why none is, as one calm sentence. */
  reason: string;
  /** The finding's status and closing signature as judged: the act's
   *  compare-and-set holds both, so it changes only the row that was judged. */
  judged?: { status: string; signatureActionId: string | null };
}

type FindingAt = { id: number; run_id: number; severity: string; status: string; disposition_signature_action_id?: string | null };

/** A finding of a non-deleted run of THIS sequence, in this organization. */
const FINDING_OF_SEQUENCE = `
  SELECT f.id, f.run_id, f.severity, f.status, f.disposition_signature_action_id
    FROM shadow_review_findings f
    JOIN shadow_review_runs r ON r.id = f.run_id AND r.organization_id = f.organization_id AND r.deleted_at IS NULL
   WHERE f.id = $1 AND f.organization_id = $2 AND f.deleted_at IS NULL AND r.sequence_id = $3`;

/**
 * The newest completed, non-deleted run of the same sequence created after run
 * $1 (by time, then id, so two runs in one instant still order). Its own
 * findings do not matter: it need not be clean.
 */
const LATER_COMPLETED_RUN = `
  SELECT c.id
    FROM shadow_review_runs r
    JOIN shadow_review_runs c ON c.sequence_id = r.sequence_id AND c.organization_id = r.organization_id
   WHERE r.id = $1 AND r.organization_id = $2
     AND c.status = 'complete' AND c.deleted_at IS NULL
     AND (c.created_at > r.created_at OR (c.created_at = r.created_at AND c.id > r.id))
   ORDER BY c.created_at DESC NULLS LAST, c.id DESC
   LIMIT 1`;

async function laterCompletedRun(q: DispositionQueryable, runId: number, organizationId: number): Promise<number | null> {
  const row = (await q.query(LATER_COMPLETED_RUN, [runId, organizationId])).rows[0] as { id: number } | undefined;
  return row ? Number(row.id) : null;
}

/**
 * Does a closed finding's closure still stand? Only when its status is one of
 * the dispositions and the signature that closed it is in force. A revoked,
 * superseded or missing signature does not hold a critical closed, and nor
 * does a status nothing signed (the column's vocabulary also has 'waived',
 * which no act writes). The one rule the gate, the offer and the read apply.
 */
function closureStands(status: string, sig: SignatureRow | undefined): boolean {
  return isShadowFindingDisposition(status) && sig !== undefined && !isSignatureWithdrawn(sig);
}

/** Why a closed critical blocks again, as the dispatch gate says it. */
export function reopenedCriticalSentence(r: { findingId: number; status: string; signatureActionId: string | null }): string {
  const under = r.signatureActionId ? `under signature ${r.signatureActionId}, which is no longer in force` : 'with no signature on record';
  return (
    `Critical Shadow Review finding #${r.findingId} was closed as ${r.status} ${under}, so it blocks dispatch again. ` +
    'Close it again under a new signature.'
  );
}

/** The verdict on one finding, given whether a later completed run exists and
 *  whether a closure it carries still stands. Pure. */
function findingDisposability(f: FindingAt, laterRunId: number | null, standsClosed: boolean): ShadowFindingDisposability {
  const findingId = Number(f.id);
  const runId = Number(f.run_id);
  const judged = { status: f.status, signatureActionId: f.disposition_signature_action_id ?? null };
  const none = (reason: string): ShadowFindingDisposability => ({ findingId, runId, offered: [], laterCompletedRunId: laterRunId, reason });
  if (f.severity !== 'critical') {
    return none(
      `Finding #${findingId} is ${f.severity}, not critical: only an open critical finding blocks dispatch, and only an ` +
        'open critical finding is closed by signature.',
    );
  }
  if (f.status !== 'open' && standsClosed) {
    return none(`Finding #${findingId} is already ${f.status}, so there is nothing left to close.`);
  }
  // Open, or closed under a signature no longer in force: it blocks, and may be closed again.
  const again = f.status === 'open' ? '' : `${reopenedCriticalSentence({ findingId, ...judged })} `;
  if (laterRunId === null) {
    return {
      findingId, runId, offered: ['accepted'], laterCompletedRunId: null, judged,
      reason:
        `${again}Critical finding #${findingId} may be closed as risk accepted. It can be marked fixed only after a Shadow Review ` +
        `completes on this sequence after run #${runId}, where it was found.`,
    };
  }
  return {
    findingId, runId, offered: ['accepted', 'fixed'], laterCompletedRunId: laterRunId, judged,
    reason:
      `${again}Critical finding #${findingId} may be closed as risk accepted, or as fixed: Shadow Review run #${laterRunId} ` +
      `completed after run #${runId}, where it was found.`,
  };
}

/** Whether a finding row's closure stands, reading its closing signature. */
async function standsClosed(q: DispositionQueryable, organizationId: number, f: Pick<FindingAt, 'status' | 'disposition_signature_action_id'>): Promise<boolean> {
  if (f.status === 'open') return false;
  const actionId = f.disposition_signature_action_id ?? null;
  return closureStands(f.status, actionId ? await signatureOf(q, organizationId, actionId) : undefined);
}

/**
 * The critical findings of a sequence that block dispatch: every open one, and
 * every closed one whose closure no longer stands (closureStands), named so
 * the gate can say why it blocks again. This is the dispatch assessor's count
 * (P-35): a closure is a signature, and a signature taken out of force closes
 * nothing. Throws on a failed read — the assessor's caller answers, never a
 * count of zero standing in for "could not tell".
 */
export async function criticalsStandingOpen(
  q: DispositionQueryable,
  params: { sequenceId: number; organizationId: number },
): Promise<{ count: number; reopened: Array<{ findingId: number; status: string; signatureActionId: string | null }> }> {
  const rows = (await q.query(
    `SELECT f.id, f.status, f.disposition_signature_action_id
       FROM shadow_review_findings f
       JOIN shadow_review_runs r ON r.id = f.run_id AND r.organization_id = f.organization_id AND r.deleted_at IS NULL
      WHERE r.sequence_id = $1 AND f.organization_id = $2 AND f.severity = 'critical' AND f.deleted_at IS NULL
      ORDER BY f.id`,
    [params.sequenceId, params.organizationId],
  )).rows as Array<{ id: number; status: string; disposition_signature_action_id: string | null }>;
  let count = 0;
  const reopened: Array<{ findingId: number; status: string; signatureActionId: string | null }> = [];
  for (const f of rows) {
    if (f.status === 'open') { count += 1; continue; }
    if (await standsClosed(q, params.organizationId, f)) continue;
    count += 1;
    reopened.push({ findingId: Number(f.id), status: f.status, signatureActionId: f.disposition_signature_action_id ?? null });
  }
  return { count, reopened };
}

/**
 * May this finding be closed by signature now, and how? Read on `q`, so the
 * act re-asks it under the sequence row lock. Throws on a failed read: a
 * caller that cannot tell is not told "offered".
 */
export async function shadowFindingDisposable(
  q: DispositionQueryable,
  params: { sequenceId: number; organizationId: number; findingId: number },
): Promise<ShadowFindingDisposability> {
  const { sequenceId, organizationId, findingId } = params;
  const f = (await q.query(FINDING_OF_SEQUENCE, [findingId, organizationId, sequenceId])).rows[0] as FindingAt | undefined;
  if (!f) {
    return {
      findingId, offered: [], laterCompletedRunId: null,
      reason: `Finding #${findingId} is not a finding of a Shadow Review run of this sequence, so it cannot be closed here.`,
    };
  }
  return findingDisposability(f, await laterCompletedRun(q, Number(f.run_id), organizationId), await standsClosed(q, organizationId, f));
}

/** Why closing the finding this way is refused, given what is offered, or null. Pure. */
export function shadowFindingDispositionRefusal(
  offered: ShadowFindingDisposability,
  disposition: ShadowFindingDisposition,
): string | null {
  if (offered.offered.includes(disposition)) return null;
  if (offered.offered.length === 0) return offered.reason;
  return (
    `Finding #${offered.findingId} cannot be marked fixed: no completed Shadow Review has run on this sequence since ` +
    `run #${offered.runId}, where it was found. Run Shadow Review again first; the later review need not be clean, ` +
    'but one must have completed. It may be closed as risk accepted now.'
  );
}

// ── The record ───────────────────────────────────────────────────────────────

type SignatureRow = {
  id: number; signer_name: string | null; signature_meaning: string | null; reason: string | null;
  superseded_by: unknown; is_valid: unknown; verification_status: unknown;
};

/** The disposition signature's row, by its governed sign action, on the sequence's target or any. */
async function signatureOf(
  q: DispositionQueryable,
  organizationId: number,
  signatureActionId: string,
): Promise<SignatureRow | undefined> {
  return (await q.query(
    `SELECT id, signer_name, signature_meaning, COALESCE(signature_purpose, signature_manifest::jsonb ->> 'reason') AS reason,
            superseded_by, is_valid, verification_status
       FROM electronic_signatures
      WHERE organization_id = $1 AND (signature_manifest::jsonb ->> 'actionId') = $2
      ORDER BY id DESC LIMIT 1`,
    [organizationId, signatureActionId],
  )).rows[0] as SignatureRow | undefined;
}

/**
 * The signer's reason for a disposition: the signature's own, as the sign route
 * recorded it (at least eight characters). Null when none can be read, and the
 * act then records nothing — a disposition without its reason is not one.
 */
export async function dispositionSignatureReason(
  q: DispositionQueryable,
  params: { organizationId: number; signatureActionId: string },
): Promise<string | null> {
  const sig = await signatureOf(q, params.organizationId, params.signatureActionId);
  const reason = typeof sig?.reason === 'string' ? sig.reason.trim() : '';
  return reason ? reason : null;
}

/**
 * The finding's disposition columns, and its status, as one compare-and-set
 * UPDATE on the status and closing signature it was judged with: an open
 * critical, or one closed under a signature no longer in force (closureStands),
 * of a non-deleted run of this sequence. A finding closed, re-closed, deleted
 * or moved since it was judged is zero rows, never a second disposition. The
 * earlier closure stays on the audit chain (its SHADOW_FINDING_DISPOSITIONED
 * row) and its signature row; the finding carries the one that stands.
 */
export function shadowFindingDispositionUpdate(p: {
  sequenceId: number;
  organizationId: number;
  signerId: number;
  findingId: number;
  disposition: ShadowFindingDisposition;
  signatureActionId: string;
  reason: string;
  judged: { status: string; signatureActionId: string | null };
}): { text: string; params: unknown[] } {
  return {
    text: `UPDATE shadow_review_findings f
              SET status = $1, disposition_signature_action_id = $2, disposed_by = $3, disposed_at = now(),
                  disposition_reason = $4, updated_at = now()
            WHERE f.id = $5 AND f.organization_id = $6 AND f.severity = 'critical' AND f.deleted_at IS NULL
              AND f.status = $8 AND f.disposition_signature_action_id IS NOT DISTINCT FROM $9::text
              AND EXISTS (SELECT 1 FROM shadow_review_runs r
                           WHERE r.id = f.run_id AND r.sequence_id = $7 AND r.organization_id = f.organization_id AND r.deleted_at IS NULL)
           RETURNING f.id`,
    params: [
      p.disposition, p.signatureActionId, p.signerId, p.reason, p.findingId, p.organizationId, p.sequenceId,
      p.judged.status, p.judged.signatureActionId,
    ],
  };
}

/** Whether the signature a disposition rests on is still in force, as the read reports it. */
export type DispositionSignatureState = 'in-force' | 'revoked' | 'not-found';

/** A closed critical, as the findings read and the act report it. */
export interface ShadowFindingDispositionView {
  disposition: ShadowFindingDisposition;
  disposedBy: number | null;
  /** The signer's printed name on the signature (§11.50), or null when it cannot be read. */
  disposedByName: string | null;
  disposedAt: string | null;
  reason: string | null;
  signatureActionId: string | null;
  /** electronic_signatures.id of the disposition signature. */
  signatureId: number | null;
  meaning: string | null;
  signatureState: DispositionSignatureState;
}

/** What the disposition act answers. */
export interface ShadowFindingDispositionRecord {
  sequenceId: number;
  findingId: number;
  runId: number;
  disposition: ShadowFindingDisposition;
  signatureActionId: string;
  signatureId: number | null;
  /** The disposition as it now reads back from the finding; null if the read-back failed. */
  dispositionRecord: ShadowFindingDispositionView | null;
}

const iso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

type DisposedRow = {
  status: string;
  disposedBy?: number | null;
  disposedAt?: unknown;
  dispositionReason?: string | null;
  dispositionSignatureActionId?: string | null;
};

async function dispositionView(q: DispositionQueryable, organizationId: number, row: DisposedRow): Promise<ShadowFindingDispositionView | null> {
  if (!isShadowFindingDisposition(row.status)) return null;
  const actionId = row.dispositionSignatureActionId ?? null;
  const sig = actionId ? await signatureOf(q, organizationId, actionId) : undefined;
  const signatureId = sig ? Number(sig.id) : null;
  return {
    disposition: row.status,
    disposedBy: row.disposedBy ?? null,
    disposedByName: sig?.signer_name ?? null,
    disposedAt: iso(row.disposedAt),
    reason: row.dispositionReason ?? null,
    signatureActionId: actionId,
    signatureId: Number.isFinite(signatureId) ? signatureId : null,
    meaning: sig?.signature_meaning ?? null,
    signatureState: !sig ? 'not-found' : isSignatureWithdrawn(sig) ? 'revoked' : 'in-force',
  };
}

/** One finding's disposition, read back after the act. */
export async function readShadowFindingDisposition(
  q: DispositionQueryable,
  params: { organizationId: number; findingId: number },
): Promise<ShadowFindingDispositionView | null> {
  const row = (await q.query(
    `SELECT status, disposed_by AS "disposedBy", disposed_at AS "disposedAt", disposition_reason AS "dispositionReason",
            disposition_signature_action_id AS "dispositionSignatureActionId"
       FROM shadow_review_findings WHERE id = $1 AND organization_id = $2`,
    [params.findingId, params.organizationId],
  )).rows[0] as DisposedRow | undefined;
  return row ? dispositionView(q, params.organizationId, row) : null;
}

/** The finding fields the findings read hands in (getShadowReviewFindings' rows). */
type FindingRowIn = DisposedRow & { id: number; runId: number; severity: string };

export type FindingWithDisposition<T> = T & {
  /** Who closed it, how, when, why and under which signature; null while open. */
  disposition: ShadowFindingDispositionView | null;
  /** What a signature may record on it now (the act's own rule). */
  dispositionsOffered: ShadowFindingDisposition[];
  /** The completed run after this run that 'fixed' would rest on, or null. */
  laterCompletedRunId: number | null;
  /** A critical that blocks dispatch: open, or closed under a signature no longer in force. */
  standsOpen: boolean;
};

/**
 * The findings of one run, each with its disposition and what may be signed on
 * it now — by the rule the act applies (findingDisposability), so the screen
 * never offers what the act would refuse. Throws on a failed read: the caller's
 * error path answers, never a finding shown open that was closed.
 */
export async function withShadowFindingDispositions<T extends FindingRowIn>(
  q: DispositionQueryable,
  params: { organizationId: number; runId: number },
  rows: T[],
): Promise<Array<FindingWithDisposition<T>>> {
  const views = await Promise.all(rows.map((row) => dispositionView(q, params.organizationId, row)));
  // The closure rule (closureStands), read from the view: a closed critical stands closed only under a signature in force.
  const closed = rows.map((row, i) => row.status !== 'open' && views[i]?.signatureState === 'in-force');
  const anyOpenCritical = rows.some((r, i) => r.severity === 'critical' && !closed[i]);
  const laterRunId = anyOpenCritical ? await laterCompletedRun(q, params.runId, params.organizationId) : null;
  return rows.map((row, i) => {
    const offered = findingDisposability(
      { id: row.id, run_id: row.runId, severity: row.severity, status: row.status, disposition_signature_action_id: row.dispositionSignatureActionId ?? null },
      laterRunId,
      closed[i],
    ).offered;
    return {
      ...row,
      disposition: views[i],
      dispositionsOffered: offered,
      laterCompletedRunId: offered.length ? laterRunId : null,
      standsOpen: row.severity === 'critical' && !closed[i],
    };
  });
}
