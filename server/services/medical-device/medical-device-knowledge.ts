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
 * decision step is reached with no answer to it, so that AnA asks for it.
 *
 * @module server/services/medical-device/medical-device-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

import {
  CFR,
  CLINICAL_CITATIONS,
  GSPR_CITATIONS,
  PATHWAY_CITATIONS,
  SE_CITATIONS,
  STANDARDS,
  SUBMISSION_CITATIONS,
  type CfrRef,
  type Citation,
  type StandardRef,
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
import type { IvdrClass, MdrDeclaredClass } from '../../../shared/regulatory/device-class.js';
import type { DeviceClass } from '../../../shared/regulatory/device-class.js';
import { ComputationRefusal } from '../ana-biostats/computation-engine';

export type { Citation } from './medical-device-knowledge-data.js';

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

/** A determinate finding with severity for gap/requirement reporting. */
export interface Finding {
  id: string;
  severity: 'info' | 'recommendation' | 'requirement' | 'critical';
  statement: string;
  citation?: Citation;
}

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
  clinicalEvidenceLikelyRequired: boolean;
  approximateUSReviewClock: string;
  findings: Finding[];
  citations: Citation[];
}

/** The aspect a notified body assesses for a declared Class Is, Im or Ir device. */
const MDR_CLASS_I_ASPECT: Readonly<Record<'Is' | 'Im' | 'Ir', string>> = {
  Is: 'sterility (establishing, securing and maintaining sterile conditions)',
  Im: 'metrology (conformity with the metrological requirements)',
  Ir: 'reprocessing (cleaning, disinfection, sterilisation, maintenance and functional testing for reuse)',
};

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

/**
 * Select the US premarket pathway (510(k) / De Novo / PMA / HDE / exempt /
 * IDE-then-PMA / BLA) and the EU conformity-assessment route, with rationale.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function selectDevicePathway(params: SelectDevicePathwayParams): SelectDevicePathwayResult {
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

  // ── EU conformity route ──────────────────────────────────────────────────
  let euConformityRoute: EUConformityRoute = 'undetermined';
  let euConformityRationale: string;

  if (params.isIVD && params.euIvdrClass) {
    const c = params.euIvdrClass;
    if (c === 'A' && typeof params.sterile !== 'boolean') {
      // 2026-10-15: an unstated sterility was read as non-sterile, i.e. "no notified body".
      euConformityRoute = 'undetermined';
      euConformityRationale =
        'IVDR Class A: a device placed on the market sterile needs notified body involvement for the sterility ' +
        'aspects (IVDR Article 48); otherwise the manufacturer self-declares. Whether it is supplied sterile was ' +
        'not stated (sterile).';
    } else if (c === 'A' && params.sterile !== true && params.measuringFunction !== true) {
      euConformityRoute = 'self-certification (no NB)';
      euConformityRationale =
        'IVDR Class A (non-sterile, non-measuring): manufacturer self-declares conformity; technical ' +
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
  } else if (params.euMdrClass) {
    const c = params.euMdrClass;
    if (c === 'I') {
      if (params.sterile || params.measuringFunction || params.reusableSurgicalInstrument) {
        euConformityRoute = 'notified body involvement';
        euConformityRationale =
          'MDR Class I with sterile (Is), measuring (Im), or reusable-surgical-instrument (Ir) aspects: ' +
          'notified body involvement limited to that specific aspect; the rest is self-certified.';
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
  } else {
    euConformityRationale = 'EU class not supplied; provide euMdrClass or euIvdrClass to determine the conformity route.';
  }

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
    usPathway,
    usPathwayRationale,
    usAlternatives,
    euConformityRoute,
    euConformityRationale,
    clinicalEvidenceLikelyRequired,
    approximateUSReviewClock,
    findings,
    citations: PATHWAY_CITATIONS,
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

/** What the open steps 4 and 5 ask, for a rationale that names them. */
const SE_OPEN_STEP: Readonly<Record<string, string>> = {
  differentQuestionsOfSafetyEffectiveness:
    'whether the different technological characteristics raise different questions of safety and effectiveness',
  performanceDataDemonstratesEquivalence:
    'whether the performance data show the device is as safe and effective as the predicate',
};

export interface AssessSubstantialEquivalenceResult {
  determination: 'SE' | 'NSE' | 'indeterminate';
  determinationRationale: string;
  decisionPath: SEDecisionStep[];
  predicateAdequacy: string;
  performanceDataNeeded: Finding[];
  recommendedSubmissionType: '510(k)-Traditional' | '510(k)-Special' | '510(k)-Abbreviated' | 'De Novo (no valid predicate)';
  findings: Finding[];
  citations: Citation[];
}

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
  const decisionPath: SEDecisionStep[] = [];
  const findings: Finding[] = [];
  const performanceDataNeeded: Finding[] = [];

  let determination: 'SE' | 'NSE' | 'indeterminate' = 'indeterminate';
  let determinationRationale = '';

  // Step 1 — Is there a valid predicate?
  const predicateIdentified = seStepAnswer('predicateIdentified', params.predicateIdentified);
  decisionPath.push({
    step: '1',
    question: 'Is the predicate device legally marketed and a valid predicate (not removed for safety/effectiveness reasons)?',
    answer: predicateIdentified
      ? params.predicateRecalledForSafety
        ? 'A predicate was identified but it was recalled/withdrawn for design-related safety reasons.'
        : 'Yes — a legally marketed predicate has been identified.'
      : 'No predicate identified.',
    outcome: predicateIdentified && !params.predicateRecalledForSafety ? 'continue' : 'NSE',
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
  const openSteps: string[] = [];
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
        predicateAdequacy: 'Predicate valid but technological differences raise new questions.',
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

  // Performance data the submission must contain.
  performanceDataNeeded.push({
    id: 'PERF-BENCH',
    severity: 'requirement',
    statement:
      'Non-clinical bench performance testing comparing the subject device to the predicate against the same ' +
      'design specifications and recognized consensus standards.',
    citation: { source: '21 CFR 807.87', note: '510(k) content — performance data.' },
  });
  if (params.patientContacting) {
    performanceDataNeeded.push({
      id: 'PERF-BIOCOMPAT',
      severity: 'requirement',
      statement: 'Biocompatibility evaluation per ISO 10993-1, scoped to the nature and duration of body contact.',
      citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation of medical devices.' },
    });
  }
  if (params.sterile) {
    performanceDataNeeded.push({
      id: 'PERF-STERILE',
      severity: 'requirement',
      statement: 'Sterilization validation (ISO 11135 / ISO 11137), packaging/sterile-barrier (ISO 11607), and shelf-life data.',
      citation: { source: 'ISO 11135 / ISO 11137 / ISO 11607', note: 'Sterility and packaging validation.' },
    });
  }
  if (params.hasSoftware) {
    performanceDataNeeded.push({
      id: 'PERF-SOFTWARE',
      severity: 'requirement',
      statement:
        'Software documentation per FDA Premarket Software guidance (documentation level), verification & ' +
        'validation, and cybersecurity documentation (SBOM, threat model).',
      citation: { source: 'FDA Premarket Software / Cybersecurity Guidance', note: 'Software in a 510(k).' },
    });
  }
  if (params.isIVD) {
    performanceDataNeeded.push({
      id: 'PERF-IVD',
      severity: 'requirement',
      statement:
        'IVD analytical performance (precision, linearity, detection limit, interference, method comparison per ' +
        'CLSI EP protocols) and, where claims require, clinical performance (sensitivity/specificity, PPV/NPV).',
      citation: { source: 'CLSI EP-series', note: 'IVD analytical/clinical performance.' },
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

  // Recommended submission type.
  let recommendedSubmissionType: AssessSubstantialEquivalenceResult['recommendedSubmissionType'] =
    '510(k)-Traditional';
  if (sameTech && !params.hasSoftware && !params.isIVD) {
    recommendedSubmissionType = '510(k)-Abbreviated';
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
    predicateAdequacy: 'Adequate — valid predicate with same intended use.',
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

export interface ClinicalStudyRecommendation {
  studyType: 'none (non-clinical sufficient)' | 'literature/clinical evaluation' | 'real-world evidence' | 'feasibility (first-in-human)' | 'pivotal' | 'IVD clinical performance';
  rationale: string;
  designNotes: string;
  citation: Citation;
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
}

const unstated = (v: unknown): boolean => v === undefined || v === null;

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
  const findings: Finding[] = [];
  const recommendedStudies: ClinicalStudyRecommendation[] = [];
  const evidenceHierarchy: string[] = [];

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
  if (clinicalDataRequired === true) {
    if (params.novelTechnology || high) {
      recommendedStudies.push({
        studyType: 'feasibility (first-in-human)',
        rationale:
          'A small early feasibility / first-in-human study confirms basic safety, refines the device and the ' +
          'procedure, and informs the pivotal design before committing to the confirmatory trial.',
        designNotes:
          'Limited enrollment (commonly 10-30 subjects), often a single arm with safety endpoints and exploratory ' +
          'effectiveness; in the US this is a significant-risk study requiring an approved IDE (21 CFR 812). FDA ' +
          'Early Feasibility Study (EFS) program may apply.',
        citation: { source: 'FDA Early Feasibility Study Guidance', note: 'EFS / first-in-human device studies.' },
      });
    }
    if (params.isIVD) {
      recommendedStudies.push({
        studyType: 'IVD clinical performance',
        rationale:
          'For an IVD, the pivotal evidence is a clinical performance study establishing diagnostic accuracy ' +
          '(sensitivity, specificity, predictive values) against a clinical reference/comparator.',
        designNotes:
          'Define the intended-use population, comparator/reference method, and clinical decision thresholds; ' +
          'power for the primary accuracy estimate with acceptable confidence-interval width. Follow ISO 20916.',
        citation: { source: 'ISO 20916:2019 / EU IVDR Annex XIII', note: 'IVD clinical performance study.' },
      });
    } else {
      recommendedStudies.push({
        studyType: 'pivotal',
        rationale:
          'A pivotal (confirmatory) clinical investigation provides the primary valid scientific evidence of a ' +
          'reasonable assurance of safety and effectiveness for the labeled indication.',
        designNotes:
          'Prospective, hypothesis-testing; randomized/controlled where feasible (or a justified objective ' +
          'performance criterion / performance goal). Pre-specify the primary endpoint, success criteria, sample ' +
          'size, and statistical analysis plan; for US significant-risk studies an approved IDE is required.',
        citation: { source: '21 CFR 814.20(b)(6) / 21 CFR 812', note: 'Pivotal clinical evidence under IDE.' },
      });
    }
  } else if (clinicalDataRequired === false) {
    recommendedStudies.push({
      studyType: 'none (non-clinical sufficient)',
      rationale:
        'Non-clinical performance testing is expected to support the submission; a dedicated clinical trial is ' +
        'not anticipated for this pathway/risk profile.',
      designNotes:
        'Compile bench performance, biocompatibility, sterility, electrical safety/EMC, software V&V, and human ' +
        'factors as applicable; document any reliance on recognized consensus standards.',
      citation: { source: 'FDA 510(k) Program Guidance (2014)', note: 'Most 510(k)s rely on non-clinical data.' },
    });
  }

  if (params.existingLiterature) {
    recommendedStudies.push({
      studyType: 'literature/clinical evaluation',
      rationale:
        'A systematic literature review can support (or substitute for) primary data where a well-characterized ' +
        'device type and indication have substantial published evidence, particularly via the equivalence route ' +
        'in the EU.',
      designNotes:
        'Pre-specify search strategy, appraisal, and weighting (MEDDEV 2.7/1 rev 4); demonstrate device equivalence ' +
        '(technical, biological, clinical) if relying on third-party data.',
      citation: { source: 'MEDDEV 2.7/1 rev 4', note: 'Literature route for clinical evaluation.' },
    });
  }
  if (params.realWorldDataAvailable) {
    recommendedStudies.push({
      studyType: 'real-world evidence',
      rationale:
        'Fit-for-purpose real-world data (registries, EHR, claims) can generate real-world evidence to support ' +
        'expanded indications, post-market study commitments, or, in select cases, premarket decisions.',
      designNotes:
        'Assess data relevance and reliability (completeness, provenance, accuracy); pre-specify the analysis to ' +
        'control bias and confounding. RWE supports PMCF/post-market surveillance in the EU.',
      citation: { source: 'FDA RWE for Devices Guidance (2017)', note: 'Real-world evidence to support regulatory decisions.' },
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
  let euClinicalEvaluationPlan: string;
  if (params.euMarket) {
    if (params.isIVD) {
      euClinicalEvaluationPlan =
        'EU IVDR: conduct a performance evaluation (Annex XIII) establishing scientific validity, analytical ' +
        'performance, and clinical performance, documented in a Performance Evaluation Plan/Report (PEP/PER) with ' +
        'a Post-Market Performance Follow-up (PMPF) plan.';
    } else {
      const cls = params.euMdrClass;
      const implantOrIII = cls === 'III' || params.implantable === true;
      euClinicalEvaluationPlan =
        'EU MDR: conduct a clinical evaluation per Article 61 and Annex XIV — a Clinical Evaluation Plan/Report ' +
        '(CEP/CER) following MEDDEV 2.7/1 rev 4, using the literature/equivalence route where justified, plus a ' +
        'Post-Market Clinical Follow-up (PMCF) plan. ' +
        (implantOrIII
          ? 'For implantable and Class III devices, clinical investigations are generally required unless a ' +
            'rigorous equivalence justification to an existing device is accepted (Article 61(4)-(6)).'
          : 'For lower classes, the literature/equivalence route is often acceptable if the data are sufficient.');
    }
  } else {
    euClinicalEvaluationPlan = 'EU market not indicated; MDR/IVDR clinical/performance evaluation not scoped.';
  }

  // ── Evidence hierarchy (deterministic ordering) ──────────────────────────
  evidenceHierarchy.push('1. Risk analysis (ISO 14971) identifying clinical questions to be answered.');
  evidenceHierarchy.push('2. Non-clinical evidence (bench, biocompatibility, sterility, software V&V, animal where applicable).');
  evidenceHierarchy.push('3. Systematic literature review / clinical evaluation of the device type and indication.');
  evidenceHierarchy.push('4. Feasibility / first-in-human data (if novel or high-risk).');
  evidenceHierarchy.push('5. Pivotal clinical investigation (or IVD clinical performance study) for confirmatory evidence.');
  evidenceHierarchy.push('6. Real-world evidence and post-market follow-up (PMCF/PMPF) for the total product life cycle.');

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
    evidenceHierarchy,
    missingFacts,
    findings,
    citations: CLINICAL_CITATIONS,
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
  /** Whether the device is intended for lay/home use (usability emphasis). */
  layUse?: boolean;
  /** A QMS conforming to ISO 13485 is in place. */
  qmsInPlace?: boolean;
  /** A risk-management file per ISO 14971 exists. */
  riskManagementFile?: boolean;
  /** List of standard IDs the manufacturer claims conformity to (for gap analysis). */
  standardsClaimed?: string[];
}

export interface GSPRRow {
  gsprRef: string;
  requirement: string;
  /** null when the device property that decides it was not stated. */
  applicable: boolean | null;
  evidenceStandard: string;
  /** 'addressed' only by a stated input; 'not-assessed' when applicability was not stated. */
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
}

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
  const isIVD = params.isIVD === true;
  const framework = isIVD ? 'EU IVDR Annex I (GSPR)' : 'EU MDR Annex I (GSPR)';
  const annex = isIVD ? 'IVDR Annex I' : 'MDR Annex I';
  const rows: GSPRRow[] = [];
  const findings: Finding[] = [];

  const standardsClaimed = new Set((params.standardsClaimed ?? []).map((s: string) => s.trim()));
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
  // matrix never reports 'conforming'; those are confirmed from the technical documentation.
  const addRow = (
    gsprRef: string,
    requirement: string,
    applicable: boolean | null,
    evidenceStandard: string,
    addressed: boolean,
  ): void => {
    rows.push({
      gsprRef,
      requirement,
      applicable,
      evidenceStandard,
      status: applicable === null ? 'not-assessed' : !applicable ? 'not-applicable' : addressed ? 'addressed' : 'gap',
      citation: { source: annex + ' ' + gsprRef, note: requirement },
    });
  };

  // GSPR Chapter I — General requirements (1-9). Always applicable.
  addRow(
    'GSPR 1',
    'Devices shall achieve their intended performance and be safe and effective; risks acceptable when weighed against benefits.',
    true,
    'ISO 14971 risk management file; clinical/performance evaluation.',
    params.riskManagementFile === true,
  );
  addRow(
    'GSPR 2',
    'Reduce risks as far as possible (safe design/manufacture) without adversely affecting the benefit-risk ratio.',
    true,
    'ISO 14971 risk control; design FMEA; verification.',
    params.riskManagementFile === true,
  );
  addRow(
    'GSPR 3',
    'Establish, implement, document, and maintain a risk management system across the life cycle.',
    true,
    'ISO 14971:2019 risk management process and file.',
    params.riskManagementFile === true,
  );
  addRow(
    'GSPR 4',
    'Risk control measures: inherent safe design, protective measures, and information for safety (in that priority order).',
    true,
    'Design controls (ISO 13485 §7.3); ISO 14971 option analysis.',
    params.qmsInPlace === true && params.riskManagementFile === true,
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

  if (!params.qmsInPlace) {
    findings.push({
      id: 'QMS-MISSING',
      severity: 'critical',
      statement:
        'No ISO 13485 QMS indicated. A conforming quality management system is a precondition for MDR/IVDR ' +
        'conformity assessment and underpins GSPR evidence generation.',
      citation: { source: 'ISO 13485:2016 / MDR Article 10(9)', note: 'QMS requirement.' },
    });
  }
  if (!params.riskManagementFile) {
    findings.push({
      id: 'RMF-MISSING',
      severity: 'critical',
      statement:
        'No ISO 14971 risk management file indicated. GSPR Chapter I (requirements 1-8) cannot be demonstrated ' +
        'without a documented risk management process and file.',
      citation: { source: 'ISO 14971:2019 / MDR Annex I §3', note: 'Risk management file requirement.' },
    });
  }

  if (notAssessedRows.length > 0) {
    findings.push({
      id: 'APPLICABILITY-NOT-STATED',
      severity: 'requirement',
      statement:
        'Not assessed: ' + notAssessedRows.map((r: GSPRRow) => r.gsprRef).join(', ') + '. Whether each applies ' +
        'depends on a device property that was not stated (patient contact, sterile, medicinal substance, ' +
        'measuring function, radiation, software, active, implantable); state it true or false.',
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

export interface SubmissionSection {
  sectionId: string;
  title: string;
  contents: string;
  citation: Citation;
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
}

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
     performance content is named below rather than silently left out. */
  const variant = type === '510k' && params.isIVD ? 'ivd' : 'device';
  const sections = estarSlots(type, variant)
    .map((slot) => estarSlotSection(slot, flags, type))
    .filter((s): s is SubmissionSection => s !== null);
  if (type === 'de_novo' && params.isIVD) sections.push(IVD_PERFORMANCE_SECTION);
  return sections;
}

const IVD_PERFORMANCE_SECTION: SubmissionSection = {
  sectionId: 'ivd-perf',
  title: 'IVD Analytical & Clinical Performance',
  contents:
    'Analytical performance (precision, linearity, LoD/LoQ, interference, method comparison per CLSI EP) and ' +
    'clinical performance (sensitivity/specificity, predictive values) with reference/comparator method.',
  citation: { source: 'CLSI EP-series / ISO 20916', note: 'IVD performance.' },
};

/**
 * The administrative section of a non-eSTAR US filing. The form differs by
 * pathway, so it is stated per pathway rather than assumed:
 *   HDE  — the CDRH Premarket Review Submission Cover Sheet (FDA 3514) and an
 *          eCopy; no MDUFA user fee (HDE applications are fee-exempt).
 *   BLA  — Form FDA 356h, the BLA's own application form and cover sheet.
 *   undetermined — no form is named; it depends on the pathway.
 */
function nonEstarAdminSection(pathway: USPathway): SubmissionSection {
  if (pathway === 'HDE') {
    return {
      sectionId: 'admin',
      title: 'Administrative / Cover Letter and CDRH Premarket Review Submission Cover Sheet',
      contents:
        'Cover letter, CDRH Premarket Review Submission Cover Sheet (Form FDA 3514), applicant/contact info, and ' +
        'the eCopy. HDE applications are exempt from MDUFA user fees.',
      citation: { source: '21 CFR 814.104; FD&C Act §745A(b) (eCopy); FD&C Act §738(a)(2)(B)', note: 'HDE administrative content.' },
    };
  }
  if (pathway === 'BLA') {
    return {
      sectionId: 'admin',
      title: 'Administrative / Cover Letter and Form FDA 356h',
      contents:
        'Cover letter, Form FDA 356h (the application form and cover sheet for a BLA), applicant/contact and ' +
        'establishment information, and user-fee payment confirmation.',
      citation: { source: '21 CFR 601.2', note: 'BLA application form.' },
    };
  }
  return {
    sectionId: 'admin',
    title: 'Administrative / Cover Letter',
    contents:
      'Cover letter and applicant/contact info. The application form depends on the pathway: a 510(k) or De Novo ' +
      'is an eSTAR, which carries the cover-sheet data; an HDE or PMA uses the CDRH cover sheet (FDA 3514); a BLA ' +
      'uses Form FDA 356h. Determine the pathway first.',
    citation: { source: 'FDA eSTAR Program', note: 'Administrative content depends on the pathway.' },
  };
}

/** HDE, device-led BLA and an undetermined pathway: not eSTAR submissions. */
function nonEstarUSSections(params: PlanDeviceSubmissionParams): SubmissionSection[] {
  const sections: SubmissionSection[] = [nonEstarAdminSection(params.usPathway)];
  sections.push({
    sectionId: 'iface',
    title: 'Indications for Use & Device Description',
    contents:
      'Indications-for-use statement (Form FDA 3881), device description, principles of operation, components, ' +
      'and proposed labeling/IFU.',
    citation: { source: '21 CFR 807.87(e)-(f)', note: 'Device description and labeling.' },
  });
  sections.push({
    sectionId: 'risk',
    title: 'Risk Management',
    contents: 'ISO 14971 risk management summary/file (hazard analysis, risk controls, residual-risk evaluation).',
    citation: { source: 'ISO 14971:2019', note: 'Risk management.' },
  });
  sections.push({
    sectionId: 'bench',
    title: 'Non-Clinical / Bench Performance Testing',
    contents:
      'Performance bench testing per design specifications and recognized consensus standards; declarations of ' +
      'conformity to standards as applicable.',
    citation: { source: '21 CFR 807.87(g)', note: 'Performance data.' },
  });
  const conditional: Array<[boolean | undefined, string, SubmissionSection]> = [
    [params.patientContacting, 'the device contacts the patient', {
      sectionId: 'biocompat',
      title: 'Biocompatibility',
      contents: 'ISO 10993-1 biological evaluation plan/report scoped to contact type and duration.',
      citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation.' },
    }],
    [params.sterile, 'the device is supplied sterile', {
      sectionId: 'sterile',
      title: 'Sterilization, Shelf Life & Packaging',
      contents: 'Sterilization method and validation (ISO 11135/11137), sterile barrier (ISO 11607), shelf-life/aging.',
      citation: { source: 'ISO 11135 / ISO 11137 / ISO 11607', note: 'Sterility and packaging.' },
    }],
    [params.hasSoftware, 'the device contains software', {
      sectionId: 'software',
      title: 'Software & Cybersecurity',
      contents:
        'Software documentation per FDA Premarket Software guidance (documentation level), IEC 62304 life-cycle ' +
        'artifacts, V&V, and cybersecurity (threat model, SBOM, IEC 81001-5-1).',
      citation: { source: 'FDA Premarket Software / Cybersecurity Guidance', note: 'Software documentation.' },
    }],
    [params.isIVD, 'the device is an IVD', IVD_PERFORMANCE_SECTION],
  ];
  for (const [answer, condition, section] of conditional) {
    const planned = conditionalSection(answer, condition, section);
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
  const findings: Finding[] = [];
  const usSections: SubmissionSection[] = [];
  const timeline: TimelinePhase[] = [];

  const pathway = params.usPathway;
  let submissionFormat: string;

  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(asOf)) {
    throw new Error('planDeviceSubmission: asOf must be an ISO date (YYYY-MM-DD), got ' + JSON.stringify(asOf));
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
    usSections.push({
      sectionId: 'pma-summary',
      title: 'PMA Summary & Indications',
      contents: 'Summary of safety and effectiveness, indications for use, and device description.',
      citation: { source: '21 CFR 814.20(b)(3)', note: 'PMA summary.' },
    });
    usSections.push({
      sectionId: 'pma-nonclinical',
      title: 'Non-Clinical Laboratory Studies (Module)',
      contents:
        'Bench, biocompatibility, sterility, shelf-life, software, electrical safety/EMC, and animal studies (with ' +
        'GLP statements per 21 CFR 58).',
      citation: { source: '21 CFR 814.20(b)(6)(i)', note: 'Non-clinical studies module.' },
    });
    usSections.push({
      sectionId: 'pma-clinical',
      title: 'Clinical Investigations (Module)',
      contents:
        'Pivotal clinical study report(s), protocols, statistical analyses, and safety/effectiveness results ' +
        'constituting the valid scientific evidence.',
      citation: { source: '21 CFR 814.20(b)(6)(ii)', note: 'Clinical investigations module.' },
    });
    usSections.push({
      sectionId: 'pma-manufacturing',
      title: 'Manufacturing Information (Module)',
      contents: 'Manufacturing methods, facilities, and QSR/QMSR controls (supports the PMA preapproval inspection).',
      citation: { source: '21 CFR 814.20(b)(4)', note: 'Manufacturing information.' },
    });
    usSections.push({
      sectionId: 'pma-benefit-risk',
      title: 'Benefit-Risk & Labeling',
      contents: 'Benefit-risk determination and proposed labeling/IFU.',
      citation: { source: 'FDA Benefit-Risk Factors Guidance (2019)', note: 'Benefit-risk for PMA.' },
    });
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
    const isIVD = params.isIVD === true;
    const annex = isIVD ? 'IVDR Annex II/III' : 'MDR Annex II/III';
    euTechnicalDocumentation.push({
      sectionId: 'eu-description',
      title: 'Device Description & Specification',
      contents: 'Device description, variants/accessories, intended purpose, intended users/patients, and prior generations.',
      citation: { source: annex + ' §1', note: 'Device description and specification.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-labeling',
      title: 'Information Supplied by the Manufacturer (Label & IFU)',
      contents: 'Labels, IFU, and packaging in required languages; UDI assignment.',
      citation: { source: annex + ' §2', note: 'Labeling and instructions for use.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-design',
      title: 'Design & Manufacturing Information',
      contents: 'Design stages, manufacturing processes, and sites; supplier/subcontractor controls.',
      citation: { source: annex + ' §3', note: 'Design and manufacturing information.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-gspr',
      title: 'GSPR Conformity Checklist',
      contents:
        'General Safety and Performance Requirements checklist mapping each applicable requirement to the ' +
        'standards/evidence demonstrating conformity (see assessEssentialPrinciples).',
      citation: { source: (isIVD ? 'IVDR' : 'MDR') + ' Annex I', note: 'GSPR conformity demonstration.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-riskbenefit',
      title: 'Benefit-Risk Analysis & Risk Management',
      contents: 'ISO 14971 risk management file and the overall benefit-risk determination.',
      citation: { source: (isIVD ? 'IVDR' : 'MDR') + ' Annex I §1-8', note: 'Risk management and benefit-risk.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-verification',
      title: 'Product Verification & Validation',
      contents:
        'Pre-clinical/bench data, biocompatibility, sterility, software, electrical safety, and ' +
        (isIVD ? 'analytical/clinical performance (Annex XIII).' : 'clinical evaluation (Annex XIV) with PMCF.'),
      citation: { source: annex + ' §6', note: 'Verification and validation.' },
    });
    euTechnicalDocumentation.push({
      sectionId: 'eu-pms',
      title: 'Post-Market Surveillance Documentation',
      contents:
        'PMS plan, PSUR (Class IIa/IIb/III) or PMS report (Class I), PMCF/PMPF plan, and trend/vigilance reporting.',
      citation: { source: (isIVD ? 'IVDR' : 'MDR') + ' Annex III', note: 'Post-market surveillance documentation.' },
    });
    findings.push({
      id: 'EU-EUDAMED',
      severity: 'requirement',
      statement:
        'Register the manufacturer, authorized representative (if applicable), and device (with UDI-DI) in EUDAMED; ' +
        'appoint a Person Responsible for Regulatory Compliance (PRRC) per MDR/IVDR Article 15.',
      citation: { source: (params.isIVD ? 'IVDR' : 'MDR') + ' Article 15 / 31', note: 'PRRC and EUDAMED registration.' },
    });
  }

  // ── Timeline ─────────────────────────────────────────────────────────────
  if (!params.preSubmissionDone && pathway !== 'exempt') {
    timeline.push({
      phase: 'Pre-Submission (Q-Sub)',
      durationEstimate:
        mdufaClock('qsub_pre_submission', 'Written feedback', 'calendar days') +
        ' (or 5 days before a scheduled meeting, whichever is sooner)',
      description: 'Align with FDA on predicate/classification, test plan, endpoints, and acceptance criteria.',
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
