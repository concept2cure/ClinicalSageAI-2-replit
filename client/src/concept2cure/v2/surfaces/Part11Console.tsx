/**
 * 21 CFR Part 11 Compliance Console — the regulatory-integrity dashboard.
 *
 * Registry id: `part11-console`.
 *
 * Wired to the real Part 11 backend (server/routes/part11-compliance.ts, mounted
 * /api/part11, JWT-gated). Read-only console over the endpoints that need no
 * prior write:
 *   • GET /api/part11/audit-trail/chain-integrity — hash-chain integrity verifier
 *     (org-scoped; the headline §11.10 tamper-evidence check)
 *   • GET /api/part11/compliance-status           — §11.10 section status + SOC2 +
 *                                                   GAMP-5 posture
 *   • GET /api/part11/soc2/controls               — SOC 2 control grid + summary
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
import { EmptyState, hasKeys, isRowsWith, type ShapeGuard } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface ChainIntegrity {
  chainStatus: string;
  integrityValid: boolean | null;
  totalEntries: number;
  brokenLinks?: number;
  lastHash?: string | null;
  hashAlgorithm?: string;
  chainType?: string;
  verifiedAt?: string;
}
interface ComplianceStatus {
  disclaimer?: string;
  part11: { overallStatus: string; sections: Record<string, { title: string; status: string; platformControl?: string }> };
  soc2: { certificationTarget: string; readinessScore: number | null };
  gamp5: { systemCategory?: string; validationApproach?: string; riskAssessment?: string };
}
interface Soc2Control { controlId: string; category: string; title: string; description?: string; part11Mapping?: string; evidenceStatus: string; evidenceCount: number; }
interface Soc2Payload { controls: Soc2Control[]; summary: { totalControls: number; part11MappedControls: number; readinessScore: number | null; certificationTarget: string; note?: string }; }

/**
 * A 200 is only evidence that *something* came back. All three of these routes
 * return one record under `{ data }`, and the panels below treated a truthy
 * `data` as proof of that record. A route answering `{ data: [] }` — a list
 * endpoint's empty form, one proxy or one feature-flag away — unwrapped to a
 * bare `[]`, and `[]` is TRUTHY: it walked past `if (!s.data)`, flipped the
 * panel to `ready`, and then `status.part11.sections` read `.sections` off
 * `undefined` and took the whole console down. `{ data: {} }` did the same.
 * `shaped` is the check that truthiness was standing in for — a body that is
 * not the record the panel renders is a failed read, and reports as one.
 */
async function readData<T = any>(
  path: string,
  shaped?: ShapeGuard<T>,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const parsed = (await res.json().catch(() => null)) as any;
    const payload = (parsed?.data ?? null) as unknown;
    // A null payload is left alone: "nothing recorded yet" is real, and a shape
    // check must never dress an honest empty up as a broken backend.
    if (payload !== null && shaped && !shaped(payload)) {
      return { ok: false, status: res.status, data: null };
    }
    return { ok: res.ok, status: res.status, data: payload as T | null };
  } catch { return { ok: false, status: 0, data: null }; }
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
function statusTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  if (v.includes('compliant') || v.includes('implemented') || v.includes('verified')) return 'ok';
  if (v.includes('broken') || v.includes('non')) return 'err';
  return 'warn'; // not_assessed / not_recorded / in-progress
}

export function Part11Console(_props: SurfaceViewProps) {
  const [chain, setChain] = useState<ChainIntegrity | null>(null);
  const [chainState, setChainState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [status, setStatus] = useState<ComplianceStatus | null>(null);
  const [statusState, setStatusState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [soc2, setSoc2] = useState<Soc2Payload | null>(null);
  // The SOC 2 panel used to collapse "couldn't load" into "No SOC 2 controls",
  // so a dead or malformed route read as an empty framework. It gets the same
  // three states as its neighbours.
  const [soc2State, setSoc2State] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    void (async () => {
      const [c, s, so] = await Promise.all([
        readData<ChainIntegrity>('/api/part11/audit-trail/chain-integrity', isChainIntegrity),
        readData<ComplianceStatus>('/api/part11/compliance-status', isComplianceStatus),
        readData<Soc2Payload>('/api/part11/soc2/controls', isSoc2Payload),
      ]);
      if (!c.ok || !c.data) setChainState('error'); else { setChain(c.data); setChainState('ready'); }
      if (!s.ok || !s.data) setStatusState('error'); else { setStatus(s.data); setStatusState('ready'); }
      if (!so.ok) setSoc2State('error'); else { setSoc2(so.data ?? null); setSoc2State('ready'); }
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

  return (
    <div className="cm-body">
      {/* Hash-chain integrity — the headline */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Audit hash-chain integrity</span><span className="s">21 CFR Part 11 §11.10 — tamper evidence</span></div>
        <div className="pj-card-b">
          {chainState === 'loading' ? <EmptyState icon={I.lock} title="Verifying the audit hash chain…" />
            : chainState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t verify the hash chain" hint="GET /api/part11/audit-trail/chain-integrity didn’t respond. Sign in to your tenant and retry." />
            : !chain ? <EmptyState icon={I.lock} title="No chain data" />
            : (
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                <div><span className={'rd-chip tone-' + chainTone(chain.chainStatus)} style={{ fontSize: 14 }}>{chain.chainStatus}</span>
                  <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', marginTop: 4 }}>{chain.integrityValid === true ? 'Integrity valid' : chain.integrityValid === false ? 'Integrity BROKEN' : 'Not verifiable'}</div></div>
                <div><div style={{ fontSize: 22, fontWeight: 700 }}>{chain.totalEntries}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Chained entries</div></div>
                {chain.brokenLinks != null && <div><div style={{ fontSize: 22, fontWeight: 700, color: chain.brokenLinks > 0 ? 'var(--c2c-err,#b42318)' : undefined }}>{chain.brokenLinks}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Broken links</div></div>}
                <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>{chain.hashAlgorithm ?? 'SHA-256'} · {chain.chainType ?? 'linear-hash-chain'}{chain.lastHash ? <div className="mono" style={{ wordBreak: 'break-all', marginTop: 2 }}>last: {String(chain.lastHash).slice(0, 24)}…</div> : null}</div>
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
            : statusState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load compliance status" hint="GET /api/part11/compliance-status didn’t return a §11.10 status record." /></div>
            : sections.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="No section status" /></div>
            : <table className="reg-tbl"><thead><tr><th>CFR</th><th>Control</th><th>Platform control</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{sections.map(([code, sec]) => (
                <tr key={code}>
                  <td className="mono">{code}</td><td>{sec?.title ?? '—'}</td>
                  <td style={{ color: 'var(--c2c-dim,#667085)', fontSize: 13 }}>{sec?.platformControl ?? '—'}</td>
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
            body carrying no summary crashed the header. */}
        <div className="pj-card-h"><span className="t">SOC 2 controls</span>{soc2?.summary && <span className="s">{soc2.summary.part11MappedControls}/{soc2.summary.totalControls} Part 11-mapped · {soc2.summary.certificationTarget}</span>}</div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {soc2State === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading SOC 2 controls…" /></div>
            : soc2State === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load SOC 2 controls" hint="GET /api/part11/soc2/controls didn’t return the control framework." /></div>
            : !soc2 || !Array.isArray(soc2.controls) || soc2.controls.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No SOC 2 controls" hint="The SOC 2 control framework loads here once available." /></div>
            : <table className="reg-tbl"><thead><tr><th>Control</th><th>Category</th><th>Title</th><th>Part 11</th><th style={{ textAlign: 'right' }}>Evidence</th></tr></thead>
              <tbody>{soc2.controls.map((c) => (
                <tr key={c.controlId}>
                  <td className="mono">{c.controlId}</td><td>{c.category}</td><td>{c.title}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.part11Mapping ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(c.evidenceStatus)}>{c.evidenceStatus ? String(c.evidenceStatus).replace(/_/g, ' ') : '—'}{c.evidenceCount ? ' · ' + c.evidenceCount : ''}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {status?.disclaimer && <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', padding: '0 4px 16px' }}>{status.disclaimer}</div>}
    </div>
  );
}
