/**
 * Pyramid fixture — kit pyramid-data.jsx (BX-204 NDA, engine-derived views).
 *
 * Generated from the kit's window.PY_* globals. The computation helpers
 * (pyProgress, pyNextTasks, pyRiskProfile, pyResources, pyCoverage) mirror
 * the engine's pure functions so the UI works offline behind the Sample pill.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface PyType {
  id: string;
  label: string;
  segment: 'pharma' | 'device' | 'cross-cutting';
  agency: string;
  ctd: string;
  phases: number;
  tasks: number;
  hours: number;
  active?: string;
}

export interface PyPhase {
  id: string;
  name: string;
  order: number;
  weeks: number;
}

export interface PyRisk {
  severity: 'low' | 'medium' | 'high' | 'critical';
  probability: number;
  impact: string;
  mitigations: string[];
}

export interface PyGuidance {
  fda?: string;
  ich?: string;
  cfr?: string;
  keyConsiderations?: string[];
}

export interface PyTask {
  id: string;
  phase: string;
  name: string;
  role: string;
  hours: number;
  deps: string[];
  status: string;
  critical?: boolean;
  guidance?: PyGuidance;
  ctd: string[];
  deliverables?: string[];
  risk?: PyRisk;
}

export interface PyPyramid {
  type: string;
  label: string;
  program: string;
  hours: number;
  phases: PyPhase[];
  tasks: PyTask[];
}

export interface PyGlobalConfig {
  type: string;
  agency: string;
  region: string;
  format: string;
  days: number;
  tasks: number;
  local: string[];
}

export interface PyPhaseProgress {
  total: number;
  completed: number;
  pct: number;
}

export interface PyProgressResult {
  total: number;
  completed: number;
  pct: number;
  perPhase: Record<string, PyPhaseProgress>;
  criticalPathPct: number;
  hoursRemaining: number;
}

export interface PyResourceRow {
  role: string;
  hours: number;
  remaining: number;
  tasks: number;
  overloaded: boolean;
}

export interface PyCoverageRow {
  section: string;
  tasks: string[];
  done: number;
  pct: number;
}

interface ToneMap { l: string; tone: string }

// ── Submission type registry (getSubmissionTypeOptions — grouped) ──────────

export const PY_TYPES: PyType[] = [
  { id: 'NDA', label: 'NDA — New Drug Application', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5', phases: 7, tasks: 31, hours: 2840, active: 'bx204' },
  { id: 'BLA', label: 'BLA — Biologics License Application', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5', phases: 7, tasks: 33, hours: 3120 },
  { id: 'IND', label: 'IND — Investigational New Drug', segment: 'pharma', agency: 'FDA', ctd: 'M1–M5', phases: 8, tasks: 49, hours: 1960 },
  { id: '510K', label: '510(k) — Premarket Notification', segment: 'device', agency: 'FDA', ctd: 'eSTAR', phases: 5, tasks: 25, hours: 940, active: 'or902' },
  { id: 'DE_NOVO', label: 'De Novo — Novel Classification', segment: 'device', agency: 'FDA', ctd: 'eSTAR', phases: 6, tasks: 28, hours: 1180 },
  { id: 'PMA', label: 'PMA — Premarket Approval', segment: 'device', agency: 'FDA', ctd: 'PMA', phases: 6, tasks: 34, hours: 2600 },
  { id: 'MAA', label: 'MAA — Marketing Authorisation (EU)', segment: 'cross-cutting', agency: 'EMA', ctd: 'M1–M5', phases: 7, tasks: 30, hours: 2900 },
  { id: 'JNDA', label: 'JNDA — Japanese New Drug Application', segment: 'cross-cutting', agency: 'PMDA', ctd: 'M1–M5', phases: 7, tasks: 29, hours: 2750 },
];

// ── Role library ──────────────────────────────────────────────────────────

export const PY_ROLES: Record<string, string> = {
  ra_lead: 'RA lead', cmc_writer: 'CMC writer', clinical_ops: 'Clinical ops',
  medical_writer: 'Medical writer', biostat: 'Biostatistician',
  nonclinical: 'Nonclinical', pv_safety: 'PV / safety',
  pub_ops: 'Publishing ops', qa: 'Quality',
};

// ── TaskStatus vocab (5-value) ────────────────────────────────────────────

export const PY_STATUS: Record<string, ToneMap> = {
  todo: { l: 'To do', tone: 'neutral' },
  'in-progress': { l: 'In progress', tone: 'ai' },
  review: { l: 'In review', tone: 'warn' },
  done: { l: 'Done', tone: 'ok' },
  blocked: { l: 'Blocked', tone: 'err' },
};

export const PY_RISK: Record<string, ToneMap> = {
  low: { l: 'Low', tone: 'ok' },
  medium: { l: 'Medium', tone: 'warn' },
  high: { l: 'High', tone: 'err' },
  critical: { l: 'Critical', tone: 'err' },
};

// ── Flagship pyramid: BX-204 NDA ──────────────────────────────────────────

export const PY_PYRAMID: PyPyramid = {
  type: 'NDA', label: 'NDA — New Drug Application', program: 'BX-204 · NDA 212345', hours: 2840,
  phases: [
    { id: 'p1', name: 'Program planning & strategy', order: 1, weeks: 6 },
    { id: 'p2', name: 'Nonclinical (Module 4)', order: 2, weeks: 10 },
    { id: 'p3', name: 'CMC / quality (Module 3)', order: 3, weeks: 16 },
    { id: 'p4', name: 'Clinical (Module 5)', order: 4, weeks: 14 },
    { id: 'p5', name: 'Summaries (Module 2)', order: 5, weeks: 10 },
    { id: 'p6', name: 'Administrative (Module 1)', order: 6, weeks: 6 },
    { id: 'p7', name: 'Assembly, validation & dispatch', order: 7, weeks: 4 },
  ],
  tasks: [
    { id: 't101', phase: 'p1', name: 'Confirm regulatory pathway & pre-NDA strategy', role: 'ra_lead', hours: 40, deps: [], status: 'done', critical: true,
      guidance: { fda: 'Guidance for Industry: Formal Meetings (2017)', cfr: '21 CFR 314.50' }, ctd: [], deliverables: ['Regulatory strategy memo'] },
    { id: 't102', phase: 'p1', name: 'Pre-NDA meeting request & briefing book', role: 'ra_lead', hours: 80, deps: ['t101'], status: 'done', critical: true,
      guidance: { fda: 'PDUFA VII meeting management', keyConsiderations: ['Type B meeting', '60-day lead time'] }, ctd: ['M1.6'], deliverables: ['Meeting request', 'Briefing document'] },
    { id: 't103', phase: 'p1', name: 'Define submission content plan (CTD granularity)', role: 'ra_lead', hours: 56, deps: ['t101'], status: 'done',
      ctd: [], deliverables: ['Content plan', 'eCTD placeholder tree'] },

    { id: 't201', phase: 'p2', name: 'Compile nonclinical study reports (GLP tox/PK)', role: 'nonclinical', hours: 120, deps: ['t103'], status: 'done',
      ctd: ['M4.2.1', 'M4.2.3'], guidance: { ich: 'ICH M3(R2)' }, deliverables: ['9 GLP study reports'] },
    { id: 't202', phase: 'p2', name: 'Author Nonclinical Overview (2.4)', role: 'medical_writer', hours: 64, deps: ['t201'], status: 'in-progress',
      ctd: ['M2.4'], deliverables: ['Nonclinical overview'] },
    { id: 't203', phase: 'p2', name: 'Author Nonclinical Written & Tabulated Summaries (2.6)', role: 'medical_writer', hours: 96, deps: ['t201'], status: 'in-progress', critical: true,
      ctd: ['M2.6'], risk: { severity: 'high', probability: 0.4, impact: 'Carcinogenicity subsection held open pending CARC-701 read; blocks 2.6 sign-off', mitigations: ['Draft with placeholder', 'Escalate CARC-701 read'] }, deliverables: ['2.6.6 written summary', '2.6.7 tabulated summary'] },

    { id: 't301', phase: 'p3', name: 'Drug substance specification & control (3.2.S)', role: 'cmc_writer', hours: 110, deps: ['t103'], status: 'in-progress', critical: true,
      ctd: ['M3.2.S'], guidance: { ich: 'ICH Q6A · Q3A' }, risk: { severity: 'medium', probability: 0.3, impact: 'Impurity control strategy under ICH M7 review', mitigations: ['TTC calculation complete', 'Purge study designed'] }, deliverables: ['3.2.S dossier'] },
    { id: 't302', phase: 'p3', name: 'Drug product manufacture & control (3.2.P)', role: 'cmc_writer', hours: 130, deps: ['t103'], status: 'in-progress', critical: true,
      ctd: ['M3.2.P'], guidance: { ich: 'ICH Q8 · Q14' }, deliverables: ['3.2.P dossier'] },
    { id: 't303', phase: 'p3', name: 'Stability data package & shelf-life justification', role: 'cmc_writer', hours: 88, deps: ['t301', 't302'], status: 'todo', critical: true,
      ctd: ['M3.2.P.8'], guidance: { ich: 'ICH Q1A(R2)' }, risk: { severity: 'high', probability: 0.5, impact: '36-month stability point not yet available; provisional shelf life only', mitigations: ['Provisional 24-month', 'Post-approval commitment'] }, deliverables: ['Stability report'] },
    { id: 't304', phase: 'p3', name: 'Comparability protocol (process change)', role: 'cmc_writer', hours: 60, deps: ['t302'], status: 'blocked',
      ctd: ['M3.2.R'], guidance: { ich: 'ICH Q5E' }, deliverables: ['Comparability protocol'] },
    { id: 't305', phase: 'p3', name: 'Author Quality Overall Summary (2.3)', role: 'medical_writer', hours: 72, deps: ['t301', 't302', 't303'], status: 'todo', critical: true,
      ctd: ['M2.3'], deliverables: ['QOS'] },

    { id: 't401', phase: 'p4', name: 'Lock pivotal dataset & CSR-201', role: 'biostat', hours: 96, deps: ['t103'], status: 'done', critical: true,
      ctd: ['M5.3.5.1'], guidance: { ich: 'ICH E3' }, deliverables: ['Locked CSR-201', 'SDTM/ADaM'] },
    { id: 't402', phase: 'p4', name: 'CDISC conformance & Define-XML (Pinnacle21)', role: 'biostat', hours: 64, deps: ['t401'], status: 'in-progress',
      ctd: ['M5.3.5'], risk: { severity: 'medium', probability: 0.3, impact: '1 SDTM reject (LB units) blocks package', mitigations: ['CT unit mapping', 'Re-validate'] }, deliverables: ['Define-XML', 'Reviewer guide'] },
    { id: 't403', phase: 'p4', name: 'Integrated Summary of Safety (ISS)', role: 'biostat', hours: 120, deps: ['t401'], status: 'todo', critical: true,
      ctd: ['M5.3.5.3'], deliverables: ['ISS'] },
    { id: 't404', phase: 'p4', name: 'Integrated Summary of Efficacy (ISE)', role: 'biostat', hours: 104, deps: ['t401'], status: 'todo', critical: true,
      ctd: ['M5.3.5.3'], deliverables: ['ISE'] },
    { id: 't405', phase: 'p4', name: 'Compile clinical study reports & literature', role: 'medical_writer', hours: 80, deps: ['t401'], status: 'in-progress',
      ctd: ['M5.3', 'M5.4'], deliverables: ['CSR set', 'Literature refs'] },

    { id: 't501', phase: 'p5', name: 'Author Clinical Overview (2.5)', role: 'medical_writer', hours: 96, deps: ['t403', 't404'], status: 'todo', critical: true,
      ctd: ['M2.5'], guidance: { ich: 'ICH M4E(R2)', keyConsiderations: ['Every efficacy claim cites locked CSR-201'] }, risk: { severity: 'high', probability: 0.4, impact: '§2.5.4 ORR claim↔evidence gap (draft cut vs locked dataset)', mitigations: ['Reconcile to CSR-201', 'Contradiction scan'] }, deliverables: ['Clinical overview'] },
    { id: 't502', phase: 'p5', name: 'Author Clinical Summary (2.7)', role: 'medical_writer', hours: 110, deps: ['t403', 't404'], status: 'todo', critical: true,
      ctd: ['M2.7'], deliverables: ['2.7.1–2.7.4 summaries'] },
    { id: 't503', phase: 'p5', name: 'Benefit-risk assessment (2.5.6)', role: 'medical_writer', hours: 48, deps: ['t501'], status: 'todo',
      ctd: ['M2.5.6'], deliverables: ['Benefit-risk narrative'] },

    { id: 't601', phase: 'p6', name: 'FDA Form 356h & administrative set', role: 'ra_lead', hours: 32, deps: ['t103'], status: 'todo',
      ctd: ['M1.1', 'M1.2'], guidance: { cfr: '21 CFR 314.50(a)' }, deliverables: ['356h', 'Cover letter'] },
    { id: 't602', phase: 'p6', name: 'USPI / labeling (PLLR, 21 CFR 201.57)', role: 'ra_lead', hours: 88, deps: ['t501'], status: 'todo', critical: true,
      ctd: ['M1.14'], guidance: { cfr: '21 CFR 201.57' }, risk: { severity: 'medium', probability: 0.3, impact: 'Labeling negotiation cycle at end of review', mitigations: ['Draft early', 'Precedent labels'] }, deliverables: ['USPI', 'Med guide'] },
    { id: 't603', phase: 'p6', name: 'REMS assessment & PMR/PMC list', role: 'pv_safety', hours: 40, deps: ['t403'], status: 'todo',
      ctd: ['M1.16'], deliverables: ['REMS determination'] },

    { id: 't701', phase: 'p7', name: 'eCTD assembly & granularity QC', role: 'pub_ops', hours: 72, deps: ['t305', 't502', 't602'], status: 'todo', critical: true,
      ctd: [], deliverables: ['eCTD sequence 0000'] },
    { id: 't702', phase: 'p7', name: 'eValidator technical validation (0 errors)', role: 'pub_ops', hours: 40, deps: ['t701'], status: 'todo', critical: true,
      ctd: [], deliverables: ['Validation report'] },
    { id: 't703', phase: 'p7', name: 'ESG gateway transmission & ACK', role: 'pub_ops', hours: 24, deps: ['t702'], status: 'todo', critical: true,
      ctd: [], deliverables: ['ESG receipt', 'ACK1/2/3'] },
  ],
};

// ── Global pyramids ───────────────────────────────────────────────────────

export const PY_GLOBAL: PyGlobalConfig[] = [
  { type: 'HC_NOC', agency: 'Health Canada', region: 'Americas', format: 'eCTD', days: 300, tasks: 16,
    local: ['Bilingual (EN/FR) product monograph', 'MDSAP where applicable', 'Canadian-specific Module 1'] },
  { type: 'EMA_MAA_CP', agency: 'EMA', region: 'Europe', format: 'eCTD', days: 210, tasks: 24,
    local: ['Centralised procedure', 'QRD product information', 'Rapporteur/co-rapporteur assignment'] },
  { type: 'MHRA_MA', agency: 'MHRA', region: 'Europe', format: 'eCTD', days: 150, tasks: 18,
    local: ['UK-specific Module 1', 'International recognition procedure eligible'] },
  { type: 'PMDA_SHONIN', agency: 'PMDA', region: 'Asia-Pacific', format: 'CTD', days: 365, tasks: 22,
    local: ['Japanese translation', 'In-country caretaker (MAH)', 'Bridging strategy for ethnic factors'] },
  { type: 'NMPA_NDA', agency: 'NMPA', region: 'Asia-Pacific', format: 'eCTD', days: 400, tasks: 20,
    local: ['Chinese type-testing', 'Local clinical data expectation', 'Chinese Module 1'] },
  { type: 'TGA_ARTG', agency: 'TGA', region: 'Asia-Pacific', format: 'eCTD', days: 255, tasks: 16,
    local: ['Australian PI/CMI', 'ARTG entry', 'TGA-specific Module 1'] },
];

// ── Engine-derived computation helpers ────────────────────────────────────

export function pyProgress(pyr: PyPyramid): PyProgressResult {
  const done = pyr.tasks.filter(t => t.status === 'done').length;
  const perPhase: Record<string, PyPhaseProgress> = {};
  pyr.phases.forEach(ph => {
    const ts = pyr.tasks.filter(t => t.phase === ph.id);
    const d = ts.filter(t => t.status === 'done').length;
    perPhase[ph.id] = { total: ts.length, completed: d, pct: ts.length ? Math.round(d / ts.length * 100) : 0 };
  });
  const critical = pyr.tasks.filter(t => t.critical);
  const critDone = critical.filter(t => t.status === 'done').length;
  const hoursRemaining = pyr.tasks.filter(t => t.status !== 'done').reduce((a, t) => a + t.hours, 0);
  return {
    total: pyr.tasks.length, completed: done, pct: Math.round(done / pyr.tasks.length * 100),
    perPhase, criticalPathPct: critical.length ? Math.round(critDone / critical.length * 100) : 0, hoursRemaining,
  };
}

export function pyNextTasks(pyr: PyPyramid): PyTask[] {
  return pyr.tasks.filter(t =>
    t.status === 'todo' && t.deps.every(d => (pyr.tasks.find(x => x.id === d) || { status: '' }).status === 'done'));
}

export function pyRiskProfile(pyr: PyPyramid): { total: number; high: PyTask[]; gaps: PyTask[] } {
  const risky = pyr.tasks.filter(t => t.risk);
  const rank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const score = risky.reduce((a, t) => a + (rank[t.risk!.severity] ?? 1) * t.risk!.probability, 0);
  return {
    total: +score.toFixed(1),
    high: risky.filter(t => ['high', 'critical'].includes(t.risk!.severity)),
    gaps: pyr.tasks.filter(t => t.critical && t.status === 'blocked'),
  };
}

export function pyResources(pyr: PyPyramid): PyResourceRow[] {
  const map: Record<string, PyResourceRow> = {};
  pyr.tasks.forEach(t => {
    const r = t.role || 'unassigned';
    if (!map[r]) map[r] = { role: r, hours: 0, remaining: 0, tasks: 0, overloaded: false };
    map[r].hours += t.hours;
    map[r].tasks += 1;
    if (t.status !== 'done') map[r].remaining += t.hours;
  });
  const rows = Object.values(map).sort((a, b) => b.remaining - a.remaining);
  const cap = 320;
  rows.forEach(r => { r.overloaded = r.remaining > cap; });
  return rows;
}

export function pyCoverage(pyr: PyPyramid): PyCoverageRow[] {
  const secs: Record<string, PyCoverageRow> = {};
  pyr.tasks.forEach(t => (t.ctd || []).forEach(c => {
    if (!secs[c]) secs[c] = { section: c, tasks: [], done: 0, pct: 0 };
    secs[c].tasks.push(t.id);
    if (t.status === 'done') secs[c].done += 1;
  }));
  return Object.values(secs)
    .map(s => ({ ...s, pct: Math.round(s.done / s.tasks.length * 100) }))
    .sort((a, b) => a.section.localeCompare(b.section));
}
