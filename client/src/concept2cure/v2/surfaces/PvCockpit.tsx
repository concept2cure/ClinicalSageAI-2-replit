/**
 * Pharmacovigilance Cockpit — the safety-surveillance workbench.
 *
 * Registry id: `pv-cockpit`.
 *
 * Wired to the real PV backend (server/routes/pharmacovigilance-routes.ts,
 * mounted /api/pharmacovigilance, org-scoped from the JWT):
 *   • GET  /overview            — safety KPIs + recent overdue / active signals /
 *                                 upcoming periodic-report deadlines
 *   • POST /signals/screen      — disproportionality math (PRR / ROR+CI / χ² /
 *                                 EBGM / EB05) on a 2×2 count table; the real
 *                                 signal-detection engine, deterministic, no DB
 *   • POST /calculate-deadline  — expedited-reporting clock by event type /
 *                                 seriousness / region (deterministic, no DB)
 *   • GET  /compliance-matrix   — per-region reporting compliance
 *
 * The screener and deadline calculator are pure server-side math and are usable
 * immediately; the KPI strip and compliance matrix render live org data, an
 * honest empty, or an honest error — never a fixture. Disproportionality values
 * can be non-finite (division by an empty cell); those are shown as "∞"/"n/a",
 * never a fabricated number.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { saveToAuthoring } from '../authoringHandoff';
import { engineResultToHtml, type EngineProvenance } from '../engineResultHtml';

interface Overview {
  kpis: { totalAdverseEvents: number; seriousEvents: number; expeditedReports: number; overdueReports: number; pendingSignals: number; upcomingPeriodicReports: number; complianceRate: number };
  recentOverdue: any[];
  activeSignals: any[];
  upcomingDeadlines: any[];
}
interface Disproportion { prr: number; ror: number; rorCi: { lower: number; upper: number }; chiSquared: number; ebgm: number; eb05: number; signalDetected: boolean; }
// region/complianceStatus are optional because the wire genuinely omits them on
// partially-populated rows; the render guards them rather than trusting the type.
interface ComplianceRow { region?: string; totalEvents: number; overdueCount: number; complianceStatus?: string; }
interface DeadlineResult { deadline: string; expeditedReport: boolean; daysRemaining: number; region: string; eventType: string; seriousnessCriteria: string; }

async function readData<T = any>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await apiRequest(method, path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return { ok: res.ok, status: res.status, data: (parsed?.data ?? null) as T | null };
  } catch { return { ok: false, status: 0, data: null }; }
}
function fmt(n: number | undefined | null, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return n === Infinity ? '∞' : 'n/a';
  return (Math.round(n * 10 ** dp) / 10 ** dp).toString();
}

const EVENT_TYPES = ['AE', 'SAE', 'SUSAR', 'AESI'];
const SERIOUSNESS = ['death', 'life_threatening', 'hospitalization', 'disability', 'congenital_anomaly', 'medically_important'];
const REGIONS = ['FDA', 'EMA', 'PMDA', 'NMPA', 'Health_Canada'];

export function PvCockpit({ onAsk }: SurfaceViewProps) {
  /* AnA on this surface. It took SurfaceViewProps and discarded it as `_props`,
     so the one screen where a safety reviewer is looking at a disproportionality
     signal or an expedited-reporting clock had no way to ask about it. The
     prompts below name the actual artefact on screen — a generic "ask about this
     page" would make the affordance decorative. */
  const ask = onAsk;
  const [ov, setOv] = useState<Overview | null>(null);
  const [ovState, setOvState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [matrix, setMatrix] = useState<ComplianceRow[]>([]);
  const [matrixState, setMatrixState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [toast, fireToast] = useToast();

  // Disproportionality screener state (2×2: a=drug+event, b=drug+other, c=other+event, d=other+other).
  const [scr, setScr] = useState({ drug: '', event: '', a: '', b: '', c: '', d: '' });
  const [scrRes, setScrRes] = useState<Disproportion | null>(null);
  const [scrProv, setScrProv] = useState<EngineProvenance | null>(null);
  const [scrFiling, setScrFiling] = useState(false);
  const [scrBusy, setScrBusy] = useState(false);

  // Reporting-deadline calculator state.
  const [dl, setDl] = useState({ eventType: 'SAE', seriousnessCriteria: 'hospitalization', region: 'FDA' });
  const [dlRes, setDlRes] = useState<DeadlineResult | null>(null);
  const [dlBusy, setDlBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      setOvState('loading');
      const [o, m] = await Promise.all([
        readData<Overview>('GET', '/api/pharmacovigilance/overview'),
        readData<ComplianceRow[]>('GET', '/api/pharmacovigilance/compliance-matrix'),
      ]);
      if (!o.ok) setOvState('error'); else { setOv(o.data); setOvState('ready'); }
      // A failed matrix read used to collapse into "No compliance data yet" —
      // an outage read as a clean, event-free tenant.
      if (!m.ok) { setMatrixState('error'); setMatrix([]); }
      else { setMatrix(Array.isArray(m.data) ? m.data : []); setMatrixState('ready'); }
    })();
  }, []);

  const runScreen = useCallback(async () => {
    const counts = { a: Number(scr.a), b: Number(scr.b), c: Number(scr.c), d: Number(scr.d) };
    if (![counts.a, counts.b, counts.c, counts.d].every((x) => Number.isFinite(x))) { fireToast('Enter all four 2×2 cell counts (a, b, c, d).', 'error'); return; }
    setScrBusy(true);
    try {
      const { ok, status, data } = await readData<{
        rows: Array<{ result: Disproportion }>;
        summary: { total: number; signals: number };
        provenance?: EngineProvenance;
      }>(
        'POST', '/api/pharmacovigilance/signals/screen',
        { pairs: [{ drug: scr.drug || 'drug', event: scr.event || 'event', counts }] },
      );
      if (!ok || !data?.rows?.[0]) { fireToast(status === 401 ? 'Sign in to screen signals.' : `Screening failed (HTTP ${status}).`, 'error'); return; }
      setScrRes(data.rows[0].result);
      setScrProv(data.provenance ?? null);
      fireToast(data.rows[0].result.signalDetected ? 'Disproportionality signal detected.' : 'No disproportionality signal.');
    } finally { setScrBusy(false); }
  }, [scr, fireToast]);

  const runDeadline = useCallback(async () => {
    setDlBusy(true);
    try {
      const { ok, status, data } = await readData<DeadlineResult>('POST', '/api/pharmacovigilance/calculate-deadline', dl);
      if (!ok || !data) { fireToast(status === 401 ? 'Sign in to calculate.' : `Calculation failed (HTTP ${status}).`, 'error'); return; }
      setDlRes(data);
    } finally { setDlBusy(false); }
  }, [dl, fireToast]);

  const kpi = ov?.kpis;
  const KPIS: Array<[string, number | string, boolean?]> = kpi ? [
    ['Adverse events', kpi.totalAdverseEvents],
    ['Serious', kpi.seriousEvents],
    ['Expedited', kpi.expeditedReports],
    ['Overdue', kpi.overdueReports, kpi.overdueReports > 0],
    ['Pending signals', kpi.pendingSignals],
    ['Periodic due', kpi.upcomingPeriodicReports],
    ['Compliance', kpi.complianceRate + '%'],
  ] : [];

  /* WHAT ANA SEES HERE. The affordances above let a user ASK; this lets AnA
     answer without the user restating their screen. Deliberately the nouns and
     numbers already rendered — never the raw API bodies, and never a figure the
     panels are withholding, because the KPI panel distinguishes loading from
     error from empty rather than showing zero and that distinction has to
     survive into the conversation. `ovState` travels for exactly that reason:
     "unavailable" and "zero overdue" are different answers. */
  const anaContext = useMemo(
    () => ({
      summary:
        `Pharmacovigilance cockpit. Safety KPIs are ${ovState}` +
        (kpi ? `, ${kpi.overdueReports} report(s) overdue and ${kpi.pendingSignals} signal(s) pending` : '') +
        matrixState === 'error' ? '. The regional compliance matrix could not be read; compliance is unknown.' : `. Regional compliance matrix holds ${matrix.length} row(s).`,
      facts: {
        kpiState: ovState,
        ...(kpi
          ? {
              adverseEvents: kpi.totalAdverseEvents,
              seriousEvents: kpi.seriousEvents,
              expeditedReports: kpi.expeditedReports,
              overdueReports: kpi.overdueReports,
              pendingSignals: kpi.pendingSignals,
              upcomingPeriodicReports: kpi.upcomingPeriodicReports,
              complianceRatePct: kpi.complianceRate,
            }
          : {}),
        complianceMatrixRows: matrixState === 'ready' ? matrix.length : null,
        // The screener result only exists once the user has run it. Absent is
        // not "no signal" — saying so keeps AnA from reading a blank as a null
        // result, the same mistake the compliance table refuses to make.
        screenerRun: scrRes !== null,
        ...(scrRes ? { screenerSignalDetected: scrRes.signalDetected } : {}),
        deadlineCalculated: dlRes !== null,
      },
      availableActions: [
        'Review pharmacovigilance posture (overdue, signals, periodic reports)',
        'Interpret a disproportionality result (PRR, ROR, chi-square, EBGM, EB05)',
        'Explain expedited and periodic reporting obligations by region',
        'Screen a drug-event pair from 2x2 counts',
        'Calculate a reporting deadline',
      ],
    }),
    [ovState, kpi, matrix.length, matrixState, scrRes, dlRes],
  );
  usePublishSurfaceContext('pv-cockpit', anaContext);

  return (
    <div className="cm-body">
      {/* KPI strip */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Safety surveillance</span><span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Live org-scoped KPIs{ask && <button className="reg-cta" onClick={() => ask('Review our current pharmacovigilance posture: overdue cases, active signals, and any periodic report at risk of missing its deadline. Say which are unavailable rather than assuming zero.')}>{I.sparkles} Review posture</button>}</span></div>
        <div className="pj-card-b">
          {ovState === 'loading' ? <EmptyState icon={I.zap} title="Loading safety KPIs…" />
            : ovState === 'error' ? <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load safety KPIs" hint="The pharmacovigilance overview didn’t respond. Sign in to your tenant and retry." />
            : !kpi ? <EmptyState icon={I.bell} title="No safety data yet" hint="Adverse-event, signal, and periodic-report metrics for your organization appear here." />
            : <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {KPIS.map(([label, val, warn]) => (
                  <div key={label}><div style={{ fontSize: 26, fontWeight: 700, color: warn ? 'var(--c2c-err,#b42318)' : undefined }}>{val}</div><div style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>{label}</div></div>
                ))}
              </div>}
        </div>
      </div>

      {/* Disproportionality screener + deadline calculator */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, marginBottom: 14 }}>
        <div className="pj-card" style={{ margin: 0 }}>
          <div className="pj-card-h"><span className="t">Disproportionality screener</span><span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>PRR · ROR · EBGM{ask && <button className="reg-cta" onClick={() => ask('Interpret a disproportionality result for a drug-event pair: what PRR, ROR with its confidence interval, chi-square, EBGM and EB05 together do and do not support, and what evidence would be needed before calling it a signal.')}>{I.sparkles} Interpret these statistics</button>}</span></div>
          <div className="pj-card-b">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input className="c2c-input" style={{ height: 30, flex: 1 }} aria-label="Drug name" placeholder="Drug" value={scr.drug} onChange={(e) => setScr({ ...scr, drug: e.target.value })} />
              <input className="c2c-input" style={{ height: 30, flex: 1 }} aria-label="Adverse event (preferred term)" placeholder="Event (PT)" value={scr.event} onChange={(e) => setScr({ ...scr, event: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>a · drug + event<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={scr.a} onChange={(e) => setScr({ ...scr, a: e.target.value.replace(/\D/g, '') })} /></label>
              <label style={{ fontSize: 12 }}>b · drug + other<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={scr.b} onChange={(e) => setScr({ ...scr, b: e.target.value.replace(/\D/g, '') })} /></label>
              <label style={{ fontSize: 12 }}>c · other + event<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={scr.c} onChange={(e) => setScr({ ...scr, c: e.target.value.replace(/\D/g, '') })} /></label>
              <label style={{ fontSize: 12 }}>d · other + other<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={scr.d} onChange={(e) => setScr({ ...scr, d: e.target.value.replace(/\D/g, '') })} /></label>
            </div>
            <button className="btn primary" style={{ height: 32 }} onClick={runScreen} disabled={scrBusy}>{I.search} {scrBusy ? 'Screening…' : 'Screen'}</button>
            {scrRes && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div style={{ marginBottom: 6 }}>
                  <span className={'rd-chip tone-' + (scrRes.signalDetected ? 'err' : 'ok')}>{scrRes.signalDetected ? 'Signal detected' : 'No signal'}</span>
                </div>
                <table className="reg-tbl"><tbody>
                  <tr><td>PRR</td><td style={{ textAlign: 'right' }} className="mono">{fmt(scrRes.prr)}</td></tr>
                  <tr><td>ROR (95% CI)</td><td style={{ textAlign: 'right' }} className="mono">{fmt(scrRes.ror)} ({fmt(scrRes.rorCi?.lower)}–{fmt(scrRes.rorCi?.upper)})</td></tr>
                  <tr><td>χ²</td><td style={{ textAlign: 'right' }} className="mono">{fmt(scrRes.chiSquared)}</td></tr>
                  <tr><td>EBGM</td><td style={{ textAlign: 'right' }} className="mono">{fmt(scrRes.ebgm)}</td></tr>
                  <tr><td>EB05</td><td style={{ textAlign: 'right' }} className="mono">{fmt(scrRes.eb05)}</td></tr>
                </tbody></table>
                {scrProv && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-300,#6b6963)' }}>
                    {scrProv.method} · {scrProv.engine} {scrProv.engineVersion}
                    {scrProv.inputsSha256 ? <> · inputs <span className="mono">{String(scrProv.inputsSha256).slice(0, 12)}</span></> : null}
                    {scrProv.reproducible ? ' · reproducible' : null}
                  </div>
                )}
                {/* BP-W2-4: a screened signal is signal-detection-report content;
                    file it with its stamp instead of retyping it without one. */}
                <button
                  className="btn"
                  style={{ height: 30, marginTop: 8 }}
                  disabled={scrFiling}
                  onClick={() => void (async () => {
                    setScrFiling(true);
                    try {
                      const outcome = await saveToAuthoring({
                        title: `Disproportionality screen — ${scr.drug || 'drug'} / ${scr.event || 'event'}`,
                        module: 'M5',
                        code: 'pv.signal-screen',
                        content: engineResultToHtml({
                          title: `Disproportionality screen — ${scr.drug || 'drug'} / ${scr.event || 'event'}`,
                          rows: [
                            ['Signal detected', scrRes.signalDetected ? 'Yes' : 'No'],
                            ['PRR', fmt(scrRes.prr)],
                            ['ROR (95% CI)', `${fmt(scrRes.ror)} (${fmt(scrRes.rorCi?.lower)}–${fmt(scrRes.rorCi?.upper)})`],
                            ['Chi-squared (Yates)', fmt(scrRes.chiSquared)],
                            ['EBGM', fmt(scrRes.ebgm)],
                            ['EB05', fmt(scrRes.eb05)],
                          ],
                          provenance: scrProv,
                        }),
                        subject: 'the screened signal',
                      });
                      fireToast(outcome.message, outcome.ok ? 'ok' : 'error');
                    } finally {
                      setScrFiling(false);
                    }
                  })()}
                >
                  {scrFiling ? 'Filing…' : 'Insert into document'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pj-card" style={{ margin: 0 }}>
          <div className="pj-card-h"><span className="t">Expedited-reporting clock</span><span className="s">By region</span></div>
          <div className="pj-card-b">
            <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>Event type<select className="c2c-input" style={{ height: 30 }} value={dl.eventType} onChange={(e) => setDl({ ...dl, eventType: e.target.value })}>{EVENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label style={{ fontSize: 12 }}>Seriousness<select className="c2c-input" style={{ height: 30 }} value={dl.seriousnessCriteria} onChange={(e) => setDl({ ...dl, seriousnessCriteria: e.target.value })}>{SERIOUSNESS.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
              <label style={{ fontSize: 12 }}>Region<select className="c2c-input" style={{ height: 30 }} value={dl.region} onChange={(e) => setDl({ ...dl, region: e.target.value })}>{REGIONS.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}</select></label>
            </div>
            <button className="btn primary" style={{ height: 32 }} onClick={runDeadline} disabled={dlBusy}>{I.clock} {dlBusy ? 'Calculating…' : 'Calculate deadline'}</button>
            {dlRes && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div><span className={'rd-chip tone-' + (dlRes.expeditedReport ? 'warn' : 'ok')}>{dlRes.expeditedReport ? 'Expedited report required' : 'Not expedited'}</span></div>
                <div style={{ marginTop: 6 }}>Due <b>{new Date(dlRes.deadline).toLocaleDateString()}</b> · {dlRes.daysRemaining} day(s) remaining</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compliance matrix */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Regional reporting compliance</span><span className="s" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{matrixState === 'ready' ? matrix.length : '—'}{ask && <button className="reg-cta" onClick={() => ask('Explain our expedited and periodic safety reporting obligations by region, and which of them our current compliance matrix shows we are not meeting. Say which regions have no compliance status recorded rather than assuming compliant.')}>{I.sparkles} Explain obligations</button>}</span></div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {matrixState === 'loading' ? <div style={{ padding: 16 }}><EmptyState icon={I.zap} title="Loading compliance matrix…" /></div>
            : matrixState === 'error' ? <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the compliance matrix" hint="Per-region reporting compliance could not be read, so it is unknown, not clear. Sign in to your tenant and retry." /></div>
            : matrix.length === 0 ? <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="No compliance data yet" hint="Per-region adverse-event reporting compliance appears here once events are logged." /></div>
            : <table className="reg-tbl"><thead><tr><th>Region</th><th>Events</th><th>Overdue</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
              {/* A compliance row can arrive with `region` or `complianceStatus` unset — a
                  region with no events yet, or a row written before the status column was
                  backfilled. Both were dereferenced straight into .replace(), so one null
                  column took the whole cockpit down; the row still carries its counts, so
                  render those and leave the absent cell empty rather than assert a status
                  (an unset status is not "non-compliant"). */}
              <tbody>{matrix.map((r, i) => (
                <tr key={r.region ?? i}>
                  <td style={{ fontWeight: 600 }}>{r.region?.replace(/_/g, ' ')}</td><td>{r.totalEvents}</td><td>{r.overdueCount}</td>
                  <td style={{ textAlign: 'right' }}>{r.complianceStatus && <span className={'rd-chip tone-' + (r.complianceStatus === 'compliant' ? 'ok' : 'err')}>{r.complianceStatus.replace(/_/g, ' ')}</span>}</td>
                </tr>))}</tbody></table>}
        </div>
      </div>

      <C2CToast msg={toast} />
    </div>
  );
}
