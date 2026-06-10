/**
 * Device classification engine — deterministic risk classification for EU MDR
 * (Annex VIII), EU IVDR (Annex VIII), and an FDA pathway recommendation.
 *
 * WHY THIS EXISTS (audit gap): the platform STORED a device class but had no logic
 * to determine it. Classification drives everything downstream — the pathway, the
 * required evidence, and the reviewer questions. This encodes the principal,
 * algorithmic classification rules so a class can be derived from structured device
 * facts, with the rule that drove it and an honest caveat.
 *
 * HONESTY ABOUT SCOPE: this implements the PRINCIPAL determinative rules of MDR
 * Annex VIII (Rules 1–11 core) and IVDR Annex VIII (Rules 1–7), taking the highest
 * applicable class — the common-case logic, NOT every edge case or implementing
 * rule. The final classification must follow the full Annex VIII + MDCG guidance.
 * The FDA recommendation is a heuristic, not a classification database lookup.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/device-classification
 */

export type MdrClass = 'I' | 'IIa' | 'IIb' | 'III';

export interface MdrDeviceFacts {
  /** Non-invasive (no rules below apply) → default Class I. */
  invasive?: boolean;
  /** Invasive with respect to a body orifice (mouth/nose/ear/etc.). */
  bodyOrificeInvasive?: boolean;
  /** Surgically invasive (penetrates the body through the surface). */
  surgicallyInvasive?: boolean;
  implantable?: boolean;
  /** Active device (depends on a source of energy). */
  active?: boolean;
  activeTherapeutic?: boolean;
  activeDiagnostic?: boolean;
  /** Software intended to provide information used for decisions (Rule 11). */
  softwareDecisionSupport?: boolean;
  /** Software decisions may cause death/irreversible deterioration (Rule 11 → III). */
  softwareSeriousDecisions?: boolean;
  /** Administers or removes a medicinal product. */
  administersMedicine?: boolean;
  /** Incorporates a medicinal substance with ancillary action (Rule 14 → III). */
  incorporatesMedicinalSubstance?: boolean;
  /** In contact with the central circulatory system or central nervous system. */
  contactsCnsOrCentralCirculation?: boolean;
  /** Has a biological effect / is wholly or mainly absorbed. */
  biologicalEffectOrAbsorbed?: boolean;
  /** Duration of continuous use. */
  duration?: 'transient' | 'short_term' | 'long_term';
}

export interface MdrClassification {
  class: MdrClass;
  ruleApplied: string;
  rationale: string;
  caveat: string;
}

const MDR_ORDER: Record<MdrClass, number> = { I: 0, IIa: 1, IIb: 2, III: 3 };
const MDR_CAVEAT =
  'Principal-rules determination (MDR Annex VIII Rules 1–11 core, highest applicable class). Confirm against the full Annex VIII and MDCG 2021-24.';

/** Classify an EU medical device per the principal MDR Annex VIII rules. */
export function classifyMdr(facts: MdrDeviceFacts): MdrClassification {
  const candidates: Array<{ cls: MdrClass; rule: string; why: string }> = [];

  // Highest-risk up-classifiers (Rule 8/14/special) — these dominate.
  if (facts.incorporatesMedicinalSubstance) {
    candidates.push({ cls: 'III', rule: 'Rule 14', why: 'Incorporates a medicinal substance with ancillary action.' });
  }
  if (facts.implantable && facts.contactsCnsOrCentralCirculation) {
    candidates.push({ cls: 'III', rule: 'Rule 8', why: 'Implantable device in contact with the heart/central circulation or CNS.' });
  }
  if (facts.surgicallyInvasive && facts.contactsCnsOrCentralCirculation) {
    candidates.push({ cls: 'III', rule: 'Rule 7', why: 'Surgically invasive device in contact with the heart/central circulation or CNS.' });
  }
  if (facts.biologicalEffectOrAbsorbed && facts.invasive) {
    candidates.push({ cls: 'III', rule: 'Rule 8/17', why: 'Has a biological effect or is wholly/mainly absorbed.' });
  }
  if (facts.softwareSeriousDecisions) {
    candidates.push({ cls: 'III', rule: 'Rule 11', why: 'Software whose decisions may cause death or irreversible deterioration.' });
  }

  // Implantable / long-term surgically invasive (Rule 8) → IIb baseline.
  if (facts.implantable || (facts.surgicallyInvasive && facts.duration === 'long_term')) {
    candidates.push({ cls: 'IIb', rule: 'Rule 8', why: 'Implantable or long-term surgically invasive device.' });
  }

  // Surgically invasive by duration (Rules 6/7).
  if (facts.surgicallyInvasive) {
    if (facts.duration === 'short_term') candidates.push({ cls: 'IIb', rule: 'Rule 7', why: 'Short-term surgically invasive device.' });
    else candidates.push({ cls: 'IIa', rule: 'Rule 6', why: 'Transient surgically invasive device.' });
  }

  // Invasive via body orifice by duration (Rule 5).
  if (facts.bodyOrificeInvasive) {
    if (facts.duration === 'long_term') candidates.push({ cls: 'IIb', rule: 'Rule 5', why: 'Long-term invasive device w.r.t. a body orifice.' });
    else if (facts.duration === 'short_term') candidates.push({ cls: 'IIa', rule: 'Rule 5', why: 'Short-term invasive device w.r.t. a body orifice.' });
    else candidates.push({ cls: 'I', rule: 'Rule 5', why: 'Transient invasive device w.r.t. a body orifice.' });
  }

  // Active devices (Rules 9/10/12).
  if (facts.administersMedicine) {
    candidates.push({ cls: 'IIb', rule: 'Rule 12', why: 'Active device intended to administer/remove a medicinal product (potentially hazardous).' });
  }
  if (facts.activeTherapeutic) {
    candidates.push({ cls: 'IIa', rule: 'Rule 9', why: 'Active therapeutic device.' });
  }
  if (facts.activeDiagnostic) {
    candidates.push({ cls: 'IIa', rule: 'Rule 10', why: 'Active device for diagnosis/monitoring.' });
  }

  // Software decision support (Rule 11) → IIa baseline.
  if (facts.softwareDecisionSupport) {
    candidates.push({ cls: 'IIa', rule: 'Rule 11', why: 'Software providing information used for diagnostic/therapeutic decisions.' });
  }

  // Default: non-invasive → Class I (Rule 1).
  if (candidates.length === 0) {
    candidates.push({ cls: 'I', rule: 'Rule 1', why: 'Non-invasive device with no higher rule applicable.' });
  }

  const top = candidates.reduce((a, b) => (MDR_ORDER[b.cls] > MDR_ORDER[a.cls] ? b : a));
  return { class: top.cls, ruleApplied: top.rule, rationale: top.why, caveat: MDR_CAVEAT };
}

// ── IVDR (Annex VIII) ─────────────────────────────────────────────────────────

export type IvdrClass = 'A' | 'B' | 'C' | 'D';

export interface IvdrDeviceFacts {
  /** Detects transmissible agents in blood/tissue/organ donation, or life-threatening agents with high propagation risk (Rule 1 → D). */
  bloodDonationScreening?: boolean;
  lifeThreateningHighPropagation?: boolean;
  /** Blood grouping / tissue typing to ensure transfusion/transplant compatibility (Rule 2 → C, high-risk → D). */
  bloodGrouping?: boolean;
  bloodGroupingHighRisk?: boolean; // ABO, Rh, Kell, Kidd, Duffy high-risk → C; rare antigens / Rule 1 systems → D
  /** Companion diagnostic (Rule 3(f) → C). */
  companionDiagnostic?: boolean;
  /** Detection of an infectious agent (not Rule 1), cancer marker, genetic test, disease staging, screening congenital disorders (Rule 3 → C). */
  infectiousOrCancerOrGenetic?: boolean;
  /** Self-testing or near-patient (Rule 4 → B, some C). */
  selfTesting?: boolean;
  /** General laboratory reagent/instrument with no specific characteristic; specimen receptacles (Rule 5 → A). */
  generalLabOrInstrumentOrReceptacle?: boolean;
}

export interface IvdrClassification {
  class: IvdrClass;
  ruleApplied: string;
  rationale: string;
  caveat: string;
}

const IVDR_ORDER: Record<IvdrClass, number> = { A: 0, B: 1, C: 2, D: 3 };
const IVDR_CAVEAT =
  'Principal-rules determination (IVDR Annex VIII Rules 1–7, highest applicable class). Confirm against the full Annex VIII and MDCG 2020-16.';

/** Classify an EU IVD per the principal IVDR Annex VIII rules. */
export function classifyIvdr(facts: IvdrDeviceFacts): IvdrClassification {
  const candidates: Array<{ cls: IvdrClass; rule: string; why: string }> = [];

  if (facts.bloodDonationScreening || facts.lifeThreateningHighPropagation || facts.bloodGroupingHighRisk) {
    candidates.push({ cls: 'D', rule: 'Rule 1/2', why: 'Detects transmissible agents in donation / life-threatening high-propagation agent / high-risk blood grouping.' });
  }
  if (facts.bloodGrouping) {
    candidates.push({ cls: 'C', rule: 'Rule 2', why: 'Blood grouping / tissue typing for transfusion/transplant compatibility.' });
  }
  if (facts.companionDiagnostic) {
    candidates.push({ cls: 'C', rule: 'Rule 3(f)', why: 'Companion diagnostic.' });
  }
  if (facts.infectiousOrCancerOrGenetic) {
    candidates.push({ cls: 'C', rule: 'Rule 3', why: 'Detects infectious agent / cancer marker / genetic status / disease staging.' });
  }
  if (facts.selfTesting) {
    candidates.push({ cls: 'B', rule: 'Rule 4', why: 'Intended for self-testing or near-patient testing.' });
  }
  if (facts.generalLabOrInstrumentOrReceptacle) {
    candidates.push({ cls: 'A', rule: 'Rule 5', why: 'General laboratory reagent / instrument / specimen receptacle.' });
  }

  // Rule 6: everything not covered by the other rules → Class B (default).
  if (candidates.length === 0) {
    candidates.push({ cls: 'B', rule: 'Rule 6', why: 'Not covered by Rules 1–5 / 7; default Class B.' });
  }

  const top = candidates.reduce((a, b) => (IVDR_ORDER[b.cls] > IVDR_ORDER[a.cls] ? b : a));
  return { class: top.cls, ruleApplied: top.rule, rationale: top.why, caveat: IVDR_CAVEAT };
}

// ── FDA pathway recommendation (heuristic) ────────────────────────────────────

export type FdaClass = 'I' | 'II' | 'III';
export type FdaPathway = 'exempt' | '510k' | 'de_novo' | 'pma';

export interface FdaPathwayFacts {
  /** FDA device class, if known. */
  fdaClass?: FdaClass;
  /** A legally marketed predicate device exists. */
  predicateAvailable?: boolean;
  /** Class I (or II) 510(k)-exempt per the classification regulation. */
  exempt?: boolean;
  /** Novel device of low-to-moderate risk with no predicate (De Novo candidate). */
  novelLowModerateRisk?: boolean;
}

export interface FdaPathwayRecommendation {
  pathway: FdaPathway;
  rationale: string;
  caveat: string;
}

const FDA_CAVEAT =
  'Heuristic recommendation from the supplied facts — confirm against the FDA product classification database (21 CFR 862–892) and the device’s classification regulation.';

/** Recommend an FDA premarket pathway from structured facts. */
export function recommendFdaPathway(facts: FdaPathwayFacts): FdaPathwayRecommendation {
  if (facts.exempt) {
    return { pathway: 'exempt', rationale: 'Device type is 510(k)-exempt per its classification regulation.', caveat: FDA_CAVEAT };
  }
  if (facts.fdaClass === 'III') {
    return { pathway: 'pma', rationale: 'Class III devices require Premarket Approval (reasonable assurance of safety and effectiveness).', caveat: FDA_CAVEAT };
  }
  if (facts.predicateAvailable) {
    return { pathway: '510k', rationale: 'A legally marketed predicate exists; demonstrate substantial equivalence via 510(k).', caveat: FDA_CAVEAT };
  }
  if (facts.novelLowModerateRisk) {
    return { pathway: 'de_novo', rationale: 'Novel low-to-moderate-risk device with no predicate; request De Novo classification with special controls.', caveat: FDA_CAVEAT };
  }
  // No predicate and not clearly low-risk novel → PMA is the conservative default for higher risk.
  return {
    pathway: 'pma',
    rationale: 'No predicate available and risk not established as low-to-moderate; PMA is the conservative default (re-evaluate against the classification database).',
    caveat: FDA_CAVEAT,
  };
}

export default { classifyMdr, classifyIvdr, recommendFdaPathway };
