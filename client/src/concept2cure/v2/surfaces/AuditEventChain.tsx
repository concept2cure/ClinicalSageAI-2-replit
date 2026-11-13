/**
 * The second audit chain's live verdict, stated inside Audit trail.
 *
 * D2 fold of `part11-console` into `audit-trail` (2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-part11-console/). The placement map
 * (.design/client-journey/FUNCTION_PARITY.md, "Into the audit trail") moves the
 * Part 11 console's two functions here: the live verdict for the audit_events
 * chain, as a second verdict in Audit trail's chain banner, and AnA reading it,
 * as the audit_events verdict in Audit trail's facts. Both read the route the
 * console read, GET /api/part11/audit-trail/chain-integrity
 * (server/routes/part11-compliance.ts), which re-computes this organisation's
 * audit_events chain on the server.
 *
 * TWO CHAINS, TWO VERDICTS. The organisation's audit records live in two hash
 * chains: `audit_logs`, which every launch app writes and whose verdict is the
 * ledger's `meta.chain` (server/routes/audit-trail-ledger.routes.ts), and
 * `audit_events`, which a few services still write. The ledger's verdict does
 * not cover the second chain (its `store` says so), so each is stated on its
 * own and they are never merged into one.
 *
 * HONESTY. A verdict that could not be read is not "intact": a failed read, a
 * refusal and a body that is not a verdict each say so by name, and an error is
 * never shown as an empty chain. "Intact" needs the server's status and its
 * integrity verdict to agree; a chain with no entries has nothing to verify,
 * whatever the route says (launch sweep finding 111, 2026-09-23).
 *
 * WHAT WAS FOUND, IN THE SERVER'S SENTENCE (2026-11-12,
 * docs/evidence/D5-AUDIT-EVENT-CHAIN/2026-11-12/). The detail under each
 * verdict is the sentence the server writes beside its walk of the chain
 * (server/services/audit/audit-event-chain.ts, `describeAuditEventChain`), the
 * same one the compliance report and the nightly check print. This screen used
 * to compose its own: "N chained entries re-computed" from the total and not
 * the count that matched; every failure as a "broken link", although an altered
 * entry is not one; and, for a chain that could not be verified, "N carry no
 * record hash" whatever the cause, which read "0 of 12 entries carry no record
 * hash" when the cause was an entry that names no predecessor. The sentence
 * also says what the hash does not cover (the before and after values of a
 * change), so "intact" is not read as more than was checked. The entries that
 * did not verify are listed under their trail ids and open in the table.
 */
import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { ErrorState, useLiveData, type DataState, type ShapeGuard } from '../dataConnect';

export const AUDIT_EVENT_CHAIN_PATH = '/api/part11/audit-trail/chain-integrity';

/** The route's `data`, reduced to what is stated. */
export interface AuditEventChainIntegrity {
  chainStatus: string;
  integrityValid: boolean | null;
  totalEntries: number;
  /** Entries whose hash re-computed and matched, not entries that carry one. */
  verifiedEntries?: number;
  unhashedEntries?: number;
  /** Entries that name no predecessor although the entry before them was hashed. */
  unlinkedEntries?: number;
  brokenLinks?: number;
  pointerBreaks?: number;
  contentBreaks?: number;
  /** The first entries that did not verify (the route sends at most 20). */
  brokenLinkDetails?: { id?: unknown; kind?: unknown }[];
  lastHash?: string | null;
  hashAlgorithm?: string;
  verifiedAt?: string;
  /** `tamperEvident` is the server's sentence for what its walk found. */
  compliance?: { tamperEvident?: unknown };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** A 200 is only evidence that something came back. A verdict carries a status
 *  and a numeric count; anything else is a failed read, never an empty chain. */
export const isAuditEventChainIntegrity: ShapeGuard<AuditEventChainIntegrity> = (
  v: unknown,
): v is AuditEventChainIntegrity => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const c = v as Record<string, unknown>;
  return typeof c.chainStatus === 'string' && finite(c.totalEntries);
};

export type AuditEventChainVerdict = 'intact' | 'broken' | 'not verifiable' | 'not verified' | 'no entries';

export type AuditEventChainRead =
  | { state: 'loading' }
  | { state: 'forbidden' }
  | { state: 'error' }
  | { state: 'ready'; chain: AuditEventChainIntegrity; verdict: AuditEventChainVerdict };

/** One word for the chain. A finding of a break outranks "cannot tell"; only a
 *  status of intact WITH integrityValid true is intact. */
export function auditEventChainVerdictOf(c: AuditEventChainIntegrity): AuditEventChainVerdict {
  const s = c.chainStatus.toLowerCase();
  if (s === 'empty' || c.totalEntries === 0) return 'no entries';
  if (s === 'broken' || c.integrityValid === false) return 'broken';
  if (s === 'intact' && c.integrityValid === true) return 'intact';
  if (s === 'unverifiable') return 'not verifiable';
  return 'not verified';
}

/**
 * The server's sentence for what its walk found. Used only under a verdict the
 * sentence is about: a status this screen will not call intact ("not verified")
 * gets this screen's own words, so the title and the detail cannot disagree.
 */
export function auditEventChainStatement(c: AuditEventChainIntegrity, verdict: AuditEventChainVerdict): string | null {
  if (verdict !== 'intact' && verdict !== 'broken' && verdict !== 'not verifiable') return null;
  const s = c.compliance?.tamperEvident;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

const FAILED_WORDS: Record<string, string> = {
  content: 'does not match the hash recorded when it was written',
  pointer: 'does not follow the entry before it',
};

/**
 * The entries the server listed as failing, under the id the trail's table
 * gives an audit-event entry (`AUD-<id>`, server/routes/audit-trail-ledger.routes.ts),
 * so a person can find the entry the banner names.
 */
export function auditEventChainFailedEntries(c: AuditEventChainIntegrity): { entryId: string; what: string }[] {
  const list = Array.isArray(c.brokenLinkDetails) ? c.brokenLinkDetails : [];
  return list
    .filter((b) => b && (typeof b.id === 'number' || (typeof b.id === 'string' && b.id !== '')))
    .map((b) => ({ entryId: `AUD-${String(b.id)}`, what: FAILED_WORDS[String(b.kind)] ?? 'did not verify' }));
}

/** Why a chain could not be verified, when the server sent no sentence: only a cause it did send. */
function notVerifiableBecause(c: AuditEventChainIntegrity): string {
  const of = `of ${entries(c.totalEntries)}`;
  if (c.unhashedEntries) return `${c.unhashedEntries} ${of} ${c.unhashedEntries === 1 ? 'carries' : 'carry'} no record hash, so the chain could not be verified`;
  if (c.unlinkedEntries === 1) return `1 ${of} names no entry before it although one was recorded, so that link could not be checked`;
  if (c.unlinkedEntries) return `${c.unlinkedEntries} ${of} name no entry before them although one was recorded, so those links could not be checked`;
  return `The chain could not be verified over ${entries(c.totalEntries)}`;
}

function readOf(r: DataState<AuditEventChainIntegrity>): AuditEventChainRead {
  if (r.loading) return { state: 'loading' };
  if (r.status === 401 || r.status === 403) return { state: 'forbidden' };
  // The route always answers with a verdict; a 200 without one verified nothing.
  if (r.error || !r.data) return { state: 'error' };
  return { state: 'ready', chain: r.data, verdict: auditEventChainVerdictOf(r.data) };
}

/** The audit_events chain's read, with a way to try it again. Independent of the ledger read. */
export function useAuditEventChain(): { read: AuditEventChainRead; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const r = useLiveData<AuditEventChainIntegrity>(AUDIT_EVENT_CHAIN_PATH, [attempt], isAuditEventChainIntegrity);
  const read = useMemo(() => readOf(r), [r]);
  return { read, retry: () => setAttempt((n) => n + 1) };
}

/** What AnA is told when there is no verdict: the sentence, and the fact that names why. */
const UNREAD: Record<Exclude<AuditEventChainRead['state'], 'ready'>, [string, string]> = {
  loading: ['The separate audit-event chain is still being verified.', 'the audit-event chain is still being verified'],
  forbidden: ['This account cannot read the audit-event chain, so it is not verified here.', 'this account cannot read the audit-event chain'],
  error: [
    'The audit-event chain verification could not be read, so its integrity is UNKNOWN — not verified, and not intact.',
    'the chain-integrity read failed — integrity is unknown, not intact',
  ],
};

/* AnA narrates this, so it is told what the server found in the server's
   sentence, including what the hash does not cover; it is not left to infer
   that "intact" covers the whole entry. */
function readySentence(c: AuditEventChainIntegrity, verdict: AuditEventChainVerdict): string {
  const over = `over ${entries(c.totalEntries)}`;
  const found = auditEventChainStatement(c, verdict);
  switch (verdict) {
    case 'no entries':
      return 'The separate audit-event chain holds no entries, so there is nothing to verify.';
    case 'intact':
      return `The separate audit-event chain is verified intact ${over}.${found ? ` ${found}` : ''}`;
    case 'broken':
      return found
        ? `The separate audit-event chain is BROKEN ${over}. ${found}`
        : `The separate audit-event chain is BROKEN${c.brokenLinks != null ? ` (${c.brokenLinks} ${c.brokenLinks === 1 ? 'entry' : 'entries'} did not verify)` : ''} ${over}.`;
    case 'not verifiable':
      return `The separate audit-event chain is NOT VERIFIABLE ${over}. ${found ?? `${notVerifiableBecause(c)}.`}`;
    default:
      return `The separate audit-event chain was reported without an integrity verdict ${over}, so it is not verified.`;
  }
}

function readyFacts(c: AuditEventChainIntegrity, verdict: AuditEventChainVerdict): Record<string, unknown> {
  return {
    verdict,
    status: c.chainStatus,
    integrityValid: c.integrityValid ?? null,
    totalEntries: c.totalEntries,
    verifiedEntries: c.verifiedEntries ?? null,
    unhashedEntries: c.unhashedEntries ?? null,
    unlinkedEntries: c.unlinkedEntries ?? null,
    brokenLinks: c.brokenLinks ?? null,
    alteredEntries: c.contentBreaks ?? null,
    outOfSequenceEntries: c.pointerBreaks ?? null,
    failedEntries: auditEventChainFailedEntries(c).map((b) => b.entryId),
    found: auditEventChainStatement(c, verdict),
    algorithm: c.hashAlgorithm ?? null,
    verifiedAt: c.verifiedAt ?? null,
  };
}

/**
 * What AnA is told of this chain: one sentence for the summary and two facts.
 * Published in every state of the ledger read, because this read does not
 * depend on it. `auditEventChain` is set only from a verdict the server
 * returned; every other state names itself in `auditEventChainUnavailable`.
 */
export function auditEventChainForAna(read: AuditEventChainRead): {
  sentence: string;
  facts: { auditEventChain: Record<string, unknown> | null; auditEventChainUnavailable: string | null };
} {
  if (read.state !== 'ready') {
    const [sentence, unavailable] = UNREAD[read.state];
    return { sentence, facts: { auditEventChain: null, auditEventChainUnavailable: unavailable } };
  }
  return {
    sentence: readySentence(read.chain, read.verdict),
    facts: { auditEventChain: readyFacts(read.chain, read.verdict), auditEventChainUnavailable: null },
  };
}

/* Demo walk 5.u6 (2026-11-12): this read "… that some services write to instead of the ledger", which tells a reader
   that records bypass the audit trail. Both chains are read on this screen; the line says what this one is. */
const WHAT = 'A separate hash chain, kept per organisation and verified on its own, for the events some services record there';

function rowOf(read: Exclude<AuditEventChainRead, { state: 'error' }>) {
  const dim = 'var(--text-400)';
  if (read.state === 'loading') return { tone: dim, icon: I.lock, title: 'Verifying the audit-event chain…', detail: null, busy: true };
  if (read.state === 'forbidden') {
    return { tone: dim, icon: I.lock, title: 'The audit-event chain is not available to your role', detail: 'Your account can’t read this chain’s verification, so it is not verified here.' };
  }
  const { chain: c, verdict } = read;
  const alg = c.hashAlgorithm ?? 'Hash';
  const found = auditEventChainStatement(c, verdict);
  switch (verdict) {
    case 'no entries':
      return { tone: dim, icon: I.lock, title: 'Audit-event chain: no entries yet', detail: 'Nothing is recorded in this chain, so there is nothing to verify.' };
    case 'intact':
      return { tone: 'var(--success)', icon: I.shieldCheck, title: 'Audit-event chain intact', detail: found ?? `${c.totalEntries} chained ${c.totalEntries === 1 ? 'entry' : 'entries'} re-computed on the server — ${alg}` };
    case 'broken': {
      const k = c.brokenLinks;
      return {
        tone: 'var(--error)', icon: I.alertTriangle, title: 'Audit-event chain verification failed',
        detail: found ?? `${k != null ? `${k} broken ${k === 1 ? 'link' : 'links'}` : 'A break was found'} over ${entries(c.totalEntries)}, re-computed on the server — ${alg}`,
      };
    }
    case 'not verifiable':
      return {
        tone: 'var(--warning)', icon: I.alertTriangle, title: 'Audit-event chain not verifiable',
        detail: found ?? notVerifiableBecause(c),
      };
    default:
      return {
        tone: 'var(--warning)', icon: I.alertTriangle, title: 'Audit-event chain not verified',
        detail: `The server reported ${entries(c.totalEntries)} without an integrity verdict, so the chain is not verified here`,
      };
  }
}

const idButton: React.CSSProperties = {
  background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit',
  color: 'var(--accent-200)', textDecoration: 'underline',
};

/** The entries that did not verify, each opening in the trail's table when it is loaded there. */
function FailedEntries({ chain, isLoaded, onOpenEntry }: {
  chain: AuditEventChainIntegrity;
  isLoaded?: (entryId: string) => boolean;
  onOpenEntry?: (entryId: string) => void;
}) {
  const failed = auditEventChainFailedEntries(chain);
  if (failed.length === 0) return null;
  const total = finite(chain.brokenLinks) ? chain.brokenLinks : failed.length;
  return (
    <details style={{ margin: '8px 0 0 30px' }}>
      <summary style={{ fontSize: 11.5, color: 'var(--text-300)', cursor: 'pointer' }}>Entries that did not verify</summary>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 11.5, color: 'var(--text-300)', lineHeight: 1.7 }}>
        {failed.map((b) => (
          <li key={`${b.entryId} ${b.what}`}>
            {onOpenEntry && isLoaded?.(b.entryId) ? (
              <button type="button" className="mono" style={idButton} aria-label={`Open entry ${b.entryId}`} onClick={() => onOpenEntry(b.entryId)}>
                {b.entryId}
              </button>
            ) : (
              <span className="mono">{b.entryId}</span>
            )}{' '}
            {b.what}
          </li>
        ))}
      </ul>
      {total > failed.length && (
        <p style={{ fontSize: 11, color: 'var(--text-400)', margin: '6px 0 0' }}>
          The first {failed.length} of {total} are listed.
        </p>
      )}
    </details>
  );
}

/** The second verdict of Audit trail's chain banner. */
export function AuditEventChainBanner({ read, onRetry, isLoaded, onOpenEntry }: {
  read: AuditEventChainRead;
  onRetry: () => void;
  /** Whether an entry is among those loaded in the trail's table, and how to open it there. */
  isLoaded?: (entryId: string) => boolean;
  onOpenEntry?: (entryId: string) => void;
}) {
  if (read.state === 'error') {
    return (
      <section aria-label="Audit-event chain verdict" style={{ maxWidth: 680, marginBottom: 16 }}>
        <ErrorState
          variant="inline"
          title="Couldn’t verify the audit-event chain"
          message="The verifier returned no result on this read, so this chain’s integrity is unknown — not verified, and not intact."
          retry={onRetry}
        />
      </section>
    );
  }
  const row = rowOf(read);
  const head = read.state === 'ready' && read.chain.totalEntries > 0 && read.chain.lastHash ? String(read.chain.lastHash).slice(0, 24) : null;
  return (
    <section
      aria-label="Audit-event chain verdict"
      aria-busy={'busy' in row || undefined}
      style={{
        padding: '10px 14px', borderRadius: 8,
        background: `color-mix(in srgb,${row.tone} 10%,transparent)`, border: `1px solid ${row.tone}`,
        marginBottom: 16, maxWidth: 680,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 18 }} aria-hidden="true">{row.icon}</span>
        <div style={{ flex: 1 }} role={'busy' in row ? 'status' : undefined}>
          <div style={{ fontWeight: 600, fontSize: 13, color: row.tone }}>{row.title}</div>
          {row.detail && <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 2, lineHeight: 1.5 }}>{row.detail}</div>}
          <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>{WHAT}</div>
        </div>
        {head && <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>HEAD {head}…</span>}
      </div>
      {read.state === 'ready' && read.verdict === 'broken' && (
        <FailedEntries chain={read.chain} isLoaded={isLoaded} onOpenEntry={onOpenEntry} />
      )}
    </section>
  );
}
