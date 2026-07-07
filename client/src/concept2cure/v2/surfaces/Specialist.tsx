/**
 * Specialist tier surfaces (part 1) -- kit app/Specialist.jsx ported.
 *
 * Contains 5 of the file's 7 surfaces:
 *   - Precedent    (registry id `precedent-intelligence`)
 *   - Biostat      (registry id `biostatistics`)
 *   - ReportEngine (registry id `report-engine`)
 *   - SafetyPV     (registry id `safety-narrative`)
 *   - DeepResearch (registry id `deep-research`)
 *
 * The remaining 2 surfaces (Labeling, Risk) are large enough on their own
 * that keeping all 7 in one module would blow well past the 500-line cap,
 * so they live in the sibling module SpecialistLabelingRisk.tsx.
 */
import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import { STATUS_TONE } from '../fixtures/labeling-data';
import '../styles/project-home-v2.css';

/* ── Local fixture data — kit app/specialist-data.jsx globals for the
   Precedent, Biostatistics, Report engine, Safety/PV and Deep research
   surfaces. (Labeling + Risk data already live in fixtures/labeling-data
   and fixtures/risk-data.) ── */

interface PiSavedQuery { q: string; hits: number; agency: string; }
interface PiResult { k: string; name: string; holder: string; decision: string; cycle: number; year: number; match: number; }
interface PiRationale { title: string; pedigree: string; points: string[]; cites: string[]; }

const PI_SAVED: PiSavedQuery[] = [
  { q: 'CGM sensor · 14-day wear', hits: 47, agency: 'FDA' },
  { q: 'IVD cartridge · 14 analytes', hits: 23, agency: 'FDA' },
  { q: 'Implantable cardiac monitor', hits: 182, agency: 'FDA/EMA' },
  { q: 'SaMD Class II · CDS', hits: 419, agency: 'FDA' },
];

const PI_RESULTS: PiResult[] = [
  { k: 'K221847', name: 'Dexcom G7 CGM System', holder: 'Dexcom', decision: 'SE', cycle: 124, year: 2022, match: 94 },
  { k: 'K213163', name: 'FreeStyle Libre 3', holder: 'Abbott', decision: 'SE', cycle: 131, year: 2022, match: 88 },
  { k: 'DEN200051', name: 'Eversense E3 (De Novo)', holder: 'Senseonics', decision: 'Granted', cycle: 198, year: 2022, match: 71 },
  { k: 'K201715', name: 'Guardian Connect', holder: 'Medtronic', decision: 'SE', cycle: 142, year: 2020, match: 66 },
];

const PI_RATIONALE: PiRationale = {
  title: 'K221847 · decision rationale',
  pedigree: 'deterministic_registry',
  points: [
    'Cleared SE on the basis of equivalent intended use and electrochemical enzyme sensing technology.',
    'Additional ISO 10993-11 testing required for extended (10-day) wear — set the precedent for 14-day claims.',
    'Reviewer requested accuracy sub-analysis by age band (7–17 vs ≥18) — recurring across 12 of 14 CGM clearances.',
  ],
  cites: ['K221847 Decision Summary', 'FDA 2023 CGM guidance'],
};

interface BiostatTool { id: string; icon: string; label: string; desc: string; kind: string; }
interface BiostatSap { id: string; study: string; endpoint: string; design: string; status: string; power: string; }

const BIOSTAT_TOOLS: BiostatTool[] = [
  { id: 'sap', icon: 'fileText', label: 'Statistical analysis plan', desc: 'ICH E9(R1) estimand-aligned SAP with endpoints, populations, multiplicity.', kind: 'generate' },
  { id: 'power', icon: 'sigma', label: 'Sample size & power', desc: 'Superiority, non-inferiority, equivalence; parallel/crossover/adaptive.', kind: 'compute' },
  { id: 'tlf', icon: 'barChart', label: 'TLF shells', desc: 'Tables, listings & figures shells mapped to the SAP.', kind: 'generate' },
  { id: 'adaptive', icon: 'workflow', label: 'Adaptive design', desc: 'Group-sequential, sample-size re-estimation, Bayesian borrowing.', kind: 'generate' },
  { id: 'idmc', icon: 'checkCircle', label: 'IDMC / DSMB', desc: 'Charter elements, interim analysis timing, stopping rules.', kind: 'generate' },
];

const BIOSTAT_SAPS: BiostatSap[] = [
  { id: 'SAP-BX204', study: 'BX204-201 · Phase II', endpoint: 'Confirmed ORR (BICR)', design: 'Single-arm', status: 'review', power: '90% @ ORR 25%→38%' },
  { id: 'SAP-CV330', study: 'CV330-PIV · Pivotal', endpoint: 'Sensitivity vs truth std', design: 'Parallel', status: 'draft', power: '94% sensitivity, n=680' },
  { id: 'SAP-IV208', study: 'IV208 · CDx bridging', endpoint: 'PPA / NPA', design: 'Concordance', status: 'approved', power: '95% PPA, 2-sided 95% CI' },
];

interface ReportItem { id: string; title: string; kind: string; sealed: string; by: string; atoms: number; seal: string; status: string; }
interface ReportAtom { id: string; claim: string; conf: number; src: string; }

const REPORTS: ReportItem[] = [
  { id: 'RPT-4471', title: 'Portfolio readiness — June 2026', kind: 'Readiness', sealed: '2026-06-15 09:02', by: 'J. Chen', atoms: 42, seal: 'sha256:9f21…c4', status: 'sealed' },
  { id: 'RPT-4458', title: '510(k) precedent likelihood — BX-204', kind: 'Precedent model', sealed: '2026-06-12 14:30', by: 'AnA · Maximum', atoms: 67, seal: 'sha256:2b80…a1', status: 'sealed' },
  { id: 'RPT-4440', title: 'CRL/RTF risk scan — Q2 cohort', kind: 'Risk', sealed: '2026-06-08 11:15', by: 'AnA · Maximum', atoms: 118, seal: 'sha256:77ce…9d', status: 'sealed' },
  { id: 'RPT-4429', title: 'Timeline forecast — NDA 212345', kind: 'Forecast', sealed: '—', by: 'J. Chen', atoms: 0, seal: 'pending', status: 'draft' },
];

const REPORT_ATOMS: ReportAtom[] = [
  { id: 'atom-1', claim: 'Average first-cycle review for CGM 510(k) is 124 days', conf: 0.94, src: '14 cleared K-numbers (2020–2024)' },
  { id: 'atom-2', claim: '78% of CGM first-rounds cite accuracy-by-age sub-analysis', conf: 0.87, src: 'FDA decision summaries' },
  { id: 'atom-3', claim: 'ISO 10993-11 required for ≥14-day wear', conf: 0.92, src: 'guidance + predicate set' },
];

interface PvSignal { id: string; event: string; source: string; n: number; window: string; state: string; tone: string; }
interface PvNarrative { id: string; subj: string; seriousness: string; status: string; due: string; }

const PV_SIGNALS: PvSignal[] = [
  { id: 'SIG-2241', event: 'Lead dislodgement', source: 'FAERS', n: 3, window: '30d', state: 'investigation', tone: 'warn' },
  { id: 'SIG-2203', event: 'Implant-site infection', source: 'FAERS', n: 14, window: '12mo', state: 'assessed', tone: 'ai' },
  { id: 'SIG-2188', event: 'Battery early depletion', source: 'MAUDE', n: 2, window: '18mo', state: 'capa', tone: 'idle' },
  { id: 'SIG-2174', event: 'Thromboembolic event', source: 'EUDAMED', n: 4, window: '9mo', state: 'reportable', tone: 'err' },
];

const PV_NARRATIVES: PvNarrative[] = [
  { id: 'ICSR-8841', subj: '72M, implant-site infection', seriousness: 'Serious', status: 'draft', due: 'Day 15' },
  { id: 'ICSR-8839', subj: '64F, lead dislodgement', seriousness: 'Serious', status: 'review', due: 'Day 7' },
  { id: 'ICSR-8832', subj: '58M, skin irritation', seriousness: 'Non-serious', status: 'submitted', due: '—' },
];

const PV_STATES = ['detected', 'triage', 'investigation', 'assessed', 'reportable', 'capa', 'closed'];

interface DrJob { id: string; q: string; state: string; model: string; sources: number; started: string; pct: number; }

const DR_JOBS: DrJob[] = [
  { id: 'DR-118', q: 'EU MDR Article 61 literature thresholds across notified bodies', state: 'running', model: 'Maximum', sources: 42, started: '4 min ago', pct: 62 },
  { id: 'DR-114', q: 'CGM 14-day wear — global clearance precedent & required testing', state: 'complete', model: 'Maximum', sources: 88, started: '2 h ago', pct: 100 },
  { id: 'DR-109', q: 'Companion diagnostic co-approval timelines FDA vs EMA', state: 'complete', model: 'Maximum', sources: 54, started: 'yesterday', pct: 100 },
  { id: 'DR-102', q: 'Bayesian borrowing acceptance in PMA pivotal trials', state: 'queued', model: 'Maximum', sources: 0, started: '—', pct: 0 },
];

const DR_STATES: Record<string, string> = { queued: 'idle', running: 'ai', complete: 'ok', failed: 'err' };

/* ── Inline helpers ── */

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function GateRO({ k, v }: { k: string; v: string }) {
  return <div className="gate-cell" style={{ alignItems: 'flex-start' }}><div><div className="gate-k">{k}</div><div className="gate-v mono" style={{ fontSize: 12 }}>{v}</div></div></div>;
}

/* ════ Precedent intelligence ════ */

export function Precedent({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Specialist · intelligence" title="Precedent intelligence"
        sub="Past approvals search and decision rationale across FDA, EMA and PMDA. Feeds 510(k) substantial equivalence."
        actions={<button className="btn ghost" onClick={() => onAsk('Find CGM 14-day wear precedents')}>{I.sparkles} Ask AnA</button>} />
      <div className="split">
        <div className="split-list">
          <div className="dr-seclbl" style={{ padding: '0 0 4px' }}>Saved queries</div>
          {PI_SAVED.map((p, i) => (
            <button key={i} className="lrow"><div className="lrow-title" style={{ fontSize: 12.5 }}>{p.q}</div><div className="lrow-foot"><span className="scaf-tag" style={{ margin: 0 }}>{p.agency}</span><span className="lrow-due">{p.hits} hits</span></div></button>
          ))}
        </div>
        <div className="split-detail">
          <div className="dt-head"><div><div className="dt-eyebrow">Results · CGM 14-day wear</div><h3 className="dt-title">4 strong matches</h3></div></div>
          <div className="tab-body">
            <div className="ctable" style={{ marginBottom: 16 }}>
              <div className="ct-head" style={{ gridTemplateColumns: '90px 1fr 90px 70px 60px' }}><div>K / DEN</div><div>Device</div><div>Decision</div><div>Cycle</div><div>Match</div></div>
              {PI_RESULTS.map((r) => (
                <div key={r.k} className="ct-row" style={{ gridTemplateColumns: '90px 1fr 90px 70px 60px' }}>
                  <div className="mono" style={{ color: 'var(--accent-200)' }}>{r.k}</div>
                  <div><div className="ct-strong">{r.name}</div><div style={{ fontSize: 11, color: 'var(--text-400)' }}>{r.holder} · {r.year}</div></div>
                  <div><span className="rd-chip tone-ok">{r.decision}</span></div>
                  <div className="mono">{r.cycle}d</div><div className="mono">{r.match}%</div>
                </div>
              ))}
            </div>
            <div className="gri-result">
              <div className="gri-result-hdr"><span className="t">{PI_RATIONALE.title}</span><span className="ana-pedigree" data-p={PI_RATIONALE.pedigree}>registry-grounded</span></div>
              <div className="gri-result-body">
                <ul style={{ margin: '0 0 12px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, lineHeight: 1.5, color: 'var(--text-200)' }}>
                  {PI_RATIONALE.points.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                <div className="gri-cite">{PI_RATIONALE.cites.map((c) => <span key={c} className="c">{c}</span>)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ Biostatistics ════ */

export function Biostat({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Specialist · clinical" title="Biostatistics"
        sub="SAP authoring, power analysis, TLF shells, adaptive design and IDMC — ICH E9(R1) estimand-aligned, citation-backed."
        actions={<button className="btn primary" onClick={() => onAsk('Generate a SAP for a single-arm Phase II')}>{I.sparkles} New analysis</button>} />
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Tools</div></div>
        <div className="launch-grid">
          {BIOSTAT_TOOLS.map((t) => (
            <button key={t.id} className="launch" onClick={() => onAsk(`Run ${t.label}`)}>
              <div className="launch-top"><span className="launch-ico">{I[t.icon]}</span><span className={`rd-chip tone-${t.kind === 'compute' ? 'ai' : 'ok'}`}>{t.kind}</span></div>
              <div className="launch-title">{t.label}</div><div className="launch-desc">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="sec">
        <div className="sec-hdr"><div className="sec-title">Active analysis plans</div></div>
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: '120px 1.4fr 1fr 100px 1fr' }}><div>ID</div><div>Study</div><div>Primary endpoint</div><div>Status</div><div>Power</div></div>
          {BIOSTAT_SAPS.map((s) => (
            <div key={s.id} className="ct-row" style={{ gridTemplateColumns: '120px 1.4fr 1fr 100px 1fr' }}>
              <div className="mono" style={{ color: 'var(--accent-200)' }}>{s.id}</div>
              <div className="ct-strong">{s.study}</div><div>{s.endpoint}</div>
              <div><span className={`rd-chip tone-${STATUS_TONE[s.status]}`}>{s.status}</span></div>
              <div style={{ fontSize: 11, color: 'var(--text-400)' }}>{s.power}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════ Report engine ════ */

export function ReportEngine({ onAsk }: SurfaceViewProps) {
  const [sel, setSel] = useState('RPT-4471');
  useEffect(() => {
    try {
      const rep = REPORTS.find((x) => x.id === sel);
      if ((window as any).C2C && rep) {
        (window as any).C2C.setContext({ entityType: 'report', entityId: rep.id, entityLabel: rep.id + ' — ' + rep.title });
      }
    } catch (_e) { /* noop */ }
  }, [sel]);
  const r = REPORTS.find((x) => x.id === sel) ?? REPORTS[0];
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Specialist · evidence" title="Report engine"
        sub="Immutable report records with a cryptographic seal and provenance atoms. Every figure traces to its source."
        actions={<button className="btn primary">{I.plus} New report</button>} />
      <div className="split">
        <div className="split-list">
          {REPORTS.map((x) => (
            <button key={x.id} className="lrow" data-on={sel === x.id || undefined} onClick={() => setSel(x.id)}>
              <div className="lrow-top"><span className="mono">{x.id}</span><span className={`rd-chip tone-${STATUS_TONE[x.status]}`}>{x.status}</span></div>
              <div className="lrow-title">{x.title}</div>
              <div className="lrow-meta"><span className="scaf-tag" style={{ margin: 0 }}>{x.kind}</span><span>{x.by}</span></div>
            </button>
          ))}
        </div>
        <div className="split-detail">
          <div className="dt-head">
            <div><div className="dt-eyebrow">{r.id} · {r.kind}</div><h3 className="dt-title">{r.title}</h3></div>
            <span className={`rd-chip tone-${STATUS_TONE[r.status]}`}>{r.status}</span>
          </div>
          <div className="tab-body">
            <div className="gate-grid" style={{ marginBottom: 16 }}>
              <GateRO k="Sealed" v={r.sealed} /><GateRO k="Author" v={r.by} />
              <GateRO k="Cryptographic seal" v={r.seal} /><GateRO k="Provenance atoms" v={`${r.atoms} atoms`} />
            </div>
            <div className="dr-seclbl" style={{ marginBottom: 8 }}>Provenance atoms</div>
            {REPORT_ATOMS.map((a) => (
              <div key={a.id} className="mem-atom" style={{ marginBottom: 8 }}>
                <div className="mem-top"><span className="mono mem-id">{a.id}</span><span className="mem-conf">conf {a.conf.toFixed(2)}</span></div>
                <div className="mem-text" style={{ fontSize: 13 }}>{a.claim}</div>
                <div className="mem-src">{a.src}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ Safety narrative / PV ════ */

export function SafetyPV({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Specialist · safety-pv" title="Safety narrative / PV"
        sub="Signal detection, ICSR and SAE narrative generation, and reporting clocks. FAERS / MAUDE / EUDAMED."
        actions={<button className="btn ghost" onClick={() => onAsk('Which signals cross a reporting threshold?')}>{I.sparkles} Ask AnA</button>} />
      <div className="pv-flow">
        {PV_STATES.map((s, i) => (
          <React.Fragment key={s}><span className="pv-state">{s}</span>{i < PV_STATES.length - 1 && <span className="pv-arrow">{I.right}</span>}</React.Fragment>
        ))}
      </div>
      <div className="split2">
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">Signals</div><div className="sec-sub">4 open</div></div>
          <div className="ctable">
            <div className="ct-head" style={{ gridTemplateColumns: '100px 1fr 60px 110px' }}><div>ID</div><div>Event · source</div><div>N</div><div>State</div></div>
            {PV_SIGNALS.map((s) => (
              <div key={s.id} className="ct-row" style={{ gridTemplateColumns: '100px 1fr 60px 110px' }}>
                <div className="mono" style={{ color: 'var(--accent-200)' }}>{s.id}</div>
                <div><div className="ct-strong">{s.event}</div><div style={{ fontSize: 11, color: 'var(--text-400)' }}>{s.source} · {s.window}</div></div>
                <div className="mono">{s.n}</div><div><span className={`rd-chip tone-${s.tone}`}>{s.state}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="sec">
          <div className="sec-hdr"><div className="sec-title">ICSR / narratives</div></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {PV_NARRATIVES.map((n) => (
              <div key={n.id} className="form-row">
                <span className="mono form-id" style={{ minWidth: 80 }}>{n.id}</span>
                <span className="form-l">{n.subj}</span>
                <span className={`rd-chip tone-${n.seriousness === 'Serious' ? 'err' : 'idle'}`}>{n.seriousness}</span>
                <span className={`rd-chip tone-${STATUS_TONE[n.status]}`}>{n.status}</span>
                <span className="lrow-due" style={{ minWidth: 44, textAlign: 'right' }}>{n.due}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════ Deep research ════ */

export function DeepResearch({ onAsk }: SurfaceViewProps) {
  return (
    <div className="page-inner">
      <SampleTag sample={true} />
      <PageHead eyebrow="Specialist · intelligence" title="Deep research"
        sub="Long-running, multi-source research on the Maximum engine. Each job cites its sources and seals a report on completion."
        actions={<button className="btn primary" onClick={() => onAsk('Start a deep research job')}>{I.telescope} New research job</button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DR_JOBS.map((j) => (
          <div key={j.id} className="dr-job">
            <div className="dr-job-top">
              <span className="mono" style={{ color: 'var(--accent-200)' }}>{j.id}</span>
              <span className={`rd-chip tone-${DR_STATES[j.state]}`}>{j.state}</span>
              <span className="tspace" style={{ flex: 1 }} />
              <span className="dr-meta">{j.model} · {j.sources} sources · {j.started}</span>
            </div>
            <div className="dr-q">{j.q}</div>
            <div className="dr-bar"><div className="dr-bar-f" data-state={j.state} style={{ width: j.pct + '%' }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
