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
 *   • GET /api/part11/compliance-status           — §11.10 section status + SOC2 +
 *                                                   GAMP-5 posture
 *   • GET /api/part11/soc2/controls               — SOC 2 control grid + summary
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
 * error — never a fixture. Statuses (not_assessed / broken / intact) are the
 * server's own, shown verbatim; the console never fabricates a "compliant"
 * verdict or a hash. It is read-only by design — signing/authority writes live
 * in the governed flows, not here.
 */
import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { EmptyState, hasKeys, isRowsWith, liveGetOrNull, type DataResult, type ShapeGuard } from '../dataConnect';
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
  ok: boolean;
  rowsChecked: number;
  sequencedRows?: number;
  legacyRows?: number;
  brokenAt?: { id?: string } | null;
}
type ReadState = 'loading' | 'ready' | 'forbidden' | 'error';
interface ComplianceStatus {
  disclaimer?: string;
  part11: { overallStatus: string; sections: Record<string, { title: string; status: string; platformControl?: string }> };
  soc2: { certificationTarget: string; readinessScore: number | null };
  gamp5: { systemCategory?: string; validationApproach?: string; riskAssessment?: string };
}
interface Soc2Control { controlId: string; category: string; title: string; description?: string; part11Mapping?: string; evidenceStatus: string; evidenceCount: number; }
interface Soc2Payload { controls: Soc2Control[]; summary: { totalControls: number; part11MappedControls: number; readinessScore: number | null; certificationTarget: string; note?: string }; }

/**
 * A 200 is only evidence that *something* came back. All three /api/part11
 * routes return one record under `{ data }`, and the panels below treated a
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
  if (!c || typeof c.ok !== 'boolean' || typeof c.rowsChecked !== 'number' || !Number.isFinite(c.rowsChecked)) return null;
  return {
    ok: c.ok,
    rowsChecked: c.rowsChecked,
    sequencedRows: typeof c.sequencedRows === 'number' ? c.sequencedRows : undefined,
    legacyRows: typeof c.legacyRows === 'number' ? c.legacyRows : undefined,
    brokenAt: c.brokenAt && typeof c.brokenAt.id === 'string' ? { id: c.brokenAt.id } : null,
  };
}

const isRecord = (v: unknown): boolean => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * What each panel actually needs to render. `hasKeys` checks PRESENCE, so on
 * its own it still admits `{ part11: null }` / `{ controls: null }` — the
 * `?.`-covers-the-container-not-the-member trap that produced the original
 * crash one level down. Every one of these routes always builds its container
 * (see server/routes/part11-compliance.ts), so requiring the container to BE
 * the thing rejects only bodies this console cannot draw.
 */
const isChainIntegrity = hasKeys<ChainIntegrity>('chainStatus', 'totalEntries');
const isComplianceStatus: ShapeGuard<ComplianceStatus> = (v): v is ComplianceStatus => {
  if (!hasKeys<ComplianceStatus>('part11')(v)) return false;
  return isRecord((v as ComplianceStatus).part11);
};
const isSoc2Payload: ShapeGuard<Soc2Payload> = (v): v is Soc2Payload => {
  if (!hasKeys<Soc2Payload>('controls', 'summary')(v)) return false;
  return isRowsWith<Soc2Control>('controlId', 'evidenceStatus')((v as Soc2Payload).controls);
};

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
/** SOC 2 Trust Services Criteria category, in words. The route sends the keys. */
const SOC2_CATEGORY: Record<string, string> = {
  security: 'Security',
  availability: 'Availability',
  processing_integrity: 'Processing integrity',
  confidentiality: 'Confidentiality',
  privacy: 'Privacy',
};
function soc2Category(c: string | null | undefined) {
  const v = String(c ?? '').trim();
  if (!v) return '—';
  const known = SOC2_CATEGORY[v.toLowerCase()];
  if (known) return known;
  const words = v.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function statusTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  if (v.includes('compliant') || v.includes('implemented') || v.includes('verified')) return 'ok';
  if (v.includes('broken') || v.includes('non')) return 'err';
  return 'warn'; // not_assessed / not_recorded / in-progress
}

export function Part11Console(_props: SurfaceViewProps) {
  const [ledger, setLedger] = useState<LedgerChainVerdict | null>(null);
  const [ledgerState, setLedgerState] = useState<ReadState>('loading');
  const [chain, setChain] = useState<ChainIntegrity | null>(null);
  const [chainState, setChainState] = useState<ReadState>('loading');
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [soc2, setSoc2] = useState<Soc2Payload | null>(null);
  // The SOC 2 panel used to collapse "couldn't load" into "No SOC 2 controls",
  // so a dead or malformed route read as an empty framework. It gets the same
  // three states as its neighbours.
  const [soc2State, setSoc2State] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    void (async () => {
      const [l, c, s, so] = await Promise.all([
        // limit=1: only the verdict is read. It covers the whole chain, not the window.
        liveGetOrNull<unknown>('/api/audit-trail/ledger?limit=1'),
        liveGetOrNull<ChainIntegrity>('/api/part11/audit-trail/chain-integrity', isChainIntegrity),
        liveGetOrNull<ComplianceStatus>('/api/part11/compliance-status', isComplianceStatus),
        liveGetOrNull<Soc2Payload>('/api/part11/soc2/controls', isSoc2Payload),
      ]);
      const verdict = ledgerVerdictOf(l.meta);
      if (refused(l)) setLedgerState('forbidden');
      else if (l.error || !verdict) setLedgerState('error');
      else { setLedger(verdict); setLedgerState('ready'); }
      const cs = readStateOf(c);
      if (cs === 'ready') setChain(c.data);
      setChainState(cs);
      if (readStateOf(s) !== 'ready') setStatusState('error'); else { setStatus(s.data); setStatusState('ready'); }
      if (so.error) setSoc2State('error'); else { setSoc2(so.data ?? null); setSoc2State('ready'); }
    })();
  }, []);

  // `status.part11?.sections` would read as guarded and would not be: the `?.`
  // covers the container, and `.sections` is the member that was missing. The
  // guard makes part11 a record; a record without `sections` is a real (if
  // sparse) response, so it renders the honest "No section status" below.
  const rawSections = status?.part11?.sections;
  const sections =
    rawSections && typeof rawSections === 'object' && !Array.isArray(rawSections)
      ? Object.entries(rawSections)
      : [];

  /* What AnA can see of this screen.
     Three independent reads, each with its own three states, published
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
    const statusLine =
      statusState === 'loading'
        ? 'the compliance status is still loading'
        : statusState === 'error' || !status
          ? 'the compliance status could not be read'
          : `Part 11 overall status "${status.part11.overallStatus}" across ${sections.length} section(s)`;
    const soc2Line =
      soc2State === 'loading'
        ? 'the SOC 2 control set is still loading'
        : soc2State === 'error'
          ? 'the SOC 2 control set could not be read'
          : soc2
            ? `${soc2.summary.totalControls} SOC 2 control(s), ${soc2.summary.part11MappedControls} mapped to Part 11`
            : 'no SOC 2 controls are recorded';
    return {
      summary: `Part 11 console: ${ledgerLine}; ${chainLine}; ${statusLine}; ${soc2Line}.`,
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
        part11: statusState === 'ready' && status
          ? {
              overallStatus: status.part11.overallStatus,
              sections: sections.map(([k, v]) => ({ key: k, title: v.title, status: v.status, platformControl: v.platformControl ?? null })),
              disclaimer: status.disclaimer ?? null,
              gamp5: status.gamp5,
            }
          : null,
        part11Unavailable: statusState === 'error' ? 'the compliance-status read failed' : null,
        soc2: soc2State === 'ready' && soc2
          ? {
              summary: soc2.summary,
              controls: (soc2.controls ?? []).slice(0, 12).map((c) => ({
                controlId: c.controlId, category: c.category, title: c.title,
                part11Mapping: c.part11Mapping ?? null,
                evidenceStatus: c.evidenceStatus, evidenceCount: c.evidenceCount,
              })),
            }
          : null,
        soc2Unavailable: soc2State === 'error' ? 'the SOC 2 control read failed' : null,
      },
      availableActions: [
        'Read the integrity verdict and entry count of each audit hash chain',
        'Read the per-section Part 11 status and the platform control behind each',
        'Read the SOC 2 control set and its Part 11 mappings',
      ],
    };
  }, [ledgerState, ledger, chainState, chain, statusState, status, sections, soc2State, soc2]);
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

      {/* §11.10 section status */}
      <div className="pj-card">
        {/* The chip read `status.part11.overallStatus.replace(...)` — three
            member hops off a value the type said existed. Rendered only when
            the server actually sent the verdict; never a filled-in default. */}
        <div className="pj-card-h"><span className="t">21 CFR Part 11 §11.10 controls</span>{typeof status?.part11?.overallStatus === 'string' && <span className="rd-chip tone-warn">{status.part11.overallStatus.replace(/_/g, ' ')}</span>}</div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {statusState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="Loading compliance status…" /></div>
            : statusState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load compliance status" hint="The compliance service didn’t return a §11.10 status record." /></div>
            : sections.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="No section status" /></div>
            : <table className="reg-tbl"><thead><tr><th>CFR</th><th>Control</th><th>Platform control</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{sections.map(([code, sec]) => (
                <tr key={code}>
                  <td className="mono">{code}</td><td>{sec?.title ?? '—'}</td>
                  <td style={{ color: 'var(--text-400)', fontSize: 13 }}>{sec?.platformControl ?? '—'}</td>
                  {/* `sec.status.replace` called a method on a field the row may
                      simply not carry — the same crash as the panel above, one
                      level down. Missing status shows as unknown, not as a throw. */}
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(sec?.status)}>{sec?.status ? String(sec.status).replace(/_/g, ' ') : '—'}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {/* SOC 2 controls */}
      <div className="pj-card">
        {/* `soc2 && soc2.summary.…` guarded the container, not the member: a
            body carrying no summary crashed the header.
            The route's `certificationTarget` names the framework the controls
            are mapped to, not a report anyone holds. Printed bare beside the
            count it read as an attained certification, next to rows that all
            say "not collected" (launch sweep finding 116). It is only ever
            shown with that qualifier. */}
        <div className="pj-card-h"><span className="t">SOC 2 controls</span>{soc2?.summary && <span className="s">{soc2.summary.part11MappedControls} of {soc2.summary.totalControls} mapped to Part 11{typeof soc2.summary.certificationTarget === 'string' && soc2.summary.certificationTarget ? ` · reference framework for ${soc2.summary.certificationTarget}, not an attestation` : ''}</span>}</div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {soc2State === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading SOC 2 controls…" /></div>
            : soc2State === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load SOC 2 controls" hint="The controls service didn’t return the SOC 2 framework." /></div>
            : !soc2 || !Array.isArray(soc2.controls) || soc2.controls.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No SOC 2 controls" hint="The SOC 2 control framework loads here once available." /></div>
            : <table className="reg-tbl"><thead><tr><th>Control</th><th>Category</th><th>Title</th><th>Part 11</th><th style={{ textAlign: 'right' }}>Evidence</th></tr></thead>
              <tbody>{soc2.controls.map((c) => (
                <tr key={c.controlId}>
                  <td className="mono">{c.controlId}</td><td>{soc2Category(c.category)}</td><td>{c.title}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.part11Mapping ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(c.evidenceStatus)}>{c.evidenceStatus ? String(c.evidenceStatus).replace(/_/g, ' ') : '—'}{c.evidenceCount ? ' · ' + c.evidenceCount : ''}</span></td>
                </tr>))}</tbody></table>}
          {/* The route's own statement of what this grid is. It explains every
              "not collected" chip above, and it was never shown. */}
          {soc2State === 'ready' && typeof soc2?.summary?.note === 'string' && soc2.summary.note && (
            <div style={{ fontSize: 12, color: 'var(--text-400)', padding: '10px 12px', borderTop: '1px solid var(--border)' }}>{soc2.summary.note}</div>
          )}
        </div>
      </div>

      {status?.disclaimer && <div style={{ fontSize: 12, color: 'var(--text-400)', padding: '0 4px 16px' }}>{status.disclaimer}</div>}
    </div>
  );
}
