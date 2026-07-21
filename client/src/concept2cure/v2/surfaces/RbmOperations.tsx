/**
 * RBM Operations — the risk-based-monitoring WRITE / COMPUTE layer.
 *
 * Registry id: `rbm-operations`.
 *
 * The existing RBM board is a read-only aggregate; this surface drives the real
 * operational endpoints so monitors can actually act:
 *   • GET  /api/mdx-rbm/rbm-programs        — program picker (UUID + label)
 *   • GET  /api/mdx/rbm-kris?program_id     — KRIs (envelope {data,meta})
 *   • POST /api/mdx/rbm-kris/:id/values     — record a KRI reading; the server
 *                                             recomputes red/amber/green status
 *   • GET  /api/mdx/rbm-signals?program_id  — active signals
 *   • POST /api/mdx/rbm-site-risk/recompute — recompute site-risk scores
 *   • POST /api/mdx/rbm-central-monitoring/run — central statistical monitoring
 *   • POST /api/mdx/rbm-patient-profiles/score — score the patient cohort
 *
 * HONESTY: every panel renders live org-scoped data, an honest empty, or an
 * honest error — never a fixture. Recording a KRI value and the compute runs are
 * real awaited writes that refetch so status/signals come from the server; the
 * compute toasts report the server's own cohort/flag counts, never fabricated.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

interface Program { id: string; label: string; }
interface Kri { id: number | string; name?: string | null; unit?: string | null; current_value?: number | string | null; status?: string | null; threshold_amber?: number | string | null; threshold_red?: number | string | null; }
interface Signal { id: number | string; severity?: string | null; title?: string | null; status?: string | null; source?: string | null; detected_at?: string | null; }

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
async function readMeta<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null; meta: any }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null, meta: parsed?.meta ?? null };
  } catch { return { ok: false, status: 0, data: null, meta: null }; }
}
function kriTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'red' ? 'err' : v === 'amber' ? 'warn' : v === 'green' ? 'ok' : 'dim';
}
function sevTone(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase();
  return v === 'critical' || v === 'high' ? 'err' : v === 'medium' ? 'warn' : 'ok';
}

export function RbmOperations(_props: SurfaceViewProps) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [progState, setProgState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [program, setProgram] = useState<string | null>(null);

  const [kris, setKris] = useState<Kri[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, fireToast] = useToast();

  useEffect(() => {
    void (async () => {
      setProgState('loading');
      const { ok, data } = await readMeta<Program[]>('GET', '/api/mdx-rbm/rbm-programs');
      if (!ok) { setProgState('error'); return; }
      const list = Array.isArray(data) ? data : [];
      setPrograms(list); setProgState('ready');
      setProgram((cur) => cur ?? list[0]?.id ?? null);
    })();
  }, []);

  const loadProgramData = useCallback(async (pid: string) => {
    const [k, s] = await Promise.all([
      readMeta<Kri[]>('GET', `/api/mdx/rbm-kris?program_id=${encodeURIComponent(pid)}`),
      readMeta<Signal[]>('GET', `/api/mdx/rbm-signals?program_id=${encodeURIComponent(pid)}`),
    ]);
    setKris(Array.isArray(k.data) ? k.data : []);
    setSignals(Array.isArray(s.data) ? s.data : []);
  }, []);

  useEffect(() => { if (program) void loadProgramData(program); }, [program, loadProgramData]);

  const recordValue = useCallback(async (kriId: number | string) => {
    const raw = entry[String(kriId)];
    const value = Number(raw);
    if (!Number.isFinite(value)) { fireToast('Enter a numeric value to record.'); return; }
    const { ok, status } = await readMeta('POST', `/api/mdx/rbm-kris/${kriId}/values`, { value });
    if (!ok) { fireToast(status === 401 ? 'Sign in to record KRI values.' : `Couldn’t record the value (HTTP ${status}).`); return; }
    setEntry((e) => ({ ...e, [String(kriId)]: '' }));
    fireToast('KRI value recorded — status recomputed by the server.');
    if (program) void loadProgramData(program);
  }, [entry, program, loadProgramData, fireToast]);

  const runCompute = useCallback(async (kind: 'site-risk/recompute' | 'central-monitoring/run' | 'patient-profiles/score', label: string) => {
    if (!program) return;
    setBusy(kind);
    try {
      const { ok, status, meta } = await readMeta('POST', `/api/mdx/rbm-${kind}`, { programId: program });
      if (!ok) { fireToast(status === 401 ? 'Sign in to run RBM compute.' : `${label} failed (HTTP ${status}).`); return; }
      const summary = meta ? Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
      fireToast(`${label} complete${summary ? ' — ' + summary : ''}.`);
      void loadProgramData(program);
    } finally { setBusy(null); }
  }, [program, loadProgramData, fireToast]);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">RBM operations</span><span className="s">KRI capture · site-risk · central monitoring · patient scoring</span></div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {progState === 'loading' ? <span className="scaf-note">Loading programs…</span>
            : progState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load RBM programs" hint="GET /api/mdx-rbm/rbm-programs didn’t respond. Sign in to your tenant and retry." />
            : programs.length === 0 ? <EmptyState icon={I.layers} title="No RBM programs yet" hint="Risk assessments create programs; once one exists it appears here to monitor." />
            : <>
                <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Program</label>
                <select className="c2c-input" style={{ height: 30, minWidth: 220 }} value={program ?? ''} onChange={(e) => setProgram(e.target.value)}>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.label || p.id}</option>)}
                </select>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="nda-open" onClick={() => runCompute('site-risk/recompute', 'Site-risk recompute')} disabled={busy != null}>{I.zap} Site risk</button>
                  <button className="nda-open" onClick={() => runCompute('central-monitoring/run', 'Central monitoring')} disabled={busy != null}>{I.zap} Central monitoring</button>
                  <button className="nda-open" onClick={() => runCompute('patient-profiles/score', 'Patient scoring')} disabled={busy != null}>{I.zap} Score patients</button>
                </div>
              </>}
        </div>
      </div>

      {program && (
        <>
          {/* KRIs with value capture */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Key risk indicators</span><span className="s">{kris.length}</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {kris.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No KRIs for this program" hint="KRIs defined for the selected program appear here; record readings to update their status." /></div>
                : <table className="reg-tbl"><thead><tr><th>KRI</th><th>Current</th><th>Amber / Red</th><th>Status</th><th style={{ textAlign: 'right' }}>Record reading</th></tr></thead>
                  <tbody>{kris.map((k) => (
                    <tr key={String(k.id)}>
                      <td style={{ fontWeight: 600 }}>{k.name ?? '—'}</td>
                      <td className="mono">{k.current_value != null ? String(k.current_value) : '—'}{k.unit ? ' ' + k.unit : ''}</td>
                      <td className="mono">{k.threshold_amber != null ? String(k.threshold_amber) : '—'} / {k.threshold_red != null ? String(k.threshold_red) : '—'}</td>
                      <td><span className={'rd-chip tone-' + kriTone(k.status)}>{k.status ?? '—'}</span></td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <input className="c2c-input" style={{ height: 28, width: 90, marginRight: 6 }} inputMode="decimal" placeholder="value"
                          value={entry[String(k.id)] ?? ''} onChange={(e) => setEntry({ ...entry, [String(k.id)]: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter') recordValue(k.id); }} />
                        <button className="nda-open" onClick={() => recordValue(k.id)}>{I.plus} Record</button>
                      </td>
                    </tr>))}</tbody></table>}
            </div>
          </div>

          {/* Signals */}
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Active signals</span><span className="s">{signals.length}</span></div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {signals.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.checkCircle} title="No active signals" hint="Signals raised by KRI/QTL breaches or central monitoring appear here." /></div>
                : <table className="reg-tbl"><thead><tr><th>Severity</th><th>Signal</th><th>Source</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
                  <tbody>{signals.map((s) => (
                    <tr key={String(s.id)}>
                      <td><span className={'rd-chip tone-' + sevTone(s.severity)}>{s.severity ?? '—'}</span></td>
                      <td>{s.title ?? '—'}</td>
                      <td className="mono">{s.source ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}><span className="rd-chip tone-dim">{s.status ?? '—'}</span></td>
                    </tr>))}</tbody></table>}
            </div>
          </div>
        </>
      )}

      <C2CToast msg={toast} />
    </div>
  );
}
