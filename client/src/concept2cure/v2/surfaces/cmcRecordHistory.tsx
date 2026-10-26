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
  /** Where this act's reason is, when this store does not hold it. */
  reasonElsewhere?: string | null;
}

/**
 * Which store answered, as the server names it. The two attest differently and
 * a row's `sealed: false` means something different in each — "predates the
 * sealed ledger" in the chain, "not a chain position at all" in a revision log
 * — so the panel reads this rather than marking every unsealed row the same
 * way and telling the reader something untrue about half of them.
 */
type RecordHistoryStore = 'audit_chain' | 'specification_revision_log';

interface RecordHistoryPayload {
  register: string;
  recordId: string;
  store?: RecordHistoryStore;
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

/**
 * What a row that carries no chain position means, in the terms of the store it
 * came from. Said per store because one sentence cannot be true of both: in the
 * chain, no position means the row predates the sealed ledger; in the
 * specification's revision log, no row has one and saying "unsealed" would
 * assert something about a date that is not what is being read.
 */
const UNCHAINED: Record<RecordHistoryStore, { label: string; title: string }> = {
  audit_chain: {
    label: 'unsealed',
    title:
      'This row carries no chain position, so it predates the sealed ledger. It is shown because it is part ' +
      'of what happened to the record.',
  },
  specification_revision_log: {
    label: 'revision log',
    title:
      'Recorded in this specification’s own revision log, which holds each change with both values. It is not ' +
      'a position on the tenant’s hash chain; the signature that approved a version is, and is shown on the ' +
      'governed-actions record.',
  },
};

function HistoryRows({ entries, store }: { entries: RecordHistoryEntry[]; store: RecordHistoryStore }) {
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
                  title={UNCHAINED[store].title}
                >
                  {UNCHAINED[store].label}
                </span>
              )}
            </td>
            <td><Actor entry={entry} /></td>
            <td><Changed entry={entry} /></td>
            <td style={{ color: 'var(--text-300)', fontSize: 11.5 }}>
              {/* A dash beside "Specification approved" reads as an approval
                  given with no reason. Where the reason is recorded elsewhere,
                  say so; a dash is only for an act that captured none. */}
              {entry.reason ?? (entry.reasonElsewhere ? <em>{entry.reasonElsewhere}</em> : '—')}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Why no change is on screen — loading, a failed read, or nothing recorded.
 *
 * The three are kept apart deliberately and asserted separately
 * (`__tests__/cmcRecordHistory.test.tsx`): an empty §11.10(e) trail and a trail
 * that could not be READ are indistinguishable to an inspector, and only one of
 * them is a claim this panel may make. Extracted from the panel when the second
 * store's wording took it past the complexity cap; the branches are unchanged.
 */
function HistoryNotShown({ loading, error, status, store, note }: {
  loading: boolean;
  error: unknown;
  status: number | null | undefined;
  store: RecordHistoryStore;
  note: string | null;
}) {
  if (loading) {
    return <EmptyState icon={I.history} title="Reading this record's change history…" busy testId="cmc-history-loading" />;
  }
  if (error) {
    const unreachable = status === 503;
    return (
      <EmptyState
        tone="error"
        icon={I.alertTriangle}
        title={
          unreachable
            ? 'The audit store could not be reached, so this record’s change history was not read.'
            : 'This record’s change history could not be read.'
        }
        hint={
          unreachable
            ? 'Nothing is being claimed about what changed. Try again, and report it if it persists.'
            : `The server answered ${status ?? 'no status'}. Nothing is being claimed about what changed.`
        }
        testId="cmc-history-error"
      />
    );
  }
  return (
    <EmptyState
      icon={I.history}
      title={
        store === 'audit_chain'
          ? 'No chained act is recorded against this record.'
          : 'No change is recorded against this specification.'
      }
      /* The server's own note, which says WHY a record may carry none. */
      hint={note ?? undefined}
      testId="cmc-history-empty"
    />
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
 * Where one record's history is read from.
 *
 * Sixteen registers are served by one namespace over the tenant's hash chain.
 * The specification register is not: it has its own revision log, and the route
 * that reads it has existed since the register was written
 * (`server/api/cmc/specificationRoutes.ts`). That route now answers the same
 * envelope as the chain route, so this panel reads both and the product has one
 * history UI rather than a second one for the register an inspector asks about
 * first.
 */
function historyPathFor(registerPath: string, recordId: string | number): string {
  const id = encodeURIComponent(String(recordId));
  return registerPath === 'specifications'
    ? `/api/cmc/specifications/${id}/history`
    : `/api/cmc/register-history/${registerPath}/${id}`;
}

/**
 * The record's chained history, read live. Nothing here is cached and nothing
 * is seeded: an empty table means the server returned no act for this record,
 * and it says so in the server's own words.
 */
export function RecordHistoryPanel({ registerPath, recordId, subject, onClose }: RecordHistoryPanelProps) {
  const path = historyPathFor(registerPath, recordId);
  const { data, loading, error, status } = useLiveData<RecordHistoryPayload>(path, [path], isHistoryPayload);
  const entries = data?.entries ?? [];
  /* The server names its own store. An older deployment that does not is read
     as the chain, which is what every register but one is. */
  const store: RecordHistoryStore = data?.store ?? 'audit_chain';
  /* "chained act" is the chain's word and would be a false claim about a
     revision-log row, which is not chained. */
  const noun = store === 'audit_chain' ? 'chained act' : 'recorded change';

  return (
    <div className="pj-card" style={{ marginTop: 12 }} data-testid="cmc-record-history">
      <div className="pj-card-h">
        <span className="t">Change history — {subject}</span>
        <span className="s">
          {loading ? 'reading the record…' : error ? 'not read' : `${entries.length} ${noun}(s)`}
        </span>
        <button className="nda-open" onClick={onClose}>
          {I.close} Close
        </button>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {loading || error || entries.length === 0 ? (
          <div style={{ padding: 12 }}>
            <HistoryNotShown loading={loading} error={error} status={status} store={store} note={data?.note ?? null} />
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
            <HistoryRows entries={entries} store={store} />
          </>
        )}
      </div>
    </div>
  );
}
