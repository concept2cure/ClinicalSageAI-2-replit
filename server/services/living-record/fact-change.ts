/**
 * Living Record Spine — pure fact-change impact logic.
 *
 * The deterministic core of the governed change-propagation path ("change a
 * value in one place → see every citation that is affected"). Given a proposed
 * new value for a canonical fact, classify what happens to each derived-value
 * binding: will it drift, does it already agree, is it a manual override, or is
 * it a derived binding whose transform cannot be evaluated.
 *
 * No database, no I/O — every function here is pure and total so it can be
 * unit-tested exhaustively and reused by both the impact-preview endpoint and
 * the apply path in fact-change-orchestrator.ts.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.5 (Governed Fact Change).
 */

import type { FactBinding } from '../../../shared/schema/living-record-spine';
import { claimIdFromTarget } from './object-model';
import {
  applyTransform,
  detectDrift,
  toCanonicalValue,
  type FactValueView,
  type Severity,
} from './value-reconciliation';

// ─────────────────────────────────────────────────────────────────────────────
// Shared result envelope (used by the orchestrator and the propagator)
// ─────────────────────────────────────────────────────────────────────────────

export type FactChangeFailureCode = 'not_found' | 'conflict' | 'invalid';

export interface FactChangeFailure {
  ok: false;
  code: FactChangeFailureCode;
  message: string;
}

export function factChangeFailure(code: FactChangeFailureCode, message: string): FactChangeFailure {
  return { ok: false, code, message };
}

/** Project a fact_bindings row onto the plain input the classifier consumes. */
export function bindingImpactInput(b: FactBinding): BindingImpactInput {
  return {
    id: b.id,
    target: b.target,
    targetKind: b.targetKind,
    bindingKind: b.bindingKind,
    observedValue: b.observedValue,
    transform: (b.transform as Record<string, unknown> | null) ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proposed values
// ─────────────────────────────────────────────────────────────────────────────

/** A partial value change: fields that are omitted keep the fact's current value. */
export interface ProposedFactValue {
  valueNum?: number | null;
  valueText?: string | null;
  unit?: string | null;
  valueType?: string;
}

/** True when the proposal actually carries a value (numeric or non-empty text). */
export function hasProposedValue(p: ProposedFactValue): boolean {
  if (p.valueNum !== undefined && p.valueNum !== null) return true;
  if (p.valueText !== undefined && p.valueText !== null && p.valueText.trim() !== '') return true;
  return false;
}

/**
 * Merge a proposal onto the current fact value. Providing a numeric value
 * clears the text value and vice versa — a fact carries exactly one canonical
 * value, never both axes at once.
 */
export function proposedFactView(current: FactValueView, proposed: ProposedFactValue): FactValueView {
  let valueNum = current.valueNum;
  let valueText = current.valueText;
  if (proposed.valueNum !== undefined && proposed.valueNum !== null) {
    valueNum = proposed.valueNum;
    valueText = null;
  } else if (proposed.valueText !== undefined && proposed.valueText !== null) {
    valueText = proposed.valueText;
    valueNum = null;
  }
  return {
    valueNum,
    valueText,
    unit: proposed.unit !== undefined ? proposed.unit : current.unit,
    valueType: proposed.valueType ?? current.valueType,
  };
}

/** True when the proposal is a no-op against the current value (value + unit). */
export function isNoopChange(current: FactValueView, next: FactValueView): boolean {
  return (
    toCanonicalValue(current) === toCanonicalValue(next) &&
    (current.unit ?? '').trim().toLowerCase() === (next.unit ?? '').trim().toLowerCase()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-binding impact classification
// ─────────────────────────────────────────────────────────────────────────────

export type BindingImpactOutcome = 'will_drift' | 'consistent' | 'override' | 'not_evaluable';

/** The slice of a fact_bindings row the classification needs (plain data). */
export interface BindingImpactInput {
  id: string;
  target: string;
  targetKind: string;
  bindingKind: string;
  observedValue: string | null;
  transform?: Record<string, unknown> | null;
}

export interface BindingImpact {
  bindingId: string;
  target: string;
  targetKind: string;
  bindingKind: string;
  /** Integer claim id when the target is a claim pointer, else null. */
  claimId: number | null;
  outcome: BindingImpactOutcome;
  driftType: string | null;
  /** Canonical expected value under the proposed fact (post-transform for derived). */
  expected: string;
  observed: string;
  severity: Severity;
}

/**
 * Classify one binding against a (proposed) fact value. Manual overrides and
 * non-evaluable derived transforms are labelled rather than silently dropped —
 * the impact preview must show the operator every citation, including the ones
 * propagation will deliberately not touch.
 */
export function classifyBindingImpact(
  binding: BindingImpactInput,
  fact: FactValueView,
  opts?: { tolerance?: number }
): BindingImpact {
  const base = {
    bindingId: binding.id,
    target: binding.target,
    targetKind: binding.targetKind,
    bindingKind: binding.bindingKind,
    claimId: claimIdFromTarget(binding.target),
    observed: (binding.observedValue ?? '').trim(),
  };

  if (binding.bindingKind === 'manual_override') {
    return {
      ...base,
      outcome: 'override',
      driftType: null,
      expected: toCanonicalValue(fact),
      severity: 'low',
    };
  }

  if (
    binding.bindingKind === 'derived' &&
    fact.valueNum !== null &&
    fact.valueNum !== undefined &&
    applyTransform(fact.valueNum, binding.transform ?? null) === null
  ) {
    return {
      ...base,
      outcome: 'not_evaluable',
      driftType: null,
      expected: toCanonicalValue(fact),
      severity: 'low',
    };
  }

  const finding = detectDrift(
    {
      bindingKind: binding.bindingKind as 'mirror' | 'derived' | 'manual_override',
      observedValue: binding.observedValue ?? null,
      transform: binding.transform ?? null,
    },
    fact,
    { tolerance: opts?.tolerance }
  );

  return {
    ...base,
    outcome: finding.drift ? 'will_drift' : 'consistent',
    driftType: finding.driftType,
    expected: finding.expected,
    observed: finding.observed,
    severity: finding.severity,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Propagation eligibility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Can the platform mechanically write the new value into this citation?
 * Only divergent claim citations qualify: a claim carries a structured value
 * the propagator can set directly. Prose targets (section/paragraph/document)
 * are deliberately excluded — updating running text is a governed rewrite in
 * the resolution workflow, never a silent mechanical edit. Overrides are
 * excluded by design; non-evaluable transforms cannot be computed.
 */
export type PropagationSkipReason = 'override' | 'not_evaluable' | 'consistent' | 'prose_target';

export type PropagationEligibility =
  | { eligible: true }
  | { eligible: false; reason: PropagationSkipReason };

export function propagationEligibility(impact: BindingImpact): PropagationEligibility {
  if (impact.outcome === 'override') return { eligible: false, reason: 'override' };
  if (impact.outcome === 'not_evaluable') return { eligible: false, reason: 'not_evaluable' };
  if (impact.outcome === 'consistent') return { eligible: false, reason: 'consistent' };
  if (impact.claimId === null) return { eligible: false, reason: 'prose_target' };
  return { eligible: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Impact summary
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

export interface FactChangeImpactSummary {
  totalBindings: number;
  willDrift: number;
  consistent: number;
  overridden: number;
  notEvaluable: number;
  /** Distinct claims whose bound value will diverge under the proposal. */
  affectedClaimIds: number[];
  highestSeverity: Severity | null;
  /** High/critical divergence means the propagated update needs re-approval. */
  requiresReapproval: boolean;
}

export function summarizeImpacts(impacts: BindingImpact[]): FactChangeImpactSummary {
  const drifting = impacts.filter(i => i.outcome === 'will_drift');
  const affectedClaimIds = [
    ...new Set(drifting.map(i => i.claimId).filter((id): id is number => id !== null)),
  ];
  let highest: Severity | null = null;
  for (const i of drifting) {
    if (highest === null || SEVERITY_ORDER.indexOf(i.severity) > SEVERITY_ORDER.indexOf(highest)) {
      highest = i.severity;
    }
  }
  return {
    totalBindings: impacts.length,
    willDrift: drifting.length,
    consistent: impacts.filter(i => i.outcome === 'consistent').length,
    overridden: impacts.filter(i => i.outcome === 'override').length,
    notEvaluable: impacts.filter(i => i.outcome === 'not_evaluable').length,
    affectedClaimIds,
    highestSeverity: highest,
    requiresReapproval: highest === 'high' || highest === 'critical',
  };
}
