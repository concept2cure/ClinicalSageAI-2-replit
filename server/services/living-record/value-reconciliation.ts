/**
 * Living Record Spine — pure value reconciliation.
 *
 * The deterministic core of the Reconciliation Engine: comparing an observed
 * value to a canonical fact, and deciding whether a claim establishes / agrees
 * with / disputes a fact. No database, no I/O — every function here is pure and
 * total so it can be unit-tested exhaustively and reused by both the
 * reconcile-on-write path and the Drift Sentinel job.
 *
 * See docs/architecture/LIVING_RECORD_SPINE.md §3.3–3.4.
 */

import type {
  ClaimVerification,
  DriftType,
  FactStatus,
} from '../../../shared/schema/living-record-spine';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

// ─────────────────────────────────────────────────────────────────────────────
// Value views (plain data, decoupled from Drizzle rows)
// ─────────────────────────────────────────────────────────────────────────────

export interface FactValueView {
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  valueType: string; // count | measure | date | categorical | boolean | text
}

export interface ClaimValueView {
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  valueType: string;
  hasValue: boolean;
}

export interface BindingView {
  bindingKind: 'mirror' | 'derived' | 'manual_override';
  observedValue: string | null;
  observedUnit?: string | null;
  transform?: Record<string, unknown> | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Value normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Number → canonical string. JS already strips trailing zeros (3.0 → "3"). */
export function numToCanonical(n: number): string {
  return String(n);
}

/** The canonical string form of a fact value, for display + text comparison. */
export function toCanonicalValue(v: FactValueView): string {
  if (v.valueNum !== null && v.valueNum !== undefined) return numToCanonical(v.valueNum);
  return (v.valueText ?? '').trim();
}

/** Extract the first number from a string ("1,234 subjects" → 1234), or null. */
export function parseLeadingNumber(s: string): number | null {
  const cleaned = s.replace(/,/g, '');
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived-value transforms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a derived-binding transform to a numeric fact value. Supports a small,
 * explicit set; an unrecognized transform returns null so the caller can decide
 * not to assert drift on something it cannot evaluate.
 *
 *   { fn: 'identity' }
 *   { fn: 'round', decimals: 0 }
 *   { fn: 'scale', factor: 1000 }
 */
export function applyTransform(value: number, transform: Record<string, unknown> | null | undefined): number | null {
  if (!transform || !transform.fn) return value; // no transform = identity
  switch (transform.fn) {
    case 'identity':
      return value;
    case 'round': {
      const decimals = typeof transform.decimals === 'number' ? transform.decimals : 0;
      const f = Math.pow(10, decimals);
      return Math.round(value * f) / f;
    }
    case 'scale': {
      const factor = typeof transform.factor === 'number' ? transform.factor : null;
      return factor === null ? null : value * factor;
    }
    default:
      return null; // unrecognized — not evaluable
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

export interface ValueComparison {
  equal: boolean;
  driftType: DriftType | null;
  relativeDelta: number | null; // for numeric measures
}

/**
 * Compare an observed value (with optional unit) to a fact value. `tolerance`
 * is the relative tolerance for `measure` value types (default 0 — exact).
 * Counts always compare exactly.
 */
export function compareValues(params: {
  fact: FactValueView;
  observed: string | null | undefined;
  observedUnit?: string | null;
  expectedNumOverride?: number | null; // used when a derived transform was applied
  tolerance?: number;
}): ValueComparison {
  const observed = (params.observed ?? '').trim();
  if (observed === '') {
    return { equal: false, driftType: 'missing_target', relativeDelta: null };
  }

  const isNumericFact =
    params.expectedNumOverride !== null && params.expectedNumOverride !== undefined
      ? true
      : params.fact.valueNum !== null && params.fact.valueNum !== undefined;

  if (isNumericFact) {
    const expectedNum =
      params.expectedNumOverride !== null && params.expectedNumOverride !== undefined
        ? params.expectedNumOverride
        : (params.fact.valueNum as number);

    // Unit mismatch only when both units are known and differ.
    if (
      params.observedUnit &&
      params.fact.unit &&
      params.observedUnit.trim().toLowerCase() !== params.fact.unit.trim().toLowerCase()
    ) {
      return { equal: false, driftType: 'unit_mismatch', relativeDelta: null };
    }

    const observedNum = parseLeadingNumber(observed);
    if (observedNum === null) {
      return { equal: false, driftType: 'value_mismatch', relativeDelta: null };
    }

    const tolerance = params.fact.valueType === 'measure' ? params.tolerance ?? 0 : 0;
    const denom = Math.abs(expectedNum) > 0 ? Math.abs(expectedNum) : 1;
    const relativeDelta = Math.abs(observedNum - expectedNum) / denom;

    if (relativeDelta <= tolerance) {
      return { equal: true, driftType: null, relativeDelta };
    }
    return { equal: false, driftType: 'value_mismatch', relativeDelta };
  }

  // Text fact: trimmed, case-insensitive compare.
  const expectedText = (params.fact.valueText ?? '').trim().toLowerCase();
  if (expectedText === observed.toLowerCase()) {
    return { equal: true, driftType: null, relativeDelta: null };
  }
  return { equal: false, driftType: 'value_mismatch', relativeDelta: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift detection (Drift Sentinel core)
// ─────────────────────────────────────────────────────────────────────────────

export interface DriftFinding {
  drift: boolean;
  driftType: DriftType | null;
  expected: string;
  observed: string;
  severity: Severity;
}

function severityFor(driftType: DriftType | null, relativeDelta: number | null): Severity {
  if (driftType === 'missing_target') return 'high';
  if (driftType === 'unit_mismatch') return 'high';
  if (driftType === 'value_mismatch') {
    if (relativeDelta !== null && relativeDelta > 0.1) return 'high';
    return 'medium';
  }
  return 'low';
}

/**
 * Compare a binding's observed value to its fact. Returns a drift finding;
 * `drift=false` means the value agrees (or the binding is a manual override or a
 * derived binding whose transform cannot be evaluated, both of which suppress
 * drift by design).
 */
export function detectDrift(
  binding: BindingView,
  fact: FactValueView,
  opts?: { tolerance?: number }
): DriftFinding {
  const expected = toCanonicalValue(fact);
  const observed = (binding.observedValue ?? '').trim();

  if (binding.bindingKind === 'manual_override') {
    return { drift: false, driftType: null, expected, observed, severity: 'low' };
  }

  let expectedNumOverride: number | null | undefined = undefined;
  if (binding.bindingKind === 'derived' && fact.valueNum !== null && fact.valueNum !== undefined) {
    const transformed = applyTransform(fact.valueNum, binding.transform);
    if (transformed === null) {
      // Transform not evaluable — do not assert drift on something we can't compute.
      return { drift: false, driftType: null, expected, observed, severity: 'low' };
    }
    expectedNumOverride = transformed;
  }

  const cmp = compareValues({
    fact,
    observed: binding.observedValue,
    observedUnit: binding.observedUnit,
    expectedNumOverride,
    tolerance: opts?.tolerance,
  });

  const expectedOut =
    expectedNumOverride !== null && expectedNumOverride !== undefined
      ? numToCanonical(expectedNumOverride)
      : expected;

  return {
    drift: !cmp.equal,
    driftType: cmp.equal ? null : cmp.driftType,
    expected: expectedOut,
    observed,
    severity: cmp.equal ? 'low' : severityFor(cmp.driftType, cmp.relativeDelta),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile-on-write
// ─────────────────────────────────────────────────────────────────────────────

export type ReconcileVerdict = 'established' | 'agreed' | 'disputed' | 'skipped';

export interface ReconcileResult {
  verdict: ReconcileVerdict;
  reason: string;
  claimVerification: ClaimVerification;
  factStatusAfter: FactStatus | null;
}

/**
 * Decide what happens when a claim that carries a value meets the canonical fact
 * for its (entity, field):
 *   - no value          → skipped (stays a prose claim, never bound)
 *   - no existing fact   → the claim establishes the fact (verified)
 *   - value agrees       → the claim binds and is verified; fact stays active
 *   - value disagrees    → the fact is disputed and so is the claim
 *
 * The engine never silently overwrites an agreed value; a dispute is surfaced
 * and resolved as a governed action.
 */
export function reconcileClaimValue(params: {
  claim: ClaimValueView;
  existingFact: FactValueView | null;
  tolerance?: number;
}): ReconcileResult {
  if (!params.claim.hasValue) {
    return {
      verdict: 'skipped',
      reason: 'claim carries no structured value',
      claimVerification: 'unverified',
      factStatusAfter: null,
    };
  }

  if (!params.existingFact) {
    return {
      verdict: 'established',
      reason: 'no canonical fact existed; claim establishes it',
      claimVerification: 'verified',
      factStatusAfter: 'active',
    };
  }

  const observed =
    params.claim.valueNum !== null && params.claim.valueNum !== undefined
      ? numToCanonical(params.claim.valueNum)
      : (params.claim.valueText ?? '').trim();

  const cmp = compareValues({
    fact: params.existingFact,
    observed,
    observedUnit: params.claim.unit,
    tolerance: params.tolerance,
  });

  if (cmp.equal) {
    return {
      verdict: 'agreed',
      reason: 'claim value agrees with the canonical fact',
      claimVerification: 'verified',
      factStatusAfter: 'active',
    };
  }

  return {
    verdict: 'disputed',
    reason: `claim value diverges from the canonical fact (${cmp.driftType})`,
    claimVerification: 'disputed',
    factStatusAfter: 'disputed',
  };
}
