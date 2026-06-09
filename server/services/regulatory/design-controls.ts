/**
 * Design controls engine — Design History File (DHF) traceability + completeness.
 *
 * Pure and deterministic. Closes the Tier-1 audit gap "Design Controls / DHF —
 * absent": there was no model for design inputs/outputs/reviews/V&V or a
 * requirements→risk→verification traceability matrix.
 *
 * Regulatory backbone:
 *   - 21 CFR 820.30      — Design controls (FDA QSR / QMSR)
 *   - 21 CFR 820.30(b)   — Design and development planning
 *   - 21 CFR 820.30(c)   — Design input
 *   - 21 CFR 820.30(d)   — Design output
 *   - 21 CFR 820.30(e)   — Design review
 *   - 21 CFR 820.30(f)   — Design verification
 *   - 21 CFR 820.30(g)   — Design validation
 *   - 21 CFR 820.30(h)   — Design transfer
 *   - 21 CFR 820.30(i)   — Design changes
 *   - 21 CFR 820.30(j)   — Design History File (DHF)
 *   - ISO 13485:2016 §7.3 — Design and development
 */

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

export interface DesignInput {
  id: string;
  requirement: string;
  /** Category helps reviewers confirm coverage of all input classes. */
  category:
    | 'intended_use'
    | 'user_need'
    | 'functional'
    | 'performance'
    | 'safety'
    | 'regulatory'
    | 'usability'
    | 'interface';
  /** Optional link to a risk item (ISO 14971) that motivated this input. */
  riskItemRef?: string | null;
}

export interface DesignOutput {
  id: string;
  description: string;
  /** Design inputs this output satisfies. */
  satisfiesInputIds: string[];
  /** Acceptance criteria must exist for an output to be verifiable (820.30(d)). */
  hasAcceptanceCriteria: boolean;
}

export interface VerificationActivity {
  id: string;
  description: string;
  /** Outputs whose conformance to inputs this activity confirms. */
  verifiesOutputIds: string[];
  result?: 'pass' | 'fail' | 'pending';
}

export interface ValidationActivity {
  id: string;
  description: string;
  /** Design inputs / user needs this activity confirms are met in use. */
  validatesInputIds: string[];
  /** Validation must use production-equivalent units (820.30(g)). */
  productionEquivalent: boolean;
  result?: 'pass' | 'fail' | 'pending';
}

export interface DesignReview {
  id: string;
  phase: string;
  /** A review needs an independent reviewer to be compliant (820.30(e)). */
  independentReviewerPresent: boolean;
  actionItemsOpen: number;
}

export interface DesignChange {
  id: string;
  description: string;
  reviewed: boolean;
  verifiedOrValidated: boolean;
}

export interface DhfInput {
  hasDesignPlan: boolean;
  inputs: DesignInput[];
  outputs: DesignOutput[];
  verifications: VerificationActivity[];
  validations: ValidationActivity[];
  reviews: DesignReview[];
  changes?: DesignChange[];
  /** Whether design transfer to production has been documented (820.30(h)). */
  designTransferDocumented: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Traceability matrix
// ─────────────────────────────────────────────────────────────────────────────

export interface TraceabilityRow {
  inputId: string;
  requirement: string;
  outputIds: string[];
  verificationIds: string[];
  validationIds: string[];
  riskItemRef: string | null;
  /** True only when input → output → verification AND input → validation exist. */
  fullyTraced: boolean;
  gaps: string[];
}

export interface TraceabilityMatrix {
  rows: TraceabilityRow[];
  /** Outputs not linked to any input (orphans). */
  orphanOutputIds: string[];
  /** Verifications that reference a non-existent output. */
  danglingVerificationIds: string[];
  /** Share of inputs that are fully traced (0–1). */
  tracedShare: number;
  fullyTracedCount: number;
}

/** Build the requirements→output→verification + requirements→validation matrix. */
export function buildTraceabilityMatrix(dhf: DhfInput): TraceabilityMatrix {
  const outputById = new Map(dhf.outputs.map(o => [o.id, o]));
  const outputIds = new Set(dhf.outputs.map(o => o.id));

  // input → outputs
  const outputsByInput = new Map<string, string[]>();
  for (const o of dhf.outputs) {
    for (const inId of o.satisfiesInputIds) {
      const arr = outputsByInput.get(inId) ?? [];
      arr.push(o.id);
      outputsByInput.set(inId, arr);
    }
  }

  // output → verifications
  const verificationsByOutput = new Map<string, string[]>();
  const danglingVerificationIds: string[] = [];
  for (const v of dhf.verifications) {
    let dangles = v.verifiesOutputIds.length === 0;
    for (const outId of v.verifiesOutputIds) {
      if (!outputIds.has(outId)) {
        dangles = true;
        continue;
      }
      const arr = verificationsByOutput.get(outId) ?? [];
      arr.push(v.id);
      verificationsByOutput.set(outId, arr);
    }
    if (dangles) danglingVerificationIds.push(v.id);
  }

  // input → validations
  const validationsByInput = new Map<string, string[]>();
  for (const val of dhf.validations) {
    for (const inId of val.validatesInputIds) {
      const arr = validationsByInput.get(inId) ?? [];
      arr.push(val.id);
      validationsByInput.set(inId, arr);
    }
  }

  const rows: TraceabilityRow[] = dhf.inputs.map(input => {
    const outIds = outputsByInput.get(input.id) ?? [];
    const verIds = [
      ...new Set(outIds.flatMap(oid => verificationsByOutput.get(oid) ?? [])),
    ];
    const valIds = validationsByInput.get(input.id) ?? [];

    const gaps: string[] = [];
    if (outIds.length === 0) gaps.push('No design output satisfies this input.');
    else if (outIds.some(oid => !outputById.get(oid)?.hasAcceptanceCriteria)) {
      gaps.push('A satisfying design output lacks acceptance criteria.');
    }
    if (verIds.length === 0) gaps.push('No verification confirms the output(s) for this input.');
    if (valIds.length === 0) gaps.push('No validation confirms this input is met in use.');

    const fullyTraced = outIds.length > 0 && verIds.length > 0 && valIds.length > 0;
    return {
      inputId: input.id,
      requirement: input.requirement,
      outputIds: outIds,
      verificationIds: verIds,
      validationIds: valIds,
      riskItemRef: input.riskItemRef ?? null,
      fullyTraced,
      gaps,
    };
  });

  const linkedOutputIds = new Set(
    dhf.outputs.filter(o => o.satisfiesInputIds.length > 0).map(o => o.id)
  );
  const orphanOutputIds = dhf.outputs
    .filter(o => !linkedOutputIds.has(o.id))
    .map(o => o.id);

  const fullyTracedCount = rows.filter(r => r.fullyTraced).length;
  return {
    rows,
    orphanOutputIds,
    danglingVerificationIds,
    tracedShare: rows.length === 0 ? 0 : fullyTracedCount / rows.length,
    fullyTracedCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DHF completeness
// ─────────────────────────────────────────────────────────────────────────────

export const DHF_ELEMENTS = [
  'designPlan', // 820.30(b)
  'designInputs', // 820.30(c)
  'designOutputs', // 820.30(d)
  'designReviews', // 820.30(e)
  'designVerification', // 820.30(f)
  'designValidation', // 820.30(g)
  'designTransfer', // 820.30(h)
  'designChanges', // 820.30(i)
  'traceability', // 820.30(j) DHF expectation
] as const;
export type DhfElement = (typeof DHF_ELEMENTS)[number];

export interface DhfCompleteness {
  present: DhfElement[];
  gaps: DhfElement[];
  /** 0–1 share of DHF elements satisfied. */
  completenessScore: number;
  traceability: TraceabilityMatrix;
  /** Hard blockers that would fail a design-control audit. */
  blockers: string[];
  auditReady: boolean;
}

/** Assess DHF completeness against 21 CFR 820.30 / ISO 13485 §7.3. */
export function assessDhfCompleteness(dhf: DhfInput): DhfCompleteness {
  const traceability = buildTraceabilityMatrix(dhf);
  const present: DhfElement[] = [];
  const gaps: DhfElement[] = [];

  const has: Record<DhfElement, boolean> = {
    designPlan: dhf.hasDesignPlan,
    designInputs: dhf.inputs.length > 0,
    designOutputs: dhf.outputs.length > 0,
    designReviews:
      dhf.reviews.length > 0 && dhf.reviews.some(r => r.independentReviewerPresent),
    designVerification:
      dhf.verifications.length > 0 && dhf.verifications.some(v => v.result === 'pass'),
    designValidation:
      dhf.validations.length > 0 &&
      dhf.validations.some(v => v.result === 'pass' && v.productionEquivalent),
    designTransfer: dhf.designTransferDocumented,
    designChanges: (dhf.changes ?? []).every(c => c.reviewed && c.verifiedOrValidated),
    traceability: traceability.tracedShare >= 1,
  };

  for (const el of DHF_ELEMENTS) {
    if (has[el]) present.push(el);
    else gaps.push(el);
  }

  const blockers: string[] = [];
  if (!has.designInputs) blockers.push('No design inputs defined (820.30(c)).');
  if (!has.designOutputs) blockers.push('No design outputs defined (820.30(d)).');
  if (dhf.reviews.length > 0 && !dhf.reviews.some(r => r.independentReviewerPresent)) {
    blockers.push('No design review includes an independent reviewer (820.30(e)).');
  }
  if (dhf.validations.length > 0 && !dhf.validations.some(v => v.productionEquivalent)) {
    blockers.push('Design validation not performed on production-equivalent units (820.30(g)).');
  }
  if (traceability.danglingVerificationIds.length > 0) {
    blockers.push('Verification activities reference non-existent design outputs.');
  }
  for (const c of dhf.changes ?? []) {
    if (!c.reviewed || !c.verifiedOrValidated) {
      blockers.push(`Design change ${c.id} not reviewed/verified (820.30(i)).`);
    }
  }

  const completenessScore = present.length / DHF_ELEMENTS.length;
  return {
    present,
    gaps,
    completenessScore,
    traceability,
    blockers,
    auditReady: blockers.length === 0 && completenessScore >= 1,
  };
}
