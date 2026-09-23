/**
 * Amendment substantiality — derived from what actually changed rather than
 * from what the sponsor called it. EU CTR 536/2014 (the substantial-
 * modification test) and, separately, the US IND protocol-amendment examples
 * of 21 CFR 312.30(b)(1).
 *
 * `classifyAmendmentImpact` (protocol-amendments-logic.ts) reports the US IRB
 * review, re-consent and FDA-submission consequences of a DECLARED amendment.
 * The declaration is an input there, so it cannot disagree with itself; this
 * module is where the declaration is checked against the two design versions.
 *
 * ── EU: what the Regulation actually says (corrected 2026-09-22) ─────────────
 * A modification is "substantial" when it is LIKELY TO HAVE A SUBSTANTIAL
 * IMPACT on the safety or rights of the subjects, or on the reliability and
 * robustness of the data (Article 2(2)(13)). The classification is the
 * sponsor's, justified at inspection. A substantial modification may only be
 * implemented once approved under Chapter III — that is ARTICLE 15, not 16;
 * Article 16 is how the application is submitted (through CTIS, with the
 * Annex II dossier). A change that is not substantial but is relevant to
 * supervision is updated in CTIS on an ongoing basis (Article 81(9)); other
 * non-substantial changes are recorded in the TMF and listed in the cover
 * letter of the next substantial modification. Adding a Member State is not a
 * substantial modification at all: it is an Article 14 application, and a
 * trial ending in a Member State is an Article 37 notification.
 * This file previously cited Article 16 for authorisation and counted a
 * Member-State change towards a "substantial" verdict. Research record:
 * docs/evidence/REGULATORY-SME/2026-09-22/.
 *
 * ── US: kept apart from the EU verdict ───────────────────────────────────────
 * The US test ("significantly affects" safety / scope / scientific quality,
 * 312.30(b)(1), phase-dependent) is a different instrument from the EU one.
 * US indicators are reported in their own scope and never make the EU verdict
 * say "substantial"; they only matter for a study under a US IND.
 *
 * The evaluation reads the structural delta (`design-delta.ts`) and the
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
 * classification against Article 2(2)(13) is the sponsor's to make and record,
 * and the same holds upward: a changed field is an INDICATOR of substantial
 * impact, not the classification. What this
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
 * The EU verdict. Deliberately has no `non_substantial` member, and no bare
 * `substantial` either: the classification is the sponsor's (Article 2(2)(13)).
 *   • `substantial_indicators` — at least one EU substantial-impact indicator fired.
 *   • `no_indicator_found`     — everything comparable was compared and nothing fired.
 *   • `undetermined`           — something material could not be compared.
 */
export type SubstantialityVerdict = 'substantial_indicators' | 'no_indicator_found' | 'undetermined';

/**
 * Which question an indicator answers.
 *   • `eu_sm`        — an Article 2(2)(13) substantial-impact indicator; counts toward the EU verdict.
 *   • `eu_procedure` — an EU procedure that is not a substantial modification (Articles 14 / 37); reported, not counted.
 *   • `us_ind`       — a 21 CFR 312.30(b)(1) example; only relevant under a US IND; never counts toward the EU verdict.
 */
export type IndicatorScope = 'eu_sm' | 'eu_procedure' | 'us_ind';

export interface SubstantialityIndicator {
  id: string;
  scope: IndicatorScope;
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
  /** EU substantial-impact indicators only (scope `eu_sm`). */
  counts: { indicated: number; notIndicated: number; notAssessed: number };
  /**
   * The US IND view, separate from the EU verdict: how many 312.30(b)(1)
   * examples the comparison touched. Relevant only if the study is under a US
   * IND, and a sponsor determination either way (`classifyAmendmentImpact`).
   */
  us: { indicated: number; notAssessed: number; note: string };
}

// ─── Citations ───────────────────────────────────────────────────────────────

const EU_DEF = 'Regulation (EU) No 536/2014, Article 2(2)(13)';
const EU_REG = 'Regulation (EU) No 536/2014';
const EU_MS = 'Regulation (EU) No 536/2014, Articles 14 and 37';
const EU = 'EU CTR 536/2014';
const US = '21 CFR 312.30';
const US_CHANGES = '21 CFR 312.30(b)(1)(i)';

const EU_ACTION =
  'Record the sponsor’s classification against Article 2(2)(13). If substantial, it may only be implemented once authorised under Chapter III (Article 15), applied for through CTIS under Article 16 with the Annex II dossier. If not substantial but relevant to the Member States’ supervision, update CTIS under Article 81(9). Other non-substantial changes: per the Commission/CTCG CTR Questions & Answers (practice guidance, not the Regulation), record them in the TMF and list them in the cover letter of the next substantial modification.';

// ─── Indicator construction ──────────────────────────────────────────────────

interface IndicatorSeed {
  id: string;
  scope: IndicatorScope;
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
  const base = { id: seed.id, scope: seed.scope, standard: seed.standard, clause: seed.clause, title: seed.title, action: seed.action };
  if (seed.observed === 'changed') return { ...base, status: 'indicated', message: seed.indicatedMessage };
  if (seed.observed === 'unchanged') return { ...base, status: 'not_indicated', message: seed.notIndicatedMessage };
  return { ...base, status: 'not_assessed', message: seed.notAssessedMessage };
}

/** Every indicator, as `not_assessed`, for the case where no delta exists at all. */
function unassessable(reason: string): SubstantialityIndicator[] {
  return [...EU_SEEDS, ...US_SEEDS].map((s) => ({
    id: s.id, scope: s.scope, standard: s.standard, clause: s.clause, title: s.title,
    status: 'not_assessed' as const, message: reason, action: s.action,
  }));
}

/** The EU CTR indicators, keyed to the delta field each one reads. */
const EU_SEEDS: Array<Omit<IndicatorSeed, 'observed'> & { field: keyof DesignDelta }> = [
  {
    id: 'eu-ctr-primary-endpoint', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'primaryEndpoint',
    title: 'Primary endpoint changed — data reliability and robustness',
    indicatedMessage: 'The primary endpoint differs between the two versions. A change to what the trial measures bears directly on the reliability and robustness of the data generated.',
    notIndicatedMessage: 'The primary endpoint is identical in both versions.',
    notAssessedMessage: 'Neither version records a primary endpoint, so no comparison was possible. This is not a finding that the endpoint is unchanged.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-eligibility', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'eligibility',
    title: 'Eligibility criteria changed — subject safety and rights',
    indicatedMessage: 'The inclusion or exclusion criteria differ, so the population that may be exposed to the intervention has changed.',
    notIndicatedMessage: 'The eligibility criteria are identical in both versions.',
    notAssessedMessage: 'Neither version records eligibility criteria, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-intervention', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'intervention',
    title: 'Intervention changed — subject safety',
    indicatedMessage: 'An intervention’s dose, regimen, route or duration differs between the two versions. The DIRECTION of the change is not determined here: these fields are free text, and reading an increase out of them would be a guess.',
    notIndicatedMessage: 'Every arm’s interventions are identical in both versions.',
    notAssessedMessage: 'Neither version records interventions, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-arms', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'arms',
    title: 'Arms added, removed or reassigned',
    indicatedMessage: 'The trial arms differ between the two versions.',
    notIndicatedMessage: 'The arms are identical in both versions.',
    notAssessedMessage: 'Neither version records arms, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-safety-design', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'safety',
    title: 'Safety design changed — stopping rules, DLT definition or DMC charter',
    indicatedMessage: 'The safety design differs between the two versions. Stopping rules and the monitoring committee’s remit are the protections a subject relies on.',
    notIndicatedMessage: 'The safety design is identical in both versions.',
    notAssessedMessage: 'Neither version records a safety design, so no comparison was possible. A trial with no recorded stopping rules has not shown that its stopping rules are unchanged.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-statistical-plan', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'statisticalPlan',
    title: 'Statistical plan changed — data reliability and robustness',
    indicatedMessage: 'Alpha, power, planned sample size, the multiplicity strategy, the missing-data strategy or a planned analysis differs between the two versions.',
    notIndicatedMessage: 'The statistical plan fields compared here are identical in both versions.',
    notAssessedMessage: 'Neither version records a statistical plan, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    id: 'eu-ctr-randomization', scope: 'eu_sm', standard: EU, clause: EU_DEF, field: 'randomization',
    title: 'Randomization or blinding changed',
    indicatedMessage: 'The allocation method, ratio, stratification or blinding level differs between the two versions.',
    notIndicatedMessage: 'Randomization and blinding are identical in both versions.',
    notAssessedMessage: 'Neither version records randomization or blinding, so no comparison was possible.',
    action: EU_ACTION,
  },
  {
    // Not a substantial modification: adding a Member State is an Article 14
    // application to that Member State, and a trial ending in one is an
    // Article 37 notification (15 days). Reported, never counted toward the
    // EU verdict. A new SITE within an existing Member State IS a substantial
    // modification (Article 15, Part II), and region-level data cannot see it.
    id: 'eu-ctr-scope', scope: 'eu_procedure', standard: EU, clause: EU_MS, field: 'targetRegions',
    title: 'Target regions changed — Member State procedures, not a substantial modification',
    indicatedMessage: 'The target regions differ between the two versions. Adding a Member State is an Article 14 application to that Member State through CTIS; a trial ending in a Member State is notified under Article 37 within 15 days. Neither is a substantial modification. Adding a trial site within a Member State already concerned is one, and is not visible at region level.',
    notIndicatedMessage: 'The target regions are identical in both versions.',
    notAssessedMessage: 'Neither version records target regions, so no comparison was possible.',
    action: 'For an added Member State, submit an Article 14 application to it through CTIS. For a Member State where the trial ends, notify the end of trial under Article 37. Withdrawing a Member State before the trial starts there may follow a different CTIS route; confirm it with the reporting Member State.',
  },
];

/**
 * The US IND view: 21 CFR 312.30(b)(1) examples the delta can actually see.
 * Only relevant if the study is under a US IND. (b)(1)(iii) — adding or
 * dropping a safety-monitoring TEST — is not seeded: the safety-design field
 * holds stopping rules and committee remit, not the scheduled tests, and
 * mapping one onto the other would overclaim.
 */
const US_SEEDS: Array<Omit<IndicatorSeed, 'observed'> & { field: keyof DesignDelta }> = [
  {
    id: 'us-ind-312-30-dose-exposure', scope: 'us_ind', standard: US, clause: '21 CFR 312.30(b)(1)(i)', field: 'intervention',
    title: 'Dose, regimen or duration changed — US IND',
    indicatedMessage: 'An intervention’s dose, regimen, route or duration differs. Under a US IND, ANY increase in dose or in individual subjects’ duration of exposure requires a protocol amendment — no significance judgment applies. The direction is not determined here (free text); the sponsor must record it.',
    notIndicatedMessage: 'Every arm’s interventions are identical in both versions.',
    notAssessedMessage: 'Neither version records interventions, so no comparison was possible.',
    action: 'Under a US IND: if dose or duration of exposure increased, submit a protocol amendment (Change in Protocol) before implementation (21 CFR 312.30(b)(1)(i), (e)).',
  },
  {
    id: 'us-ind-312-30-control-group', scope: 'us_ind', standard: US, clause: '21 CFR 312.30(b)(1)(ii)', field: 'arms',
    title: 'Arms changed — US IND',
    indicatedMessage: 'The trial arms differ. Adding or dropping a control group is a listed example of a significant design change requiring a protocol amendment under a US IND.',
    notIndicatedMessage: 'The arms are identical in both versions.',
    notAssessedMessage: 'Neither version records arms, so no comparison was possible.',
    action: 'Under a US IND: if a control group was added or dropped, or the design otherwise changed significantly, submit a protocol amendment before implementation (21 CFR 312.30(b)(1)(ii), (e)). For a Phase 1 protocol only changes that significantly affect subject safety require one; other Phase 1 design modifications go in the annual report (21 CFR 312.23(a)(6), 312.33(e)).',
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
    id: 'eu-ctr-participant-burden', scope: 'eu_sm' as const, standard: EU, clause: EU_DEF,
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
    message: `Scheduled procedures ${delta.direction === 'decreased' ? 'decreased' : 'are unchanged'}. A decrease is reported for completeness, not as a reason to skip the sponsor’s Article 2(2)(13) classification.`,
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
    id: 'us-ind-312-30-subject-number', scope: 'us_ind' as const, standard: US, clause: US_CHANGES,
    title: 'Number of subjects changed — US IND',
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
  if (n.after < n.before) {
    // (b)(1)(i) names "any significant INCREASE in the number of subjects".
    // A decrease is not that example; for a Phase 2 or 3 protocol it can bear
    // on scope or scientific quality under the general (b)(1) test, which is
    // the sponsor's judgment (corrected 2026-09-22 — this reported a decrease
    // as a (b)(1)(i) indication).
    return {
      ...base, status: 'not_indicated',
      message: `Planned sample size decreased from ${n.before} to ${n.after}. A decrease is not the 312.30(b)(1)(i) example, which covers a significant increase; for a Phase 2 or 3 protocol the sponsor should still consider whether it significantly affects the scope or scientific quality of the study (312.30(b)(1)).`,
    };
  }
  return {
    ...base, status: 'indicated',
    message: `Planned sample size increased from ${n.before} to ${n.after} (a change of ${n.delta}). Whether that is "significant" under 21 CFR 312.30(b)(1)(i) is a judgment the regulation leaves to the sponsor; it is not decided here.`,
  };
}

/**
 * Whether the region list brings the EU indicators into play at all. Absent
 * regions do NOT take a trial out of scope — they mean nobody recorded it.
 */
function regionNote(regions: string[] | null | undefined): SubstantialityIndicator | null {
  if (regions && regions.length > 0) return null;
  return {
    id: 'eu-ctr-scope-unrecorded', scope: 'eu_procedure', standard: EU, clause: EU_REG,
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
    return `This amendment is labelled administrative, but the comparison shows change to: ${names}. No regulation defines an "administrative" amendment; changes of this kind can be substantial modifications in the EU (Regulation (EU) No 536/2014, Article 2(2)(13)) and can require an FDA protocol amendment under a US IND (21 CFR 312.30(b)(1)). Every change still needs IRB review (45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4)).`;
  }
  if (declared.amendmentType === 'minor') {
    return `This amendment is labelled minor, but the comparison shows change to: ${names}. Expedited IRB review is available only for minor changes, and whether a change is minor is the IRB's determination (45 CFR 46.110(b)(1)(ii); 21 CFR 56.110(b)(2)).`;
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
      ...US_SEEDS.map((s) => fromChanged({ ...s, observed: delta[s.field] as Changed })),
      usSampleSizeIndicator(delta),
    );
  }

  // The EU verdict counts only Article 2(2)(13) indicators. Member-State
  // procedures and US IND examples are reported but never make it say
  // "substantial" — and a sample-size change is no longer counted twice.
  const eu = indicators.filter((i) => i.scope === 'eu_sm');
  const euIndicated = eu.filter((i) => i.status === 'indicated');
  const euNotAssessed = eu.filter((i) => i.status === 'not_assessed');
  const us = indicators.filter((i) => i.scope === 'us_ind');
  const usIndicated = us.filter((i) => i.status === 'indicated').length;
  const usNotAssessed = us.filter((i) => i.status === 'not_assessed').length;
  const changed = delta ? changedFields(delta) : [];
  const indicatedAny = indicators.filter((i) => i.status === 'indicated' && i.scope !== 'eu_procedure');

  return {
    verdict: decideVerdict(euIndicated.length, euNotAssessed.length),
    verdictReason: verdictReason(euIndicated.length, euNotAssessed.length),
    indicators,
    changed,
    notComparable: delta?.notComparable ?? [],
    declarationConflict: reconcileDeclaration(input.declared, indicatedAny, changed),
    counts: {
      indicated: euIndicated.length,
      notIndicated: eu.filter((i) => i.status === 'not_indicated').length,
      notAssessed: euNotAssessed.length,
    },
    us: {
      indicated: usIndicated,
      notAssessed: usNotAssessed,
      note: usIndicated > 0
        ? `${usIndicated} 21 CFR 312.30(b)(1) example${usIndicated === 1 ? '' : 's'} touched. Relevant only if the study is under a US IND; whether a protocol amendment is required is recorded by the sponsor, and IRB review of the change is required either way.`
        : 'No 21 CFR 312.30(b)(1) example was touched by the comparable fields. Relevant only under a US IND, and NOT a determination that no FDA protocol amendment is needed: the regulation\'s test is broader than the examples.',
    },
  };
}

function decideVerdict(indicated: number, notAssessed: number): SubstantialityVerdict {
  if (indicated > 0) return 'substantial_indicators';
  return notAssessed > 0 ? 'undetermined' : 'no_indicator_found';
}

function verdictReason(indicated: number, notAssessed: number): string {
  if (indicated > 0) {
    return `${indicated} indicator${indicated === 1 ? '' : 's'} of substantial impact on subject safety, subject rights, or the reliability and robustness of the data (Article 2(2)(13)). The classification is the sponsor’s; if the modification is substantial, it may only be implemented once authorised under Chapter III (Article 15).`;
  }
  if (notAssessed > 0) {
    return `No indicator fired, but ${notAssessed} could not be evaluated. This is NOT a determination of non-substantiality: the unevaluated indicators are listed, and the classification against Article 2(2)(13) remains the sponsor’s to make and record.`;
  }
  return 'Every indicator was evaluated and none fired. This is NOT a determination of non-substantiality under Article 2(2)(13) — that classification is the sponsor’s, and this is the evidence for it. A non-substantial change relevant to supervision is still updated in CTIS (Article 81(9)).';
}
