/**
 * Biostatistics Workbench — drives the REAL statistical engine instead of a
 * client-side normal approximation.
 *
 * Registry id: `biostat-workbench`.
 *
 * Wired to two real backends:
 *   • Statistical defensibility (server/routes/statistical-defensibility.ts,
 *     mounted /api/statistical-defensibility — deterministic, no DB):
 *       POST /assess          — reviewer-risk assessment of a study's statistics
 *                               (overall score/rating, critical/major issues,
 *                               reviewer-risk level, recommendations)
 *       POST /reviewer-risks  — the specific reviewer objections to expect
 *   • Design-stats calculators (server/routes/biostat-design-stats.ts under
 *     /api/biostat, org-scoped):
 *       POST /assurance       — Bayesian assurance (unconditional power) for a
 *                               two-sample mean comparison
 *
 * The defensibility tools are pure server-side math and are usable immediately;
 * the assurance calculator requires a signed-in org and surfaces a 401 honestly.
 * Results are rendered only from the server's response — the in-browser
 * normal-approximation engine is not used here. Nothing is fabricated.
 */
import React, { useCallback, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface Defensibility {
  overallScore?: number;
  overallRating?: string;
  reviewerRiskLevel?: string;
  criticalIssues?: any[];
  majorIssues?: any[];
  recommendations?: any;
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = useCallback((m: string) => { setMsg(m); if (t.current) clearTimeout(t.current); t.current = setTimeout(() => setMsg(''), 4200); }, []);
  return [msg, fire];
}
function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return <div className="de-toast"><span className="ico">{I.checkCircle}</span>{msg}</div>;
}
async function readData<T = any>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await apiRequest('POST', path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null };
  } catch { return { ok: false, status: 0, data: null }; }
}
function issueText(x: any): string {
  if (typeof x === 'string') return x;
  return String(x?.message ?? x?.issue ?? x?.description ?? JSON.stringify(x));
}
function ratingTone(r: string | undefined) {
  const v = String(r ?? '').toLowerCase();
  if (v.includes('high') || v.includes('poor') || v.includes('weak')) return 'err';
  if (v.includes('moderate') || v.includes('medium') || v.includes('fair')) return 'warn';
  return 'ok';
}
/** Render the numeric fields of an engine result as a labeled table. */
function numericRows(obj: Record<string, any> | null): Array<[string, string]> {
  if (!obj) return [];
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && Number.isFinite(v)) out.push([k, String(Math.round(v * 10000) / 10000)]);
    else if (typeof v === 'boolean') out.push([k, v ? 'yes' : 'no']);
  }
  return out;
}

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export function BiostatWorkbench(_props: SurfaceViewProps) {
  const [toast, fireToast] = useToast();

  // Defensibility assessment.
  const [asmt, setAsmt] = useState({ studyPhase: 'Phase 3', indication: '', studyDesign: '', primaryEndpoint: '', sampleSize: '' });
  const [asmtRes, setAsmtRes] = useState<Defensibility | null>(null);
  const [asmtBusy, setAsmtBusy] = useState(false);

  // Assurance calculator.
  const [asr, setAsr] = useState({ priorMean: '', priorSd: '', nPerArm: '' });
  const [asrRes, setAsrRes] = useState<Record<string, any> | null>(null);
  const [asrBusy, setAsrBusy] = useState(false);

  const runAssess = useCallback(async () => {
    if (!asmt.indication || !asmt.studyDesign || !asmt.primaryEndpoint) { fireToast('Enter indication, study design, and primary endpoint.'); return; }
    setAsmtBusy(true);
    try {
      const { ok, status, data } = await readData<Defensibility>('/api/statistical-defensibility/assess', {
        studyPhase: asmt.studyPhase, indication: asmt.indication, studyDesign: asmt.studyDesign,
        primaryEndpoint: asmt.primaryEndpoint, sampleSize: asmt.sampleSize ? Number(asmt.sampleSize) : 0,
      });
      if (!ok || !data) { fireToast(`Assessment failed (HTTP ${status}).`); return; }
      setAsmtRes(data);
      fireToast('Reviewer-risk assessment complete.');
    } finally { setAsmtBusy(false); }
  }, [asmt, fireToast]);

  const runAssurance = useCallback(async () => {
    const nums = { priorMean: Number(asr.priorMean), priorSd: Number(asr.priorSd), nPerArm: Number(asr.nPerArm) };
    if (![nums.priorMean, nums.priorSd, nums.nPerArm].every((x) => Number.isFinite(x)) || nums.nPerArm <= 0) { fireToast('Enter prior mean, prior SD, and n per arm.'); return; }
    setAsrBusy(true);
    try {
      const { ok, status, data } = await readData<Record<string, any>>('/api/biostat/assurance', nums);
      if (!ok || !data) { fireToast(status === 401 ? 'Sign in to your tenant to run the assurance calculator.' : `Calculation failed (HTTP ${status}).`); return; }
      setAsrRes(data);
    } finally { setAsrBusy(false); }
  }, [asr, fireToast]);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Biostatistics workbench</span><span className="s">Real defensibility engine + design calculators</span></div>
        <div className="pj-card-b" style={{ fontSize: 13, color: 'var(--c2c-dim,#667085)' }}>
          Reviewer-risk assessment and the design calculators run on the server’s statistical engine — not a client-side approximation.
        </div>
      </div>

      {/* Reviewer-risk defensibility */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Statistical defensibility</span><span className="s">Reviewer-risk assessment</span></div>
        <div className="pj-card-b">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Phase<select className="c2c-input" style={{ height: 30 }} value={asmt.studyPhase} onChange={(e) => setAsmt({ ...asmt, studyPhase: e.target.value })}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Indication<input className="c2c-input" style={{ height: 30 }} value={asmt.indication} onChange={(e) => setAsmt({ ...asmt, indication: e.target.value })} placeholder="e.g. NSCLC" /></label>
            <label style={{ fontSize: 12 }}>Study design<input className="c2c-input" style={{ height: 30 }} value={asmt.studyDesign} onChange={(e) => setAsmt({ ...asmt, studyDesign: e.target.value })} placeholder="e.g. randomized double-blind" /></label>
            <label style={{ fontSize: 12 }}>Primary endpoint<input className="c2c-input" style={{ height: 30 }} value={asmt.primaryEndpoint} onChange={(e) => setAsmt({ ...asmt, primaryEndpoint: e.target.value })} placeholder="e.g. PFS" /></label>
            <label style={{ fontSize: 12 }}>Sample size<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={asmt.sampleSize} onChange={(e) => setAsmt({ ...asmt, sampleSize: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <button className="btn primary" style={{ height: 32 }} onClick={runAssess} disabled={asmtBusy}>{I.zap} {asmtBusy ? 'Assessing…' : 'Assess defensibility'}</button>

          {asmtRes && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                {asmtRes.overallScore != null && <div><div style={{ fontSize: 26, fontWeight: 700 }}>{asmtRes.overallScore}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Overall score</div></div>}
                {asmtRes.overallRating && <div><span className={'rd-chip tone-' + ratingTone(asmtRes.overallRating)}>{asmtRes.overallRating}</span><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', marginTop: 4 }}>Rating</div></div>}
                {asmtRes.reviewerRiskLevel && <div><span className={'rd-chip tone-' + ratingTone(asmtRes.reviewerRiskLevel)}>{asmtRes.reviewerRiskLevel}</span><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)', marginTop: 4 }}>Reviewer risk</div></div>}
              </div>
              {Array.isArray(asmtRes.criticalIssues) && asmtRes.criticalIssues.length > 0 && (
                <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2c-err,#b42318)' }}>Critical issues</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.criticalIssues.map((x, i) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
              {Array.isArray(asmtRes.majorIssues) && asmtRes.majorIssues.length > 0 && (
                <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2c-warn,#b54708)' }}>Major issues</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.majorIssues.map((x, i) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
              {Array.isArray(asmtRes.recommendations) && asmtRes.recommendations.length > 0 && (
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>Recommendations</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.recommendations.map((x: any, i: number) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Assurance calculator */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Assurance (Bayesian power)</span><span className="s">Two-sample means</span></div>
        <div className="pj-card-b">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Prior mean (effect)<input className="c2c-input" style={{ height: 30 }} value={asr.priorMean} onChange={(e) => setAsr({ ...asr, priorMean: e.target.value })} placeholder="e.g. 0.4" /></label>
            <label style={{ fontSize: 12 }}>Prior SD<input className="c2c-input" style={{ height: 30 }} value={asr.priorSd} onChange={(e) => setAsr({ ...asr, priorSd: e.target.value })} placeholder="e.g. 0.15" /></label>
            <label style={{ fontSize: 12 }}>n per arm<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={asr.nPerArm} onChange={(e) => setAsr({ ...asr, nPerArm: e.target.value.replace(/\D/g, '') })} placeholder="e.g. 120" /></label>
          </div>
          <button className="btn primary" style={{ height: 32 }} onClick={runAssurance} disabled={asrBusy}>{I.zap} {asrBusy ? 'Computing…' : 'Compute assurance'}</button>
          {asrRes && (
            numericRows(asrRes).length === 0 ? (
              <div style={{ marginTop: 10 }}><EmptyState icon={I.beaker} title="Computed" hint="The engine returned a result with no scalar fields to tabulate." /></div>
            ) : (
              <table className="reg-tbl" style={{ marginTop: 10 }}><tbody>
                {numericRows(asrRes).map(([k, v]) => (<tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }} className="mono">{v}</td></tr>))}
              </tbody></table>
            )
          )}
        </div>
      </div>

      <C2CToast msg={toast} />
    </div>
  );
}
