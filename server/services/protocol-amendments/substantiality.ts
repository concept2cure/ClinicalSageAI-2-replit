/**
 * Amendment substantiality — EU CTR 536/2014 Article 16, derived from what
 * actually changed rather than from what the sponsor called it.
 *
 * `classifyAmendmentImpact` maps a DECLARED amendment type onto a US IRB
 * review path (45 CFR 46.110 / 21 CFR 56.110). It is correct and it stays. But
 * the declaration is an input there, so the engine cannot disagree with it,
 * and nothing in this platform compared the two protocol versions.
 *
 * Under Regulation (EU) No 536/2014 a modification is "substantial" when it is
 * likely to have a substantial impact on the safety or rights of the subjects,
 * or on the reliability and robustness of the data generated (Article 2(2)(13)),
 * and a substantial modification requires authorisation before implementation
 * (Article 16). That test is about the EFFECT of the change. This module
 * evaluates it against the structural delta (`design-delta.ts`) and the
 * participant-burden delta (`study-design/burden-delta.ts`).
 *
 * ── The one rule that governs this file ──────────────────────────────────────
 *
 * **It never returns "non-substantial."**
 *
 * The strongest negative it will emit is `no_indicator_found`, and that carries
 * a message saying in words that it is not a determination of
 * non-substantiality. The reason is not caution for its own sake: a sponsor who
 * reads "non-substantial" and therefore does not apply for authorisation of a
 * substantial modification has a regulatory problem that this tool caused. The
 * determination under Article 16 is the sponsor's to make and record. What this
 * module supplies is the evidence — every indicator that fired, and, just as
 * importantly, every field it could not compare.
 *
 * Pure and total: no I/O, no clock, no randomness. Nothing here reads free text
 * to guess at clinical meaning, and no threshold is invented and presented as
 * if the regulation set one.
 *
 * @module server/services/protocol-amendments/substantiality
 */

import type { BurdenDelta } from '../study-design/burden-delta';
import { changedFields, type Changed, type DesignDelta } from './design-delta';
import type { AmendmentType } from './protocol-amendments-logic';

// ─── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * `not_assessed` is load-bearing. It means the comparison could not be made,
 * which is not the same as the indicator being absent.
 */
export type IndicatorStatus = 'indicated' | 'not_indicated' | 'not_assessed';

/**
 * Deliberately has no `non_substantial` member. See the module note.
 *   • `substantial`          — at least one indicator fired.
 *   • `no_indicator_found`   — everything comparable was compared and nothing fired.
 *   • `undetermined`         — something material could not be compared.
 */
export type SubstantialityVerdict = 'substantial' | 'no_indicator_found' | 'undetermined';

export interface SubstantialityIndicator {
  id: string;
  /** The instrument this indicator reads from. */
  standard: string;
  clause: string;
  title: string;
  status: IndicatorStatus;
  /** What was observed. States the fact; never a guess at clinical meaning. */
  message: string;
  /** What the sponsor does with it. */
  action: string;
}

export interface SubstantialityInput {
  /**
   * What the sponsor declared. Evidence, not the verdict — the point of this
   * module is that the declaration can be checked against the change.
   */
  declared: {
    amendmentType?: AmendmentType | null;
    affectsConsent?: boolean | null;
    affectsRisk?: boolean | null;
  };
  /** The structural delta, where two design versions exist to compare. */
  designDelta?: DesignDelta | null;
  /** The participant-burden delta, where both schedules exist. */
  burdenDelta?: BurdenDelta | null;
  /**
   * Regions the trial targets. ABSENT means not recorded, so the EU indicators
   * are not-assessed rather than skipped — a trial whose regions nobody wrote
   * down is not thereby a trial outside the EU.
   */
  regions?: string[] | null;
  /** Whether the trial has enrolled. Absent ⇒ the re-consent reach is not assessed. */
  subjectsEnrolled?: boolean | null;
}

export interface SubstantialityAssessment {
  verdict: SubstantialityVerdict;
  /** Why the verdict is what it is, in one sentence. */
  verdictReason: string;
  indicators: SubstantialityIndicator[];
  /** Comparable design fields that changed, by name. */
  changed: string[];
  /** Field names neither design version carried, so nothing could be concluded. */
  notComparable: string[];
  /** Set when the sponsor's declaration and the observed change disagree. */
  declarationConflict: string | null;
  counts: { indicated: number; notIndicated: number; notAssessed: number };
}

// ─── Citations ───────────────────────────────────────────────────────────────

const EU_DEF = 'Regulation (EU) No 536/2014, Article 2(2)(13)';
const EU_AUTH = 'Regulation (EU) No 536/2014, Article 16';
const EU = 'EU CTR 536/2014';
const US = '21 CFR 312.30';
const US_CHANGES = '21 CFR 312.30(b)(1)(i)';

const EU_ACTION =
  'Record the Article 16 determination against this evidence. If the modification is substantial, it requires authorisation through CTIS before implementation.';

// ─── Indicator construction ──────────────────────────────────────────────────

interface IndicatorSeed {
  id: string;
  standard: string;
  clause: string;
  title: string;
  /** The delta field this indicator reads. */
  observed: Changed;
  /** Stated when `changed`. */
  indicatedMessage: string;
  /** Stated when `unchanged`. */
  notIndicatedMessage: string;
  /** Stated when `unknown`. */
  notAssessedMessage: string;
  action: string;
}

function fromChanged(seed: IndicatorSeed): SubstantialityIndicator {
  const base = { id: seed.id, standard: seed.standard, clause: seed.clause, title: seed.title, action: seed.action };
  if (seed.observed === 'changed') return { ...base, status: 'indicated', message: seed.indicatedMessage };
  if (seed.observed === 'unchanged') return { ...base, status: 'not_indicated', message: seed.notIndicatedMessage };
  return { ...base, status: 'not_assessed', message: seed.notAssessedMessage };
}

/** Every indicator, as `not_assessed`, for the case where no delta exists at all. */
function unassessable(reason: string): SubstantialityIndicator[] {
  return EU_SEEDS.map((s) => ({
    id: s.id, standard: s.standard, clause: s.clause, title: s.title,
    status: 'not_assessed' as const, message: reason, action: s.action,
  }));
}

/** The EU CTR indicators, keyed to the delta field each one reads. */
const EU_SEEDS: Array<Omit<IndicatorSeed, 'observed'> & { field: keyof DesignDelta }> = [
  {
    id: 'eu-ctr-primary-endpoint', standard: EU, clause: EU_DEF, field: 'primaryEndpoint',
    title: 'Primary endpoint changed — data reliability and robustness',
    indicatedMessage: 'The primary endpoint differs between the two versions. A change to what the trial measures bears directly on the reliability and robustness of the data generated.',
    notIndicatedMessage: 'The primary endpoint is identical in both versions.',
    notAssessedMessage: 'Neither version records a primary endpoint, so no comparison was possible. This is not a finding that the endpoint is unchanged.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-eligibility', standard: EU, clause: EU_DEF, field: 'eligibility',
    title: 'Eligibility criteria changed — subject safety and rights',
    indicatedMessage: 'The inclusion or exclusion criteria differ, so the population that may be exposed to the intervention has changed.',
    notIndicatedMessage: 'The eligibility criteria are identical in both versions.',
    notAssessedMessage: 'Neither version records eligibility criteria, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-intervention', standard: EU, clause: EU_DEF, field: 'intervention',
    title: 'Intervention changed — subject safety',
    indicatedMessage: 'An intervention’s dose, regimen, route or duration differs between the two versions. The DIRECTION of the change is not determined here: these fields are free text, and reading an increase out of them would be a guess.',
    notIndicatedMessage: 'Every arm’s interventions are identical in both versions.',
    notAssessedMessage: 'Neither version records interventions, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-arms', standard: EU, clause: EU_DEF, field: 'arms',
    title: 'Arms added, removed or reassigned',
    indicatedMessage: 'The trial arms differ between the two versions.',
    notIndicatedMessage: 'The arms are identical in both versions.',
    notAssessedMessage: 'Neither version records arms, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-safety-design', standard: EU, clause: EU_DEF, field: 'safety',
    title: 'Safety design changed — stopping rules, DLT definition or DMC charter',
    indicatedMessage: 'The safety design differs between the two versions. Stopping rules and the monitoring committee’s remit are the protections a subject relies on.',
    notIndicatedMessage: 'The safety design is identical in both versions.',
    notAssessedMessage: 'Neither version records a safety design, so no comparison was possible. A trial with no recorded stopping rules has not shown that its stopping rules are unchanged.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-statistical-plan', standard: EU, clause: EU_DEF, field: 'statisticalPlan',
    title: 'Statistical plan changed — data reliability and robustness',
    indicatedMessage: 'Alpha, power, planned sample size, the multiplicity strategy, the missing-data strategy or a planned analysis differs between the two versions.',
    notIndicatedMessage: 'The statistical plan fields compared here are identical in both versions.',
    notAssessedMessage: 'Neither version records a statistical plan, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-randomization', standard: EU, clause: EU_DEF, field: 'randomization',
    title: 'Randomization or blinding changed',
    indicatedMessage: 'The allocation method, ratio, stratification or blinding level differs between the two versions.',
    notIndicatedMessage: 'Randomization and blinding are identical in both versions.',
    notAssessedMessage: 'Neither version records randomization or blinding, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-scope', standard: EU, clause: EU_AUTH, field: 'targetRegions',
    title: 'Member States concerned changed',
    indicatedMessage: 'The target regions differ between the two versions, which changes which Member States are concerned by the trial.',
    notIndicatedMessage: 'The target regions are identical in both versions.',
    notAssessedMessage: 'Neither version records target regions, so no comparison was possible.',
    action: EU_ACTION,
  },
];

// ─── Non-delta indicators ────────────────────────────────────────────────────

/**
 * Participant burden. Distinct from the structural indicators because it reads
 * the burden delta, which has its own comparability rule: `comparable` is false
 * whenever either side has no schedule to measure.
 */
function burdenIndicator(delta: BurdenDelta | null | undefined): SubstantialityIndicator {
  const base = {
    id: 'eu-ctr-participant-burden', standard: EU, clause: EU_DEF,
    title: 'Participant burden changed — subject rights',
    action: EU_ACTION,
  };
  if (!delta || !delta.comparable) {
    return {
      ...base, status: 'not_assessed',
      message: 'Participant burden could not be compared: one or both versions carry no Schedule of Activities to measure. This is not a finding that burden is unchanged.',
    };
  }
  if (delta.direction === 'increased') {
    return {
      ...base, status: 'indicated',
      message: `Scheduled procedures increased${describeBurdenScale(delta)}. More of what a participant must undergo bears on their rights and on the acceptability of the burden they consented to.`,
    };
  }
  if (delta.direction === 'unknown') {
    return {
      ...base, status: 'not_assessed',
      message: 'The direction of the burden change could not be determined from the two schedules.',
    };
  }
  return {
    ...base, status: 'not_indicated',
    message: `Scheduled procedures ${delta.direction === 'decreased' ? 'decreased' : 'are unchanged'}. A decrease is reported for completeness, not as a reason to skip the Article 16 determination.`,
  };
}

function describeBurdenScale(delta: BurdenDelta): string {
  const procedures = delta.deltas.find((d) => d.measure === 'procedureCount');
  if (procedures?.status === 'computed' && procedures.before !== null && procedures.after !== null) {
    return ` from ${procedures.before} to ${procedures.after}`;
  }
  return '';
}

/**
 * 21 CFR 312.30(b)(1) — a change to a protocol that significantly affects
 * subject safety, the scope of the investigation, or the scientific quality of
 * the study must be submitted as a protocol amendment; (b)(1)(i) names "any
 * significant increase in the number of subjects under study" as an example.
 * (b)(2) is the procedural half — the submit-and-IRB-approval conditions and
 * the immediate-hazard exception at (b)(2)(ii) — not the substantive trigger.
 *
 * Note what this does NOT do: the regulation says "significant" and sets no
 * number, so no threshold is invented here. The magnitude is reported and
 * whether it is significant stays the sponsor's recorded judgment.
 */
function usSampleSizeIndicator(delta: DesignDelta | null | undefined): SubstantialityIndicator {
  const base = {
    id: 'us-ind-312-30-subject-number', standard: US, clause: US_CHANGES,
    title: 'Number of subjects changed',
    action: 'Record whether this is a significant increase for the purposes of 21 CFR 312.30(b)(1)(i); the regulation sets no numeric threshold, so this module reports the magnitude and does not decide it.',
  };
  const n = delta?.plannedSampleSize;
  if (!n || n.before === null || n.after === null) {
    return {
      ...base, status: 'not_assessed',
      message: 'Planned sample size is not recorded on both versions, so the change could not be measured.',
    };
  }
  if (n.delta === 0) {
    return { ...base, status: 'not_indicated', message: `Planned sample size is unchanged at ${n.after}.` };
  }
  const direction = n.after > n.before ? 'increased' : 'decreased';
  return {
    ...base, status: 'indicated',
    message: `Planned sample size ${direction} from ${n.before} to ${n.after} (a change of ${n.delta}). Whether that is "significant" under 21 CFR 312.30(b)(1)(i) is a judgment the regulation leaves to the sponsor; it is not decided here.`,
  };
}

/**
 * Whether the region list brings the EU indicators into play at all. Absent
 * regions do NOT take a trial out of scope — they mean nobody recorded it.
 */
function regionNote(regions: string[] | null | undefined): SubstantialityIndicator | null {
  if (regions && regions.length > 0) return null;
  return {
    id: 'eu-ctr-scope-unrecorded', standard: EU, clause: EU_AUTH,
    title: 'Whether the EU CTR applies is not recorded',
    status: 'not_assessed',
    message: 'The design records no target regions, so whether this trial falls under Regulation (EU) No 536/2014 was not established. The EU indicators below were evaluated anyway; an unrecorded region list is not a record that the trial is outside the EU.',
    action: 'Record the trial’s target regions on the design.',
  };
}

// ─── Declaration reconciliation ──────────────────────────────────────────────

/**
 * The sponsor said one thing and the comparison shows another. This is the
 * single most useful output of the module, because it is the only place in the
 * platform where a declaration can be contradicted by evidence.
 */
function reconcileDeclaration(
  declared: SubstantialityInput['declared'],
  indicated: SubstantialityIndicator[],
  changed: string[],
): string | null {
  if (indicated.length === 0) return null;
  const names = changed.length > 0 ? changed.join(', ') : indicated.map((i) => i.title).join('; ');
  if (declared.amendmentType === 'administrative') {
    return `This amendment is declared administrative, but the comparison shows substantive change: ${names}. An administrative amendment is one that does not alter the risk/benefit assessment.`;
  }
  if (declared.amendmentType === 'minor') {
    return `This amendment is declared minor, which routes it to expedited review, but the comparison shows: ${names}. Expedited review under 45 CFR 46.110 / 21 CFR 56.110 is for minor changes only.`;
  }
  const touchesSubject = indicated.some((i) =>
    ['eu-ctr-eligibility', 'eu-ctr-intervention', 'eu-ctr-safety-design', 'eu-ctr-participant-burden'].includes(i.id),
  );
  if (touchesSubject && declared.affectsRisk === false && declared.affectsConsent === false) {
    return `This amendment is declared to affect neither consent nor risk, but the comparison shows change to what a subject is exposed to or protected by: ${names}.`;
  }
  return null;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Assess an amendment's substantiality from the evidence. Pure; the same input
 * twice gives byte-identical output.
 */
export function assessSubstantiality(input: SubstantialityInput): SubstantialityAssessment {
  const delta = input.designDelta ?? null;
  const indicators: SubstantialityIndicator[] = [];

  const note = regionNote(input.regions);
  if (note) indicators.push(note);

  if (!delta) {
    indicators.push(
      ...unassessable(
        'No second version of the study design was available to compare against, so nothing about this amendment’s effect could be established.',
      ),
      burdenIndicator(input.burdenDelta),
      usSampleSizeIndicator(null),
    );
  } else {
    indicators.push(
      ...EU_SEEDS.map((s) => fromChanged({ ...s, observed: delta[s.field] as Changed })),
      burdenIndicator(input.burdenDelta),
      usSampleSizeIndicator(delta),
    );
  }

  const indicated = indicators.filter((i) => i.status === 'indicated');
  const notAssessed = indicators.filter((i) => i.status === 'not_assessed');
  const changed = delta ? changedFields(delta) : [];

  return {
    verdict: decideVerdict(indicated.length, notAssessed.length),
    verdictReason: verdictReason(indicated.length, notAssessed.length),
    indicators,
    changed,
    notComparable: delta?.notComparable ?? [],
    declarationConflict: reconcileDeclaration(input.declared, indicated, changed),
    counts: {
      indicated: indicated.length,
      notIndicated: indicators.filter((i) => i.status === 'not_indicated').length,
      notAssessed: notAssessed.length,
    },
  };
}

function decideVerdict(indicated: number, notAssessed: number): SubstantialityVerdict {
  if (indicated > 0) return 'substantial';
  return notAssessed > 0 ? 'undetermined' : 'no_indicator_found';
}

function verdictReason(indicated: number, notAssessed: number): string {
  if (indicated > 0) {
    return `${indicated} indicator${indicated === 1 ? '' : 's'} of substantial impact on subject safety, subject rights, or the reliability and robustness of the data. Under Article 16 a substantial modification requires authorisation before it is implemented.`;
  }
  if (notAssessed > 0) {
    return `No indicator fired, but ${notAssessed} could not be evaluated. This is NOT a determination of non-substantiality: the unevaluated indicators are listed, and the Article 16 determination remains the sponsor’s to make and record.`;
  }
  return 'Every indicator was evaluated and none fired. This is NOT a determination of non-substantiality under Article 16 — that determination is the sponsor’s, and this is the evidence for it.';
}
