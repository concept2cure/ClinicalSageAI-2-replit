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
 * Its only sibling dependency is `medical-device-knowledge-data.ts`, which
 * holds the verbatim reference tables and citation lists this engine applies.
 *
 * @module server/services/medical-device/medical-device-knowledge
 */

/* eslint-disable @typescript-eslint/no-magic-numbers */

import {
  CFR,
  CLASSIFY_CITATIONS,
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

export type { Citation } from './medical-device-knowledge-data.js';

// ════════════════════════════════════════════════════════════════════════════
// SHARED TYPES
// ════════════════════════════════════════════════════════════════════════════

/** US device risk class per 21 CFR 860.3. */
export type USDeviceClass = 'I' | 'II' | 'III' | 'unclassified';

/** EU MDR device class per Regulation (EU) 2017/745, Annex VIII. */
export type EUMDRClass = 'I' | 'Is' | 'Im' | 'Ir' | 'IIa' | 'IIb' | 'III';

/** EU IVDR device class per Regulation (EU) 2017/746, Annex VIII. */
export type EUIVDRClass = 'A' | 'B' | 'C' | 'D';

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

/** Invasiveness category — drives MDR Annex VIII rules. */
export type Invasiveness =
  | 'non-invasive'
  | 'invasive-body-orifice'
  | 'surgically-invasive'
  | 'implantable'
  | 'active'
  | 'active-implantable';

/** Duration of continuous contact/use per MDR Annex VIII §1.1. */
export type ContactDuration = 'transient' | 'short-term' | 'long-term';

/** Device contact site for biocompatibility / classification. */
export type ContactSite =
  | 'skin-intact'
  | 'mucosal'
  | 'breached-skin'
  | 'blood-indirect'
  | 'circulatory-cns'
  | 'none';

/** A classification rule applied (MDR/IVDR Annex VIII or 21 CFR product code). */
export interface ClassificationRule {
  jurisdiction: 'US' | 'EU-MDR' | 'EU-IVDR';
  ruleId: string;
  ruleText: string;
  citation: Citation;
}

/** A determinate finding with severity for gap/requirement reporting. */
export interface Finding {
  id: string;
  severity: 'info' | 'recommendation' | 'requirement' | 'critical';
  statement: string;
  citation?: Citation;
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 1: classifyDevice
// ════════════════════════════════════════════════════════════════════════════

export interface ClassifyDeviceParams {
  /** Plain-language device name. */
  deviceName?: string;
  /** Intended use / indications for use statement. */
  intendedUse: string;
  /** Whether the device is an in-vitro diagnostic (IVD). */
  isIVD?: boolean;
  /** Whether the device incorporates software / is Software as a Medical Device. */
  isSoftware?: boolean;
  /** Level of patient harm if the device fails or is misused. */
  riskLevel: 'low' | 'moderate' | 'high';
  /** Invasiveness category (drives MDR Annex VIII). */
  invasiveness?: Invasiveness;
  /** Duration of continuous body contact / use. */
  contactDuration?: ContactDuration;
  /** Body contact site. */
  contactSite?: ContactSite;
  /** Whether the device is intended to be implanted. */
  implantable?: boolean;
  /** Whether the device is life-supporting or life-sustaining. */
  lifeSustaining?: boolean;
  /** Whether device delivers/exchanges energy or substances to/from the body (active). */
  active?: boolean;
  /** Whether device administers or removes a medicinal product (MDR Rule 12/22). */
  administersMedicine?: boolean;
  /** Whether device incorporates a medicinal substance with ancillary action (MDR Rule 14). */
  incorporatesMedicinalSubstance?: boolean;
  /** Whether device is composed of substances absorbed by the body (MDR Rule 21). */
  absorbedSubstance?: boolean;
  /** Whether device uses non-viable tissues/cells of human or animal origin (MDR Rule 18). */
  animalOrHumanTissue?: boolean;
  // ── IVDR-specific signals ────────────────────────────────────────────────
  /** IVD detects a transmissible agent posing high risk of propagation (IVDR Rule 1 → D). */
  ivdHighRiskTransmissible?: boolean;
  /** IVD used for blood/organ donor screening or transmissible-agent compatibility (IVDR Rule 1 → D). */
  ivdDonorScreening?: boolean;
  /** IVD detects transmissible agent — moderate public-health risk (IVDR Rule 2 → C). */
  ivdTransmissibleModerate?: boolean;
  /** IVD is a companion diagnostic (IVDR Rule 3(c) → C). */
  ivdCompanionDiagnostic?: boolean;
  /** IVD for disease staging / screening / management decisions (IVDR Rule 3 → C). */
  ivdManagementCritical?: boolean;
  /** IVD is for self-testing (IVDR Rule 4 → C, except those with low risk → B). */
  ivdSelfTesting?: boolean;
  /** IVD is a general reagent/instrument/buffer with no specific characteristics (IVDR Rule 5 → A). */
  ivdGeneralReagent?: boolean;
}

export interface ClassifyDeviceResult {
  deviceName: string;
  intendedUse: string;
  isIVD: boolean;
  usClass: USDeviceClass;
  usClassRationale: string;
  euMdrClass?: EUMDRClass;
  euIvdrClass?: EUIVDRClass;
  euClassRationale: string;
  appliedRules: ClassificationRule[];
  generalControlsApply: boolean;
  specialControlsLikely: boolean;
  premarketApprovalLikely: boolean;
  findings: Finding[];
  citations: Citation[];
}

function classifyIVDR(p: ClassifyDeviceParams, rules: ClassificationRule[]): EUIVDRClass {
  // IVDR Annex VIII, Rules 1-7. Highest applicable rule governs (Annex VIII §1.1).
  if (p.ivdHighRiskTransmissible || p.ivdDonorScreening) {
    rules.push({
      jurisdiction: 'EU-IVDR',
      ruleId: 'IVDR Rule 1',
      ruleText:
        'Devices intended to detect the presence of, or exposure to, a transmissible agent ' +
        'in blood/components/organs/tissues to assess suitability for transfusion/transplantation, ' +
        'or to detect a transmissible agent that causes a life-threatening disease with high risk ' +
        'of propagation, are Class D.',
      citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 1', note: 'Highest-risk IVDs — Class D.' },
    });
    return 'D';
  }
  if (p.ivdTransmissibleModerate) {
    rules.push({
      jurisdiction: 'EU-IVDR',
      ruleId: 'IVDR Rule 2/3',
      ruleText:
        'Devices to detect a transmissible agent without high propagation risk, or other Rule 3 ' +
        'categories (companion diagnostics, disease staging, screening, management), are Class C.',
      citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 2/3', note: 'Moderate public-health risk — Class C.' },
    });
    return 'C';
  }
  if (p.ivdCompanionDiagnostic || p.ivdManagementCritical) {
    rules.push({
      jurisdiction: 'EU-IVDR',
      ruleId: 'IVDR Rule 3',
      ruleText:
        'Companion diagnostics; devices for disease staging, screening, diagnosis, or to assess ' +
        'patient management/treatment decisions, are Class C.',
      citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 3', note: 'Companion diagnostics / management-critical — Class C.' },
    });
    return 'C';
  }
  if (p.ivdSelfTesting) {
    rules.push({
      jurisdiction: 'EU-IVDR',
      ruleId: 'IVDR Rule 4',
      ruleText:
        'Devices intended for self-testing are Class C, except those whose result is not determining ' +
        'a medically critical status, or is preliminary and requires confirmatory testing, which are Class B.',
      citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 4', note: 'Self-testing IVDs — generally Class C.' },
    });
    return 'C';
  }
  if (p.ivdGeneralReagent) {
    rules.push({
      jurisdiction: 'EU-IVDR',
      ruleId: 'IVDR Rule 5',
      ruleText:
        'Products without a specific intended purpose (general lab reagents, buffers, washing solutions, ' +
        'general instruments, specimen receptacles) are Class A.',
      citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 5', note: 'General reagents / instruments — Class A.' },
    });
    return 'A';
  }
  // Rule 6 — catch-all: devices not covered by Rules 1-5 are Class B.
  rules.push({
    jurisdiction: 'EU-IVDR',
    ruleId: 'IVDR Rule 6',
    ruleText:
      'Devices not covered by Rules 1-5 (and not Rule 7 controls/calibrators) default to Class B.',
    citation: { source: 'EU IVDR 2017/746 Annex VIII Rule 6', note: 'Default IVD class — Class B.' },
  });
  return 'B';
}

function classifyMDR(p: ClassifyDeviceParams, rules: ClassificationRule[]): EUMDRClass {
  // EU MDR Annex VIII. Highest class wins (Annex VIII §3.1). We evaluate the
  // dominant rule for the supplied signals; supporting rules are recorded.
  const inv: Invasiveness = p.invasiveness ?? (p.implantable ? 'implantable' : p.active ? 'active' : 'non-invasive');
  const duration: ContactDuration = p.contactDuration ?? 'transient';

  // Rule 14 — device incorporating a medicinal substance with ancillary action → Class III.
  if (p.incorporatesMedicinalSubstance) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 14',
      ruleText:
        'Devices incorporating, as an integral part, a substance which, if used separately, would be ' +
        'a medicinal product (including human blood derivative) with action ancillary to the device, ' +
        'are Class III.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 14', note: 'Drug-device combination — Class III.' },
    });
    return 'III';
  }

  // Rule 21 — substances introduced and absorbed by the body → Class III (systemic) / IIa-IIb.
  if (p.absorbedSubstance) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 21',
      ruleText:
        'Devices composed of substances/combinations absorbed by or locally dispersed in the body are ' +
        'Class III if systemically absorbed to achieve their purpose; IIb if applied in a body cavity ' +
        'and absorbed; otherwise IIa.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 21', note: 'Absorbable substance devices.' },
    });
    return p.riskLevel === 'high' ? 'III' : 'IIb';
  }

  // Rule 18 — devices using non-viable animal/human tissue → Class III (with contact exceptions).
  if (p.animalOrHumanTissue) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 18',
      ruleText:
        'Devices manufactured utilising non-viable tissues or cells of human/animal origin, or their ' +
        'derivatives, are Class III, unless intended to contact intact skin only (then Class I).',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 18', note: 'Animal/human tissue devices — Class III.' },
    });
    return p.contactSite === 'skin-intact' ? 'I' : 'III';
  }

  // Active implantable / implantable surgically-invasive long-term → Class III/IIb (Rules 6/8).
  if (inv === 'active-implantable' || (p.implantable && p.lifeSustaining)) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 8 / AIMD',
      ruleText:
        'Active implantable devices and their accessories are Class III. Implantable and long-term ' +
        'surgically invasive devices are generally Class IIb, escalating to Class III where life-supporting, ' +
        'in direct contact with heart/CNS/central circulatory system, or with a biological effect/full absorption.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 8', note: 'Implantable devices — Class IIb/III.' },
    });
    return 'III';
  }

  if (inv === 'implantable' || (inv === 'surgically-invasive' && duration === 'long-term')) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 8',
      ruleText:
        'All implantable devices and long-term surgically invasive devices are Class IIb, unless they ' +
        'are intended to be in direct contact with the heart, central circulatory system or CNS (Class III), ' +
        'or have a biological effect / are absorbed (Class III).',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 8', note: 'Implantable / long-term invasive — Class IIb (III if heart/CNS).' },
    });
    return p.contactSite === 'circulatory-cns' || p.riskLevel === 'high' ? 'III' : 'IIb';
  }

  // Rule 22 — active therapeutic devices with an integrated/incorporated diagnostic function → III.
  if (p.administersMedicine && inv === 'active') {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 12',
      ruleText:
        'Active devices intended to administer and/or remove medicinal products, body liquids or other ' +
        'substances to/from the body are Class IIa, unless this is done in a manner potentially hazardous ' +
        'taking account of the substance, body part and mode of application, in which case Class IIb.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 12', note: 'Active substance administration — IIa/IIb.' },
    });
    return p.riskLevel === 'high' ? 'IIb' : 'IIa';
  }

  // Active devices — Rules 9/10/11 (therapeutic energy, diagnostic, software).
  if (inv === 'active' || p.active || p.isSoftware) {
    if (p.isSoftware) {
      rules.push({
        jurisdiction: 'EU-MDR',
        ruleId: 'MDR Rule 11',
        ruleText:
          'Software intended to provide information used to take decisions with diagnosis/therapeutic ' +
          'purposes is Class IIa, escalating to IIb (serious deterioration / surgical intervention) or III ' +
          '(death / irreversible deterioration). Software intended to monitor physiological processes is IIa ' +
          '(IIb where vital parameters and variation could result in immediate danger). Otherwise Class I.',
        citation: { source: 'EU MDR 2017/745 Annex VIII Rule 11', note: 'Software/SaMD classification.' },
      });
      if (p.lifeSustaining || p.riskLevel === 'high') return 'III';
      if (p.riskLevel === 'moderate') return 'IIb';
      return 'IIa';
    }
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 9/10',
      ruleText:
        'Active therapeutic devices administering/exchanging energy are Class IIa, or IIb where this may ' +
        'be done in a potentially hazardous way. Active devices for diagnosis/monitoring are Class IIa, ' +
        'escalating to IIb for monitoring of vital physiological parameters.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 9/10', note: 'Active therapeutic / diagnostic devices.' },
    });
    if (p.lifeSustaining || p.riskLevel === 'high') return 'IIb';
    return p.riskLevel === 'moderate' ? 'IIb' : 'IIa';
  }

  // Invasive in body orifices — Rule 5.
  if (inv === 'invasive-body-orifice') {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 5',
      ruleText:
        'Invasive devices with respect to body orifices (other than surgically invasive) are Class I if ' +
        'transient, Class IIa if short-term, Class IIb if long-term (Class I if used in the oral cavity/ear ' +
        'canal/nasal cavity and not liable to be absorbed by the mucous membrane).',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 5', note: 'Body-orifice invasive devices.' },
    });
    if (duration === 'long-term') return 'IIb';
    if (duration === 'short-term') return 'IIa';
    return 'I';
  }

  // Surgically invasive, transient/short-term — Rules 6/7.
  if (inv === 'surgically-invasive') {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 6/7',
      ruleText:
        'Surgically invasive devices for transient use are Class IIa (Class III if in direct contact with ' +
        'heart/CNS/central circulatory system, or with a biological effect, or absorbable). Short-term ' +
        'surgically invasive devices are Class IIa, escalating to IIb/III on the same criteria.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 6/7', note: 'Surgically invasive (transient/short-term).' },
    });
    if (p.contactSite === 'circulatory-cns') return 'III';
    return duration === 'short-term' && p.riskLevel === 'high' ? 'IIb' : 'IIa';
  }

  // Rule 4 — non-invasive devices in contact with injured skin/mucous membrane.
  if (inv === 'non-invasive' && (p.contactSite === 'breached-skin' || p.contactSite === 'mucosal')) {
    rules.push({
      jurisdiction: 'EU-MDR',
      ruleId: 'MDR Rule 4',
      ruleText:
        'Non-invasive devices in contact with injured skin or mucous membrane are Class I (mechanical ' +
        'barrier/absorption of exudates), IIb (principally managing wound micro-environment), or IIa otherwise.',
      citation: { source: 'EU MDR 2017/745 Annex VIII Rule 4', note: 'Non-invasive injured-skin/mucosa contact.' },
    });
    return p.riskLevel === 'high' ? 'IIb' : 'IIa';
  }

  // Rules 1-3 — non-invasive default to Class I.
  rules.push({
    jurisdiction: 'EU-MDR',
    ruleId: 'MDR Rule 1',
    ruleText:
      'All non-invasive devices are Class I, unless one of the higher rules (2 channeling/storing blood, ' +
      '3 modifying biological/chemical composition) applies. Class I subtypes: Is (sterile), Im (measuring ' +
      'function), Ir (reusable surgical instrument).',
    citation: { source: 'EU MDR 2017/745 Annex VIII Rule 1', note: 'Non-invasive devices — Class I.' },
  });
  return 'I';
}

/**
 * Determine US device class (I/II/III) and EU MDR/IVDR class from intended use,
 * risk, invasiveness, and duration, recording the applicable classification rule.
 *
 * Deterministic: no LLM, no network, no I/O.
 */
export function classifyDevice(params: ClassifyDeviceParams): ClassifyDeviceResult {
  const isIVD = params.isIVD === true;
  const findings: Finding[] = [];
  const appliedRules: ClassificationRule[] = [];

  // ── US classification (21 CFR 860.3) ─────────────────────────────────────
  let usClass: USDeviceClass = 'I';
  let usClassRationale: string;

  const lifeSustaining = params.lifeSustaining === true;
  const implantable = params.implantable === true || params.invasiveness === 'implantable' || params.invasiveness === 'active-implantable';
  const highRisk = params.riskLevel === 'high';

  if (lifeSustaining || (implantable && highRisk) || params.invasiveness === 'active-implantable') {
    usClass = 'III';
    usClassRationale =
      'Class III — device is life-supporting/life-sustaining, of substantial importance in preventing ' +
      'impairment of human health, or presents a potential unreasonable risk of illness or injury, and ' +
      'general/special controls are insufficient to provide reasonable assurance of safety and effectiveness ' +
      '(21 CFR 860.3(c)(3)). Premarket approval (PMA) is the default pathway unless a predicate enables 510(k) ' +
      'or De Novo applies.';
    appliedRules.push({
      jurisdiction: 'US',
      ruleId: '21 CFR 860.3(c)(3)',
      ruleText:
        'Class III devices are those for which general and special controls are insufficient to provide ' +
        'reasonable assurance of safety and effectiveness, and which are life-supporting/life-sustaining, ' +
        'of substantial importance, or present a potential unreasonable risk of illness or injury.',
      citation: { source: CFR['860.3'].key, note: CFR['860.3'].title },
    });
  } else if (highRisk || params.riskLevel === 'moderate' || params.isSoftware || implantable) {
    usClass = 'II';
    usClassRationale =
      'Class II — general controls alone are insufficient to provide reasonable assurance of safety and ' +
      'effectiveness; the device can be adequately controlled through special controls (performance standards, ' +
      'post-market surveillance, patient registries, special labeling, guidance) per 21 CFR 860.3(c)(2). ' +
      'The 510(k) premarket notification pathway typically applies (or De Novo if no predicate exists).';
    appliedRules.push({
      jurisdiction: 'US',
      ruleId: '21 CFR 860.3(c)(2)',
      ruleText:
        'Class II devices require special controls in addition to general controls to provide reasonable ' +
        'assurance of safety and effectiveness.',
      citation: { source: CFR['860.3'].key, note: CFR['860.3'].title },
    });
  } else {
    usClass = 'I';
    usClassRationale =
      'Class I — general controls (registration & listing, GMP/QSR, labeling, MDR reporting) are sufficient ' +
      'to provide reasonable assurance of safety and effectiveness per 21 CFR 860.3(c)(1). Many Class I devices ' +
      'are 510(k)-exempt under 21 CFR Part 862-892 limitations.';
    appliedRules.push({
      jurisdiction: 'US',
      ruleId: '21 CFR 860.3(c)(1)',
      ruleText:
        'Class I devices are subject only to general controls, which are sufficient to provide reasonable ' +
        'assurance of safety and effectiveness.',
      citation: { source: CFR['860.3'].key, note: CFR['860.3'].title },
    });
  }

  // ── EU classification ────────────────────────────────────────────────────
  let euMdrClass: EUMDRClass | undefined;
  let euIvdrClass: EUIVDRClass | undefined;
  let euClassRationale: string;

  if (isIVD) {
    euIvdrClass = classifyIVDR(params, appliedRules);
    const ivdrConformity: Record<EUIVDRClass, string> = {
      A: 'Class A — lowest risk; self-declaration of conformity (notified body only if sterile/measuring).',
      B: 'Class B — notified body assessment of technical documentation on a sampling basis.',
      C: 'Class C — notified body assessment of technical documentation and QMS.',
      D: 'Class D — highest risk; notified body + EU reference laboratory verification + scrutiny.',
    };
    euClassRationale = ivdrConformity[euIvdrClass];
  } else {
    euMdrClass = classifyMDR(params, appliedRules);
    const mdrConformity: Record<EUMDRClass, string> = {
      I: 'Class I — self-certification; manufacturer issues the EU Declaration of Conformity (no notified body).',
      Is: 'Class Is (sterile) — notified body involvement limited to aspects of sterility.',
      Im: 'Class Im (measuring) — notified body involvement limited to metrological aspects.',
      Ir: 'Class Ir (reusable surgical instrument) — notified body involvement limited to reprocessing aspects.',
      IIa: 'Class IIa — notified body conformity assessment (Annex IX QMS or Annex XI).',
      IIb: 'Class IIb — notified body conformity assessment with technical-documentation review.',
      III: 'Class III — notified body full QMS + technical documentation assessment; clinical evaluation scrutiny.',
    };
    euClassRationale = mdrConformity[euMdrClass];
  }

  // ── Cross-cutting findings ───────────────────────────────────────────────
  if (params.isSoftware) {
    findings.push({
      id: 'SW-LIFECYCLE',
      severity: 'requirement',
      statement:
        'Software/SaMD: apply IEC 62304 software life-cycle processes and an IEC 62304 safety class (A/B/C). ' +
        'For FDA, follow the Software Functions / Premarket Submissions guidance and cybersecurity guidance.',
      citation: { source: 'IEC 62304:2006+A1:2015', note: 'Medical device software life-cycle processes.' },
    });
  }
  if (params.contactSite && params.contactSite !== 'none') {
    findings.push({
      id: 'BIOCOMPAT',
      severity: 'requirement',
      statement:
        'Patient-contacting device: a biological evaluation per ISO 10993-1 is required, scoped by nature ' +
        'and duration of contact (' + (params.contactSite) + ' / ' + (params.contactDuration ?? 'transient') + ').',
      citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation within a risk-management process.' },
    });
  }
  findings.push({
    id: 'RISK-MGMT',
    severity: 'requirement',
    statement:
      'A risk management process per ISO 14971 must be established; the overall residual risk must be judged ' +
      'acceptable against benefits, and is foundational to both FDA benefit-risk and MDR/IVDR GSPR conformity.',
    citation: { source: 'ISO 14971:2019', note: 'Application of risk management to medical devices.' },
  });

  return {
    deviceName: params.deviceName ?? 'unnamed device',
    intendedUse: params.intendedUse,
    isIVD,
    usClass,
    usClassRationale,
    euMdrClass,
    euIvdrClass,
    euClassRationale,
    appliedRules,
    generalControlsApply: true,
    specialControlsLikely: usClass === 'II',
    premarketApprovalLikely: usClass === 'III',
    findings,
    citations: CLASSIFY_CITATIONS,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// FUNCTION 2: selectDevicePathway
// ════════════════════════════════════════════════════════════════════════════

export interface SelectDevicePathwayParams {
  /** US device class (I/II/III) — from classifyDevice or known product code. */
  usClass: USDeviceClass;
  /** Whether a legally marketed predicate device exists. */
  predicateExists: boolean;
  /** Whether the device is a novel low-to-moderate risk type with no predicate (De Novo candidate). */
  novelLowModerateRisk?: boolean;
  /** Whether the device is intended to benefit patients in a rare condition (HDE: <8,000/yr in US). */
  humanitarianUseDevice?: boolean;
  /** Estimated US patient population per year (for HUD/HDE eligibility). */
  estimatedAnnualUSPopulation?: number;
  /** Whether the device/product code is 510(k)-exempt. */
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
  const hudEligible =
    params.humanitarianUseDevice === true && (annualPop === undefined || annualPop < 8000);

  if (params.isBiologic) {
    usPathway = 'BLA';
    usPathwayRationale =
      'The product is regulated as a biologic; a Biologics License Application (BLA) under PHS Act §351 ' +
      'applies (a device-led combination may instead be reviewed by CDRH with CBER consult).';
    approximateUSReviewClock = 'BLA standard review ~10-12 months (varies).';
  } else if (params.exempt || (params.usClass === 'I' && params.predicateExists === false && params.novelLowModerateRisk !== true)) {
    usPathway = 'exempt';
    usPathwayRationale =
      'Device appears 510(k)-exempt (typical for many Class I and a subset of Class II product codes under ' +
      '21 CFR 862-892). Manufacturer must still satisfy general controls: establishment registration & device ' +
      'listing, Quality System Regulation (21 CFR 820 / QMSR), labeling, and MDR reporting. Confirm exemption ' +
      'and any limitations (e.g., 21 CFR 8xx.9) for the specific product code.';
    approximateUSReviewClock = 'No premarket review clock (exempt) — registration & listing only.';
  } else if (params.usClass === 'III') {
    if (hudEligible) {
      usPathway = 'HDE';
      usPathwayRationale =
        'Class III device for a rare condition (<8,000 US patients/year) with Humanitarian Use Device (HUD) ' +
        'designation: a Humanitarian Device Exemption (HDE) requires a showing of safety and probable benefit ' +
        '(not a full effectiveness demonstration) per 21 CFR 814 Subpart H.';
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
      approximateUSReviewClock = '510(k) MDUFA goal ~90 FDA-days (Traditional).';
      usAlternatives.push({ pathway: 'PMA', whenApplicable: 'If FDA calls for PMA or no acceptable predicate is found.' });
    } else {
      usPathway = 'IDE-then-PMA';
      usPathwayRationale =
        'Class III device with no predicate: a Premarket Approval (PMA) application is required, supported by ' +
        'valid scientific evidence (typically a pivotal clinical study). If the study is a significant-risk ' +
        'investigation, an approved Investigational Device Exemption (IDE) under 21 CFR 812 is needed first.';
      clinicalEvidenceLikelyRequired = true;
      approximateUSReviewClock = 'PMA MDUFA goal ~180 FDA-days (substantive review); plus IDE/clinical study time.';
      usAlternatives.push({ pathway: 'HDE', whenApplicable: 'If the indication is a rare disease/condition with <8,000 US patients/year.' });
    }
  } else if (params.novelLowModerateRisk === true && params.predicateExists === false) {
    usPathway = 'De Novo';
    usPathwayRationale =
      'Novel device of low-to-moderate risk with NO legally marketed predicate: a De Novo classification request ' +
      'under FD&C Act §513(f)(2) / 21 CFR 860.93 establishes a new Class I or II classification and, once granted, ' +
      'creates a predicate for future 510(k)s. Special controls are defined as part of the grant.';
    clinicalEvidenceLikelyRequired = params.usClass === 'II';
    approximateUSReviewClock = 'De Novo MDUFA goal ~150 FDA-days.';
    usAlternatives.push({ pathway: '510(k)', whenApplicable: 'If a suitable predicate is later identified.' });
    usAlternatives.push({ pathway: 'PMA', whenApplicable: 'If FDA determines the risk profile is high (Class III).' });
  } else if (params.usClass === 'II' || params.predicateExists) {
    usPathway = '510(k)';
    usPathwayRationale =
      'Class II (or predicate-backed) device: a 510(k) premarket notification demonstrating substantial ' +
      'equivalence to a legally marketed predicate is the standard pathway (21 CFR 807 Subpart E). Choose ' +
      'Traditional, Special (design change to own cleared device), or Abbreviated (reliance on recognized ' +
      'standards/guidance) 510(k) format.';
    clinicalEvidenceLikelyRequired = false;
    approximateUSReviewClock = '510(k) MDUFA goal ~90 FDA-days (Traditional/Abbreviated); Special ~30 FDA-days.';
    usAlternatives.push({ pathway: 'De Novo', whenApplicable: 'If no acceptable predicate exists and risk is low/moderate.' });
  } else {
    usPathway = '510(k)';
    usPathwayRationale =
      'Default to 510(k) premarket notification where a predicate is expected; confirm the product code and ' +
      'regulation number to verify class and any exemption.';
    approximateUSReviewClock = '510(k) MDUFA goal ~90 FDA-days.';
  }

  // ── EU conformity route ──────────────────────────────────────────────────
  let euConformityRoute: EUConformityRoute = 'undetermined';
  let euConformityRationale: string;

  if (params.isIVD && params.euIvdrClass) {
    const c = params.euIvdrClass;
    if (c === 'A' && params.sterile !== true && params.measuringFunction !== true) {
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
  outcome: 'continue' | 'SE' | 'NSE';
  citation: Citation;
}

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
  decisionPath.push({
    step: '1',
    question: 'Is the predicate device legally marketed and a valid predicate (not removed for safety/effectiveness reasons)?',
    answer: params.predicateIdentified
      ? params.predicateRecalledForSafety
        ? 'A predicate was identified but it was recalled/withdrawn for design-related safety reasons.'
        : 'Yes — a legally marketed predicate has been identified.'
      : 'No predicate identified.',
    outcome: params.predicateIdentified && !params.predicateRecalledForSafety ? 'continue' : 'NSE',
    citation: { source: 'FDA 510(k) Program Guidance (2014) — Decision 1', note: 'Predicate validity.' },
  });

  if (!params.predicateIdentified || params.predicateRecalledForSafety) {
    determination = 'NSE';
    determinationRationale = !params.predicateIdentified
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
  decisionPath.push({
    step: '2',
    question: 'Does the device have the same intended use as the predicate?',
    answer: params.sameIntendedUse ? 'Yes — same intended use.' : 'No — different intended use.',
    outcome: params.sameIntendedUse ? 'continue' : 'NSE',
    citation: { source: '21 CFR 807.100(b)(1)', note: 'Same intended use requirement.' },
  });

  if (!params.sameIntendedUse) {
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
  decisionPath.push({
    step: '3',
    question: 'Does the device have the same technological characteristics as the predicate?',
    answer: params.sameTechnologicalCharacteristics
      ? 'Yes — same technological characteristics (materials, design, energy source, principle of operation).'
      : 'No — different technological characteristics.',
    outcome: 'continue',
    citation: { source: '21 CFR 807.100(b)(2)', note: 'Technological characteristics comparison.' },
  });

  if (!params.sameTechnologicalCharacteristics) {
    // Step 4 — Do the different characteristics raise different questions of safety/effectiveness?
    const raisesNew = params.differentQuestionsOfSafetyEffectiveness === true;
    decisionPath.push({
      step: '4',
      question: 'Do the different technological characteristics raise DIFFERENT questions of safety and effectiveness?',
      answer: raisesNew
        ? 'Yes — the differences raise new/different questions of safety or effectiveness.'
        : 'No — the differences do not raise different questions of safety or effectiveness.',
      outcome: raisesNew ? 'NSE' : 'continue',
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
  const dataAdequate = params.performanceDataDemonstratesEquivalence !== false;
  decisionPath.push({
    step: params.sameTechnologicalCharacteristics ? '4' : '5',
    question: 'Do the available performance data demonstrate that the device is as safe and effective as the predicate?',
    answer: dataAdequate
      ? 'Yes (or expected once the identified performance testing is completed).'
      : 'No — performance data do not yet demonstrate equivalence; additional testing is required.',
    outcome: dataAdequate ? 'SE' : 'continue',
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

  if (!dataAdequate) {
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
  if (params.sameTechnologicalCharacteristics && !params.hasSoftware && !params.isIVD) {
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
  clinicalDataRequired: boolean;
  clinicalDataRationale: string;
  recommendedStudies: ClinicalStudyRecommendation[];
  usIDERequired: boolean;
  euClinicalEvaluationPlan: string;
  evidenceHierarchy: string[];
  findings: Finding[];
  citations: Citation[];
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

  let clinicalDataRequired = false;
  let clinicalDataRationale = '';

  if (isPMA || high) {
    clinicalDataRequired = true;
    clinicalDataRationale =
      'Clinical data are required. Class III / PMA (or HDE) devices must be supported by valid scientific ' +
      'evidence — typically a pivotal clinical investigation — to provide a reasonable assurance of safety and ' +
      'effectiveness (21 CFR 814.20(b)(6); 21 CFR 860.7).';
  } else if (params.clinicalDataNeededForSE === true || params.novelTechnology === true) {
    clinicalDataRequired = true;
    clinicalDataRationale =
      'Clinical data are required because the device raises questions of safety/effectiveness (novel technology ' +
      'or new indication) that bench/animal data cannot answer. A focused clinical study or robust clinical ' +
      'evaluation is needed to support the marketing claim.';
  } else {
    clinicalDataRequired = false;
    clinicalDataRationale =
      'Clinical data are generally NOT required: non-clinical performance testing (bench, biocompatibility, ' +
      'software V&V, sterility) is expected to be sufficient for this lower-risk pathway. A clinical evaluation ' +
      'summarizing existing evidence may still be needed for the EU.';
  }

  // ── Recommended studies ──────────────────────────────────────────────────
  if (clinicalDataRequired) {
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
  } else {
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
  const usIDERequired =
    clinicalDataRequired &&
    (params.significantRisk === true || high || params.usClass === 'III');

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
  applicable: boolean;
  evidenceStandard: string;
  status: 'addressed' | 'gap' | 'not-applicable';
  citation: Citation;
}

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

  const addRow = (
    gsprRef: string,
    requirement: string,
    applicable: boolean,
    evidenceStandard: string,
    addressed: boolean,
  ): void => {
    rows.push({
      gsprRef,
      requirement,
      applicable,
      evidenceStandard,
      status: !applicable ? 'not-applicable' : addressed ? 'addressed' : 'gap',
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
    claims('IEC 62366') || params.layUse !== true,
  );
  addRow(
    'GSPR 9',
    'Devices without a medical purpose (Annex XVI) and general performance/safety over the lifetime and storage/transport.',
    true,
    'Shelf-life, transport, and stability testing.',
    true,
  );

  // GSPR Chapter II — Design & manufacture.
  addRow(
    isIVD ? 'IVDR GSPR 9 (analytical)' : 'GSPR 10',
    isIVD
      ? 'Analytical and clinical performance characteristics (trueness, precision, sensitivity, specificity, traceability of calibrators).'
      : 'Chemical, physical and biological properties; biocompatibility of patient-contacting materials.',
    isIVD ? true : params.patientContacting === true,
    isIVD ? 'CLSI EP-series; metrological traceability (ISO 17511).' : 'ISO 10993 series biological evaluation.',
    isIVD ? true : claims('ISO 10993') || params.patientContacting !== true,
  );
  addRow(
    'GSPR 11',
    'Infection and microbial contamination; devices supplied sterile shall be manufactured and sterilized by validated methods.',
    params.sterile === true,
    'ISO 11135 / ISO 11137 sterilization validation; ISO 11607 sterile barrier.',
    !params.sterile || claims('ISO 11135') || claims('ISO 11137') || claims('ISO 11607'),
  );
  addRow(
    'GSPR 12',
    'Devices incorporating a medicinal substance: safety, quality, and usefulness of the substance verified by analogy with medicinal-product methods.',
    params.incorporatesMedicinalSubstance === true,
    'Medicinal-substance consultation with a competent authority/EMA.',
    params.incorporatesMedicinalSubstance !== true,
  );
  addRow(
    isIVD ? 'IVDR GSPR 13' : 'GSPR 14',
    'Construction and environmental interaction; minimize risks from interaction with the environment and reasonably foreseeable conditions of use.',
    true,
    'Environmental/EMC testing; transport/storage validation.',
    true,
  );
  addRow(
    isIVD ? 'IVDR GSPR 16' : 'GSPR 15',
    'Devices with a diagnostic or measuring function: accuracy, precision, and stability within stated limits.',
    params.measuringFunction === true || isIVD,
    isIVD ? 'CLSI EP05/EP06/EP09 precision/linearity/method comparison.' : 'Metrological verification of the measuring function.',
    true,
  );
  addRow(
    'GSPR 16',
    'Protection against radiation; devices emitting radiation shall be designed/manufactured to reduce exposure consistent with the intended purpose.',
    params.emitsRadiation === true,
    'IEC 60601-1-3 / IEC 60601-2-xx radiation safety; ALARA.',
    params.emitsRadiation !== true,
  );
  addRow(
    isIVD ? 'IVDR GSPR 16.2 (software)' : 'GSPR 17',
    'Electronic programmable systems and software: developed and manufactured per state of the art (development life cycle, risk management, verification, validation).',
    params.hasSoftware === true,
    'IEC 62304 life cycle; IEC 82304-1 health software; cybersecurity per IEC 81001-5-1.',
    params.hasSoftware !== true || claims('IEC 62304'),
  );
  addRow(
    isIVD ? 'IVDR GSPR 16.4' : 'GSPR 18',
    'Active devices and devices connected to them: electrical safety, basic safety and essential performance.',
    params.active === true,
    'IEC 60601-1 (+ collateral/particular standards) basic safety & essential performance.',
    params.active !== true || claims('IEC 60601'),
  );
  addRow(
    'GSPR 19/20',
    'Devices incorporating energy/substances and active implantable considerations: protection against hazards (energy, heat, fluids).',
    params.implantable === true || params.active === true,
    'Implant-specific testing; ISO 14708 (active implants) where applicable.',
    true,
  );
  addRow(
    isIVD ? 'IVDR GSPR 20' : 'GSPR 23',
    'Information supplied with the device: label and instructions for use (IFU), including symbols and residual-risk information.',
    true,
    'ISO 15223-1 symbols; MDR/IVDR labeling requirements; UDI.',
    true,
  );

  // ── Tally and gaps ───────────────────────────────────────────────────────
  const applicableRows = rows.filter((r: GSPRRow) => r.applicable);
  const gapRows = rows.filter((r: GSPRRow) => r.status === 'gap');
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

  let overallConformity: AssessEssentialPrinciplesResult['overallConformity'];
  if (!params.qmsInPlace || !params.riskManagementFile) {
    overallConformity = 'insufficient-information';
  } else if (gapRows.length > 0) {
    overallConformity = 'gaps-present';
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
  /** Whether the submission will use the FDA eSTAR template. */
  useEStar?: boolean;
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

function commonUSSections(params: PlanDeviceSubmissionParams): SubmissionSection[] {
  const sections: SubmissionSection[] = [];
  sections.push({
    sectionId: 'admin',
    title: 'Administrative / Cover Letter, CDRH Premarket Review Submission Cover Sheet, user fee',
    contents:
      'Cover letter, Form FDA 3514, MDUFA user-fee payment confirmation, applicant/contact info, and (if used) ' +
      'eCopy/eSTAR packaging.',
    citation: { source: '21 CFR 807.87(a)', note: 'Administrative information.' },
  });
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
  if (params.patientContacting) {
    sections.push({
      sectionId: 'biocompat',
      title: 'Biocompatibility',
      contents: 'ISO 10993-1 biological evaluation plan/report scoped to contact type and duration.',
      citation: { source: 'ISO 10993-1:2018', note: 'Biological evaluation.' },
    });
  }
  if (params.sterile) {
    sections.push({
      sectionId: 'sterile',
      title: 'Sterilization, Shelf Life & Packaging',
      contents: 'Sterilization method and validation (ISO 11135/11137), sterile barrier (ISO 11607), shelf-life/aging.',
      citation: { source: 'ISO 11135 / ISO 11137 / ISO 11607', note: 'Sterility and packaging.' },
    });
  }
  if (params.hasSoftware) {
    sections.push({
      sectionId: 'software',
      title: 'Software & Cybersecurity',
      contents:
        'Software documentation per FDA Premarket Software guidance (documentation level), IEC 62304 life-cycle ' +
        'artifacts, V&V, and cybersecurity (threat model, SBOM, IEC 81001-5-1).',
      citation: { source: 'FDA Premarket Software / Cybersecurity Guidance', note: 'Software documentation.' },
    });
  }
  if (params.isIVD) {
    sections.push({
      sectionId: 'ivd-perf',
      title: 'IVD Analytical & Clinical Performance',
      contents:
        'Analytical performance (precision, linearity, LoD/LoQ, interference, method comparison per CLSI EP) and ' +
        'clinical performance (sensitivity/specificity, predictive values) with reference/comparator method.',
      citation: { source: 'CLSI EP-series / ISO 20916', note: 'IVD performance.' },
    });
  }
  return sections;
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

  if (pathway === '510(k)') {
    submissionFormat = params.useEStar
      ? 'FDA eSTAR-formatted 510(k) (Traditional / Special / Abbreviated)'
      : '510(k) premarket notification (Traditional / Special / Abbreviated)';
    usSections.push(...commonUSSections(params));
    usSections.push({
      sectionId: 'se',
      title: 'Substantial Equivalence Discussion',
      contents:
        'Predicate identification, side-by-side comparison (intended use, technological characteristics, ' +
        'performance), and the substantial-equivalence rationale; 510(k) summary or statement (21 CFR 807.92/.93).',
      citation: { source: '21 CFR 807.92', note: '510(k) summary; SE comparison.' },
    });
    if (params.clinicalDataIncluded) {
      usSections.push({
        sectionId: 'clinical',
        title: 'Clinical Performance Data',
        contents: 'Clinical study report(s) supporting SE where bench data are insufficient.',
        citation: { source: '21 CFR 807.87(g)', note: 'Clinical performance data in a 510(k).' },
      });
    }
  } else if (pathway === 'De Novo') {
    submissionFormat = params.useEStar ? 'FDA eSTAR-formatted De Novo request' : 'De Novo classification request';
    usSections.push(...commonUSSections(params));
    usSections.push({
      sectionId: 'denovo-class',
      title: 'Classification Summary & Proposed Special Controls',
      contents:
        'Reason for De Novo (no predicate), risk-to-health analysis, proposed device classification (I or II), ' +
        'and proposed special controls that mitigate the identified risks.',
      citation: { source: '21 CFR 860.93 / FD&C Act §513(f)(2)', note: 'De Novo classification content.' },
    });
    usSections.push({
      sectionId: 'benefit-risk',
      title: 'Benefit-Risk Assessment',
      contents: 'Benefit-risk determination per FDA factors guidance supporting the proposed classification.',
      citation: { source: 'FDA Benefit-Risk Factors Guidance (2019)', note: 'Benefit-risk for De Novo.' },
    });
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
        'Humanitarian Use Device designation (rare condition <8,000 US/yr) and a demonstration of safety and ' +
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
      durationEstimate: '~75-90 days to FDA written feedback / meeting',
      description: 'Align with FDA on predicate/classification, test plan, endpoints, and acceptance criteria.',
    });
  }
  timeline.push({
    phase: 'Testing & Evidence Generation',
    durationEstimate: params.clinicalDataIncluded ? '12-36+ months (incl. clinical study)' : '3-9 months (non-clinical)',
    description: 'Execute bench, biocompatibility, sterility, software, and (if applicable) clinical studies.',
  });
  timeline.push({
    phase: 'Submission Compilation',
    durationEstimate: '1-3 months',
    description: 'Assemble the submission (' + submissionFormat + ') and internal QA review.',
  });
  if (pathway === '510(k)') {
    timeline.push({ phase: 'FDA Review (510(k))', durationEstimate: '~90 FDA-days (MDUFA goal; clock pauses on Additional Information requests)', description: 'Acceptance review, substantive review, SE/NSE decision.' });
  } else if (pathway === 'De Novo') {
    timeline.push({ phase: 'FDA Review (De Novo)', durationEstimate: '~150 FDA-days (MDUFA goal)', description: 'Classification review and grant with special controls.' });
  } else if (pathway === 'PMA' || pathway === 'IDE-then-PMA') {
    timeline.push({ phase: 'FDA Review (PMA)', durationEstimate: '~180 FDA-days substantive review; advisory-panel and preapproval inspection may extend it', description: 'Filing review, substantive review, panel (if convened), inspection, approval.' });
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
  } else if (pathway === '510(k)' && !params.clinicalDataIncluded) {
    qSubStrategy =
      'A Pre-Submission is optional but useful for a non-clinical 510(k) when the predicate choice or a recognized ' +
      'standard interpretation is uncertain. Many Traditional 510(k)s proceed without one.';
  } else {
    qSubStrategy =
      'A Pre-Submission (Q-Sub) is strongly recommended before this pathway to align on predicate/classification, ' +
      'study design, endpoints, sample size, and acceptance criteria, reducing the risk of an Additional Information ' +
      'request or a Not-Substantially-Equivalent/Not-Approvable outcome.';
  }

  findings.push({
    id: 'ESTAR',
    severity: 'recommendation',
    statement:
      'Use the FDA eSTAR template where available (mandatory for 510(k) and De Novo). eSTAR guides the content, ' +
      'reduces administrative deficiencies, and supports the eSubmitter/CCP electronic pathway.',
    citation: { source: 'FDA eSTAR Program', note: 'Electronic submission template.' },
  });
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
