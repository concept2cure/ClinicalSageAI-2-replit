/**
 * Design controls engine — design and development traceability + completeness.
 *
 * Pure and deterministic. Closes the Tier-1 audit gap "Design Controls / DHF —
 * absent": there was no model for design inputs/outputs/reviews/V&V or a
 * requirements→risk→verification traceability matrix.
 *
 * Regulatory backbone — one record, shared/regulatory/qmsr-crosswalk.ts:
 *   - On and after 2026-02-02 (QMSR): 21 CFR 820.10(c) → ISO 13485:2016 §7.3
 *     and its subclauses §7.3.2–§7.3.10. The QSR design-control section
 *     21 CFR 820.30 is removed and is named only as "formerly".
 *   - Before 2026-02-02 (QSR): 21 CFR 820.30(b)–(j).
 * Every citation this engine emits is `citeQms(element, asOf)`; the element
 * list DHF_ELEMENTS is the crosswalk's §7.3.x rows, in crosswalk order.
 *
 * 2026-10-05 (g-design-control-lists-one-home): the engine cited 820.30(x) as
 * the requirement on every date and hard-blocked on the QSR 820.30(e)
 * independent reviewer. The QMSR carries no independent-reviewer requirement:
 * ISO 13485:2016 §7.3.5 names the review participants as representatives of
 * the functions concerned with the stage reviewed and other specialist
 * personnel (ISO text, recall). From the effective date a review without an
 * independent reviewer is an advisory, not a blocker. Facts:
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-design-control-lists-one-home-facts.md
 */

import {
  QMSR_CROSSWALK,
  QMSR_EFFECTIVE,
  citeQms,
  type QmsrCrosswalkId,
} from '../../../shared/regulatory/qmsr-crosswalk.js';

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
  /** Acceptance criteria must exist for an output to be verifiable (ISO 13485:2016 §7.3.4; formerly 820.30(d)). */
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
  /** Validation must use representative, production-equivalent units (ISO 13485:2016 §7.3.7; formerly 820.30(g)). */
  productionEquivalent: boolean;
  result?: 'pass' | 'fail' | 'pending';
}

export interface DesignReview {
  id: string;
  phase: string;
  /**
   * Whether an independent reviewer took part. Required by the QSR (820.30(e),
   * before 2026-02-02); an advisory under the QMSR (ISO 13485:2016 §7.3.5).
   */
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
  /** Whether design transfer to production has been documented (ISO 13485:2016 §7.3.8; formerly 820.30(h)). */
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

/** The design-control element ids: the crosswalk's ISO 13485:2016 §7.3.x rows. */
export type DhfElement = Extract<
  QmsrCrosswalkId,
  | 'designPlan'
  | 'designInputs'
  | 'designOutputs'
  | 'designReviews'
  | 'designVerification'
  | 'designValidation'
  | 'designTransfer'
  | 'designChanges'
  | 'traceability'
>;

/**
 * The design-control elements, in crosswalk order. Derived from
 * shared/regulatory/qmsr-crosswalk.ts — the same rows DesignControls.tsx and
 * combination-products-knowledge.ts read — so the list has one home.
 */
export const DHF_ELEMENTS: readonly DhfElement[] = Object.freeze(
  QMSR_CROSSWALK.filter((r) => /^7\.3\.\d+$/.test(r.iso13485Clause)).map((r) => r.id as DhfElement),
);

export interface DhfCompleteness {
  present: DhfElement[];
  gaps: DhfElement[];
  /** 0–1 share of DHF elements satisfied. */
  completenessScore: number;
  traceability: TraceabilityMatrix;
  /** Hard blockers that would fail a design-control audit. */
  blockers: string[];
  /** Findings worth acting on that are not a requirement on `asOf`. */
  advisories: string[];
  /** The date the assessment was made against (YYYY-MM-DD). */
  asOf: string;
  auditReady: boolean;
}

/** Today's UTC date, YYYY-MM-DD: the default `asOf` at this engine's edge. */
function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Assess design-control completeness as at `asOf` (YYYY-MM-DD; defaults to
 * today, UTC). Citations come from `citeQms(element, asOf)`; a malformed date
 * throws rather than guessing which regulation applies.
 */
export function assessDhfCompleteness(dhf: DhfInput, asOf: string = utcToday()): DhfCompleteness {
  const cite = (el: DhfElement): string => citeQms(el, asOf);
  // Validates asOf up front, so a bad date fails closed on every input.
  cite('designInputs');
  const qmsr = asOf >= QMSR_EFFECTIVE;
  const traceability = buildTraceabilityMatrix(dhf);
  const present: DhfElement[] = [];
  const gaps: DhfElement[] = [];
  const independentReview = dhf.reviews.some(r => r.independentReviewerPresent);

  const has: Record<DhfElement, boolean> = {
    designPlan: dhf.hasDesignPlan,
    designInputs: dhf.inputs.length > 0,
    designOutputs: dhf.outputs.length > 0,
    // QSR 820.30(e) required an independent reviewer; ISO 13485:2016 §7.3.5 does not.
    designReviews: dhf.reviews.length > 0 && (qmsr || independentReview),
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
  const advisories: string[] = [];
  if (!has.designInputs) blockers.push(`No design inputs defined (${cite('designInputs')}).`);
  if (!has.designOutputs) blockers.push(`No design outputs defined (${cite('designOutputs')}).`);
  if (dhf.reviews.length > 0 && !independentReview) {
    if (qmsr) {
      advisories.push(
        `No design review records an independent reviewer. Not required on ${asOf}: ` +
          `${cite('designReviews')} — ISO 13485:2016 §7.3.5 requires the review participants to include ` +
          'representatives of the functions concerned with the stage being reviewed and other specialist ' +
          'personnel. Record who took part and in what function.',
      );
    } else {
      blockers.push(`No design review includes an independent reviewer (${cite('designReviews')}).`);
    }
  }
  if (dhf.validations.length > 0 && !dhf.validations.some(v => v.productionEquivalent)) {
    blockers.push(
      `Design validation not performed on production-equivalent units (${cite('designValidation')}).`,
    );
  }
  if (traceability.danglingVerificationIds.length > 0) {
    blockers.push('Verification activities reference non-existent design outputs.');
  }
  for (const c of dhf.changes ?? []) {
    if (!c.reviewed || !c.verifiedOrValidated) {
      blockers.push(`Design change ${c.id} not reviewed/verified (${cite('designChanges')}).`);
    }
  }

  const completenessScore = present.length / DHF_ELEMENTS.length;
  return {
    present,
    gaps,
    completenessScore,
    traceability,
    blockers,
    advisories,
    asOf,
    auditReady: blockers.length === 0 && completenessScore >= 1,
  };
}
