/**
 * Program Journey — kit app/biopharma-journey.jsx ported
 * (registry id `program-journey`, full-bleed surface).
 *
 * The end-to-end biotech/pharma spine: concept -> submission -> lifecycle.
 * The connective map that ties the ~30 scattered biopharma surfaces into
 * one legible arc for the active program.
 *
 * Segment-aware: biotech -> BX-301 BLA 351(a), pharma -> BX-204 NDA 212345.
 * A persistent intelligence column carries CTD-module readiness, the review
 * clock, predicted HAQs, cross-module contradictions and open blockers --
 * every row routes into the deep surface that owns it.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { getSurfaceMeta } from '../registryModel';
import { SampleTag, useLiveList } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Window globals -- cross-surface data providers ── */
declare global {
  interface Window {
    __C2C_SEGMENT?: string;
  }
}

/* ── Types ── */

interface PjTarget {
  label: string;
  v: string;
  agency: string;
}

interface PjProgram {
  code: string;
  name: string;
  app: string;
  modality: string;
  indication: string;
  pathway: string;
  sponsor: string;
  agency: string;
  readiness: number;
  current: string;
  target: PjTarget;
}

interface PjDeliverable {
  0: string;
  1: number;
}

interface PjInteraction {
  0: string;
  1: string;
  2: string;
}

interface PjStage {
  id: string;
  num: string;
  label: string;
  icon: string;
  gate: string;
  what: string;
  deliv: PjDeliverable[];
  caps: string[];
  interactions: PjInteraction[];
  ana: string;
}

interface PjStageWithOverlay extends PjStage {
  st: string;
  pct: number;
}

interface PjModule {
  m: string;
  label: string;
  pct: number;
  risk: boolean;
}

interface PjClockEntry {
  l: string;
  day: string;
  date: string;
  st: string;
}

interface PjHaq {
  conf: number;
  t: string;
}

interface PjContra {
  t: string;
  tag: string;
  d: string;
}

interface PjBlocker {
  sev: string;
  t: string;
  m: string;
  who: string;
  due: string;
}

/* ── Program identity (segment-aware) ── */

export const PJ_PROGRAMS: Record<string, PjProgram> = {
  biotech: {
    code: 'BX-301', name: '', app: 'BLA · 351(a)',
    modality: 'Biologic (BLA)', indication: 'Relapsed multiple myeloma',
    pathway: 'BLA · 351(a)', sponsor: 'Concept2Cure', agency: 'FDA',
    readiness: 64, current: 'assemble',
    target: { label: 'Filing readiness', v: 'BLA assembly · 64% ready', agency: 'FDA · 351(a)' },
  },
  pharma: {
    code: 'BX-204', name: '', app: 'NDA 212345',
    modality: 'Small molecule · 505(b)(1)', indication: 'Oncology · pivotal ORR 38.6%, OS HR 0.62',
    pathway: 'NDA · 505(b)(1)', sponsor: 'Concept2Cure', agency: 'FDA',
    readiness: 88, current: 'review',
    target: { label: 'PDUFA target action', v: '04 Apr 2027', agency: 'FDA · 41 days out' },
  },
};

/* ── The 9-stage lifecycle ── */

const PJ_STAGES: PjStage[] = [
  { id: 'discovery', num: 'Stage 1', label: 'Discovery & candidate', icon: 'atom',
    gate: 'Target product profile agreed · lead candidate nominated',
    what: 'Candidate selection and the target product profile. AnA scans precedent approvals and the competitive landscape to shape the development and regulatory strategy before any agency contact.',
    deliv: [['Target product profile', 1], ['Candidate nomination package', 1], ['Regulatory strategy memo', 1], ['Competitive & precedent landscape', 1]],
    caps: ['pdev', 'precedent-intelligence', 'deep-research', 'orphan', 'projects'],
    interactions: [['TPP', 'Target product profile locked', 'Q1 -- internal']],
    ana: 'Draft the regulatory strategy memo from the target product profile and closest precedents' },
  { id: 'preind', num: 'Stage 2', label: 'Pre-IND / enabling', icon: 'beaker',
    gate: 'Pre-IND (Type B) meeting · IND-enabling package agreed',
    what: 'IND-enabling GLP toxicology, CMC for the first GMP lots, and the pivotal trial design. The Pre-IND meeting aligns the agency on nonclinical scope, starting dose and the Phase 1 protocol.',
    deliv: [['GLP tox study reports', 1], ['Module 3 -- first GMP lots', 1], ['Pre-IND briefing book', 1], ['Phase 1 protocol & starting dose', 0]],
    caps: ['pdev', 'agency-meetings', 'cmc', 'nonclinical', 'biostatistics', 'pediatric'],
    interactions: [['Type B', 'Pre-IND meeting -- minutes filed', 'Complete'], ['Q-sub', 'Nonclinical scope aligned', 'Complete']],
    ana: 'Assemble the Pre-IND briefing book and pre-empt likely agency questions on starting dose' },
  { id: 'ind', num: 'Stage 3', label: 'IND / CTA active', icon: 'clipboardList',
    gate: '30-day safe-to-proceed · IND maintained (amendments, annual report)',
    what: 'The active IND: initial application, safe-to-proceed clearance, then a living file of protocol amendments, safety reports (SUSAR 7/15-day) and the annual report. Forms 1571/1572/3674 stay current.',
    deliv: [['IND initial (Forms 1571/1572/3674)', 1], ['Safe-to-proceed clearance', 1], ['Protocol amendments', 1], ['Annual report / DSUR', 0]],
    caps: ['ind-checklist', 'document-authoring', 'agency-meetings', 'safety-narrative'],
    interactions: [['IND', 'Safe-to-proceed (day 30)', 'Complete'], ['Amend', 'Protocol amendment 04 -- active', 'Drafting'], ['Safety', 'SUSAR 7-day form', 'Open']],
    ana: 'Run the IND amendment readiness check and draft the next annual report from study status' },
  { id: 'clinical', num: 'Stage 4', label: 'Clinical development', icon: 'sigma',
    gate: 'End-of-Phase-2 meeting · pivotal readout · DSMB clearances',
    what: 'Phase 1->3 execution: dose-finding, the pivotal trial, risk-based monitoring and interim DSMB reviews. The End-of-Phase-2 meeting fixes the pivotal design and endpoints that the whole submission will rest on.',
    deliv: [['Phase 1/2 CSRs', 1], ['EOP2 meeting alignment', 1], ['Pivotal trial -- enrolled', 1], ['Pivotal topline & CSR', 0]],
    caps: ['rbm', 'clinical-ops', 'biostatistics', 'csr-workflow', 'protocol-dev', 'safety-narrative'],
    interactions: [['Type B', 'End-of-Phase-2 meeting', 'Complete'], ['DSMB', 'Interim review 3 -- continue', 'Complete'], ['Pivotal', 'BX204-301 · database lock', 'Upcoming']],
    ana: 'Summarize pivotal readiness -- enrollment, DSMB history, and the gap to database lock' },
  { id: 'presub', num: 'Stage 5', label: 'Pre-submission', icon: 'messageSquare',
    gate: 'Pre-NDA / Pre-BLA meeting · filing plan & format agreed',
    what: 'The Pre-NDA/Pre-BLA meeting: agree the content, format and review division expectations, confirm the dataset package and any rolling-review plan, and lock the submission timeline and the orchestration gates before assembly begins.',
    deliv: [['Pre-NDA/BLA briefing book', 1], ['Filing plan & timeline', 1], ['Dataset package plan (define.xml, ADRG)', 0], ['Rolling review agreement', 0]],
    caps: ['agency-meetings', 'nda-cockpit', 'dossier', 'orchestration'],
    interactions: [['Type B', 'Pre-BLA meeting -- questions filed', 'Drafting'], ['Plan', 'Rolling review -- CMC first', 'Upcoming']],
    ana: 'Build the Pre-BLA briefing book and the filing readiness plan with the day-74 risk view' },
  { id: 'assemble', num: 'Stage 6', label: 'Submission assembly', icon: 'gitBranch',
    gate: 'CTD Module 1--5 complete · eValidator pass · publish-ready',
    what: 'Assemble the application: CTD Modules 1--5, the Module 1 administrative set (Form 356h), prescribing information, then format -> assemble -> validate the eCTD backbone. This is where readiness, contradictions and blockers must all clear.',
    deliv: [['Module 2 CTD summaries', 0], ['Module 3 CMC -- comparability closed', 0], ['Prescribing information (PLLR · SPL)', 0], ['eCTD backbone validated', 0]],
    caps: ['nda-cockpit', 'dossier', 'ectd-coauthor', 'cmc', 'nonclinical', 'labeling-pi', 'submission-center'],
    interactions: [['Assemble', 'eCTD backbone -- 84% mapped', 'Active'], ['Validate', 'eValidator -- 1 define.xml error', 'Open']],
    ana: 'Run the filing readiness diagnostic across Modules 1--5 and stage the eCTD backbone' },
  { id: 'review', num: 'Stage 7', label: 'Agency review & HAQ', icon: 'globe',
    gate: 'Day-74 filing / RTF · mid- & late-cycle · AdComm · action date',
    what: 'Post-submission review: the day-74 filing decision (Refuse-to-File risk), information requests / HAQs, mid- and late-cycle communications, a possible advisory committee, and the PDUFA action date. AnA pre-drafts responses from prior submissions.',
    deliv: [['Filing decision (day 74 / RTF)', 0], ['Information request responses', 0], ['Advisory committee package', 0], ['Action letter', 0]],
    caps: ['submission-center', 'haq-manager', 'nda-cockpit', 'labeling-pi'],
    interactions: [['Filing', 'Day-74 filing review', 'Upcoming'], ['HAQ', '3 predicted -- pre-draftable', 'Predicted'], ['AdComm', 'If convened (~day 270)', 'Upcoming']],
    ana: 'Pre-draft responses to the 3 predicted HAQs anchored on the locked CSR and prior submissions' },
  { id: 'approval', num: 'Stage 8', label: 'Approval & launch', icon: 'rocket',
    gate: 'Action letter · labeling negotiation closed · registration active',
    what: 'Approval and market entry: end-of-review labeling negotiation (sponsor vs FDA redline), the final prescribing information, registration/market-authorization status across markets, and the coding & coverage strategy that bridges to commercial.',
    deliv: [['Final prescribing information', 0], ['Labeling negotiation closed', 0], ['Registration / MA active', 0], ['Coding & coverage strategy', 0]],
    caps: ['registrations', 'labeling-pi', 'market-access', 'orphan'],
    interactions: [['Label', 'End-of-review labeling redline', 'Upcoming'], ['Reg', 'US registration activation', 'Upcoming']],
    ana: 'Draft the labeling negotiation position and map the multi-market registration sequence' },
  { id: 'lifecycle', num: 'Stage 9', label: 'Lifecycle & PV', icon: 'history',
    gate: 'PSUR/PADER on schedule · variations/supplements · renewals',
    what: 'Post-approval lifecycle: periodic safety reports (PSUR/PADER), signal management, CMC and labeling variations/supplements with change-impact determinations, regulatory-change horizon scanning, and market-authorization renewals.',
    deliv: [['PSUR / PADER schedule', 0], ['Signal management & RMP', 0], ['Variations / supplements', 0], ['MA renewals', 0]],
    caps: ['pharmacovigilance', 'lifecycle-mgmt', 'reg-change', 'change-assessment', 'registrations', 'pediatric'],
    interactions: [['PV', 'First PSUR -- data lock point', 'Upcoming'], ['Var', 'Post-approval CMC change', 'Upcoming']],
    ana: 'Set up the PSUR schedule and assess the impact of the next planned CMC change' },
];

/* Per-program status + pct overlay per stage id */

const PJ_OVERLAY: Record<string, Record<string, [string, number]>> = {
  biotech: {
    discovery: ['done', 100], preind: ['done', 100], ind: ['done', 96], clinical: ['done', 88],
    presub: ['done', 80], assemble: ['active', 64], review: ['upcoming', 0],
    approval: ['upcoming', 0], lifecycle: ['upcoming', 0],
  },
  pharma: {
    discovery: ['done', 100], preind: ['done', 100], ind: ['done', 100], clinical: ['done', 100],
    presub: ['done', 100], assemble: ['done', 95], review: ['active', 60],
    approval: ['upcoming', 0], lifecycle: ['upcoming', 0],
  },
};

/* CTD Module 1--5 readiness (intelligence column) */

const PJ_MODULES: Record<string, PjModule[]> = {
  biotech: [
    { m: '1', label: 'Administrative', pct: 92, risk: false },
    { m: '2', label: 'Summaries', pct: 68, risk: true },
    { m: '3', label: 'CMC', pct: 71, risk: true },
    { m: '4', label: 'Nonclinical', pct: 84, risk: false },
    { m: '5', label: 'Clinical', pct: 48, risk: true },
  ],
  pharma: [
    { m: '1', label: 'Administrative', pct: 95, risk: false },
    { m: '2', label: 'CTD summaries', pct: 81, risk: false },
    { m: '3', label: 'CMC', pct: 88, risk: false },
    { m: '4', label: 'Nonclinical reports', pct: 100, risk: false },
    { m: '5', label: 'Clinical reports', pct: 74, risk: true },
  ],
};

/* Review clock (intelligence column) */

const PJ_CLOCK: Record<string, PjClockEntry[]> = {
  biotech: [
    { l: 'BLA assembly', day: '--', date: '64% ready', st: 'current' },
    { l: 'Pre-BLA meeting', day: '--', date: 'planned', st: 'upcoming' },
    { l: 'BLA submission', day: '--', date: 'planned', st: 'upcoming' },
    { l: 'CHMP advice · pediatric PIP-301', day: '--', date: 'Q3 2026', st: 'upcoming' },
    { l: 'PDUFA goal date', day: '--', date: 'on filing', st: 'upcoming' },
  ],
  pharma: [
    { l: 'NDA submission filed', day: 'Day 0', date: '04 Jun 2026', st: 'done' },
    { l: 'Filing decision', day: 'Day 74', date: '17 Aug 2026', st: 'done' },
    { l: 'Day-120 safety update', day: 'Day 120', date: '02 Oct 2026', st: 'done' },
    { l: 'Mid-cycle communication', day: '--', date: '15 Dec 2026', st: 'done' },
    { l: 'PDUFA goal date', day: '--', date: '04 Apr 2027', st: 'current' },
  ],
};

/* Predicted HAQs */

const PJ_HAQS: Record<string, PjHaq[]> = {
  biotech: [
    { conf: 91, t: 'Pediatric: rationale for the 12--17 age-range exclusion in the pivotal (PRED-PED-01)' },
    { conf: 86, t: 'CMC: comparability protocol for the forthcoming DS supplier change (PRED-CMC-01)' },
    { conf: 72, t: 'Statistical: handling of subjects switching arms in BX204-301 (PRED-STAT-01)' },
  ],
  pharma: [
    { conf: 91, t: 'Pediatric: rationale for the 12--17 age-range exclusion in the pivotal (PRED-PED-01)' },
    { conf: 86, t: 'CMC: comparability protocol for the forthcoming DS supplier change (PRED-CMC-01)' },
    { conf: 72, t: 'Statistical: handling of subjects switching arms in BX204-301 (PRED-STAT-01)' },
  ],
};

/* Cross-module contradiction */

const PJ_CONTRA: Record<string, PjContra> = {
  biotech: { t: 'Stability prediction conflict', tag: 'warn · blocks promotion',
    d: 'Module 3.2.P.8 cites a 24-month shelf life; Phase II protocol BX115-202 assumes an 18-month supply window. (M3 §3.2.P.8.3 · Protocol BX115-202 §6.4)' },
  pharma: { t: 'Exposure-response narrative', tag: 'err · blocks promotion',
    d: 'Module 2.7.2 PK/PD discussion uses the pre-amendment dose; Module 2.5 efficacy section cites post-amendment exposure. (M2 §2.5.4 · M2 §2.7.2)' },
};

/* Open blockers */

const PJ_BLOCKERS: Record<string, PjBlocker[]> = {
  biotech: [
    { sev: 'high', t: 'Drug substance stability -- 24-month projection', m: 'M3 §3.2.S.7.3', who: 'AR', due: 'Day 9 of 14' },
    { sev: 'med', t: 'Statistical analysis plan -- interim dataset cut', m: 'M5 §5.3.5.1', who: 'BK', due: '2 days' },
    { sev: 'med', t: 'Pediatric assessment waiver justification', m: 'M1 §1.9', who: 'TP', due: 'Next Thu' },
  ],
  pharma: [
    { sev: 'high', t: 'Drug substance stability -- 24-month projection', m: 'M3 §3.2.S.7.3', who: 'AR', due: 'Day 9 of 14' },
    { sev: 'med', t: 'Statistical analysis plan -- interim dataset cut', m: 'M5 §5.3.5.1', who: 'BK', due: '2 days' },
    { sev: 'med', t: 'Pediatric assessment waiver justification', m: 'M1 §1.9', who: 'TP', due: 'Next Thu' },
  ],
};

/* ── Per-program instance record (the live read contract) ──
   One program-journey INSTANCE = the program identity plus the per-program
   status carried by the segment-keyed maps above (overlay, modules, clock,
   haqs, contra, blockers). The 9-stage lifecycle catalog (PJ_STAGES) stays
   definitional and is NOT part of the record. GET /api/program-journey returns
   exactly these keys per program; the surface adopts a segment's record when
   the live shape matches, else keeps the fixture. */

interface PjRecord extends PjProgram {
  seg: string;
  overlay: Record<string, [string, number]>;
  modules: PjModule[];
  clock: PjClockEntry[];
  haqs: PjHaq[];
  contra: PjContra;
  blockers: PjBlocker[];
}

const PJ_FIXTURE: PjRecord[] = (['biotech', 'pharma'] as const).map((s) => ({
  seg: s,
  ...PJ_PROGRAMS[s],
  overlay: PJ_OVERLAY[s],
  modules: PJ_MODULES[s],
  clock: PJ_CLOCK[s],
  haqs: PJ_HAQS[s],
  contra: PJ_CONTRA[s],
  blockers: PJ_BLOCKERS[s],
}));

/* ── Readiness ring ── */

function Ring({ pct }: { pct: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  const tone = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent-100)' : 'var(--warning)';
  return (
    <div className="pj-ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--bg-200)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="pj-ring-v"><b>{pct}%</b><span>ready</span></div>
    </div>
  );
}

/* ════ Program Journey surface ════ */

export function BiopharmaJourney({ onAsk, onNav }: SurfaceViewProps) {
  const getSeg = (): string => {
    const s = (typeof window !== 'undefined' && window.__C2C_SEGMENT) || 'biotech';
    return s === 'pharma' ? 'pharma' : 'biotech';
  };

  const [seg, setSegState] = useState(getSeg());

  /* live ?? fixture — adopt the org's seeded program-journey instance per
     segment when the store returns the full record shape (identity + overlay +
     the nested status arrays), else keep the codebase fixture so the spine is
     never empty. Never fabricates. Only seeded segments go live; the pill is
     truthful for the active segment. */
  const live = useLiveList<PjRecord>('/api/program-journey', PJ_FIXTURE);
  const bySeg: Record<string, PjRecord> = {};
  for (const r of PJ_FIXTURE) bySeg[r.seg] = r;
  if (!live.sample) for (const r of live.data) bySeg[r.seg] = r;
  const segIsLive = !live.sample && live.data.some((r) => r.seg === seg);

  const rec = bySeg[seg] ?? bySeg.biotech;
  const prog = rec;
  const overlay = rec.overlay;
  const stages: PjStageWithOverlay[] = PJ_STAGES.map((s) => {
    const ov = overlay[s.id] ?? PJ_OVERLAY[seg]?.[s.id] ?? ['upcoming', 0];
    return { ...s, st: ov[0], pct: ov[1] };
  });
  const [sel, setSel] = useState(rec.current);
  const stage = stages.find((s) => s.id === sel) || stages[0];
  const ask = onAsk;
  const open = (id: string) => {
    try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* noop */ }
    onNav(id);
  };

  const mods = rec.modules;
  const clock = rec.clock;
  const haqs = rec.haqs;
  const contra = rec.contra;
  const blockers = rec.blockers;
  const doneCount = stages.filter((s) => s.st === 'done').length;

  const setSeg = (v: string) => {
    try { (window as any).__C2C_SEGMENT = v; } catch (_e) { /* noop */ }
    setSegState(v);
    setSel((bySeg[v] ?? PJ_PROGRAMS[v]).current);
  };

  return (
    <div className="pj">
      <div className="pj-head">
        <div>
          <div className="pj-eyebrow">{seg === 'pharma' ? 'Pharma' : 'Biotech'} {I.dot} program lifecycle <SampleTag sample={!segIsLive} /></div>
          <h1 className="pj-title">Program journey -- concept to submission</h1>
          <p className="pj-intro">The end-to-end regulatory arc for {prog.code}, from candidate selection to approval and lifecycle. Each stage carries its agency gate, deliverables and the tools that serve it -- and every intelligence signal routes into the surface that owns it.</p>
        </div>
        <div className="pj-switch">
          <button className="pj-seg" data-on={seg === 'biotech' || undefined} onClick={() => setSeg('biotech')}>{I.atom} Biotech {I.dot} BLA</button>
          <button className="pj-seg" data-on={seg === 'pharma' || undefined} onClick={() => setSeg('pharma')}>{I.beaker} Pharma {I.dot} NDA</button>
        </div>
      </div>

      {/* Program identity */}
      <div className="pj-prog">
        <div>
          <div className="pj-prog-code">
            <span className="code">{prog.code}</span>
            <span className="name">{prog.name}</span>
            <span className="app">{prog.app}</span>
          </div>
          <div className="pj-prog-meta">
            <span><b>Modality</b> {I.dot} {prog.modality}</span>
            <span><b>Indication</b> {I.dot} {prog.indication}</span>
          </div>
          <div className="pj-prog-meta" style={{ marginTop: 5 }}>
            <span><b>Pathway</b> {I.dot} {prog.pathway}</span>
            <span><b>Sponsor</b> {I.dot} {prog.sponsor}</span>
            <span><b>Progress</b> {I.dot} {doneCount} of 9 stages complete</span>
          </div>
        </div>
        <div className="pj-prog-right">
          <div className="pj-target">
            <div className="l">{prog.target.label}</div>
            <div className="v">{prog.target.v}</div>
            <div className="agency">{prog.target.agency}</div>
          </div>
          <Ring pct={prog.readiness} />
        </div>
      </div>

      {/* Stage spine */}
      <div className="pj-spine">
        {stages.map((s) => (
          <div key={s.id} className="pj-stage" data-st={s.st} data-sel={sel === s.id || undefined}>
            <div className="pj-stage-rail">
              <button className="pj-stage-dot" onClick={() => setSel(s.id)} title={s.label}>
                {s.st === 'done' ? I.check : (I[s.icon] || I.grid)}
              </button>
              <div className="pj-stage-line" />
            </div>
            <button className="pj-stage-btn" onClick={() => setSel(s.id)}>
              <div className="pj-stage-num">{s.num}</div>
              <div className="pj-stage-lbl">{s.label}</div>
              <div className="pj-stage-bar"><span style={{ width: s.pct + '%' }} /></div>
            </button>
          </div>
        ))}
      </div>

      <div className="pj-body">
        {/* Selected stage detail */}
        <div className="pj-card">
          <div className="pj-card-b">
            <div className="pj-detail-top">
              <div>
                <div className="pj-detail-eye">{stage.num} {I.dot} {prog.agency} gate</div>
                <h2 className="pj-detail-t">{stage.label}</h2>
              </div>
              <span className="pj-chip pj-detail-st" data-t={stage.st}>{stage.st === 'active' ? 'In progress' : stage.st === 'done' ? 'Complete' : 'Upcoming'} {I.dot} {stage.pct}%</span>
            </div>

            <div className="pj-gate">
              <span className="ico">{I.shieldCheck}</span>
              <div><div className="l">Stage gate</div><div className="v">{stage.gate}</div></div>
            </div>

            <p className="pj-what">{stage.what}</p>

            <div className="pj-seclbl">Key deliverables</div>
            <div className="pj-deliv">
              {stage.deliv.map((d, i) => (
                <div key={i} className="pj-deliv-row" data-done={d[1] ? true : undefined}>
                  <span className="dot">{d[1] ? I.checkCircle : I.clock}</span>{d[0]}
                </div>
              ))}
            </div>

            <div className="pj-seclbl">Capabilities that serve this stage</div>
            <div className="pj-caps">
              {stage.caps.map((id) => {
                const m = getSurfaceMeta(id);
                return (
                  <button key={id} className="pj-cap" onClick={() => open(id)} title={(m as any).notes || m.label}>
                    {I[(m as any).icon] || I.grid}<span>{m.label}</span><span className="go">{I.right}</span>
                  </button>
                );
              })}
            </div>

            <div className="pj-seclbl">Agency interactions</div>
            <div className="pj-interact">
              {stage.interactions.map((x, i) => (
                <button key={i} className="pj-int" onClick={() => open('agency-meetings')}>
                  <span className="pj-int-kind">{x[0]}</span>
                  <div className="pj-int-b"><div className="pj-int-t">{x[1]}</div></div>
                  <span className="pj-chip" data-t={x[2] === 'Complete' ? 'done' : x[2] === 'Upcoming' ? 'upcoming' : 'active'}>{x[2]}</span>
                </button>
              ))}
            </div>

            <button className="pj-ana" onClick={() => ask(stage.ana)}>{I.sparkles} {stage.ana}</button>
          </div>
        </div>

        {/* Intelligence column */}
        <div className="pj-intel">
          <div className="pj-card">
            <div className="pj-card-h"><span className="t">CTD readiness</span><button className="pj-card-h-go" onClick={() => open('nda-cockpit')} style={{ fontSize: 11, color: 'var(--accent-200)' }}>Open cockpit {I.right}</button></div>
            <div className="pj-card-b">
              <div className="pj-mods">
                {mods.map((m) => (
                  <button key={m.m} className="pj-mod" onClick={() => open('nda-cockpit')}>
                    <span className="pj-mod-n">M{m.m}</span>
                    <span className="pj-mod-b">
                      <span className="pj-mod-l">{m.label}</span>
                      <span className="pj-mod-track"><span className="pj-mod-fill" data-risk={m.risk || undefined} style={{ width: m.pct + '%' }} /></span>
                    </span>
                    <span className="pj-mod-pct">{m.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Review clock</span><span className="s">{prog.agency}</span></div>
            <div className="pj-card-b">
              <div className="pj-clock">
                {clock.map((c, i) => (
                  <div key={i} className="pj-ck" data-st={c.st}>
                    <div className="pj-ck-rail"><div className="pj-ck-dot" /><div className="pj-ck-line" /></div>
                    <div className="pj-ck-b">
                      <div className="pj-ck-top"><span className="pj-ck-l">{c.l}</span><span className="pj-ck-day">{c.day}</span></div>
                      <div className="pj-ck-date">{c.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Predicted HAQs</span><button onClick={() => open('haq-manager')} style={{ fontSize: 11, color: 'var(--ai)' }}>Pre-draft {I.right}</button></div>
            <div className="pj-card-b">
              <div className="pj-haq">
                {haqs.map((h, i) => (
                  <button key={i} className="pj-haq-row" onClick={() => ask(`Pre-draft a response to the predicted HAQ: ${h.t}`)}>
                    <span className="pj-haq-conf">{h.conf}%</span>
                    <span className="pj-haq-t">{h.t}</span>
                    <span className="pj-haq-go">{I.sparkles}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Cross-module contradiction</span></div>
            <div className="pj-card-b">
              <div className="pj-con">
                <span className="ico">{I.alertTriangle}</span>
                <div>
                  <div className="pj-con-t">{contra.t}</div>
                  <div className="pj-con-d">{contra.d}</div>
                  <span className="pj-con-tag">{contra.tag}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pj-card">
            <div className="pj-card-h"><span className="t">Open blockers</span><span className="s">{blockers.length} {I.dot} day-74 RTF risk</span></div>
            <div className="pj-card-b">
              <div className="pj-blk">
                {blockers.map((b, i) => (
                  <div key={i} className="pj-blk-row">
                    <span className="pj-sev" data-s={b.sev}>{b.sev}</span>
                    <div className="pj-blk-b"><div className="pj-blk-t">{b.t}</div><div className="pj-blk-m">{b.m} {I.dot} {b.who}</div></div>
                    <span className="pj-blk-due">{b.due}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
