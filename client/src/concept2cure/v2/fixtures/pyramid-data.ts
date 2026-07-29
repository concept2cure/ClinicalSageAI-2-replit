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
