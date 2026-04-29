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
};

export const ALL_PERSONA_CODES: ReviewerPersonaCode[] = Object.keys(
  REVIEWER_PERSONAS
) as ReviewerPersonaCode[];
