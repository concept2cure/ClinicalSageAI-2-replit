/**
 * Device readiness scorecard — aggregates the deterministic device assessments
 * (classification, required documents, evidence-module gap checks) into one
 * weighted readiness score with a per-dimension breakdown and the top gaps.
 *
 * Two layers: the pure scorer (`computeDeviceReadinessScorecard`, fully testable
 * from structured inputs) and an adapter (`scorecardFromBlueprint`) that extracts
 * those inputs from a `DeviceBlueprint` + an optional requirements assessment.
 *
 * HONESTY: a planning/oversight aggregate of the underlying deterministic checks —
 * not a prediction of clearance/approval. Informational modules (e.g. the
 * biocompatibility endpoint set) are not scored as gaps.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-readiness-scorecard
 */

import type { DeviceBlueprint } from './device-blueprint';

export type DimensionStatus = 'ready' | 'partial' | 'not_started' | 'n/a';

export interface ScorecardDimension {
  id: string;
  label: string;
  /** Relative weight (the scorer normalises over the applicable weights). */
  weight: number;
  /** 0–100 for this dimension. */
  score: number;
  status: DimensionStatus;
  detail?: string;
}

export type ReadinessLevel = 'not_ready' | 'early' | 'in_progress' | 'nearly_ready' | 'ready';

export interface DeviceReadinessScorecard {
  /** 0–100, weighted over the applicable dimensions. */
  score: number;
  level: ReadinessLevel;
  dimensions: ScorecardDimension[];
  topGaps: string[];
}

export interface ScorecardInput {
  classificationKnown: boolean;
  /** Required-document coverage, when assessed. */
  requirements?: { present: number; total: number };
  /** Per evidence module: applicable, and (when assessed) ready + present/total. */
  evidence: Array<{ id: string; label: string; applicable: boolean; ready?: boolean; present?: number; total?: number }>;
}

function levelFor(score: number): ReadinessLevel {
  if (score >= 100) return 'ready';
  if (score >= 80) return 'nearly_ready';
  if (score >= 60) return 'in_progress';
  if (score >= 40) return 'early';
  return 'not_ready';
}

/** Score one evidence module: ready→100, partial via present/total, else not started. */
function scoreModule(m: ScorecardInput['evidence'][number]): { score: number; status: DimensionStatus } {
  if (m.ready === true) return { score: 100, status: 'ready' };
  if (typeof m.present === 'number' && typeof m.total === 'number' && m.total > 0) {
    const pct = Math.round((m.present / m.total) * 100);
    return { score: pct, status: pct === 0 ? 'not_started' : 'partial' };
  }
  if (m.ready === false) return { score: 0, status: 'not_started' };
  // Applicable but never assessed (no sections supplied).
  return { score: 0, status: 'not_started' };
}

/**
 * Compute the weighted readiness scorecard from structured inputs. Pure.
 * Weights: classification 10, required documents 30, evidence modules 60 (split
 * evenly across the applicable+scorable modules).
 */
export function computeDeviceReadinessScorecard(input: ScorecardInput): DeviceReadinessScorecard {
  const dimensions: ScorecardDimension[] = [];
  const topGaps: string[] = [];

  // Classification (weight 10).
  dimensions.push({
    id: 'classification',
    label: 'Risk classification determined',
    weight: 10,
    score: input.classificationKnown ? 100 : 0,
    status: input.classificationKnown ? 'ready' : 'not_started',
  });
  if (!input.classificationKnown) topGaps.push('Risk classification not yet determined.');

  // Required documents (weight 30) — only when assessed.
  if (input.requirements && input.requirements.total > 0) {
    const pct = Math.round((input.requirements.present / input.requirements.total) * 100);
    dimensions.push({
      id: 'required_documents',
      label: 'Required documents present',
      weight: 30,
      score: pct,
      status: pct === 100 ? 'ready' : pct === 0 ? 'not_started' : 'partial',
      detail: `${input.requirements.present}/${input.requirements.total} required documents`,
    });
    if (pct < 100) topGaps.push(`${input.requirements.total - input.requirements.present} required document(s) missing.`);
  }

  // Evidence modules (weight 60, split across applicable+scorable modules).
  const scorable = input.evidence.filter((m) => m.applicable && (m.ready !== undefined || typeof m.present === 'number'));
  const perModuleWeight = scorable.length > 0 ? 60 / scorable.length : 0;
  for (const m of scorable) {
    const { score, status } = scoreModule(m);
    dimensions.push({ id: `evidence:${m.id}`, label: m.label, weight: perModuleWeight, score, status, detail: typeof m.present === 'number' && typeof m.total === 'number' ? `${m.present}/${m.total} sections` : undefined });
    if (status !== 'ready') topGaps.push(`${m.label} is ${status === 'not_started' ? 'not started' : 'incomplete'}.`);
  }

  // Weighted aggregate over the applicable weights.
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const score = Math.round(dimensions.reduce((s, d) => s + d.weight * d.score, 0) / totalWeight);

  return { score, level: levelFor(score), dimensions, topGaps };
}

/** Extract a readiness flag + counts from a blueprint evidence module's detail. */
function moduleReadiness(detail: unknown): { ready?: boolean; present?: number; total?: number } {
  if (!detail || typeof detail !== 'object') return {};
  const d = detail as Record<string, unknown>;
  // Software wraps its assessment.
  const a = (d.assessment && typeof d.assessment === 'object' ? d.assessment : d) as Record<string, unknown>;
  const out: { ready?: boolean; present?: number; total?: number } = {};
  if (typeof a.ready === 'boolean') out.ready = a.ready;
  if (typeof a.presentCount === 'number') out.present = a.presentCount;
  if (typeof a.totalRequired === 'number') out.total = a.totalRequired;
  return out;
}

/** Build the scorecard from a device blueprint + an optional requirements assessment. */
export function scorecardFromBlueprint(
  blueprint: DeviceBlueprint,
  requirementsAssessment?: { presentRequiredCount: number; totalRequiredCount: number }
): DeviceReadinessScorecard {
  const evidence = blueprint.evidenceModules
    // Biocompatibility, electrical safety + sterilization are reference sets, not scored gaps.
    .filter((m) => m.id !== 'biocompatibility' && m.id !== 'electrical_safety' && m.id !== 'sterilization')
    .map((m) => ({ id: m.id, label: m.title, applicable: m.applicable, ...moduleReadiness(m.detail) }));

  return computeDeviceReadinessScorecard({
    classificationKnown: blueprint.classification !== undefined && blueprint.classification !== null,
    requirements: requirementsAssessment ? { present: requirementsAssessment.presentRequiredCount, total: requirementsAssessment.totalRequiredCount } : undefined,
    evidence,
  });
}

export default { computeDeviceReadinessScorecard, scorecardFromBlueprint };
