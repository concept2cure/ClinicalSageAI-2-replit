/**
 * AnA RI — Regulatory Document Template Registry
 *
 * Maps natural-language requests → specific regulatory document types with
 * full structured templates (required/optional sections, ICH/FDA codes, word
 * count targets, and authoritative source references).
 *
 * Detection is phrase-level, ABOVE the existing intent-lens system. When a
 * specific document type is detected, its template structure is injected into
 * the system prompt so AnA outputs properly formatted, submission-ready output
 * rather than free-form prose.
 *
 * @module server/services/ana-ri/document-templates
 */

// ─────────────────────────────────────────────────────────────────────────────
// Document Template Registry Types
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateSection {
  heading: string;
  /** ICH/FDA section code if applicable (e.g. "2.5.3") */
  code?: string;
  /** Prose guidance for what this section must cover */
  guidance: string;
  /** Approximate word count range for this section */
  targetWords?: [number, number];
  required: boolean;
}

export interface RegulatoryDocumentTemplate {
  id: string;
  /** Human-readable name shown in the UI chip */
  displayName: string;
  /** Short label for the "Drafting: X" chip */
  chipLabel: string;
  /** ICH/FDA/MDR primary reference code */
  primaryCode?: string;
  /** Applicable regulatory authority */
  authority: 'FDA' | 'EMA' | 'PMDA' | 'ICH' | 'ISO' | 'Multi';
  /** Submission family this template belongs to */
  submissionFamily: string;
  /** Regex patterns for phrase-level detection (lower-cased against message) */
  detectionPatterns: RegExp[];
  /** Minimum-confidence trigger (0–1). Detection fires only when score >= this. */
  minConfidence: number;
  /** Ordered sections — injected into system prompt as a structured outline */
  sections: TemplateSection[];
  /** Top-level drafting instructions for the system prompt */
  draftingInstructions: string;
  /** Key regulatory references the AI should surface inline */
  regulatoryReferences?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Registry
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_TEMPLATES: Record<string, RegulatoryDocumentTemplate> = {

  // ── CTD Module 2 ───────────────────────────────────────────────────────────

  ctd_2_2_introduction: {
    id: 'ctd_2_2_introduction',
    displayName: 'CTD Introduction (2.2)',
    chipLabel: 'CTD 2.2',
    primaryCode: '2.2',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\bctd\s+(?:section\s+)?2\.2\b/i,
      /\bintroduction\s+to\s+(?:the\s+)?ctd\b/i,
      /\bmodule\s+2\.2\b/i,
      /\bdraft\s+(?:a\s+)?2\.2\s+introduction\b/i,
    ],
    minConfidence: 0.6,
    draftingInstructions: 'Draft a concise ICH CTD Section 2.2 Introduction. Keep it to 1–2 pages. State the pharmacological class, proposed indication, route of administration, and regulatory pathway. Do NOT copy from other sections — this is a standalone overview.',
    regulatoryReferences: ['ICH M4E(R2)', 'ICH M4Q(R1)', 'FDA NDA/BLA Format and Content Guidance'],
    sections: [
      { heading: 'Pharmacological Class and Mode of Action', required: true, targetWords: [100, 200], guidance: 'State the pharmacological class, INN/USAN, mechanism of action, and receptor/target affinity.' },
      { heading: 'Proposed Indication and Route of Administration', required: true, targetWords: [80, 150], guidance: 'State the proposed indication(s), dosage form(s), and route(s) of administration.' },
      { heading: 'Regulatory Pathway', required: true, targetWords: [60, 120], guidance: 'Identify the regulatory pathway (NDA 505(b)(1), 505(b)(2), BLA 351(a), 351(k), MAA, etc.) and submission type (original, supplement, etc.).' },
      { heading: 'Development Program Overview', required: false, targetWords: [100, 200], guidance: 'Brief summary of the nonclinical and clinical development program supporting this application.' },
    ],
  },

  ctd_2_3_qos: {
    id: 'ctd_2_3_qos',
    displayName: 'Quality Overall Summary (2.3)',
    chipLabel: 'QOS 2.3',
    primaryCode: '2.3',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\b(?:qos|quality\s+overall\s+summary)\b/i,
      /\bctd\s+(?:section\s+)?2\.3\b/i,
      /\bmodule\s+2\.3\b/i,
      /\bdraft\s+(?:a\s+)?quality\s+overall\s+summary\b/i,
    ],
    minConfidence: 0.6,
    draftingInstructions: 'Draft an ICH CTD Quality Overall Summary (Section 2.3). This must be self-contained, summarizing all Module 3 CMC data. Cover drug substance characterization, manufacturing, controls, and stability; then drug product formulation, manufacturing process, controls, container closure, and stability. Use paragraph format with tables where ICH M4Q requires them.',
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q1A–Q14 series', 'FDA CMC Guidance Documents'],
    sections: [
      { heading: '2.3.S Drug Substance', required: true, code: '2.3.S', targetWords: [400, 800], guidance: 'Summarize drug substance characterization (structure, physicochemical properties, biological activity), manufacture (process, controls, validation), specifications, reference standards, container closure, and stability.' },
      { heading: '2.3.S.1 General Information', required: true, code: '2.3.S.1', targetWords: [150, 300], guidance: 'INN/USAN, chemical structure, molecular formula and weight, stereochemistry, physicochemical properties.' },
      { heading: '2.3.S.2 Manufacture', required: true, code: '2.3.S.2', targetWords: [200, 400], guidance: 'Manufacturer(s), manufacturing process overview, critical steps and controls, process controls, and reprocessing steps.' },
      { heading: '2.3.S.3 Characterization', required: true, code: '2.3.S.3', targetWords: [150, 300], guidance: 'Structure elucidation, physicochemical and biological characterization, impurity profile.' },
      { heading: '2.3.S.4 Control of Drug Substance', required: true, code: '2.3.S.4', targetWords: [200, 400], guidance: 'Specification (acceptance criteria), analytical procedures, validation, batch analyses, justification of specification.' },
      { heading: '2.3.S.7 Stability', required: true, code: '2.3.S.7', targetWords: [200, 400], guidance: 'Stability summary and conclusions, post-approval stability protocol, storage conditions, shelf life.' },
      { heading: '2.3.P Drug Product', required: true, code: '2.3.P', targetWords: [400, 800], guidance: 'Summarize drug product description, formulation development, manufacture, specifications, container closure, and stability.' },
      { heading: '2.3.P.1 Description and Composition', required: true, code: '2.3.P.1', targetWords: [100, 200], guidance: 'Dosage form, composition, container closure description.' },
      { heading: '2.3.P.2 Pharmaceutical Development', required: true, code: '2.3.P.2', targetWords: [200, 400], guidance: 'Formulation development rationale, excipient selection, manufacturing process development, microbiological attributes.' },
      { heading: '2.3.P.3 Manufacture', required: true, code: '2.3.P.3', targetWords: [150, 300], guidance: 'Manufacturing process and controls, critical steps, process validation.' },
      { heading: '2.3.P.5 Control of Drug Product', required: true, code: '2.3.P.5', targetWords: [200, 400], guidance: 'Specifications, analytical procedures, validation, batch analyses, characterization of impurities.' },
      { heading: '2.3.P.8 Stability', required: true, code: '2.3.P.8', targetWords: [200, 400], guidance: 'Stability summary, post-approval protocol, storage conditions, shelf life.' },
    ],
  },

  ctd_2_4_nonclinical_overview: {
    id: 'ctd_2_4_nonclinical_overview',
    displayName: 'Nonclinical Overview (2.4)',
    chipLabel: 'Nonclinical Overview',
    primaryCode: '2.4',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\bnonclinical\s+overview\b/i,
      /\bctd\s+(?:section\s+)?2\.4\b/i,
      /\bmodule\s+2\.4\b/i,
      /\bdraft\s+(?:a\s+)?2\.4\b/i,
      /\bsection\s+2\.4\s+(?:nonclinical|overview)\b/i,
    ],
    minConfidence: 0.6,
    draftingInstructions: 'Draft an ICH CTD Nonclinical Overview (Section 2.4). This is an integrated expert narrative — NOT a summary of individual studies. Synthesize pharmacology, PK/ADME, and toxicology findings to support the clinical program. Address species relevance, safety margins, and how nonclinical data support the proposed clinical indication and dosing.',
    regulatoryReferences: ['ICH M4S(R2)', 'ICH S7A/S7B (safety pharmacology)', 'ICH S9 (oncology)', 'FDA Pharmacology/Toxicology Guidance'],
    sections: [
      { heading: 'Overview of Nonclinical Testing Strategy', required: true, targetWords: [200, 400], guidance: 'Rationale for the nonclinical program, species selection, GLP status, and relationship to the clinical program.' },
      { heading: 'Pharmacology', required: true, targetWords: [300, 600], guidance: 'Primary pharmacodynamics (mechanism, potency, selectivity), secondary pharmacodynamics (off-target effects), and safety pharmacology (CNS, CV, respiratory — ICH S7A/S7B).' },
      { heading: 'Pharmacokinetics', required: true, targetWords: [300, 600], guidance: 'ADME characterization across species. Highlight metabolite relevance, plasma protein binding, tissue distribution, and exposure multiples relative to clinical dose.' },
      { heading: 'Toxicology', required: true, targetWords: [400, 800], guidance: 'Repeat-dose toxicity (species, duration, NOAEL, major findings), genotoxicity package, reproductive/developmental toxicity (ICH S5), carcinogenicity (if applicable), special studies (photosafety, immunotoxicity). Calculate safety margins at human MRHD.' },
      { heading: 'Integrated Summary and Implications for Clinical Use', required: true, targetWords: [200, 400], guidance: 'Synthesize nonclinical findings as they relate to the clinical starting dose, dose escalation, clinical monitoring, and labeling. Identify residual nonclinical uncertainties and how they will be addressed.' },
    ],
  },

  ctd_2_5_clinical_overview: {
    id: 'ctd_2_5_clinical_overview',
    displayName: 'Clinical Overview (2.5)',
    chipLabel: 'Clinical Overview',
    primaryCode: '2.5',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\bclinical\s+overview\b/i,
      /\bctd\s+(?:section\s+)?2\.5\b/i,
      /\bmodule\s+2\.5\b/i,
      /\bdraft\s+(?:a\s+)?2\.5\b/i,
      /\bsection\s+2\.5\b/i,
    ],
    minConfidence: 0.55,
    draftingInstructions: 'Draft an ICH CTD Clinical Overview (Section 2.5). This is the most critical Module 2 document — reviewers read it first. It must be a stand-alone integrated benefit-risk narrative. Cover the development program rationale, clinical pharmacology, efficacy, safety, benefit-risk assessment, and post-market plans. Write at expert level. Avoid repeating what the summaries say — synthesize and interpret.',
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E3 (CSR format)', 'ICH E8 (GCP design)', 'FDA Benefit-Risk Framework Guidance'],
    sections: [
      { heading: '2.5.1 Product Development Rationale', required: true, code: '2.5.1', targetWords: [400, 700], guidance: 'Disease background, unmet medical need, mechanism rationale, and overview of the clinical program design.' },
      { heading: '2.5.2 Overview of Biopharmaceutics', required: true, code: '2.5.2', targetWords: [200, 400], guidance: 'BA/BE studies, dissolution, food effect, and formulation bridging logic linking clinical to commercial formulation.' },
      { heading: '2.5.3 Overview of Clinical Pharmacology', required: true, code: '2.5.3', targetWords: [300, 600], guidance: 'PK characterization (dose-proportionality, accumulation, variability), PD, DDI, special populations, PK/PD relationships supporting the proposed dose and label.' },
      { heading: '2.5.4 Overview of Efficacy', required: true, code: '2.5.4', targetWords: [600, 1200], guidance: 'Pivotal trial results with confidence intervals and p-values, primary and key secondary endpoints, subgroup consistency, clinical meaningfulness, and comparison to active comparators if applicable.' },
      { heading: '2.5.5 Overview of Safety', required: true, code: '2.5.5', targetWords: [600, 1200], guidance: 'Overall exposure dataset, adverse events by severity/relatedness, deaths, serious AEs, discontinuations, lab abnormalities, vital signs, special population safety, and identified safety signals.' },
      { heading: '2.5.6 Summary of Benefits and Risks', required: true, code: '2.5.6', targetWords: [400, 800], guidance: 'Integrated benefit-risk assessment. Explicitly weigh efficacy benefits against identified risks for the proposed indication and population. Address uncertainties and how they are managed.' },
      { heading: '2.5.7 Literature References', required: false, code: '2.5.7', targetWords: [50, 100], guidance: 'Key published literature cited in this overview.' },
    ],
  },

  ctd_2_7_4_efficacy_summary: {
    id: 'ctd_2_7_4_efficacy_summary',
    displayName: 'Clinical Efficacy Summary (2.7.4)',
    chipLabel: 'Clinical Efficacy Summary',
    primaryCode: '2.7.4',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\b(?:clinical\s+)?efficacy\s+summary\b/i,
      /\bsection\s+2\.7\.4\b/i,
      /\bctd\s+2\.7\.4\b/i,
      /\bmodule\s+2\.7\.4\b/i,
      /\bsummary\s+of\s+(?:clinical\s+)?efficacy\b/i,
    ],
    minConfidence: 0.6,
    draftingInstructions: 'Draft an ICH CTD Section 2.7.4 Summary of Clinical Efficacy. Cover all studies that contribute to the efficacy claim. For each pivotal study, include: design, population, primary/key secondary results (with CIs and p-values), consistency across subgroups, and comparison to relevant standards of care. Conclusions must align with the proposed indication in Section 2.5.',
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E9(R1) (estimands)', 'ICH E17 (multi-regional trials)'],
    sections: [
      { heading: 'Background and Overview of Clinical Efficacy Studies', required: true, targetWords: [200, 400], guidance: 'List of clinical studies providing efficacy data, organized by study type (dose-finding, pivotal, supportive).' },
      { heading: 'Individual Study Results — Pivotal Trials', required: true, targetWords: [800, 1500], guidance: 'For each pivotal trial: design, population (inclusion/exclusion criteria, demographics), primary endpoint results (LS mean, OR, HR, etc.) with 95% CI and p-value, key secondary results, and clinical context.' },
      { heading: 'Individual Study Results — Supportive Trials', required: false, targetWords: [300, 600], guidance: 'Summary of supportive/phase 2 trial results contributing to the efficacy profile.' },
      { heading: 'Analyses Across Studies', required: true, targetWords: [300, 600], guidance: 'Pooled analyses, subgroup consistency (pre-specified and exploratory), dose-response, time-to-response, durability.' },
      { heading: 'Supportive Data', required: false, targetWords: [200, 400], guidance: 'PK/PD and biomarker data supporting efficacy mechanism, complementary endpoints, Quality of Life outcomes.' },
      { heading: 'Conclusions on Clinical Efficacy', required: true, targetWords: [200, 400], guidance: 'Synthesis linking all efficacy data to the proposed indication. State what the evidence establishes and any residual uncertainties.' },
    ],
  },

  ctd_2_7_5_safety_summary: {
    id: 'ctd_2_7_5_safety_summary',
    displayName: 'Clinical Safety Summary (2.7.5)',
    chipLabel: 'Clinical Safety Summary',
    primaryCode: '2.7.5',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA',
    detectionPatterns: [
      /\b(?:clinical\s+)?safety\s+summary\b/i,
      /\bsection\s+2\.7\.5\b/i,
      /\bctd\s+2\.7\.5\b/i,
      /\bmodule\s+2\.7\.5\b/i,
      /\bsummary\s+of\s+(?:clinical\s+)?safety\b/i,
      /\baggregate\s+safety\b/i,
    ],
    minConfidence: 0.6,
    draftingInstructions: 'Draft an ICH CTD Section 2.7.5 Summary of Clinical Safety. Aggregate safety data from all clinical studies. Present data as overall exposure → AEs → deaths → serious AEs → discontinuations → lab abnormalities → vital signs → special populations → identified safety signals → benefit-risk. Use ICH E2E-consistent MedDRA terminology.',
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E2E (pharmacovigilance)', 'ICH E2C(R2) (PSUR)', 'MedDRA coding'],
    sections: [
      { heading: 'Exposure to the Drug', required: true, targetWords: [200, 400], guidance: 'Overall safety database: total subjects exposed, exposure duration, dose groups, special populations. Comparison of safety population to efficacy population.' },
      { heading: 'Adverse Events', required: true, targetWords: [600, 1200], guidance: 'Overall incidence of AEs, deaths, SAEs, and discontinuations due to AEs. Common AEs (≥X%) by MedDRA SOC and PT. Dose-response and dose-duration relationships. Relationship to treatment.' },
      { heading: 'Deaths and Serious Adverse Events', required: true, targetWords: [300, 600], guidance: 'Listing and analysis of all deaths and SAEs. Causality assessment. Comparison of treatment vs. control event rates.' },
      { heading: 'Other Significant Adverse Events', required: true, targetWords: [300, 600], guidance: 'AEs leading to withdrawal, AEs of special interest (AESIs), potential drug reactions, immune-mediated events, identified safety signals from clinical data.' },
      { heading: 'Clinical Laboratory Evaluations', required: true, targetWords: [200, 400], guidance: 'Clinically significant laboratory abnormalities (hematology, chemistry, urinalysis). Shift tables where relevant.' },
      { heading: 'Vital Signs, Physical Findings, and Safety-Related Observations', required: true, targetWords: [150, 300], guidance: 'ECG, weight, BP, HR findings. Post-baseline changes of clinical significance.' },
      { heading: 'Safety in Special Populations', required: true, targetWords: [200, 400], guidance: 'Safety data for renally impaired, hepatically impaired, elderly, pediatric (if applicable), sex-based differences, race/ethnicity.' },
      { heading: 'Safety in Overdose', required: false, targetWords: [100, 200], guidance: 'Data from overdose cases, management approach.' },
      { heading: 'Post-marketing Safety Data', required: false, targetWords: [100, 200], guidance: 'Spontaneous reports, PSUR data, or real-world evidence if available.' },
      { heading: 'Conclusions on Clinical Safety', required: true, targetWords: [200, 400], guidance: 'Summary of the safety profile. Identified risks and proposed risk management. Residual uncertainties to be addressed post-marketing.' },
    ],
  },

  // ── Investigational New Drug (IND) ────────────────────────────────────────

  ind_investigator_brochure: {
    id: 'ind_investigator_brochure',
    displayName: "Investigator's Brochure (IB)",
    chipLabel: "Investigator's Brochure",
    primaryCode: 'IB',
    authority: 'ICH',
    submissionFamily: 'IND/CTA',
    detectionPatterns: [
      /\binvestigator(?:'s|s)?\s+brochure\b/i,
      /\b\bib\s+(?:draft|section|update|revision)\b/i,
      /\bdraft\s+(?:an?\s+)?ib\b/i,
      /\bwrite\s+(?:an?\s+)?investigator(?:'s|s)?\s+brochure\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: "Draft an ICH E6(R3)-compliant Investigator's Brochure. This document is provided to investigators to enable informed decisions about clinical trial participation. Include all relevant preclinical and clinical data, clearly labeling what is known vs. investigational. Follow the ICH E6(R3) template structure. Write for a clinically trained audience who may be unfamiliar with this compound.",
    regulatoryReferences: ['ICH E6(R3) (GCP)', 'ICH M4S / M4E (nonclinical / clinical sections)', '21 CFR 312.23(a)(5)'],
    sections: [
      { heading: 'Table of Contents', required: true, guidance: 'Complete TOC with section numbers and page numbers.' },
      { heading: '1. Summary', required: true, targetWords: [300, 600], guidance: 'Brief summary of the compound: pharmacological class, proposed indication, key nonclinical and clinical findings, and guidance to the investigator.' },
      { heading: '2. Introduction', required: true, targetWords: [200, 400], guidance: 'Chemical name, INN/USAN, mechanism of action, therapeutic rationale, and overview of current development stage.' },
      { heading: '3. Physical, Chemical, and Pharmaceutical Properties', required: true, targetWords: [200, 400], guidance: 'Physicochemical properties, formulations used in clinical trials, storage conditions, and handling precautions.' },
      { heading: '4. Nonclinical Studies', required: true, targetWords: [800, 1500], guidance: 'Key nonclinical findings relevant to human safety and clinical monitoring: pharmacology (primary and safety pharmacology), ADME, and toxicology (repeat-dose, genotoxicity, reproductive, carcinogenicity if available). Express safety margins in multiples of clinical exposure.' },
      { heading: '5. Effects in Humans', required: true, targetWords: [600, 1200], guidance: 'All available human data: PK/PD from phase 1 studies, efficacy signals from phase 2, safety data. If phase 3 data are available, include key findings. Integrate nonclinical-to-clinical PK correlations.' },
      { heading: '6. Summary of Data and Guidance for the Investigator', required: true, targetWords: [300, 600], guidance: 'Overall benefit-risk assessment at the current stage of development. Specific guidance on monitoring, dose modifications, and management of anticipated adverse events.' },
      { heading: 'References', required: true, guidance: 'Comprehensive reference list. All nonclinical and clinical study reports referenced should be available as IND appendices.' },
    ],
  },

  ind_phase1_protocol: {
    id: 'ind_phase1_protocol',
    displayName: 'Phase 1 Clinical Protocol',
    chipLabel: 'Ph.1 Protocol',
    authority: 'FDA',
    submissionFamily: 'IND',
    detectionPatterns: [
      /\bphase\s*[i1]\s+(?:clinical\s+)?protocol\b/i,
      /\bfirst.in.human\s+(?:clinical\s+)?protocol\b/i,
      /\bdraft\s+(?:a\s+)?phase\s*[i1]\s+study\b/i,
      /\bind\s+protocol\b/i,
      /\bfih\s+protocol\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft an FDA-compliant Phase 1 clinical trial protocol per ICH E6(R3) and FDA guidance. The protocol must be self-contained: a reviewer with no other knowledge should be able to understand the science, patient safety, and operational plan from this document alone. Include statistical rationale for dose escalation and stopping rules.',
    regulatoryReferences: ['ICH E6(R3) (GCP)', 'ICH E8(R1) (clinical study design)', '21 CFR 312.23 (IND application)', 'FDA Phase 1 Protocol Guidance'],
    sections: [
      { heading: '1. Protocol Synopsis', required: true, targetWords: [400, 700], guidance: 'Concise summary: title, design, objectives, endpoints, population, dose range, duration, statistical approach.' },
      { heading: '2. Introduction and Rationale', required: true, targetWords: [300, 600], guidance: 'Disease background, unmet need, mechanism of action, nonclinical support for clinical development, and rationale for the chosen dose, schedule, and route.' },
      { heading: '3. Objectives and Endpoints', required: true, targetWords: [200, 400], guidance: 'Primary objective (typically safety/tolerability/MTD/RP2D), secondary objectives (PK, PD, preliminary efficacy). Endpoints must be operationally defined and measurable.' },
      { heading: '4. Study Design', required: true, targetWords: [300, 600], guidance: 'Phase (1, open-label, first-in-human), design type (3+3, mTPI, BOIN, or other), dose levels, escalation rules, schedule, DLT window, and expansion cohorts if applicable.' },
      { heading: '5. Selection of Subjects', required: true, targetWords: [300, 600], guidance: 'Inclusion criteria (disease, ECOG/Karnofsky, organ function), exclusion criteria (concurrent drugs, organ dysfunction, prior therapy). Justify each criterion.' },
      { heading: '6. Treatment Plan', required: true, targetWords: [300, 600], guidance: 'Dose administration, formulation, pre-medications, dose modifications, and stopping rules. De-escalation and re-escalation criteria. Duration of treatment and off-treatment follow-up.' },
      { heading: '7. Assessments', required: true, targetWords: [300, 600], guidance: 'Safety assessments (AE monitoring, DLT definitions, laboratory, ECG, vitals). PK sampling schedule. PD and biomarker assessments. Efficacy assessments if applicable.' },
      { heading: '8. Statistical Considerations', required: true, targetWords: [200, 400], guidance: 'Study size justification, DLT/MTD determination method, PK and PD analysis plan, handling of missing data.' },
      { heading: '9. Regulatory, Ethical, and Administrative Information', required: true, targetWords: [150, 300], guidance: 'IRB/IEC requirements, informed consent process, sponsor/investigator responsibilities, data monitoring, protocol amendments, safety reporting timelines (SUSAR: 7/15 day).' },
      { heading: '10. References', required: true, guidance: 'Key literature supporting scientific rationale and study design.' },
    ],
  },

  // ── CMC Module 3 ──────────────────────────────────────────────────────────

  cmc_drug_substance: {
    id: 'cmc_drug_substance',
    displayName: 'CMC Drug Substance (3.2.S)',
    chipLabel: 'CMC Drug Substance',
    primaryCode: '3.2.S',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA/IND',
    detectionPatterns: [
      /\b(?:cmc\s+)?drug\s+substance\s+(?:section|module|document|narrative)\b/i,
      /\bmodule\s+3\.2\.s\b/i,
      /\bsection\s+3\.2\.s\b/i,
      /\b3\.2\.s\s+(?:drug\s+substance|narrative|section)\b/i,
      /\bcmc\s+(?:drug\s+)?substance\b/i,
      /\bapi\s+(?:cmc|section|module)\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft an ICH M4Q(R1)-compliant Module 3.2.S Drug Substance section. Organize exactly per the 3.2.S.1–3.2.S.7 structure. Each subsection must be complete and self-contained. Reference applicable ICH quality guidelines (Q1A–Q14) where they apply.',
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q3A (impurities)', 'ICH Q6A (specifications)', 'ICH Q7 (GMP for APIs)', 'ICH Q11 (development/manufacture)'],
    sections: [
      { heading: '3.2.S.1 General Information', required: true, code: '3.2.S.1', targetWords: [150, 300], guidance: 'INN/USAN, chemical name (IUPAC), CAS number, molecular formula/weight, structural formula, physicochemical properties (pKa, logP, solubility, polymorphism).' },
      { heading: '3.2.S.2 Manufacture', required: true, code: '3.2.S.2', targetWords: [400, 800], guidance: 'Manufacturer(s) name and address; manufacturing process description (synthetic route with reaction schemes, reagents, solvents, in-process controls, critical process parameters); manufacturing process development summary; controls of critical steps and intermediates; process validation.' },
      { heading: '3.2.S.3 Characterization', required: true, code: '3.2.S.3', targetWords: [300, 600], guidance: 'Structure elucidation (spectroscopic evidence: NMR, IR, MS, X-ray crystallography if applicable); physicochemical characterization; biological activity characterization (for biologics); impurities — synthetic impurities, degradation products, residual solvents (ICH Q3A, Q3C).' },
      { heading: '3.2.S.4 Control of Drug Substance', required: true, code: '3.2.S.4', targetWords: [400, 800], guidance: 'Specification table (with acceptance criteria and ICH Q6A justification); analytical procedures; validation of analytical procedures (ICH Q2(R2)); batch analyses (≥3 production or pilot-scale batches); justification for specification — link each criterion to clinical or stability data.' },
      { heading: '3.2.S.5 Reference Standards or Materials', required: true, code: '3.2.S.5', targetWords: [100, 200], guidance: 'Primary and working reference standard characterization, qualification, storage, and use.' },
      { heading: '3.2.S.6 Container Closure System', required: true, code: '3.2.S.6', targetWords: [100, 200], guidance: 'Description of primary and secondary packaging; materials of construction; compatibility; extractables/leachables if applicable.' },
      { heading: '3.2.S.7 Stability', required: true, code: '3.2.S.7', targetWords: [300, 600], guidance: 'Stability summary and conclusions (ICH Q1A): conditions tested, batches, duration, degradation pathway; post-approval stability protocol; proposed storage conditions, shelf life, and retest period with scientific justification.' },
    ],
  },

  cmc_drug_product: {
    id: 'cmc_drug_product',
    displayName: 'CMC Drug Product (3.2.P)',
    chipLabel: 'CMC Drug Product',
    primaryCode: '3.2.P',
    authority: 'ICH',
    submissionFamily: 'NDA/BLA/MAA/IND',
    detectionPatterns: [
      /\b(?:cmc\s+)?drug\s+product\s+(?:section|module|document|narrative)\b/i,
      /\bmodule\s+3\.2\.p\b/i,
      /\bsection\s+3\.2\.p\b/i,
      /\b3\.2\.p\s+(?:drug\s+product|narrative|section)\b/i,
      /\bcmc\s+(?:drug\s+)?product\b/i,
      /\bfinished\s+(?:dosage\s+form|product)\s+cmc\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft an ICH M4Q(R1)-compliant Module 3.2.P Drug Product section. Cover formulation development logic, manufacturing process, controls, container closure system, and stability. Demonstrate that each excipient choice and specification criterion is scientifically justified.',
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q3B (drug product impurities)', 'ICH Q6A (specifications)', 'ICH Q8(R2) (pharmaceutical development)', 'ICH Q10 (pharmaceutical QS)'],
    sections: [
      { heading: '3.2.P.1 Description and Composition', required: true, code: '3.2.P.1', targetWords: [150, 300], guidance: 'Dosage form, route of administration; quantitative composition per unit dose; list of all components (active and excipients with function); container closure system description.' },
      { heading: '3.2.P.2 Pharmaceutical Development', required: true, code: '3.2.P.2', targetWords: [400, 800], guidance: 'Formulation development (ICH Q8): excipient selection, compatibility studies, formulation optimization, impact of polymorphism. Manufacturing process development (CPPs, CQAs, QTPP). Microbiological attributes. Compatibility with reconstitution diluents / devices if applicable.' },
      { heading: '3.2.P.3 Manufacture', required: true, code: '3.2.P.3', targetWords: [300, 600], guidance: 'Manufacturer(s); batch formula; manufacturing process description (flow diagram + narrative); controls of critical steps; process validation/evaluation — CPPs and CQA linkages; excipient qualification.' },
      { heading: '3.2.P.4 Control of Excipients', required: true, code: '3.2.P.4', targetWords: [100, 200], guidance: 'Specifications for non-compendial excipients; compendial compliance for compendial excipients; novel excipients.' },
      { heading: '3.2.P.5 Control of Drug Product', required: true, code: '3.2.P.5', targetWords: [400, 800], guidance: 'Specification table with acceptance criteria and basis; analytical procedures; validation (ICH Q2(R2)); batch analyses for multiple batches including pivotal clinical and commercial-scale; characterization of impurities and degradation products; justification of specifications.' },
      { heading: '3.2.P.6 Reference Standards or Materials', required: false, code: '3.2.P.6', targetWords: [80, 150], guidance: 'Reference to 3.2.S.5 if same; any drug product-specific reference standards.' },
      { heading: '3.2.P.7 Container Closure System', required: true, code: '3.2.P.7', targetWords: [150, 300], guidance: 'Container closure components, materials, quality standards, extractables/leachables study summary, suitability demonstration.' },
      { heading: '3.2.P.8 Stability', required: true, code: '3.2.P.8', targetWords: [300, 600], guidance: 'Stability summary and conclusions (ICH Q1A/Q1E): conditions, batches, duration, degradation pathways; in-use stability; photostability (ICH Q1B); post-approval stability protocol; proposed storage conditions, shelf life, and scientific justification.' },
    ],
  },

  // ── Device — 510(k) / PMA ─────────────────────────────────────────────────

  fda_510k_se_statement: {
    id: 'fda_510k_se_statement',
    displayName: '510(k) Substantial Equivalence Statement',
    chipLabel: '510(k) SE Statement',
    authority: 'FDA',
    submissionFamily: '510(k)',
    detectionPatterns: [
      /\b510\(?k\)?\s+(?:substantial\s+equivalence|se)\s+statement\b/i,
      /\bsubstantial\s+equivalence\s+(?:statement|summary|discussion)\b/i,
      /\bdraft\s+(?:a\s+)?510\(?k\)?\s+(?:submission|summary|statement)\b/i,
      /\b510\(?k\)?\s+summary\b/i,
      /\bwrite\s+(?:a\s+)?510\(?k\)?\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft the Substantial Equivalence Discussion section of an FDA 510(k) submission per 21 CFR 807.87(f) and FDA\'s "The 510(k) Program" guidance. Identify a cleared predicate device, establish intended-use equivalence, then compare technological characteristics. If there are design differences, demonstrate they do not raise new safety/effectiveness questions and the device is at least as safe and effective as the predicate.',
    regulatoryReferences: ['21 CFR 807.87(f)', 'FDA 510(k) Program Guidance (2019)', 'FDA SE Decision-Making Flowchart', 'ANSI/AAMI standards as applicable'],
    sections: [
      { heading: 'Device Description', required: true, targetWords: [200, 400], guidance: 'Clear description of the subject device: intended use, indications for use, key design features, materials, and principle of operation.' },
      { heading: 'Predicate Device Identification', required: true, targetWords: [150, 300], guidance: 'Identify the predicate device(s): trade name, manufacturer, 510(k) number, cleared indications. Justify the predicate selection — explain why this is the most appropriate reference.' },
      { heading: 'Intended Use Comparison', required: true, targetWords: [150, 300], guidance: 'Side-by-side comparison of the subject and predicate intended use and indications for use. Establish equivalence or identify differences and explain why they do not affect safety or effectiveness.' },
      { heading: 'Technological Characteristics Comparison', required: true, targetWords: [400, 800], guidance: 'Feature-by-feature comparison table (materials, design, energy source, software, sterility, biocompatibility, etc.). For each difference from the predicate: (a) does it raise new safety/effectiveness questions? (b) if yes, provide data demonstrating equivalence.' },
      { heading: 'Performance Testing Summary', required: true, targetWords: [300, 600], guidance: 'Summary of bench testing, animal testing, clinical data (if applicable), and software validation demonstrating the device is at least as safe and effective as the predicate. Reference applicable standards (ASTM, ISO, IEC).' },
      { heading: 'Biocompatibility Assessment', required: true, targetWords: [150, 300], guidance: 'ISO 10993-1 risk-based assessment. Identify material contact type (surface/external communicating/implant), duration, and biocompatibility tests performed. For predicate-equivalent materials, reference prior clearance.' },
      { heading: 'Substantial Equivalence Conclusion', required: true, targetWords: [100, 200], guidance: 'Declarative statement that the subject device has: (a) the same intended use as the predicate, and (b) the same or different technological characteristics that do not raise new questions of safety or effectiveness, and is at least as safe and effective as the predicate.' },
    ],
  },

  pma_summary_safety_effectiveness: {
    id: 'pma_summary_safety_effectiveness',
    displayName: 'PMA Summary of Safety and Effectiveness',
    chipLabel: 'SSED (PMA)',
    authority: 'FDA',
    submissionFamily: 'PMA',
    detectionPatterns: [
      /\bpma\s+(?:summary|ssed)\b/i,
      /\bsummary\s+of\s+safety\s+and\s+effectiveness\b/i,
      /\bssed\b/i,
      /\bpremarket\s+approval\s+summary\b/i,
    ],
    minConfidence: 0.70,
    draftingInstructions: 'Draft a PMA Summary of Safety and Effectiveness Data (SSED) per 21 CFR 814.20(b)(8). This is a publicly available document that accompanies every PMA approval. Present device description, preclinical and clinical study designs/results, benefit-risk analysis, and conclusions supporting approval.',
    regulatoryReferences: ['21 CFR 814.20(b)(8)', 'FDA PMA Decision-Making Guidance', 'FDA Benefit-Risk Framework for Medical Devices'],
    sections: [
      { heading: '1. General Information', required: true, targetWords: [150, 300], guidance: 'Device trade name, applicant, legal manufacturer, generic name, classification, indication for use, device description overview.' },
      { heading: '2. Indications for Use', required: true, targetWords: [100, 200], guidance: 'Exact FDA-reviewed indication for use statement. Patient population, clinical conditions, anatomical site, and intended clinical environment.' },
      { heading: '3. Device Description', required: true, targetWords: [300, 600], guidance: 'Principle of operation, key design features, materials, sizes/configurations, accessories, sterilization method, shelf life, and labeling overview.' },
      { heading: '4. Preclinical Studies', required: true, targetWords: [400, 800], guidance: 'Bench testing, fatigue, wear, corrosion, electrical safety (IEC 60601), biocompatibility (ISO 10993), sterility validation, software (IEC 62304), electromagnetic compatibility, animal studies. Include pass/fail criteria and results.' },
      { heading: '5. Clinical Studies', required: true, targetWords: [600, 1200], guidance: 'Study design (pivotal study protocol), endpoints (primary/secondary with pre-specified success criteria), statistical analysis plan, subject characteristics, safety and effectiveness results, device-related adverse events, and comparison to standard of care or control.' },
      { heading: '6. Benefit-Risk Determination', required: true, targetWords: [300, 600], guidance: 'Quantify patient benefit, characterize risks (probability, severity, reversibility), contextualize against alternatives. Apply FDA\'s benefit-risk framework. Identify residual risks and how they are mitigated in labeling or post-market conditions.' },
      { heading: '7. Conclusions', required: true, targetWords: [100, 200], guidance: 'Statement that the device is safe and effective for the proposed indication when used as directed. Reference to any conditions of approval or post-approval study commitments.' },
    ],
  },

  // ── Clinical Study Reports ────────────────────────────────────────────────

  clinical_study_report: {
    id: 'clinical_study_report',
    displayName: 'Clinical Study Report (CSR)',
    chipLabel: 'Clinical Study Report',
    authority: 'ICH',
    submissionFamily: 'IND/NDA/BLA/MAA',
    detectionPatterns: [
      /\bclinical\s+study\s+report\b/i,
      /\bcsr\s+(?:draft|template|section|outline)\b/i,
      /\bdraft\s+(?:a\s+)?csr\b/i,
      /\bich\s+e3\s+(?:report|csr|outline)\b/i,
      /\bwrite\s+(?:a\s+)?clinical\s+study\s+report\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft a Clinical Study Report (CSR) per ICH E3 guidelines. The CSR must be comprehensive: a self-contained document enabling a regulatory agency to independently evaluate the trial\'s conduct, results, and reliability without reference to the protocol or other documents. Follow ICH E3 section numbering exactly.',
    regulatoryReferences: ['ICH E3 (Structure and Content of CSRs)', 'ICH E6(R3) (GCP)', 'ICH E9(R1) (statistical considerations)', 'ICH E19 (safety data collection optimization)'],
    sections: [
      { heading: '1. Title Page', required: true, guidance: 'Protocol title, study code, phase, drug name, indication, investigators, dates, sponsor, sponsor reference number.' },
      { heading: '2. Synopsis', required: true, targetWords: [600, 1200], guidance: 'Concise structured summary of the complete report: objectives, design, patients, efficacy results, safety results, conclusions.' },
      { heading: '3. Table of Contents', required: true, guidance: 'Complete TOC with page numbers.' },
      { heading: '4. List of Abbreviations and Definitions of Terms', required: true, guidance: 'All abbreviations and specialized terms used in the report.' },
      { heading: '5. Ethics', required: true, targetWords: [150, 300], guidance: 'IRB/IEC review and approval, GCP compliance statement, patient consent process.' },
      { heading: '6. Investigators and Study Administrative Structure', required: true, targetWords: [150, 300], guidance: 'List of investigators, sites, and administrative/coordinating functions.' },
      { heading: '7. Introduction', required: true, targetWords: [300, 600], guidance: 'Disease background, drug development rationale, nonclinical support for clinical use, prior clinical experience with the compound, and this study\'s objectives within the development program.' },
      { heading: '8. Study Objectives', required: true, targetWords: [100, 200], guidance: 'Primary and secondary objectives stated precisely as they appear in the protocol.' },
      { heading: '9. Investigational Plan', required: true, targetWords: [500, 1000], guidance: 'Overall design (phase, type, blinding, allocation), selection of subjects, treatments administered, dosing, assessment schedule, statistical methodology, data quality assurance, protocol deviations.' },
      { heading: '10. Study Patients', required: true, targetWords: [300, 600], guidance: 'Disposition of all randomized patients (treated, discontinued, completed). Deviations. Demographic and baseline characteristics.' },
      { heading: '11. Efficacy Evaluation', required: true, targetWords: [800, 1500], guidance: 'Data sets analyzed (ITT, PP, safety). Efficacy results — primary endpoint (with 95% CI and p-value), key secondary endpoints, subgroup analyses, interaction tests. Statistical methods applied.' },
      { heading: '12. Safety Evaluation', required: true, targetWords: [600, 1200], guidance: 'Exposure, AEs (all grades and ≥Grade 3 by MedDRA SOC/PT), deaths, SAEs, discontinuations. Laboratory, vital signs, ECG. Clinical assessment of safety signals.' },
      { heading: '13. Discussion and Conclusions', required: true, targetWords: [400, 800], guidance: 'Integrated interpretation of efficacy and safety. Context vs. prior results and standard of care. What the study establishes, what remains uncertain, and implications for the development program.' },
    ],
  },

  // ── FDA Safety ────────────────────────────────────────────────────────────

  dsur: {
    id: 'dsur',
    displayName: 'Development Safety Update Report (DSUR)',
    chipLabel: 'DSUR',
    authority: 'ICH',
    submissionFamily: 'IND/CTA',
    detectionPatterns: [
      /\bdsur\b/i,
      /\bdevelopment\s+safety\s+update\s+(?:report|annual)\b/i,
      /\bannual\s+(?:safety\s+)?report\s+(?:to\s+fda|for\s+ind)\b/i,
      /\find\s+annual\s+report\b/i,
    ],
    minConfidence: 0.70,
    draftingInstructions: 'Draft an ICH E2F Development Safety Update Report (DSUR). This annual report is submitted to health authorities to summarize all safety data collected on the investigational product during the reporting period. Follow the ICH E2F structure exactly. Include a benefit-risk evaluation for the current stage of development.',
    regulatoryReferences: ['ICH E2F (DSUR guidance)', '21 CFR 312.33 (IND annual reports)', 'FDA Safety Reporting Guidance (2012)'],
    sections: [
      { heading: 'Title Page', required: true, guidance: 'Product name, INN, reporting period, data lock point, sponsor name/address, DAN number.' },
      { heading: '1. Introduction', required: true, targetWords: [150, 300], guidance: 'Overview of the investigational product, reporting period, and structure of this DSUR.' },
      { heading: '2. Worldwide Marketing Approval Status', required: true, targetWords: [100, 200], guidance: 'List of countries where the product is approved and any significant labeling changes during the period.' },
      { heading: '3. Actions Taken for Safety Reasons', required: true, targetWords: [200, 400], guidance: 'Significant actions taken during the reporting period (clinical holds, protocol amendments for safety, labeling revisions, product withdrawals).' },
      { heading: '4. Changes to Reference Safety Information', required: true, targetWords: [100, 200], guidance: 'Changes to the IB or reference safety document that occurred during the reporting period.' },
      { heading: '5. Clinical Study/Trial Patient Exposure', required: true, targetWords: [200, 400], guidance: 'Summary of patient exposure in all ongoing and completed clinical studies during the period.' },
      { heading: '6. Data in Line Listings and Summary Tabulations', required: true, targetWords: [100, 200], guidance: 'Reference to appended line listings and summary tables of SAEs, SUSARs, non-serious events.' },
      { heading: '7. Significant Findings from Clinical Studies', required: true, targetWords: [300, 600], guidance: 'Summary of significant efficacy and safety findings, any new safety signals identified, and new information from ongoing studies that may affect the benefit-risk profile.' },
      { heading: '8. Safety Findings from Non-Interventional Studies', required: false, targetWords: [100, 200], guidance: 'Relevant safety data from observational studies, registries, or real-world evidence if applicable.' },
      { heading: '9. Information from Other Clinical Trials/Studies', required: false, targetWords: [100, 200], guidance: 'Safety data from related studies (different indications, combinations, or related compounds).' },
      { heading: '10. Non-Clinical Data', required: true, targetWords: [150, 300], guidance: 'Summary of new nonclinical safety findings from studies completed during the reporting period.' },
      { heading: '11. Literature', required: true, targetWords: [100, 200], guidance: 'Summary of published literature relevant to drug safety during the period.' },
      { heading: '12. Summary of Significant Risks', required: true, targetWords: [200, 400], guidance: 'Cumulative list of identified risks (labeled and unlabeled) and risks under investigation.' },
      { heading: '13. Overall Safety Evaluation', required: true, targetWords: [300, 600], guidance: 'Integrated benefit-risk evaluation for the current stage of development, including new information, changes in the benefit-risk profile, and adequacy of current risk minimization measures.' },
      { heading: '14. Conclusions', required: true, targetWords: [100, 200], guidance: 'Key conclusions regarding subject safety during the reporting period and any recommended actions.' },
    ],
  },

  // ── FDA Meeting Packages ──────────────────────────────────────────────────

  fda_type_b_meeting_package: {
    id: 'fda_type_b_meeting_package',
    displayName: 'FDA Type B Meeting Request Package',
    chipLabel: 'Type B Meeting Package',
    authority: 'FDA',
    submissionFamily: 'IND/NDA/BLA',
    detectionPatterns: [
      /\btype\s*b\s+meeting\s+(?:package|request|briefing)\b/i,
      /\bend\s+of\s+phase\s*[12]\s+meeting\b/i,
      /\beop[12]\s+meeting\b/i,
      /\bpre.?ind\s+meeting\s+(?:package|request)\b/i,
      /\bpre.?nda\s+meeting\s+(?:package|request)\b/i,
      /\bpre.?bla\s+meeting\s+(?:package|request)\b/i,
      /\bfda\s+meeting\s+(?:package|briefing\s+document)\b/i,
    ],
    minConfidence: 0.70,
    draftingInstructions: "Draft an FDA Type B Meeting Request Package per FDA's Formal Meetings Between FDA and Sponsors or Applicants of PDUFA Products guidance. This package accompanies the meeting request and must contain enough background that FDA reviewers can engage substantively. Questions must be specific and answerable — do NOT ask open-ended questions.",
    regulatoryReferences: ["FDA Formal Meetings Guidance (2017)", "21 CFR 312.47 (pre-NDA meetings)", "PDUFA Letter"],
    sections: [
      { heading: 'Cover Letter and Meeting Request', required: true, targetWords: [150, 300], guidance: 'Brief letter identifying the meeting type, proposed date, meeting format (in-person/teleconference), and sponsor contact.' },
      { heading: 'Product Description and Development Status', required: true, targetWords: [200, 400], guidance: 'Drug name, INN, therapeutic class, indication, current phase of development, and IND number.' },
      { heading: 'Background', required: true, targetWords: [500, 1000], guidance: 'Summary of the nonclinical program, completed clinical studies, and key findings. What has been established and what is still uncertain. This is the key informational section — be comprehensive but focused on what is relevant to the meeting questions.' },
      { heading: 'Meeting Objectives', required: true, targetWords: [100, 200], guidance: 'One paragraph: what the sponsor hopes to achieve in the meeting. Not the questions themselves.' },
      { heading: 'Specific Questions for FDA', required: true, targetWords: [300, 600], guidance: 'Numbered list of specific, answerable questions. Each question should: (1) provide brief background context, (2) state the sponsor\'s position or proposed approach, and (3) ask a specific yes/no or constrained question. Do NOT ask "Is our program adequate?" — ask "Does FDA agree that Study XYZ is adequate to support the proposed indication?"' },
      { heading: 'Proposed Agenda', required: true, targetWords: [100, 200], guidance: 'Draft agenda for the meeting with time allocation per topic.' },
      { heading: 'Proposed Attendee List', required: true, targetWords: [80, 150], guidance: 'Sponsor attendees by name and role. Request FDA attendees by division and discipline.' },
    ],
  },

  // ── Post-Market Safety ────────────────────────────────────────────────────

  psur_pbrer: {
    id: 'psur_pbrer',
    displayName: 'Periodic Benefit-Risk Evaluation Report (PBRER/PSUR)',
    chipLabel: 'PBRER/PSUR',
    authority: 'ICH',
    submissionFamily: 'Post-Marketing',
    detectionPatterns: [
      /\bpsur\b/i,
      /\bpbrer\b/i,
      /\bperiodic\s+(?:benefit.risk\s+evaluation|safety\s+update)\s+report\b/i,
      /\bperiodic\s+safety\s+update\b/i,
    ],
    minConfidence: 0.70,
    draftingInstructions: 'Draft a Periodic Benefit-Risk Evaluation Report (PBRER) per ICH E2C(R2). This report is submitted to health authorities at defined intervals post-approval to evaluate the evolving benefit-risk profile. The benefit-risk conclusion must be evidence-based and clearly communicated.',
    regulatoryReferences: ['ICH E2C(R2) (PBRER/PSUR)', 'EMA PSUR guidance', 'FDA PADER requirements (21 CFR 314.81(b)(2))'],
    sections: [
      { heading: '1. Introduction', required: true, targetWords: [150, 300], guidance: 'Product description, reporting interval, PBRER scope, and structure.' },
      { heading: '2. Worldwide Marketing Approval Status', required: true, targetWords: [200, 400], guidance: 'Table of all approvals, dates, indications, dose forms, and any restrictions.' },
      { heading: '3. Actions Taken for Safety Reasons', required: true, targetWords: [200, 400], guidance: 'All regulatory actions taken globally during the interval (withdrawals, suspensions, modifications, label changes) with rationale.' },
      { heading: '4. Changes to Reference Product Information', required: true, targetWords: [100, 200], guidance: 'Changes to the SmPC/USPI/core data sheet that occurred during the period.' },
      { heading: '5. Estimated Patient Exposure', required: true, targetWords: [150, 300], guidance: 'Cumulative and interval patient exposure estimates by indication, region, and dose form.' },
      { heading: '6. Data in Line Listings and Summary Tabulations', required: true, guidance: 'Reference to cumulative and interval line listings. MedDRA-coded SAEs.' },
      { heading: '7. Summaries of Significant Safety Findings from Clinical Studies', required: true, targetWords: [300, 600], guidance: 'Significant safety findings from ongoing/completed clinical studies, including long-term extensions and special population studies.' },
      { heading: '8. Findings from Non-Interventional Studies', required: false, targetWords: [150, 300], guidance: 'Signal-relevant data from observational studies, registries, and databases.' },
      { heading: '9. Information from Other Clinical Trials/Sources', required: false, targetWords: [150, 300], guidance: 'Abuse, withdrawal, overdose data; medication errors; reports from related compounds.' },
      { heading: '10. Non-Clinical Data', required: true, targetWords: [100, 200], guidance: 'New nonclinical findings with clinical safety implications.' },
      { heading: '11. Literature', required: true, targetWords: [150, 300], guidance: 'Key publications on safety/benefit-risk that appeared during the interval.' },
      { heading: '12. Other PBRER Information', required: false, targetWords: [100, 200], guidance: 'Pharmacogenomics, late-breaking information, etc.' },
      { heading: '13. Characterization of Risks', required: true, targetWords: [400, 800], guidance: 'Summary of the risk profile: identified risks (labeled and unlabeled), risks under investigation, missing information. Apply CIOMS categories.' },
      { heading: '14. Benefit Evaluation', required: true, targetWords: [300, 600], guidance: 'Current evidence for efficacy/effectiveness in the approved indication(s). Compare to alternatives. Assess clinical meaningfulness.' },
      { heading: '15. Integrated Benefit-Risk Analysis', required: true, targetWords: [400, 800], guidance: 'Structured benefit-risk evaluation weighing all relevant evidence. Contextualize for the intended patient population. State whether the benefit-risk balance remains favorable.' },
      { heading: '16. Conclusions and Actions', required: true, targetWords: [200, 400], guidance: 'Summary conclusions. Recommended actions (label update, REMS modification, additional post-market study, enhanced monitoring). Risk management plan updates.' },
    ],
  },

  // ── Safety Narrative ──────────────────────────────────────────────────────

  safety_narrative: {
    id: 'safety_narrative',
    displayName: 'Serious Adverse Event Safety Narrative',
    chipLabel: 'SAE Narrative',
    authority: 'ICH',
    submissionFamily: 'IND/NDA/BLA',
    detectionPatterns: [
      /\bsafety\s+narrative\b/i,
      /\bsae\s+narrative\b/i,
      /\badverse\s+event\s+narrative\b/i,
      /\bcasual\s+(?:assessment|narrative)\b/i,
      /\bindividual\s+patient\s+narrative\b/i,
      /\bwrite\s+(?:a\s+)?(?:patient|case)\s+narrative\b/i,
    ],
    minConfidence: 0.65,
    draftingInstructions: 'Draft a patient-level safety narrative for a serious adverse event (SAE) per ICH E3 and standard regulatory medical writing conventions. The narrative must be a complete, stand-alone account enabling a reviewer to independently assess causality and medical significance. Write in past tense, third person. Include all clinical facts; do not interpret beyond what the data shows.',
    regulatoryReferences: ['ICH E3 (Section 12, individual patient data)', 'ICH E2A (SAE reporting)', 'MedDRA coding conventions'],
    sections: [
      { heading: 'Patient Identification and Demographics', required: true, targetWords: [80, 150], guidance: 'Patient number, age, sex, race, weight. Relevant medical history and concomitant medications at time of event.' },
      { heading: 'Study Drug Exposure', required: true, targetWords: [80, 150], guidance: 'Study drug, dose, start date, cumulative exposure, and any dose modifications prior to the event.' },
      { heading: 'Event Description', required: true, targetWords: [200, 400], guidance: 'Onset date, MedDRA-coded event term, description of clinical presentation, severity (NCI CTCAE grade if oncology), and action taken with study drug (dose not changed / dose reduced / drug withdrawn).' },
      { heading: 'Clinical Course and Investigations', required: true, targetWords: [200, 400], guidance: 'Chronological description of the event from onset to resolution or death. Include relevant laboratory values, imaging, ECG findings, and clinical management. State outcome (resolved, resolving, not resolved, fatal) and time to resolution if resolved.' },
      { heading: 'Causality Assessment', required: true, targetWords: [100, 200], guidance: 'Investigator assessment of relationship to study drug (not related / unlikely related / possibly related / probably related / definitely related) with brief clinical rationale. Include de-challenge and re-challenge data if applicable.' },
      { heading: 'Conclusion', required: true, targetWords: [80, 150], guidance: 'One-paragraph synthesis: the event, its relationship to study drug, and the outcome. What action was taken and what follow-up is planned.' },
    ],
  },

  // ── FDA IR Response ───────────────────────────────────────────────────────

  fda_information_request_response: {
    id: 'fda_information_request_response',
    displayName: 'FDA Information Request Response',
    chipLabel: 'IR Response',
    authority: 'FDA',
    submissionFamily: 'NDA/BLA/510(k)',
    detectionPatterns: [
      /\bfda\s+(?:ir|information\s+request)\s+response\b/i,
      /\binformation\s+request\s+(?:response|reply|letter)\b/i,
      /\brespond\s+to\s+(?:an?\s+)?(?:fda\s+)?(?:ir|information\s+request)\b/i,
      /\bdraft\s+(?:an?\s+)?(?:fda\s+)?ir\s+(?:response|letter)\b/i,
    ],
    minConfidence: 0.70,
    draftingInstructions: 'Draft a formal FDA Information Request (IR) response. This is a regulatory submission — every statement is on the record. Lead with clear, direct answers to each IR question. Provide evidence, cite the relevant sections of the submission, and summarize what action has been taken. Do not hedge. If a question cannot be answered, state so explicitly and propose an alternative path.',
    regulatoryReferences: ['21 CFR 314.100–314.110 (review timelines)', 'FDA MAPP for review staff', 'FDA Complete Response Letter Guidance'],
    sections: [
      { heading: 'Cover Letter', required: true, targetWords: [150, 300], guidance: 'Reference the FDA IR letter (date, reference number), the submission (NDA/BLA/510(k) number), and briefly state the purpose of this response.' },
      { heading: 'Response to Question [1]', required: true, targetWords: [300, 600], guidance: 'Quote the FDA question verbatim. Then provide a direct answer in the first sentence. Support with data, analysis, or citation to submission sections. If new data is provided, include it as a labeled appendix.' },
      { heading: 'Response to Question [2]', required: false, targetWords: [300, 600], guidance: 'Repeat structure for each additional question. Each question should stand alone — do not cross-reference previous answers without explanation.' },
      { heading: 'Summary of Actions Taken', required: true, targetWords: [150, 300], guidance: 'List all amendments to the submission triggered by this IR. Reference the section/module and the nature of the change (new data added, label revised, module updated).' },
      { heading: 'Outstanding Issues', required: false, targetWords: [100, 200], guidance: 'If any questions cannot be fully answered, acknowledge them, explain the limitation, and propose an alternative approach (additional study, label adjustment, post-market commitment).' },
    ],
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// Detection Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface DetectedDocumentTemplate {
  template: RegulatoryDocumentTemplate;
  confidence: number;
  matchedPatterns: string[];
}

/**
 * Detect whether the user's message requests a specific regulatory document type.
 * Returns the best-matching template or null if no confident match is found.
 *
 * This runs ABOVE the intent-lens system and is more specific — it maps natural
 * language like "draft a Clinical Overview" directly to a structured template
 * rather than just detecting a "write/improve" intent.
 */
export function detectDocumentTemplate(message: string): DetectedDocumentTemplate | null {
  const lower = message.toLowerCase();

  const candidates: Array<{
    template: RegulatoryDocumentTemplate;
    score: number;
    matches: string[];
  }> = [];

  for (const template of Object.values(DOCUMENT_TEMPLATES)) {
    const matches: string[] = [];
    let score = 0;

    for (const pattern of template.detectionPatterns) {
      const match = lower.match(pattern);
      if (match) {
        score += 1;
        matches.push(match[0]);
      }
    }

    if (score > 0) {
      const patternCount = template.detectionPatterns.length;
      const normalizedScore = score / Math.max(patternCount, 1);
      if (normalizedScore >= template.minConfidence || score >= 2) {
        candidates.push({ template, score: normalizedScore, matches });
      } else if (score >= 1) {
        // Single-pattern match — use raw score for tie-breaking but below threshold
        candidates.push({ template, score: normalizedScore * 0.5, matches });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, then by pattern specificity (more patterns = more specific)
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.template.detectionPatterns.length - a.template.detectionPatterns.length;
  });

  const best = candidates[0];
  if (best.score < 0.3) return null; // Too weak even after threshold bypass

  return {
    template: best.template,
    confidence: best.score,
    matchedPatterns: best.matches,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the system prompt block for a detected document template.
 * Injected into the orchestrator's assembled system prompt so AnA outputs
 * a properly structured, submission-ready document rather than free-form prose.
 */
export function buildDocumentTemplateBlock(detected: DetectedDocumentTemplate): string {
  const { template } = detected;
  const lines: string[] = [
    `## DOCUMENT TYPE DETECTED: ${template.displayName.toUpperCase()}`,
    '',
    `**Regulatory Reference:** ${template.primaryCode ? `${template.primaryCode} — ` : ''}${template.authority}`,
    `**Submission Family:** ${template.submissionFamily}`,
    '',
    '### DRAFTING INSTRUCTIONS',
    template.draftingInstructions,
    '',
  ];

  if (template.regulatoryReferences && template.regulatoryReferences.length > 0) {
    lines.push('### KEY REGULATORY REFERENCES');
    template.regulatoryReferences.forEach(ref => lines.push(`- ${ref}`));
    lines.push('');
  }

  lines.push('### REQUIRED DOCUMENT STRUCTURE');
  lines.push('');
  lines.push('You MUST organize your output using the following section structure. Use the exact headings below as Markdown headers (##). Required sections MUST be present. Optional sections should be included when relevant data exists.');
  lines.push('');

  const required = template.sections.filter(s => s.required);
  const optional = template.sections.filter(s => !s.required);

  lines.push('**Required sections:**');
  for (const section of required) {
    const wordTarget = section.targetWords
      ? ` (~${section.targetWords[0]}–${section.targetWords[1]} words)`
      : '';
    const code = section.code ? ` \`${section.code}\`` : '';
    lines.push(`- **${section.heading}**${code}${wordTarget}`);
    lines.push(`  ${section.guidance}`);
  }

  if (optional.length > 0) {
    lines.push('');
    lines.push('**Optional sections (include when applicable):**');
    for (const section of optional) {
      const wordTarget = section.targetWords
        ? ` (~${section.targetWords[0]}–${section.targetWords[1]} words)`
        : '';
      const code = section.code ? ` \`${section.code}\`` : '';
      lines.push(`- ${section.heading}${code}${wordTarget}`);
      lines.push(`  ${section.guidance}`);
    }
  }

  lines.push('');
  lines.push('### OUTPUT RULES');
  lines.push('1. Use the section headings above verbatim as level-2 Markdown headers (`##`).');
  lines.push('2. Write [PLACEHOLDER] where the user has not yet provided the specific data needed — do NOT fabricate clinical data, patient numbers, p-values, or study results.');
  lines.push('3. After completing the document, add a brief "**What data do I still need?**" section listing any placeholders and the specific information needed to complete each.');
  lines.push('4. Write at the level expected by an FDA/EMA regulatory reviewer — precise, evidence-backed, and free of promotional language.');
  lines.push('5. Do NOT include a preamble like "Here is the draft you requested" — start directly with the first section heading.');

  return lines.join('\n');
}
