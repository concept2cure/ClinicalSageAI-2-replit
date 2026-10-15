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

/** 'not_assessed': applicable, and nothing has measured it. Scores 0 and keeps its weight. */
export type DimensionStatus = 'ready' | 'partial' | 'not_started' | 'not_assessed' | 'n/a';

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
  /** When the classification could not be determined: the facts the engine needs to state a class. */
  classificationMissingFacts?: string[];
  /** Required-document coverage, when assessed. */
  requirements?: { present: number; total: number };
  /**
   * Per evidence module: applicable, and (when assessed) ready + present/total.
   * `missingFacts`: the facts without which the module's required set is not known.
   */
  evidence: Array<{ id: string; label: string; applicable: boolean; ready?: boolean; present?: number; total?: number; missingFacts?: string[] }>;
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
  // A module whose required set turns on an unstated fact (IEC 62304 class, CER
  // equivalence claim) has no share to score (2026-10-15: it scored ready, 100).
  if (m.missingFacts && m.missingFacts.length > 0) return { score: 0, status: 'not_assessed' };
  if (m.ready === true) return { score: 100, status: 'ready' };
  if (typeof m.present === 'number' && typeof m.total === 'number' && m.total > 0) {
    const pct = Math.round((m.present / m.total) * 100);
    return { score: pct, status: pct === 0 ? 'not_started' : 'partial' };
  }
  if (m.ready === false) return { score: 0, status: 'not_started' };
  // Applicable but never assessed (no sections supplied).
  return { score: 0, status: 'not_assessed' };
}

/** One applicable evidence module's dimension, and its gap when it is not ready. */
function evidenceDimension(m: ScorecardInput['evidence'][number], weight: number): { dimension: ScorecardDimension; gap: string | null } {
  const { score, status } = scoreModule(m);
  const counted = typeof m.present === 'number' && typeof m.total === 'number';
  const missing = m.missingFacts && m.missingFacts.length > 0 ? m.missingFacts.join('; ') : null;
  const detail = missing
    ? `Not assessed: the required set turns on ${missing}.${counted ? ` ${m.present} of the ${m.total} sections known to be required are present.` : ''}`
    : counted ? `${m.present}/${m.total} sections` : undefined;
  const gap = missing
    ? `${m.label} is not assessed: supply ${missing}.`
    : status === 'ready' ? null : `${m.label} is ${status === 'not_started' ? 'not started' : status === 'not_assessed' ? 'not assessed' : 'incomplete'}.`;
  return { dimension: { id: `evidence:${m.id}`, label: m.label, weight, score, status, detail }, gap };
}

/**
 * Compute the weighted readiness scorecard from structured inputs. Pure.
 * Weights: classification 10, required documents 30, evidence modules 60 (split
 * evenly across the applicable modules).
 *
 * An applicable dimension nothing has measured is scored as not assessed: 0,
 * with its weight kept and a gap naming it. Both the required documents (when
 * no assessment is passed — the /device/blueprint route and AnA's tool pass
 * none) and applicable evidence modules with no readiness data used to be
 * DROPPED and the weights normalised over what was left, so a determined class
 * and one ready module scored 100, 'ready' (2026-10-15). Readiness is now the
 * share of the whole that has been shown, not of the part that was looked at.
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
  if (!input.classificationKnown) {
    const missing = input.classificationMissingFacts ?? [];
    topGaps.push(missing.length
      ? `Risk classification not yet determined: supply ${missing.join(', ')}.`
      : 'Risk classification not yet determined.');
  }

  // Required documents (weight 30).
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
  } else {
    dimensions.push({
      id: 'required_documents',
      label: 'Required documents present',
      weight: 30,
      score: 0,
      status: 'not_assessed',
      detail: 'Not assessed — no document inventory was checked.',
    });
    topGaps.push('Required documents not assessed.');
  }

  // Evidence modules (weight 60, split across the applicable modules).
  const applicable = input.evidence.filter((m) => m.applicable);
  const perModuleWeight = applicable.length > 0 ? 60 / applicable.length : 0;
  for (const m of applicable) {
    const { dimension, gap } = evidenceDimension(m, perModuleWeight);
    dimensions.push(dimension);
    if (gap) topGaps.push(gap);
  }

  // Weighted aggregate over the applicable weights.
  const totalWeight = dimensions.reduce((s, d) => s + d.weight, 0) || 1;
  const score = Math.round(dimensions.reduce((s, d) => s + d.weight * d.score, 0) / totalWeight);

  return { score, level: levelFor(score), dimensions, topGaps };
}

/** The strings in a `missingFacts` value; [] for anything else. */
function factList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((f): f is string => typeof f === 'string') : [];
}

/** Extract a readiness flag + counts (+ missing facts) from a blueprint evidence module's detail. */
function moduleReadiness(detail: unknown): { ready?: boolean; present?: number; total?: number; missingFacts?: string[] } {
  if (!detail || typeof detail !== 'object') return {};
  const d = detail as Record<string, unknown>;
  // Software wraps its assessment.
  const a = (d.assessment && typeof d.assessment === 'object' ? d.assessment : d) as Record<string, unknown>;
  const out: { ready?: boolean; present?: number; total?: number; missingFacts?: string[] } = {};
  if (typeof a.ready === 'boolean') out.ready = a.ready;
  if (typeof a.presentCount === 'number') out.present = a.presentCount;
  if (typeof a.totalRequired === 'number') out.total = a.totalRequired;
  const missingFacts = factList(a.missingFacts);
  if (missingFacts.length > 0) out.missingFacts = missingFacts;
  return out;
}

/**
 * Whether the blueprint's classification states a class. The MDR/IVDR engine
 * returns `class: null` with `missingFacts` when a deciding fact was not supplied;
 * that object exists but determines nothing, so it is never scored as determined
 * (2026-10-05, after the engine began failing closed in 963c2167). The FDA
 * engine does the same with `pathway: 'undetermined'`; an FDA answer used to
 * count whatever its pathway (2026-10-15).
 */
function classificationStanding(cls: unknown): { classificationKnown: boolean; classificationMissingFacts?: string[] } {
  if (cls === undefined || cls === null || typeof cls !== 'object') return { classificationKnown: false };
  const c = cls as { class?: unknown; pathway?: unknown; missingFacts?: unknown };
  const stated = 'class' in c ? c.class : c.pathway;
  if (stated === null || stated === undefined || stated === 'undetermined') {
    return { classificationKnown: false, classificationMissingFacts: factList(c.missingFacts) };
  }
  return { classificationKnown: true };
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
    ...classificationStanding(blueprint.classification),
    requirements: requirementsAssessment ? { present: requirementsAssessment.presentRequiredCount, total: requirementsAssessment.totalRequiredCount } : undefined,
    evidence,
  });
}

export default { computeDeviceReadinessScorecard, scorecardFromBlueprint };
