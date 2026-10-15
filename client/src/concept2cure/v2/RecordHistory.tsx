/**
 * A record's own audit trail, as the one ledger states it: every chained row
 * recorded against it, newest first, who acted, when, why, and the server's
 * verdict on the tenant chain (21 CFR 11.10(e), "available for review").
 *
 * Moved unchanged from Vault.tsx's DocumentHistory (VR-01) on 2026-10-15, when
 * the Submission Center's Builder needed the same view of a sequence's history
 * (filing-spine design review, open item 3). One renderer, two reads:
 *   - a Vault document: GET /api/c2c/project-vault/:id/documents/:doc/history
 *   - a sequence: GET /api/submissions/sequences/:seqId/history
 * Nothing here is derived on the client. A failed read is shown as a failure:
 * "no history" would tell an inspector the record was never touched.
 */
import React from 'react';
import { I } from './icons';
import { useLiveData, type ShapeGuard } from './dataConnect';

export interface HistoryEntry {
  id: string;
  event: string;
  /** The version the event was recorded against, across a document's versions (VR-09). */
  version?: string | null;
  /** The section a placement was recorded against (a sequence's history). */
  section?: string | null;
  actor: string;
  at: string;
  when: string;
  hash: string;
  seq: number | null;
  /** The reason recorded with the change, when the writer recorded one (21 CFR 11.10(e)). */
  reason?: string | null;
}
export interface HistoryShape {
  entries: HistoryEntry[];
  /**
   * The server's verdict (audit-trail-ledger.routes.ts AuditLedgerChainVerdict):
   * `ok: null` with a reason when there was nothing to verify; a break names
   * this organization's own row by id, or only says it is another's.
   */
  chain: { ok: boolean | null; rowsChecked: number; legacyRows: number; reason?: string; brokenAt?: { id?: string; row?: string } };
  /** The server cut the history to its newest entries; older ones exist. */
  truncated?: boolean;
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return ['id', 'event', 'actor', 'at', 'hash'].every(key => typeof entry[key] === 'string') &&
    [entry.when, entry.version, entry.section, entry.reason].every(field => field == null || typeof field === 'string');
}

/** A body without an entries list and a chain verdict is a failed read, not an empty history. */
export const isHistoryShape: ShapeGuard<HistoryShape> = (v): v is HistoryShape =>
  !!v && typeof v === 'object' && Array.isArray((v as HistoryShape).entries) &&
  (v as HistoryShape).entries.every(isHistoryEntry) &&
  !!(v as HistoryShape).chain && typeof (v as HistoryShape).chain === 'object';

/** Where the chain breaks, as this organization may be told it. */
function breakPlace(b: HistoryShape['chain']['brokenAt']): string {
  if (typeof b?.id === 'string') return ` at entry ${b.id}`;
  return b?.row ? ` at an entry of ${b.row}` : '';
}

export function ChainVerdict({ chain }: { chain: HistoryShape['chain'] }) {
  if (chain.ok === true) {
    return (
      <div className="vd-d-idx">
        <span className="vd-idx-dot" aria-hidden="true" /> Audit chain verified — {chain.rowsChecked} rows checked
        {chain.legacyRows ? `, ${chain.legacyRows} recorded before sequencing` : ''}.
      </div>
    );
  }
  if (chain.ok !== false) {
    return (
      <div className="vd-d-idx">
        Audit chain not verified: {chain.reason ?? 'the server gave no verdict on this read'}
      </div>
    );
  }
  return (
    <div className="vd-dr-err" role="alert">
      {I.alertTriangle} Audit chain check failed{breakPlace(chain.brokenAt)}. The entries below
      are what is recorded; the chain that should prove them has a break.
    </div>
  );
}

/** What an entry was recorded against, before its event: "v2.0 · ", "Section 2.5 · ". */
function entryLead(e: HistoryEntry): string {
  if (e.version) return `v${e.version} · `;
  return e.section ? `Section ${e.section} · ` : '';
}

export function RecordHistory({ path, subject, testId, reasonTestId }: {
  path: string;
  /** Whose history, as the sentences name it: "document", "sequence". */
  subject: string;
  testId: string;
  reasonTestId: string;
}) {
  const st = useLiveData<HistoryShape>(path, [path], isHistoryShape);
  let body: React.ReactNode;
  if (st.loading) body = <div className="vd-d-idx">Loading history…</div>;
  else if (st.error || !st.data) {
    /* 2026-09-28 (M-0928-3): was role="status" — a failed read announced
       politely, unlike the ChainVerdict and Data room failures beside it. */
    body = (
      <div className="vd-dr-err" role="alert">
        {I.alertTriangle} This {subject}'s history could not be read. Nothing is shown rather than an
        incomplete history.
      </div>
    );
  } else if (st.data.entries.length === 0) {
    body = <div className="vd-d-idx">No history events are available to you for this {subject}.</div>;
  } else {
    body = (
      <>
        <ChainVerdict chain={st.data.chain} />
        {st.data.truncated === true ? (
          <div className="vd-d-idx" role="status">
            Only the newest {st.data.entries.length} accessible entries are shown. This is a limited history window.
          </div>
        ) : null}
        <div className="vd-vers" role="list">
          {st.data.entries.map((e) => (
            <div key={e.id} className="vd-ver" role="listitem">
              <span className="vd-ver-v">
                {entryLead(e)}
                {e.event}
              </span>
              <span className="vd-ver-m">
                {/* The full hash is read to every reader, not only on hover (accessibility review, 2026-10-15). */}
                {e.when || e.at} · {e.actor} · <span className="mono" title={e.hash} aria-hidden="true">{e.hash.slice(0, 12)}</span>
                <span className="sr-only">Hash {e.hash}</span>
                {e.reason ? <span className="vd-ver-lc" data-testid={reasonTestId}>Reason: {e.reason}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }
  return (
    <div data-testid={testId}>
      <h3 className="vd-d-seclbl">History</h3>
      {body}
    </div>
  );
}
