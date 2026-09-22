/**
 * Schedule of Activities — the design object's time-and-events grid, as data.
 *
 * ── Which M11 section this is ────────────────────────────────────────────────
 * §1.3. Corrected 2026-09-22 from §7, which was wrong and which this repository
 * contradicted in two places: `protocol-rule-pack.ts` CATALOGUE seeds Section 7
 * as "Discontinuation of Trial Intervention and Participant Withdrawal" and
 * Section 8 as "Trial Assessments and Procedures", and
 * `protocol-development-logic.ts` carries a matching `discontinuation` section.
 * The ICH M11 template places the Schedule of Activities in the Protocol
 * Summary, at 1.3, deliberately — synopsis, schema and SoA sit at the front so
 * site staff reach them first. Numbering is the Step 2 template's, which is
 * what the rest of this repository's M11 references use; the Step 4 final
 * guideline is not vendored here, so a reader comparing against it should
 * check the number rather than assume it carried over.
 *
 * The Schedule of Activities (SoA) is the time-and-events table that anchors every protocol:
 * visits are columns (grouped by epoch), procedures/assessments are rows (grouped by category),
 * and the body marks which assessment happens at which visit. Here it is a structured node of the
 * design, not a drawn table — so the protocol's SoA section, the registration outcome timing, and the CRF
 * shell all *project* from it and cannot drift.
 *
 * Two pure functions, both deterministic with no DB, RNG, clock or LLM:
 *   - {@link projectScheduleOfActivities} renders the grid (epoch-spanned columns, category-grouped
 *     rows, resolved footnotes, counts) honestly — it renders only what the object holds and reports
 *     what is missing, never inventing a cell.
 *   - {@link analyzeScheduleOfActivities} runs the SoA checks (structural integrity, a baseline
 *     anchor, and — the high-value one — whether every confirmatory endpoint is actually collected
 *     by a scheduled activity). The design-gate (`design-gates.ts`) wraps these issues into the
 *     standard `DesignFinding` shape so they flow into `validateDesign`.
 *
 * @module server/services/study-design/schedule-of-activities
 */

import type { FindingSeverity } from './design-gates';
import {
  type StudyDesign,
  type ScheduleOfActivities,
  type SoaActivity,
  type SoaActivityCategory,
  type SoaCell,
  type SoaCellState,
  type SoaEpoch,
  type SoaFootnote,
  type SoaVisit,
} from './study-design-types';

// ─── Issue model (mapped to DesignFinding by the gate) ────────────────────────

/** A §7 issue. Structurally identical to a `DesignFinding` minus the section label. */
export interface SoaIssue {
  code: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  suggestedFix?: string;
  endpointName?: string;
}

// ─── Projection model ─────────────────────────────────────────────────────────

/** A rendered grid cell: its state and a one-character display mark. */
export interface SoaGridCell {
  state: SoaCellState;
  /** Display token: performed → X, conditional → C, optional → O. */
  mark: 'X' | 'C' | 'O';
  footnoteIds: string[];
}

/** A grid row: an activity and one cell per visit in column order (null where not scheduled). */
export interface SoaGridRow {
  activity: SoaActivity;
  cells: Array<SoaGridCell | null>;
  /** Number of visits at which the activity is scheduled. */
  scheduledCount: number;
}

/** An epoch header span across the visit columns. */
export interface SoaEpochSpan {
  epoch: SoaEpoch;
  /** Visit ids under this epoch, in column order. */
  visitIds: string[];
}

export interface SoaProjection {
  /** True when the design actually carries a Schedule of Activities. */
  present: boolean;
  /** Epoch header spans across the visit columns, in order (only epochs with visits). */
  epochs: SoaEpochSpan[];
  /** Visits in column order (the grid columns). */
  visits: SoaVisit[];
  /** Activity rows in display order, grouped by category then row order. */
  rows: SoaGridRow[];
  /** Footnotes actually referenced by the grid, in definition order. */
  footnotes: SoaFootnote[];
  counts: { epochs: number; visits: number; activities: number; scheduledCells: number };
  /** Honest gap list (structural problems and uncollected endpoints), worst-first. */
  gaps: string[];
  /** Structural completeness over a fixed five-point checklist. */
  completeness: { satisfied: number; total: number; percent: number };
  standard: 'ICH M11 §1.3';
  /** Honesty marker: this is a deterministic projection, not generated content. */
  projectedFromObject: true;
}

// ─── Display ordering ──────────────────────────────────────────────────────────

const CATEGORY_ORDER: Record<SoaActivityCategory, number> = {
  administrative: 0,
  eligibility: 1,
  drug_administration: 2,
  efficacy: 3,
  patient_reported: 4,
  pk: 5,
  pd: 6,
  biomarker: 7,
  safety: 8,
};

const MARK: Record<SoaCellState, SoaGridCell['mark']> = {
  performed: 'X',
  conditional: 'C',
  optional: 'O',
};

const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, major: 1, minor: 2, info: 3 };

const REQUIRED_ENDPOINT_ROLES = new Set(['primary', 'key_secondary']);

// ─── Projection ────────────────────────────────────────────────────────────────

/**
 * Project a design's Schedule of Activities into a rendered grid. Deterministic.
 * When the design carries no SoA the projection is empty with `present: false` and a gap.
 */
export function projectScheduleOfActivities(design: StudyDesign): SoaProjection {
  const soa = design.scheduleOfActivities;
  const issues = analyzeScheduleOfActivities(design);
  const gaps = issues
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .map(i => i.detail);

  if (!soa) {
    return {
      present: false,
      epochs: [],
      visits: [],
      rows: [],
      footnotes: [],
      counts: { epochs: 0, visits: 0, activities: 0, scheduledCells: 0 },
      gaps: ['No Schedule of Activities is attached.'],
      completeness: { satisfied: 0, total: 5, percent: 0 },
      standard: 'ICH M11 §1.3',
      projectedFromObject: true,
    };
  }

  const visits = [...(soa.visits ?? [])].sort(byOrder);
  const epochsSorted = [...(soa.epochs ?? [])].sort(byOrder);
  const activities = [...(soa.activities ?? [])].sort(
    (a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99) || a.order - b.order,
  );

  // Sparse cell lookup keyed by activity|visit.
  const cellByKey = new Map<string, SoaCell>();
  for (const c of soa.cells ?? []) cellByKey.set(`${c.activityId}\u0001${c.visitId}`, c);

  // Epoch header spans: each epoch over the visits that belong to it, in column order.
  const epochs: SoaEpochSpan[] = epochsSorted
    .map(epoch => ({ epoch, visitIds: visits.filter(v => v.epochId === epoch.id).map(v => v.id) }))
    .filter(span => span.visitIds.length > 0);

  // Rows: one cell per visit (null where not scheduled).
  let scheduledCells = 0;
  const rows: SoaGridRow[] = activities.map(activity => {
    let scheduledCount = 0;
    const cells = visits.map(v => {
      const cell = cellByKey.get(`${activity.id}\u0001${v.id}`);
      if (!cell) return null;
      scheduledCount += 1;
      scheduledCells += 1;
      return { state: cell.state, mark: MARK[cell.state], footnoteIds: cell.footnoteIds ?? [] };
    });
    return { activity, cells, scheduledCount };
  });

  // Footnotes actually referenced, in definition order.
  const referenced = new Set<string>();
  for (const c of soa.cells ?? []) for (const f of c.footnoteIds ?? []) referenced.add(f);
  for (const a of soa.activities ?? []) for (const f of a.footnoteIds ?? []) referenced.add(f);
  const footnotes = (soa.footnotes ?? []).filter(f => referenced.has(f.id));

  const satisfied = structuralChecklist(soa).filter(Boolean).length;

  return {
    present: true,
    epochs,
    visits,
    rows,
    footnotes,
    counts: {
      epochs: epochsSorted.length,
      visits: visits.length,
      activities: activities.length,
      scheduledCells,
    },
    gaps,
    completeness: { satisfied, total: 5, percent: Math.round((satisfied / 5) * 100) },
    standard: 'ICH M11 §1.3',
    projectedFromObject: true,
  };
}

/** A short, sentence-case summary of the SoA for the protocol §7 — content plus any gaps. */
export function summarizeSoaForProtocol(design: StudyDesign): { content: string; gaps: string[] } {
  const proj = projectScheduleOfActivities(design);
  if (!proj.present) {
    return { content: '', gaps: ['No Schedule of Activities is attached.'] };
  }
  const lines: string[] = [];
  lines.push(
    `Schedule of activities: ${proj.counts.activities} assessments across ${proj.counts.visits} ` +
      `visits in ${proj.counts.epochs} epochs.`,
  );
  // Where each confirmatory endpoint is collected.
  const visitName = new Map(proj.visits.map(v => [v.id, v.name] as const));
  for (const ep of design.endpoints ?? []) {
    if (!REQUIRED_ENDPOINT_ROLES.has(ep.role)) continue;
    const visitsForEp = collectingVisitsFor(design.scheduleOfActivities!, ep.name);
    if (visitsForEp.length) {
      const names = visitsForEp.map(id => visitName.get(id) ?? id);
      lines.push(`"${ep.name}" is collected at: ${names.join(', ')}.`);
    }
  }
  return { content: lines.join('\n'), gaps: proj.gaps };
}

/**
 * A readable outcome time frame for an endpoint, derived from the visits the SoA collects it at.
 * Returns null when there is no SoA or the endpoint is not collected — the caller then falls back
 * to the endpoint's own timepoint (or reports the gap). This lets a registration outcome read its
 * time frame from the schedule rather than free text, so the two cannot drift.
 */
export function endpointTimeFrameFromSoa(design: StudyDesign, endpointName: string): string | null {
  const soa = design.scheduleOfActivities;
  if (!soa) return null;
  const visitIds = collectingVisitsFor(soa, endpointName);
  if (visitIds.length === 0) return null;
  const byId = new Map((soa.visits ?? []).map(v => [v.id, v] as const));
  const labels = visitIds.map(id => {
    const v = byId.get(id);
    if (!v) return id;
    return typeof v.studyDay === 'number' ? `${v.name} (day ${v.studyDay})` : v.name;
  });
  return labels.join(', ');
}

// ─── §7 analysis ────────────────────────────────────────────────────────────────

/**
 * Run the §7 checks over a design's Schedule of Activities. Pure and deterministic.
 * Returns no issues for a structurally sound SoA that collects every confirmatory endpoint.
 */
export function analyzeScheduleOfActivities(design: StudyDesign): SoaIssue[] {
  const soa = design.scheduleOfActivities;
  const issues: SoaIssue[] = [];

  // Absent: the gates do not treat a missing SoA as a risk finding. Its absence is a
  // completeness gap surfaced by the projection and the protocol §7 section, not a
  // defensibility deficiency in what is present — so there is nothing to analyze.
  if (!soa) return issues;

  const epochs = soa.epochs ?? [];
  const visits = soa.visits ?? [];
  const activities = soa.activities ?? [];
  const cells = soa.cells ?? [];

  if (epochs.length === 0) {
    issues.push(structural('SOA-010', 'Schedule of Activities has no epochs', 'Define at least one epoch (e.g. screening, treatment, follow-up).'));
  }
  if (visits.length === 0) {
    issues.push(structural('SOA-011', 'Schedule of Activities has no visits', 'Define the scheduled visits as grid columns.'));
  }
  if (activities.length === 0) {
    issues.push(structural('SOA-012', 'Schedule of Activities has no activities', 'Define the assessments and procedures as grid rows.'));
  }

  // Duplicate ids break the grid's referential integrity.
  reportDuplicates('SOA-016', 'epoch', epochs.map(e => e.id), issues);
  reportDuplicates('SOA-016', 'visit', visits.map(v => v.id), issues);
  reportDuplicates('SOA-016', 'activity', activities.map(a => a.id), issues);

  // Visits must reference a defined epoch.
  const epochIds = new Set(epochs.map(e => e.id));
  for (const v of visits) {
    if (!epochIds.has(v.epochId)) {
      issues.push(structural('SOA-013', `Visit "${v.name}" references an undefined epoch`, 'Point the visit at a defined epoch id, or add the epoch.'));
    }
  }

  // Cells must reference defined activities and visits.
  const activityIds = new Set(activities.map(a => a.id));
  const visitIds = new Set(visits.map(v => v.id));
  const danglingCells = cells.filter(c => !activityIds.has(c.activityId) || !visitIds.has(c.visitId)).length;
  if (danglingCells > 0) {
    issues.push(structural('SOA-014', `${danglingCells} schedule cell(s) reference an undefined activity or visit`, 'Remove the dangling cells or add the missing activity/visit.'));
  }

  // Footnote references must resolve.
  const footnoteIds = new Set((soa.footnotes ?? []).map(f => f.id));
  const referencedFootnotes = new Set<string>();
  for (const c of cells) for (const f of c.footnoteIds ?? []) referencedFootnotes.add(f);
  for (const a of activities) for (const f of a.footnoteIds ?? []) referencedFootnotes.add(f);
  const missingFootnotes = [...referencedFootnotes].filter(f => !footnoteIds.has(f)).sort();
  if (missingFootnotes.length) {
    issues.push({
      code: 'SOA-015',
      severity: 'minor',
      title: 'Undefined footnote reference',
      detail: `The grid references footnote(s) that are not defined: ${missingFootnotes.join(', ')}.`,
      suggestedFix: 'Define the footnote text or remove the reference.',
    });
  }

  // A baseline / first-dose anchor visit is needed for study-day anchoring and change-from-baseline.
  if (visits.length > 0 && !visits.some(v => v.isBaseline)) {
    issues.push({
      code: 'SOA-020',
      severity: 'major',
      title: 'No baseline visit marked',
      detail:
        'No visit is marked as the baseline (first-dose/randomization) anchor, so study days and ' +
        'change-from-baseline endpoints have no reference point.',
      suggestedFix: 'Mark the first-dose/randomization visit with isBaseline.',
    });
  }

  // Endpoint coverage — the substantive check: every confirmatory endpoint must be collected.
  for (const ep of design.endpoints ?? []) {
    if (!REQUIRED_ENDPOINT_ROLES.has(ep.role)) continue;
    const collectedAt = collectingVisitsFor(soa, ep.name);
    if (collectedAt.length === 0) {
      issues.push({
        code: ep.role === 'primary' ? 'SOA-030' : 'SOA-031',
        severity: ep.role === 'primary' ? 'major' : 'minor',
        title: `${ep.role === 'primary' ? 'Primary' : 'Key secondary'} endpoint not collected by the schedule`,
        detail: `Endpoint "${ep.name}" is not produced by any scheduled activity, so the schedule does not collect the data the analysis needs.`,
        suggestedFix: `Add an activity that lists "${ep.name}" in its endpointNames and schedule it at the relevant visit(s).`,
        endpointName: ep.name,
      });
    }
  }

  // Activities that name an endpoint the design does not declare.
  const endpointNames = new Set((design.endpoints ?? []).map(e => e.name));
  for (const a of activities) {
    for (const name of a.endpointNames ?? []) {
      if (!endpointNames.has(name)) {
        issues.push({
          code: 'SOA-032',
          severity: 'minor',
          title: 'Activity references an unknown endpoint',
          detail: `Activity "${a.name}" lists endpoint "${name}", which is not declared in the design.`,
          suggestedFix: 'Correct the endpoint name or add the endpoint to the design.',
        });
      }
    }
  }

  // Activities defined but never scheduled.
  const scheduledActivityIds = new Set(cells.map(c => c.activityId));
  for (const a of activities) {
    if (!scheduledActivityIds.has(a.id)) {
      issues.push({
        code: 'SOA-040',
        severity: 'minor',
        title: 'Activity is scheduled at no visit',
        detail: `Activity "${a.name}" is defined but scheduled at no visit.`,
        suggestedFix: 'Schedule the activity at one or more visits, or remove it.',
      });
    }
  }

  return issues;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

/** The visit ids at which any activity producing `endpointName` is scheduled. */
function collectingVisitsFor(soa: ScheduleOfActivities, endpointName: string): string[] {
  const producing = new Set(
    (soa.activities ?? []).filter(a => (a.endpointNames ?? []).includes(endpointName)).map(a => a.id),
  );
  if (producing.size === 0) return [];
  const visitOrder = new Map((soa.visits ?? []).map(v => [v.id, v.order] as const));
  const ids = new Set((soa.cells ?? []).filter(c => producing.has(c.activityId)).map(c => c.visitId));
  return [...ids].sort((x, y) => (visitOrder.get(x) ?? 0) - (visitOrder.get(y) ?? 0));
}

function structural(code: string, title: string, suggestedFix: string): SoaIssue {
  return { code, severity: 'major', title, detail: `${title}.`, suggestedFix };
}

function reportDuplicates(code: string, kind: string, ids: string[], issues: SoaIssue[]): void {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  if (dupes.size) {
    issues.push({
      code,
      severity: 'major',
      title: `Duplicate ${kind} id`,
      detail: `Duplicate ${kind} id(s): ${[...dupes].sort().join(', ')}. Ids must be unique for the grid to resolve.`,
      suggestedFix: `Give each ${kind} a unique id.`,
    });
  }
}

/** The five structural elements completeness scores against. */
function structuralChecklist(soa: ScheduleOfActivities): boolean[] {
  const epochIds = new Set((soa.epochs ?? []).map(e => e.id));
  const activityIds = new Set((soa.activities ?? []).map(a => a.id));
  const visitIds = new Set((soa.visits ?? []).map(v => v.id));
  const refsResolve =
    (soa.visits ?? []).every(v => epochIds.has(v.epochId)) &&
    (soa.cells ?? []).every(c => activityIds.has(c.activityId) && visitIds.has(c.visitId));
  return [
    (soa.epochs ?? []).length > 0,
    (soa.visits ?? []).length > 0,
    (soa.activities ?? []).length > 0,
    (soa.visits ?? []).some(v => v.isBaseline),
    refsResolve,
  ];
}
