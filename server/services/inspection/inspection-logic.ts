/**
 * Inspection Readiness deterministic logic (Capability C2C-13)
 *
 * Pure, DB-free, LLM-free: the Form 483 response clock (15 business days), the
 * readiness scoring across assessment areas, and outcome severity ranking.
 * Grounded in FDA Form 483 / EIR practice and the BIMO/PAI program.
 *
 * @module server/services/inspection/inspection-logic
 */

import type { InspectionOutcome, FindingClassification, ReadinessAreaStatus } from '../../../shared/schema/inspection';

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

export interface ReadinessScore {
  /** 0..100 — ready areas / total, with at_risk counted as 0 and in_progress as 0.5. */
  score: number;
  total: number;
  ready: number;
  atRisk: number;
  notStarted: number;
  verdict: 'ready' | 'mostly_ready' | 'at_risk' | 'not_ready';
  blockers: string[];
}

/**
 * Score inspection readiness across assessment areas. `ready` = 1, `in_progress`
 * = 0.5, `not_started`/`at_risk` = 0; any `at_risk` area is a blocker. Pure.
 */
export function scoreReadiness(areas: ReadinessArea[]): ReadinessScore {
  if (areas.length === 0) {
    return { score: 0, total: 0, ready: 0, atRisk: 0, notStarted: 0, verdict: 'not_ready', blockers: ['No readiness areas assessed.'] };
  }
  let pts = 0, ready = 0, atRisk = 0, notStarted = 0;
  const blockers: string[] = [];
  for (const a of areas) {
    if (a.status === 'ready') { pts += 1; ready++; }
    else if (a.status === 'in_progress') pts += 0.5;
    else if (a.status === 'at_risk') { atRisk++; blockers.push(`Area at risk: ${a.area}`); }
    else notStarted++;
  }
  const score = Math.round((pts / areas.length) * 100);
  const verdict: ReadinessScore['verdict'] = atRisk > 0 ? 'at_risk' : score >= 90 ? 'ready' : score >= 70 ? 'mostly_ready' : 'not_ready';
  return { score, total: areas.length, ready, atRisk, notStarted, verdict, blockers };
}
