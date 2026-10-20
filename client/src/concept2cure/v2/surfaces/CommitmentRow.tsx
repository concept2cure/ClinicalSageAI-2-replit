/**
 * Meetings & commitments: one commitment's row, and the shapes the two doors
 * return (rows D2 and D5, 2026-10-19). The fulfil dialog it opens is
 * CommitmentFulfilment.tsx.
 *
 * A fulfilled row says what met it, who recorded or signed it, and the
 * server's verdict on the signature (FulfilmentView.state, decided in
 * server/services/ha-interactions/ha-logic.ts): this file narrates it and
 * decides nothing. Evidence in a project the reader cannot open is said to be
 * there and not named; the server sends nothing else about it.
 */
import React from 'react';
import { GovernedTimestamp } from '../../_shared/components/GovernedTimestamp';
import type { ShapeGuard } from '../dataConnect';
import { I } from '../icons';
import { stashNavParamsForTarget } from '../navParams';
import { setVaultTarget } from '../vaultTarget';
import { pinnedSha256, shortSha256 } from './VaultLibraryResults';

/* ── The rows the two doors return (commitment-fulfilment.ts CommitmentListRow) ── */

export interface FulfilmentRuleView {
  signatureRequired: boolean;
  evidenceRequired: boolean;
  dateRequired: boolean;
}
export type FulfilmentState =
  | 'not-fulfilled' | 'legacy' | 'recorded' | 'signed' | 'signature-mismatch' | 'signature-withdrawn' | 'signature-missing';
export type SequenceView =
  | { readable: false }
  | {
      readable: true; id: number; sequenceNumber: string; region: string | null; dispatchStatus: string | null;
      filed: boolean; removed: boolean; submissionId: number | null; submissionTitle: string | null;
      applicationType: string | null; programId: string | null;
    };
export type VaultVersionView =
  | { readable: false }
  | {
      readable: true; id: string; title: string | null; version: string | null; programId: string;
      sha256: string | null; superseded: boolean; removed: boolean; dataWithdrawn: boolean;
    };
export interface FulfilmentView {
  rule: FulfilmentRuleView;
  state: FulfilmentState;
  recordedBy: { id: number; name: string | null } | null;
  recordedAt: string | null;
  sequence: SequenceView | null;
  vaultVersion: VaultVersionView | null;
  signature: { signatureId: number; signerName: string; signedAt: string; meaning: string | null; bindsRecord: boolean } | null;
}

/**
 * GET /api/ha-interactions/commitments and GET
 * /api/concept2cure/projects/:pid/commitments return { commitments, summary }.
 * effectiveStatus and fulfilment are derived server-side; the rest are
 * snake_case + nullable.
 */
export interface CommitmentRow {
  id: number;
  commitment_type: string;
  description: string;
  regulatory_basis: string | null;
  /** yyyy-mm-dd, as the register stores it. */
  due_date: string | null;
  status: string;
  fulfilled_date: string | null;
  /** open | in_progress | submitted | overdue (past due, not met) | fulfilled | waived | released. */
  effectiveStatus: string;
  /** Set when the commitment was made in an answer to an agency letter (2026-10-18). */
  project_id?: number | null;
  source_communication_event_id?: string | null;
  source_question_id?: number | null;
  /** The letter and question it came from, read by the server (project door only). */
  source_communication_type?: string | null;
  source_question_ref?: string | null;
  fulfilment: FulfilmentView;
}
export interface CommitmentsPayload {
  commitments: CommitmentRow[];
}

function isCommitmentRow(v: unknown): v is CommitmentRow {
  if (!v || typeof v !== 'object') return false;
  const r = v as CommitmentRow;
  const f = r.fulfilment as FulfilmentView | undefined;
  return typeof r.id === 'number' && typeof r.commitment_type === 'string' && typeof r.description === 'string' &&
    typeof r.status === 'string' && typeof r.effectiveStatus === 'string' &&
    !!f && typeof f === 'object' && typeof f.state === 'string' && !!f.rule && typeof f.rule.signatureRequired === 'boolean';
}
/** A read that is not this shape is an error on the tab, never a shorter list. */
export const isCommitmentsPayload: ShapeGuard<CommitmentsPayload> = (v): v is CommitmentsPayload =>
  !!v && typeof v === 'object' && Array.isArray((v as CommitmentsPayload).commitments) &&
  (v as CommitmentsPayload).commitments.every(isCommitmentRow);

/** A commitment's chip tone. Overdue is the one warning sign; an open commitment is not an error. */
export function commitmentTone(effectiveStatus: string): 'ok' | 'err' | 'idle' {
  if (effectiveStatus === 'overdue') return 'err';
  if (effectiveStatus === 'fulfilled' || effectiveStatus === 'waived' || effectiveStatus === 'released') return 'ok';
  return 'idle';
}

export const COMMITMENT_TERMINAL = new Set(['fulfilled', 'waived', 'released']);

const TYPE_NAMES: Record<string, string> = { pmr: 'PMR', pmc: 'PMC', rems: 'REMS', meeting_commitment: 'Meeting commitment', other: 'Commitment' };
/** A commitment type as the screen names it: the row's tag, the fulfil dialog and the question to AnA say the same. */
export const typeName = (t: string) => TYPE_NAMES[t] ?? (t ? t.replace(/_/g, ' ') : 'Commitment');
/** The same name inside a sentence: an acronym stays as it is, a word is lower case. */
const typeInSentence = (t: string) => {
  const n = typeName(t);
  return /^[A-Z]+$/.test(n) ? n : n.toLowerCase();
};

/** How the agency holds a sequence, in words. */
export function dispatchWords(status: string | null | undefined): string {
  if (status === 'sent') return 'sent to the agency';
  if (status === 'acknowledged') return 'acknowledged by the agency';
  if (status === 'rejected') return 'rejected by the agency';
  return 'not on file at the agency';
}

/* ── A row ───────────────────────────────────────────────────────────────── */

function legacyLine(f: FulfilmentView): React.ReactNode {
  return (
    <div key="legacy" className="cc-fulfil-line">
      {f.rule.signatureRequired
        ? 'Recorded as fulfilled before fulfilments were signed. No sequence or document was named.'
        : 'Recorded as fulfilled before fulfilments named what met them.'}
    </div>
  );
}

function sequenceLines(s: SequenceView, onNav: (id: string) => void): React.ReactNode[] {
  if (!s.readable) return [<div key="seq" className="cc-fulfil-line">Met by a sequence in a project you cannot open.</div>];
  const open = () => {
    stashNavParamsForTarget('submission-center', { submissionId: String(s.submissionId), sequenceId: String(s.id), ws: 'dispatch' });
    onNav('submission-center');
  };
  const lines = [
    <div key="seq" className="cc-fulfil-line">
      Met by sequence {s.sequenceNumber}
      {s.submissionTitle ? ` of ${s.submissionTitle}` : ''}, {dispatchWords(s.dispatchStatus)}.
      {s.removed ? ' It has since been removed from Submission Center.' : ''}
      {s.submissionId != null && (
        <button type="button" className="cc-fulfil-link" onClick={open}>
          Open in Submission Center
        </button>
      )}
    </div>,
  ];
  if (s.dispatchStatus === 'rejected') {
    lines.push(<div key="rej" className="cc-fulfil-line" data-tone="err">The agency has since rejected sequence {s.sequenceNumber}.</div>);
  }
  return lines;
}

/** What has happened to the version since: the first that applies. */
function versionNote(v: Extract<VaultVersionView, { readable: true }>): string {
  if (v.removed) return ' (removed from the Vault)';
  if (v.dataWithdrawn) return ' (its data was withdrawn)';
  return v.superseded ? ' (a later version exists)' : '';
}

function vaultLine(v: VaultVersionView, onNav: (id: string) => void): React.ReactNode {
  if (!v.readable) return <div key="vault" className="cc-fulfil-line">Met by a Vault document in a project you cannot open.</div>;
  const open = () => {
    setVaultTarget({ documentId: v.id, programId: v.programId });
    onNav('vault');
  };
  const pinned = pinnedSha256(v.sha256);
  return (
    <div key="vault" className="cc-fulfil-line">
      Met by {v.title ?? 'a Vault document'} v{v.version ?? '?'}{versionNote(v)},{' '}
      {pinned ? <span title={`sha256 ${pinned}`}>pinned at sha256 {shortSha256(pinned)}</span> : 'with no sha256 pinned'}.
      {!v.removed && (
        <button type="button" className="cc-fulfil-link" onClick={open}>
          Open in Vault
        </button>
      )}
    </div>
  );
}

/** The server's verdict on the signature, when it is not simply signed. */
const VERDICT_SENTENCES: Partial<Record<FulfilmentState, string>> = {
  'signature-mismatch': 'The signature on this fulfilment does not match the record as it stands.',
  'signature-withdrawn': 'The signature on this fulfilment has been withdrawn.',
  'signature-missing': 'This fulfilment names what met it, but no signature records it.',
};

function attributionLine(f: FulfilmentView): React.ReactNode {
  if (f.signature) {
    return (
      <div key="sig" className="cc-fulfil-line">
        Signed by {f.signature.signerName} on <GovernedTimestamp value={f.signature.signedAt} layout="inline" />
        {f.signature.meaning ? ` (${f.signature.meaning})` : ''}, signature {f.signature.signatureId}.
      </div>
    );
  }
  if (f.state === 'recorded' && f.recordedBy) {
    return (
      <div key="rec" className="cc-fulfil-line">
        Recorded by {f.recordedBy.name ?? 'a former member'} on <GovernedTimestamp value={f.recordedAt} layout="inline" />.
      </div>
    );
  }
  return null;
}

/** What met a fulfilled commitment, who recorded or signed it, and whether the signature still holds. */
function FulfilmentLines({ f, onNav }: { f: FulfilmentView; onNav: (id: string) => void }) {
  const verdict = VERDICT_SENTENCES[f.state];
  const nothingNamed = f.state !== 'legacy' && !f.sequence && !f.vaultVersion;
  return (
    <div className="cc-fulfil">
      {f.state === 'legacy' && legacyLine(f)}
      {f.sequence && sequenceLines(f.sequence, onNav)}
      {f.vaultVersion && vaultLine(f.vaultVersion, onNav)}
      {nothingNamed && <div className="cc-fulfil-line">No sequence or document was named.</div>}
      {attributionLine(f)}
      {verdict && <div className="cc-fulfil-line" data-tone="err">{verdict}</div>}
    </div>
  );
}

/** One commitment on the Meetings & commitments tab. */
export function CommitmentRowView({
  c, onFulfil, onNav, onAsk,
}: {
  c: CommitmentRow;
  onFulfil: () => void;
  onNav: (id: string) => void;
  onAsk: (q: string) => void;
}) {
  const status = c.effectiveStatus || c.status;
  return (
    <div className="cc-row">
      <span className="cc-row-tag" data-kind={c.commitment_type}>
        {c.commitment_type ? typeName(c.commitment_type) : '—'}
      </span>
      <div className="cc-row-b">
        <div className="cc-row-t">{c.description}</div>
        <div className="cc-row-s mono">
          {[
            c.regulatory_basis,
            c.due_date ? 'due ' + c.due_date : null,
            c.fulfilled_date ? 'fulfilled ' + c.fulfilled_date : null,
            c.source_question_id != null
              ? `made in the answer to ${c.source_question_ref ?? 'a question'}${c.source_communication_type ? ` of ${c.source_communication_type}` : ''}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </div>
        {c.status === 'fulfilled' && <FulfilmentLines f={c.fulfilment} onNav={onNav} />}
      </div>
      {/* Overdue was the only state shown as an error before 2026-10-18 in
          name only: the chip read 'on_track' and 'due_soon', which the
          register never returns, so every open commitment was painted as an
          error. */}
      <span className={'rd-chip tone-' + commitmentTone(status)}>{(status || 'unknown').replace(/_/g, ' ')}</span>
      {!COMMITMENT_TERMINAL.has(status) && (
        <button className="cc-btn sm" onClick={onFulfil}>
          Record fulfilment
        </button>
      )}
      <button
        className="cc-btn sm"
        aria-label="Ask AnA about this commitment"
        onClick={() => onAsk(`What is needed to fulfill this ${c.commitment_type ? typeInSentence(c.commitment_type) : 'commitment'} on time?`)}
      >
        {I.sparkles}
      </button>
    </div>
  );
}
