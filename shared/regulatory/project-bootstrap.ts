/**
 * Project Bootstrap — Registry-driven project initialization.
 *
 * When a project is created, this module determines:
 * 1. Which section/dossier blueprint to use
 * 2. Which templates to pre-select
 * 3. Which milestones/tasks to generate
 * 4. What readiness expectations to set
 *
 * All driven by the Global Regulatory Registry — no switch statements.
 *
 * @module shared/regulatory/project-bootstrap
 */

import type {
  RegulatoryApplicationType,
  SectionBlueprint,
  SectionDefinition,
  TaskBlueprint,
  MilestoneDefinition,
} from './document-taxonomy';

// ─── Section Blueprints ───────────────────────────────────────────────────────

/** CTD Module 1-5 section blueprint (used by IND, NDA, BLA, MAA, etc.) */
const CTD_SECTIONS: SectionDefinition[] = [
  { code: '1.1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '1.2', title: 'Administrative Forms', module: 1, required: true, contentType: 'form' },
  { code: '1.5', title: 'Table of Contents', module: 1, required: true, contentType: 'list' },
  { code: '2.2', title: 'Introduction', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4' },
  { code: '2.3', title: 'Quality Overall Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '2.4', title: 'Nonclinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.5', title: 'Clinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4E(R2)' },
  { code: '2.6', title: 'Nonclinical Summaries', module: 2, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '2.7', title: 'Clinical Summary', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '3.2.S', title: 'Drug Substance', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P', title: 'Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.A', title: 'Appendices', module: 3, required: false, contentType: 'mixed' },
  { code: '4.2.1', title: 'Pharmacology', module: 4, required: true, contentType: 'narrative', guidance: 'ICH S7A/S7B' },
  { code: '4.2.2', title: 'Pharmacokinetics', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S3A/S3B' },
  { code: '4.2.3', title: 'Toxicology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '5.3', title: 'Clinical Study Reports', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.4', title: 'Literature References', module: 5, required: true, contentType: 'list' },
];

/** Device submission sections (510(k), PMA) */
const DEVICE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Indications for Use', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Device Description', module: 1, required: true, contentType: 'mixed' },
  { code: '4', title: 'Substantial Equivalence', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'Performance Testing', module: 1, required: true, contentType: 'data' },
  { code: '6', title: 'Biocompatibility', module: 1, required: false, contentType: 'data' },
  { code: '7', title: 'Software Documentation', module: 1, required: false, contentType: 'mixed' },
  { code: '8', title: 'Labeling', module: 1, required: true, contentType: 'narrative' },
  { code: '9', title: 'Clinical Data', module: 1, required: false, contentType: 'data' },
  { code: '10', title: 'Summary', module: 1, required: true, contentType: 'narrative' },
];

/**
 * Pre-IND meeting (Type B) briefing package sections. This is a meeting/briefing
 * document, not a CTD dossier, so it has its own structure per the FDA "Formal
 * Meetings Between the FDA and Sponsors" guidance and 21 CFR 312.82.
 */
const PRE_IND_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Meeting Request Letter', module: 1, required: true, contentType: 'narrative', guidance: '21 CFR 312.82' },
  { code: '2', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Product Development Background', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Proposed Nonclinical Program Summary', module: 1, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '5', title: 'Proposed Clinical Development Plan', module: 1, required: true, contentType: 'narrative', guidance: 'ICH E8(R1)' },
  { code: '6', title: 'CMC Summary', module: 1, required: false, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '7', title: 'Proposed Questions for FDA', module: 1, required: true, contentType: 'list' },
  { code: '8', title: 'References', module: 1, required: false, contentType: 'list' },
];

/** CER sections (EU MDR) */
const CER_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Executive Summary', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Scope of Clinical Evaluation', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Clinical Background', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Clinical Evidence', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Post-Market Data', module: 1, required: true, contentType: 'data' },
  { code: '6', title: 'Risk-Benefit Analysis', module: 1, required: true, contentType: 'narrative' },
  { code: '7', title: 'Conclusions', module: 1, required: true, contentType: 'narrative' },
];

// ─── Clinical Document Blueprints (ICH-harmonised) ────────────────────────────

/** Clinical Study Report — ICH E3 structure. */
const CSR_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Title Page', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E3' },
  { code: '2', title: 'Synopsis', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E3' },
  { code: '3', title: 'Table of Contents', module: 5, required: true, contentType: 'list' },
  { code: '4', title: 'List of Abbreviations and Definitions', module: 5, required: false, contentType: 'list' },
  { code: '5', title: 'Ethics (IEC/IRB, Ethical Conduct, Informed Consent)', module: 5, required: true, contentType: 'narrative' },
  { code: '6', title: 'Investigators and Study Administrative Structure', module: 5, required: true, contentType: 'narrative' },
  { code: '7', title: 'Introduction', module: 5, required: true, contentType: 'narrative' },
  { code: '8', title: 'Study Objectives', module: 5, required: true, contentType: 'narrative' },
  { code: '9', title: 'Investigational Plan (Design, Population, Treatments)', module: 5, required: true, contentType: 'mixed' },
  { code: '10', title: 'Study Patients (Disposition, Deviations)', module: 5, required: true, contentType: 'mixed' },
  { code: '11', title: 'Efficacy Evaluation', module: 5, required: true, contentType: 'mixed' },
  { code: '12', title: 'Safety Evaluation', module: 5, required: true, contentType: 'mixed' },
  { code: '13', title: 'Discussion and Overall Conclusions', module: 5, required: true, contentType: 'narrative' },
  { code: '14', title: 'Tables, Figures and Graphs Referred to but Not Included in the Text', module: 5, required: false, contentType: 'table' },
  { code: '15', title: 'Reference List', module: 5, required: true, contentType: 'list' },
  { code: '16', title: 'Appendices (Protocol, SAP, Sample CRF, Listings)', module: 5, required: true, contentType: 'mixed' },
];

/** Clinical trial protocol — ICH E6(R2) §6 structure. */
const PROTOCOL_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'General Information', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E6(R2)' },
  { code: '2', title: 'Background Information', module: 5, required: true, contentType: 'narrative' },
  { code: '3', title: 'Trial Objectives and Purpose', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Trial Design', module: 5, required: true, contentType: 'mixed' },
  { code: '5', title: 'Selection and Withdrawal of Subjects', module: 5, required: true, contentType: 'narrative' },
  { code: '6', title: 'Treatment of Subjects', module: 5, required: true, contentType: 'narrative' },
  { code: '7', title: 'Assessment of Efficacy', module: 5, required: true, contentType: 'mixed' },
  { code: '8', title: 'Assessment of Safety', module: 5, required: true, contentType: 'mixed' },
  { code: '9', title: 'Statistics', module: 5, required: true, contentType: 'mixed', guidance: 'ICH E9' },
  { code: '10', title: 'Direct Access to Source Data/Documents', module: 5, required: true, contentType: 'narrative' },
  { code: '11', title: 'Quality Control and Quality Assurance', module: 5, required: true, contentType: 'narrative' },
  { code: '12', title: 'Ethics', module: 5, required: true, contentType: 'narrative' },
  { code: '13', title: 'Data Handling and Record Keeping', module: 5, required: true, contentType: 'narrative' },
  { code: '14', title: 'Financing and Insurance', module: 5, required: false, contentType: 'narrative' },
  { code: '15', title: 'Publication Policy', module: 5, required: false, contentType: 'narrative' },
];

/** Investigator's Brochure — ICH E6(R2) §7 structure. */
const IB_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Title Page', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E6(R2) §7' },
  { code: '2', title: 'Confidentiality Statement', module: 5, required: false, contentType: 'narrative' },
  { code: '3', title: 'Table of Contents', module: 5, required: true, contentType: 'list' },
  { code: '4', title: 'Summary', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Introduction', module: 5, required: true, contentType: 'narrative' },
  { code: '6', title: 'Physical, Chemical and Pharmaceutical Properties and Formulation', module: 5, required: true, contentType: 'mixed' },
  { code: '7', title: 'Nonclinical Studies (Pharmacology, PK, Toxicology)', module: 5, required: true, contentType: 'mixed' },
  { code: '8', title: 'Effects in Humans (PK, Safety, Efficacy, Marketing Experience)', module: 5, required: true, contentType: 'mixed' },
  { code: '9', title: 'Summary of Data and Guidance for the Investigator', module: 5, required: true, contentType: 'narrative' },
];

/** Statistical Analysis Plan — ICH E9 structure. */
const SAP_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Introduction', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E9' },
  { code: '2', title: 'Study Objectives and Endpoints', module: 5, required: true, contentType: 'narrative' },
  { code: '3', title: 'Study Design and Randomisation', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Analysis Populations', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Sample Size Determination', module: 5, required: true, contentType: 'mixed' },
  { code: '6', title: 'Statistical Methods', module: 5, required: true, contentType: 'mixed' },
  { code: '7', title: 'Handling of Missing Data', module: 5, required: true, contentType: 'narrative' },
  { code: '8', title: 'Multiplicity Adjustment', module: 5, required: false, contentType: 'narrative' },
  { code: '9', title: 'Interim Analyses and Data Monitoring', module: 5, required: false, contentType: 'narrative' },
  { code: '10', title: 'Sensitivity and Supplementary Analyses', module: 5, required: false, contentType: 'narrative' },
];

// ─── CMC / Quality Blueprints (ICH M4Q / M2.3) ────────────────────────────────

/** Quality Overall Summary — CTD Module 2.3. */
const QOS_SECTIONS: SectionDefinition[] = [
  { code: '2.3.I', title: 'Introduction', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '2.3.S', title: 'Drug Substance', module: 2, required: true, contentType: 'mixed' },
  { code: '2.3.P', title: 'Drug Product', module: 2, required: true, contentType: 'mixed' },
  { code: '2.3.A', title: 'Appendices (Facilities, Adventitious Agents, Excipients)', module: 2, required: false, contentType: 'mixed' },
  { code: '2.3.R', title: 'Regional Information', module: 2, required: false, contentType: 'mixed' },
];

/** Drug Substance — CTD Module 3.2.S. */
const M3_DS_SECTIONS: SectionDefinition[] = [
  { code: '3.2.S.1', title: 'General Information (Nomenclature, Structure, Properties)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.2', title: 'Manufacture (Manufacturer, Process, Controls, Validation)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.3', title: 'Characterisation (Structure Elucidation, Impurities)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.4', title: 'Control of Drug Substance (Specification, Methods, Validation)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.5', title: 'Reference Standards or Materials', module: 3, required: true, contentType: 'data' },
  { code: '3.2.S.6', title: 'Container Closure System', module: 3, required: true, contentType: 'narrative' },
  { code: '3.2.S.7', title: 'Stability', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A(R2)' },
];

/** Drug Product — CTD Module 3.2.P. */
const M3_DP_SECTIONS: SectionDefinition[] = [
  { code: '3.2.P.1', title: 'Description and Composition of the Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P.2', title: 'Pharmaceutical Development', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q8(R2)' },
  { code: '3.2.P.3', title: 'Manufacture (Batch Formula, Process, Controls, Validation)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.P.4', title: 'Control of Excipients', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.P.5', title: 'Control of Drug Product (Specification, Methods, Validation)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.P.6', title: 'Reference Standards or Materials', module: 3, required: true, contentType: 'data' },
  { code: '3.2.P.7', title: 'Container Closure System', module: 3, required: true, contentType: 'narrative' },
  { code: '3.2.P.8', title: 'Stability', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A(R2)' },
];

// ─── Safety / Pharmacovigilance Blueprints ────────────────────────────────────

/** IND Safety Report — 21 CFR 312.32 (expedited SUSAR). */
const IND_SAFETY_REPORT_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter / Notification (7-day or 15-day)', module: 5, required: true, contentType: 'narrative', guidance: '21 CFR 312.32' },
  { code: '2', title: 'Suspected Adverse Reaction Description (ICSR)', module: 5, required: true, contentType: 'mixed' },
  { code: '3', title: 'Assessment of Causality', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Assessment of Expectedness (vs. IB/Protocol)', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Analysis of Similar Events / Aggregate Assessment', module: 5, required: false, contentType: 'mixed' },
  { code: '6', title: 'Follow-up Information', module: 5, required: false, contentType: 'narrative' },
];

/** IND Annual Report — 21 CFR 312.33. */
const IND_ANNUAL_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter', module: 5, required: true, contentType: 'narrative', guidance: '21 CFR 312.33' },
  { code: '2', title: 'Individual Study Information (Status, Enrollment)', module: 5, required: true, contentType: 'mixed' },
  { code: '3', title: 'Summary of Clinical Safety Information', module: 5, required: true, contentType: 'mixed' },
  { code: '4', title: 'Summary of Nonclinical Studies Completed', module: 5, required: false, contentType: 'narrative' },
  { code: '5', title: 'Summary of CMC / Manufacturing Changes', module: 5, required: false, contentType: 'narrative' },
  { code: '6', title: 'General Investigational Plan for the Coming Year', module: 5, required: true, contentType: 'narrative' },
  { code: '7', title: 'Foreign Marketing Developments', module: 5, required: false, contentType: 'narrative' },
];

/** Development Safety Update Report — ICH E2F. */
const DSUR_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Introduction', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E2F' },
  { code: '2', title: 'Worldwide Marketing Approval Status', module: 5, required: true, contentType: 'narrative' },
  { code: '3', title: 'Actions Taken for Safety Reasons', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Changes to Reference Safety Information', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Inventory of Clinical Trials Ongoing/Completed', module: 5, required: true, contentType: 'table' },
  { code: '6', title: 'Estimated Cumulative Exposure', module: 5, required: true, contentType: 'table' },
  { code: '7', title: 'Line Listings and Summary Tabulations', module: 5, required: true, contentType: 'table' },
  { code: '8', title: 'Significant Findings from Clinical Trials', module: 5, required: true, contentType: 'mixed' },
  { code: '9', title: 'Overall Safety Assessment and Benefit-Risk', module: 5, required: true, contentType: 'narrative' },
  { code: '10', title: 'Summary of Important Risks', module: 5, required: true, contentType: 'narrative' },
  { code: '11', title: 'Conclusions', module: 5, required: true, contentType: 'narrative' },
];

/** Periodic Safety Update Report / PBRER — ICH E2C(R2). */
const PSUR_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Introduction', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E2C(R2)' },
  { code: '2', title: 'Worldwide Marketing Authorization Status', module: 5, required: true, contentType: 'narrative' },
  { code: '3', title: 'Actions Taken for Safety Reasons', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Changes to Reference Safety Information', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Estimated Exposure and Use Patterns', module: 5, required: true, contentType: 'table' },
  { code: '6', title: 'Data in Summary Tabulations', module: 5, required: true, contentType: 'table' },
  { code: '7', title: 'Signal and Risk Evaluation', module: 5, required: true, contentType: 'mixed' },
  { code: '8', title: 'Benefit Evaluation', module: 5, required: true, contentType: 'narrative' },
  { code: '9', title: 'Integrated Benefit-Risk Analysis', module: 5, required: true, contentType: 'narrative' },
  { code: '10', title: 'Conclusions and Actions', module: 5, required: true, contentType: 'narrative' },
];

/** Risk Evaluation and Mitigation Strategy — FDA REMS. */
const REMS_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'REMS Goals', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Medication Guide / Patient Package Insert', module: 1, required: false, contentType: 'narrative' },
  { code: '3', title: 'Communication Plan', module: 1, required: false, contentType: 'narrative' },
  { code: '4', title: 'Elements to Assure Safe Use (ETASU)', module: 1, required: false, contentType: 'mixed' },
  { code: '5', title: 'Implementation System', module: 1, required: false, contentType: 'narrative' },
  { code: '6', title: 'Timetable for Submission of Assessments', module: 1, required: true, contentType: 'narrative' },
];

/** EU Risk Management Plan — GVP Module V. */
const RMP_SECTIONS: SectionDefinition[] = [
  { code: 'I', title: 'Product Overview', module: 1, required: true, contentType: 'narrative', guidance: 'EU GVP Module V' },
  { code: 'II', title: 'Safety Specification', module: 1, required: true, contentType: 'mixed' },
  { code: 'III', title: 'Pharmacovigilance Plan', module: 1, required: true, contentType: 'narrative' },
  { code: 'IV', title: 'Plans for Post-Authorisation Efficacy Studies', module: 1, required: false, contentType: 'narrative' },
  { code: 'V', title: 'Risk Minimisation Measures', module: 1, required: true, contentType: 'mixed' },
  { code: 'VI', title: 'Summary of the Risk Management Plan', module: 1, required: true, contentType: 'narrative' },
  { code: 'VII', title: 'Annexes', module: 1, required: false, contentType: 'mixed' },
];

/** Expedited designation request package (Fast Track / Breakthrough / RMAT). */
const DESIGNATION_REQUEST_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter and Request Statement', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Product Description and Proposed Indication', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Serious or Life-Threatening Condition Justification', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Unmet Medical Need Analysis', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'Preliminary Clinical Evidence (Breakthrough/RMAT)', module: 1, required: false, contentType: 'mixed' },
  { code: '6', title: 'Development Plan and Requested Features', module: 1, required: true, contentType: 'narrative' },
];

/** Orphan Drug Designation request. */
const ORPHAN_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Administrative Information and Sponsor', module: 1, required: true, contentType: 'form' },
  { code: '2', title: 'Rare Disease/Condition and Proposed Use', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Scientific Rationale (Drug Description, Mechanism)', module: 1, required: true, contentType: 'mixed' },
  { code: '4', title: 'Prevalence Estimate with Supporting References', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Regulatory Status and Marketing History', module: 1, required: false, contentType: 'narrative' },
  { code: '6', title: 'Scientific Literature and References', module: 1, required: true, contentType: 'list' },
];

const SECTION_BLUEPRINTS: Record<string, SectionBlueprint> = {
  // US Pre-submission
  us_pre_ind_sections: { id: 'us_pre_ind_sections', name: 'Pre-IND Meeting Briefing Package', sections: PRE_IND_SECTIONS },

  // Clinical document components (ICH-harmonised)
  ich_csr_sections: { id: 'ich_csr_sections', name: 'Clinical Study Report (ICH E3)', sections: CSR_SECTIONS },
  ich_protocol_sections: { id: 'ich_protocol_sections', name: 'Clinical Protocol (ICH E6)', sections: PROTOCOL_SECTIONS },
  ich_ib_sections: { id: 'ich_ib_sections', name: "Investigator's Brochure (ICH E6 §7)", sections: IB_SECTIONS },
  ich_sap_sections: { id: 'ich_sap_sections', name: 'Statistical Analysis Plan (ICH E9)', sections: SAP_SECTIONS },

  // CMC / Quality components
  ich_qos_sections: { id: 'ich_qos_sections', name: 'Quality Overall Summary (M2.3)', sections: QOS_SECTIONS },
  ich_m3_ds_sections: { id: 'ich_m3_ds_sections', name: 'Drug Substance (M3.2.S)', sections: M3_DS_SECTIONS },
  ich_m3_dp_sections: { id: 'ich_m3_dp_sections', name: 'Drug Product (M3.2.P)', sections: M3_DP_SECTIONS },

  // Safety / pharmacovigilance
  us_ind_sr_sections: { id: 'us_ind_sr_sections', name: 'IND Safety Report (21 CFR 312.32)', sections: IND_SAFETY_REPORT_SECTIONS },
  us_ind_annual_sections: { id: 'us_ind_annual_sections', name: 'IND Annual Report (21 CFR 312.33)', sections: IND_ANNUAL_SECTIONS },
  ich_dsur_sections: { id: 'ich_dsur_sections', name: 'Development Safety Update Report (ICH E2F)', sections: DSUR_SECTIONS },
  eu_psur_sections: { id: 'eu_psur_sections', name: 'PSUR / PBRER (ICH E2C(R2))', sections: PSUR_SECTIONS },
  us_rems_sections: { id: 'us_rems_sections', name: 'Risk Evaluation & Mitigation Strategy (REMS)', sections: REMS_SECTIONS },
  eu_rmp_sections: { id: 'eu_rmp_sections', name: 'EU Risk Management Plan (GVP Module V)', sections: RMP_SECTIONS },

  // Post-approval supplements / variations (full CTD, all required)
  us_nda_supp_sections: { id: 'us_nda_supp_sections', name: 'NDA/BLA Supplement (CTD)', sections: CTD_SECTIONS.map(sec => ({ ...sec, required: true })) },
  us_bla_supp_sections: { id: 'us_bla_supp_sections', name: 'BLA Supplement (CTD)', sections: CTD_SECTIONS.map(sec => ({ ...sec, required: true })) },
  us_cbe_sections: { id: 'us_cbe_sections', name: 'CBE-30 / CBE-0 Supplement', sections: CTD_SECTIONS.filter(sec => ['1.1', '1.2', '2.3', '3.2.S', '3.2.P'].includes(sec.code)) },
  us_nda_annual_sections: { id: 'us_nda_annual_sections', name: 'Annual Report (NDA/BLA)', sections: IND_ANNUAL_SECTIONS },

  // Expedited designations
  us_fast_track_sections: { id: 'us_fast_track_sections', name: 'Fast Track Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },
  us_btd_sections: { id: 'us_btd_sections', name: 'Breakthrough Therapy Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },
  us_rmat_sections: { id: 'us_rmat_sections', name: 'RMAT Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },
  us_orphan_sections: { id: 'us_orphan_sections', name: 'Orphan Drug Designation Request', sections: ORPHAN_SECTIONS },
  eu_orphan_sections: { id: 'eu_orphan_sections', name: 'Orphan Designation Request (EU)', sections: ORPHAN_SECTIONS },

  // US Drug Applications
  us_ind_sections: { id: 'us_ind_sections', name: 'IND Sections (CTD)', sections: CTD_SECTIONS },
  us_nda_sections: { id: 'us_nda_sections', name: 'NDA Sections (CTD)', sections: CTD_SECTIONS.map(s => s.code === '2.7' || s.code === '5.3' ? { ...s, required: true } : s) },
  us_bla_sections: { id: 'us_bla_sections', name: 'BLA Sections (CTD)', sections: CTD_SECTIONS.map(s => s.code === '2.7' || s.code === '5.3' ? { ...s, required: true } : s) },
  us_anda_sections: { id: 'us_anda_sections', name: 'ANDA Sections', sections: CTD_SECTIONS.filter(s => ['1.1', '1.2', '2.3', '3.2.S', '3.2.P', '5.3', '5.4'].includes(s.code)) },
  us_505b2_sections: { id: 'us_505b2_sections', name: '505(b)(2) Sections', sections: CTD_SECTIONS },

  // US Device Applications
  us_510k_sections: { id: 'us_510k_sections', name: '510(k) Sections', sections: DEVICE_SECTIONS },
  us_pma_sections: { id: 'us_pma_sections', name: 'PMA Sections', sections: DEVICE_SECTIONS.map(s => ({ ...s, required: true })) },
  us_de_novo_sections: { id: 'us_de_novo_sections', name: 'De Novo Sections', sections: DEVICE_SECTIONS },

  // EU Applications
  eu_cta_sections: { id: 'eu_cta_sections', name: 'EU CTA Sections', sections: CTD_SECTIONS },
  eu_maa_sections: { id: 'eu_maa_sections', name: 'MAA Sections (CTD)', sections: CTD_SECTIONS.map(s => ({ ...s, required: true })) },
  eu_cer_sections: { id: 'eu_cer_sections', name: 'CER Sections (EU MDR)', sections: CER_SECTIONS },

  // Default fallback
  default_sections: { id: 'default_sections', name: 'Standard CTD Sections', sections: CTD_SECTIONS },
};

// ─── Task Blueprints ──────────────────────────────────────────────────────────

const DEFAULT_DRUG_TASKS: MilestoneDefinition[] = [
  {
    id: 'ms_authoring', title: 'Document Authoring', description: 'Draft all required sections', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_draft_m2', title: 'Draft Module 2 Summaries', description: 'Clinical, nonclinical, quality overviews' },
      { id: 't_draft_m3', title: 'Draft Module 3 Quality', description: 'Drug substance and drug product sections' },
      { id: 't_draft_m5', title: 'Draft Module 5 Clinical', description: 'Clinical study reports' },
    ],
  },
  {
    id: 'ms_review', title: 'Internal Review', description: 'QC and compliance review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc_review', title: 'QC Review', description: 'Quality control check of all sections' },
      { id: 't_compliance', title: 'Compliance Check', description: 'Regulatory compliance validation' },
    ],
  },
  {
    id: 'ms_finalize', title: 'Finalization', description: 'Signatures, packaging, submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_signatures', title: 'Electronic Signatures', description: '21 CFR Part 11 compliant e-signatures' },
      { id: 't_ectd_package', title: 'eCTD Packaging', description: 'Assemble eCTD submission package' },
      { id: 't_submit', title: 'Submit to Agency', description: 'Electronic submission via gateway' },
    ],
  },
];

const TASK_BLUEPRINTS: Record<string, TaskBlueprint> = {
  us_ind_tasks: { id: 'us_ind_tasks', name: 'IND Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  us_nda_tasks: { id: 'us_nda_tasks', name: 'NDA Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  us_bla_tasks: { id: 'us_bla_tasks', name: 'BLA Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  default_tasks: { id: 'default_tasks', name: 'Standard Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
};

// ─── Bootstrap Functions ──────────────────────────────────────────────────────

/**
 * Get the section blueprint for a registry entry.
 * Falls back to default CTD sections if no specific blueprint exists.
 */
export function getSectionBlueprintForEntry(entry: RegulatoryApplicationType): SectionBlueprint {
  return SECTION_BLUEPRINTS[entry.defaultSectionBlueprint] || SECTION_BLUEPRINTS.default_sections;
}

/**
 * Get the task blueprint for a registry entry.
 */
export function getTaskBlueprintForEntry(entry: RegulatoryApplicationType): TaskBlueprint {
  return TASK_BLUEPRINTS[entry.defaultTaskBlueprint] || TASK_BLUEPRINTS.default_tasks;
}

/**
 * Bootstrap a new project from a registry entry.
 * Returns everything needed to initialize the project's sections and tasks.
 */
export function bootstrapProject(entry: RegulatoryApplicationType): {
  sections: SectionDefinition[];
  milestones: MilestoneDefinition[];
  requiredArtifacts: string[];
  dossierStandard: string;
  validationProfile: string;
} {
  const sectionBlueprint = getSectionBlueprintForEntry(entry);
  const taskBlueprint = getTaskBlueprintForEntry(entry);

  return {
    sections: sectionBlueprint.sections,
    milestones: taskBlueprint.milestones,
    requiredArtifacts: entry.requiredArtifacts,
    dossierStandard: entry.dossierStandard,
    validationProfile: entry.validationProfile,
  };
}

export { SECTION_BLUEPRINTS, TASK_BLUEPRINTS };
