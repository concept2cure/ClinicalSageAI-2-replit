/**
 * Medical Device & IVD Regulatory — Deterministic Knowledge Engine
 * ============================================================================
 *
 * Pure, deterministic, closed-form regulatory intelligence for medical devices
 * and in-vitro diagnostic (IVD) devices. NO LLM, NO network, NO database, NO
 * imports from other services. Identical input always yields identical output.
 *
 * Grounded in (verbatim primary sources):
 *   - 21 CFR Part 860               Medical Device Classification Procedures
 *   - 21 CFR Part 860 Subpart D     De Novo Classification Process
 *   - 21 CFR Part 807 Subpart E     Premarket Notification (510(k)) Procedures
 *   - 21 CFR Part 814               Premarket Approval (PMA); Subpart H = HDE
 *   - 21 CFR 814.20                 PMA application content
 *   - 21 CFR 812                    Investigational Device Exemptions (IDE)
 *   - FDA Guidance "The 510(k) Program: Evaluating Substantial Equivalence
 *     in Premarket Notifications" (July 28, 2014)
 *   - FDA Guidance "Factors to Consider When Making Benefit-Risk
 *     Determinations in Medical Device Premarket Approvals and De Novo
 *     Classifications" (2019)
 *   - FDA Guidance "Requests for Feedback and Meetings for Medical Device
 *     Submissions: The Q-Submission Program" (2023)
 *   - FDA eSTAR / Electronic Submission Template program
 *   - Regulation (EU) 2017/745 (MDR)  — Annex VIII classification rules 1-22,
 *     Annex I General Safety & Performance Requirements (GSPR),
 *     Annex II/III technical documentation, Annex XIV clinical evaluation
 *   - Regulation (EU) 2017/746 (IVDR) — Annex VIII classification rules 1-7
 *     (classes A-D), Annex I GSPR, Annex XIII performance evaluation
 *   - MEDDEV 2.7/1 rev 4 (Clinical Evaluation)
 *   - ISO 13485:2016 (QMS), ISO 14971:2019 (risk management),
 *     IEC 62304 (software life cycle), IEC 60601-1 (electrical safety),
 *     ISO 10993-1 (biological evaluation), IEC 62366-1 (usability)
 *   - IMDRF documents (essential principles, SaMD framework, table of contents)
 *
 * This module is intentionally self-contained and exhaustive; every decision
 * branch carries a citation so the output can be audited against the source.
 * Its sibling dependency is `medical-device-knowledge-data.ts`, which holds the
 * verbatim reference tables and citation lists this engine applies. The one
 * cross-service import is the eSTAR slot registry
 * (`pathway-engines/estar/estar-mapper.ts`, equally pure): the 510(k) and De
 * Novo content list belongs to that registry, which the readiness engine scores
 * against, and is read from it rather than restated here. Two more pure
 * registries are read, not restated: the eSTAR catalog
 * (`pathway-engines/estar/estar-catalog.ts`) for the MDUFA V review-goal days,
 * and the regulatory currency registry
 * (`regulatory-currency/currency-registry.ts`) for the dated eSTAR mandates.
 * ComputationRefusal (`ana-biostats/computation-engine.ts`) is thrown when a
 * decision step or a required input has no answer, or an input is malformed,
 * so that AnA asks for it. Since 2026-11-08 the shared readers
 * (`immunogenicity/immunogenicity-reference.ts`) read every true/false input
 * the engine reads as true, false or not_stated (`inputStates`).
 *
 * @module server/services/medical-device/medical-device-knowledge
 */

import {
  CFR,
  CLINICAL_CITATIONS,
  CLINICAL_STUDIES,
  EU_TECHNICAL_DOCUMENTATION,
  EVIDENCE_HIERARCHY,
  GSPR_CITATIONS,
  IVD_PERFORMANCE_SECTION,
  MDR_CLASS_I_ASPECT,
  NON_ESTAR_ADMIN,
  NON_ESTAR_CONDITIONAL,
  NON_ESTAR_SECTIONS,
  PATHWAY_CITATIONS,
  PMA_SECTIONS,
  SE_CITATIONS,
  SE_OPEN_STEP,
  SE_PERFORMANCE_DATA,
  STANDARDS,
  SUBMISSION_CITATIONS,
  type CfrRef,
  type Citation,
  type ClinicalStudyRecommendation,
  type Finding,
  type StandardRef,
  type SubmissionSection,
} from './medical-device-knowledge-data.js';

import {
  estarSlots,
  slotApplicability,
  type DeviceFlags,
  type EstarSlot,
  type EstarType,
} from '../pathway-engines/estar/estar-mapper.js';
import { DEVICE_FLAGS } from '../../../shared/constants/domain/device-classification';
import { getCatalogEntry, type EstarCatalogKey } from '../pathway-engines/estar/estar-catalog.js';
import {
  REGULATORY_FACTS,
  statusAsOf,
  type RegulatoryFact,
} from '../regulatory-currency/currency-registry.js';
import {
  DEVICE_CLASSES,
  IVDR_CLASSES,
  MDR_DECLARED_CLASSES,
  type DeviceClass,
  type IvdrClass,
  type MdrDeclaredClass,
} from '../../../shared/regulatory/device-class.js';
import { ComputationRefusal, refuseUnlessStated } from '../ana-biostats/computation-engine';
import { booleanInputStates, statedNumber, statedOneOf } from '../immunogenicity/immunogenicity-reference';

export type { Citation, ClinicalStudyRecommendation, Finding, SubmissionSection } from './medical-device-knowledge-data.js';

// ════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** US device risk class per 21 CFR 860.3. */
/** The US classes, plus the absence of a classification. */
export type USDeviceClass = DeviceClass | 'unclassified';

/**
 * EU MDR device class per Regulation (EU) 2017/745, Annex VIII — the seven a
 * sponsor DECLARES, from the one module that holds both European vocabularies
 * and says why each has the shape it has.
 */
export type EUMDRClass = MdrDeclaredClass;

/** EU IVDR device class per Regulation (EU) 2017/746, Annex VIII. */
export type EUIVDRClass = IvdrClass;

/** US premarket pathway. */
export type USPathway =
  | '510(k)'
  | 'De Novo'
  | 'PMA'
  | 'HDE'
  | 'exempt'
  | 'IDE-then-PMA'
  | 'BLA'
  | 'undetermined';

/** EU conformity assessment route. */
export type EUConformityRoute =
  | 'self-certification (no NB)'
  | 'notified body involvement'
  | 'notified body — full QMS + technical documentation'
  | 'notified body — type examination'
  | 'undetermined';

/** The vocabularies a class or pathway input is read from; any other value is refused by field. */
const US_CLASSES = [...DEVICE_CLASSES, 'unclassified'] as const;
const US_PATHWAYS: readonly USPathway[] = ['510(k)', 'De Novo', 'PMA', 'HDE', 'exempt', 'IDE-then-PMA', 'BLA', 'undetermined'];

// ════════════════════════════════════════════════════════════════════════════
// DEVICE CLASSIFICATION — not in this module
// ════════════════════════════════════════════════════════════════════════════

/*
 * 2026-10-15: FUNCTION 1 here was classifyDevice, a second classification
 * engine beside the fail-closed one in market-specs/device-classification.ts.
 * Every branch fell through to the lowest class, so with no device facts at
 * all it stated US Class I ("general controls ... are sufficient") and EU MDR
 * Class I ("no notified body"). It is deleted. The AnA tool that ran it,
 * classify_medical_device, now runs classify_device's handler, i.e.
 * classifyMdr / classifyIvdr / recommendFdaPathway in that module. The classes
 * the functions below read come from that engine or from the product code.
 */

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 2: selectDevicePathway
// ════════════════════════════════════════════════════════════════════════════

export interface SelectDevicePathwayParams {
  /** US device class (I/II/III), from the product code's classification regulation. */
  usClass: USDeviceClass;
  /** Whether a legally marketed predicate device exists. */
  predicateExists: boolean;
  /** Whether the device is a novel low-to-moderate risk type with no predicate (De Novo candidate). */
  novelLowModerateRisk?: boolean;
  /** Whether the device is intended to benefit patients in a rare condition (HUD: not more than 8,000/yr in the US). Not a designation. */
  humanitarianUseDevice?: boolean;
  /** Estimated US patient population per year (for HUD/HDE eligibility). */
  estimatedAnnualUSPopulation?: number;
  /** Whether the product code's classification regulation exempts it from 510(k) (and no .9 limitation applies). */
  exempt?: boolean;
  /** Whether the device incorporates a biologic regulated under a BLA. */
  isBiologic?: boolean;
  /** Whether the device is an IVD. */
  isIVD?: boolean;
  /** EU class for conformity routing. */
  euMdrClass?: EUMDRClass;
  euIvdrClass?: EUIVDRClass;
  /** Whether the device is sterile (affects EU Class I route). */
  sterile?: boolean;
  /** Whether the device has a measuring function (affects EU Class I route). */
  measuringFunction?: boolean;
  /** Whether the device is a reusable surgical instrument (affects EU Class I route). */
  reusableSurgicalInstrument?: boolean;
}

export interface SelectDevicePathwayResult {
  usPathway: USPathway;
  usPathwayRationale: string;
  usAlternatives: { pathway: USPathway; whenApplicable: string }[];
  euConformityRoute: EUConformityRoute;
  euConformityRationale: string;
  /** null while the US pathway is undetermined. */
  clinicalEvidenceLikelyRequired: boolean | null;
  approximateUSReviewClock: string;
  findings: Finding[];
  citations: Citation[];
  inputStates: Record<string, boolean | 'not_stated'>;
}

/** The yes/no inputs, reported as stated or not_stated. */
const PATHWAY_FLAGS = ['predicateExists', 'novelLowModerateRisk', 'humanitarianUseDevice', 'exempt', 'isBiologic', 'isIVD', 'sterile', 'measuringFunction', 'reusableSurgicalInstrument'] as const;
/** The facts that, stated true, can change the US pathway (read as false before 2026-11-08). */
const US_DECIDING_FLAGS = ['isBiologic', 'exempt', 'novelLowModerateRisk', 'humanitarianUseDevice'] as const;

/** HUD population ceiling, FD&C Act §520(m) as amended by the 21st Century Cures Act: "not more than 8,000 individuals". */
const HUD_MAX_ANNUAL_US_POPULATION = 8000;

/**
 * MDUFA V (FY2023-2027) review-goal days, read from the eSTAR catalog — the
 * one place they are kept. A key the catalog carries no figure for says so
 * rather than borrowing one.
 */
function mdufaGoalDays(key: EstarCatalogKey): number | undefined {
  return getCatalogEntry(key)?.reviewGoalDays;
}

/**
 * "<label>: MDUFA V goal <n> FDA days", or an honest "no goal encoded". The
 * Pre-Submission goal is counted in calendar days, not FDA days.
 */
function mdufaClock(key: EstarCatalogKey, label: string, unit: 'FDA days' | 'calendar days' = 'FDA days'): string {
  const days = mdufaGoalDays(key);
  return days === undefined
    ? label + ': no MDUFA goal encoded for this submission type.'
    : label + ': MDUFA V goal ' + days + ' ' + unit;
}

interface USDecision {
  usPathway: USPathway;
  usPathwayRationale: string;
  usAlternatives: { pathway: USPathway; whenApplicable: string }[];
  clinicalEvidenceLikelyRequired: boolean;
  approximateUSReviewClock: string;
  findings: Finding[];
}

/** The US pathway on these facts, an unstated deciding fact read as not true; selectDevicePathway tries each. */
function usPathwayOn(params: SelectDevicePathwayParams): USDecision {
  const findings: Finding[] = [];
  const usAlternatives: { pathway: USPathway; whenApplicable: string }[] = [];

  let usPathway: USPathway = 'undetermined';
  let usPathwayRationale: string;
  let clinicalEvidenceLikelyRequired = false;
  let approximateUSReviewClock: string;

  const annualPop = params.estimatedAnnualUSPopulation;
  const hudClaimed = params.humanitarianUseDevice === true;
  const novelNoPredicate = params.predicateExists === false && params.novelLowModerateRisk === true;

  if (params.isBiologic) {
    usPathway = 'BLA';
    usPathwayRationale =
      'The product is regulated as a biologic; a Biologics License Application (BLA) under PHS Act §351 ' +
      'applies (a device-led combination may instead be reviewed by CDRH with CBER consult).';
    approximateUSReviewClock = 'BLA standard review ~10-12 months (varies).';
  } else if (params.exempt === true && params.usClass === 'III') {
    // A 510(k) exemption does not take a class III device out of premarket
    // review, so one of the two inputs is wrong. Do not guess which.
    usPathway = 'undetermined';
    usPathwayRationale =
      'The inputs conflict: the device is stated to be class III and its product code 510(k)-exempt. A class III ' +
      'device needs premarket approval (PMA, or HDE / De Novo where they apply), which a 510(k) exemption does ' +
      'not remove. Confirm the class and the exemption from the product code\'s classification regulation.';
    approximateUSReviewClock = 'No review clock until the pathway is determined.';
    usAlternatives.push({ pathway: 'exempt', whenApplicable: 'If the device is in fact class I or II and its classification regulation exempts it.' });
    usAlternatives.push({ pathway: 'IDE-then-PMA', whenApplicable: 'If the device is class III.' });
    findings.push({
      id: 'NEEDS-INPUT-CLASS-III-EXEMPT',
      severity: 'requirement',
      statement:
        'A device cannot be both class III and 510(k)-exempt in a way that removes premarket review. Confirm ' +
        '`usClass` and `exempt` from the product code\'s classification regulation.',
      citation: { source: 'FD&C Act §513(a)(1)(C), §515', note: 'Class III devices require premarket approval.' },
    });
  } else if (params.exempt === true) {
    usPathway = 'exempt';
    usPathwayRationale =
      'The product code is stated to be 510(k)-exempt. Exemption is set by the classification regulation ' +
      '(21 CFR 862-892) and is lost when a limitation in that panel\'s .9 section applies, so confirm both for ' +
      'the product code. The manufacturer must still satisfy general controls: establishment registration & ' +
      'device listing, Quality System Regulation (21 CFR 820 / QMSR), labeling, and MDR reporting.';
    approximateUSReviewClock = 'No premarket review clock (exempt) — registration & listing only.';
    usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If a .9 limitation of exemption applies to the device.' });
  } else if (novelNoPredicate) {
    // Evaluated before the class-III branch: a device of a new type is class III
    // by operation of 513(f)(1) whatever its risk, and De Novo is how it leaves.
    usPathway = 'De Novo';
    usPathwayRationale =
      'Novel device of low-to-moderate risk with NO legally marketed predicate. A device of a new type is ' +
      'class III by operation of FD&C Act §513(f)(1); a De Novo classification request under §513(f)(2) and ' +
      '21 CFR 860 Subpart D (860.200-860.260; content 860.220) asks FDA to classify it into class I or II. Once ' +
      'granted it creates a predicate for future 510(k)s; special controls are defined as part of the grant.';
    clinicalEvidenceLikelyRequired = params.usClass !== 'I';
    approximateUSReviewClock = mdufaClock('de_novo', 'De Novo');
    usAlternatives.push({ pathway: 'PMA', whenApplicable: 'If FDA finds general and special controls cannot assure safety and effectiveness (the device stays class III).' });
    usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If a suitable predicate is later identified.' });
  } else if (params.usClass === 'I') {
    usPathway = 'undetermined';
    usPathwayRationale =
      'Class I alone does not decide the pathway. Most class I device types are 510(k)-exempt, but exemption ' +
      'is set per classification regulation, a .9 limitation can remove it, and reserved class I devices ' +
      'require a 510(k). Supply `exempt` from the product code.';
    approximateUSReviewClock = 'No review clock until the pathway is determined.';
    usAlternatives.push({ pathway: 'exempt', whenApplicable: 'If the product code\'s classification regulation exempts it and no .9 limitation applies.' });
    usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If the device type is reserved, or a .9 limitation of exemption applies.' });
    findings.push({
      id: 'NEEDS-INPUT-EXEMPTION',
      severity: 'requirement',
      statement:
        '510(k) exemption is decided by the product code\'s classification regulation and its .9 limitations ' +
        '(21 CFR 862.9-892.9), and reserved class I devices require a 510(k). Supply `exempt` from the product code.',
      citation: { source: '21 CFR 862.9-892.9; FD&C Act §510(l)', note: 'Limitations of exemption; reserved class I devices.' },
    });
  } else if (params.usClass === 'III' && hudClaimed && annualPop === undefined) {
    usPathway = 'undetermined';
    usPathwayRationale =
      'A Humanitarian Device Exemption needs a Humanitarian Use Device (HUD) designation from FDA\'s Office of ' +
      'Orphan Products Development first, and the designation needs a documented US population. No population ' +
      'was supplied, so HDE eligibility is not established.';
    approximateUSReviewClock = 'No review clock until the pathway is determined.';
    usAlternatives.push({ pathway: 'HDE', whenApplicable: 'If OOPD designates the device a HUD (condition affecting not more than 8,000 individuals in the US per year).' });
    usAlternatives.push({ pathway: 'IDE-then-PMA', whenApplicable: 'If the device does not qualify as a HUD.' });
    if (params.predicateExists) {
      usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If the stated predicate is a legally marketed device the device is substantially equivalent to.' });
    }
    findings.push({
      id: 'NEEDS-INPUT-HUD',
      severity: 'requirement',
      statement:
        'HDE requires an OOPD HUD designation: the disease or condition must affect or be manifested in not more ' +
        'than 8,000 individuals in the United States per year, documented with authoritative references. Supply ' +
        '`estimatedAnnualUSPopulation`.',
      citation: { source: 'FD&C Act §520(m); 21 CFR 814 Subpart H', note: 'HUD designation precedes the HDE application.' },
    });
  } else if (params.usClass === 'III') {
    if (hudClaimed && annualPop !== undefined && annualPop <= HUD_MAX_ANNUAL_US_POPULATION) {
      usPathway = 'HDE';
      usPathwayRationale =
        'Class III device for a condition affecting not more than 8,000 individuals in the US per year: with a ' +
        'Humanitarian Use Device (HUD) designation from OOPD, a Humanitarian Device Exemption (HDE) requires a ' +
        'showing of safety and probable benefit (not a full effectiveness demonstration) per 21 CFR 814 Subpart H.';
      clinicalEvidenceLikelyRequired = true;
      approximateUSReviewClock = 'HDE review clock 75 FDA-days; HUD designation request precedes it.';
      usAlternatives.push({ pathway: 'PMA', whenApplicable: 'If full effectiveness data are available and broader labeling is sought.' });
    } else if (params.predicateExists) {
      usPathway = '510(k)';
      usPathwayRationale =
        'Although nominally Class III by risk, a legally marketed predicate of the same type exists and the ' +
        'product code remains in a 510(k) pathway (pre-amendments Class III not yet called for PMA). Demonstrate ' +
        'substantial equivalence; FDA may still call for a PMA under §515(b).';
      clinicalEvidenceLikelyRequired = true;
      approximateUSReviewClock = mdufaClock('510k', '510(k)');
      usAlternatives.push({ pathway: 'PMA', whenApplicable: 'If FDA calls for PMA or no acceptable predicate is found.' });
    } else {
      usPathway = 'IDE-then-PMA';
      usPathwayRationale =
        'Class III device with no predicate: a Premarket Approval (PMA) application is required, supported by ' +
        'valid scientific evidence (typically a pivotal clinical study). If the study is a significant-risk ' +
        'investigation, an approved Investigational Device Exemption (IDE) under 21 CFR 812 is needed first.';
      clinicalEvidenceLikelyRequired = true;
      approximateUSReviewClock = mdufaClock('pma_original', 'PMA') + '; plus IDE/clinical study time.';
      usAlternatives.push({ pathway: 'De Novo', whenApplicable: 'If the device is of low-to-moderate risk and general/special controls can assure safety and effectiveness (FD&C Act §513(f)(2)).' });
      usAlternatives.push({ pathway: 'HDE', whenApplicable: 'If OOPD designates it a HUD (condition affecting not more than 8,000 individuals in the US per year).' });
    }
  } else if (params.predicateExists) {
    usPathway = '510(k)';
    usPathwayRationale =
      'Class II (or unclassified) device with a legally marketed predicate: a 510(k) premarket notification ' +
      'demonstrating substantial equivalence to that predicate is the standard pathway (21 CFR 807 Subpart E). ' +
      'Choose Traditional, Special (design change to own cleared device), or Abbreviated (reliance on ' +
      'recognized standards/guidance) 510(k) format.';
    clinicalEvidenceLikelyRequired = false;
    approximateUSReviewClock = mdufaClock('510k', '510(k)');
    usAlternatives.push({ pathway: 'De Novo', whenApplicable: 'If no acceptable predicate exists and risk is low/moderate.' });
  } else {
    // Class II / unclassified, no predicate, no novel-low/moderate-risk claim.
    usPathway = 'undetermined';
    usPathwayRationale =
      'No legally marketed predicate was identified, so a 510(k) (which shows substantial equivalence to one) ' +
      'is not available on these facts, and nothing establishes De Novo eligibility.';
    approximateUSReviewClock = 'No review clock until the pathway is determined.';
    usAlternatives.push({ pathway: 'De Novo', whenApplicable: 'If the device is novel and of low-to-moderate risk.' });
    usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If a legally marketed predicate is identified.' });
    findings.push({
      id: 'NEEDS-INPUT-PREDICATE',
      severity: 'requirement',
      statement:
        'With no predicate the options are: identify a legally marketed predicate (510(k)); request De Novo ' +
        'classification under §513(f)(2) if the device is of low-to-moderate risk; or ask FDA for its view of ' +
        'the classification through a 513(g) request for information.',
      citation: { source: 'FD&C Act §513(f)(2) / §513(g)', note: 'De Novo request; request for classification information.' },
    });
  }

  return { usPathway, usPathwayRationale, usAlternatives, clinicalEvidenceLikelyRequired, approximateUSReviewClock, findings };
}

/** A pathway an answer to an unstated deciding fact would change: undetermined, with what each answer gives. */
function openPathway(base: USDecision, turns: { k: string; pathway: USPathway }[]): USDecision {
  const many = turns.length > 1;
  return {
    usPathway: 'undetermined',
    usPathwayRationale:
      'Not determined: ' + turns.map((t) => t.k + ' (true gives ' + t.pathway + ')').join(', ') +
      (many ? ' were' : ' was') + ' not stated. If ' + (many ? 'each is' : 'it is') + ' false the pathway is ' +
      base.usPathway + ': ' + base.usPathwayRationale,
    usAlternatives: [
      { pathway: base.usPathway, whenApplicable: 'If ' + turns.map((t) => t.k).join(' and ') + (many ? ' are' : ' is') + ' false.' },
      ...turns.filter((t) => t.pathway !== 'undetermined').map((t) => ({ pathway: t.pathway, whenApplicable: 'If ' + t.k + ' is true.' })),
    ],
    clinicalEvidenceLikelyRequired: false,
    approximateUSReviewClock: 'No review clock until the pathway is determined.',
    findings: base.findings,
  };
}

interface EURoute {
  euConformityRoute: EUConformityRoute;
  euConformityRationale: string;
}

/**
 * The EU conformity route. 2026-11-08: an unstated isIVD sent a stated IVDR class to the MDR branch ("EU class
 * not supplied"). A class stated alone names its regulation; with both stated, isIVD decides.
 */
function euRouteOf(params: SelectDevicePathwayParams): EURoute {
  const ivdOpen = typeof params.isIVD !== 'boolean';
  if (ivdOpen && params.euIvdrClass && params.euMdrClass) {
    return {
      euConformityRoute: 'undetermined',
      euConformityRationale:
        'An MDR and an IVDR class were both stated and whether the device is an IVD was not (isIVD), so the route is not assessed.',
    };
  }
  if (params.euIvdrClass && (params.isIVD === true || (ivdOpen && !params.euMdrClass))) return ivdrRoute(params, params.euIvdrClass);
  if (params.euMdrClass) return mdrRoute(params, params.euMdrClass);
  return {
    euConformityRoute: 'undetermined',
    euConformityRationale: 'EU class not supplied; provide euMdrClass or euIvdrClass to determine the conformity route.',
  };
}

function ivdrRoute(params: SelectDevicePathwayParams, c: EUIVDRClass): EURoute {
  let euConformityRoute: EUConformityRoute;
  let euConformityRationale: string;
  if (c === 'A' && typeof params.sterile !== 'boolean') {
    // 2026-10-15: an unstated sterility was read as non-sterile, i.e. "no notified body".
    euConformityRoute = 'undetermined';
    euConformityRationale =
      'IVDR Class A: a device placed on the market sterile needs notified body involvement for the sterility ' +
      'aspects (IVDR Article 48); otherwise the manufacturer self-declares. Whether it is supplied sterile was ' +
      'not stated (sterile).';
  } else if (c === 'A' && !params.sterile) {
    // 2026-11-08: a measuring function no longer sends a non-sterile Class A device to a notified body. IVDR
    // Article 48(10) involves one for a Class A device only for sterility; Im is an MDR class.
    euConformityRoute = 'self-certification (no NB)';
    euConformityRationale =
      'IVDR Class A, not supplied sterile: manufacturer self-declares conformity; technical ' +
      'documentation per IVDR Annex II/III, no notified body.';
  } else if (c === 'A') {
    euConformityRoute = 'notified body involvement';
    euConformityRationale = 'IVDR Class A sterile: notified body involvement limited to sterility aspects.';
  } else if (c === 'B' || c === 'C') {
    euConformityRoute = 'notified body — full QMS + technical documentation';
    euConformityRationale =
      'IVDR Class ' + c + ': notified body QMS assessment (Annex IX) and technical-documentation review ' +
      '(sampling for B; per-device categories for C).';
  } else {
    euConformityRoute = 'notified body — full QMS + technical documentation';
    euConformityRationale =
      'IVDR Class D: notified body Annex IX QMS + technical documentation, plus EU reference laboratory ' +
      'batch verification and expert-panel scrutiny where applicable.';
  }
  return { euConformityRoute, euConformityRationale };
}

function mdrRoute(params: SelectDevicePathwayParams, c: EUMDRClass): EURoute {
  let euConformityRoute: EUConformityRoute;
  let euConformityRationale: string;
  if (c === 'I') {
    // 2026-11-08: an unstated sterile, measuring or reusable aspect read as absent, i.e. "no notified body".
    const open = (['sterile', 'measuringFunction', 'reusableSurgicalInstrument'] as const).filter((k) => typeof params[k] !== 'boolean');
    if (params.sterile || params.measuringFunction || params.reusableSurgicalInstrument) {
      euConformityRoute = 'notified body involvement';
      euConformityRationale =
        'MDR Class I with sterile (Is), measuring (Im), or reusable-surgical-instrument (Ir) aspects: ' +
        'notified body involvement limited to that specific aspect; the rest is self-certified.';
    } else if (open.length > 0) {
      euConformityRoute = 'undetermined';
      euConformityRationale =
        'MDR Class I: a sterile (Is), measuring (Im) or reusable surgical (Ir) device needs notified body ' +
        'involvement for that aspect; ' + open.join(', ') + ' not stated.';
    } else {
      euConformityRoute = 'self-certification (no NB)';
      euConformityRationale =
        'MDR Class I: manufacturer self-certifies, draws up the EU Declaration of Conformity and technical ' +
        'documentation (Annex II/III), and registers in EUDAMED. No notified body required.';
    }
  } else if (c === 'Is' || c === 'Im' || c === 'Ir') {
    // 2026-10-15: these fell to the last branch and were described as MDR Class III.
    euConformityRoute = 'notified body involvement';
    euConformityRationale =
      'MDR Class ' + c + ': notified body involvement limited to the ' + MDR_CLASS_I_ASPECT[c] + ' aspects; the ' +
      'rest is self-certified, with the EU Declaration of Conformity and technical documentation (Annex II/III).';
  } else if (c === 'IIa' || c === 'IIb') {
    euConformityRoute = 'notified body — full QMS + technical documentation';
    euConformityRationale =
      'MDR Class ' + c + ': notified body conformity assessment — Annex IX QMS + technical-documentation ' +
      'assessment (sampling for IIa; representative per generic device group for IIb).';
  } else {
    euConformityRoute = 'notified body — full QMS + technical documentation';
    euConformityRationale =
      'MDR Class III: notified body full QMS + technical documentation assessment for every device, with ' +
      'clinical evaluation consultation (scrutiny) for certain implantables.';
  }
  return { euConformityRoute, euConformityRationale };
}

/**
 * Select the US premarket pathway (510(k) / De Novo / PMA / HDE / exempt /
 * IDE-then-PMA / BLA) and the EU conformity-assessment route, with rationale.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function selectDevicePathway(params: SelectDevicePathwayParams): SelectDevicePathwayResult {
  const inputStates = booleanInputStates(params, PATHWAY_FLAGS);
  refuseUnlessStated('selectDevicePathway', [
    { field: 'usClass', value: params.usClass, ok: (US_CLASSES as readonly unknown[]).includes(params.usClass), expected: 'one of ' + US_CLASSES.join(', ') },
    { field: 'predicateExists', value: params.predicateExists, ok: typeof params.predicateExists === 'boolean', expected: 'true or false' },
  ], 'routed');
  statedOneOf('euMdrClass', params.euMdrClass, MDR_DECLARED_CLASSES);
  statedOneOf('euIvdrClass', params.euIvdrClass, IVDR_CLASSES);
  const p = {
    ...params,
    estimatedAnnualUSPopulation: statedNumber('estimatedAnnualUSPopulation', params.estimatedAnnualUSPopulation, (n) => n >= 0, 'a number, 0 or more'),
  };
  // 2026-11-08: an unstated deciding fact read as false, so { usClass: 'II', predicateExists: true } was a 510(k)
  // with exemption and biologic status never stated. A pathway an answer to one would change is undetermined.
  const base = usPathwayOn(p);
  // A class III device is never 510(k)-exempt (usPathwayOn's conflict branch), so exempt cannot change its pathway.
  const turns = US_DECIDING_FLAGS.filter((k) => inputStates[k] === 'not_stated' && !(k === 'exempt' && p.usClass === 'III'))
    .map((k) => ({ k, pathway: usPathwayOn({ ...p, [k]: true }).usPathway }))
    .filter((t) => t.pathway !== base.usPathway);
  const us = turns.length === 0 || base.usPathway === 'undetermined' ? base : openPathway(base, turns);
  const findings = [...us.findings];
  if (turns.length > 0) {
    findings.push({
      id: 'NEEDS-INPUT-UNSTATED',
      severity: 'requirement',
      statement: 'Not stated, and each changes the US pathway if true: ' + turns.map((t) => t.k + ' (' + t.pathway + ')').join(', ') + '.',
    });
  }
  const clinicalEvidenceLikelyRequired = us.usPathway === 'undetermined' ? null : us.clinicalEvidenceLikelyRequired;

  // ── Findings ─────────────────────────────────────────────────────────────
  findings.push({
    id: 'QSUB',
    severity: 'recommendation',
    statement:
      'Consider a Pre-Submission (Q-Sub) to FDA to align on predicate choice, study design, and acceptance ' +
      'criteria before the marketing submission, especially for De Novo, PMA, novel technology, or when ' +
      'clinical data are anticipated.',
    citation: { source: 'FDA Q-Submission Program Guidance (2023)', note: 'Pre-Submission feedback and meetings.' },
  });
  if (clinicalEvidenceLikelyRequired) {
    findings.push({
      id: 'CLIN-EVIDENCE',
      severity: 'requirement',
      statement:
        'Clinical evidence is likely required for this pathway. Plan the clinical evaluation/strategy early ' +
        '(see designDeviceClinicalEvidence) and, for significant-risk US investigations, an IDE under 21 CFR 812.',
      citation: { source: '21 CFR 812', note: 'Investigational Device Exemptions.' },
    });
  }

  return {
    usPathway: us.usPathway,
    usPathwayRationale: us.usPathwayRationale,
    usAlternatives: us.usAlternatives,
    ...euRouteOf(params),
    clinicalEvidenceLikelyRequired,
    approximateUSReviewClock: us.approximateUSReviewClock,
    findings,
    citations: PATHWAY_CITATIONS,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 3: assessSubstantialEquivalence
// ════════════════════════════════════════════════════════════════════════════

export interface AssessSubstantialEquivalenceParams {
  /** Subject device name. */
  subjectDeviceName?: string;
  /** Predicate device name / 510(k) number. */
  predicateDeviceName?: string;
  /** Whether a legally marketed predicate has been identified. */
  predicateIdentified: boolean;
  /** Whether the predicate has the SAME intended use as the subject device. */
  sameIntendedUse: boolean;
  /** Whether the technological characteristics are the SAME as the predicate. */
  sameTechnologicalCharacteristics: boolean;
  /** If different technology, whether it raises DIFFERENT questions of safety/effectiveness. */
  differentQuestionsOfSafetyEffectiveness?: boolean;
  /** Whether performance data demonstrate equivalent safety and effectiveness. */
  performanceDataDemonstratesEquivalence?: boolean;
  /** Whether the predicate is subject to a design-related recall/withdrawn for safety reasons. */
  predicateRecalledForSafety?: boolean;
  /** Whether a reference device is being used to support new tech characteristics. */
  usesReferenceDevice?: boolean;
  /** Whether the device is an IVD (drives analytical+clinical performance expectations). */
  isIVD?: boolean;
  /** Whether the device contains software. */
  hasSoftware?: boolean;
  /** Whether the device is patient-contacting (drives biocompatibility). */
  patientContacting?: boolean;
  /** Whether the device is sterile / supplied sterile. */
  sterile?: boolean;
}

export interface SEDecisionStep {
  step: string;
  question: string;
  answer: string;
  /** 'indeterminate' when the answer to the step was not stated. */
  outcome: 'continue' | 'SE' | 'NSE' | 'indeterminate';
  citation: Citation;
}

/**
 * The yes/no a 510(k) decision step reads. 2026-10-15: an unstated answer was read
 * as "no" (no predicate, a different intended use, different technology); a step
 * the flow reaches without its answer is now refused, naming it.
 */
function seStepAnswer(field: keyof AssessSubstantialEquivalenceParams, value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  throw new ComputationRefusal(
    value === undefined || value === null ? 'missing_input' : 'invalid_input',
    `assessSubstantialEquivalence: ${field} is required (true or false); the 510(k) decision flow reaches that step and does not answer it for you.`,
    field,
  );
}

export interface AssessSubstantialEquivalenceResult {
  determination: 'SE' | 'NSE' | 'indeterminate';
  determinationRationale: string;
  decisionPath: SEDecisionStep[];
  predicateAdequacy: string;
  performanceDataNeeded: Finding[];
  /** null while an unstated recall or different-questions answer could make it NSE, or an unstated hasSoftware or isIVD
   *  chooses between Abbreviated and Traditional. */
  recommendedSubmissionType: '510(k)-Traditional' | '510(k)-Special' | '510(k)-Abbreviated' | 'De Novo (no valid predicate)' | null;
  findings: Finding[];
  citations: Citation[];
  inputStates: Record<string, boolean | 'not_stated'>;
}

const SE_FLAGS = ['predicateIdentified', 'sameIntendedUse', 'sameTechnologicalCharacteristics', 'differentQuestionsOfSafetyEffectiveness', 'performanceDataDemonstratesEquivalence', 'predicateRecalledForSafety', 'usesReferenceDevice', 'isIVD', 'hasSoftware', 'patientContacting', 'sterile'] as const;

/**
 * Perform a 510(k) substantial-equivalence analysis following the FDA 2014
 * 510(k) Program decision flowchart: predicate selection, same intended use,
 * same/different technological characteristics, new questions of safety and
 * effectiveness, and the performance data needed.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function assessSubstantialEquivalence(
  params: AssessSubstantialEquivalenceParams,
): AssessSubstantialEquivalenceResult {
  const inputStates = booleanInputStates(params, SE_FLAGS);
  return { ...seDecision(params), inputStates };
}

function seDecision(params: AssessSubstantialEquivalenceParams): Omit<AssessSubstantialEquivalenceResult, 'inputStates'> {
  const decisionPath: SEDecisionStep[] = [];
  const findings: Finding[] = [];
  const performanceDataNeeded: Finding[] = [];
  const openSteps: string[] = [];

  let determination: 'SE' | 'NSE' | 'indeterminate' = 'indeterminate';
  let determinationRationale = '';

  // Step 1 — Is there a valid predicate? 2026-11-08: an unstated recall read as "not recalled", so SE was found
  // with the predicate's validity never stated; it is an open step now.
  const predicateIdentified = seStepAnswer('predicateIdentified', params.predicateIdentified);
  const recalled = params.predicateRecalledForSafety;
  const recallOpen = predicateIdentified && typeof recalled !== 'boolean';
  if (recallOpen) openSteps.push('predicateRecalledForSafety');
  decisionPath.push({
    step: '1',
    question: 'Is the predicate device legally marketed and a valid predicate (not removed for safety/effectiveness reasons)?',
    answer: predicateIdentified
      ? recalled
        ? 'A predicate was identified but it was recalled/withdrawn for design-related safety reasons.'
        : recallOpen
          ? 'A predicate was identified; whether it was removed for safety reasons was not stated (predicateRecalledForSafety).'
          : 'Yes — a legally marketed predicate has been identified.'
      : 'No predicate identified.',
    outcome: !predicateIdentified || recalled ? 'NSE' : recallOpen ? 'indeterminate' : 'continue',
    citation: { source: 'FDA 510(k) Program Guidance (2014) — Decision 1', note: 'Predicate validity.' },
  });

  if (!predicateIdentified || params.predicateRecalledForSafety) {
    determination = 'NSE';
    determinationRationale = !predicateIdentified
      ? 'No valid predicate device was identified, so substantial equivalence cannot be established. Consider a ' +
        'De Novo classification request (if low/moderate risk) or a PMA (if high risk).'
      : 'The proposed predicate was removed from the market for design-related safety or effectiveness reasons ' +
        'and is not a valid predicate; identify an alternative predicate or pursue De Novo/PMA.';
    return {
      determination,
      determinationRationale,
      decisionPath,
      predicateAdequacy: 'Inadequate — no valid predicate.',
      performanceDataNeeded,
      recommendedSubmissionType: 'De Novo (no valid predicate)',
      findings,
      citations: SE_CITATIONS,
    };
  }

  // Step 2 — Same intended use?
  const sameIntendedUse = seStepAnswer('sameIntendedUse', params.sameIntendedUse);
  decisionPath.push({
    step: '2',
    question: 'Does the device have the same intended use as the predicate?',
    answer: sameIntendedUse ? 'Yes — same intended use.' : 'No — different intended use.',
    outcome: sameIntendedUse ? 'continue' : 'NSE',
    citation: { source: '21 CFR 807.100(b)(1)', note: 'Same intended use requirement.' },
  });

  if (!sameIntendedUse) {
    determination = 'NSE';
    determinationRationale =
      'The device does not have the same intended use as the predicate. A different intended use precludes a ' +
      'finding of substantial equivalence (21 CFR 807.100(b)(1)); pursue a new intended-use pathway (De Novo if ' +
      'low/moderate risk, or PMA).';
    return {
      determination,
      determinationRationale,
      decisionPath,
      predicateAdequacy: 'Predicate identified but intended use differs.',
      performanceDataNeeded,
      recommendedSubmissionType: 'De Novo (no valid predicate)',
      findings,
      citations: SE_CITATIONS,
    };
  }

  // Step 3 — Same technological characteristics?
  const sameTech = seStepAnswer('sameTechnologicalCharacteristics', params.sameTechnologicalCharacteristics);
  decisionPath.push({
    step: '3',
    question: 'Does the device have the same technological characteristics as the predicate?',
    answer: sameTech
      ? 'Yes — same technological characteristics (materials, design, energy source, principle of operation).'
      : 'No — different technological characteristics.',
    outcome: 'continue',
    citation: { source: '21 CFR 807.100(b)(2)', note: 'Technological characteristics comparison.' },
  });

  if (!sameTech) {
    // Step 4 — Do the different characteristics raise different questions of safety/effectiveness?
    // 2026-10-15: unstated was read as "no — the differences do not raise different questions".
    const raisesNew = params.differentQuestionsOfSafetyEffectiveness === true;
    const step4Open = typeof params.differentQuestionsOfSafetyEffectiveness !== 'boolean';
    if (step4Open) openSteps.push('differentQuestionsOfSafetyEffectiveness');
    decisionPath.push({
      step: '4',
      question: 'Do the different technological characteristics raise DIFFERENT questions of safety and effectiveness?',
      answer: raisesNew
        ? 'Yes — the differences raise new/different questions of safety or effectiveness.'
        : step4Open
          ? 'Not stated (differentQuestionsOfSafetyEffectiveness).'
          : 'No — the differences do not raise different questions of safety or effectiveness.',
      outcome: raisesNew ? 'NSE' : step4Open ? 'indeterminate' : 'continue',
      citation: { source: 'FDA 510(k) Program Guidance (2014) — Decision 4', note: 'Different questions of safety/effectiveness.' },
    });

    if (raisesNew) {
      determination = 'NSE';
      determinationRationale =
        'The different technological characteristics raise different questions of safety and effectiveness that ' +
        'cannot be addressed via the 510(k) route. The device is not substantially equivalent; pursue De Novo ' +
        '(if low/moderate risk) or PMA.';
      return {
        determination,
        determinationRationale,
        decisionPath,
        predicateAdequacy: (recallOpen ? 'Predicate identified' : 'Predicate valid') + ' but technological differences raise new questions.',
        performanceDataNeeded,
        recommendedSubmissionType: 'De Novo (no valid predicate)',
        findings,
        citations: SE_CITATIONS,
      };
    }

    if (params.usesReferenceDevice) {
      findings.push({
        id: 'REF-DEVICE',
        severity: 'info',
        statement:
          'A reference device may support performance expectations for the new technological characteristics, ' +
          'but it cannot serve as the predicate; the single predicate must still anchor intended use.',
        citation: { source: 'FDA 510(k) Program Guidance (2014)', note: 'Use of reference devices.' },
      });
    }
  }

  // Step 5/6 — Performance data demonstrate equivalent safety and effectiveness?
  // 2026-10-15: unstated was read as "yes", so the answer was SE "supported by performance data
  // demonstrating it is as safe and effective as the predicate" when no data were described.
  const dataAdequate = params.performanceDataDemonstratesEquivalence;
  if (typeof dataAdequate !== 'boolean') openSteps.push('performanceDataDemonstratesEquivalence');
  decisionPath.push({
    step: sameTech ? '4' : '5',
    question: 'Do the available performance data demonstrate that the device is as safe and effective as the predicate?',
    answer: dataAdequate === true
      ? 'Yes — the performance data demonstrate it.'
      : dataAdequate === false
        ? 'No — performance data do not yet demonstrate equivalence; additional testing is required.'
        : 'Not stated (performanceDataDemonstratesEquivalence).',
    outcome: dataAdequate === true ? 'SE' : dataAdequate === false ? 'continue' : 'indeterminate',
    citation: { source: 'FDA 510(k) Program Guidance (2014) — Decisions 5/6', note: 'Performance data adequacy.' },
  });

  // Performance data the submission must contain. 2026-11-08: an unstated device property dropped the data it
  // decides; that data is named as undetermined.
  performanceDataNeeded.push(SE_PERFORMANCE_DATA.bench);
  const undecided: string[] = [];
  for (const k of ['patientContacting', 'sterile', 'hasSoftware', 'isIVD'] as const) {
    if (params[k] === true) performanceDataNeeded.push(SE_PERFORMANCE_DATA[k]);
    else if (params[k] !== false) undecided.push(SE_PERFORMANCE_DATA[k].id + ' (' + k + ')');
  }
  if (undecided.length > 0) {
    performanceDataNeeded.push({
      id: 'PERF-UNDETERMINED',
      severity: 'requirement',
      statement: 'Undetermined: ' + undecided.join(', ') + ', each required if its device property is true, which was not stated.',
    });
  }

  if (openSteps.length > 0) {
    determination = 'indeterminate';
    determinationRationale =
      'Not determined: substantial equivalence (21 CFR 807.100(b)) turns on ' +
      openSteps.map((k) => SE_OPEN_STEP[k] + ' (' + k + ')').join(' and ') +
      (openSteps.length > 1 ? ', which were' : ', which was') + ' not stated.';
  } else if (!dataAdequate) {
    determination = 'indeterminate';
    determinationRationale =
      'A valid predicate, same intended use, and (where applicable) no new questions of safety/effectiveness ' +
      'have been established, but the performance data do not yet demonstrate equivalence. Complete the identified ' +
      'performance testing; substantial equivalence is achievable once the data meet acceptance criteria.';
  } else {
    determination = 'SE';
    determinationRationale =
      'The device meets the substantial-equivalence criteria: a valid predicate with the same intended use, and ' +
      'either the same technological characteristics or different characteristics that do not raise different ' +
      'questions of safety/effectiveness, supported by performance data demonstrating it is as safe and effective ' +
      'as the predicate (21 CFR 807.100(b)).';
  }

  // Recommended submission type. 2026-11-08: an unstated hasSoftware or isIVD read as false, choosing Abbreviated,
  // and a 510(k) type was named while an unstated recall or step-4 answer could still make the device NSE.
  let recommendedSubmissionType: AssessSubstantialEquivalenceResult['recommendedSubmissionType'] =
    '510(k)-Traditional';
  if (recallOpen || openSteps.includes('differentQuestionsOfSafetyEffectiveness')) {
    recommendedSubmissionType = null;
  } else if (sameTech && params.hasSoftware !== true && params.isIVD !== true) {
    recommendedSubmissionType = params.hasSoftware === false && params.isIVD === false ? '510(k)-Abbreviated' : null;
  }

  findings.push({
    id: 'SE-SUMMARY',
    severity: 'info',
    statement:
      'Prepare the 510(k) summary (21 CFR 807.92) with a side-by-side predicate comparison table covering ' +
      'intended use, technological characteristics, and performance, and the indications-for-use statement.',
    citation: { source: '21 CFR 807.92', note: '510(k) summary content.' },
  });

  return {
    determination,
    determinationRationale,
    decisionPath,
    predicateAdequacy: recallOpen
      ? 'Not determined — whether the predicate was removed for safety reasons was not stated.'
      : 'Adequate — valid predicate with same intended use.',
    performanceDataNeeded,
    recommendedSubmissionType,
    findings,
    citations: SE_CITATIONS,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 4: designDeviceClinicalEvidence
// ════════════════════════════════════════════════════════════════════════════

export interface DesignDeviceClinicalEvidenceParams {
  /** US device class. */
  usClass: USDeviceClass;
  /** Intended US pathway (informs whether clinical data are typically needed). */
  usPathway?: USPathway;
  /** Whether the device is novel (first-of-a-kind technology or new indication). */
  novelTechnology?: boolean;
  /** Whether a 510(k) raises questions answerable only with clinical data. */
  clinicalDataNeededForSE?: boolean;
  /** Whether the device is implantable. */
  implantable?: boolean;
  /** Whether the device is life-sustaining/life-supporting. */
  lifeSustaining?: boolean;
  /** Whether the device is an IVD (drives clinical performance vs clinical outcome studies). */
  isIVD?: boolean;
  /** Whether substantial published literature exists for the device type/indication. */
  existingLiterature?: boolean;
  /** Whether real-world data (registries, EHR, claims) are available and fit-for-purpose. */
  realWorldDataAvailable?: boolean;
  /** Whether the device is marketed in the EU (drives MDR clinical evaluation expectations). */
  euMarket?: boolean;
  /** EU class, when EU market applies. */
  euMdrClass?: EUMDRClass;
  /** Whether the indication is a significant-risk investigation (US IDE trigger). */
  significantRisk?: boolean;
}

export interface DesignDeviceClinicalEvidenceResult {
  /** null when a fact that decides it was not stated (see missingFacts). */
  clinicalDataRequired: boolean | null;
  clinicalDataRationale: string;
  recommendedStudies: ClinicalStudyRecommendation[];
  /** null while clinicalDataRequired is null, or while the significant-risk question is unstated. */
  usIDERequired: boolean | null;
  euClinicalEvaluationPlan: string;
  evidenceHierarchy: string[];
  /** The facts to state before clinicalDataRequired / usIDERequired can be given. */
  missingFacts: string[];
  findings: Finding[];
  citations: Citation[];
  inputStates: Record<string, boolean | 'not_stated'>;
}

const unstated = (v: unknown): boolean => v === undefined || v === null;

/** The yes/no inputs, reported as stated or not_stated. */
const CLINICAL_FLAGS = ['novelTechnology', 'clinicalDataNeededForSE', 'implantable', 'lifeSustaining', 'isIVD', 'existingLiterature', 'realWorldDataAvailable', 'euMarket', 'significantRisk'] as const;

/** The facts besides class and pathway that each make clinical data required when true. */
const CLINICAL_DATA_TRIGGERS = ['novelTechnology', 'clinicalDataNeededForSE', 'implantable', 'lifeSustaining'] as const;

/** What a "clinical data not required" answer reads and was not told: unstated is not false. */
function notRequiredMissingFacts(p: DesignDeviceClinicalEvidenceParams): string[] {
  const missing: string[] = unstated(p.usClass) ? ['usClass (I, II, III or unclassified)'] : [];
  for (const k of CLINICAL_DATA_TRIGGERS) if (unstated(p[k])) missing.push(k + ' (true or false)');
  return missing;
}

/**
 * Build a clinical evidence strategy: whether clinical data are required, the
 * study type (feasibility/pivotal/RWE/literature), and the EU clinical
 * evaluation (MEDDEV 2.7/1 / MDR Annex XIV) or IVDR performance evaluation.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function designDeviceClinicalEvidence(
  params: DesignDeviceClinicalEvidenceParams,
): DesignDeviceClinicalEvidenceResult {
  const inputStates = booleanInputStates(params, CLINICAL_FLAGS);
  statedOneOf('usClass', params.usClass, US_CLASSES);
  statedOneOf('usPathway', params.usPathway, US_PATHWAYS);
  statedOneOf('euMdrClass', params.euMdrClass, MDR_DECLARED_CLASSES);
  const findings: Finding[] = [];
  const recommendedStudies: ClinicalStudyRecommendation[] = [];

  const pathway = params.usPathway;
  const isPMA = pathway === 'PMA' || pathway === 'IDE-then-PMA' || pathway === 'HDE';
  const high = params.usClass === 'III' || params.lifeSustaining === true || params.implantable === true;
  const clinicalQuestions = params.clinicalDataNeededForSE === true || params.novelTechnology === true;
  // 2026-10-15: this started at false and stayed false unless a stated fact turned it on, so no
  // facts at all read "clinical data are generally NOT required" (and no IDE). "Not required" now
  // needs every fact that would require them stated; until then it is null and missingFacts says which.
  const missingFacts: string[] = isPMA || high || clinicalQuestions ? [] : notRequiredMissingFacts(params);

  let clinicalDataRequired: boolean | null;
  let clinicalDataRationale: string;

  if (isPMA || high) {
    clinicalDataRequired = true;
    clinicalDataRationale =
      'Clinical data are required. Class III / PMA (or HDE) devices must be supported by valid scientific ' +
      'evidence — typically a pivotal clinical investigation — to provide a reasonable assurance of safety and ' +
      'effectiveness (21 CFR 814.20(b)(6); 21 CFR 860.7).';
  } else if (clinicalQuestions) {
    clinicalDataRequired = true;
    clinicalDataRationale =
      'Clinical data are required because the device raises questions of safety/effectiveness (novel technology ' +
      'or new indication) that bench/animal data cannot answer. A focused clinical study or robust clinical ' +
      'evaluation is needed to support the marketing claim.';
  } else if (missingFacts.length > 0) {
    clinicalDataRequired = null;
    clinicalDataRationale =
      'Not determined. Clinical data are required for class III, PMA and HDE devices, implants, life-supporting ' +
      'devices, novel technology, and where the 510(k) comparison raises questions only clinical data can answer. ' +
      'Without ' + missingFacts.join(', ') + ' none of these is ruled out, so neither answer is given.';
  } else {
    clinicalDataRequired = false;
    clinicalDataRationale =
      'Clinical data are generally NOT required: non-clinical performance testing (bench, biocompatibility, ' +
      'software V&V, sterility) is expected to be sufficient for this lower-risk pathway. A clinical evaluation ' +
      'summarizing existing evidence may still be needed for the EU.';
  }

  // ── Recommended studies ──────────────────────────────────────────────────
  // 2026-11-08: an unstated fact dropped the study it decides (an unstated isIVD gave a pivotal investigation).
  // Such a study is named as not assessed.
  const notAssessed: string[] = [];
  if (clinicalDataRequired === true) {
    const feasibilityOpen = (['usClass', 'novelTechnology', 'implantable', 'lifeSustaining'] as const).filter((k) => unstated(params[k]));
    if (params.novelTechnology || high) recommendedStudies.push(CLINICAL_STUDIES.feasibility);
    else if (feasibilityOpen.length > 0) notAssessed.push('a feasibility (first-in-human) study (' + feasibilityOpen.join(', ') + ')');
    if (params.isIVD) recommendedStudies.push(CLINICAL_STUDIES.ivd);
    else if (params.isIVD === false) recommendedStudies.push(CLINICAL_STUDIES.pivotal);
    else notAssessed.push('an IVD clinical performance study or a pivotal investigation (isIVD)');
  } else if (clinicalDataRequired === false) {
    recommendedStudies.push(CLINICAL_STUDIES.none);
  }
  if (params.existingLiterature) recommendedStudies.push(CLINICAL_STUDIES.literature);
  else if (unstated(params.existingLiterature)) notAssessed.push('the literature route (existingLiterature)');
  if (params.realWorldDataAvailable) recommendedStudies.push(CLINICAL_STUDIES.rwe);
  else if (unstated(params.realWorldDataAvailable)) notAssessed.push('real-world evidence (realWorldDataAvailable)');
  if (notAssessed.length > 0) {
    findings.push({
      id: 'STUDIES-NOT-ASSESSED',
      severity: 'requirement',
      statement: 'Not assessed: ' + notAssessed.join('; ') + '. Each turns on the fact named, which was not stated.',
    });
  }

  // ── US IDE determination ─────────────────────────────────────────────────
  // 2026-10-15: a required study was told it needed no IDE whenever significantRisk was not stated true.
  let usIDERequired: boolean | null = clinicalDataRequired === true ? null : clinicalDataRequired;
  if (clinicalDataRequired === true) {
    if (params.significantRisk === true || high) usIDERequired = true;
    else if (params.significantRisk === false) usIDERequired = false;
    else missingFacts.push('significantRisk (true or false): whether the US investigation is a significant-risk study (21 CFR 812.3(m))');
  }

  if (usIDERequired) {
    findings.push({
      id: 'IDE',
      severity: 'requirement',
      statement:
        'The planned clinical investigation appears to be a significant-risk study; an approved IDE (21 CFR 812) ' +
        'is required before enrolling US subjects, along with IRB approval and informed consent.',
      citation: { source: '21 CFR 812.20 / 21 CFR 812.3(m)', note: 'IDE application; significant-risk device.' },
    });
  }

  // ── EU clinical evaluation plan ──────────────────────────────────────────
  // 2026-11-08: an unstated euMarket, isIVD, implantable or EU class was read as false or a lower class.
  let euClinicalEvaluationPlan: string;
  if (params.euMarket && params.isIVD) {
    euClinicalEvaluationPlan =
      'EU IVDR: conduct a performance evaluation (Annex XIII) establishing scientific validity, analytical ' +
      'performance, and clinical performance, documented in a Performance Evaluation Plan/Report (PEP/PER) with ' +
      'a Post-Market Performance Follow-up (PMPF) plan.';
  } else if (params.euMarket && params.isIVD === false) {
    const cls = params.euMdrClass;
    const implantOrIII = cls === 'III' || params.implantable === true;
    const open = (['euMdrClass', 'implantable'] as const).filter((k) => unstated(params[k]));
    euClinicalEvaluationPlan =
      'EU MDR: conduct a clinical evaluation per Article 61 and Annex XIV — a Clinical Evaluation Plan/Report ' +
      '(CEP/CER) following MEDDEV 2.7/1 rev 4, using the literature/equivalence route where justified, plus a ' +
      'Post-Market Clinical Follow-up (PMCF) plan. ' +
      (implantOrIII
        ? 'For implantable and Class III devices, clinical investigations are generally required unless a ' +
          'rigorous equivalence justification to an existing device is accepted (Article 61(4)-(6)).'
        : open.length === 0
          ? 'For lower classes, the literature/equivalence route is often acceptable if the data are sufficient.'
          : 'Whether clinical investigations are generally required (implantable and Class III devices, Article ' +
            '61(4)-(6)) is not assessed: ' + open.join(', ') + ' not stated.');
  } else if (params.euMarket) {
    euClinicalEvaluationPlan =
      'Not assessed: an IVDR performance evaluation (Annex XIII) for an IVD, else an MDR clinical evaluation ' +
      '(Article 61, Annex XIV); isIVD was not stated.';
  } else if (params.euMarket === false) {
    euClinicalEvaluationPlan = 'EU market not indicated; MDR/IVDR clinical/performance evaluation not scoped.';
  } else {
    euClinicalEvaluationPlan = 'Not scoped: whether the device is marketed in the EU was not stated (euMarket).';
  }

  findings.push({
    id: 'BENEFIT-RISK',
    severity: 'info',
    statement:
      'Frame the evidence around a benefit-risk determination: characterize probable benefits, probable risks, ' +
      'uncertainty, and patient tolerance, per FDA Benefit-Risk Factors guidance and ISO 14971.',
    citation: { source: 'FDA Benefit-Risk Factors Guidance (2019)', note: 'Benefit-risk for PMA/De Novo.' },
  });

  return {
    clinicalDataRequired,
    clinicalDataRationale,
    recommendedStudies,
    usIDERequired,
    euClinicalEvaluationPlan,
    evidenceHierarchy: [...EVIDENCE_HIERARCHY],
    missingFacts,
    findings,
    citations: CLINICAL_CITATIONS,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 5: assessEssentialPrinciples
// ════════════════════════════════════════════════════════════════════════════

export interface AssessEssentialPrinciplesParams {
  /** Whether the device is an IVD (selects IVDR Annex I vs MDR Annex I). */
  isIVD?: boolean;
  /** Whether the device is electrically powered / active. */
  active?: boolean;
  /** Whether the device contains software. */
  hasSoftware?: boolean;
  /** Whether the device is patient-contacting (biocompatibility GSPR). */
  patientContacting?: boolean;
  /** Whether the device is supplied sterile. */
  sterile?: boolean;
  /** Whether the device has a measuring function. */
  measuringFunction?: boolean;
  /** Whether the device incorporates a medicinal substance. */
  incorporatesMedicinalSubstance?: boolean;
  /** Whether the device emits ionizing/non-ionizing radiation. */
  emitsRadiation?: boolean;
  /** Whether the device is implantable. */
  implantable?: boolean;
  /** Not read: GSPR 5 (usability) is addressed only by a claimed IEC 62366. */
  layUse?: boolean;
  /** A QMS conforming to ISO 13485 is in place. */
  qmsInPlace?: boolean;
  /** A risk-management file per ISO 14971 exists. */
  riskManagementFile?: boolean;
  /** Standard IDs the manufacturer claims conformity to; omitted, no row is addressed by a standard. */
  standardsClaimed?: string[];
}

export interface GSPRRow {
  gsprRef: string;
  requirement: string;
  /** null when the device property that decides it was not stated. */
  applicable: boolean | null;
  evidenceStandard: string;
  /** 'addressed' only by a stated input; 'not-assessed' when applicability, or the QMS or risk-file fact that addresses it, was not stated. */
  status: 'addressed' | 'gap' | 'not-applicable' | 'not-assessed';
  citation: Citation;
}

/** A stated device property, or null: unstated is neither applicable nor not. */
const statedProperty = (v: boolean | undefined): boolean | null => (typeof v === 'boolean' ? v : null);

export interface AssessEssentialPrinciplesResult {
  framework: 'EU MDR Annex I (GSPR)' | 'EU IVDR Annex I (GSPR)';
  conformityMatrix: GSPRRow[];
  applicableCount: number;
  gapCount: number;
  gaps: Finding[];
  overallConformity: 'conforming' | 'gaps-present' | 'insufficient-information';
  findings: Finding[];
  citations: Citation[];
  inputStates: Record<string, boolean | 'not_stated'>;
}

/** The yes/no inputs, reported as stated or not_stated (layUse is not read). */
const GSPR_FLAGS = ['isIVD', 'active', 'hasSoftware', 'patientContacting', 'sterile', 'measuringFunction', 'incorporatesMedicinalSubstance', 'emitsRadiation', 'implantable', 'qmsInPlace', 'riskManagementFile'] as const;

/**
 * Build a GSPR / essential-principles conformity matrix (MDR Annex I or IVDR
 * Annex I): which requirements apply, the evidence/standard demonstrating
 * conformity, and any gaps.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function assessEssentialPrinciples(
  params: AssessEssentialPrinciplesParams,
): AssessEssentialPrinciplesResult {
  const inputStates = booleanInputStates(params, GSPR_FLAGS);
  // 2026-11-08: an unstated isIVD built the MDR matrix, and a standards list that is not a list of IDs crashed.
  refuseUnlessStated('assessEssentialPrinciples', [
    { field: 'isIVD', value: params.isIVD, ok: typeof params.isIVD === 'boolean', expected: 'true or false: it decides MDR or IVDR Annex I' },
  ], 'assessed');
  const listed: unknown = params.standardsClaimed ?? [];
  if (!Array.isArray(listed)) {
    throw new ComputationRefusal('invalid_input', 'standardsClaimed must be a list of standard IDs (got ' + JSON.stringify(listed) + ').', 'standardsClaimed');
  }
  listed.forEach((s: unknown, i: number) => {
    if (typeof s !== 'string') {
      throw new ComputationRefusal('invalid_input', 'standardsClaimed[' + i + '] must be a standard ID (got ' + JSON.stringify(s) + ').', 'standardsClaimed[' + i + ']');
    }
  });
  const isIVD = params.isIVD === true;
  const framework = isIVD ? 'EU IVDR Annex I (GSPR)' : 'EU MDR Annex I (GSPR)';
  const annex = isIVD ? 'IVDR Annex I' : 'MDR Annex I';
  const rows: GSPRRow[] = [];
  const findings: Finding[] = [];

  const standardsClaimed = new Set((listed as string[]).map((s) => s.trim()));
  const claims = (id: string): boolean => {
    for (const s of standardsClaimed) {
      if (s.startsWith(id.split(':')[0]) || id.startsWith(s.split(':')[0])) return true;
    }
    return false;
  };

  // 2026-10-15: GSPR 9, 14, 15, 19/20 and 23 (and the IVD analytical row) were 'addressed' whatever was
  // given, GSPR 5 too unless lay use was stated, and an unstated device property made its row
  // 'not-applicable': { qmsInPlace, riskManagementFile } alone was 'conforming'. A row is now addressed
  // only by a stated input (a claimed standard, the QMS, the risk file), and a row whose applicability
  // turns on an unstated property is 'not-assessed'. No input here evidences GSPR 9, 14 or 23, so this
  // matrix never reports 'conforming'; those are confirmed from the technical documentation. 2026-11-08: a
  // Chapter I row whose QMS or risk-file fact was not stated was a gap; it is 'not-assessed'.
  const addRow = (
    gsprRef: string,
    requirement: string,
    applicable: boolean | null,
    evidenceStandard: string,
    addressed: boolean | null,
  ): void => {
    rows.push({
      gsprRef,
      requirement,
      applicable,
      evidenceStandard,
      status: applicable === false ? 'not-applicable' : applicable === null || addressed === null ? 'not-assessed' : addressed ? 'addressed' : 'gap',
      citation: { source: annex + ' ' + gsprRef, note: requirement },
    });
  };

  const rmf = statedProperty(params.riskManagementFile);
  const qmsAndRmf = params.qmsInPlace === false || rmf === false ? false : params.qmsInPlace === true && rmf ? true : null;

  // GSPR Chapter I — General requirements (1-9). Always applicable.
  addRow(
    'GSPR 1',
    'Devices shall achieve their intended performance and be safe and effective; risks acceptable when weighed against benefits.',
    true,
    'ISO 14971 risk management file; clinical/performance evaluation.',
    rmf,
  );
  addRow(
    'GSPR 2',
    'Reduce risks as far as possible (safe design/manufacture) without adversely affecting the benefit-risk ratio.',
    true,
    'ISO 14971 risk control; design FMEA; verification.',
    rmf,
  );
  addRow(
    'GSPR 3',
    'Establish, implement, document, and maintain a risk management system across the life cycle.',
    true,
    'ISO 14971:2019 risk management process and file.',
    rmf,
  );
  addRow(
    'GSPR 4',
    'Risk control measures: inherent safe design, protective measures, and information for safety (in that priority order).',
    true,
    'Design controls (ISO 13485 §7.3); ISO 14971 option analysis.',
    qmsAndRmf,
  );
  addRow(
    'GSPR 5',
    'Eliminate or reduce risks related to use error (usability / human factors).',
    true,
    'IEC 62366-1 usability engineering; FDA HFE/usability for lay use.',
    claims('IEC 62366'),
  );
  addRow(
    'GSPR 9',
    'Devices without a medical purpose (Annex XVI) and general performance/safety over the lifetime and storage/transport.',
    true,
    'Shelf-life, transport, and stability testing.',
    false,
  );

  // GSPR Chapter II — Design & manufacture.
  addRow(
    isIVD ? 'IVDR GSPR 9 (analytical)' : 'GSPR 10',
    isIVD
      ? 'Analytical and clinical performance characteristics (trueness, precision, sensitivity, specificity, traceability of calibrators).'
      : 'Chemical, physical and biological properties; biocompatibility of patient-contacting materials.',
    isIVD ? true : statedProperty(params.patientContacting),
    isIVD ? 'CLSI EP-series; metrological traceability (ISO 17511).' : 'ISO 10993 series biological evaluation.',
    isIVD ? false : claims('ISO 10993'),
  );
  addRow(
    'GSPR 11',
    'Infection and microbial contamination; devices supplied sterile shall be manufactured and sterilized by validated methods.',
    statedProperty(params.sterile),
    'ISO 11135 / ISO 11137 sterilization validation; ISO 11607 sterile barrier.',
    claims('ISO 11135') || claims('ISO 11137') || claims('ISO 11607'),
  );
  addRow(
    'GSPR 12',
    'Devices incorporating a medicinal substance: safety, quality, and usefulness of the substance verified by analogy with medicinal-product methods.',
    statedProperty(params.incorporatesMedicinalSubstance),
    'Medicinal-substance consultation with a competent authority/EMA.',
    false,
  );
  addRow(
    isIVD ? 'IVDR GSPR 13' : 'GSPR 14',
    'Construction and environmental interaction; minimize risks from interaction with the environment and reasonably foreseeable conditions of use.',
    true,
    'Environmental/EMC testing; transport/storage validation.',
    false,
  );
  addRow(
    isIVD ? 'IVDR GSPR 16' : 'GSPR 15',
    'Devices with a diagnostic or measuring function: accuracy, precision, and stability within stated limits.',
    isIVD ? true : statedProperty(params.measuringFunction),
    isIVD ? 'CLSI EP05/EP06/EP09 precision/linearity/method comparison.' : 'Metrological verification of the measuring function.',
    false,
  );
  addRow(
    'GSPR 16',
    'Protection against radiation; devices emitting radiation shall be designed/manufactured to reduce exposure consistent with the intended purpose.',
    statedProperty(params.emitsRadiation),
    'IEC 60601-1-3 / IEC 60601-2-xx radiation safety; ALARA.',
    false,
  );
  addRow(
    isIVD ? 'IVDR GSPR 16.2 (software)' : 'GSPR 17',
    'Electronic programmable systems and software: developed and manufactured per state of the art (development life cycle, risk management, verification, validation).',
    statedProperty(params.hasSoftware),
    'IEC 62304 life cycle; IEC 82304-1 health software; cybersecurity per IEC 81001-5-1.',
    claims('IEC 62304'),
  );
  addRow(
    isIVD ? 'IVDR GSPR 16.4' : 'GSPR 18',
    'Active devices and devices connected to them: electrical safety, basic safety and essential performance.',
    statedProperty(params.active),
    'IEC 60601-1 (+ collateral/particular standards) basic safety & essential performance.',
    claims('IEC 60601'),
  );
  addRow(
    'GSPR 19/20',
    'Devices incorporating energy/substances and active implantable considerations: protection against hazards (energy, heat, fluids).',
    params.implantable === true || params.active === true
      ? true
      : params.implantable === false && params.active === false ? false : null,
    'Implant-specific testing; ISO 14708 (active implants) where applicable.',
    false,
  );
  addRow(
    isIVD ? 'IVDR GSPR 20' : 'GSPR 23',
    'Information supplied with the device: label and instructions for use (IFU), including symbols and residual-risk information.',
    true,
    'ISO 15223-1 symbols; MDR/IVDR labeling requirements; UDI.',
    false,
  );

  // ── Tally and gaps ───────────────────────────────────────────────────────
  const applicableRows = rows.filter((r: GSPRRow) => r.applicable === true);
  const gapRows = rows.filter((r: GSPRRow) => r.status === 'gap');
  const notAssessedRows = rows.filter((r: GSPRRow) => r.status === 'not-assessed');
  const gaps: Finding[] = gapRows.map((r: GSPRRow) => ({
    id: 'GAP-' + r.gsprRef.replace(/\s+/g, '-'),
    severity: 'requirement',
    statement:
      r.gsprRef + ' is applicable but not yet demonstrated as addressed. Provide evidence via: ' + r.evidenceStandard,
    citation: r.citation,
  }));

  if (params.qmsInPlace === false) {
    findings.push({
      id: 'QMS-MISSING',
      severity: 'critical',
      statement:
        'No ISO 13485 QMS indicated. A conforming quality management system is a precondition for MDR/IVDR ' +
        'conformity assessment and underpins GSPR evidence generation.',
      citation: { source: 'ISO 13485:2016 / MDR Article 10(9)', note: 'QMS requirement.' },
    });
  }
  if (params.riskManagementFile === false) {
    findings.push({
      id: 'RMF-MISSING',
      severity: 'critical',
      statement:
        'No ISO 14971 risk management file indicated. GSPR Chapter I (requirements 1-8) cannot be demonstrated ' +
        'without a documented risk management process and file.',
      citation: { source: 'ISO 14971:2019 / MDR Annex I §3', note: 'Risk management file requirement.' },
    });
  }

  const filesOpen = (['qmsInPlace', 'riskManagementFile'] as const).filter((k) => typeof params[k] !== 'boolean');
  if (filesOpen.length > 0) {
    findings.push({
      id: 'FILES-NOT-STATED',
      severity: 'requirement',
      statement:
        'Not stated: ' + filesOpen.join(', ') + '. An ISO 13485 QMS and an ISO 14971 risk management file are ' +
        'preconditions of MDR/IVDR conformity assessment and of GSPR Chapter I; state each true or false.',
    });
  }
  if (notAssessedRows.length > 0) {
    findings.push({
      id: 'APPLICABILITY-NOT-STATED',
      severity: 'requirement',
      statement:
        'Not assessed: ' + notAssessedRows.map((r: GSPRRow) => r.gsprRef).join(', ') + '. Whether each applies, ' +
        'or is addressed, depends on a fact that was not stated (patient contact, sterile, medicinal substance, ' +
        'measuring function, radiation, software, active, implantable, the QMS, the risk file); state it true or false.',
    });
  }

  let overallConformity: AssessEssentialPrinciplesResult['overallConformity'];
  if (!params.qmsInPlace || !params.riskManagementFile) {
    overallConformity = 'insufficient-information';
  } else if (gapRows.length > 0) {
    overallConformity = 'gaps-present';
  } else if (notAssessedRows.length > 0) {
    overallConformity = 'insufficient-information';
  } else {
    overallConformity = 'conforming';
  }

  findings.push({
    id: 'STANDARDS-SUMMARY',
    severity: 'info',
    statement:
      'Maintain a list of applied harmonized/consensus standards and a GSPR checklist mapping each applicable ' +
      'requirement to the document(s) demonstrating conformity, as required for the technical documentation ' +
      '(MDR Annex II / IVDR Annex II).',
    citation: { source: 'MDR Annex II / IVDR Annex II', note: 'Technical documentation — GSPR conformity demonstration.' },
  });

  return {
    framework,
    conformityMatrix: rows,
    applicableCount: applicableRows.length,
    gapCount: gapRows.length,
    gaps,
    overallConformity,
    findings,
    citations: GSPR_CITATIONS,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 6: planDeviceSubmission
// ════════════════════════════════════════════════════════════════════════════

export interface PlanDeviceSubmissionParams {
  /** Target US pathway. */
  usPathway: USPathway;
  /** Whether the device is an IVD. */
  isIVD?: boolean;
  /** Whether the device contains software. */
  hasSoftware?: boolean;
  /** Whether the device is sterile. */
  sterile?: boolean;
  /** Whether the device is patient-contacting. */
  patientContacting?: boolean;
  /** Whether clinical data are part of the submission. */
  clinicalDataIncluded?: boolean;
  /** Whether the device is also pursuing the EU market. */
  euMarket?: boolean;
  /** EU class for technical documentation scoping. */
  euMdrClass?: EUMDRClass;
  euIvdrClass?: EUIVDRClass;
  /** Whether a Pre-Submission (Q-Sub) has already occurred. */
  preSubmissionDone?: boolean;
  /**
   * ISO date (YYYY-MM-DD) the plan is made as of; decides whether an eSTAR
   * mandate in the currency registry is in force. Defaults to today (UTC).
   * There is no `useEStar` input: where eSTAR is mandatory it is not a choice.
   */
  asOf?: string;
}

export interface TimelinePhase {
  phase: string;
  durationEstimate: string;
  description: string;
}

export interface PlanDeviceSubmissionResult {
  usPathway: USPathway;
  submissionFormat: string;
  usSections: SubmissionSection[];
  euTechnicalDocumentation: SubmissionSection[];
  timeline: TimelinePhase[];
  qSubStrategy: string;
  findings: Finding[];
  citations: Citation[];
  inputStates: Record<string, boolean | 'not_stated'>;
}

/** The yes/no inputs, reported as stated or not_stated. */
const PLAN_FLAGS = ['isIVD', 'hasSoftware', 'sterile', 'patientContacting', 'clinicalDataIncluded', 'euMarket', 'preSubmissionDone'] as const;

/*
 * THE eSTAR PATHWAYS (510(k), De Novo) ARE PLANNED FROM THE eSTAR REGISTRY.
 *
 * This used to hand every US pathway one administrative section asking for
 * "Form FDA 3514 ... and (if used) eCopy/eSTAR packaging". For 510(k) and De
 * Novo that is wrong twice: eSTAR is mandatory (510(k) from 2023-10-01, De Novo
 * from 2025-10-01), the eSTAR file replaces the free-form eCopy (it is sent
 * through the CDRH Portal or to the Document Control Center), and FDA's eSTAR
 * page says no separate 3514 is needed because the template carries the cover-sheet data. estar-mapper.ts had already struck the
 * 3514 slot (see "WHY THERE IS NO cdrh-cover-sheet SLOT" there); this plan had
 * not, so AnA's plan and the readiness verdict disagreed about what a filing
 * needs. The plan also omitted the truthful-and-accurate statement, which the
 * registry requires of every 510(k) and De Novo.
 *
 * The section list for these two pathways is therefore the registry itself, via
 * `estarSlots`, one plan section per slot: a slot added or relabelled there
 * reaches this plan without an edit here. Necessity is the mapper's, decided by
 * `slotApplicability` from the device answers this plan is given; an answer the
 * plan was not given leaves the section on the plan marked undetermined, never
 * dropped. (Biocompatibility is `always` there, deliberately: patient contact is
 * not an intake flag. `patientContacting` therefore no longer removes it.)
 */

const ESTAR_TYPE: Partial<Record<USPathway, EstarType>> = { '510(k)': '510k', 'De Novo': 'de_novo' };

const FLAG_LABEL: Record<string, string> = Object.fromEntries(DEVICE_FLAGS.map((f) => [f.id, f.label]));

/** The device answers this plan's inputs carry, in the intake's flag vocabulary. Unasked stays undefined. */
function planDeviceFlags(params: PlanDeviceSubmissionParams): DeviceFlags {
  return {
    sterile: params.sterile,
    softwareAiMl: params.hasSoftware,
    clinicalData: params.clinicalDataIncluded,
    // CLIA categorisation applies only to IVDs, so a device stated not to be
    // one is answered; an unstated one is not.
    cliaWaived: params.isIVD === false ? false : undefined,
  };
}

function estarSlotSection(slot: EstarSlot, flags: DeviceFlags, type: EstarType): SubmissionSection | null {
  const applicability = slotApplicability(slot, flags);
  if (applicability === 'not-applicable') return null;
  const flagLabel = slot.flag ? FLAG_LABEL[slot.flag] ?? slot.flag : '';
  const contents =
    applicability === 'required'
      ? 'Required' + (slot.necessity === 'conditional' ? ' (' + flagLabel + ': yes).' : '.')
      : applicability === 'undetermined'
        ? 'Undetermined: required if "' + flagLabel + '" applies to this device, which this plan was not ' +
          'told. Answer that question; until then the section stays on the plan.'
        : 'Required when ' + slot.appliesWhen + '.';
  return {
    sectionId: slot.id,
    title: slot.label,
    contents,
    citation: {
      source: slot.authority,
      note: 'FDA eSTAR ' + (type === '510k' ? '510(k)' : 'De Novo') + ' section (estar-mapper slot ' + slot.id + ').',
    },
  };
}

function estarUSSections(params: PlanDeviceSubmissionParams, type: EstarType): SubmissionSection[] {
  const flags = planDeviceFlags(params);
  /* The IVD eSTAR asks its own performance questions. The registry models them
     for 510(k) only; an IVD De Novo falls to the nIVD set there, so its IVD
     performance content is named below rather than silently left out.
     2026-11-08: an unstated isIVD planned the nIVD eSTAR and left the IVD
     questions out; they stay on the plan, marked undetermined. */
  const variant = type === '510k' && params.isIVD !== false ? 'ivd' : 'device';
  const nIvd = new Set(estarSlots(type).map((slot) => slot.id));
  const sections = estarSlots(type, variant)
    .map((slot) => estarSlotSection(slot, flags, type))
    .filter((s): s is SubmissionSection => s !== null)
    .map((s) => (params.isIVD === true || nIvd.has(s.sectionId) ? s : {
      ...s,
      contents: 'Undetermined: an IVD eSTAR question, asked if the device is an IVD, which this plan was not told. If it is: ' + s.contents,
    }));
  const ivdSection = type === 'de_novo' ? conditionalSection(params.isIVD, 'the device is an IVD', IVD_PERFORMANCE_SECTION) : null;
  if (ivdSection) sections.push(ivdSection);
  return sections;
}

/** HDE, device-led BLA and an undetermined pathway: not eSTAR submissions. Their administrative section differs
 *  by pathway (NON_ESTAR_ADMIN, in the data file). */
function nonEstarUSSections(params: PlanDeviceSubmissionParams): SubmissionSection[] {
  const admin = params.usPathway === 'HDE' || params.usPathway === 'BLA' ? params.usPathway : 'other';
  const sections: SubmissionSection[] = [NON_ESTAR_ADMIN[admin], ...NON_ESTAR_SECTIONS];
  for (const c of NON_ESTAR_CONDITIONAL) {
    const planned = conditionalSection(params[c.fact], c.condition, c.section);
    if (planned) sections.push(planned);
  }
  return sections;
}

/**
 * A section required when the device answer is yes. 2026-10-15: an unstated answer dropped the
 * section from an HDE / BLA / undetermined plan; as on the eSTAR plan, it now stays, marked undetermined.
 */
function conditionalSection(answer: boolean | undefined, condition: string, section: SubmissionSection): SubmissionSection | null {
  if (answer === true) return section;
  if (answer === false) return null;
  return {
    ...section,
    contents: 'Undetermined: required if ' + condition + ', which this plan was not told. ' + section.contents,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The currency-registry fact that records the eSTAR mandate for each eSTAR pathway. */
const ESTAR_MANDATE_FACT: Partial<Record<USPathway, string>> = {
  '510(k)': 'fda-estar-510k-mandatory',
  'De Novo': 'fda-estar-denovo-mandatory',
};

interface EstarMandate {
  fact: RegulatoryFact;
  mandatory: boolean;
}

/**
 * Whether eSTAR is mandatory for `pathway` on `asOf`, read from the currency
 * registry by fact id. `statusAsOf` only promotes a `mandatory_upcoming` fact;
 * these two are stored `in_force` with their effective date, so a date before
 * that is checked here too. A pathway with no mandate fact returns undefined.
 */
function estarMandate(pathway: USPathway, asOf: string): EstarMandate | undefined {
  const id = ESTAR_MANDATE_FACT[pathway];
  if (!id) return undefined;
  const fact = REGULATORY_FACTS.find((f) => f.id === id);
  if (!fact) throw new Error('planDeviceSubmission: currency fact ' + id + ' is missing from the registry');
  const mandatory = statusAsOf(fact, asOf) === 'in_force' && asOf >= fact.effectiveDate;
  return { fact, mandatory };
}

/** The ESTAR finding: a requirement when the registry says the mandate is in force. */
function estarFinding(pathway: USPathway, asOf: string, estar: EstarMandate | undefined): Finding {
  if (!estar) {
    return {
      id: 'ESTAR',
      severity: 'info',
      statement:
        'The eSTAR mandates recorded in the regulatory currency registry cover 510(k) and De Novo; this plan ' +
        'is for ' + pathway + ', whose format is stated above.',
      citation: { source: 'FDA eSTAR Program', note: 'Electronic submission template.' },
    };
  }
  const { fact, mandatory } = estar;
  const citation: Citation = { source: 'FDA eSTAR Program', note: fact.topic, url: fact.sourceUrl, factId: fact.id };
  return mandatory
    ? {
        id: 'ESTAR',
        severity: 'requirement',
        statement:
          pathway + ' submissions must be made with the FDA eSTAR template, unless exempted, from ' +
          fact.effectiveDate + ' (in force as of ' + asOf + '). eSTAR is sent through the CDRH Portal (FDA\'s recommended route) or, for files over the Portal\'s size limits, ' +
          'mailed on electronic media to the CDRH Document Control Center.',
        citation,
      }
    : {
        id: 'ESTAR',
        severity: 'recommendation',
        statement:
          'As of ' + asOf + ' eSTAR is not yet mandatory for ' + pathway + '; it becomes mandatory on ' +
          fact.effectiveDate + '. Using it now avoids a reformat.',
        citation,
      };
}

/** The US content sections for a pathway that uses them (not PMA, not exempt). */
function commonUSSections(params: PlanDeviceSubmissionParams): SubmissionSection[] {
  const estarType = ESTAR_TYPE[params.usPathway];
  return estarType ? estarUSSections(params, estarType) : nonEstarUSSections(params);
}

/**
 * Produce a submission plan: the required content (eSTAR/510(k) sections or PMA
 * modules or EU technical documentation), an indicative timeline, and a
 * Pre-Submission (Q-Sub) strategy.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function planDeviceSubmission(params: PlanDeviceSubmissionParams): PlanDeviceSubmissionResult {
  const inputStates = booleanInputStates(params, PLAN_FLAGS);
  // 2026-11-08: a missing or unknown pathway was planned as "Pathway undetermined".
  refuseUnlessStated('planDeviceSubmission', [
    { field: 'usPathway', value: params.usPathway, ok: US_PATHWAYS.includes(params.usPathway), expected: 'one of ' + US_PATHWAYS.join(', ') },
  ], 'planned');
  const findings: Finding[] = [];
  const usSections: SubmissionSection[] = [];
  const timeline: TimelinePhase[] = [];

  const pathway = params.usPathway;
  let submissionFormat: string;

  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(asOf)) {
    throw new ComputationRefusal('invalid_input', 'planDeviceSubmission: asOf must be an ISO date (YYYY-MM-DD), got ' + JSON.stringify(asOf), 'asOf');
  }
  const estar = estarMandate(pathway, asOf);

  if (pathway === '510(k)') {
    submissionFormat = estar?.mandatory
      ? 'FDA eSTAR 510(k) (Traditional / Special / Abbreviated), sent through the CDRH Portal or to the CDRH Document Control Center'
      : '510(k) premarket notification (Traditional / Special / Abbreviated); eSTAR not mandatory as of ' + asOf;
    // The eSTAR registry carries the 510(k) Summary/Statement, the SE comparison
    // and performance testing (bench / animal / clinical) as slots.
    usSections.push(...commonUSSections(params));
  } else if (pathway === 'De Novo') {
    submissionFormat = estar?.mandatory
      ? 'FDA eSTAR De Novo request, sent through the CDRH Portal or to the CDRH Document Control Center'
      : 'De Novo classification request; eSTAR not mandatory as of ' + asOf;
    // The eSTAR registry carries the classification request with its
    // risk-to-benefit analysis and the proposed special controls as slots.
    usSections.push(...commonUSSections(params));
  } else if (pathway === 'PMA' || pathway === 'IDE-then-PMA') {
    submissionFormat = 'PMA application (modular or traditional) per 21 CFR 814.20';
    usSections.push(...PMA_SECTIONS);
    if (pathway === 'IDE-then-PMA') {
      findings.push({
        id: 'IDE-FIRST',
        severity: 'requirement',
        statement:
          'An approved IDE (21 CFR 812) and completed pivotal study precede the PMA; align the IDE protocol with ' +
          'the PMA endpoints during a Pre-Submission.',
        citation: { source: '21 CFR 812.20', note: 'IDE application precedes PMA clinical data.' },
      });
    }
  } else if (pathway === 'HDE') {
    submissionFormat = 'HDE application per 21 CFR 814 Subpart H (preceded by HUD designation)';
    usSections.push(...commonUSSections(params));
    usSections.push({
      sectionId: 'hud',
      title: 'HUD Designation & Probable Benefit',
      contents:
        'Humanitarian Use Device designation from OOPD (condition affecting not more than 8,000 individuals in the ' +
        'US per year) and a demonstration of safety and ' +
        'probable benefit (not full effectiveness).',
      citation: { source: '21 CFR 814.104', note: 'HDE application content.' },
    });
  } else if (pathway === 'exempt') {
    submissionFormat = 'No premarket submission — general controls only (registration, listing, QSR/QMSR, labeling, MDR).';
    usSections.push({
      sectionId: 'gc',
      title: 'General Controls Compliance File',
      contents:
        'Establishment registration & device listing, Quality System (21 CFR 820 / QMSR), labeling, and MDR ' +
        'reporting procedures; retain a Design History File even when exempt.',
      citation: { source: '21 CFR 807 Subpart B / 21 CFR 820', note: 'General controls for exempt devices.' },
    });
  } else if (pathway === 'BLA') {
    submissionFormat = 'BLA (PHS Act §351) — device-led combination reviewed by CDRH with CBER consult where applicable.';
    usSections.push(...commonUSSections(params));
    usSections.push({
      sectionId: 'bla-biologic',
      title: 'Biologic CMC & Clinical',
      contents: 'Biologic chemistry/manufacturing/controls and clinical data per the BLA.',
      citation: { source: 'PHS Act §351 / 21 CFR 601', note: 'BLA content.' },
    });
  } else {
    submissionFormat = 'Pathway undetermined — run selectDevicePathway first.';
    usSections.push(...commonUSSections(params));
  }

  // ── EU technical documentation ───────────────────────────────────────────
  const euTechnicalDocumentation: SubmissionSection[] = [];
  if (params.euMarket) {
    // 2026-11-08: an unstated isIVD planned the MDR documentation; it names both regulations now.
    const fw = params.isIVD === true ? 'IVDR' : params.isIVD === false ? 'MDR' : 'MDR or IVDR';
    const verification =
      params.isIVD === true
        ? 'analytical/clinical performance (Annex XIII).'
        : params.isIVD === false
          ? 'clinical evaluation (Annex XIV) with PMCF.'
          : 'clinical evaluation (MDR Annex XIV) with PMCF, or for an IVD analytical/clinical performance (IVDR Annex XIII).';
    for (const s of EU_TECHNICAL_DOCUMENTATION) {
      euTechnicalDocumentation.push({
        sectionId: s.sectionId,
        title: s.title,
        contents: s.sectionId === 'eu-verification' ? s.contents + verification : s.contents,
        citation: { source: fw + s.source, note: s.note },
      });
    }
    findings.push({
      id: 'EU-EUDAMED',
      severity: 'requirement',
      statement:
        'Register the manufacturer, authorized representative (if applicable), and device (with UDI-DI) in EUDAMED; ' +
        'appoint a Person Responsible for Regulatory Compliance (PRRC) per MDR/IVDR Article 15.',
      citation: { source: fw + ' Article 15 / 31', note: 'PRRC and EUDAMED registration.' },
    });
  } else if (params.euMarket !== false) {
    findings.push({
      id: 'EU-NOT-STATED',
      severity: 'requirement',
      statement:
        'Whether the device is also pursuing the EU market was not stated (euMarket), so no EU technical ' +
        'documentation or notified-body phase is planned.',
    });
  }

  // ── Timeline ─────────────────────────────────────────────────────────────
  // 2026-11-08: an unstated preSubmissionDone read as "none has occurred"; the phase and the strategy say so.
  const preSubOpen = typeof params.preSubmissionDone !== 'boolean';
  if (!params.preSubmissionDone && pathway !== 'exempt') {
    timeline.push({
      phase: 'Pre-Submission (Q-Sub)',
      durationEstimate:
        mdufaClock('qsub_pre_submission', 'Written feedback', 'calendar days') +
        ' (or 5 days before a scheduled meeting, whichever is sooner)',
      description: (preSubOpen ? 'If none has occurred (preSubmissionDone not stated): ' : '') +
        'Align with FDA on predicate/classification, test plan, endpoints, and acceptance criteria.',
    });
  }
  // 2026-10-15: an unstated clinicalDataIncluded gave the non-clinical estimate and an "optional" Q-Sub.
  const testingDuration =
    params.clinicalDataIncluded === true
      ? '12-36+ months (incl. clinical study)'
      : params.clinicalDataIncluded === false
        ? '3-9 months (non-clinical)'
        : 'Not estimated: whether clinical data are part of the submission was not stated (3-9 months non-clinical; 12-36+ months with a clinical study)';
  timeline.push({
    phase: 'Testing & Evidence Generation',
    durationEstimate: testingDuration,
    description: 'Execute bench, biocompatibility, sterility, software, and (if applicable) clinical studies.',
  });
  timeline.push({
    phase: 'Submission Compilation',
    durationEstimate: '1-3 months',
    description: 'Assemble the submission (' + submissionFormat + ') and internal QA review.',
  });
  if (pathway === '510(k)') {
    timeline.push({ phase: 'FDA Review (510(k))', durationEstimate: mdufaClock('510k', '510(k)') + ' (the clock pauses on Additional Information requests)', description: 'Acceptance review, substantive review, SE/NSE decision.' });
  } else if (pathway === 'De Novo') {
    timeline.push({ phase: 'FDA Review (De Novo)', durationEstimate: mdufaClock('de_novo', 'De Novo'), description: 'Classification review and grant with special controls.' });
  } else if (pathway === 'PMA' || pathway === 'IDE-then-PMA') {
    timeline.push({ phase: 'FDA Review (PMA)', durationEstimate: mdufaClock('pma_original', 'PMA') + ' (without advisory-committee input); a panel and the preapproval inspection may extend it', description: 'Filing review, substantive review, panel (if convened), inspection, approval.' });
  } else if (pathway === 'HDE') {
    timeline.push({ phase: 'FDA Review (HDE)', durationEstimate: '~75 FDA-days', description: 'Safety and probable-benefit review.' });
  }
  if (params.euMarket) {
    timeline.push({
      phase: 'EU Notified Body / CE Marking',
      durationEstimate: 'Class IIa/IIb/III: ~6-18 months of NB assessment (excludes self-certified Class I/A)',
      description: 'NB QMS audit + technical documentation review, CE certificate, EU Declaration of Conformity.',
    });
  }

  // ── Q-Sub strategy ───────────────────────────────────────────────────────
  let qSubStrategy: string;
  if (params.preSubmissionDone) {
    qSubStrategy =
      'A Pre-Submission has already occurred; incorporate FDA feedback into the submission, document how each ' +
      'comment was addressed, and consider a follow-up Q-Sub only if the test plan materially changed.';
  } else if (pathway === '510(k)' && params.clinicalDataIncluded === false) {
    qSubStrategy =
      'A Pre-Submission is optional but useful for a non-clinical 510(k) when the predicate choice or a recognized ' +
      'standard interpretation is uncertain. Many Traditional 510(k)s proceed without one.';
  } else {
    qSubStrategy =
      'A Pre-Submission (Q-Sub) is strongly recommended before this pathway to align on predicate/classification, ' +
      'study design, endpoints, sample size, and acceptance criteria, reducing the risk of an Additional Information ' +
      'request or a Not-Substantially-Equivalent/Not-Approvable outcome.';
  }
  if (preSubOpen) {
    qSubStrategy = 'Whether a Pre-Submission has already occurred was not stated (preSubmissionDone). If none has: ' + qSubStrategy;
  }

  findings.push(estarFinding(pathway, asOf, estar));
  findings.push({
    id: 'TOC',
    severity: 'info',
    statement:
      'Where a harmonized table of contents is accepted, structure the dossier per the IMDRF ToC to ease parallel ' +
      'US and EU/international filing.',
    citation: { source: 'IMDRF ToC', note: 'Harmonized table of contents.' },
  });

  return {
    usPathway: pathway,
    submissionFormat,
    usSections,
    euTechnicalDocumentation,
    timeline,
    qSubStrategy,
    findings,
    citations: SUBMISSION_CITATIONS,
    inputStates,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL REFERENCE EXPORTS (deterministic, for downstream consumers)
// ════════════════════════════════════════════════════════════════════════════

/** Frozen view of the consensus-standards table for callers that want it. */
export function listDeviceStandards(): StandardRef[] {
  return STANDARDS.map((s: StandardRef) => ({ ...s }));
}

/** Frozen view of the CFR reference map for callers that want it. */
export function listDeviceCfrReferences(): CfrRef[] {
  return Object.values(CFR).map((c: CfrRef) => ({ ...c }));
}
