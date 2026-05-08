/**
 * Reviewer Personas — deterministic rule sets, one per regulatory lens.
 *
 * Each persona is pure data + a small set of predicate functions that decide
 * whether the persona is in scope for the given program, and what
 * persona-specific questions to add on top of the existing
 * `reviewer-question-engine`'s persona-blind output.
 *
 * The personas do NOT replace the existing engine — they augment it with
 * regulatory-citation-grade questions phrased in the reviewer's voice.
 *
 * Citations are conservative: only well-established public references
 * (21 CFR, FDA guidance titles, MDR/IVDR articles, ICH, ISO standards).
 */

import type {
  ReviewerPersonaCode,
  ReviewerQuestion,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Inputs the personas reason over
// ─────────────────────────────────────────────────────────────────────────────

/** Program facts a persona may consult. */
export interface PersonaProgramFacts {
  programType: string; // 510K | DE_NOVO | PMA | IND | NDA | BLA | CER | IVDR
  productType: string; // device | ivd | combination | drug | biologic
  deviceClass: string | null; // 'I' | 'II' | 'III'
  primaryAgency: string;
  isSoftware?: boolean;
  isAiMl?: boolean;
  isSterile?: boolean;
  hasPatientContact?: boolean;
  isElectrical?: boolean;
  isIvd?: boolean;
  // Module 4 (nonclinical) gating signals — optional so existing callers
  // remain compatible. The preclinical persona uses these.
  developmentStage?: string; // 'preclinical' | 'ind_enabling' | 'phase_1' | …
  /** Indication is intended for chronic use (≥ 6 months continuous). */
  indicationChronic?: boolean;
  /** Highest reached / proposed clinical phase: 0=preclin, 1..4. */
  clinicalPhase?: number;
  /** Maximum recommended human dose, mg/kg/day, used for NOAEL margin checks. */
  mrhdMgPerKgPerDay?: number | null;
}

/** Defense-packet facts (optional — many personas work without one). */
export interface PersonaPacketFacts {
  defenseReadinessScore: number | null;
  topRisks: string[]; // risk codes
  riskCodesUsed: string[];
  predicateKNumber: string | null;
}

/** Intelligence-engine reports (already produced by the existing pipeline). */
export interface PersonaIntelFacts {
  contradictionCount: number;
  orphanClaimCount: number;
  unsupportedClaimCount: number;
  defensibilityScore: number | null; // 0..100
  missingSections: string[];
  /** Module 4 nonclinical intel, populated only by the preclinical loader. */
  nonclinical?: NonclinicalIntelFacts;
}

/** Nonclinical study summary the preclinical persona reasons over. */
export interface NonclinicalIntelFacts {
  studies: NonclinicalStudyFact[];
  genotoxBattery: {
    ames: boolean;
    inVitroMammalian: boolean;
    inVivo: boolean;
  };
}

export interface NonclinicalStudyFact {
  studyType: string;
  species: string | null;
  durationWeeks: number | null;
  glpCompliant: boolean | null;
  noael: string | null;
  /** Lowest computed NOAEL/MRHD multiple across all bases for this study. */
  safetyMarginMultiple?: number | null;
  /** Treat this study as pivotal (i.e., supporting clinical dosing). */
  pivotal?: boolean;
}

export interface PersonaInputs {
  program: PersonaProgramFacts;
  packet: PersonaPacketFacts | null;
  intel: PersonaIntelFacts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona definitions
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewerPersona {
  code: ReviewerPersonaCode;
  name: string;
  scope: string; // human-readable summary
  /** Returns true if this persona should run for the given program. */
  appliesTo: (p: PersonaProgramFacts) => boolean;
  /** Persona-specific questions on top of the engine's output. */
  rules: (input: PersonaInputs) => ReviewerQuestion[];
}

// Helper to build a question with persona attribution
const q = (
  persona: ReviewerPersonaCode,
  category: ReviewerQuestion['category'],
  severity: ReviewerQuestion['severity'],
  question: string,
  trigger: string,
  citation: string,
  recommendedFix?: string,
  sectionRef?: string
): ReviewerQuestion => ({
  persona,
  category,
  severity,
  question,
  trigger,
  citation,
  recommendedFix,
  sectionRef,
});

// ── FDA 510(k) reviewer ──────────────────────────────────────────────────────
const fda510kReviewer: ReviewerPersona = {
  code: 'fda_510k_reviewer',
  name: 'FDA 510(k) Reviewer',
  scope: 'Substantial-equivalence determination, RTA acceptance, eSTAR completeness',
  appliesTo: p => p.programType === '510K' && p.primaryAgency === 'FDA',
  rules: ({ packet, intel }) => {
    const out: ReviewerQuestion[] = [];
    if (packet) {
      if (packet.topRisks.includes('IU_MISMATCH')) {
        out.push(
          q(
            'fda_510k_reviewer',
            'completeness',
            'critical',
            'The intended use of the subject device differs from the proposed predicate. Does this difference raise a new question of safety or effectiveness?',
            'IU_MISMATCH risk code present',
            '21 CFR 807.92(a)(5); FDA "The 510(k) Program" Guidance (2014), §IV.B',
            'Either narrow the indications, select a closer predicate, or provide additional performance data demonstrating equivalence.'
          )
        );
      }
      if (packet.topRisks.includes('TECH_DIFFERENCE')) {
        out.push(
          q(
            'fda_510k_reviewer',
            'evidence',
            'critical',
            'Technological characteristics differ from the predicate. What additional performance data establishes that the difference does not raise different questions of safety or effectiveness?',
            'TECH_DIFFERENCE risk code present',
            'FDA "The 510(k) Program" Guidance (2014), §IV.C',
            'Provide bench, clinical, or non-clinical performance data sufficient to bridge the technological gap.'
          )
        );
      }
      if (
        packet.defenseReadinessScore !== null &&
        packet.defenseReadinessScore < 60
      ) {
        out.push(
          q(
            'fda_510k_reviewer',
            'completeness',
            'critical',
            `Defense readiness score is ${packet.defenseReadinessScore}/100. Multiple gaps suggest the submission is at risk of an RTA hold.`,
            `defense_readiness_score=${packet.defenseReadinessScore}`,
            'FDA RTA Policy for 510(k)s Guidance (2019)'
          )
        );
      }
    }
    if (intel.unsupportedClaimCount > 0) {
      out.push(
        q(
          'fda_510k_reviewer',
          'evidence',
          'warning',
          `${intel.unsupportedClaimCount} claims have no traceable supporting evidence. The 510(k) summary must be supportable from the submission.`,
          `unsupported_claim_count=${intel.unsupportedClaimCount}`,
          '21 CFR 807.92(a)(3)',
          'Link each performance claim to a specific test report, study, or labeling element.'
        )
      );
    }
    return out;
  },
};

// ── FDA PMA reviewer ─────────────────────────────────────────────────────────
const fdaPmaReviewer: ReviewerPersona = {
  code: 'fda_pma_reviewer',
  name: 'FDA PMA Reviewer',
  scope: 'Reasonable assurance of safety and effectiveness; benefit-risk',
  appliesTo: p =>
    (p.programType === 'PMA' || p.deviceClass === 'III') && p.primaryAgency === 'FDA',
  rules: ({ intel }) => {
    const out: ReviewerQuestion[] = [];
    if (intel.contradictionCount > 0) {
      out.push(
        q(
          'fda_pma_reviewer',
          'consistency',
          'critical',
          `${intel.contradictionCount} cross-section contradictions detected. PMA review requires internally consistent safety and effectiveness narratives.`,
          `contradiction_count=${intel.contradictionCount}`,
          '21 CFR 814.20(b); FDA Guidance "Acceptance and Filing Reviews for PMAs" (2019)',
          'Resolve each contradiction with a single source-of-truth narrative before filing.'
        )
      );
    }
    if (intel.defensibilityScore !== null && intel.defensibilityScore < 70) {
      out.push(
        q(
          'fda_pma_reviewer',
          'completeness',
          'critical',
          `Defensibility score is ${intel.defensibilityScore}/100. Has a benefit-risk determination been articulated with explicit weighing of magnitude, probability, and duration of benefits and risks?`,
          `defensibility_score=${intel.defensibilityScore}`,
          'FDA Guidance "Factors to Consider Regarding Benefit-Risk in Medical Device PMAs and De Novo Classifications" (2019)'
        )
      );
    }
    return out;
  },
};

// ── FDA software reviewer ────────────────────────────────────────────────────
const fdaSoftwareReviewer: ReviewerPersona = {
  code: 'fda_software_reviewer',
  name: 'FDA Software Reviewer',
  scope: 'IEC 62304 lifecycle, software level of concern, validation',
  appliesTo: p => p.isSoftware === true || p.isAiMl === true,
  rules: ({ packet }) => {
    const out: ReviewerQuestion[] = [];
    out.push(
      q(
        'fda_software_reviewer',
        'methodology',
        'warning',
        'What is the documented Software Level of Concern (basic / moderate / major), and does the submitted documentation set match the level required by the FDA guidance?',
        'software flagged for program',
        'FDA Guidance "Content of Premarket Submissions for Device Software Functions" (2023)'
      )
    );
    if (packet?.topRisks.includes('SOFTWARE_PRESENT_NEW')) {
      out.push(
        q(
          'fda_software_reviewer',
          'methodology',
          'critical',
          'Software functions present in the subject device are not present in the predicate. Has a complete IEC 62304 software lifecycle file been submitted, including SOUP analysis?',
          'SOFTWARE_PRESENT_NEW risk code',
          'IEC 62304:2006/AMD 1:2015; FDA Software Functions Guidance (2023)'
        )
      );
    }
    if (packet?.topRisks.includes('ML_ADAPTIVITY')) {
      out.push(
        q(
          'fda_software_reviewer',
          'methodology',
          'critical',
          'AI/ML adaptivity is asserted. Is a Predetermined Change Control Plan included with description of modifications, modification protocol, and impact assessment?',
          'ML_ADAPTIVITY risk code',
          'FDA Guidance "Marketing Submission Recommendations for a PCCP for AI/ML-Enabled Device Software Functions" (2024)'
        )
      );
    }
    return out;
  },
};

// ── FDA cybersecurity reviewer ───────────────────────────────────────────────
const fdaCyberReviewer: ReviewerPersona = {
  code: 'fda_cyber_reviewer',
  name: 'FDA Cybersecurity Reviewer',
  scope: 'Cyber risk, SBOM, threat model, vulnerability handling',
  appliesTo: p => p.isSoftware === true || p.isAiMl === true,
  rules: ({ packet }) => {
    const out: ReviewerQuestion[] = [];
    out.push(
      q(
        'fda_cyber_reviewer',
        'methodology',
        'critical',
        'Has a Software Bill of Materials (SBOM) been included, and does it identify each component with a known-vulnerability-monitoring approach for post-market?',
        'cybersecurity scope active',
        'FDA Guidance "Cybersecurity in Medical Devices: Quality System Considerations and Content of Premarket Submissions" (2023)',
        'Provide an SPDX or CycloneDX SBOM plus a vulnerability-handling plan referencing the QMS.'
      )
    );
    if (packet?.topRisks.includes('CYBERSECURITY_SURFACE_INCREASED')) {
      out.push(
        q(
          'fda_cyber_reviewer',
          'methodology',
          'critical',
          'The cybersecurity attack surface is increased relative to the predicate. Is a threat model included, and have updated controls been validated?',
          'CYBERSECURITY_SURFACE_INCREASED risk code',
          'AAMI TIR57:2016; FDA Cybersecurity Premarket Guidance (2023)'
        )
      );
    }
    return out;
  },
};

// ── EU Notified Body clinical evaluator ──────────────────────────────────────
const euNotifiedBodyClinical: ReviewerPersona = {
  code: 'eu_notified_body_clinical',
  name: 'EU Notified Body — Clinical Evaluator',
  scope: 'MDR Article 61 clinical evaluation, equivalence, PMCF linkage',
  appliesTo: p =>
    p.primaryAgency === 'EMA' || p.primaryAgency === 'EU' || p.programType === 'CER',
  rules: ({ intel }) => {
    const out: ReviewerQuestion[] = [];
    if (intel.unsupportedClaimCount > 0) {
      out.push(
        q(
          'eu_notified_body_clinical',
          'evidence',
          'critical',
          `${intel.unsupportedClaimCount} clinical claims lack documented appraisal. Each claim must be traceable to identified, appraised, and analyzed clinical evidence.`,
          `unsupported_claim_count=${intel.unsupportedClaimCount}`,
          'EU MDR 2017/745 Article 61(3); MEDDEV 2.7/1 Rev 4',
          'Append the literature search protocol and appraisal table demonstrating coverage.'
        )
      );
    }
    out.push(
      q(
        'eu_notified_body_clinical',
        'completeness',
        'warning',
        'Does the Clinical Evaluation Report explicitly link each conclusion to a PMCF activity in the PMCF Plan?',
        'CER lifecycle linkage',
        'EU MDR 2017/745 Annex XIV Part B'
      )
    );
    return out;
  },
};

// ── IVDR performance evaluator ───────────────────────────────────────────────
const ivdrPerformanceEvaluator: ReviewerPersona = {
  code: 'ivdr_performance_evaluator',
  name: 'IVDR Performance Evaluator',
  scope: 'Analytical, clinical, and scientific validity for IVDs',
  appliesTo: p => p.isIvd === true || p.productType === 'ivd',
  rules: () => [
    q(
      'ivdr_performance_evaluator',
      'evidence',
      'critical',
      'Have all three performance pillars (scientific validity, analytical performance, clinical performance) been documented per IVDR Annex XIII?',
      'IVD performance evaluation scope',
      'EU IVDR 2017/746 Annex XIII §1'
    ),
    q(
      'ivdr_performance_evaluator',
      'methodology',
      'warning',
      'For each quantitative claim, is LoB/LoD/LoQ, precision, linearity, and interference data documented per CLSI EP guidelines?',
      'IVD quantitative claim scope',
      'CLSI EP05-A3, EP07-A3, EP09-A3, EP17-A2'
    ),
  ],
};

// ── Biostatistical reviewer ──────────────────────────────────────────────────
const biostatReviewer: ReviewerPersona = {
  code: 'biostat_reviewer',
  name: 'Biostatistical Reviewer',
  scope: 'Sample size, endpoints, multiplicity, missing data',
  appliesTo: p => p.programType === 'PMA' || p.programType === 'IND' || p.deviceClass === 'III',
  rules: ({ intel }) => {
    const out: ReviewerQuestion[] = [];
    out.push(
      q(
        'biostat_reviewer',
        'methodology',
        'warning',
        'For each primary effectiveness endpoint, is the prespecified analysis population, hypothesis, multiplicity adjustment, and missing-data handling described in the SAP?',
        'biostatistical scope active',
        'ICH E9(R1); FDA Guidance "Adjusting for Covariates in Randomized Clinical Trials for Drugs and Biological Products" (2023)'
      )
    );
    if (intel.contradictionCount > 0) {
      out.push(
        q(
          'biostat_reviewer',
          'consistency',
          'critical',
          'Numeric inconsistencies were detected between sections. Are differences attributable to ITT vs PP populations, censoring rules, or analysis-method differences? Document the population for each reported number.',
          `contradiction_count=${intel.contradictionCount}`,
          'ICH E9(R1) §A.5'
        )
      );
    }
    return out;
  },
};

// ── Labeling reviewer ────────────────────────────────────────────────────────
const labelingReviewer: ReviewerPersona = {
  code: 'labeling_reviewer',
  name: 'Labeling Reviewer',
  scope: 'IFU adequacy, contraindications, warnings, symbols',
  appliesTo: () => true,
  rules: ({ packet }) => {
    const out: ReviewerQuestion[] = [];
    if (packet?.topRisks.includes('LABELING_IFU_GAP')) {
      out.push(
        q(
          'labeling_reviewer',
          'completeness',
          'critical',
          'A labeling/IFU gap is flagged. Does the IFU clearly and accurately reflect the indications, contraindications, warnings, and precautions supported by the submitted evidence?',
          'LABELING_IFU_GAP risk code',
          '21 CFR 801; ISO 15223-1:2021; EU MDR Annex I §23'
        )
      );
    }
    out.push(
      q(
        'labeling_reviewer',
        'consistency',
        'warning',
        'Is every claim in the labeling traceable to a specific evidence object in the submission, with no unsupported or implied performance claims?',
        'labeling-evidence traceability check',
        '21 CFR 807.87(e); 21 CFR 801.5'
      )
    );
    return out;
  },
};

// ── Quality systems reviewer ─────────────────────────────────────────────────
const qualitySystemsReviewer: ReviewerPersona = {
  code: 'quality_systems_reviewer',
  name: 'Quality Systems Reviewer',
  scope: 'QMS/QSR conformance, design controls, CAPA, supplier controls',
  appliesTo: () => true,
  rules: () => [
    q(
      'quality_systems_reviewer',
      'methodology',
      'warning',
      'Is the design history file (DHF) traceability matrix complete, linking user needs → design inputs → design outputs → verification → validation?',
      'QMS scope active',
      '21 CFR 820.30; ISO 13485:2016 §7.3'
    ),
    q(
      'quality_systems_reviewer',
      'methodology',
      'warning',
      'Are CAPA records, supplier audits, and complaint-handling logs current and aligned with the post-market surveillance plan?',
      'QMS scope active',
      '21 CFR 820.50, 820.100, 820.198; ISO 13485:2016 §8.2 / §8.5'
    ),
  ],
};

// ── Preclinical toxicologist (Module 4 / ICH M3(R2)) ─────────────────────────
// Surfaces ICH M3(R2) / S2(R1) / S1B nonclinical deficiencies. Active for any
// drug/biologic submission and any program in preclinical or IND-enabling
// development. When `intel.nonclinical` is absent the persona emits a single
// info-level stub so the reviewer-simulator output flags that nonclinical data
// were not loaded rather than silently skipping the lens.
const preclinicalToxicologist: ReviewerPersona = {
  code: 'preclinical_toxicologist',
  name: 'Preclinical Toxicologist (ICH M3(R2))',
  scope: 'Nonclinical safety package adequacy: species coverage, GLP, NOAEL margins, genotox, DART, carcinogenicity',
  appliesTo: p => {
    const drugLike =
      p.programType === 'IND' ||
      p.programType === 'NDA' ||
      p.programType === 'BLA' ||
      p.productType === 'drug' ||
      p.productType === 'biologic' ||
      p.productType === 'combination';
    const stageLike =
      p.developmentStage === 'preclinical' ||
      p.developmentStage === 'ind_enabling' ||
      p.developmentStage === 'phase_1' ||
      p.developmentStage === 'phase_2' ||
      p.developmentStage === 'phase_3';
    return drugLike || stageLike;
  },
  rules: ({ program, intel }) => {
    const out: ReviewerQuestion[] = [];
    const nc = intel.nonclinical;
    if (!nc) {
      out.push(
        q(
          'preclinical_toxicologist',
          'completeness',
          'info',
          'Nonclinical study data has not been loaded for this program. The preclinical reviewer cannot assess Module 4 adequacy until ctd_nonclinical_studies is populated for the program.',
          'nonclinical_intel_missing',
          'ICH M3(R2)',
          'Ingest the preclinical study reports via /api/preclinical/ingest, or attach nonclinical facts to the simulator request.'
        )
      );
      return out;
    }

    const pivotalStudies = nc.studies.filter(s => s.pivotal !== false);

    // Rule: NC_GLP_PIVOTAL_MISSING ─ pivotal tox study not GLP-compliant.
    const nonGlpPivotal = pivotalStudies.filter(s => s.glpCompliant !== true);
    if (nonGlpPivotal.length > 0) {
      out.push(
        q(
          'preclinical_toxicologist',
          'methodology',
          'critical',
          `${nonGlpPivotal.length} pivotal toxicology study/studies do not declare GLP compliance. Pivotal data supporting clinical dosing must be conducted under 21 CFR Part 58.`,
          'NC_GLP_PIVOTAL_MISSING',
          '21 CFR Part 58; FDA Good Laboratory Practice Regulations',
          'Bridge to a GLP-compliant repeat-dose study at the same dose levels and species, or restrict claims to non-pivotal use.'
        )
      );
    }

    // Rule: NC_SPECIES_COVERAGE ─ chronic repeat-dose missing rodent + non-rodent.
    const RODENT = new Set(['rat', 'mouse', 'rodent']);
    const longRepeat = pivotalStudies.filter(
      s => s.studyType === 'repeat_dose_tox' && (s.durationWeeks ?? 0) >= 13
    );
    if (longRepeat.length > 0) {
      const speciesSet = new Set(
        longRepeat.map(s => (s.species ?? '').toLowerCase()).filter(Boolean)
      );
      const hasRodent = [...speciesSet].some(s => RODENT.has(s));
      const hasNonRodent = [...speciesSet].some(s => s.length > 0 && !RODENT.has(s));
      if (!(hasRodent && hasNonRodent)) {
        out.push(
          q(
            'preclinical_toxicologist',
            'completeness',
            'critical',
            'Repeat-dose toxicology of ≥13 weeks does not include both a rodent and a non-rodent species. ICH M3(R2) §5 expects two-species coverage to support the proposed clinical duration.',
            'NC_SPECIES_COVERAGE',
            'ICH M3(R2) §5',
            'Commission a GLP study in the missing species (rodent or pharmacologically relevant non-rodent).'
          )
        );
      }
    }

    // Rule: NC_NOAEL_MARGIN_INSUFFICIENT ─ smallest safety margin below threshold.
    const margins = pivotalStudies
      .map(s => s.safetyMarginMultiple)
      .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
    if (margins.length > 0) {
      const lowest = Math.min(...margins);
      if (lowest < 2) {
        out.push(
          q(
            'preclinical_toxicologist',
            'safety',
            'critical',
            `Lowest NOAEL-to-MRHD safety margin is ${lowest.toFixed(2)}×. A margin below 2× is unlikely to support the proposed clinical starting dose without additional justification.`,
            'NC_NOAEL_MARGIN_INSUFFICIENT',
            'FDA Guidance "Estimating the Maximum Safe Starting Dose in Initial Clinical Trials for Therapeutics in Adult Healthy Volunteers" (2005)',
            'Lower the proposed starting dose, or provide PK exposure justification (AUC/Cmax) showing equivalent safety at the planned dose.'
          )
        );
      } else if (lowest < 10) {
        out.push(
          q(
            'preclinical_toxicologist',
            'safety',
            'warning',
            `Lowest NOAEL-to-MRHD safety margin is ${lowest.toFixed(2)}×. Margins under 10× typically need exposure-based justification.`,
            'NC_NOAEL_MARGIN_INSUFFICIENT',
            'FDA Guidance "Estimating the Maximum Safe Starting Dose" (2005)',
            'Provide AUC/Cmax-based exposure margin with rationale for the chosen species.'
          )
        );
      }
    }

    // Rule: NC_GENOTOX_BATTERY_INCOMPLETE ─ ICH S2(R1) three-component battery.
    const battery = nc.genotoxBattery;
    const missing: string[] = [];
    if (!battery.ames) missing.push('Ames');
    if (!battery.inVitroMammalian) missing.push('in vitro mammalian');
    if (!battery.inVivo) missing.push('in vivo');
    if (missing.length > 0) {
      out.push(
        q(
          'preclinical_toxicologist',
          'completeness',
          'critical',
          `Genotoxicity battery is incomplete: missing ${missing.join(', ')}. ICH S2(R1) requires all three components.`,
          'NC_GENOTOX_BATTERY_INCOMPLETE',
          'ICH S2(R1)',
          'Schedule the missing genotoxicity assay(s) at a GLP facility before filing.'
        )
      );
    }

    // Rule: NC_REPRO_TOX_STAGE_MISMATCH ─ DART required by clinical phase.
    const phase = program.clinicalPhase ?? 0;
    if (phase >= 2) {
      const hasDart = nc.studies.some(s => s.studyType === 'dart');
      if (!hasDart) {
        out.push(
          q(
            'preclinical_toxicologist',
            'completeness',
            'warning',
            `Phase ${phase} clinical program does not include reproductive/developmental toxicology (DART). ICH M3(R2) §11 stages DART against the clinical phase and population.`,
            'NC_REPRO_TOX_STAGE_MISMATCH',
            'ICH M3(R2) §11',
            'Run staged DART package (fertility, EFD, PPND) appropriate to the proposed clinical phase.'
          )
        );
      }
    }

    // Rule: NC_CARC_REQUIRED_MISSING ─ chronic indication, no carcinogenicity.
    if (program.indicationChronic === true) {
      const hasCarc = nc.studies.some(s => s.studyType === 'carc');
      if (!hasCarc) {
        out.push(
          q(
            'preclinical_toxicologist',
            'completeness',
            'warning',
            'Indication is chronic (≥6 months continuous use) but no carcinogenicity study is on file. ICH S1B requires carc assessment or a documented waiver rationale.',
            'NC_CARC_REQUIRED_MISSING',
            'ICH S1B',
            'Initiate 2-year carc study or rasH2 6-month alternative; otherwise file a scientific waiver request.'
          )
        );
      }
    }

    return out;
  },
};

// ── GLP auditor ──────────────────────────────────────────────────────────────
// Lightweight companion to the toxicologist persona: focuses on facility +
// attestation gaps that drive the NC_TK_DATA_MISSING / GLP-pivotal triggers.
const glpAuditor: ReviewerPersona = {
  code: 'glp_auditor',
  name: 'GLP Auditor (21 CFR 58)',
  scope: 'GLP attestation, testing facility identification, toxicokinetic coverage',
  appliesTo: p =>
    p.programType === 'IND' ||
    p.programType === 'NDA' ||
    p.programType === 'BLA' ||
    p.productType === 'drug' ||
    p.productType === 'biologic' ||
    p.productType === 'combination',
  rules: ({ intel }) => {
    const out: ReviewerQuestion[] = [];
    const nc = intel.nonclinical;
    if (!nc) {
      out.push(
        q(
          'glp_auditor',
          'completeness',
          'info',
          'No nonclinical data loaded; GLP audit cannot run.',
          'nonclinical_intel_missing',
          '21 CFR Part 58'
        )
      );
      return out;
    }

    // Rule: NC_TK_DATA_MISSING ─ pivotal repeat-dose without TK coverage.
    const repeatDose = nc.studies.filter(s => s.studyType === 'repeat_dose_tox');
    const tkStudies = nc.studies.filter(s => s.studyType === 'tk');
    if (repeatDose.length > 0 && tkStudies.length === 0) {
      out.push(
        q(
          'glp_auditor',
          'completeness',
          'critical',
          'Pivotal repeat-dose toxicology is on file but no toxicokinetic data has been provided. Without TK exposure data the safety margin cannot be evaluated on an exposure basis.',
          'NC_TK_DATA_MISSING',
          'ICH S3A; 21 CFR Part 58',
          'Submit the TK report from satellite groups, or include AUC/Cmax data from main-study sampling.'
        )
      );
    }

    // Pivotal studies missing GLP attestation (as a standalone audit signal).
    const nonGlp = nc.studies.filter(s => s.pivotal !== false && s.glpCompliant !== true);
    if (nonGlp.length > 0) {
      out.push(
        q(
          'glp_auditor',
          'methodology',
          'warning',
          `${nonGlp.length} pivotal study/studies lack an explicit GLP attestation. Confirm 21 CFR Part 58 compliance for each pivotal report.`,
          'pivotal_glp_attestation_missing',
          '21 CFR 58.185'
        )
      );
    }
    return out;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const REVIEWER_PERSONAS: Record<ReviewerPersonaCode, ReviewerPersona> = {
  fda_510k_reviewer: fda510kReviewer,
  fda_pma_reviewer: fdaPmaReviewer,
  fda_software_reviewer: fdaSoftwareReviewer,
  fda_cyber_reviewer: fdaCyberReviewer,
  eu_notified_body_clinical: euNotifiedBodyClinical,
  ivdr_performance_evaluator: ivdrPerformanceEvaluator,
  biostat_reviewer: biostatReviewer,
  labeling_reviewer: labelingReviewer,
  quality_systems_reviewer: qualitySystemsReviewer,
  preclinical_toxicologist: preclinicalToxicologist,
  glp_auditor: glpAuditor,
};

export const ALL_PERSONA_CODES: ReviewerPersonaCode[] = Object.keys(
  REVIEWER_PERSONAS
) as ReviewerPersonaCode[];
