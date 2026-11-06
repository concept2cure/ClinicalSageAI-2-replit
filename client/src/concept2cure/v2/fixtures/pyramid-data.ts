/**
 * Pyramid display contract + deterministic compute helpers.
 *
 * The Pyramid surface (surfaces/Pyramid.tsx) and its analytics/global views
 * (surfaces/PyramidAnalytics.tsx) render REAL data from the submission-pyramid
 * engine, fetched live from /api/v1/pyramids/types, /api/v1/pyramids/:type and
 * /api/v1/global-pyramids (server/routes/pyramid.routes.ts). This module is the
 * shared, fixture-free support layer for that surface:
 *
 *   - the display TYPES the routes are adapted into (PyType, PyPyramid, PyTask,
 *     PyPhase, PyGlobalConfig, …),
 *   - the canonical vocab/role config (PY_ROLES, PY_STATUS, PY_RISK), and
 *   - the pure engine-mirroring compute helpers (pyProgress, pyNextTasks,
 *     pyRiskProfile, pyResources, pyCoverage) that derive dashboard/analytics
 *     views from whatever pyramid object they're handed.
 *
 * It holds NO fabricated pyramid data — the earlier BX-204 NDA fixture
 * constants were removed when the surface was wired to the live engine routes.
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
  weeks?: number;
  /** The task that completes the phase (the engine's phaseGate): the workstream's milestone; its owner leads it. */
  gate?: string;
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
  program?: string;
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

// ── Role library ──────────────────────────────────────────────────────────

export const PY_ROLES: Record<string, string> = {
  ra_lead: 'RA lead', cmc_writer: 'CMC writer', clinical_ops: 'Clinical ops',
  medical_writer: 'Medical writer', biostat: 'Biostatistician',
  nonclinical: 'Nonclinical', pv_safety: 'PV / safety',
  pub_ops: 'Publishing ops', qa: 'Quality',
  // Every role the engine's pyramids name (services/regulatory/pyramids/*.ts, 2026-11-04): they printed as their ids.
  regulatory_ops: 'Regulatory ops', qa_manager: 'QA manager', cmc_lead: 'CMC lead', clinical_lead: 'Clinical lead',
  toxicologist: 'Toxicologist', ra_associate: 'RA associate', quality: 'Quality', project_manager: 'Project manager',
  engineering: 'Engineering', pharmacovigilance: 'Pharmacovigilance', medical_monitor: 'Medical monitor',
  biostatistician: 'Biostatistician', nonclinical_lead: 'Nonclinical lead', safety: 'Safety', drug_safety: 'Drug safety',
  supply_chain: 'Supply chain', medical_officer: 'Medical officer', market_access: 'Market access', executive: 'Executive',
  clinical_research_associate: 'Clinical research associate', clinical_operations: 'Clinical operations',
};

/** A role as people say it: its label, or, for a role a pyramid adds later, its id in plain words ("supply_chain" →
 *  "Supply chain"), never the bare id. */
export function pyRoleLabel(role: string): string {
  const known = PY_ROLES[role];
  if (known) return known;
  const words = role.replace(/_/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unassigned role';
}

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
    total: pyr.tasks.length, completed: done, pct: pyr.tasks.length ? Math.round(done / pyr.tasks.length * 100) : 0,
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
    .map(s => ({ ...s, pct: s.tasks.length ? Math.round(s.done / s.tasks.length * 100) : 0 }))
    .sort((a, b) => a.section.localeCompare(b.section));
}

// ── The project's schedule (S11 step 3) ───────────────────────────────────
// The dates are the engine's (backSchedule, services/regulatory/SubmissionPyramidEngine.ts), back-scheduled from the
// project's target submission date and sent by GET /api/v1/pyramids/by-project/:ref. The client only compares them
// with the day the server read them on (asOf) and the task's status.

export interface PyScheduledTask {
  start: string;
  due: string;
  workingDays: number;
  basis: 'typical-duration' | 'estimated-hours';
  afterSubmission?: boolean;
}

export interface PySchedule {
  target: string;
  anchorTaskId: string;
  start: string;
  tasks: Record<string, PyScheduledTask>;
}

/** Where an unfinished task stands against its dates: past its due date, past its start date and not started, or
 *  neither (null). A done task stands nowhere. */
export type PyStanding = 'overdue' | 'late-to-start' | null;

export function pyStanding(status: string, slot: PyScheduledTask | undefined, asOf: string): PyStanding {
  if (!slot || status === 'done') return null;
  if (slot.due < asOf) return 'overdue';
  if (slot.start < asOf && status === 'todo') return 'late-to-start';
  return null;
}

export const PY_STANDING_WORDS: Record<Exclude<PyStanding, null>, string> = {
  overdue: 'past due',
  'late-to-start': 'should have started',
};

/** The agency's clock after the filing (GET /api/v1/pyramids/by-project/:ref `reviewClock`): the published goal for the
 *  pathway (server/services/market-specs/regulatory-timelines.ts) or the IND's 30-day review, from the target date. */
export interface PyReviewClock {
  authority: string;
  basis: string;
  days: number;
  ends: string;
  label: string;
  caveat: string;
  clockStops: boolean;
  milestones: { label: string; day: number; date: string }[];
}

/** A workstream's status word: the engine's ScheduleStatus vocabulary (services/regulatory/SubmissionPyramidSchedule.ts). */
export type PyWorkStatus = 'complete' | 'blocked' | 'at-risk' | 'on-track' | 'unscheduled';
export const PY_WORK_STATUS_WORDS: Record<PyWorkStatus, string> = {
  complete: 'Done', blocked: 'Blocked', 'at-risk': 'At risk', 'on-track': 'On track', unscheduled: 'Not scheduled',
};

/** One workstream's status, by the engine's rule (scheduleSummary): done when every task is; blocked when one is;
 *  not scheduled without dates; at risk when an unfinished task is past its dates; else on track. */
export function pyWorkStatus(tasks: PyTask[], slots: Record<string, PyScheduledTask> | null, asOf: string): PyWorkStatus {
  if (tasks.length > 0 && tasks.every(t => t.status === 'done')) return 'complete';
  if (tasks.some(t => t.status === 'blocked')) return 'blocked';
  if (!slots) return 'unscheduled';
  return tasks.some(t => pyStanding(t.status, slots[t.id], asOf) !== null) ? 'at-risk' : 'on-track';
}
