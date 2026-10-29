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
  verifiedEntries?: number;
  unhashedEntries?: number;
  brokenLinks?: number;
  lastHash?: string | null;
  hashAlgorithm?: string;
  verifiedAt?: string;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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

const entries = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;

/** What AnA is told when there is no verdict: the sentence, and the fact that names why. */
const UNREAD: Record<Exclude<AuditEventChainRead['state'], 'ready'>, [string, string]> = {
  loading: ['The separate audit-event chain is still being verified.', 'the audit-event chain is still being verified'],
  forbidden: ['This account cannot read the audit-event chain, so it is not verified here.', 'this account cannot read the audit-event chain'],
  error: [
    'The audit-event chain verification could not be read, so its integrity is UNKNOWN — not verified, and not intact.',
    'the chain-integrity read failed — integrity is unknown, not intact',
  ],
};

function readySentence(c: AuditEventChainIntegrity, verdict: AuditEventChainVerdict): string {
  const over = `over ${entries(c.totalEntries)}`;
  switch (verdict) {
    case 'no entries':
      return 'The separate audit-event chain holds no entries, so there is nothing to verify.';
    case 'intact':
      return `The separate audit-event chain is verified intact ${over}.`;
    case 'broken':
      return `The separate audit-event chain is BROKEN${c.brokenLinks != null ? ` (${c.brokenLinks} broken link(s))` : ''} ${over}.`;
    case 'not verifiable':
      return `The separate audit-event chain is NOT VERIFIABLE ${over}: ${c.unhashedEntries ?? 'some'} carry no record hash.`;
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
    brokenLinks: c.brokenLinks ?? null,
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

const WHAT = 'A second chain, kept per organisation, that some services write to instead of the ledger';

function rowOf(read: Exclude<AuditEventChainRead, { state: 'error' }>) {
  const dim = 'var(--text-400)';
  if (read.state === 'loading') return { tone: dim, icon: I.lock, title: 'Verifying the audit-event chain…', detail: null, busy: true };
  if (read.state === 'forbidden') {
    return { tone: dim, icon: I.lock, title: 'The audit-event chain is not available to your role', detail: 'Your account can’t read this chain’s verification, so it is not verified here.' };
  }
  const { chain: c, verdict } = read;
  const alg = c.hashAlgorithm ?? 'Hash';
  switch (verdict) {
    case 'no entries':
      return { tone: dim, icon: I.lock, title: 'Audit-event chain: no entries yet', detail: 'Nothing is recorded in this chain, so there is nothing to verify.' };
    case 'intact':
      return { tone: 'var(--success)', icon: I.shieldCheck, title: 'Audit-event chain intact', detail: `${c.totalEntries} chained ${c.totalEntries === 1 ? 'entry' : 'entries'} re-computed on the server — ${alg}` };
    case 'broken': {
      const k = c.brokenLinks;
      return {
        tone: 'var(--error)', icon: I.alertTriangle, title: 'Audit-event chain verification failed',
        detail: `${k != null ? `${k} broken ${k === 1 ? 'link' : 'links'}` : 'A break was found'} over ${entries(c.totalEntries)}, re-computed on the server — ${alg}`,
      };
    }
    case 'not verifiable':
      return {
        tone: 'var(--warning)', icon: I.alertTriangle, title: 'Audit-event chain not verifiable',
        detail: `${c.unhashedEntries ?? 'Some'} of ${entries(c.totalEntries)} carry no record hash, so the chain could not be verified`,
      };
    default:
      return {
        tone: 'var(--warning)', icon: I.alertTriangle, title: 'Audit-event chain not verified',
        detail: `The server reported ${entries(c.totalEntries)} without an integrity verdict, so the chain is not verified here`,
      };
  }
}

/** The second verdict of Audit trail's chain banner. */
export function AuditEventChainBanner({ read, onRetry }: { read: AuditEventChainRead; onRetry: () => void }) {
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
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8,
        background: `color-mix(in srgb,${row.tone} 10%,transparent)`, border: `1px solid ${row.tone}`,
        marginBottom: 16, maxWidth: 680,
      }}
    >
      <span style={{ fontSize: 18 }} aria-hidden="true">{row.icon}</span>
      <div style={{ flex: 1 }} role={'busy' in row ? 'status' : undefined}>
        <div style={{ fontWeight: 600, fontSize: 13, color: row.tone }}>{row.title}</div>
        {row.detail && <div style={{ fontSize: 11.5, color: 'var(--text-400)', marginTop: 2 }}>{row.detail}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>{WHAT}</div>
      </div>
      {head && <span className="mono" style={{ fontSize: 10, color: 'var(--text-400)' }}>HEAD {head}…</span>}
    </section>
  );
}
