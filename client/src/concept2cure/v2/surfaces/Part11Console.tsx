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
import { EmptyState } from '../dataConnect';
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

async function readData<T = any>(path: string): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null };
  } catch { return { ok: false, status: 0, data: null }; }
}
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

  useEffect(() => {
    void (async () => {
      const [c, s, so] = await Promise.all([
        readData<ChainIntegrity>('/api/part11/audit-trail/chain-integrity'),
        readData<ComplianceStatus>('/api/part11/compliance-status'),
        readData<Soc2Payload>('/api/part11/soc2/controls'),
      ]);
      if (!c.ok || !c.data) setChainState('error'); else { setChain(c.data); setChainState('ready'); }
      if (!s.ok || !s.data) setStatusState('error'); else { setStatus(s.data); setStatusState('ready'); }
      setSoc2(so.data ?? null);
    })();
  }, []);

  const sections = status ? Object.entries(status.part11.sections) : [];

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
        <div className="pj-card-h"><span className="t">21 CFR Part 11 §11.10 controls</span>{status && <span className="rd-chip tone-warn">{status.part11.overallStatus.replace(/_/g, ' ')}</span>}</div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {statusState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="Loading compliance status…" /></div>
            : statusState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load compliance status" hint="GET /api/part11/compliance-status didn’t respond." /></div>
            : sections.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.shieldCheck} title="No section status" /></div>
            : <table className="reg-tbl"><thead><tr><th>CFR</th><th>Control</th><th>Platform control</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              <tbody>{sections.map(([code, sec]) => (
                <tr key={code}>
                  <td className="mono">{code}</td><td>{sec.title}</td>
                  <td style={{ color: 'var(--c2c-dim,#667085)', fontSize: 13 }}>{sec.platformControl ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(sec.status)}>{sec.status.replace(/_/g, ' ')}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {/* SOC 2 controls */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">SOC 2 controls</span>{soc2 && <span className="s">{soc2.summary.part11MappedControls}/{soc2.summary.totalControls} Part 11-mapped · {soc2.summary.certificationTarget}</span>}</div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {!soc2 || soc2.controls.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No SOC 2 controls" hint="The SOC 2 control framework loads here once available." /></div>
            : <table className="reg-tbl"><thead><tr><th>Control</th><th>Category</th><th>Title</th><th>Part 11</th><th style={{ textAlign: 'right' }}>Evidence</th></tr></thead>
              <tbody>{soc2.controls.map((c) => (
                <tr key={c.controlId}>
                  <td className="mono">{c.controlId}</td><td>{c.category}</td><td>{c.title}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.part11Mapping ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}><span className={'rd-chip tone-' + statusTone(c.evidenceStatus)}>{c.evidenceStatus.replace(/_/g, ' ')}{c.evidenceCount ? ' · ' + c.evidenceCount : ''}</span></td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      {status?.disclaimer && <div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', padding: '0 4px 16px' }}>{status.disclaimer}</div>}
    </div>
  );
}
