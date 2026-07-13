/**
 * AnA document-template registry + phrase-level detection (kit
 * app/ana-doc-templates.jsx).
 *
 * Ported verbatim from concept2cure-v2 PR #1004
 * (server/services/ana-ri/document-templates.ts, c53cc22) — the real
 * RegulatoryDocumentTemplate registry that maps natural-language requests to
 * specific regulatory document types with full structured section outlines
 * (ICH/FDA codes, required flags, word-count targets).
 *
 * Contract (SSE `orchestration` event, fires before the first token):
 * detectedDocumentTemplate: { id, displayName, chipLabel, authority,
 * submissionFamily, confidence, sections[] } — or null for most messages.
 * `sections[]` is forwarded on the live event (typed
 * shared/types/ana-document-detection.ts, merged PR #1005, e6ebf60). This
 * registry remains the offline mirror — same shapes — so the design renders
 * without a backend; live binding takes the event's sections verbatim.
 *
 * ConversationThread.tsx reads `(window as any).detectDocumentTemplate` —
 * this module keeps that bridge live alongside the named exports below.
 */

export interface TemplateSection {
  heading: string;
  code?: string;
  required: boolean;
  targetWords?: [number, number];
  guidance: string;
}

function section(
  heading: string,
  code: string | null,
  required: boolean,
  targetWords: [number, number] | null,
  guidance: string,
): TemplateSection {
  return {
    heading,
    code: code || undefined,
    required,
    targetWords: targetWords || undefined,
    guidance: guidance || '',
  };
}

export interface DocTemplate {
  id: string;
  displayName: string;
  chipLabel: string;
  primaryCode: string | null;
  authority: string;
  submissionFamily: string;
  minConfidence: number;
  detectionPatterns: RegExp[];
  regulatoryReferences: string[];
  sections: TemplateSection[];
}

export const ANA_DOC_TEMPLATES: Record<string, DocTemplate> = {
  ctd_2_2_introduction: {
    id: 'ctd_2_2_introduction', displayName: 'CTD Introduction (2.2)', chipLabel: 'CTD 2.2', primaryCode: '2.2',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.6,
    detectionPatterns: [/\bctd\s+(?:section\s+)?2\.2\b/i, /\bintroduction\s+to\s+(?:the\s+)?ctd\b/i, /\bmodule\s+2\.2\b/i, /\bdraft\s+(?:a\s+)?2\.2\s+introduction\b/i],
    regulatoryReferences: ['ICH M4E(R2)', 'ICH M4Q(R1)', 'FDA NDA/BLA Format and Content Guidance'],
    sections: [
      section('Pharmacological Class and Mode of Action', null, true, [100, 200], 'Pharmacological class, INN/USAN, mechanism of action, receptor/target affinity.'),
      section('Proposed Indication and Route of Administration', null, true, [80, 150], 'Proposed indication(s), dosage form(s), route(s) of administration.'),
      section('Regulatory Pathway', null, true, [60, 120], 'Identify the pathway (NDA 505(b)(1)/(2), BLA 351(a)/(k), MAA) and submission type.'),
      section('Development Program Overview', null, false, [100, 200], 'Brief summary of the nonclinical and clinical program supporting the application.'),
    ],
  },
  ctd_2_3_qos: {
    id: 'ctd_2_3_qos', displayName: 'Quality Overall Summary (2.3)', chipLabel: 'QOS 2.3', primaryCode: '2.3',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.6,
    detectionPatterns: [/\b(?:qos|quality\s+overall\s+summary)\b/i, /\bctd\s+(?:section\s+)?2\.3\b/i, /\bmodule\s+2\.3\b/i],
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q1A–Q14 series', 'FDA CMC Guidance'],
    sections: [
      section('2.3.S Drug Substance', '2.3.S', true, [400, 800], 'Summarize drug-substance characterization, manufacture, controls, reference standards, container closure, stability.'),
      section('2.3.S.1 General Information', '2.3.S.1', true, [150, 300], 'INN/USAN, structure, molecular formula/weight, stereochemistry, physicochemical properties.'),
      section('2.3.S.2 Manufacture', '2.3.S.2', true, [200, 400], 'Manufacturer(s), process overview, critical steps/controls, reprocessing.'),
      section('2.3.S.4 Control of Drug Substance', '2.3.S.4', true, [200, 400], 'Specification, analytical procedures, validation, batch analyses, justification.'),
      section('2.3.P Drug Product', '2.3.P', true, [400, 800], 'Description, formulation development, manufacture, specifications, container closure, stability.'),
      section('2.3.P.5 Control of Drug Product', '2.3.P.5', true, [200, 400], 'Specifications, analytical procedures, validation, batch analyses, impurities.'),
      section('2.3.P.8 Stability', '2.3.P.8', true, [200, 400], 'Stability summary, post-approval protocol, storage conditions, shelf life.'),
    ],
  },
  ctd_2_4_nonclinical_overview: {
    id: 'ctd_2_4_nonclinical_overview', displayName: 'Nonclinical Overview (2.4)', chipLabel: 'Nonclinical Overview', primaryCode: '2.4',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.6,
    detectionPatterns: [/\bnonclinical\s+overview\b/i, /\bctd\s+(?:section\s+)?2\.4\b/i, /\bmodule\s+2\.4\b/i, /\bdraft\s+(?:a\s+)?2\.4\b/i],
    regulatoryReferences: ['ICH M4S(R2)', 'ICH S7A/S7B', 'ICH S9', 'FDA Pharm/Tox Guidance'],
    sections: [
      section('Overview of Nonclinical Testing Strategy', null, true, [200, 400], 'Rationale, species selection, GLP status, relationship to the clinical program.'),
      section('Pharmacology', null, true, [300, 600], 'Primary/secondary pharmacodynamics and safety pharmacology (CNS, CV, respiratory — ICH S7A/S7B).'),
      section('Pharmacokinetics', null, true, [300, 600], 'ADME across species; metabolite relevance, protein binding, exposure multiples vs clinical dose.'),
      section('Toxicology', null, true, [400, 800], 'Repeat-dose (NOAEL), genotoxicity, reproductive/developmental (ICH S5), carcinogenicity; safety margins at MRHD.'),
      section('Integrated Summary and Implications for Clinical Use', null, true, [200, 400], 'Synthesize findings vs starting dose, escalation, monitoring, labeling; residual uncertainties.'),
    ],
  },
  ctd_2_5_clinical_overview: {
    id: 'ctd_2_5_clinical_overview', displayName: 'Clinical Overview (2.5)', chipLabel: 'Clinical Overview', primaryCode: '2.5',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.55,
    detectionPatterns: [/\bclinical\s+overview\b/i, /\bctd\s+(?:section\s+)?2\.5\b/i, /\bmodule\s+2\.5\b/i, /\bdraft\s+(?:a\s+)?2\.5\b/i, /\bsection\s+2\.5\b/i],
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E3', 'ICH E8', 'FDA Benefit-Risk Framework'],
    sections: [
      section('2.5.1 Product Development Rationale', '2.5.1', true, [400, 700], 'Disease background, unmet need, mechanism rationale, overview of the clinical program design.'),
      section('2.5.2 Overview of Biopharmaceutics', '2.5.2', true, [200, 400], 'BA/BE, dissolution, food effect, formulation bridging linking clinical to commercial formulation.'),
      section('2.5.3 Overview of Clinical Pharmacology', '2.5.3', true, [300, 600], 'PK, PD, DDI, special populations, PK/PD relationships supporting the proposed dose and label.'),
      section('2.5.4 Overview of Efficacy', '2.5.4', true, [600, 1200], 'Pivotal results with CIs and p-values, primary/secondary endpoints, subgroup consistency, clinical meaningfulness.'),
      section('2.5.5 Overview of Safety', '2.5.5', true, [600, 1200], 'Exposure dataset, AEs by severity/relatedness, deaths, SAEs, discontinuations, labs, special-population safety, signals.'),
      section('2.5.6 Summary of Benefits and Risks', '2.5.6', true, [400, 800], 'Integrated benefit-risk assessment; weigh efficacy against identified risks; address uncertainties.'),
      section('2.5.7 Literature References', '2.5.7', false, [50, 100], 'Key published literature cited in this overview.'),
    ],
  },
  ctd_2_7_4_efficacy_summary: {
    id: 'ctd_2_7_4_efficacy_summary', displayName: 'Clinical Efficacy Summary (2.7.4)', chipLabel: 'Clinical Efficacy Summary', primaryCode: '2.7.4',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.6,
    detectionPatterns: [/\b(?:clinical\s+)?efficacy\s+summary\b/i, /\bsection\s+2\.7\.4\b/i, /\bctd\s+2\.7\.4\b/i, /\bmodule\s+2\.7\.4\b/i, /\bsummary\s+of\s+(?:clinical\s+)?efficacy\b/i],
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E9(R1)', 'ICH E17'],
    sections: [
      section('Background and Overview of Clinical Efficacy Studies', null, true, [200, 400], 'List of studies providing efficacy data by type (dose-finding, pivotal, supportive).'),
      section('Individual Study Results — Pivotal Trials', null, true, [800, 1500], 'Per pivotal trial: design, population, primary result (LS mean/OR/HR) with 95% CI and p-value, key secondary.'),
      section('Individual Study Results — Supportive Trials', null, false, [300, 600], 'Supportive/phase 2 results contributing to the efficacy profile.'),
      section('Analyses Across Studies', null, true, [300, 600], 'Pooled analyses, subgroup consistency, dose-response, time-to-response, durability.'),
      section('Conclusions on Clinical Efficacy', null, true, [200, 400], 'Synthesis linking all efficacy data to the proposed indication; residual uncertainties.'),
    ],
  },
  ctd_2_7_5_safety_summary: {
    id: 'ctd_2_7_5_safety_summary', displayName: 'Clinical Safety Summary (2.7.5)', chipLabel: 'Clinical Safety Summary', primaryCode: '2.7.5',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA', minConfidence: 0.6,
    detectionPatterns: [/\b(?:clinical\s+)?safety\s+summary\b/i, /\bsection\s+2\.7\.5\b/i, /\bctd\s+2\.7\.5\b/i, /\bmodule\s+2\.7\.5\b/i, /\bsummary\s+of\s+(?:clinical\s+)?safety\b/i, /\baggregate\s+safety\b/i],
    regulatoryReferences: ['ICH M4E(R2)', 'ICH E2E', 'ICH E2C(R2)', 'MedDRA'],
    sections: [
      section('Exposure to the Drug', null, true, [200, 400], 'Total subjects exposed, duration, dose groups, special populations; safety vs efficacy population.'),
      section('Adverse Events', null, true, [600, 1200], 'Overall AE incidence, deaths, SAEs, discontinuations; common AEs by MedDRA SOC/PT; dose-response.'),
      section('Deaths and Serious Adverse Events', null, true, [300, 600], 'Listing and analysis of all deaths and SAEs; causality; treatment vs control rates.'),
      section('Other Significant Adverse Events', null, true, [300, 600], 'Withdrawals, AEs of special interest, immune-mediated events, identified signals.'),
      section('Clinical Laboratory Evaluations', null, true, [200, 400], 'Clinically significant lab abnormalities (hematology, chemistry, urinalysis); shift tables.'),
      section('Safety in Special Populations', null, true, [200, 400], 'Renal/hepatic impairment, elderly, pediatric, sex, race/ethnicity differences.'),
      section('Conclusions on Clinical Safety', null, true, [200, 400], 'Safety profile summary; identified risks + risk management; residual uncertainties.'),
    ],
  },
  ind_investigator_brochure: {
    id: 'ind_investigator_brochure', displayName: "Investigator's Brochure (IB)", chipLabel: "Investigator's Brochure", primaryCode: 'IB',
    authority: 'ICH', submissionFamily: 'IND/CTA', minConfidence: 0.65,
    detectionPatterns: [/\binvestigator(?:'s|s)?\s+brochure\b/i, /\bdraft\s+(?:an?\s+)?ib\b/i, /\bwrite\s+(?:an?\s+)?investigator(?:'s|s)?\s+brochure\b/i],
    regulatoryReferences: ['ICH E6(R3)', 'ICH M4S / M4E', '21 CFR 312.23(a)(5)'],
    sections: [
      section('1. Summary', null, true, [300, 600], 'Pharmacological class, proposed indication, key nonclinical/clinical findings, guidance to the investigator.'),
      section('2. Introduction', null, true, [200, 400], 'Chemical name, INN/USAN, mechanism, therapeutic rationale, development stage.'),
      section('3. Physical, Chemical, and Pharmaceutical Properties', null, true, [200, 400], 'Physicochemical properties, clinical formulations, storage, handling.'),
      section('4. Nonclinical Studies', null, true, [800, 1500], 'Pharmacology, ADME, toxicology relevant to human safety; safety margins in exposure multiples.'),
      section('5. Effects in Humans', null, true, [600, 1200], 'PK/PD from phase 1, efficacy signals from phase 2, safety data; nonclinical-to-clinical PK correlation.'),
      section('6. Summary of Data and Guidance for the Investigator', null, true, [300, 600], 'Benefit-risk at current stage; monitoring, dose modification, AE management guidance.'),
    ],
  },
  ind_phase1_protocol: {
    id: 'ind_phase1_protocol', displayName: 'Phase 1 Clinical Protocol', chipLabel: 'Ph.1 Protocol', primaryCode: null,
    authority: 'FDA', submissionFamily: 'IND', minConfidence: 0.65,
    detectionPatterns: [/\bphase\s*[i1]\s+(?:clinical\s+)?protocol\b/i, /\bfirst.in.human\s+(?:clinical\s+)?protocol\b/i, /\bind\s+protocol\b/i, /\bfih\s+protocol\b/i],
    regulatoryReferences: ['ICH E6(R3)', 'ICH E8(R1)', '21 CFR 312.23', 'FDA Phase 1 Protocol Guidance'],
    sections: [
      section('1. Protocol Synopsis', null, true, [400, 700], 'Title, design, objectives, endpoints, population, dose range, duration, statistical approach.'),
      section('2. Introduction and Rationale', null, true, [300, 600], 'Disease background, unmet need, mechanism, nonclinical support, dose/schedule/route rationale.'),
      section('3. Objectives and Endpoints', null, true, [200, 400], 'Primary (safety/MTD/RP2D) and secondary (PK, PD, preliminary efficacy) objectives; measurable endpoints.'),
      section('4. Study Design', null, true, [300, 600], 'Design type (3+3, mTPI, BOIN), dose levels, escalation rules, DLT window, expansion cohorts.'),
      section('5. Selection of Subjects', null, true, [300, 600], 'Inclusion/exclusion criteria (disease, ECOG, organ function, prior therapy) — justify each.'),
      section('6. Treatment Plan', null, true, [300, 600], 'Administration, formulation, dose modifications, stopping rules, de/re-escalation, follow-up.'),
      section('7. Assessments', null, true, [300, 600], 'Safety (AE, DLT, labs, ECG, vitals), PK sampling, PD/biomarkers, efficacy if applicable.'),
      section('8. Statistical Considerations', null, true, [200, 400], 'Size justification, MTD determination method, PK/PD plan, missing-data handling.'),
      section('9. Regulatory, Ethical, and Administrative Information', null, true, [150, 300], 'IRB/IEC, informed consent, responsibilities, safety reporting (SUSAR 7/15 day).'),
    ],
  },
  cmc_drug_substance: {
    id: 'cmc_drug_substance', displayName: 'CMC Drug Substance (3.2.S)', chipLabel: 'CMC Drug Substance', primaryCode: '3.2.S',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA/IND', minConfidence: 0.65,
    detectionPatterns: [/\b(?:cmc\s+)?drug\s+substance\s+(?:section|module|document|narrative)\b/i, /\bmodule\s+3\.2\.s\b/i, /\bsection\s+3\.2\.s\b/i, /\bcmc\s+(?:drug\s+)?substance\b/i],
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q3A', 'ICH Q6A', 'ICH Q7', 'ICH Q11'],
    sections: [
      section('3.2.S.1 General Information', '3.2.S.1', true, [150, 300], 'INN/USAN, IUPAC name, CAS, molecular formula/weight, structure, physicochemical properties.'),
      section('3.2.S.2 Manufacture', '3.2.S.2', true, [400, 800], 'Manufacturer(s), synthetic route, in-process controls, critical parameters, process validation.'),
      section('3.2.S.3 Characterization', '3.2.S.3', true, [300, 600], 'Structure elucidation (NMR/IR/MS), characterization, impurity profile (ICH Q3A, Q3C).'),
      section('3.2.S.4 Control of Drug Substance', '3.2.S.4', true, [400, 800], 'Specification with acceptance criteria (Q6A), analytical procedures, validation (Q2(R2)), batch analyses.'),
      section('3.2.S.5 Reference Standards or Materials', '3.2.S.5', true, [100, 200], 'Primary/working reference standard characterization, qualification, storage.'),
      section('3.2.S.6 Container Closure System', '3.2.S.6', true, [100, 200], 'Primary/secondary packaging, materials, compatibility, extractables/leachables.'),
      section('3.2.S.7 Stability', '3.2.S.7', true, [300, 600], 'Stability summary (Q1A), degradation pathway, post-approval protocol, shelf life/retest period.'),
    ],
  },
  cmc_drug_product: {
    id: 'cmc_drug_product', displayName: 'CMC Drug Product (3.2.P)', chipLabel: 'CMC Drug Product', primaryCode: '3.2.P',
    authority: 'ICH', submissionFamily: 'NDA/BLA/MAA/IND', minConfidence: 0.65,
    detectionPatterns: [/\b(?:cmc\s+)?drug\s+product\s+(?:section|module|document|narrative)\b/i, /\bmodule\s+3\.2\.p\b/i, /\bsection\s+3\.2\.p\b/i, /\bcmc\s+(?:drug\s+)?product\b/i, /\bfinished\s+(?:dosage\s+form|product)\s+cmc\b/i],
    regulatoryReferences: ['ICH M4Q(R1)', 'ICH Q3B', 'ICH Q6A', 'ICH Q8(R2)', 'ICH Q10'],
    sections: [
      section('3.2.P.1 Description and Composition', '3.2.P.1', true, [150, 300], 'Dosage form, route, quantitative composition per unit, components, container closure.'),
      section('3.2.P.2 Pharmaceutical Development', '3.2.P.2', true, [400, 800], 'Formulation development (Q8), excipient selection, CPPs/CQAs/QTPP, microbiological attributes.'),
      section('3.2.P.3 Manufacture', '3.2.P.3', true, [300, 600], 'Manufacturer(s), batch formula, process (flow + narrative), critical-step controls, validation.'),
      section('3.2.P.4 Control of Excipients', '3.2.P.4', true, [100, 200], 'Specifications for non-compendial excipients; compendial compliance; novel excipients.'),
      section('3.2.P.5 Control of Drug Product', '3.2.P.5', true, [400, 800], 'Specification with basis, analytical procedures, validation (Q2(R2)), batch analyses, impurities.'),
      section('3.2.P.7 Container Closure System', '3.2.P.7', true, [150, 300], 'Components, materials, quality standards, extractables/leachables, suitability.'),
      section('3.2.P.8 Stability', '3.2.P.8', true, [300, 600], 'Stability summary (Q1A/Q1E), in-use + photostability (Q1B), post-approval protocol, shelf life.'),
    ],
  },
  fda_510k_se_statement: {
    id: 'fda_510k_se_statement', displayName: '510(k) Substantial Equivalence Statement', chipLabel: '510(k) SE Statement', primaryCode: null,
    authority: 'FDA', submissionFamily: '510(k)', minConfidence: 0.65,
    detectionPatterns: [/\b510\(?k\)?\s+(?:substantial\s+equivalence|se)\s+statement\b/i, /\bsubstantial\s+equivalence\s+(?:statement|summary|discussion)\b/i, /\b510\(?k\)?\s+summary\b/i, /\bwrite\s+(?:a\s+)?510\(?k\)?\b/i],
    regulatoryReferences: ['21 CFR 807.87(f)', 'FDA 510(k) Program Guidance (2019)', 'FDA SE Decision-Making Flowchart'],
    sections: [
      section('Device Description', null, true, [200, 400], 'Intended use, indications for use, key design features, materials, principle of operation.'),
      section('Predicate Device Identification', null, true, [150, 300], 'Predicate trade name, manufacturer, 510(k) number, cleared indications; justify selection.'),
      section('Intended Use Comparison', null, true, [150, 300], 'Side-by-side subject vs predicate intended use; establish equivalence or explain differences.'),
      section('Technological Characteristics Comparison', null, true, [400, 800], 'Feature-by-feature comparison table; for each difference, do new safety/effectiveness questions arise?'),
      section('Performance Testing Summary', null, true, [300, 600], 'Bench, animal, clinical, software validation demonstrating at least as safe/effective; cite ASTM/ISO/IEC.'),
      section('Biocompatibility Assessment', null, true, [150, 300], 'ISO 10993-1 risk-based assessment; contact type/duration; tests performed.'),
      section('Substantial Equivalence Conclusion', null, true, [100, 200], 'Declarative SE statement: same intended use + characteristics not raising new questions.'),
    ],
  },
  pma_summary_safety_effectiveness: {
    id: 'pma_summary_safety_effectiveness', displayName: 'PMA Summary of Safety and Effectiveness', chipLabel: 'SSED (PMA)', primaryCode: null,
    authority: 'FDA', submissionFamily: 'PMA', minConfidence: 0.70,
    detectionPatterns: [/\bpma\s+(?:summary|ssed)\b/i, /\bsummary\s+of\s+safety\s+and\s+effectiveness\b/i, /\bssed\b/i, /\bpremarket\s+approval\s+summary\b/i],
    regulatoryReferences: ['21 CFR 814.20(b)(8)', 'FDA PMA Decision-Making Guidance', 'FDA Benefit-Risk Framework for Devices'],
    sections: [
      section('1. General Information', null, true, [150, 300], 'Trade name, applicant, manufacturer, generic name, classification, indication, device overview.'),
      section('2. Indications for Use', null, true, [100, 200], 'Exact FDA-reviewed indication; population, clinical conditions, anatomical site, environment.'),
      section('3. Device Description', null, true, [300, 600], 'Principle of operation, design features, materials, sizes, accessories, sterilization, shelf life.'),
      section('4. Preclinical Studies', null, true, [400, 800], 'Bench, fatigue, wear, electrical safety (IEC 60601), biocompatibility (ISO 10993), software (IEC 62304).'),
      section('5. Clinical Studies', null, true, [600, 1200], 'Pivotal design, endpoints with success criteria, SAP, subjects, safety/effectiveness results, device-related AEs.'),
      section('6. Benefit-Risk Determination', null, true, [300, 600], 'Quantify benefit, characterize risks, contextualize vs alternatives; FDA benefit-risk framework.'),
      section('7. Conclusions', null, true, [100, 200], 'Safe and effective statement for the indication; conditions of approval / post-approval studies.'),
    ],
  },
  clinical_study_report: {
    id: 'clinical_study_report', displayName: 'Clinical Study Report (CSR)', chipLabel: 'Clinical Study Report', primaryCode: null,
    authority: 'ICH', submissionFamily: 'IND/NDA/BLA/MAA', minConfidence: 0.65,
    detectionPatterns: [/\bclinical\s+study\s+report\b/i, /\bcsr\s+(?:draft|template|section|outline)\b/i, /\bdraft\s+(?:a\s+)?csr\b/i, /\bich\s+e3\s+(?:report|csr|outline)\b/i],
    regulatoryReferences: ['ICH E3', 'ICH E6(R3)', 'ICH E9(R1)', 'ICH E19'],
    sections: [
      section('2. Synopsis', null, true, [600, 1200], 'Structured summary: objectives, design, patients, efficacy results, safety results, conclusions.'),
      section('7. Introduction', null, true, [300, 600], 'Disease background, development rationale, nonclinical support, prior experience, study objectives.'),
      section('9. Investigational Plan', null, true, [500, 1000], 'Design, subject selection, treatments, dosing, assessment schedule, statistics, protocol deviations.'),
      section('10. Study Patients', null, true, [300, 600], 'Disposition of all randomized patients, deviations, demographics and baseline characteristics.'),
      section('11. Efficacy Evaluation', null, true, [800, 1500], 'Data sets (ITT/PP/safety), primary endpoint (95% CI + p-value), key secondary, subgroups, methods.'),
      section('12. Safety Evaluation', null, true, [600, 1200], 'Exposure, AEs by MedDRA SOC/PT, deaths, SAEs, discontinuations, labs, vitals, ECG, signals.'),
      section('13. Discussion and Conclusions', null, true, [400, 800], 'Integrated interpretation of efficacy and safety; what the study establishes; implications.'),
    ],
  },
  dsur: {
    id: 'dsur', displayName: 'Development Safety Update Report (DSUR)', chipLabel: 'DSUR', primaryCode: null,
    authority: 'ICH', submissionFamily: 'IND/CTA', minConfidence: 0.70,
    detectionPatterns: [/\bdsur\b/i, /\bdevelopment\s+safety\s+update\s+(?:report|annual)\b/i, /\bind\s+annual\s+report\b/i],
    regulatoryReferences: ['ICH E2F', '21 CFR 312.33', 'FDA Safety Reporting Guidance (2012)'],
    sections: [
      section('3. Actions Taken for Safety Reasons', null, true, [200, 400], 'Clinical holds, safety protocol amendments, labeling revisions, withdrawals during the period.'),
      section('5. Clinical Study/Trial Patient Exposure', null, true, [200, 400], 'Patient exposure across ongoing and completed studies during the period.'),
      section('7. Significant Findings from Clinical Studies', null, true, [300, 600], 'Significant efficacy/safety findings, new signals, new information affecting benefit-risk.'),
      section('12. Summary of Significant Risks', null, true, [200, 400], 'Cumulative identified risks (labeled/unlabeled) and risks under investigation.'),
      section('13. Overall Safety Evaluation', null, true, [300, 600], 'Integrated benefit-risk for the current stage; adequacy of risk minimization.'),
      section('14. Conclusions', null, true, [100, 200], 'Key conclusions on subject safety during the period; recommended actions.'),
    ],
  },
  fda_type_b_meeting_package: {
    id: 'fda_type_b_meeting_package', displayName: 'FDA Type B Meeting Request Package', chipLabel: 'Type B Meeting Package', primaryCode: null,
    authority: 'FDA', submissionFamily: 'IND/NDA/BLA', minConfidence: 0.70,
    detectionPatterns: [/\btype\s*b\s+meeting\s+(?:package|request|briefing)\b/i, /\bend\s+of\s+phase\s*[12]\s+meeting\b/i, /\beop[12]\s+meeting\b/i, /\bpre.?(?:ind|nda|bla)\s+meeting\s+(?:package|request)\b/i, /\bfda\s+meeting\s+(?:package|briefing\s+document)\b/i],
    regulatoryReferences: ['FDA Formal Meetings Guidance (2017)', '21 CFR 312.47', 'PDUFA Letter'],
    sections: [
      section('Cover Letter and Meeting Request', null, true, [150, 300], 'Meeting type, proposed date, format (in-person/teleconference), sponsor contact.'),
      section('Product Description and Development Status', null, true, [200, 400], 'Drug name, INN, class, indication, current phase, IND number.'),
      section('Background', null, true, [500, 1000], 'Nonclinical program, completed clinical studies, key findings; what is established vs uncertain.'),
      section('Meeting Objectives', null, true, [100, 200], 'One paragraph on what the sponsor hopes to achieve — not the questions themselves.'),
      section('Specific Questions for FDA', null, true, [300, 600], 'Numbered specific, answerable questions: brief context + sponsor position + constrained ask.'),
      section('Proposed Agenda', null, true, [100, 200], 'Time-boxed agenda mapped to the questions.'),
    ],
  },
};

export interface DocumentDetectionResult {
  id: string;
  displayName: string;
  chipLabel: string;
  primaryCode: string | null;
  authority: string;
  submissionFamily: string;
  confidence: number;
  minConfidence: number;
  regulatoryReferences: string[];
  sections: TemplateSection[];
  sectionsSource: 'fixture';
}

/* Phrase-level detection — faithful client mirror of detectDocumentTemplate().
   Real detection is server-side (SSE orchestration event); this mirrors it for
   the design when no backend is present. Multi-pattern scoring: a specific
   phrase/section-code match scores high; a single weak match scores low; below
   0.1 → null (no document context, per the confidence gate, commit c53cc22). */
export function detectDocumentTemplate(text: string | null | undefined): DocumentDetectionResult | null {
  if (!text || typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length < 3) return null;
  /* A specific signal in the REQUEST ITSELF — an ICH/FDA code or a full document
     name — makes a match high-confidence. Tested against the user's text. */
  const specificRe = /\b2\.2\b|\b2\.3\b|\b2\.4\b|\b2\.5\b|\b2\.7\.[45]\b|\b3\.2\.[sp]\b|510\(?k\)?|\bssed\b|\bdsur\b|clinical\s+overview|clinical\s+study\s+report|nonclinical\s+overview|investigator.?s?\s+brochure|quality\s+overall\s+summary|drug\s+substance|drug\s+product|efficacy\s+summary|safety\s+summary|type\s*b\s+meeting|phase\s*[i1]\s+protocol|substantial\s+equivalence/i;
  let best: DocTemplate | null = null;
  let bestScore = 0;
  Object.values(ANA_DOC_TEMPLATES).forEach((tpl) => {
    const matches = tpl.detectionPatterns.filter((re) => re.test(t));
    if (!matches.length) return;
    const strong = specificRe.test(t);
    // Strong (specific code/name present) → assert; otherwise → uncertain band.
    const score = strong ? Math.min(0.95, 0.7 + 0.12 * (matches.length - 1)) : 0.34;
    if (score > bestScore) { bestScore = score; best = tpl; }
  });
  if (!best || bestScore < 0.1) return null;
  const winner: DocTemplate = best;
  return {
    id: winner.id, displayName: winner.displayName, chipLabel: winner.chipLabel,
    primaryCode: winner.primaryCode, authority: winner.authority,
    submissionFamily: winner.submissionFamily, confidence: Math.round(bestScore * 100) / 100,
    minConfidence: winner.minConfidence, regulatoryReferences: winner.regulatoryReferences,
    sections: winner.sections,       // offline mirror of the live sections[] (merged PR #1005)
    sectionsSource: 'fixture',       // 'live' when bound from the orchestration event
  };
}

/* Legacy window bridge — ConversationThread.tsx reads
   `(window as any).detectDocumentTemplate` until it imports this module
   directly; keep both live in sync. */
if (typeof window !== 'undefined') {
  (window as any).ANA_DOC_TEMPLATES = ANA_DOC_TEMPLATES;
  (window as any).detectDocumentTemplate = detectDocumentTemplate;
}
