/**
 * What happened to one CMC register record — the reading half of §11.10(e).
 *
 * "Record changes shall not obscure previously recorded information" is a
 * requirement about retrieval, not only storage. Every register create and
 * every register edit has been on the tenant's hash-chained ledger with both
 * values since 2026-10-18 (URS-CMC-021, URS-CMC-025), and until this panel
 * there was nowhere in the product to read it against the record it was about:
 * the tenant audit trail shows the act and the actor with no changed fields,
 * and the per-entity Part 11 route is deliberately disconnected.
 *
 * Honest states, in all four cases:
 *   • the read failed            → the failure, never an empty history;
 *   • the audit store is absent  → said as that, not as "no changes";
 *   • nothing is recorded        → the server's own note, which says why a
 *                                  record written before 2026-10-18 has none;
 *   • an act with no actor       → "not recorded", not a guessed name.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';

/** One act against the record, as `GET /api/cmc/<register>/:id/history` returns it. */
export interface RecordHistoryEntry {
  at: string;
  act: string;
  label: string;
  actorId: number | null;
  actor: string | null;
  actorRef: string | null;
  reason: string | null;
  changed: Record<string, { from: unknown; to: unknown }>;
  changedFields: string[];
  signatureRef: string | null;
  signatureMeaning: string | null;
  seq: number | null;
  sealed: boolean;
}

interface RecordHistoryPayload {
  register: string;
  recordId: string;
  entries: RecordHistoryEntry[];
  /** True when the record has more acts than one read returns — the missing
   *  ones are the oldest, which may include the create. */
  earlierActsNotShown?: boolean;
  note: string | null;
}

/** A 200 that is not this shape is a mismatch, not an empty history. */
function isHistoryPayload(value: unknown): value is RecordHistoryPayload {
  const v = value as RecordHistoryPayload | null;
  return Boolean(v && typeof v === 'object' && Array.isArray(v.entries));
}

/** A recorded value as a reader sees it, without inventing one it did not have. */
function shownValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '(unreadable)';
  }
}

const CLIP = 80;
/** Long values are clipped on screen and carried whole in the title attribute. */
function clipped(text: string): string {
  return text.length > CLIP ? `${text.slice(0, CLIP)}…` : text;
}

function Changed({ entry }: { entry: RecordHistoryEntry }) {
  if (entry.changedFields.length === 0) {
    return <span style={{ color: 'var(--text-400)' }}>—</span>;
  }
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      {entry.changedFields.map((field) => {
        const move = entry.changed[field];
        const from = shownValue(move?.from);
        const to = shownValue(move?.to);
        return (
          <div key={field} style={{ fontSize: 11.5 }}>
            <span style={{ fontWeight: 600 }}>{field}</span>
            <span style={{ color: 'var(--text-400)' }}> was </span>
            <span className="mono" title={from}>{clipped(from)}</span>
            <span style={{ color: 'var(--text-400)' }}> → </span>
            <span className="mono" title={to}>{clipped(to)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The person, and the account — a display name does not say which account acted. */
function Actor({ entry }: { entry: RecordHistoryEntry }) {
  if (!entry.actor && !entry.actorRef) {
    return <span style={{ color: 'var(--text-400)' }}>not recorded</span>;
  }
  return (
    <>
      {entry.actor ?? 'unnamed account'}
      {entry.actorRef && (
        <span className="mono" style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--text-400)' }}>
          {entry.actorRef}
        </span>
      )}
    </>
  );
}

function HistoryRows({ entries }: { entries: RecordHistoryEntry[] }) {
  return (
    <table className="reg-tbl">
      <thead>
        <tr>
          <th>When</th>
          <th>Act</th>
          <th>Who</th>
          <th>What changed</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <tr key={`${entry.at}-${entry.seq ?? i}`}>
            <td className="mono" style={{ whiteSpace: 'nowrap' }}>
              {entry.at.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}
            </td>
            <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
              {entry.label}
              {entry.signatureRef && (
                <span title={`Signed — ${entry.signatureMeaning ?? 'meaning not recorded'} (${entry.signatureRef})`}>
                  {' '}
                  {I.shieldCheck}
                </span>
              )}
              {!entry.sealed && (
                <span
                  style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--warning)' }}
                  title="This row carries no chain position, so it predates the sealed ledger. It is shown because it is part of what happened to the record."
                >
                  unsealed
                </span>
              )}
            </td>
            <td><Actor entry={entry} /></td>
            <td><Changed entry={entry} /></td>
            <td style={{ color: 'var(--text-300)', fontSize: 11.5 }}>{entry.reason ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface RecordHistoryPanelProps {
  /** The register's own path segment, e.g. `analytical-methods`. */
  registerPath: string;
  recordId: string | number;
  /** What the record is called, for the panel's heading. */
  subject: string;
  onClose: () => void;
}

/**
 * The record's chained history, read live. Nothing here is cached and nothing
 * is seeded: an empty table means the server returned no act for this record,
 * and it says so in the server's own words.
 */
export function RecordHistoryPanel({ registerPath, recordId, subject, onClose }: RecordHistoryPanelProps) {
  const path = `/api/cmc/register-history/${registerPath}/${encodeURIComponent(String(recordId))}`;
  const { data, loading, error, status } = useLiveData<RecordHistoryPayload>(path, [path], isHistoryPayload);
  const entries = data?.entries ?? [];

  return (
    <div className="pj-card" style={{ marginTop: 12 }} data-testid="cmc-record-history">
      <div className="pj-card-h">
        <span className="t">Change history — {subject}</span>
        <span className="s">
          {loading ? 'reading the ledger…' : error ? 'not read' : `${entries.length} chained act(s)`}
        </span>
        <button className="nda-open" onClick={onClose}>
          {I.close} Close
        </button>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 12 }}>
            <EmptyState icon={I.history} title="Reading this record's change history…" busy testId="cmc-history-loading" />
          </div>
        ) : error ? (
          <div style={{ padding: 12 }}>
            {/* A failed read is never rendered as a record with no changes: an
                empty §11.10(e) trail and a trail that could not be read are
                indistinguishable to a reader, and only one of them is true. */}
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title={
                status === 503
                  ? 'The audit store could not be reached, so this record’s change history was not read.'
                  : 'This record’s change history could not be read.'
              }
              hint={
                status === 503
                  ? 'Nothing is being claimed about what changed. Try again, and report it if it persists.'
                  : `The server answered ${status ?? 'no status'}. Nothing is being claimed about what changed.`
              }
              testId="cmc-history-error"
            />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ padding: 12 }}>
            <EmptyState
              icon={I.history}
              title="No chained act is recorded against this record."
              hint={data?.note ?? undefined}
              testId="cmc-history-empty"
            />
          </div>
        ) : (
          <>
            {data?.earlierActsNotShown && (
              /* Never a silent cap: what is cut is the record's beginning, and
                 a history quietly missing its create reads as a record that was
                 never recorded. */
              <div role="status" style={{ padding: '8px 12px', color: 'var(--warning)', fontSize: 11.5 }}>
                This record has more acts than one read returns. The {entries.length} most recent are shown;
                earlier ones, which may include when it was first recorded, are not.
              </div>
            )}
            <HistoryRows entries={entries} />
          </>
        )}
      </div>
    </div>
  );
}
