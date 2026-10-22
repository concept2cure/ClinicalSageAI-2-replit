/**
 * 21 CFR Part 11 Compliance Console — the regulatory-integrity dashboard.
 *
 * Registry id: `part11-console`.
 *
 * Wired to the real Part 11 backend (server/routes/part11-compliance.ts, mounted
 * /api/part11, JWT-gated). Read-only console over the endpoints that need no
 * prior write:
 *   • GET /api/audit-trail/ledger?limit=1         — only its `meta.chain`: the
 *     server's verdict on this org's audit_logs chain (sign-ins and governed
 *     actions), computed by the one verifier (server/services/audit/chain.ts)
 *   • GET /api/part11/audit-trail/chain-integrity — the separate audit_events
 *     chain (org-scoped re-computation)
 *
 * WHAT IT DOES NOT SHOW. It used to render a §11.10 section table and a SOC 2
 * control grid from GET /api/part11/compliance-status and /soc2/controls. Every
 * row of both was a server constant (not_assessed / not_collected) — a static
 * claim dressed as an assessment. Both routes and both tables were removed on
 * 2026-10-17 (settings/integrity audit, finding 1). Validation status, Part 11
 * conformance and SOC 2 evidence are the customer's QA/GRC determinations; the
 * platform computes none of them, so this screen shows none of them.
 *
 * TWO CHAINS, TWO VERDICTS. The org's audit records live in two hash chains:
 * `audit_logs`, which every launch app writes (server/routes/
 * audit-trail-ledger.routes.ts, VSR-001 F-2), and `audit_events`, which a few
 * services still write. This console used to read only the second. On a fresh
 * org that chain is empty, so the headline panel said "EMPTY · Integrity valid ·
 * 0 Chained entries" while the org's chained sign-ins sat unverified in the
 * first (launch sweep finding 111, 2026-09-23). Each chain now reports its own
 * verdict, and a chain with no entries reports that — never a pass.
 *
 * HONESTY: every panel renders live server data, an honest empty, or an honest
 * error — never a fixture. Statuses (broken / intact / not verifiable) are the
 * server's own, shown verbatim; the console never fabricates a "compliant"
 * verdict or a hash. It is read-only by design — signing/authority writes live
 * in the governed flows, not here.
 */
import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { EmptyState, hasKeys, liveGetOrNull, type DataResult } from '../dataConnect';
import '../styles/project-home-v2.css';

interface ChainIntegrity {
  chainStatus: string;
  integrityValid: boolean | null;
  totalEntries: number;
  verifiedEntries?: number;
  unhashedEntries?: number;
  brokenLinks?: number;
  lastHash?: string | null;
  hashAlgorithm?: string;
  chainType?: string;
  verifiedAt?: string;
}
/** `meta.chain` of GET /api/audit-trail/ledger (AuditLedgerChainVerdict). */
interface LedgerChainVerdict {
  /** null: nothing was verified (no chained rows), with the server's reason. */
  ok: boolean | null;
  reason?: string;
  rowsChecked: number;
  sequencedRows?: number;
  legacyRows?: number;
  brokenAt?: { id?: string } | null;
}
type ReadState = 'loading' | 'ready' | 'forbidden' | 'error';
/**
 * A 200 is only evidence that *something* came back. The /api/part11 routes
 * this console read (originally three) return one record under `{ data }`, and the panels below treated a
 * truthy `data` as proof of that record. A route answering `{ data: [] }` — a
 * list endpoint's empty form, one proxy or one feature-flag away — unwrapped to
 * a bare `[]`, and `[]` is TRUTHY: it walked past `if (!s.data)`, flipped the
 * panel to `ready`, and then `status.part11.sections` read `.sections` off
 * `undefined` and took the whole console down. `{ data: {} }` did the same.
 * The guards below are the check that truthiness was standing in for, passed
 * to `liveGetOrNull` — a body that is not the record the panel renders is a
 * failed read, and reports as one. (This file had its own reader for that,
 * `readData`; it also reported every non-OK status as 0, so a refused read
 * could not be told from a dead one. It is gone in favour of the shared one.)
 */
const refused = (r: DataResult<unknown>) => r.status === 401 || r.status === 403;
function readStateOf(r: DataResult<unknown>): ReadState {
  if (refused(r)) return 'forbidden';
  return r.error || r.data == null ? 'error' : 'ready';
}

/** The ledger's chain verdict, or null when the body carries none. A 200 with
 *  no verdict is not a pass: the chain was not verified on this read. */
function ledgerVerdictOf(meta: Record<string, unknown> | undefined): LedgerChainVerdict | null {
  const c = meta?.chain as Partial<LedgerChainVerdict> | undefined;
  if (!c || (typeof c.ok !== 'boolean' && c.ok !== null) || typeof c.rowsChecked !== 'number' || !Number.isFinite(c.rowsChecked)) return null;
  return {
    ok: c.ok,
    reason: typeof c.reason === 'string' ? c.reason : undefined,
    rowsChecked: c.rowsChecked,
    sequencedRows: typeof c.sequencedRows === 'number' ? c.sequencedRows : undefined,
    legacyRows: typeof c.legacyRows === 'number' ? c.legacyRows : undefined,
    brokenAt: c.brokenAt && typeof c.brokenAt.id === 'string' ? { id: c.brokenAt.id } : null,
  };
}

const isChainIntegrity = hasKeys<ChainIntegrity>('chainStatus', 'totalEntries');
function chainTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'intact' || v === 'verified' ? 'ok' : v === 'broken' ? 'err' : 'dim';
}
/** The chip word for the route's `chainStatus`. `unverifiable` is the only
 *  status whose key is not already a plain word; `empty` never reaches a chip
 *  (it renders as an empty state), and an unrecognised status says so. */
function chainLabel(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  if (v === 'intact' || v === 'broken') return v;
  if (v === 'unverifiable') return 'not verifiable';
  return 'unknown';
}
/** The integrity line under the chip. Only a boolean from the server is a
 *  verdict; null is "not verified", never "valid". */
function integrityLine(v: boolean | null | undefined) {
  return v === true ? 'Integrity valid' : v === false ? 'Integrity broken' : 'Not verified';
}
export function Part11Console(_props: SurfaceViewProps) {
  const [ledger, setLedger] = useState<LedgerChainVerdict | null>(null);
  const [ledgerState, setLedgerState] = useState<ReadState>('loading');
  const [chain, setChain] = useState<ChainIntegrity | null>(null);
  const [chainState, setChainState] = useState<ReadState>('loading');

  useEffect(() => {
    void (async () => {
      const [l, c] = await Promise.all([
        // limit=1: only the verdict is read. It covers the whole chain, not the window.
        liveGetOrNull<unknown>('/api/audit-trail/ledger?limit=1'),
        liveGetOrNull<ChainIntegrity>('/api/part11/audit-trail/chain-integrity', isChainIntegrity),
      ]);
      const verdict = ledgerVerdictOf(l.meta);
      if (refused(l)) setLedgerState('forbidden');
      else if (l.error || !verdict) setLedgerState('error');
      else { setLedger(verdict); setLedgerState('ready'); }
      const cs = readStateOf(c);
      if (cs === 'ready') setChain(c.data);
      setChainState(cs);
    })();
  }, []);

  /* What AnA can see of this screen.
     Two independent reads, each with its own three states, published
     independently — and on this surface the loading/error distinction is the
     whole point. "The audit hash chain is intact" is a tamper-evidence claim
     under 21 CFR Part 11 §11.10; an assistant that made it because a
     verification request had not returned would be asserting compliance nobody
     verified. So `integrityValid` is published only when the read resolved, and
     a failed read publishes the failure by name. */
  const anaContext = React.useMemo(() => {
    const ledgerLine =
      ledgerState === 'loading'
        ? 'the audit trail ledger chain (sign-ins and governed actions) is still being verified'
        : ledgerState === 'forbidden'
          ? 'this account cannot read the audit trail ledger, so its chain is not verified here'
          : ledgerState === 'error' || !ledger
            ? 'the audit trail ledger chain verdict could not be read, so its integrity is UNKNOWN — not verified, and not intact'
            : ledger.rowsChecked === 0
              ? 'the audit trail ledger chain holds no entries, so there is nothing to verify'
              : `the audit trail ledger chain ${ledger.ok ? 'verifies intact' : 'is BROKEN'} over ${ledger.rowsChecked} entry(ies)`;
    const chainLine =
      chainState === 'loading'
        ? 'the separate audit-event chain is still being verified'
        : chainState === 'forbidden'
          ? 'this account cannot read the audit-event chain, so it is not verified here'
          : chainState === 'error' || !chain
            ? 'the audit-event chain verification could not be read, so its integrity is UNKNOWN — not verified, and not intact'
            : chain.chainStatus === 'empty' || chain.totalEntries === 0
              ? 'the separate audit-event chain holds no entries, so there is nothing to verify'
              : `the separate audit-event chain is ${chain.integrityValid === true ? 'verified intact' : chain.integrityValid === false ? 'BROKEN' : 'reported without an integrity verdict'} over ${chain.totalEntries} entry(ies)`;
    return {
      summary: `Part 11 console (audit chain integrity only; it reports no Part 11, validation or SOC 2 assessment): ${ledgerLine}; ${chainLine}.`,
      facts: {
        ledgerChain: ledgerState === 'ready' && ledger
          ? {
              verdict: ledger.rowsChecked === 0 ? 'no entries' : ledger.ok ? 'intact' : 'broken',
              entriesChecked: ledger.rowsChecked,
              brokenAt: ledger.brokenAt?.id ?? null,
            }
          : null,
        ledgerChainUnavailable: ledgerState === 'forbidden'
          ? 'this account cannot read the audit trail ledger'
          : ledgerState === 'error' ? 'the ledger chain verdict could not be read — integrity is unknown, not intact' : null,
        hashChain: chainState === 'ready' && chain
          ? {
              status: chain.chainStatus, integrityValid: chain.integrityValid,
              totalEntries: chain.totalEntries, brokenLinks: chain.brokenLinks ?? null,
              algorithm: chain.hashAlgorithm ?? null, verifiedAt: chain.verifiedAt ?? null,
            }
          : null,
        hashChainUnavailable: chainState === 'forbidden'
          ? 'this account cannot read the audit-event chain'
          : chainState === 'error' ? 'the chain-integrity read failed — integrity is unknown, not intact' : null,
      },
      availableActions: [
        'Read the integrity verdict and entry count of each audit hash chain',
      ],
    };
  }, [ledgerState, ledger, chainState, chain]);
  usePublishSurfaceContext('part11-console', anaContext);

  return (
    <div className="cm-body">
      {/* Hash-chain integrity — the headline. One block per chain, each with its
          own read states; see "TWO CHAINS, TWO VERDICTS" in the header. */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Audit hash-chain integrity</span><span className="s">21 CFR Part 11 §11.10(e) — tamper evidence</span></div>
        <div className="pj-card-b">
          <div style={{ fontSize: 13, fontWeight: 600 }}>Audit trail ledger</div>
          <div style={{ fontSize: 12, color: 'var(--text-400)', margin: '2px 0 10px' }}>Sign-ins and governed actions, as recorded in the audit trail</div>
          {ledgerState === 'loading' ? <EmptyState busy icon={I.lock} title="Verifying the audit trail ledger…" />
            : ledgerState === 'forbidden' ? <EmptyState icon={I.lock} title="You don’t have access to the audit trail ledger" hint="Your account can’t read this organisation’s audit records, so this chain is not verified here." />
            : ledgerState === 'error' || !ledger ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t verify the audit trail ledger" hint="The ledger verifier returned no verdict, so this chain’s integrity is unknown — not verified, and not intact." />
            : ledger.rowsChecked === 0 ? <EmptyState icon={I.lock} title="No ledger entries yet" hint="Nothing is recorded in this chain, so there is nothing to verify." />
            : (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div><span className={'rd-chip tone-' + (ledger.ok ? 'ok' : 'err')} style={{ fontSize: 14 }}>{ledger.ok ? 'intact' : 'broken'}</span>
                  <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 4 }}>{integrityLine(ledger.ok)}</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 700 }}>{ledger.rowsChecked}</div><div style={{ fontSize: 12, color: 'var(--text-400)' }}>Entries verified</div></div>
                {!ledger.ok && ledger.brokenAt?.id && <div style={{ fontSize: 12, color: 'var(--error)' }}>Breaks at entry <span className="mono">{ledger.brokenAt.id}</span></div>}
                <div style={{ fontSize: 12, color: 'var(--text-400)' }}>SHA-256 hash chain, re-computed on the server</div>
              </div>
            )}

          <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 12px' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Audit-event chain</div>
          <div style={{ fontSize: 12, color: 'var(--text-400)', margin: '2px 0 10px' }}>A second chain, kept per organisation, that some services write to instead of the ledger</div>
          {chainState === 'loading' ? <EmptyState busy icon={I.lock} title="Verifying the audit-event chain…" />
            : chainState === 'forbidden' ? <EmptyState icon={I.lock} title="You don’t have access to the audit-event chain" hint="Your account can’t read this organisation’s audit records, so this chain is not verified here." />
            : chainState === 'error' || !chain ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t verify the audit-event chain" hint="The verifier returned no result, so this chain’s integrity is unknown — not verified, and not intact." />
            : chain.chainStatus === 'empty' || chain.totalEntries === 0 ? <EmptyState icon={I.lock} title="No audit events yet" hint="Nothing is recorded in this chain, so there is nothing to verify." />
            : (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div><span className={'rd-chip tone-' + chainTone(chain.chainStatus)} style={{ fontSize: 14 }}>{chainLabel(chain.chainStatus)}</span>
                  <div style={{ fontSize: 12, color: 'var(--text-400)', marginTop: 4 }}>{integrityLine(chain.integrityValid)}</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 700 }}>{chain.totalEntries}</div><div style={{ fontSize: 12, color: 'var(--text-400)' }}>Chained entries</div></div>
                {chain.brokenLinks != null && <div><div style={{ fontSize: 22, fontWeight: 700, color: chain.brokenLinks > 0 ? 'var(--error)' : undefined }}>{chain.brokenLinks}</div><div style={{ fontSize: 12, color: 'var(--text-400)' }}>Broken links</div></div>}
                <div style={{ fontSize: 12, color: 'var(--text-400)' }}>{chain.hashAlgorithm ? `${chain.hashAlgorithm} hash chain` : 'Hash chain'}, re-computed on the server{chain.lastHash ? <div className="mono" style={{ wordBreak: 'break-all', marginTop: 2 }}>last: {String(chain.lastHash).slice(0, 24)}…</div> : null}</div>
              </div>
            )}
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-400)', padding: '0 4px 16px' }}>
        This console shows only the integrity verdicts the server computes by re-hashing each audit chain. It does not assess Part 11 conformance, system validation or SOC 2 evidence — those are determined by your organisation’s QA and audit program.
      </div>
    </div>
  );
}
