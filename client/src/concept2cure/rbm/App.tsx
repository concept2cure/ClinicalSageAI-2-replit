/**
 * RbmApp — Risk-Based Monitoring (RBM / RBQM) workstream shell.
 *
 * ICH E6(R3) + E8(R1) conduct layer: Risk Assessment (RACT / CtQ), KRIs, QTLs,
 * central-monitoring signals, per-site risk, and the monitoring plan. Every
 * surface renders live data via the useRbm hooks against /api/mdx/rbm-* — no
 * demo arrays.
 *
 * NOTE: This is a functional scaffold. The visual/UX design (shell chrome to
 * match the risk/labeling domain shells, the RACT matrix, KRI trend charts,
 * the AnA dock) is handed to the design team — see docs/rbm/RBM_DESIGN_SOW.md.
 * The data layer, routes, scoring engine and AnA tools underneath are complete.
 *
 * @module client/src/concept2cure/rbm/App
 */

import * as React from 'react';
import { useProjects } from '../hooks/useProjects';
import {
  useRbmSummary, useRbmItems, useRbmKris, useRbmQtls, useRbmSignals,
  useRbmSiteRisk, useRbmPlans, useRbmSiteOversight, useRbmPatientProfiles,
  useRbmReport, useRbmAttention,
  useSeedRbmAssessment, useSeedRbmKris, useSeedRbmQtls, useRecomputeSiteRisk,
  useRunCentralMonitoring, useScoreRbmPatients,
} from '../hooks/useRbm';
import {
  RBM_NAV, HERE_LABEL_RBM, RBM_CATEGORY_LABEL, RBM_ITEM_STATUS_LABEL,
  RBM_TIER_LABEL, RBM_KRI_STATUS_LABEL, RBM_QTL_STATUS_LABEL, RBM_SEVERITY_LABEL,
  rbmBand,
} from './data/nav';

export interface RbmAppProps {
  activeProjectId?: string;
  initialNav?: string;
}

type Tone = 'ok' | 'warn' | 'err' | 'dim';
const TONE_COLOR: Record<Tone, string> = {
  ok: '#3f7d4e', warn: '#b9770e', err: '#b23b3b', dim: 'var(--text-400, #777)',
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 999, fontSize: 12, fontWeight: 600,
      color: TONE_COLOR[tone], border: `1px solid ${TONE_COLOR[tone]}`, background: 'transparent',
    }}>{children}</span>
  );
}

function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: Tone }) {
  return (
    <div style={{
      border: '1px solid var(--border, #e6e2d8)', borderRadius: 12, padding: 16,
      background: 'var(--bg-000, #fff)', minWidth: 150, flex: '1 1 150px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-400, #777)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: tone ? TONE_COLOR[tone] : 'var(--text-100, #222)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-400, #777)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 12, color: 'var(--text-400, #777)', borderBottom: '1px solid var(--border, #e6e2d8)', fontWeight: 600 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--text-100, #222)', borderBottom: '1px solid var(--border-100, #f0ede4)', verticalAlign: 'top' }}>{children}</td>;
}

function StateRow({ children }: { children: React.ReactNode }) {
  return <div role="status" style={{ padding: 24, color: 'var(--text-400, #777)', fontSize: 14 }}>{children}</div>;
}

function bandTone(band: 'low' | 'medium' | 'high'): Tone {
  return band === 'high' ? 'err' : band === 'medium' ? 'warn' : 'ok';
}
function kriTone(s: string): Tone { return s === 'red' ? 'err' : s === 'amber' ? 'warn' : 'ok'; }
function qtlTone(s: string): Tone { return s === 'breached' ? 'err' : s === 'approaching' ? 'warn' : 'ok'; }
function sevTone(s: string): Tone { return s === 'critical' || s === 'high' ? 'err' : s === 'medium' ? 'warn' : 'dim'; }
function tierTone(t: string): Tone { return t === 'enhanced' ? 'err' : t === 'standard' ? 'warn' : 'ok'; }

const ACCENT = 'var(--accent, #d97757)';

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        padding: '8px 14px', borderRadius: 8, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, opacity: disabled ? 0.6 : 1,
      }}>{children}</button>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────────

function Overview({ programId }: { programId: string | null }) {
  const { data: s, isLoading, isError } = useRbmSummary(programId);
  if (!programId) return <StateRow>Select a study to load its risk-based monitoring posture.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (isError || !s) return <StateRow>No assessment yet. Open Risk assessment (RACT) to seed one.</StateRow>;
  const overallTone = s.overallRisk ? bandTone(s.overallRisk) : 'dim';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatTile label="Overall study risk" value={s.overallRisk ? s.overallRisk.toUpperCase() : '—'} tone={overallTone} />
        <StatTile label="Critical CtQ factors" value={s.riskItems.critical} sub={`${s.riskItems.open} open of ${s.riskItems.total}`} />
        <StatTile label="KRIs red / amber" value={`${s.kris.red} / ${s.kris.amber}`} sub={`${s.kris.total} tracked`} tone={s.kris.red > 0 ? 'err' : s.kris.amber > 0 ? 'warn' : 'ok'} />
        <StatTile label="QTLs breached" value={s.qtls.breached} sub={`${s.qtls.approaching} approaching`} tone={s.qtls.breached > 0 ? 'err' : s.qtls.approaching > 0 ? 'warn' : 'ok'} />
        <StatTile label="Open signals" value={s.signals.open} sub={`${s.signals.high} high severity`} tone={s.signals.high > 0 ? 'err' : 'dim'} />
        <StatTile label="Enhanced-tier sites" value={s.sites.enhanced} sub={`${s.sites.total} sites scored`} tone={s.sites.enhanced > 0 ? 'warn' : 'ok'} />
      </div>
    </div>
  );
}

function Ract({ programId }: { programId: string | null }) {
  const { data: items = [], isLoading } = useRbmItems(programId);
  const seed = useSeedRbmAssessment(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (items.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
        <StateRow>No risk assessment yet. Seed a default ICH E6(R3) RACT to start.</StateRow>
        <div><PrimaryBtn onClick={() => seed.mutate({})} disabled={seed.isPending}>{seed.isPending ? 'Seeding…' : 'Seed default RACT'}</PrimaryBtn></div>
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Critical-to-quality factor</Th><Th>Category</Th><Th>L × I</Th><Th>Score</Th><Th>Critical</Th><Th>Status</Th></tr></thead>
      <tbody>
        {items.map((it) => {
          const band = rbmBand(it.risk_score);
          return (
            <tr key={it.id}>
              <Td><div style={{ fontWeight: 600 }}>{it.ctq_factor}</div>{it.risk_description && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{it.risk_description}</div>}</Td>
              <Td>{RBM_CATEGORY_LABEL[it.category] ?? it.category}</Td>
              <Td>{it.likelihood} × {it.impact}</Td>
              <Td><Chip tone={bandTone(band)}>{it.risk_score ?? '—'} · {band}</Chip></Td>
              <Td>{it.is_critical ? <Chip tone="err">Critical</Chip> : '—'}</Td>
              <Td>{RBM_ITEM_STATUS_LABEL[it.status] ?? it.status}</Td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Kris({ programId }: { programId: string | null }) {
  const { data: kris = [], isLoading } = useRbmKris(programId);
  const seed = useSeedRbmKris(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (kris.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
        <StateRow>No KRIs defined. Seed the standard KRI library to start central monitoring.</StateRow>
        <div><PrimaryBtn onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? 'Seeding…' : 'Seed standard KRIs'}</PrimaryBtn></div>
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Key risk indicator</Th><Th>Source</Th><Th>Value</Th><Th>Amber / Red</Th><Th>Status</Th></tr></thead>
      <tbody>
        {kris.map((k) => (
          <tr key={k.id}>
            <Td><div style={{ fontWeight: 600 }}>{k.name}</div>{k.metric_definition && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{k.metric_definition}</div>}</Td>
            <Td>{k.data_source}</Td>
            <Td>{k.current_value ?? '—'}{k.unit ? ` ${k.unit}` : ''}</Td>
            <Td>{k.threshold_amber ?? '—'} / {k.threshold_red ?? '—'}</Td>
            <Td><Chip tone={kriTone(k.status)}>{RBM_KRI_STATUS_LABEL[k.status] ?? k.status}</Chip></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Qtls({ programId }: { programId: string | null }) {
  const { data: qtls = [], isLoading } = useRbmQtls(programId);
  const seed = useSeedRbmQtls(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (qtls.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 8 }}>
        <StateRow>No quality tolerance limits defined.</StateRow>
        <div><PrimaryBtn onClick={() => seed.mutate()} disabled={seed.isPending}>{seed.isPending ? 'Seeding…' : 'Seed standard QTLs'}</PrimaryBtn></div>
      </div>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Parameter</Th><Th>Threshold</Th><Th>Secondary limit</Th><Th>Current</Th><Th>Status</Th></tr></thead>
      <tbody>
        {qtls.map((q) => (
          <tr key={q.id}>
            <Td><div style={{ fontWeight: 600 }}>{q.parameter}</div>{q.rationale && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{q.rationale}</div>}</Td>
            <Td>{q.threshold ?? '—'}</Td>
            <Td>{q.secondary_limit ?? '—'}</Td>
            <Td>{q.current_value ?? '—'}</Td>
            <Td><Chip tone={qtlTone(q.status)}>{RBM_QTL_STATUS_LABEL[q.status] ?? q.status}</Chip></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Signals({ programId }: { programId: string | null }) {
  const { data: signals = [], isLoading } = useRbmSignals(programId);
  const runCsm = useRunCentralMonitoring(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  const runBtn = (
    <div><PrimaryBtn onClick={() => runCsm.mutate()} disabled={runCsm.isPending}>{runCsm.isPending ? 'Running…' : 'Run central statistical monitoring'}</PrimaryBtn></div>
  );
  if (isLoading) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{runBtn}<StateRow>Loading…</StateRow></div>;
  if (signals.length === 0) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{runBtn}<StateRow>No central-monitoring signals. Run central statistical monitoring to flag outlier sites, or signals appear as KRIs/QTLs breach.</StateRow></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {runBtn}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Signal</Th><Th>Source</Th><Th>Severity</Th><Th>Status</Th><Th>Detected</Th></tr></thead>
      <tbody>
        {signals.map((sig) => (
          <tr key={sig.id}>
            <Td><div style={{ fontWeight: 600 }}>{sig.title}</div>{sig.detail && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{sig.detail}</div>}</Td>
            <Td>{sig.source}</Td>
            <Td><Chip tone={sevTone(sig.severity)}>{RBM_SEVERITY_LABEL[sig.severity] ?? sig.severity}</Chip></Td>
            <Td>{sig.status}</Td>
            <Td>{sig.detected_at ? new Date(sig.detected_at).toLocaleDateString() : '—'}</Td>
          </tr>
        ))}
      </tbody>
      </table>
    </div>
  );
}

function Sites({ programId }: { programId: string | null }) {
  const { data: sites = [], isLoading } = useRbmSiteRisk(programId);
  const recompute = useRecomputeSiteRisk(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><PrimaryBtn onClick={() => recompute.mutate()} disabled={recompute.isPending}>{recompute.isPending ? 'Recomputing…' : 'Recompute from Site Intelligence'}</PrimaryBtn></div>
      {isLoading ? <StateRow>Loading…</StateRow> : sites.length === 0 ? (
        <StateRow>No site-risk snapshot. Recompute to derive risk tiers from Site Intelligence.</StateRow>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Site</Th><Th>Composite risk</Th><Th>Enrollment</Th><Th>Quality</Th><Th>Operational</Th><Th>Tier</Th><Th>Drivers</Th></tr></thead>
          <tbody>
            {sites.map((st) => (
              <tr key={st.id}>
                <Td><div style={{ fontWeight: 600 }}>{st.site_number ?? st.site_id ?? '—'}</div>{st.site_name && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{st.site_name}</div>}</Td>
                <Td>{st.composite_risk ?? '—'}</Td>
                <Td>{st.enrollment_risk ?? '—'}</Td>
                <Td>{st.quality_risk ?? '—'}</Td>
                <Td>{st.operational_risk ?? '—'}</Td>
                <Td><Chip tone={tierTone(st.monitoring_tier)}>{RBM_TIER_LABEL[st.monitoring_tier] ?? st.monitoring_tier}</Chip></Td>
                <Td>{Array.isArray(st.drivers) && st.drivers.length ? st.drivers.join(', ') : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Plan({ programId }: { programId: string | null }) {
  const { data: plans = [], isLoading } = useRbmPlans(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (plans.length === 0) return <StateRow>No monitoring plan yet. Ask AnA to "generate a risk-based monitoring plan" or create one via the API.</StateRow>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Plan</Th><Th>Strategy</Th><Th>Status</Th></tr></thead>
      <tbody>
        {plans.map((p) => (
          <tr key={p.id}>
            <Td><span style={{ fontWeight: 600 }}>{p.title}</span></Td>
            <Td>{p.strategy}</Td>
            <Td>{p.status}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Oversight({ programId }: { programId: string | null }) {
  const { data: rows = [], isLoading } = useRbmSiteOversight(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (rows.length === 0) return <StateRow>No site oversight yet. Recompute site risk first (Site risk surface).</StateRow>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Site</Th><Th>Composite risk</Th><Th>Tier</Th><Th>Drivers</Th><Th>Open signals</Th><Th>High severity</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.site_id ?? r.site_number ?? Math.random()}>
            <Td><div style={{ fontWeight: 600 }}>{r.site_number ?? r.site_id ?? '—'}</div>{r.site_name && <div style={{ color: 'var(--text-400,#777)', fontSize: 12 }}>{r.site_name}</div>}</Td>
            <Td>{r.composite_risk ?? '—'}</Td>
            <Td><Chip tone={tierTone(r.monitoring_tier)}>{RBM_TIER_LABEL[r.monitoring_tier] ?? r.monitoring_tier}</Chip></Td>
            <Td>{Array.isArray(r.drivers) && r.drivers.length ? r.drivers.join(', ') : '—'}</Td>
            <Td>{r.open_signals}</Td>
            <Td>{r.high_signals > 0 ? <Chip tone="err">{r.high_signals}</Chip> : '0'}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function patientTone(s: string): Tone { return s === 'flagged' ? 'err' : s === 'review' ? 'warn' : 'ok'; }

function Patients({ programId }: { programId: string | null }) {
  const { data: patients = [], isLoading } = useRbmPatientProfiles(programId);
  const score = useScoreRbmPatients(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><PrimaryBtn onClick={() => score.mutate()} disabled={score.isPending}>{score.isPending ? 'Scoring…' : 'Scan cohort for anomalies'}</PrimaryBtn></div>
      {isLoading ? <StateRow>Loading…</StateRow> : patients.length === 0 ? (
        <StateRow>No patient profiles yet. Load subject-level metrics, then scan the cohort for atypical patients.</StateRow>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Subject</Th><Th>Site</Th><Th>Anomaly score</Th><Th>Top dimension</Th><Th>Status</Th></tr></thead>
          <tbody>
            {patients.map((p) => (
              <tr key={p.id}>
                <Td><span style={{ fontWeight: 600 }}>{p.subject_id}</span></Td>
                <Td>{p.site_id ?? '—'}</Td>
                <Td>{p.anomaly_score ?? '—'}</Td>
                <Td>{p.top_dimension ?? '—'}</Td>
                <Td><Chip tone={patientTone(p.status)}>{p.status}</Chip></Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Report({ programId }: { programId: string | null }) {
  const { data, isLoading } = useRbmReport(programId);
  const { data: attention = [] } = useRbmAttention(programId);
  if (!programId) return <StateRow>Select a study.</StateRow>;
  if (isLoading) return <StateRow>Loading…</StateRow>;
  if (!data) return <StateRow>No risk review available yet. Seed an assessment and KRIs first.</StateRow>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {attention.length > 0 && (
        <div style={{ border: '1px solid var(--border,#e6e2d8)', borderRadius: 12, padding: 16, background: 'var(--bg-000,#fff)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Needs attention now ({attention.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {attention.slice(0, 12).map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Chip tone={a.severity === 'critical' || a.severity === 'high' ? 'err' : 'warn'}>{a.severity}</Chip>
                <span>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', border: '1px solid var(--border,#e6e2d8)', borderRadius: 12, padding: 16, background: 'var(--bg-000,#fff)', margin: 0 }}>{data.markdown}</pre>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function RbmApp({ activeProjectId, initialNav = 'overview' }: RbmAppProps) {
  const [activeNav, setActiveNav] = React.useState(initialNav);
  const [projectId, setProjectId] = React.useState<string | null>(() => {
    try { return activeProjectId ?? localStorage.getItem('rbm.projectId'); }
    catch { return activeProjectId ?? null; }
  });

  React.useEffect(() => {
    try { if (projectId) localStorage.setItem('rbm.projectId', projectId); } catch { /* noop */ }
  }, [projectId]);

  const { projects } = useProjects();
  const projectOptions = React.useMemo(
    () => projects.map((p: { id: string; name: string }) => ({ id: p.id, label: p.name })),
    [projects],
  );
  React.useEffect(() => {
    if (!projectId && projectOptions.length > 0) setProjectId(projectOptions[0].id);
  }, [projectId, projectOptions]);

  let surface: React.ReactNode;
  switch (activeNav) {
    case 'report':  surface = <Report programId={projectId} />; break;
    case 'ract':    surface = <Ract programId={projectId} />; break;
    case 'kris':    surface = <Kris programId={projectId} />; break;
    case 'qtls':    surface = <Qtls programId={projectId} />; break;
    case 'signals': surface = <Signals programId={projectId} />; break;
    case 'patients': surface = <Patients programId={projectId} />; break;
    case 'sites':   surface = <Sites programId={projectId} />; break;
    case 'oversight': surface = <Oversight programId={projectId} />; break;
    case 'plan':    surface = <Plan programId={projectId} />; break;
    case 'overview':
    default:        surface = <Overview programId={projectId} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-100, #faf9f5)', color: 'var(--text-100, #222)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border, #e6e2d8)' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Risk-Based Monitoring</div>
          <div style={{ fontSize: 12, color: 'var(--text-400, #777)' }}>{HERE_LABEL_RBM[activeNav]} · ICH E6(R3) / E8(R1)</div>
        </div>
        <label style={{ fontSize: 13 }}>
          <span style={{ color: 'var(--text-400,#777)', marginRight: 8 }}>Study</span>
          <select value={projectId ?? ''} onChange={(e) => setProjectId(e.target.value || null)}
            style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border, #e6e2d8)', background: 'var(--bg-000,#fff)', fontSize: 13 }}>
            <option value="">Select a study…</option>
            {projectOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      </header>

      <nav style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: '1px solid var(--border, #e6e2d8)', flexWrap: 'wrap' }}>
        {RBM_NAV.map((n) => {
          const active = n.id === activeNav;
          return (
            <button key={n.id} type="button" onClick={() => setActiveNav(n.id)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? '#fff' : 'var(--text-100, #222)',
                background: active ? ACCENT : 'transparent',
              }}>{n.label}</button>
          );
        })}
      </nav>

      <main style={{ flex: 1, overflow: 'auto', padding: 20 }}>{surface}</main>
    </div>
  );
}
