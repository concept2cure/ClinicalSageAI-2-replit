/**
 * The Shadow Review waiver — decision P-34, client half
 * (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-34").
 *
 * Shadow Review stays a dispatch gate: a never-reviewed dossier is not cleared.
 * When the newest run failed because every AI provider failed, the SERVER may
 * say a waiver is eligible (`shadowReviewWaivable` on GET
 * /sequences/:seqId/dispatch-readiness). A person with signing authority then
 * signs one on the sequence — the parent's Part 11 chain, intent
 * `shadow-waiver`, meaning responsibility or approval — and the dispatch reads
 * "cleared, not assessed by Shadow Review". It answers only "no review has
 * run"; it never waives a finding.
 *
 * This module decides nothing. Eligibility, the waiver's state and the
 * shadowPresence gate's note are the server's; absent fields (an older server)
 * offer nothing and claim nothing. The words for a run's failure code are
 * display only — they never decide whether a waiver is offered.
 *
 * Endpoints:
 *   GET  /api/submissions/sequences/:seqId/dispatch-readiness   (state, eligibility)
 *   GET  /api/submissions/sequences/:seqId/shadow-review        (the failed run's time)
 *   POST /api/submissions/sequences/:seqId/shadow-review/waive  {signatureActionId, failedRunId}
 */
import React from 'react';
import { SHADOW_REVIEW_FAILURE_CLAUSE, isShadowReviewFailureCode } from '@shared/constants/shadow-review-failure';
import { I } from '../icons';
import { hasKeys, isRowsWith, useLiveData, useLiveRows } from '../dataConnect';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { clause, mutateVerbatim } from './SubmissionSeqWorkspaces';

export type ShadowWaiverState = 'none' | 'active' | 'lapsed' | 'revoked' | 'undetermined';

/** The sequence's waiver, as the dispatch-readiness answer reports it. */
export interface ShadowReviewWaiver {
  state: ShadowWaiverState;
  signatureActionId?: string;
  signerName?: string | null;
  signedAt?: string | null;
  failedRunId?: number;
  failureCode?: string;
}

/** Whether a waiver may be signed now, and the failed run it would answer. */
export interface ShadowReviewWaivable {
  eligible: boolean;
  failedRunId?: number;
  failureCode?: string;
  reason: string;
}

/** The fields of the dispatch-readiness answer this module reads. All but
 *  `shadowReviewMissing` are absent on a server older than P-34. */
export interface WaiverReadiness {
  shadowReviewMissing: boolean;
  shadowReviewWaiver?: ShadowReviewWaiver;
  shadowReviewWaivable?: ShadowReviewWaivable;
  gates?: Array<{ key: string; cleared?: boolean; notAssessed?: string }>;
}

/** What the waiver's signature is given for: the failed run it answers. */
export interface WaiverRequest {
  failedRunId: number;
}

/* ── The signature ceremony's words (read by SubmissionCenter's EsignModal) ── */

/** §11.50: a waiver is signed in responsibility or approval (P-34). Never
 *  authorship, which the sign route exempts from separation of duties, and
 *  never review: nothing was reviewed. */
export const SHADOW_WAIVER_MEANINGS: ReadonlyArray<EsigMeaning> = ['responsibility', 'approval'];
export const SHADOW_WAIVER_ACTION = 'Waive Shadow Review';

/** The dialog's target line: what the signature does. */
export function shadowWaiverTargetLine(w: WaiverRequest | undefined): string {
  const because = w ? `, because Shadow Review run #${w.failedRunId} failed` : '';
  return `the dossier goes forward without an AI adversarial review${because}; no finding is waived`;
}

/* ── Reading the server's answer ──────────────────────────────────────────── */

const STATES: ReadonlySet<string> = new Set(['none', 'active', 'lapsed', 'revoked', 'undetermined']);

/** The waiver the server reported; null when absent or not one of the five states. */
export function waiverOf(a: WaiverReadiness | null | undefined): ShadowReviewWaiver | null {
  const w = a?.shadowReviewWaiver;
  return w && typeof w === 'object' && STATES.has(w.state) ? w : null;
}

/** The failed run a waiver is offered for: only when the server says eligible
 *  and names the run, and no waiver is already active. */
function offeredRun(a: WaiverReadiness): ShadowReviewWaivable & { failedRunId: number } | null {
  const w = a.shadowReviewWaivable;
  if (!w || w.eligible !== true || typeof w.failedRunId !== 'number') return null;
  if (waiverOf(a)?.state === 'active') return null;
  return { ...w, failedRunId: w.failedRunId };
}

/** The server's words when the newest run failed and it judged that run not
 *  waivable — so the person knows why nothing is offered. Null otherwise. */
function notWaivableReason(a: WaiverReadiness): string | null {
  const w = a.shadowReviewWaivable;
  if (!a.shadowReviewMissing || !w || w.eligible !== false || typeof w.failedRunId !== 'number') return null;
  if (waiverOf(a)?.state === 'active') return null;
  return typeof w.reason === 'string' && w.reason.trim() ? w.reason : null;
}

/**
 * A run's recorded failure code, as the clause after "failed because": the
 * one vocabulary the server applies (shared/constants/shadow-review-failure.ts).
 * Display only: which codes are waivable is never decided here. An unknown code
 * is null.
 */
export function failureWords(code: unknown): string | null {
  return isShadowReviewFailureCode(code) ? SHADOW_REVIEW_FAILURE_CLAUSE[code] : null;
}

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/** " signed by Dana Reyes on <time> under signature act_1" — each part only when recorded. */
function signedBy(w: ShadowReviewWaiver): string {
  const at = when(w.signedAt);
  return [
    w.signerName ? ` signed by ${w.signerName}` : '',
    at ? ` on ${at}` : '',
    w.signatureActionId ? ` under signature ${w.signatureActionId}` : '',
  ].join('');
}

/** The shadowPresence gate's own note, as the server sent it. */
function shadowPresenceNote(a: WaiverReadiness): string | null {
  const gate = Array.isArray(a.gates) ? a.gates.find((g) => g && g.key === 'shadowPresence') : undefined;
  return typeof gate?.notAssessed === 'string' && gate.notAssessed.trim() ? gate.notAssessed : null;
}

/** An active waiver, said from its own fields when the gate sent no note. */
function activeFallback(w: ShadowReviewWaiver): string {
  const run = typeof w.failedRunId === 'number' ? `, because Shadow Review run #${w.failedRunId} failed` : '';
  return `Cleared, not assessed by Shadow Review: waived${signedBy(w)}${run}. No AI adversarial review has read this sequence.`;
}

const MISSING_NOTE =
  'No completed Shadow Review has run for this sequence — that is one of the reasons the gate blocks. ' +
  'Dispatch is not permitted until it has been adversarially reviewed.';

function blockedSentence(w: ShadowReviewWaiver | null): string {
  if (w?.state === 'lapsed') {
    return `The Shadow Review waiver${signedBy(w)} has lapsed: the sequence's leaves changed after it was signed, so it no longer covers them. No completed Shadow Review has run on the leaves as they stand, so the gate blocks.`;
  }
  if (w?.state === 'revoked') {
    return `The Shadow Review waiver${signedBy(w)} was revoked, so it clears nothing. No completed Shadow Review has run for this sequence, so the gate blocks.`;
  }
  if (w?.state === 'undetermined') {
    return 'Whether a Shadow Review waiver covers this sequence could not be determined, so none is relied on. No completed Shadow Review has run for this sequence, so the gate blocks.';
  }
  return MISSING_NOTE;
}

/* ── Dispatch tab ─────────────────────────────────────────────────────────── */

/**
 * The shadowPresence gate in words, by the waiver's state. `shadowReviewMissing`
 * is a hard blocker merged into the gate, so with no active waiver this is the
 * reason the gate blocks — never a permission. An active waiver renders the
 * server's notAssessed note: cleared, not assessed.
 */
export function ShadowPresenceNote({ a }: { a: WaiverReadiness }) {
  const w = waiverOf(a);
  if (w?.state === 'active') {
    const note = shadowPresenceNote(a);
    if (!note && !a.shadowReviewMissing) return null;
    return (
      <div className="sc-verdict tone-warn" role="status" data-shadow-waiver="active">
        {note ?? activeFallback(w)}
      </div>
    );
  }
  if (!a.shadowReviewMissing) return null;
  return (
    <div className="sc-verdict tone-warn" role="status" data-shadow-waiver={w?.state ?? 'unknown'}>
      {blockedSentence(w)}
    </div>
  );
}

/** Beside "Dispatch gate clear": what the clear rests on when a waiver carries it. */
export function WaivedGateMark({ a }: { a: WaiverReadiness }) {
  // The same rule as ShadowPresenceNote: the waiver carries the clear only
  // while no completed review does.
  const carries = waiverOf(a)?.state === 'active' && (a.shadowReviewMissing || shadowPresenceNote(a) !== null);
  return carries ? <> — not assessed by Shadow Review (waived)</> : null;
}

interface RunTime {
  id: number;
  createdAt: string | null;
}

/** "Shadow Review run #91 failed on <time> because every AI provider was unavailable, so …" */
function OfferLine({ seqId, offer }: { seqId: number; offer: ShadowReviewWaivable & { failedRunId: number } }) {
  const runsPath = `/api/submissions/sequences/${seqId}/shadow-review`;
  const runs = useLiveRows<RunTime>(runsPath, [runsPath], isRowsWith<RunTime>('id'));
  const at = when(runs.rows.find((r) => r.id === offer.failedRunId)?.createdAt);
  const words = failureWords(offer.failureCode);
  return (
    <div className="scaf-note sc-mb">
      Shadow Review run #{offer.failedRunId} failed{at ? ` on ${at}` : ''}
      {words ? ` because ${words}` : ''}, so a signed waiver is offered{words ? '' : ` (${clause(offer.reason)})`}. It lets
      the dossier go forward without an AI adversarial review, and it waives no finding.
    </div>
  );
}

/**
 * The waiver, offered ONLY when the server says it is eligible, the user may
 * sign (separation of duties, the same signer state the freeze and dispatch
 * buttons read) and the sequence is not dispatched. The click requests the
 * parent's governed chain; nothing here signs or waives.
 */
export function ShadowWaiverOffer({
  a,
  seq,
  canSign,
  onWaive,
}: {
  a: WaiverReadiness;
  seq: { id: number; status: string };
  canSign: boolean;
  onWaive: (w: WaiverRequest) => void;
}) {
  const offer = offeredRun(a);
  if (seq.status === 'dispatched') return null;
  if (!offer) {
    const notWaivable = notWaivableReason(a);
    return notWaivable ? <div className="scaf-note sc-mb">{notWaivable}</div> : null;
  }
  if (!canSign) return null;
  return (
    <div className="sc-mt" data-testid="sc-shadow-waiver-offer">
      <OfferLine seqId={seq.id} offer={offer} />
      <div className="cm-pushbar sc-mb">
        <button type="button" className="sc-trans-b" onClick={() => onWaive({ failedRunId: offer.failedRunId })}>
          {I.penLine} Waive Shadow Review — AI provider unavailable (Part 11 e-signature)
        </button>
      </div>
    </div>
  );
}

/* ── The waive step of the governed chain (run by SubmissionCenter) ──────── */

function confirmedWaiver(data: unknown): ShadowReviewWaiver | null {
  const d = data as { state?: unknown; waiver?: unknown; shadowReviewWaiver?: unknown } | null;
  const w = (d && typeof d.state === 'string' ? d : d?.waiver ?? d?.shadowReviewWaiver) as ShadowReviewWaiver | undefined;
  return w && typeof w === 'object' && w.state === 'active' ? w : null;
}

/**
 * POST /sequences/:seqId/shadow-review/waive with the signature and the failed
 * run it answers. Resolves with the confirmed sentence; throws with the
 * server's words on a refusal, and with "could not be confirmed" when no
 * definite answer came back (a dropped connection, a 5xx, a 200 without an
 * active waiver) — never a success the server did not state.
 */
export async function submitShadowWaiver(
  seq: { id: number; sequenceNumber: string },
  signatureActionId: string,
  waiver: WaiverRequest,
): Promise<string> {
  const r = await mutateVerbatim<unknown>('POST', `/api/submissions/sequences/${seq.id}/shadow-review/waive`, {
    signatureActionId,
    failedRunId: waiver.failedRunId,
  });
  if (confirmedWaiver(r.data)) {
    return `Shadow Review waived for sequence ${seq.sequenceNumber}: it goes forward without an AI adversarial review, because run #${waiver.failedRunId} failed`;
  }
  if (r.unconfirmed || !r.error) {
    const said = typeof r.status === 'number' && r.error ? ` — ${clause(r.error)}` : '';
    throw new Error(
      `Whether the Shadow Review was waived could not be confirmed${said}. Check the sequence's Dispatch tab before signing again.`,
    );
  }
  throw new Error(`The Shadow Review was not waived — ${clause(r.error)}. Nothing goes forward on that signature.`);
}

/* ── Shadow review tab ────────────────────────────────────────────────────── */

/** A waiver recorded in the run history: not a review, and not a clear one. */
export function WaivedRunNote({ run }: { run: { id: number } }) {
  return (
    <div className="scaf-note" data-run-status="waived">
      Run #{run.id} records a waiver, not a review: no AI adversarial review read this sequence, so it holds no findings.
      That is the absence of a review, not a clear one. The Dispatch tab names who signed it and under which signature.
    </div>
  );
}

/**
 * A failed run: its recorded failure in words and, when the server says a
 * waiver is eligible for THIS run, where it is offered. Words only — the
 * control is the Dispatch tab's.
 */
export function FailedRunNote({ seqId, run }: { seqId: number; run: { id: number; failureCode?: string | null } }) {
  const path = `/api/submissions/sequences/${seqId}/dispatch-readiness`;
  const live = useLiveData<WaiverReadiness>(path, [path], hasKeys<WaiverReadiness>('shadowReviewMissing'));
  const words = failureWords(run.failureCode);
  const offer = live.data ? offeredRun(live.data) : null;
  const pointer = offer?.failedRunId === run.id;
  if (!words && !run.failureCode && !pointer) return null;
  return (
    <div className="scaf-note sc-mt" data-run-status="failed">
      {words ? (
        <>Run #{run.id} failed because {words}.</>
      ) : run.failureCode ? (
        <>
          Run #{run.id} recorded the failure code <span className="sc-mono">{run.failureCode}</span>, which this screen does
          not describe.
        </>
      ) : null}
      {pointer && (
        <>
          {' '}
          Because no AI provider could review it, the Dispatch tab offers a signed waiver that lets the dossier go forward
          without an AI adversarial review.
        </>
      )}
    </div>
  );
}
