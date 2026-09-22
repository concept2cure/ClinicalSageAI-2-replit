/**
 * The IRB package manifest — which artifacts a board expects, and which the
 * submission actually carries.
 *
 * `docs/design/IRB_SUBMISSION.md` step 3. The slots themselves are declared in
 * `shared/regulatory/placement-vocabulary.ts`; this decides WHICH of them this
 * particular submission needs, and reports what is placed against each.
 *
 * ── The rule that shapes every branch here ───────────────────────────────────
 *
 * A requirement this submission does not record enough to judge is
 * `undetermined`, never `not_required`. The difference matters in one
 * direction only: a board that receives a package missing Form FDA 1572
 * because nobody recorded that the study runs under an IND has a real problem,
 * and it is a problem this engine would have caused by reading an unrecorded
 * field as "no". So the manifest carries `undetermined` as a first-class
 * outcome, counts it separately, and says which field would settle it.
 *
 * It also decides nothing about the study. Per D4, it may find an artifact
 * absent; it may not decide whether the research is approvable, and it does
 * not state the review category the board will apply.
 *
 * Pure and total: no I/O, no clock, no randomness. The DB-facing reader lives
 * in `irb-service.ts`.
 *
 * @module server/services/irb/package-manifest
 */

import { IRB_SLOTS, type IrbSlot } from '../../../shared/regulatory/placement-vocabulary';

/**
 * How badly the board wants it.
 *   • `required`      — expected in every package of this shape.
 *   • `conditional`   — required because something about THIS submission makes
 *                       it so, and the condition is recorded.
 *   • `undetermined`  — the condition that decides it is NOT recorded. Not a
 *                       "no". Carries the field that would settle it.
 *   • `optional`      — supporting material a board accepts but does not demand.
 *   • `not_required`  — a recorded fact takes it out of scope.
 */
export type SlotRequirement = 'required' | 'conditional' | 'undetermined' | 'optional' | 'not_required';

export interface SlotExpectation {
  slot: IrbSlot;
  label: string;
  requirement: SlotRequirement;
  /** The instrument or the recorded fact behind the verdict. */
  basis: string;
  /**
   * For `undetermined`: the field that would settle it, by name. Empty
   * otherwise. This is what turns "we could not tell" into an action.
   */
  settledBy?: string;
}

/** What the submission records about itself. Absent fields stay absent. */
export interface PackageContext {
  /** 'minimal' | 'greater_than_minimal'. */
  riskLevel?: string | null;
  /** Recorded on the submission; null when the board has not been asked yet. */
  reviewType?: string | null;
  involvesVulnerablePopulations?: boolean | null;
  /** Subpart D specifically. Absent means not recorded, NOT "no children". */
  involvesChildren?: boolean | null;
  /** Whether the trial runs under an IND (21 CFR 312). Absent means not recorded. */
  isIndStudy?: boolean | null;
  /** Whether protected health information is used (HIPAA). Absent means not recorded. */
  usesPhi?: boolean | null;
  consentWaiverRequested?: boolean | null;
  /** Number of participating sites recorded. */
  siteCount?: number | null;
  /** Whether the sponsor plans to recruit with advertising. Absent means not recorded. */
  usesRecruitmentMaterial?: boolean | null;
}

// ─── Bases ───────────────────────────────────────────────────────────────────

const B_56_115 = '21 CFR 56.115(a)(1) — the board keeps the protocol and consent documents on file';
const B_50_25 = '21 CFR 50.25 — the elements of informed consent';
const B_46_408 = '45 CFR 46.408 — child assent and parental permission (Subpart D)';
const B_46_116 = '45 CFR 46.116 — consent, including the key-information summary';
const B_312_53 = "21 CFR 312.53(c)(1)-(c)(2) — the signed Form FDA 1572 and the investigator's curriculum vitae or statement of qualifications";
const B_54 = '21 CFR 312.53(c)(4) and 21 CFR part 54 — financial disclosure by clinical investigators';
const B_56_111 = '21 CFR 56.111(a)(6) — data monitoring for subject safety';
const B_HIPAA = '45 CFR 164.508 — authorization for use or disclosure of protected health information';
const B_BOARD = "Supporting material most boards accept; not demanded by a regulation";

// ─── The expectation table ───────────────────────────────────────────────────

function always(slot: IrbSlot, basis: string): SlotExpectation {
  return { slot, label: IRB_SLOTS[slot], requirement: 'required', basis };
}

function optional(slot: IrbSlot, basis = B_BOARD): SlotExpectation {
  return { slot, label: IRB_SLOTS[slot], requirement: 'optional', basis };
}

/**
 * Resolve one flag-gated slot.
 *
 * `true` makes it conditional-required, `false` takes it out of scope, and
 * ABSENT leaves it undetermined with the field that would settle it. That
 * third branch is the whole point of this function.
 */
function gated(
  slot: IrbSlot,
  flag: boolean | null | undefined,
  args: { whenTrue: string; whenFalse: string; field: string; basis: string },
): SlotExpectation {
  const label = IRB_SLOTS[slot];
  if (flag === true) return { slot, label, requirement: 'conditional', basis: `${args.basis}. ${args.whenTrue}` };
  if (flag === false) return { slot, label, requirement: 'not_required', basis: args.whenFalse };
  return {
    slot,
    label,
    requirement: 'undetermined',
    basis: `${args.basis}. This submission does not record whether it applies, so the requirement could not be decided. An unrecorded field is not a record that it does not apply.`,
    settledBy: args.field,
  };
}

/** What a board expects of THIS submission. Pure; order is stable. */
export function expectationsFor(ctx: PackageContext): SlotExpectation[] {
  return [
    always('irb.protocol', B_56_115),
    always('irb.investigator-cv', B_312_53),
    always('irb.application-form', "The board's own form; every IRB has one"),

    consentExpectation(ctx),
    gated('irb.assent', ctx.involvesChildren, {
      basis: B_46_408,
      whenTrue: 'This submission records that children are involved.',
      whenFalse: 'This submission records that no children are involved.',
      field: 'involvesChildren',
    }),
    gated('irb.hipaa-authorization', ctx.usesPhi, {
      basis: B_HIPAA,
      whenTrue: 'This submission records that protected health information is used.',
      whenFalse: 'This submission records that no protected health information is used.',
      field: 'usesPhi',
    }),
    gated('irb.form-1572', ctx.isIndStudy, {
      basis: B_312_53,
      whenTrue: 'This submission records an IND study.',
      whenFalse: 'This submission records that it is not an IND study.',
      field: 'isIndStudy',
    }),
    gated('irb.financial-disclosure', ctx.isIndStudy, {
      basis: B_54,
      whenTrue: 'This submission records an IND study.',
      whenFalse: 'This submission records that it is not an IND study.',
      field: 'isIndStudy',
    }),
    gated('irb.recruitment-material', ctx.usesRecruitmentMaterial, {
      basis: '21 CFR 56.111(a)(3)-(a)(4) and FDA Information Sheet Guidance "Recruiting Study Subjects" — FDA treats direct advertising as the start of the subject-selection and informed-consent process, so the IRB reviews the material itself',
      whenTrue: 'This submission records that recruitment material is used.',
      whenFalse: 'This submission records that no recruitment material is used.',
      field: 'usesRecruitmentMaterial',
    }),
    monitoringExpectation(ctx),

    optional('irb.investigator-brochure', 'Expected where an investigational product has one'),
    optional('irb.investigator-licence'),
    optional('irb.subject-facing-material'),
    optional('irb.site-documentation'),
    optional('irb.laboratory-certification'),
    optional('irb.budget-and-agreement'),
    optional('irb.other'),
  ];
}

/**
 * Consent. A requested waiver does not remove the consent document from the
 * package — the board decides whether to grant it, and until it does the
 * document is still expected. Recording the request as "consent not required"
 * would let a sponsor opt out of consent by asking.
 */
function consentExpectation(ctx: PackageContext): SlotExpectation {
  const label = IRB_SLOTS['irb.consent'];
  if (ctx.consentWaiverRequested === true) {
    return {
      slot: 'irb.consent',
      label,
      requirement: 'required',
      basis: `${B_46_116}. A waiver has been REQUESTED, which is not a waiver granted — the board decides, and until it does the consent document is still expected.`,
    };
  }
  return { slot: 'irb.consent', label, requirement: 'required', basis: B_50_25 };
}

/**
 * The safety monitoring plan. 21 CFR 56.111(a)(6) attaches it to research
 * involving more than minimal risk, so a recorded minimal-risk study does not
 * need one and an unrecorded risk level cannot be judged.
 */
function monitoringExpectation(ctx: PackageContext): SlotExpectation {
  const label = IRB_SLOTS['irb.safety-monitoring-plan'];
  if (ctx.riskLevel === 'greater_than_minimal') {
    return { slot: 'irb.safety-monitoring-plan', label, requirement: 'conditional', basis: `${B_56_111}. This submission records greater-than-minimal risk.` };
  }
  if (ctx.riskLevel === 'minimal') {
    return { slot: 'irb.safety-monitoring-plan', label, requirement: 'optional', basis: `${B_56_111}. This submission records minimal risk, so a monitoring plan is not demanded — boards still accept one.` };
  }
  return {
    slot: 'irb.safety-monitoring-plan',
    label,
    requirement: 'undetermined',
    basis: `${B_56_111}. This submission records no risk level, so the requirement could not be decided.`,
    settledBy: 'riskLevel',
  };
}

// ─── The manifest ────────────────────────────────────────────────────────────

/** A document placed at a slot, as the submission's leaves record it. */
export interface PlacedArtifact {
  slot: string;
  leafId: number;
  title: string;
  /** True when the leaf names a document store and a key within it. */
  resolvable: boolean;
}

export interface ManifestRow extends SlotExpectation {
  placed: PlacedArtifact[];
  /**
   * `satisfied` needs at least one RESOLVABLE placement. A leaf that names no
   * document is a placeholder, and a package assembled from placeholders is
   * the failure this distinction exists to prevent.
   */
  satisfied: boolean;
  /** Placed but pointing at nothing a resolver can materialize. */
  unresolvable: number;
}

export interface PackageManifest {
  rows: ManifestRow[];
  counts: {
    required: number;
    requiredSatisfied: number;
    conditional: number;
    conditionalSatisfied: number;
    /** Requirements that could not be decided. Never folded into the others. */
    undetermined: number;
    /** Placements that name no resolvable document. */
    unresolvable: number;
    /** Placed at a slot no expectation covers. */
    unexpected: number;
  };
  /**
   * True only when every `required` and `conditional` row is satisfied, no
   * placement is unresolvable, and NOTHING is undetermined. An undetermined
   * requirement blocks readiness by design: "we could not tell" is not a
   * finished package.
   */
  readyToAssemble: boolean;
  /** Slots with placements that no expectation covers, by code. */
  unexpectedSlots: string[];
}

export function buildPackageManifest(ctx: PackageContext, placed: PlacedArtifact[]): PackageManifest {
  const bySlot = new Map<string, PlacedArtifact[]>();
  for (const p of placed) {
    const list = bySlot.get(p.slot) ?? [];
    list.push(p);
    bySlot.set(p.slot, list);
  }

  const expectations = expectationsFor(ctx);
  const rows: ManifestRow[] = expectations.map((e) => {
    const mine = (bySlot.get(e.slot) ?? []).slice().sort((a, b) => a.leafId - b.leafId);
    return {
      ...e,
      placed: mine,
      satisfied: mine.some((p) => p.resolvable),
      unresolvable: mine.filter((p) => !p.resolvable).length,
    };
  });

  const covered = new Set(expectations.map((e) => e.slot as string));
  const unexpectedSlots = [...bySlot.keys()].filter((s) => !covered.has(s)).sort();

  const counts = {
    required: rows.filter((r) => r.requirement === 'required').length,
    requiredSatisfied: rows.filter((r) => r.requirement === 'required' && r.satisfied).length,
    conditional: rows.filter((r) => r.requirement === 'conditional').length,
    conditionalSatisfied: rows.filter((r) => r.requirement === 'conditional' && r.satisfied).length,
    undetermined: rows.filter((r) => r.requirement === 'undetermined').length,
    unresolvable: rows.reduce((n, r) => n + r.unresolvable, 0) + unexpectedUnresolvable(bySlot, covered),
    unexpected: unexpectedSlots.reduce((n, s) => n + (bySlot.get(s)?.length ?? 0), 0),
  };

  return {
    rows,
    counts,
    readyToAssemble:
      counts.required === counts.requiredSatisfied &&
      counts.conditional === counts.conditionalSatisfied &&
      counts.undetermined === 0 &&
      counts.unresolvable === 0,
    unexpectedSlots,
  };
}

function unexpectedUnresolvable(bySlot: Map<string, PlacedArtifact[]>, covered: Set<string>): number {
  let n = 0;
  for (const [slot, list] of bySlot) {
    if (!covered.has(slot)) n += list.filter((p) => !p.resolvable).length;
  }
  return n;
}
