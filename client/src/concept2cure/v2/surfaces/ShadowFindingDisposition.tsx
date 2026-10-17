/**
 * Closing a critical Shadow Review finding by signature — decision P-35, client
 * half (docs/LAUNCH_DEFINITION_OF_DONE.md "### P-35").
 *
 * The dispatch gate blocks on every open critical finding across every run of
 * the sequence. Each one is closed ON ITS OWN by a named person's Part 11
 * signature on the sequence — the parent's governed chain, intent
 * `shadow-finding-disposition`, meaning approval or responsibility, the finding
 * and the disposition in the payload — with the signer's reason:
 *   - "Accept risk" ('accepted'): the finding stands and the signer accepts
 *     going forward with it;
 *   - "Mark fixed" ('fixed'): the signer states what changed. Offered only when
 *     a completed Shadow Review ran after the finding's run.
 * A later review never closes an earlier critical by itself, and nothing here
 * says it did.
 *
 * This module decides nothing. What may be signed on a finding is the server's
 * `dispositionsOffered` (the act's own rule, per finding); who closed it, how,
 * when and why is the server's `disposition`. A finding without those fields (an
 * older server) is offered nothing. Whether this user may sign is the
 * dispatch-readiness `signer` state — the sign step's own separation-of-duties
 * answer, which the Dispatch tab reads too.
 *
 * Endpoints:
 *   GET  /api/submissions/shadow-review/:runId/findings                       (offers, dispositions)
 *   GET  /api/submissions/sequences/:seqId/dispatch-readiness                 (signer state)
 *   POST /api/submissions/sequences/:seqId/shadow-review/findings/:findingId/disposition
 *        {signatureActionId, disposition}
 */
import React from 'react';
import { I } from '../icons';
import { hasKeys, useLiveData } from '../dataConnect';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { SC_FIND_SEV, SC_FIND_STATUS } from '../fixtures/submission';
import { Chip, clause, mutateVerbatim } from './SubmissionSeqWorkspaces';

export type FindingDisposition = 'accepted' | 'fixed';

/** A closed critical, as the findings read reports it. */
export interface FindingDispositionView {
  disposition: string;
  disposedBy?: number | null;
  disposedByName?: string | null;
  disposedAt?: string | null;
  reason?: string | null;
  signatureActionId?: string | null;
  signatureId?: number | null;
  meaning?: string | null;
  /** 'in-force' | 'revoked' | 'not-found' */
  signatureState?: string;
}

// GET /shadow-review/:runId/findings → shadow_review_findings rows, each with its
// disposition and what may be signed on it now (P-35; absent on an older server).
export interface ShadowFindingRow {
  id: number;
  runId: number;
  dimension: string; // rtf|crl|format|nb
  severity: string; // critical|major|minor|info (SC_FIND_SEV)
  title: string;
  detail: string | null;
  basis: string | null;
  recommendation: string | null;
  leafRef: string | null;
  status: string; // open|accepted|fixed|waived (SC_FIND_STATUS)
  disposition?: FindingDispositionView | null;
  dispositionsOffered?: string[];
  /** The server's word: this critical blocks dispatch — open, or closed under a
   *  signature no longer in force. Absent on an older server. */
  standsOpen?: boolean;
  /** The completed run after this finding's run that 'fixed' rests on. */
  laterCompletedRunId?: number | null;
}

/** What a disposition signature is given for: this finding, closed this way. */
export interface DispositionRequest {
  findingId: number;
  disposition: FindingDisposition;
  title: string;
  runId: number;
  laterCompletedRunId: number | null;
}

/* ── The signature ceremony's words (read by SubmissionCenter's EsignModal) ── */

/** §11.50: a disposition is signed in approval or responsibility (P-35). Never
 *  authorship (the sign route exempts it from separation of duties) and never
 *  review or release. */
export const SHADOW_DISPOSITION_MEANINGS: ReadonlyArray<EsigMeaning> = ['approval', 'responsibility'];

const HOW: Record<FindingDisposition, string> = { accepted: 'risk accepted', fixed: 'fixed' };

/** The dialog's action line. */
export function shadowDispositionAction(d: DispositionRequest | undefined): string {
  return d?.disposition === 'fixed' ? 'Mark critical finding fixed' : 'Accept risk of critical finding';
}

/** The dialog's target line: what the signature does, and what the reason must say. */
export function shadowDispositionTargetLine(d: DispositionRequest | undefined): string {
  if (!d) return 'no finding is named, so nothing will be closed';
  const head = `closes critical finding #${d.findingId} "${d.title}" as ${HOW[d.disposition]}`;
  if (d.disposition === 'accepted') return `${head}: the finding stands and you accept going forward with it; give your reason`;
  const later = d.laterCompletedRunId != null ? `; Shadow Review run #${d.laterCompletedRunId} completed after run #${d.runId}` : '';
  return `${head}: state in the reason what changed${later}`;
}

/** The meaning the dialog opens on: you answer for an accepted risk; you approve a fix. */
export function shadowDispositionDefaultMeaning(d: DispositionRequest | undefined): EsigMeaning {
  return d?.disposition === 'fixed' ? 'approval' : 'responsibility';
}

/** What the sign payload and the precheck name beyond the intent: the finding and the disposition. */
export function dispositionFields(d: DispositionRequest | undefined): { findingId: number; disposition: FindingDisposition } | Record<string, never> {
  return d ? { findingId: d.findingId, disposition: d.disposition } : {};
}

/* ── The act (run by SubmissionCenter, after the signature) ──────────────── */

function confirmed(data: unknown, d: DispositionRequest): boolean {
  const r = data as { findingId?: unknown; disposition?: unknown } | null;
  return Boolean(r) && r?.findingId === d.findingId && r?.disposition === d.disposition;
}

/**
 * POST …/findings/:findingId/disposition with the signature and the
 * disposition. Resolves with the confirmed sentence; throws with the server's
 * words on a refusal, and with "could not be confirmed" when no definite answer
 * came back (a dropped connection, a 5xx, a 200 that does not name this finding
 * closed this way) — never a success the server did not state.
 */
export async function submitFindingDisposition(
  seq: { id: number },
  signatureActionId: string,
  d: DispositionRequest,
): Promise<string> {
  const r = await mutateVerbatim<unknown>(
    'POST',
    `/api/submissions/sequences/${seq.id}/shadow-review/findings/${d.findingId}/disposition`,
    { signatureActionId, disposition: d.disposition },
  );
  if (confirmed(r.data, d)) return `Critical finding #${d.findingId} closed as ${HOW[d.disposition]}`;
  if (r.unconfirmed || !r.error) {
    const said = typeof r.status === 'number' && r.error ? ` — ${clause(r.error)}` : '';
    throw new Error(
      `Whether finding #${d.findingId} was closed could not be confirmed${said}. Check the Shadow review tab before signing again.`,
    );
  }
  throw new Error(`Finding #${d.findingId} was not closed — ${clause(r.error)}. Nothing was recorded on that signature.`);
}

/* ── The findings list (Shadow review tab) ────────────────────────────────── */

const isDisposition = (v: unknown): v is FindingDisposition => v === 'accepted' || v === 'fixed';

/** Does this critical block dispatch? The server says (`standsOpen`); an older
 *  server that does not say is read by its status. */
function standsOpen(f: ShadowFindingRow): boolean {
  return f.severity === 'critical' && (typeof f.standsOpen === 'boolean' ? f.standsOpen : f.status === 'open');
}

/** What the server offers on this finding: only on a critical that blocks, only what it named. */
function offeredOn(f: ShadowFindingRow): FindingDisposition[] {
  if (!standsOpen(f) || !Array.isArray(f.dispositionsOffered)) return [];
  return f.dispositionsOffered.filter(isDisposition);
}

function when(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleString();
}

/** "Risk accepted by Dana Reyes on <time> under signature act_1 (approval). Reason: …" */
function dispositionSentence(d: FindingDispositionView & { disposition: FindingDisposition }): string {
  const who = d.disposedByName || (d.disposedBy != null ? `user #${d.disposedBy}` : 'a signer the record does not name');
  const at = when(d.disposedAt);
  const sig = d.signatureActionId ? ` under signature ${d.signatureActionId}` : '';
  const meaning = d.meaning ? ` (${d.meaning})` : '';
  const reason = d.reason ? ` Reason: ${d.reason}` : ' No reason was recorded.';
  return `${d.disposition === 'accepted' ? 'Risk accepted' : 'Marked fixed'} by ${who}${at ? ` on ${at}` : ''}${sig}${meaning}.${reason}`;
}

/** A closed critical in words: who closed it, how, when, why, under which signature. */
export function FindingDispositionNote({ finding }: { finding: ShadowFindingRow }) {
  const d = finding.disposition;
  if (!d || !isDisposition(d.disposition)) return null;
  return (
    <span className="sp-row-s" data-finding-disposition={d.disposition}>
      {dispositionSentence({ ...d, disposition: d.disposition })}
      {d.signatureState === 'revoked' && <> The signature it was closed under has since been revoked, so it blocks dispatch again.</>}
      {d.signatureState === 'not-found' && <> No signature record was found for this disposition, so it blocks dispatch again.</>}
    </span>
  );
}

/** The controls on one open critical: each a request for the parent's governed chain. */
function FindingDispositionControls({
  finding,
  onDisposition,
}: {
  finding: ShadowFindingRow;
  onDisposition: (d: DispositionRequest) => void;
}) {
  const offered = offeredOn(finding);
  if (offered.length === 0) return null;
  const ask = (disposition: FindingDisposition) =>
    onDisposition({
      findingId: finding.id,
      disposition,
      title: finding.title,
      runId: finding.runId,
      laterCompletedRunId: finding.laterCompletedRunId ?? null,
    });
  return (
    <span className="cm-pushbar sc-mt">
      {offered.includes('accepted') && (
        <button type="button" className="sc-trans-b" onClick={() => ask('accepted')}>
          {I.penLine} Accept risk (Part 11 e-signature)
        </button>
      )}
      {offered.includes('fixed') && (
        <button type="button" className="sc-trans-b" onClick={() => ask('fixed')}>
          {I.penLine} Mark fixed (Part 11 e-signature)
        </button>
      )}
      {!offered.includes('fixed') && (
        <span className="sp-row-s">
          Mark fixed is offered once a Shadow Review completes on this sequence after run #{finding.runId}.
        </span>
      )}
    </span>
  );
}

/** Whether this user may sign the sequence's decisions: the sign step's own answer. */
function useSignerState(seqId: number, needed: boolean): string | null {
  const path = needed ? `/api/submissions/sequences/${seqId}/dispatch-readiness` : null;
  const live = useLiveData<{ signer?: { state?: string } }>(path, [path], hasKeys<{ signer?: { state?: string } }>('signer'));
  return typeof live.data?.signer?.state === 'string' ? live.data.signer.state : null;
}

/**
 * The selected run's findings: each row as it was, plus, on a closed critical,
 * who closed it and why, and on an open critical the server offers a
 * disposition for, the controls — only to someone who may sign. The click
 * requests the parent's governed chain; nothing here signs or closes.
 */
export function ShadowFindingList({
  seq,
  rows,
  onDisposition,
}: {
  seq: { id: number };
  rows: ShadowFindingRow[];
  onDisposition?: (d: DispositionRequest) => void;
}) {
  const offering = Boolean(onDisposition) && rows.some((f) => offeredOn(f).length > 0);
  const signer = useSignerState(seq.id, offering);
  // Unknown is not permission: the controls wait for the server's answer.
  const canSign = signer !== null && signer !== 'author' && signer !== 'unresolved';
  return (
    <>
      {offering && signer === 'author' && (
        <div className="sc-verdict tone-warn sc-mb" role="status">
          You created this sequence, so you cannot close its critical findings. Separation of duties: another person with
          signing authority accepts the risk or marks a finding fixed.
        </div>
      )}
      <div className="sp-list">
        {rows.map((f) => (
          <div key={f.id} className="sp-row">
            <Chip map={SC_FIND_SEV} k={f.severity} />
            <span className="sp-row-b">
              <span className="sp-row-t">
                {f.title}
                {f.leafRef ? (
                  <>
                    {' '}
                    {I.dot} <span className="sc-mono">{f.leafRef}</span>
                  </>
                ) : null}
              </span>
              {f.detail ? <span className="sp-row-s">{f.detail}</span> : null}
              {f.basis ? <span className="sp-row-s">Basis: {f.basis}</span> : null}
              {f.recommendation ? <span className="sp-row-s">Fix: {f.recommendation}</span> : null}
              <FindingDispositionNote finding={f} />
              {onDisposition && canSign && <FindingDispositionControls finding={f} onDisposition={onDisposition} />}
            </span>
            <span className="sc-cap sp-q-s">{f.dimension}</span>
            {/* A closure that no longer stands is not shown as closed. */}
            <Chip map={SC_FIND_STATUS} k={f.status !== 'open' && standsOpen(f) ? 'open' : f.status} />
          </div>
        ))}
      </div>
    </>
  );
}
