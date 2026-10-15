/**
 * Inspection Readiness deterministic logic (Capability C2C-13)
 *
 * Pure, DB-free, LLM-free: the Form 483 response clock (15 business days), the
 * readiness scoring against the required readiness domains, and outcome
 * severity ranking.
 * Grounded in FDA Form 483 / EIR practice and the BIMO/PAI program.
 *
 * @module server/services/inspection/inspection-logic
 */

import type { InspectionOutcome, InspectionType, FindingClassification, ReadinessAreaStatus } from '../../../shared/schema/inspection';
import { getInspectionProfile } from '../global-ri/inspection-readiness';

function toParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}
function fmt(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Add N business days (skip Sat/Sun) to an ISO date. FDA considers a 483 response
 * received within 15 business days before deciding on further action. Pure.
 */
export function addBusinessDays(iso: string, businessDays: number): string {
  const p = toParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  let added = 0;
  while (added < businessDays) {
    dt.setUTCDate(dt.getUTCDate() + 1);
    const dow = dt.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return fmt(dt);
}

/** The recommended 483 response due date (15 business days from the issue/end date). */
export function responseDueDate(issueDate: string | null): string | null {
  return issueDate ? addBusinessDays(issueDate, 15) : null;
}

export type ResponseUrgency = 'overdue' | 'due_5' | 'due_15' | 'later' | 'undated' | 'closed';

function daysBetween(aIso: string, bIso: string): number | null {
  const a = toParts(aIso), b = toParts(bIso);
  if (!a || !b) return null;
  return Math.floor((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Urgency of an open finding response relative to its due date. Pure. */
export function responseUrgency(status: string, dueDate: string | null, today: string): ResponseUrgency {
  if (status === 'accepted' || status === 'submitted') return 'closed';
  if (!dueDate) return 'undated';
  const d = daysBetween(today, dueDate);
  if (d == null) return 'undated';
  if (d < 0) return 'overdue';
  if (d <= 5) return 'due_5';
  if (d <= 15) return 'due_15';
  return 'later';
}

const OUTCOME_RANK: Record<InspectionOutcome, number> = { pending: 0, nai: 1, vai: 2, oai: 3 };
/** Rank an inspection outcome by severity (OAI worst). Pure. */
export function outcomeSeverity(outcome: InspectionOutcome): number {
  return OUTCOME_RANK[outcome];
}

const CLASS_WEIGHT: Record<FindingClassification, number> = { critical: 3, major: 2, minor: 1, observation: 1 };
/** Response priority for a finding (higher = more urgent). Pure. */
export function findingPriority(classification: FindingClassification): number {
  return CLASS_WEIGHT[classification];
}

export interface ReadinessArea {
  area: string;
  status: ReadinessAreaStatus;
}

/**
 * The canonical readiness-domain checklist (global-ri/inspection-readiness: eight
 * cited domains whose ids and titles are the same in every modeled market — the
 * FDA profile is read for ids and titles only).
 */
const CHECKLIST = getInspectionProfile('FDA').readinessDomains.map((d) => ({ id: d.id, title: d.title }));

/**
 * The checklist domains an inspection type covers, by the citations the checklist
 * itself carries: the 21 CFR 210/211 GMP domains for a GMP inspection; those plus
 * application conformance (CP 7346.832 objective 2) for a PAI; the BIMO/GCP domain
 * (CPs 7348.811 / 7348.810) for a BIMO or GCP inspection. A routine, for-cause or
 * other inspection, and an org-wide score, are held to the whole checklist.
 */
const GMP_DOMAINS = ['facility_gmp', 'data_integrity', 'batch_records', 'process_validation', 'qms_capa', 'supplier_qualification'];
const DOMAINS_BY_TYPE: Partial<Record<InspectionType, string[]>> = {
  gmp: GMP_DOMAINS,
  pai: [...GMP_DOMAINS, 'application_conformance'],
  bimo: ['bimo_gcp'],
  gcp: ['bimo_gcp'],
};

/** The readiness domains a score is held to (the whole checklist without a modeled type). Pure. */
export function requiredReadinessDomains(inspectionType?: InspectionType | null): Array<{ id: string; title: string }> {
  const ids = inspectionType ? DOMAINS_BY_TYPE[inspectionType] : undefined;
  return ids ? CHECKLIST.filter((d) => ids.includes(d.id)) : CHECKLIST;
}

/** A free-text area as a comparable key, so 'Data integrity' matches the domain 'data_integrity'. */
function areaKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export interface ReadinessScore {
  /**
   * 0..100 over the required domains plus any other recorded areas: ready = 1,
   * in_progress = 0.5, not_started/at_risk = 0. A required domain with no
   * recorded status counts as not_started.
   */
  score: number;
  total: number;
  ready: number;
  atRisk: number;
  /** Includes the required domains with no recorded status. */
  notStarted: number;
  /** The readiness-domain ids this score is held to. */
  requiredDomains: string[];
  /** Required domain ids nobody has recorded a status for. */
  notRecorded: string[];
  /** 'incomplete' while a required domain is unrecorded and the recorded areas do not already decide it. */
  verdict: 'ready' | 'mostly_ready' | 'at_risk' | 'not_ready' | 'incomplete';
  blockers: string[];
}

/**
 * Score inspection readiness against the required readiness domains (see
 * requiredReadinessDomains) plus any other recorded areas. `ready` = 1,
 * `in_progress` = 0.5, `not_started`/`at_risk` = 0; any `at_risk` area and any
 * unrecorded required domain is a blocker. Pure.
 *
 * 2026-10-15: this averaged only the recorded areas — area is free text with no
 * required set — so one area recorded 'ready' scored 100 / 'ready'.
 */
export function scoreReadiness(areas: ReadinessArea[], opts: { inspectionType?: InspectionType | null } = {}): ReadinessScore {
  const required = requiredReadinessDomains(opts.inspectionType);
  const recorded = new Set(areas.map((a) => areaKey(a.area)));
  const missing = required.filter((d) => !recorded.has(d.id) && !recorded.has(areaKey(d.title)));
  let pts = 0, ready = 0, atRisk = 0, notStarted = missing.length;
  const blockers: string[] = [];
  for (const a of areas) {
    if (a.status === 'ready') { pts += 1; ready++; }
    else if (a.status === 'in_progress') pts += 0.5;
    else if (a.status === 'at_risk') { atRisk++; blockers.push(`Area at risk: ${a.area}`); }
    else notStarted++;
  }
  for (const d of missing) blockers.push(`Area not recorded: ${d.title} (${d.id})`);
  const total = areas.length + missing.length;
  const score = Math.round((pts / total) * 100);
  // With domains unrecorded, only a verdict they cannot change: below 70 even if each were ready.
  const bestCase = Math.round(((pts + missing.length) / total) * 100);
  const verdict: ReadinessScore['verdict'] = atRisk > 0 ? 'at_risk'
    : missing.length > 0 ? (bestCase < 70 ? 'not_ready' : 'incomplete')
      : score >= 90 ? 'ready' : score >= 70 ? 'mostly_ready' : 'not_ready';
  return { score, total, ready, atRisk, notStarted, requiredDomains: required.map((d) => d.id), notRecorded: missing.map((d) => d.id), verdict, blockers };
}
