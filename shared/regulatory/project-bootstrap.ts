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

// ─── Master File, Variation, Pediatric, Safety-component Blueprints ───────────

/** Drug/Active Substance Master File (US DMF Type II / EU ASMF) — 3.2.S content. */
const MASTER_FILE_SECTIONS: SectionDefinition[] = [
  { code: '1.1', title: 'Cover Letter / Administrative Information', module: 1, required: true, contentType: 'form' },
  { code: '1.2', title: 'Letter of Authorization (LOA)', module: 1, required: true, contentType: 'narrative' },
  { code: '3.2.S.1', title: 'General Information (Nomenclature, Structure, Properties)', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.S.2', title: 'Manufacture (Process, Controls, Validation)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.3', title: 'Characterisation (Structure, Impurities)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.4', title: 'Control of the Substance (Specification, Methods)', module: 3, required: true, contentType: 'mixed' },
  { code: '3.2.S.5', title: 'Reference Standards or Materials', module: 3, required: false, contentType: 'data' },
  { code: '3.2.S.6', title: 'Container Closure System', module: 3, required: true, contentType: 'narrative' },
  { code: '3.2.S.7', title: 'Stability', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A(R2)' },
  { code: '3.2.R', title: 'Regional Information', module: 3, required: false, contentType: 'mixed' },
];

/** Post-approval variation / supplement / change (EU variation, JP change, supplements). */
const VARIATION_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Application / Variation Form', module: 1, required: true, contentType: 'form' },
  { code: '3', title: 'Description and Classification of the Change', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Present and Proposed (Comparison)', module: 1, required: true, contentType: 'table' },
  { code: '5', title: 'Justification and Supporting Data (Affected Module)', module: 3, required: true, contentType: 'mixed' },
  { code: '6', title: 'Risk Assessment', module: 1, required: false, contentType: 'narrative' },
  { code: '7', title: 'Revised Product Information / Labeling', module: 1, required: false, contentType: 'narrative' },
];

/** Pediatric development plan (EU PIP / US PSP). */
const PEDIATRIC_PLAN_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Administrative Information and Product Overview', module: 1, required: true, contentType: 'form' },
  { code: '2', title: 'Development Strategy and Rationale', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Nonclinical (Juvenile Animal) Studies', module: 1, required: false, contentType: 'mixed' },
  { code: '4', title: 'Clinical Studies in the Pediatric Population', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Age-Appropriate Formulation', module: 1, required: false, contentType: 'narrative' },
  { code: '6', title: 'Modeling & Simulation / Extrapolation Plan', module: 1, required: false, contentType: 'mixed' },
  { code: '7', title: 'Requested Deferrals and Waivers', module: 1, required: true, contentType: 'narrative' },
  { code: '8', title: 'Proposed Timelines', module: 1, required: true, contentType: 'narrative' },
];

/** Informed Consent Form (ICH E6 / 21 CFR 50). */
const ICF_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Study Purpose and Background', module: 5, required: true, contentType: 'narrative', guidance: '21 CFR 50.25' },
  { code: '2', title: 'Study Procedures and Duration', module: 5, required: true, contentType: 'narrative' },
  { code: '3', title: 'Reasonably Foreseeable Risks and Discomforts', module: 5, required: true, contentType: 'narrative' },
  { code: '4', title: 'Expected Benefits', module: 5, required: true, contentType: 'narrative' },
  { code: '5', title: 'Alternatives to Participation', module: 5, required: true, contentType: 'narrative' },
  { code: '6', title: 'Confidentiality of Records', module: 5, required: true, contentType: 'narrative' },
  { code: '7', title: 'Compensation and Treatment for Injury', module: 5, required: true, contentType: 'narrative' },
  { code: '8', title: 'Voluntary Participation and Right to Withdraw', module: 5, required: true, contentType: 'narrative' },
  { code: '9', title: 'Contacts for Questions', module: 5, required: true, contentType: 'narrative' },
  { code: '10', title: 'Signatures (Subject / Legal Representative / Investigator)', module: 5, required: true, contentType: 'form' },
];

/** Individual Case Safety Report — ICH E2B(R3). */
const ICSR_SECTIONS: SectionDefinition[] = [
  { code: 'C.1', title: 'Case Administrative Information (Safety Report ID, Dates)', module: 5, required: true, contentType: 'form', guidance: 'ICH E2B(R3)' },
  { code: 'D', title: 'Patient Characteristics', module: 5, required: true, contentType: 'form' },
  { code: 'G', title: 'Suspect / Concomitant Drug Information', module: 5, required: true, contentType: 'form' },
  { code: 'E', title: 'Reaction / Event (MedDRA Coded)', module: 5, required: true, contentType: 'form' },
  { code: 'E.i.3', title: 'Seriousness and Outcome', module: 5, required: true, contentType: 'form' },
  { code: 'H.1', title: 'Case Narrative', module: 5, required: true, contentType: 'narrative' },
  { code: 'H.5', title: 'Causality (Reporter / Company Assessment)', module: 5, required: true, contentType: 'narrative' },
  { code: 'C.2', title: 'Primary Source / Reporter Information', module: 5, required: true, contentType: 'form' },
];

/**
 * Periodic Adverse Drug Experience Report — 21 CFR 314.80(c)(2).
 *
 * The US periodic obligation, distinct from the 15-day alert above in every
 * respect that matters: it is periodic rather than case-triggered (quarterly for
 * three years post-approval, annually thereafter), it covers the NON-expedited
 * cases, and it carries a narrative summary and analysis the ICSR does not. The
 * two were previously one catalog row, which is the kind of conflation that
 * produces a missed filing (BP-W1-3).
 */
const PADER_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'FDA Form 3500A Reports (Non-Expedited Cases)', module: 1, required: true, contentType: 'form', guidance: '21 CFR 314.80(c)(2)(i)' },
  { code: '2', title: 'Narrative Summary and Analysis of the Reporting Interval', module: 1, required: true, contentType: 'narrative', guidance: '21 CFR 314.80(c)(2)(ii)' },
  { code: '3', title: 'Index Line-Listing of Reports', module: 1, required: true, contentType: 'mixed' },
  { code: '4', title: 'History of Actions Taken for Safety Reasons', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'Status of Post-Marketing Study Commitments', module: 1, required: false, contentType: 'narrative' },
  { code: '6', title: 'Labeling Changes in the Interval', module: 1, required: false, contentType: 'mixed' },
];

/** Structured benefit-risk assessment (CTD 2.5.6 / FDA BRF / EMA PrOACT-URL). */
const BENEFIT_RISK_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Therapeutic Context (Condition, Current Treatment Options)', module: 2, required: true, contentType: 'narrative' },
  { code: '2', title: 'Benefit Assessment (Key Evidence)', module: 2, required: true, contentType: 'mixed' },
  { code: '3', title: 'Risk Assessment (Key Safety Concerns)', module: 2, required: true, contentType: 'mixed' },
  { code: '4', title: 'Benefit-Risk Balance', module: 2, required: true, contentType: 'narrative' },
  { code: '5', title: 'Uncertainties and Assumptions', module: 2, required: false, contentType: 'narrative' },
  { code: '6', title: 'Conclusions', module: 2, required: true, contentType: 'narrative' },
];

/** Full CTD with every section required (for marketing/registration applications). */
const CTD_ALL_REQUIRED: SectionDefinition[] = CTD_SECTIONS.map(sec => ({ ...sec, required: true }));

/**
 * Abbreviated / generic dossier: administrative + quality modules plus the
 * bioequivalence study that stands in for original clinical data. Shared by the
 * generic marketing pathways (Canada ANDS, Korea generic MA, Singapore GDA),
 * the same shape the US ANDA blueprint uses.
 */
const GENERIC_DOSSIER_SECTIONS: SectionDefinition[] = CTD_SECTIONS.filter(sec =>
  ['1.1', '1.2', '1.5', '2.3', '3.2.S', '3.2.P', '5.3', '5.4'].includes(sec.code),
);

/**
 * EU Pharmacovigilance System Master File (PSMF) — structure per GVP Module II
 * and Commission Implementing Regulation (EU) 520/2012 Art. 2. It describes the
 * pharmacovigilance SYSTEM rather than a product, so it sits in the regional /
 * administrative module.
 */
const PSMF_SECTIONS: SectionDefinition[] = [
  { code: 'PSMF.1', title: 'Qualified Person for Pharmacovigilance (QPPV)', module: 1, required: true, contentType: 'narrative', guidance: 'GVP Module II.B.2 — name, 24h contact, CV, responsibilities' },
  { code: 'PSMF.2', title: 'Organisational Structure of the MAH', module: 1, required: true, contentType: 'mixed', guidance: 'GVP Module II.B.3 — org chart, PV positioning' },
  { code: 'PSMF.3', title: 'Sources of Safety Data', module: 1, required: true, contentType: 'table', guidance: 'GVP Module II.B.4 — units, activities, delegated/contracted tasks' },
  { code: 'PSMF.4', title: 'Computerised Systems and Databases', module: 1, required: true, contentType: 'mixed', guidance: 'GVP Module II.B.5 — EudraVigilance connectivity, validation status' },
  { code: 'PSMF.5', title: 'Pharmacovigilance Processes', module: 1, required: true, contentType: 'narrative', guidance: 'GVP Module II.B.6 — ADR handling, signal management, PSUR, RMP, variations' },
  { code: 'PSMF.6', title: 'Pharmacovigilance System Performance', module: 1, required: true, contentType: 'mixed', guidance: 'GVP Module II.B.7 — KPIs, compliance metrics' },
  { code: 'PSMF.7', title: 'Quality System', module: 1, required: true, contentType: 'narrative', guidance: 'GVP Module II.B.8 — documentation, training, audits, CAPA' },
  { code: 'PSMF.8', title: 'Annexes', module: 1, required: true, contentType: 'list', guidance: 'GVP Module II.C — product list, contracts, audit schedule, logbook of changes' },
];

/**
 * Comparability Protocol — a pre-approved plan for managing future CMC /
 * manufacturing changes with pre-defined tests and acceptance criteria
 * (ICH Q5E comparability; ICH Q12 established conditions / post-approval change
 * management). A quality/CMC document (Module 3).
 */
const COMPARABILITY_SECTIONS: SectionDefinition[] = [
  { code: 'CP.1', title: 'Purpose and Scope of the Change', module: 3, required: true, contentType: 'narrative' },
  { code: 'CP.2', title: 'Description of the Manufacturing Change', module: 3, required: true, contentType: 'mixed' },
  { code: 'CP.3', title: 'Quality Attributes Potentially Affected', module: 3, required: true, contentType: 'table', guidance: 'ICH Q5E / Q8 — impacted CQAs' },
  { code: 'CP.4', title: 'Analytical Comparability Plan', module: 3, required: true, contentType: 'mixed', guidance: 'methods, tests, characterisation' },
  { code: 'CP.5', title: 'Comparability Acceptance Criteria', module: 3, required: true, contentType: 'table' },
  { code: 'CP.6', title: 'Stability Commitment', module: 3, required: true, contentType: 'mixed', guidance: 'ICH Q1A / Q5C' },
  { code: 'CP.7', title: 'Risk Assessment', module: 3, required: true, contentType: 'narrative', guidance: 'ICH Q9' },
  { code: 'CP.8', title: 'Proposed Reporting Category and Implementation', module: 3, required: true, contentType: 'narrative', guidance: 'ICH Q12' },
];

/**
 * Environmental Assessment (EA) — NEPA / 21 CFR Part 25.40 format for a drug
 * manufacturing or marketing action that does not qualify for categorical
 * exclusion. Supports the CMC/quality dossier (Module 3).
 */
const ENVIRONMENTAL_ASSESSMENT_SECTIONS: SectionDefinition[] = [
  { code: 'EA.1', title: 'Date and Applicant', module: 3, required: true, contentType: 'narrative' },
  { code: 'EA.2', title: 'Description of the Proposed Action and Need', module: 3, required: true, contentType: 'narrative', guidance: '21 CFR 25.40(a)' },
  { code: 'EA.3', title: 'Substances Introduced into the Environment', module: 3, required: true, contentType: 'table' },
  { code: 'EA.4', title: 'Fate and Environmental Effects of Released Substances', module: 3, required: true, contentType: 'mixed' },
  { code: 'EA.5', title: 'Use of Resources and Energy', module: 3, required: false, contentType: 'narrative' },
  { code: 'EA.6', title: 'Mitigation Measures', module: 3, required: true, contentType: 'narrative' },
  { code: 'EA.7', title: 'Alternatives to the Proposed Action', module: 3, required: true, contentType: 'narrative' },
  { code: 'EA.8', title: 'List of Preparers, Certification, and References', module: 3, required: true, contentType: 'list' },
];

/**
 * Signal management report — systematic analysis of aggregate safety data per
 * ICH E2E and EU GVP Module IX (signal detection → validation → assessment →
 * recommendation). A pharmacovigilance/clinical-safety document (Module 5).
 */
const SIGNAL_SECTIONS: SectionDefinition[] = [
  { code: 'SIG.1', title: 'Data Sources and Detection Method', module: 5, required: true, contentType: 'mixed', guidance: 'GVP IX.B — spontaneous, literature, EudraVigilance, disproportionality' },
  { code: 'SIG.2', title: 'Signal Validation', module: 5, required: true, contentType: 'narrative' },
  { code: 'SIG.3', title: 'Signal Analysis and Prioritisation', module: 5, required: true, contentType: 'mixed' },
  { code: 'SIG.4', title: 'Signal Assessment', module: 5, required: true, contentType: 'narrative', guidance: 'ICH E2E — evidence weighting, biological plausibility' },
  { code: 'SIG.5', title: 'Recommendation and Action', module: 5, required: true, contentType: 'narrative', guidance: 'label change, RMP update, further study, no action' },
  { code: 'SIG.6', title: 'Documentation and Tracking', module: 5, required: true, contentType: 'table' },
];

// ─── Device / IVD section structures ──────────────────────────────────────────

/** FDA pre-submission / Q-Sub / classification request (Requests for Feedback guidance). */
const DEVICE_PRESUB_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter and Meeting Request', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Device Description and Intended Use', module: 1, required: true, contentType: 'mixed' },
  { code: '3', title: 'Proposed Regulatory Pathway and History', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Specific Questions for the Agency', module: 1, required: true, contentType: 'list' },
  { code: '5', title: 'Supporting Data and Testing Strategy', module: 1, required: false, contentType: 'mixed' },
];

/** EU MDR 2017/745 Annex II/III technical documentation. */
const DEVICE_TECHDOC_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Device Description and Specification', module: 1, required: true, contentType: 'mixed', guidance: 'MDR Annex II §1' },
  { code: '2', title: 'Labelling and Instructions for Use', module: 1, required: true, contentType: 'narrative', guidance: 'MDR Annex II §2' },
  { code: '3', title: 'Design and Manufacturing Information', module: 1, required: true, contentType: 'mixed', guidance: 'MDR Annex II §3' },
  { code: '4', title: 'General Safety and Performance Requirements (GSPR)', module: 1, required: true, contentType: 'table', guidance: 'MDR Annex I' },
  { code: '5', title: 'Benefit-Risk Analysis and Risk Management', module: 1, required: true, contentType: 'mixed', guidance: 'MDR Annex I §1–8; ISO 14971' },
  { code: '6', title: 'Product Verification and Validation', module: 1, required: true, contentType: 'data', guidance: 'incl. preclinical + clinical evaluation' },
  { code: '7', title: 'Post-Market Surveillance Plan', module: 1, required: true, contentType: 'narrative', guidance: 'MDR Annex III' },
];

/** IVD analytical + clinical performance evaluation (EU IVDR Annex XIII; FDA analytical/clinical). */
const IVD_PERFORMANCE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Intended Use and Indications', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Scientific Validity', module: 1, required: true, contentType: 'narrative', guidance: 'IVDR Annex XIII Part A §1.2' },
  { code: '3', title: 'Analytical Performance', module: 1, required: true, contentType: 'data', guidance: 'sensitivity, specificity, precision, LoD/LoQ, interference' },
  { code: '4', title: 'Clinical Performance', module: 1, required: true, contentType: 'data', guidance: 'diagnostic sensitivity/specificity, predictive values' },
  { code: '5', title: 'Stability and Specimen Handling', module: 1, required: false, contentType: 'mixed' },
  { code: '6', title: 'Performance Evaluation Report', module: 1, required: true, contentType: 'narrative', guidance: 'IVDR Article 56' },
];

/** Device / IVD clinical investigation or performance study (ISO 14155; MDR Annex XV). */
const DEVICE_CLINICAL_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Clinical Investigation Plan / Synopsis', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 14155' },
  { code: '2', title: 'Device Description and Intended Purpose', module: 1, required: true, contentType: 'mixed' },
  { code: '3', title: 'Risk Analysis and Justification', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Investigator Brochure', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'Informed Consent and Ethics', module: 1, required: true, contentType: 'narrative' },
  { code: '6', title: 'Monitoring and Data Management', module: 1, required: true, contentType: 'mixed' },
  { code: '7', title: 'Statistical Analysis Plan', module: 1, required: true, contentType: 'narrative' },
];

/** ISO 14971:2019 risk management file. */
const RISK_MANAGEMENT_FILE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Risk Management Plan', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 14971 §4' },
  { code: '2', title: 'Intended Use and Characteristics Related to Safety', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 14971 §5.2–5.3' },
  { code: '3', title: 'Hazard and Hazardous-Situation Analysis', module: 1, required: true, contentType: 'table', guidance: 'ISO 14971 §5.4–5.5' },
  { code: '4', title: 'Risk Evaluation', module: 1, required: true, contentType: 'table', guidance: 'ISO 14971 §6' },
  { code: '5', title: 'Risk Control Measures and Verification', module: 1, required: true, contentType: 'mixed', guidance: 'ISO 14971 §7' },
  { code: '6', title: 'Residual Risk and Overall Benefit-Risk', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 14971 §8' },
  { code: '7', title: 'Risk Management Report', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 14971 §9' },
  { code: '8', title: 'Production and Post-Production Information', module: 1, required: true, contentType: 'mixed', guidance: 'ISO 14971 §10' },
];

/** Medical-device software lifecycle (IEC 62304) with FDA cybersecurity + PCCP. */
const DEVICE_SOFTWARE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Software Development Plan', module: 1, required: true, contentType: 'narrative', guidance: 'IEC 62304 §5.1' },
  { code: '2', title: 'Software Requirements Specification', module: 1, required: true, contentType: 'mixed', guidance: 'IEC 62304 §5.2' },
  { code: '3', title: 'Software Architecture and Detailed Design', module: 1, required: true, contentType: 'mixed', guidance: 'IEC 62304 §5.3–5.4' },
  { code: '4', title: 'Verification and Testing (Unit / Integration / System)', module: 1, required: true, contentType: 'data', guidance: 'IEC 62304 §5.5–5.7' },
  { code: '5', title: 'Software Risk Management', module: 1, required: true, contentType: 'mixed', guidance: 'IEC 62304 §7; ISO 14971' },
  { code: '6', title: 'Cybersecurity: Threat Model, SBOM, Vulnerability Assessment', module: 1, required: true, contentType: 'mixed', guidance: 'FDA premarket cybersecurity guidance' },
  { code: '7', title: 'Change Control and Predetermined Change Control Plan (PCCP)', module: 1, required: false, contentType: 'narrative', guidance: 'AI/ML modification protocol' },
];

/** Quality management system documentation (ISO 13485; 21 CFR 820). */
const QMS_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Quality Policy and Objectives', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 13485 §5' },
  { code: '2', title: 'Organization, Roles and Responsibilities', module: 1, required: true, contentType: 'mixed' },
  { code: '3', title: 'Document and Record Control', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 13485 §4.2; 21 CFR 820.40' },
  { code: '4', title: 'Design and Development Controls', module: 1, required: true, contentType: 'mixed', guidance: '21 CFR 820.30; ISO 13485 §7.3' },
  { code: '5', title: 'Production and Process Controls', module: 1, required: true, contentType: 'mixed', guidance: '21 CFR 820.70' },
  { code: '6', title: 'Corrective and Preventive Action (CAPA)', module: 1, required: true, contentType: 'narrative', guidance: '21 CFR 820.100' },
  { code: '7', title: 'Management Review and Internal Audit', module: 1, required: true, contentType: 'narrative', guidance: 'ISO 13485 §5.6, §8.2.4' },
];

/** Device post-market surveillance and vigilance (MDR Art. 83–92; 21 CFR 803/806). */
const DEVICE_POSTMARKET_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Post-Market Surveillance Plan', module: 1, required: true, contentType: 'narrative', guidance: 'MDR Article 84' },
  { code: '2', title: 'Complaint Handling', module: 1, required: true, contentType: 'mixed', guidance: '21 CFR 820.198' },
  { code: '3', title: 'Adverse Event / Vigilance Reporting', module: 1, required: true, contentType: 'mixed', guidance: '21 CFR 803; MDR Article 87' },
  { code: '4', title: 'Trend Analysis', module: 1, required: true, contentType: 'data', guidance: '21 CFR 803.65; MDR Article 88' },
  { code: '5', title: 'Field Safety Corrective Action', module: 1, required: false, contentType: 'narrative', guidance: '21 CFR 806; MDR Article 89' },
  { code: '6', title: 'Periodic Safety Update / Annual Report', module: 1, required: true, contentType: 'narrative', guidance: 'MDR Article 86; 21 CFR 814.84' },
];

/**
 * Notified Body Opinion dossier for the device constituent of an integral
 * drug-device combination (MDR (EU) 2017/745 Art. 117, amending Directive
 * 2001/83/EC Annex I §12). The sponsor gives the Notified Body the evidence
 * of the device part's conformity with the relevant GSPRs; the resulting
 * opinion is then filed with the MAA, so the opinion/assessment outcome is
 * itself a section of this dossier rather than a letter kept elsewhere.
 */
const MDR_ART117_NBOP_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Device Constituent Description and Intended Purpose', module: 1, required: true, contentType: 'mixed', guidance: 'MDR Art. 117; integral combination product (e.g. prefilled pen/syringe)' },
  { code: '2', title: 'GSPR Conformity of the Device Part', module: 1, required: true, contentType: 'table', guidance: 'MDR Annex I — relevant general safety and performance requirements' },
  { code: '3', title: 'Risk Management File', module: 1, required: true, contentType: 'mixed', guidance: 'ISO 14971; MDR Annex I §1–9' },
  { code: '4', title: 'Usability / Human Factors Engineering', module: 1, required: true, contentType: 'mixed', guidance: 'IEC 62366-1' },
  { code: '5', title: 'Design Verification and Validation', module: 1, required: true, contentType: 'data', guidance: 'e.g. ISO 11608 for needle-based injection systems' },
  { code: '6', title: 'Manufacturing and Sterility of the Device Part', module: 1, required: true, contentType: 'mixed', guidance: 'sterilisation validation; ISO 11607 packaging where applicable' },
  { code: '7', title: 'Biocompatibility', module: 1, required: true, contentType: 'data', guidance: 'ISO 10993-1 evaluation of patient-contacting materials' },
  { code: '8', title: 'Notified Body Opinion and Assessment Outcome', module: 1, required: true, contentType: 'narrative', guidance: 'NB opinion document, filed with the MAA' },
];

/**
 * EMA scientific-opinion consultation on a companion diagnostic (IVDR (EU)
 * 2017/746 Art. 48(6)): the Notified Body assessing the CDx seeks the EMA's
 * (or the authorising competent authority's) opinion on the suitability of
 * the device to the medicinal product concerned.
 */
const IVDR_ART48_CONSULT_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'CDx Device Description and Intended Purpose', module: 1, required: true, contentType: 'mixed', guidance: 'IVDR Art. 2(7) companion diagnostic; Annex II §1' },
  { code: '2', title: 'Analytical Performance', module: 1, required: true, contentType: 'data', guidance: 'IVDR Annex XIII Part A — sensitivity, specificity, precision, LoD/LoQ' },
  { code: '3', title: 'Clinical Performance and Clinical Evidence', module: 1, required: true, contentType: 'data', guidance: 'IVDR Annex XIII Part A; clinical performance study data' },
  { code: '4', title: 'Suitability of the CDx to the Medicinal Product', module: 1, required: true, contentType: 'narrative', guidance: 'IVDR Art. 48(6) — drug–diagnostic association, biomarker definition and cut-off' },
  { code: '5', title: 'Risk Assessment', module: 1, required: true, contentType: 'mixed', guidance: 'consequences of false positive / false negative results for the treatment decision' },
  { code: '6', title: 'Consultation Question and Scientific Opinion', module: 1, required: true, contentType: 'narrative', guidance: 'question put to the EMA / competent authority and the opinion received' },
];

/** Regulatory intelligence & strategy work products (BP-W1-2 absorbed rows):
 *  governed internal documents, not agency submissions, so the structure is the
 *  analysis file itself rather than a dossier module. */
const REGULATORY_INTELLIGENCE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Objective & Scope', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Regulatory Landscape & Precedent', module: 1, required: true, contentType: 'mixed' },
  { code: '3', title: 'Analysis & Findings', module: 1, required: true, contentType: 'mixed' },
  { code: '4', title: 'Recommendations & Next Steps', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'References & Source Records', module: 1, required: false, contentType: 'list' },
];

const SECTION_BLUEPRINTS: Record<string, SectionBlueprint> = {
  // US Pre-submission
  us_pre_ind_sections: { id: 'us_pre_ind_sections', name: 'Pre-IND Meeting Briefing Package', sections: PRE_IND_SECTIONS },

  // Master files (drug/active substance)
  us_dmf_sections: { id: 'us_dmf_sections', name: 'Drug Master File (US DMF)', sections: MASTER_FILE_SECTIONS },
  eu_asmf_sections: { id: 'eu_asmf_sections', name: 'Active Substance Master File (EU ASMF)', sections: MASTER_FILE_SECTIONS },
  ca_mf_sections: { id: 'ca_mf_sections', name: 'Master File (Canada)', sections: MASTER_FILE_SECTIONS },
  jp_mf_sections: { id: 'jp_mf_sections', name: 'Master File (Japan)', sections: MASTER_FILE_SECTIONS },

  // Post-approval variations / supplements / changes
  eu_variation_ia_sections: { id: 'eu_variation_ia_sections', name: 'EU Type IA Variation', sections: VARIATION_SECTIONS },
  eu_variation_ib_sections: { id: 'eu_variation_ib_sections', name: 'EU Type IB Variation', sections: VARIATION_SECTIONS },
  eu_variation_ii_sections: { id: 'eu_variation_ii_sections', name: 'EU Type II Variation', sections: VARIATION_SECTIONS },
  jp_partial_change_sections: { id: 'jp_partial_change_sections', name: 'Japan Partial Change Application', sections: VARIATION_SECTIONS },
  jp_minor_change_sections: { id: 'jp_minor_change_sections', name: 'Japan Minor Change Notification', sections: VARIATION_SECTIONS },
  cn_supplement_sections: { id: 'cn_supplement_sections', name: 'China Supplementary Application', sections: VARIATION_SECTIONS },
  ca_snds_sections: { id: 'ca_snds_sections', name: 'Canada Supplemental NDS', sections: VARIATION_SECTIONS },
  ca_sands_sections: { id: 'ca_sands_sections', name: 'Canada Supplemental ANDS', sections: VARIATION_SECTIONS },

  // Pediatric plans
  eu_pip_sections: { id: 'eu_pip_sections', name: 'Paediatric Investigation Plan (EU PIP)', sections: PEDIATRIC_PLAN_SECTIONS },
  us_psp_sections: { id: 'us_psp_sections', name: 'Pediatric Study Plan (US PSP)', sections: PEDIATRIC_PLAN_SECTIONS },

  // Biosimilar + expedited marketing pathways (full CTD)
  us_351k_sections: { id: 'us_351k_sections', name: 'Biosimilar Application (351(k))', sections: CTD_ALL_REQUIRED },
  us_accel_approval_sections: { id: 'us_accel_approval_sections', name: 'Accelerated Approval Application', sections: CTD_ALL_REQUIRED },
  us_rolling_sections: { id: 'us_rolling_sections', name: 'Rolling Submission / Review', sections: CTD_ALL_REQUIRED },
  eu_cma_sections: { id: 'eu_cma_sections', name: 'Conditional Marketing Authorisation (EU)', sections: CTD_ALL_REQUIRED },

  // Regional marketing authorizations (full CTD)
  uk_ma_sections: { id: 'uk_ma_sections', name: 'UK Marketing Authorisation', sections: CTD_ALL_REQUIRED },
  ch_ma_sections: { id: 'ch_ma_sections', name: 'Swiss Marketing Authorisation', sections: CTD_ALL_REQUIRED },
  kr_ma_new_sections: { id: 'kr_ma_new_sections', name: 'Korea New Drug Marketing Application', sections: CTD_ALL_REQUIRED },
  sg_nda_sections: { id: 'sg_nda_sections', name: 'Singapore New Drug Application', sections: CTD_ALL_REQUIRED },
  cn_maa_sections: { id: 'cn_maa_sections', name: 'China Marketing Authorization Application', sections: CTD_ALL_REQUIRED },
  br_ma_sections: { id: 'br_ma_sections', name: 'Brazil Marketing Authorization', sections: CTD_ALL_REQUIRED },
  au_cat1_sections: { id: 'au_cat1_sections', name: 'Australia Category 1 Registration', sections: CTD_ALL_REQUIRED },

  // Safety / clinical components
  ich_icf_sections: { id: 'ich_icf_sections', name: 'Informed Consent Form (ICH E6 / 21 CFR 50)', sections: ICF_SECTIONS },
  ich_icsr_sections: { id: 'ich_icsr_sections', name: 'Individual Case Safety Report (ICH E2B)', sections: ICSR_SECTIONS },
  ich_benefit_risk_sections: { id: 'ich_benefit_risk_sections', name: 'Benefit-Risk Assessment (CTD 2.5.6)', sections: BENEFIT_RISK_SECTIONS },

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

  // Regional clinical trial applications (full CTD, mirroring EU_CTA / US_IND)
  uk_cta_sections: { id: 'uk_cta_sections', name: 'UK Clinical Trial Authorisation (MHRA)', sections: CTD_SECTIONS },
  ca_cta_a_sections: { id: 'ca_cta_a_sections', name: 'Canada CTA Amendment', sections: CTD_SECTIONS },
  au_cta_sections: { id: 'au_cta_sections', name: 'Australia Clinical Trial Approval (TGA)', sections: CTD_SECTIONS },
  ch_cta_sections: { id: 'ch_cta_sections', name: 'Switzerland Clinical Trial Application (Swissmedic)', sections: CTD_SECTIONS },
  kr_ind_sections: { id: 'kr_ind_sections', name: 'Korea IND Application (MFDS)', sections: CTD_SECTIONS },
  br_deec_sections: { id: 'br_deec_sections', name: 'Brazil Clinical Trial Dossier (ANVISA DEEC)', sections: CTD_SECTIONS },

  // Generic / abbreviated marketing applications (bioequivalence-focused dossier)
  ca_ands_sections: { id: 'ca_ands_sections', name: 'Canada Abbreviated NDS (generic)', sections: GENERIC_DOSSIER_SECTIONS },
  kr_ma_generic_sections: { id: 'kr_ma_generic_sections', name: 'Korea Generic Marketing Application', sections: GENERIC_DOSSIER_SECTIONS },
  sg_gda_sections: { id: 'sg_gda_sections', name: 'Singapore Generic Drug Application', sections: GENERIC_DOSSIER_SECTIONS },

  // EU pre-submission, designation, renewal, and pharmacovigilance system
  eu_scientific_advice_sections: { id: 'eu_scientific_advice_sections', name: 'EU Scientific Advice / Protocol Assistance', sections: PRE_IND_SECTIONS },
  eu_prime_sections: { id: 'eu_prime_sections', name: 'EU PRIME Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },
  eu_renewal_sections: { id: 'eu_renewal_sections', name: 'EU Marketing Authorisation Renewal', sections: VARIATION_SECTIONS },
  eu_psmf_sections: { id: 'eu_psmf_sections', name: 'Pharmacovigilance System Master File (EU GVP II)', sections: PSMF_SECTIONS },

  // ICH CMC lifecycle
  ich_comparability_sections: { id: 'ich_comparability_sections', name: 'Comparability Protocol (ICH Q5E/Q12)', sections: COMPARABILITY_SECTIONS },

  // India (CDSCO, New Drugs & Clinical Trials Rules 2019 forms)
  in_ct06_sections: { id: 'in_ct06_sections', name: 'India CT-06 — BE/BA Study Permission', sections: GENERIC_DOSSIER_SECTIONS },
  in_ct07_sections: { id: 'in_ct07_sections', name: 'India CT-07 — Post-Marketing (Phase IV) Study', sections: PROTOCOL_SECTIONS },
  in_ct11_sections: { id: 'in_ct11_sections', name: 'India CT-11 — Clinical Trial Completion Report', sections: CSR_SECTIONS },
  in_ct18_sections: { id: 'in_ct18_sections', name: 'India CT-18 — New Drug Marketing Approval', sections: CTD_ALL_REQUIRED },
  in_ct19_sections: { id: 'in_ct19_sections', name: 'India CT-19 — New Drug Import Registration', sections: CTD_ALL_REQUIRED },
  in_ct21_sections: { id: 'in_ct21_sections', name: 'India CT-21 — Generic Drug Marketing Approval', sections: GENERIC_DOSSIER_SECTIONS },

  // US post-approval lifecycle, safety, and environmental
  us_pmr_sections: { id: 'us_pmr_sections', name: 'Post-Marketing Requirement / Commitment Study', sections: PROTOCOL_SECTIONS },
  /* BP-W1-3: `us_medwatch_sections` backed a catalog row named "MedWatch /
     FAERS", which was not a filing type — FAERS is a database, MedWatch a form
     family. The row is now two obligations with different legal bases and
     different clocks, so each gets its own blueprint. The ICSR section set is
     unchanged and simply renamed to what it always was: an E2B(R3) case, not a
     MedWatch form. */
  us_icsr_15day_sections: { id: 'us_icsr_15day_sections', name: '15-Day Alert Report — ICSR (21 CFR 314.80(c)(1))', sections: ICSR_SECTIONS },
  us_pader_sections: { id: 'us_pader_sections', name: 'Periodic Adverse Drug Experience Report (21 CFR 314.80(c)(2))', sections: PADER_SECTIONS },
  us_ea_sections: { id: 'us_ea_sections', name: 'Environmental Assessment (21 CFR 25)', sections: ENVIRONMENTAL_ASSESSMENT_SECTIONS },
  us_eua_sections: { id: 'us_eua_sections', name: 'Emergency Use Authorization (vaccine/biologic)', sections: CTD_SECTIONS },

  // UK + China post-approval lifecycle
  uk_irp_sections: { id: 'uk_irp_sections', name: 'UK International Recognition Procedure (MHRA)', sections: CTD_SECTIONS },
  uk_variation_sections: { id: 'uk_variation_sections', name: 'UK Post-Authorisation Variation', sections: VARIATION_SECTIONS },
  cn_renewal_sections: { id: 'cn_renewal_sections', name: 'China Registration Renewal (NMPA)', sections: VARIATION_SECTIONS },

  // ICH pharmacovigilance
  ich_signal_sections: { id: 'ich_signal_sections', name: 'Signal Management Report (ICH E2E / GVP IX)', sections: SIGNAL_SECTIONS },

  // Remaining drug CMC / marketing lifecycle
  us_supac_sections: { id: 'us_supac_sections', name: 'Scale-Up & Post-Approval Changes (SUPAC)', sections: VARIATION_SECTIONS },
  au_cat2_sections: { id: 'au_cat2_sections', name: 'Australia Category 2 Registration (abridged)', sections: CTD_SECTIONS },

  // CTD module authoring surfaces (ICH M4) — the per-module section structure
  ich_ctd_m1_sections: { id: 'ich_ctd_m1_sections', name: 'CTD Module 1 — Regional/Administrative', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  ich_ctd_m2_sections: { id: 'ich_ctd_m2_sections', name: 'CTD Module 2 — Summaries', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  ich_ctd_m3_sections: { id: 'ich_ctd_m3_sections', name: 'CTD Module 3 — Quality (CMC)', sections: CTD_SECTIONS.filter(s => s.module === 3) },
  ich_ctd_m4_sections: { id: 'ich_ctd_m4_sections', name: 'CTD Module 4 — Nonclinical', sections: CTD_SECTIONS.filter(s => s.module === 4) },
  ich_ctd_m5_sections: { id: 'ich_ctd_m5_sections', name: 'CTD Module 5 — Clinical', sections: CTD_SECTIONS.filter(s => s.module === 5) },

  // ── Medical devices & IVDs ──────────────────────────────────────────────────
  // Device market submissions (510(k)/PMA/De Novo family + national licences)
  us_hde_sections: { id: 'us_hde_sections', name: 'Humanitarian Device Exemption (HDE)', sections: DEVICE_SECTIONS },
  us_510k_mod_sections: { id: 'us_510k_mod_sections', name: '510(k) for Device Modification', sections: DEVICE_SECTIONS },
  us_pma_supp_sections: { id: 'us_pma_supp_sections', name: 'PMA Supplement', sections: DEVICE_SECTIONS },
  us_cdx_pma_sections: { id: 'us_cdx_pma_sections', name: 'Companion Diagnostic PMA', sections: DEVICE_SECTIONS },
  us_cdx_510k_sections: { id: 'us_cdx_510k_sections', name: 'Companion Diagnostic 510(k) Expansion', sections: DEVICE_SECTIONS },
  ca_mdl_sections: { id: 'ca_mdl_sections', name: 'Canada Medical Device Licence (SOR/98-282)', sections: DEVICE_SECTIONS },
  jp_shonin_sections: { id: 'jp_shonin_sections', name: 'Japan Device Approval (Shonin, Class III/IV)', sections: DEVICE_SECTIONS },
  uk_device_reg_sections: { id: 'uk_device_reg_sections', name: 'UK Device Registration (MHRA / UKCA)', sections: DEVICE_SECTIONS },

  // Pre-submissions, feedback and classification requests (FDA Q-Sub family)
  us_513g_sections: { id: 'us_513g_sections', name: '513(g) Request for Classification Information', sections: DEVICE_PRESUB_SECTIONS },
  us_qsub_sections: { id: 'us_qsub_sections', name: 'Q-Submission (Pre-Sub)', sections: DEVICE_PRESUB_SECTIONS },
  us_rfd_sections: { id: 'us_rfd_sections', name: 'Request for Designation (combination products)', sections: DEVICE_PRESUB_SECTIONS },
  us_samd_presub_sections: { id: 'us_samd_presub_sections', name: 'SaMD Pre-Submission', sections: DEVICE_PRESUB_SECTIONS },
  us_ivd_qsub_sections: { id: 'us_ivd_qsub_sections', name: 'IVD Q-Submission', sections: DEVICE_PRESUB_SECTIONS },
  us_cdx_codev_sections: { id: 'us_cdx_codev_sections', name: 'Companion Diagnostic Co-Development Plan', sections: DEVICE_PRESUB_SECTIONS },
  us_breakthrough_device_sections: { id: 'us_breakthrough_device_sections', name: 'Breakthrough Device Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },

  // EU MDR/IVDR technical documentation + conformity
  eu_mdr_techdoc_sections: { id: 'eu_mdr_techdoc_sections', name: 'EU MDR Technical Documentation (Annex II/III)', sections: DEVICE_TECHDOC_SECTIONS },
  eu_ivdr_sections: { id: 'eu_ivdr_sections', name: 'EU IVDR Technical Documentation (Annex II/III)', sections: DEVICE_TECHDOC_SECTIONS },
  eu_doc_sections: { id: 'eu_doc_sections', name: 'EU Declaration of Conformity', sections: DEVICE_TECHDOC_SECTIONS },
  eu_sscp_sections: { id: 'eu_sscp_sections', name: 'Summary of Safety & Clinical Performance (MDR Art. 32)', sections: CER_SECTIONS },

  // Drug-device consultations — the two places a medicines agency legitimately
  // touches a device/IVD (W2-1): MDR Art. 117 NB Opinion and IVDR Art. 48(6).
  eu_mdr_art117_nbop_sections: { id: 'eu_mdr_art117_nbop_sections', name: 'Notified Body Opinion — MDR Art. 117', sections: MDR_ART117_NBOP_SECTIONS },
  eu_ivdr_art48_consult_sections: { id: 'eu_ivdr_art48_consult_sections', name: 'EMA CDx Consultation — IVDR Art. 48(6)', sections: IVDR_ART48_CONSULT_SECTIONS },

  // IVD performance evaluation family (analytical + clinical performance)
  eu_ivdr_classification_sections: { id: 'eu_ivdr_classification_sections', name: 'EU IVDR Classification (Rules 1–7)', sections: IVD_PERFORMANCE_SECTIONS },
  eu_per_sections: { id: 'eu_per_sections', name: 'IVD Performance Evaluation Report (IVDR Art. 56)', sections: IVD_PERFORMANCE_SECTIONS },
  eu_ref_lab_sections: { id: 'eu_ref_lab_sections', name: 'EU Reference Laboratory Batch Verification (Class D)', sections: IVD_PERFORMANCE_SECTIONS },
  eu_sscp_ivd_sections: { id: 'eu_sscp_ivd_sections', name: 'Summary of Safety & Performance (Class C/D IVD)', sections: IVD_PERFORMANCE_SECTIONS },
  eu_ivd_reeval_sections: { id: 'eu_ivd_reeval_sections', name: 'IVD Periodic Performance Re-evaluation', sections: IVD_PERFORMANCE_SECTIONS },
  us_clia_waiver_sections: { id: 'us_clia_waiver_sections', name: 'CLIA Waiver Application', sections: IVD_PERFORMANCE_SECTIONS },
  us_510k_ivd_sections: { id: 'us_510k_ivd_sections', name: '510(k) for Class II IVD', sections: IVD_PERFORMANCE_SECTIONS },
  us_pma_ivd_sections: { id: 'us_pma_ivd_sections', name: 'PMA for Class III IVD', sections: IVD_PERFORMANCE_SECTIONS },
  us_de_novo_ivd_sections: { id: 'us_de_novo_ivd_sections', name: 'De Novo for Novel IVD', sections: IVD_PERFORMANCE_SECTIONS },
  us_eua_ivd_sections: { id: 'us_eua_ivd_sections', name: 'IVD Emergency Use Authorization', sections: IVD_PERFORMANCE_SECTIONS },
  us_ldt_sections: { id: 'us_ldt_sections', name: 'Laboratory Developed Test (LDT)', sections: IVD_PERFORMANCE_SECTIONS },
  us_complementary_dx_sections: { id: 'us_complementary_dx_sections', name: 'Complementary Diagnostic', sections: IVD_PERFORMANCE_SECTIONS },

  // Device / IVD clinical investigations and performance studies
  us_ide_sections: { id: 'us_ide_sections', name: 'Investigational Device Exemption (IDE)', sections: DEVICE_CLINICAL_SECTIONS },
  eu_perf_study_sections: { id: 'eu_perf_study_sections', name: 'IVD Performance Study Application (IVDR Art. 58)', sections: DEVICE_CLINICAL_SECTIONS },
  eu_pmcf_sections: { id: 'eu_pmcf_sections', name: 'Post-Market Clinical Follow-up (MDR Annex XIV)', sections: DEVICE_CLINICAL_SECTIONS },
  eu_pmpf_sections: { id: 'eu_pmpf_sections', name: 'Post-Market Performance Follow-up (IVDR Annex XIII)', sections: DEVICE_CLINICAL_SECTIONS },

  // Risk management, software, and quality systems
  iso_rmf_sections: { id: 'iso_rmf_sections', name: 'Risk Management File (ISO 14971)', sections: RISK_MANAGEMENT_FILE_SECTIONS },
  iec_62304_sections: { id: 'iec_62304_sections', name: 'Software Lifecycle File (IEC 62304)', sections: DEVICE_SOFTWARE_SECTIONS },
  us_cybersecurity_sections: { id: 'us_cybersecurity_sections', name: 'Premarket Cybersecurity Documentation', sections: DEVICE_SOFTWARE_SECTIONS },
  us_pccp_sections: { id: 'us_pccp_sections', name: 'Predetermined Change Control Plan (AI/ML)', sections: DEVICE_SOFTWARE_SECTIONS },
  qms_quality_manual_sections: { id: 'qms_quality_manual_sections', name: 'Quality Manual (ISO 13485)', sections: QMS_SECTIONS },
  qms_design_controls_sections: { id: 'qms_design_controls_sections', name: 'Design Controls (21 CFR 820.30)', sections: QMS_SECTIONS },
  qms_dmr_sections: { id: 'qms_dmr_sections', name: 'Device Master Record (DMR)', sections: QMS_SECTIONS },
  qms_dhr_sections: { id: 'qms_dhr_sections', name: 'Device History Record (DHR)', sections: QMS_SECTIONS },
  qms_mdsap_sections: { id: 'qms_mdsap_sections', name: 'MDSAP Audit File', sections: QMS_SECTIONS },
  us_dhf_sections: { id: 'us_dhf_sections', name: 'Design History File (DHF)', sections: QMS_SECTIONS },

  // Device post-market surveillance and vigilance
  us_pma_annual_sections: { id: 'us_pma_annual_sections', name: 'PMA Annual Report (21 CFR 814.84)', sections: DEVICE_POSTMARKET_SECTIONS },
  us_mdr_report_sections: { id: 'us_mdr_report_sections', name: 'Medical Device Report (MDR, 21 CFR 803)', sections: DEVICE_POSTMARKET_SECTIONS },
  us_recall_sections: { id: 'us_recall_sections', name: 'Corrections & Removals Report (21 CFR 806)', sections: DEVICE_POSTMARKET_SECTIONS },
  us_trend_report_sections: { id: 'us_trend_report_sections', name: 'Trend Report (21 CFR 803.65)', sections: DEVICE_POSTMARKET_SECTIONS },
  us_device_reg_sections: { id: 'us_device_reg_sections', name: 'Establishment Registration & Device Listing', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_psur_device_sections: { id: 'eu_psur_device_sections', name: 'Device PSUR (MDR Article 86)', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_fsca_sections: { id: 'eu_fsca_sections', name: 'Field Safety Corrective Action (MDR Article 89)', sections: DEVICE_POSTMARKET_SECTIONS },

  // ── Absorbed from the client registry mirror (BP-W1-2) ──────────────────────
  // Every filing type the retired client-side catalogs offered now lives in the
  // canonical registry, and every one must resolve to a REAL authoring
  // structure (registryCoverage pins this). Each shares the section family that
  // genuinely fits its document class — the same convention the device
  // post-market blueprints above already use. Where the fit is approximate
  // (an international registration on the STED technical-documentation family),
  // that is recorded for the BP-W1-4 audit rather than silently invented.
  us_type_a_meeting_sections: { id: 'us_type_a_meeting_sections', name: 'Type A Meeting Briefing Package', sections: PRE_IND_SECTIONS },
  us_type_b_meeting_sections: { id: 'us_type_b_meeting_sections', name: 'Type B Meeting Briefing Package', sections: PRE_IND_SECTIONS },
  us_type_c_meeting_sections: { id: 'us_type_c_meeting_sections', name: 'Type C Meeting Briefing Package', sections: PRE_IND_SECTIONS },
  ca_presub_meeting_sections: { id: 'ca_presub_meeting_sections', name: 'Health Canada Pre-submission Briefing', sections: PRE_IND_SECTIONS },
  jp_pre_consult_sections: { id: 'jp_pre_consult_sections', name: 'PMDA Consultation Briefing', sections: PRE_IND_SECTIONS },
  au_presub_meeting_sections: { id: 'au_presub_meeting_sections', name: 'TGA Pre-submission Briefing', sections: PRE_IND_SECTIONS },
  jp_sakigake_sections: { id: 'jp_sakigake_sections', name: 'Sakigake Designation Request', sections: DESIGNATION_REQUEST_SECTIONS },
  us_priority_review_sections: { id: 'us_priority_review_sections', name: 'Priority Review Request', sections: DESIGNATION_REQUEST_SECTIONS },
  eu_accel_assess_sections: { id: 'eu_accel_assess_sections', name: 'Accelerated Assessment Request', sections: DESIGNATION_REQUEST_SECTIONS },
  uk_ilap_sections: { id: 'uk_ilap_sections', name: 'ILAP Innovation Passport Application', sections: DESIGNATION_REQUEST_SECTIONS },
  eu_biosimilar_maa_sections: { id: 'eu_biosimilar_maa_sections', name: 'Biosimilar MAA (EU)', sections: CTD_SECTIONS },
  jp_biosimilar_sections: { id: 'jp_biosimilar_sections', name: 'Biosimilar Application (Japan)', sections: CTD_SECTIONS },
  au_biosimilar_sections: { id: 'au_biosimilar_sections', name: 'Biosimilar Registration (TGA)', sections: CTD_SECTIONS },
  eu_generic_dcp_sections: { id: 'eu_generic_dcp_sections', name: 'Generic Decentralised Application (DCP)', sections: GENERIC_DOSSIER_SECTIONS },
  ich_clin_overview_sections: { id: 'ich_clin_overview_sections', name: 'Clinical Overview (M2.5)', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  ich_clin_summary_sections: { id: 'ich_clin_summary_sections', name: 'Clinical Summary (M2.7)', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  ich_nonclin_overview_sections: { id: 'ich_nonclin_overview_sections', name: 'Nonclinical Overview (M2.4)', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  ich_nonclin_summary_sections: { id: 'ich_nonclin_summary_sections', name: 'Nonclinical Summary (M2.6)', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  ich_tabulated_summaries_sections: { id: 'ich_tabulated_summaries_sections', name: 'Tabulated Summaries (M2.7.4)', sections: CTD_SECTIONS.filter(s => s.module === 2) },
  eu_line_extension_sections: { id: 'eu_line_extension_sections', name: 'Line Extension Application', sections: VARIATION_SECTIONS },
  eu_eudravigilance_icsr_sections: { id: 'eu_eudravigilance_icsr_sections', name: 'EudraVigilance ICSR', sections: ICSR_SECTIONS },
  ich_susar_sections: { id: 'ich_susar_sections', name: 'SUSAR (E2B ICSR)', sections: ICSR_SECTIONS },
  eu_cep_sections: { id: 'eu_cep_sections', name: 'Certificate of Suitability Application (EDQM)', sections: MASTER_FILE_SECTIONS },
  eu_gmp_cert_sections: { id: 'eu_gmp_cert_sections', name: 'GMP Certificate File', sections: QMS_SECTIONS },
  ich_stability_protocol_sections: { id: 'ich_stability_protocol_sections', name: 'Stability Protocol (ICH Q1A/Q1E)', sections: COMPARABILITY_SECTIONS },
  eu_nb_consult_sections: { id: 'eu_nb_consult_sections', name: 'Notified Body Consultation Briefing', sections: DEVICE_PRESUB_SECTIONS },
  eu_mdr_class_i_sections: { id: 'eu_mdr_class_i_sections', name: 'EU MDR Class I Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_mdr_class_iia_sections: { id: 'eu_mdr_class_iia_sections', name: 'EU MDR Class IIa Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_mdr_class_iib_sections: { id: 'eu_mdr_class_iib_sections', name: 'EU MDR Class IIb Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_mdr_class_iii_sections: { id: 'eu_mdr_class_iii_sections', name: 'EU MDR Class III Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  jp_nintei_sections: { id: 'jp_nintei_sections', name: 'Nintei Certification File (PMDA)', sections: DEVICE_TECHDOC_SECTIONS },
  cn_device_reg_sections: { id: 'cn_device_reg_sections', name: 'Device Registration File (NMPA)', sections: DEVICE_TECHDOC_SECTIONS },
  au_device_inclusion_sections: { id: 'au_device_inclusion_sections', name: 'ARTG Device Inclusion File (TGA)', sections: DEVICE_TECHDOC_SECTIONS },
  ch_device_conformity_sections: { id: 'ch_device_conformity_sections', name: 'Device Conformity File (Swissmedic)', sections: DEVICE_TECHDOC_SECTIONS },
  br_device_reg_sections: { id: 'br_device_reg_sections', name: 'Device Registration File (ANVISA)', sections: DEVICE_TECHDOC_SECTIONS },
  eu_clin_investigation_sections: { id: 'eu_clin_investigation_sections', name: 'EU MDR Clinical Investigation Application', sections: DEVICE_CLINICAL_SECTIONS },
  iso_cip_sections: { id: 'iso_cip_sections', name: 'Clinical Investigation Plan (ISO 14155)', sections: DEVICE_CLINICAL_SECTIONS },
  eu_sig_change_sections: { id: 'eu_sig_change_sections', name: 'Significant Change Notification (MDR Art. 120)', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_mir_sections: { id: 'eu_mir_sections', name: 'Manufacturer Incident Report (MDR Art. 87)', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_trend_report_device_sections: { id: 'eu_trend_report_device_sections', name: 'Trend Report (MDR Art. 88)', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_ivdr_class_a_sections: { id: 'eu_ivdr_class_a_sections', name: 'EU IVDR Class A Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_ivdr_class_b_sections: { id: 'eu_ivdr_class_b_sections', name: 'EU IVDR Class B Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_ivdr_class_cd_sections: { id: 'eu_ivdr_class_cd_sections', name: 'EU IVDR Class C/D Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  eu_cdx_ivdr_d_sections: { id: 'eu_cdx_ivdr_d_sections', name: 'CDx IVDR Class D Technical Documentation', sections: DEVICE_TECHDOC_SECTIONS },
  jp_cdx_sections: { id: 'jp_cdx_sections', name: 'CDx Approval File (PMDA)', sections: DEVICE_TECHDOC_SECTIONS },
  eu_ivd_clin_evidence_sections: { id: 'eu_ivd_clin_evidence_sections', name: 'IVDR Clinical Evidence Summary', sections: IVD_PERFORMANCE_SECTIONS },
  us_ivd_analytical_validation_sections: { id: 'us_ivd_analytical_validation_sections', name: 'Analytical Validation Report', sections: IVD_PERFORMANCE_SECTIONS },
  jp_ivd_approval_sections: { id: 'jp_ivd_approval_sections', name: 'IVD Approval File (PMDA)', sections: DEVICE_TECHDOC_SECTIONS },
  cn_ivd_reg_sections: { id: 'cn_ivd_reg_sections', name: 'IVD Registration File (NMPA)', sections: DEVICE_TECHDOC_SECTIONS },
  au_ivd_inclusion_sections: { id: 'au_ivd_inclusion_sections', name: 'ARTG IVD Inclusion File (TGA)', sections: DEVICE_TECHDOC_SECTIONS },
  ca_ivd_licence_sections: { id: 'ca_ivd_licence_sections', name: 'IVD Licence File (Health Canada)', sections: DEVICE_TECHDOC_SECTIONS },
  eu_ivd_pms_plan_sections: { id: 'eu_ivd_pms_plan_sections', name: 'IVDR Post-Market Surveillance Plan', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_ivd_vigilance_sections: { id: 'eu_ivd_vigilance_sections', name: 'IVDR Vigilance Report', sections: DEVICE_POSTMARKET_SECTIONS },
  eu_psur_ivd_sections: { id: 'eu_psur_ivd_sections', name: 'IVD PSUR (IVDR Art. 81)', sections: DEVICE_POSTMARKET_SECTIONS },
  ich_ectd_backbone_sections: { id: 'ich_ectd_backbone_sections', name: 'eCTD Backbone & Envelope', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  us_ctd_m1_regional_sections: { id: 'us_ctd_m1_regional_sections', name: 'CTD Module 1 — US Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  eu_ctd_m1_regional_sections: { id: 'eu_ctd_m1_regional_sections', name: 'CTD Module 1 — EU Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  jp_ctd_m1_regional_sections: { id: 'jp_ctd_m1_regional_sections', name: 'CTD Module 1 — JP Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  ca_ctd_m1_regional_sections: { id: 'ca_ctd_m1_regional_sections', name: 'CTD Module 1 — CA Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  uk_ctd_m1_regional_sections: { id: 'uk_ctd_m1_regional_sections', name: 'CTD Module 1 — UK Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  au_ctd_m1_regional_sections: { id: 'au_ctd_m1_regional_sections', name: 'CTD Module 1 — AU Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  ch_ctd_m1_regional_sections: { id: 'ch_ctd_m1_regional_sections', name: 'CTD Module 1 — CH Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  cn_ctd_m1_regional_sections: { id: 'cn_ctd_m1_regional_sections', name: 'CTD Module 1 — CN Regional', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  eu_nees_sections: { id: 'eu_nees_sections', name: 'NeeS Submission Structure', sections: CTD_SECTIONS.filter(s => s.module === 1) },
  qms_gmp_inspection_sections: { id: 'qms_gmp_inspection_sections', name: 'GMP Inspection Readiness Package', sections: QMS_SECTIONS },
  qms_gcp_compliance_sections: { id: 'qms_gcp_compliance_sections', name: 'GCP Compliance Package', sections: QMS_SECTIONS },
  qms_glp_compliance_sections: { id: 'qms_glp_compliance_sections', name: 'GLP Compliance Package', sections: QMS_SECTIONS },
  qms_qsr_820_sections: { id: 'qms_qsr_820_sections', name: 'QSR (21 CFR 820) File', sections: QMS_SECTIONS },
  qms_iso_13485_sections: { id: 'qms_iso_13485_sections', name: 'ISO 13485 QMS File', sections: QMS_SECTIONS },
  ri_strategy_sections: { id: 'ri_strategy_sections', name: 'Regulatory Strategy Document', sections: REGULATORY_INTELLIGENCE_SECTIONS },
  ri_gap_analysis_sections: { id: 'ri_gap_analysis_sections', name: 'Gap Analysis Report', sections: REGULATORY_INTELLIGENCE_SECTIONS },
  ri_competitive_sections: { id: 'ri_competitive_sections', name: 'Competitive Landscape Analysis', sections: REGULATORY_INTELLIGENCE_SECTIONS },
  ri_ha_meeting_sections: { id: 'ri_ha_meeting_sections', name: 'Health Authority Meeting Minutes', sections: REGULATORY_INTELLIGENCE_SECTIONS },

  // Default fallback
  default_sections: { id: 'default_sections', name: 'Standard CTD Sections', sections: CTD_SECTIONS },
};

// ─── Task Blueprints ──────────────────────────────────────────────────────────

// Compact milestone/task builders — a task is [id, title, description].
type TaskTriple = [string, string, string];
function ms(
  order: number,
  phase: string,
  id: string,
  title: string,
  description: string,
  tasks: TaskTriple[],
): MilestoneDefinition {
  return { id, title, description, phase, order, tasks: tasks.map(([tid, tt, td]) => ({ id: tid, title: tt, description: td })) };
}

// ── Drug / cross-cutting workflow families ────────────────────────────────────

/** Clinical trial application (IND / CTA / CTN): open a trial. 30-day clock. */
const DRUG_CTA_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_cta_author', 'Trial Package Authoring', 'Protocol, IB, and IMPD/quality', [
    ['t_protocol', 'Finalize Protocol', 'Lock the clinical protocol and synopsis (ICH E6)'],
    ['t_ib', "Finalize Investigator's Brochure", 'Current IB reflecting nonclinical + clinical data'],
    ['t_impd', 'Draft IMPD / CMC (M3)', 'Investigational product quality dossier'],
    ['t_nonclin', 'Compile Nonclinical (M4)', 'Pharmacology, PK, and toxicology to support first-in-human'],
  ]),
  ms(2, 'review', 'ms_cta_review', 'Sponsor Review', 'Medical, safety, and QC review', [
    ['t_med_review', 'Medical & Safety Review', 'Benefit-risk and starting-dose justification'],
    ['t_qc', 'QC Review', 'Consistency and completeness check across modules'],
  ]),
  ms(3, 'submission', 'ms_cta_submit', 'Assemble & Submit', 'Dossier assembly and portal submission', [
    ['t_forms', 'Regulatory Forms', 'FDA 1571/1572/3674 or regional CTA forms'],
    ['t_assemble', 'Assemble CTA Dossier', 'Compile M1–M5 for the region'],
    ['t_submit', 'Submit via Gateway/Portal', 'ESG / CTIS / regional portal; start the review clock'],
  ]),
];

/** Full marketing authorisation (NDA / BLA / MAA / NDS): market a new product. */
const DRUG_MARKETING_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_maa_author', 'Dossier Authoring', 'Integrated summaries and full CTD', [
    ['t_iss_ise', 'Integrated Summaries (ISS/ISE)', 'Integrated summary of safety and efficacy'],
    ['t_csr', 'Compile Clinical Study Reports (M5)', 'Pivotal and supportive CSRs'],
    ['t_m2', 'Draft Module 2 Summaries', 'QOS, clinical/nonclinical overviews and summaries'],
    ['t_labeling', 'Draft Labeling (M1)', 'Prescribing information / SmPC'],
  ]),
  ms(2, 'review', 'ms_maa_review', 'Cross-functional Review', 'Medical, biostat, regulatory QC', [
    ['t_xfn_review', 'Cross-functional Review', 'Medical, biostatistics, and regulatory sign-off'],
    ['t_presub_mtg', 'Pre-submission Meeting', 'Type B/C or CHMP pre-submission alignment'],
  ]),
  ms(3, 'finalization', 'ms_maa_submit', 'Finalize & Submit', 'Signatures, packaging, fee, gateway', [
    ['t_esign', 'Electronic Signatures', '21 CFR Part 11 signatures'],
    ['t_fee', 'User Fee / Application Form', 'PDUFA/BsUFA fee, FDA 356h or regional application form'],
    ['t_ectd', 'eCTD Assembly & Validation', 'Assemble and validate the eCTD package'],
    ['t_submit', 'Submit to Agency', 'Electronic submission via gateway'],
  ]),
  ms(4, 'post_submission', 'ms_maa_post', 'Post-submission', 'Agency interaction to decision', [
    ['t_irs', 'Respond to Information Requests', 'Answer agency questions within clock'],
    ['t_advcom', 'Advisory Committee / Oral Explanation', 'Prepare and support where convened'],
  ]),
];

/** Generic / abbreviated marketing (ANDA / ANDS / GDA): bioequivalence route. */
const GENERIC_MARKETING_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_gen_author', 'Abbreviated Dossier', 'Bioequivalence and quality', [
    ['t_be', 'Bioequivalence Study Report', 'BE/BA demonstration vs the reference product'],
    ['t_quality', 'Quality (M3.2.S / M3.2.P)', 'Drug substance and product quality'],
    ['t_label', 'Labeling to Reference', 'Match the reference-listed-drug labeling'],
  ]),
  ms(2, 'review', 'ms_gen_review', 'Review', 'BE statistics and QC', [
    ['t_be_stats', 'BE Statistical Review', 'Confidence-interval and statistical adequacy'],
    ['t_qc', 'QC Review', 'Completeness of the abbreviated dossier'],
  ]),
  ms(3, 'submission', 'ms_gen_submit', 'Assemble & Submit', 'Package and submit', [
    ['t_assemble', 'Assemble Dossier', 'Abbreviated CTD/ACTD assembly'],
    ['t_submit', 'Submit to Agency', 'Electronic submission'],
  ]),
];

/** Variation / supplement / change (Type IA/IB/II, PAS/CBE, partial change). */
const VARIATION_SUPPLEMENT_TASKS: MilestoneDefinition[] = [
  ms(1, 'classification', 'ms_var_class', 'Change Classification', 'Determine the variation category', [
    ['t_classify', 'Classify the Change', 'Type IA/IB/II or PAS/CBE-30/CBE-0 determination'],
  ]),
  ms(2, 'assessment', 'ms_var_assess', 'Impact Assessment', 'Present-vs-proposed and risk', [
    ['t_compare', 'Present-vs-Proposed Comparison', 'Document the change side by side'],
    ['t_data', 'Affected-Module Data', 'Supporting data for the changed modules'],
    ['t_risk', 'Risk Assessment', 'Assess impact on quality, safety, efficacy'],
  ]),
  ms(3, 'submission', 'ms_var_submit', 'Update & Submit', 'Update sections, QC, submit', [
    ['t_update', 'Update Affected Sections & Labeling', 'Revise only the impacted content'],
    ['t_submit', 'QC & Submit', 'Quality check and agency submission'],
  ]),
];

/** Renewal (5-year MA renewal). */
const RENEWAL_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_ren_author', 'Renewal Package', 'Updated info and benefit-risk', [
    ['t_pi', 'Updated Product Information', 'Refresh labeling and administrative data'],
    ['t_br', 'Benefit-Risk Assessment', 'Consolidated benefit-risk since approval'],
    ['t_psur_ref', 'PSUR/PBRER Reference', 'Cross-reference the latest periodic report'],
  ]),
  ms(2, 'review', 'ms_ren_review', 'Review', 'QC', [['t_qc', 'QC Review', 'Completeness and consistency']]),
  ms(3, 'submission', 'ms_ren_submit', 'Submit', 'Submit renewal', [['t_submit', 'Submit to Agency', 'Electronic submission']]),
];

/** Master file (DMF / ASMF): confidential quality dossier. */
const MASTER_FILE_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_mf_author', 'Master File Authoring', 'Restricted and applicant parts', [
    ['t_quality', 'Quality Data (3.2.S)', 'Manufacturing, controls, and characterization'],
    ['t_parts', 'Applicant / Restricted Parts', 'Open and closed parts of the master file'],
  ]),
  ms(2, 'review', 'ms_mf_review', 'Review', 'QC', [['t_qc', 'QC Review', 'Completeness check']]),
  ms(3, 'submission', 'ms_mf_submit', 'File & Grant Access', 'File and issue letters of access', [
    ['t_submit', 'File Master File', 'Submit to the agency'],
    ['t_loa', 'Letters of Access', 'Issue authorization to referencing applicants'],
  ]),
];

/** Pediatric plan (PIP / PSP). */
const PEDIATRIC_PLAN_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_ped_author', 'Pediatric Plan', 'Development strategy and studies', [
    ['t_strategy', 'Pediatric Development Strategy', 'Age-appropriate development plan'],
    ['t_studies', 'Study Plans', 'Proposed pediatric studies'],
    ['t_waivers', 'Waivers & Deferrals', 'Justify any waivers or deferrals'],
  ]),
  ms(2, 'review', 'ms_ped_review', 'Review', 'QC', [['t_qc', 'QC Review', 'Completeness check']]),
  ms(3, 'submission', 'ms_ped_submit', 'Submit', 'Submit plan', [['t_submit', 'Submit to Agency', 'PDCO / FDA submission']]),
];

/** Designation request (breakthrough / fast track / orphan / PRIME / RMAT). */
const DESIGNATION_TASKS: MilestoneDefinition[] = [
  ms(1, 'eligibility', 'ms_des_elig', 'Eligibility Justification', 'Unmet need / prevalence case', [
    ['t_case', 'Eligibility Case', 'Serious condition, unmet need, or prevalence threshold'],
  ]),
  ms(2, 'authoring', 'ms_des_author', 'Request Package', 'Draft the designation request', [
    ['t_package', 'Designation Request', 'Preliminary evidence and rationale'],
  ]),
  ms(3, 'submission', 'ms_des_submit', 'Submit', 'Submit and interact', [
    ['t_submit', 'Submit Request', 'Submit to the agency program'],
    ['t_interact', 'Agency Interaction', 'Respond to clarification requests'],
  ]),
];

/** Aggregate safety / pharmacovigilance (PSUR / DSUR / PBRER / REMS / RMP / signal). */
const AGGREGATE_SAFETY_TASKS: MilestoneDefinition[] = [
  ms(1, 'data_lock', 'ms_pv_lock', 'Data Lock & Retrieval', 'DLP and case retrieval', [
    ['t_dlp', 'Data Lock Point', 'Set the reporting interval and lock the data'],
    ['t_lines', 'Case Retrieval & Line Listings', 'Retrieve cases and generate line listings'],
  ]),
  ms(2, 'analysis', 'ms_pv_analysis', 'Aggregate Analysis', 'Benefit-risk / signal evaluation', [
    ['t_aggregate', 'Aggregate Analysis', 'Cumulative and interval safety analysis'],
    ['t_signal', 'Signal / Benefit-Risk Evaluation', 'Evaluate signals and overall benefit-risk'],
  ]),
  ms(3, 'signoff', 'ms_pv_signoff', 'Sign-off & Submit', 'QPPV medical sign-off then submit', [
    ['t_qppv', 'QPPV / Medical Sign-off', 'Qualified person medical review and sign-off'],
    ['t_submit', 'Submit / Transmit', 'Submit the report or transmit expedited cases'],
  ]),
];

/** Meeting / briefing package (Pre-IND, scientific advice). */
const MEETING_BRIEFING_TASKS: MilestoneDefinition[] = [
  ms(1, 'prepare', 'ms_mtg_prep', 'Meeting Preparation', 'Request and questions', [
    ['t_request', 'Meeting Request', 'Request the meeting and propose the format'],
    ['t_questions', 'Question List', 'Frame the specific questions for the agency'],
  ]),
  ms(2, 'authoring', 'ms_mtg_author', 'Briefing Package', 'Draft the briefing document', [
    ['t_briefing', 'Briefing Package', 'Development summary and position on each question'],
  ]),
  ms(3, 'submission', 'ms_mtg_submit', 'Submit & Meet', 'Submit package and hold the meeting', [
    ['t_submit', 'Submit Briefing Package', 'Send ahead of the meeting'],
    ['t_meeting', 'Hold Meeting & Minutes', 'Conduct the meeting and record minutes'],
  ]),
];

/** CMC / quality document (comparability protocol, quality doc, environmental). */
const CMC_QUALITY_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_cmc_author', 'CMC Authoring', 'Draft the quality/CMC package', [
    ['t_data', 'Quality Data Package', 'Manufacturing, controls, characterization, stability'],
  ]),
  ms(2, 'review', 'ms_cmc_review', 'Review', 'QC', [['t_qc', 'QC Review', 'CMC completeness and consistency']]),
  ms(3, 'submission', 'ms_cmc_submit', 'File', 'Submit or file', [['t_submit', 'Submit / File', 'File with the agency or in the dossier']]),
];

/** Single clinical document (CSR / protocol / IB / SAP / ICF) — component, no gateway. */
const CLINICAL_DOCUMENT_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_cd_author', 'Authoring', 'Draft the document', [
    ['t_draft', 'Draft Document', 'Author per the ICH-harmonised structure'],
  ]),
  ms(2, 'review', 'ms_cd_review', 'Review', 'Medical, biostatistics, QC', [
    ['t_med', 'Medical & Biostatistics Review', 'Scientific and statistical accuracy'],
    ['t_qc', 'QC Review', 'Editorial and consistency check'],
  ]),
  ms(3, 'approval', 'ms_cd_approve', 'Approval', 'Finalize and sign (component, not filed alone)', [
    ['t_approve', 'Approve & Sign', 'Final approval and Part 11 signature'],
  ]),
];

/** CTD module authoring surface (M1–M5). */
const CTD_MODULE_TASKS: MilestoneDefinition[] = [
  ms(1, 'authoring', 'ms_mod_author', 'Module Authoring', 'Draft the module sections', [
    ['t_draft', 'Draft Module Sections', 'Author every section in this CTD module'],
  ]),
  ms(2, 'review', 'ms_mod_review', 'Review', 'QC', [['t_qc', 'QC Review', 'Module completeness and cross-references']]),
  ms(3, 'assembly', 'ms_mod_assemble', 'Assemble', 'Place the module into the dossier', [
    ['t_assemble', 'Assemble into Dossier', 'Integrate the module into the eCTD backbone'],
  ]),
];

// ── Medical device / IVD workflow families ────────────────────────────────────

/** Device market submission (510(k) / PMA / De Novo / CDx / device MA). */
const DEVICE_SUBMISSION_TASKS: MilestoneDefinition[] = [
  ms(1, 'evidence', 'ms_dev_evidence', 'Design & Evidence', 'Description, performance, safety', [
    ['t_desc', 'Device Description & Intended Use', 'Design, principles of operation, indications'],
    ['t_perf', 'Bench / Predicate or Clinical Evidence', 'Substantial equivalence or valid scientific evidence'],
    ['t_biocomp', 'Biocompatibility & Safety', 'Biocompatibility, electrical, and mechanical safety'],
    ['t_software', 'Software / Cybersecurity', 'Software documentation and cybersecurity where applicable'],
  ]),
  ms(2, 'authoring', 'ms_dev_author', 'Submission Authoring', 'Labeling and assembly', [
    ['t_labeling', 'Labeling & IFU', 'Labeling and instructions for use'],
    ['t_assemble', 'Assemble Submission', 'eSTAR / eCopy structured assembly'],
  ]),
  ms(3, 'submission', 'ms_dev_submit', 'Submit & Interact', 'Submit and respond to deficiencies', [
    ['t_submit', 'Submit to Agency', 'eSTAR / eCopy / notified-body submission'],
    ['t_ai', 'Respond to Deficiencies (AI)', 'Answer additional-information requests'],
  ]),
];

/** Device pre-submission (Q-Sub / 513(g) / SaMD pre-sub / RFD). */
const DEVICE_PRESUB_TASKS: MilestoneDefinition[] = [
  ms(1, 'prepare', 'ms_dps_prep', 'Preparation', 'Questions and testing strategy', [
    ['t_questions', 'Specific Questions', 'Frame the questions for the agency'],
    ['t_strategy', 'Testing / Classification Strategy', 'Proposed testing or classification rationale'],
  ]),
  ms(2, 'authoring', 'ms_dps_author', 'Pre-Sub Package', 'Draft the pre-submission', [
    ['t_package', 'Pre-Submission Package', 'Device description and question-by-question position'],
  ]),
  ms(3, 'submission', 'ms_dps_submit', 'Submit & Meet', 'Submit and hold the meeting', [
    ['t_submit', 'Submit Pre-Sub', 'Submit and request feedback/meeting'],
    ['t_meeting', 'Feedback Meeting', 'Hold the meeting and record minutes'],
  ]),
];

/** Device / IVD clinical investigation or performance study (IDE / performance study / PMCF / PMPF). */
const DEVICE_CLINICAL_TASKS: MilestoneDefinition[] = [
  ms(1, 'planning', 'ms_dc_plan', 'Investigation Planning', 'CIP and risk analysis (ISO 14155)', [
    ['t_cip', 'Clinical Investigation Plan', 'Design, endpoints, and statistical plan'],
    ['t_risk', 'Risk Analysis', 'Benefit-risk and subject protection'],
  ]),
  ms(2, 'authoring', 'ms_dc_author', 'Study Documents', 'IB, consent, monitoring', [
    ['t_ib', 'Investigator Brochure', 'Device background for investigators'],
    ['t_icf', 'Informed Consent & Ethics', 'Consent forms and ethics documentation'],
    ['t_monitoring', 'Monitoring & Data Management', 'Monitoring and data-management plans'],
  ]),
  ms(3, 'submission', 'ms_dc_submit', 'Submit', 'IRB/ethics and agency', [
    ['t_submit', 'Submit to IRB & Agency', 'IDE / performance-study application and IRB/ethics'],
  ]),
];

/** Quality management system file (ISO 13485 / 21 CFR 820) — internal, no agency submit. */
const QMS_TASKS: MilestoneDefinition[] = [
  ms(1, 'establish', 'ms_qms_establish', 'Establish', 'Procedures and records', [
    ['t_procedures', 'Procedures & Records Structure', 'Document and record control framework'],
    ['t_design', 'Design Controls', 'Design & development control records (820.30)'],
  ]),
  ms(2, 'operate', 'ms_qms_operate', 'Operate', 'CAPA and production controls', [
    ['t_capa', 'CAPA', 'Corrective and preventive action process'],
    ['t_production', 'Production & Process Controls', 'Process validation and controls'],
  ]),
  ms(3, 'assurance', 'ms_qms_assure', 'Assurance', 'Review and audit (internal file)', [
    ['t_mgmt_review', 'Management Review', 'Periodic management review'],
    ['t_audit', 'Internal Audit', 'Internal audit and effectiveness checks'],
  ]),
];

/** Device post-market surveillance & vigilance (MDR/recall/trend/FSCA/device PSUR/PMA annual). */
const DEVICE_POSTMARKET_TASKS: MilestoneDefinition[] = [
  ms(1, 'surveillance', 'ms_dpm_surv', 'Surveillance', 'PMS plan and complaints', [
    ['t_pms', 'Post-Market Surveillance Plan', 'Proactive surveillance plan'],
    ['t_complaints', 'Complaint Handling', 'Intake, triage, and investigation'],
  ]),
  ms(2, 'vigilance', 'ms_dpm_vig', 'Vigilance', 'Reporting and trend analysis', [
    ['t_reporting', 'Adverse Event / MDR Reporting', 'Mandatory vigilance reporting'],
    ['t_trend', 'Trend Analysis', 'Detect significant increases in events'],
  ]),
  ms(3, 'action', 'ms_dpm_action', 'Action & Report', 'Field action and periodic report', [
    ['t_fsca', 'Field Safety Corrective Action', 'Corrections/removals where required'],
    ['t_periodic', 'Periodic / Annual Report', 'PSUR (device) or PMA annual report'],
  ]),
];

/** Device software lifecycle (IEC 62304 + cybersecurity + PCCP). */
const DEVICE_SOFTWARE_TASKS: MilestoneDefinition[] = [
  ms(1, 'planning', 'ms_dsw_plan', 'Planning & Requirements', 'Dev plan and SRS', [
    ['t_plan', 'Software Development Plan', 'Lifecycle plan per IEC 62304 safety class'],
    ['t_srs', 'Software Requirements', 'Specify software requirements'],
  ]),
  ms(2, 'build', 'ms_dsw_build', 'Design & Verification', 'Architecture and V&V', [
    ['t_arch', 'Architecture & Detailed Design', 'Software architecture and unit design'],
    ['t_vv', 'Verification & Testing', 'Unit, integration, and system testing'],
  ]),
  ms(3, 'security', 'ms_dsw_sec', 'Security & Change Control', 'Cybersecurity and PCCP', [
    ['t_cyber', 'Cybersecurity (Threat Model, SBOM)', 'Threat modeling, SBOM, vulnerability assessment'],
    ['t_pccp', 'Change Control / PCCP', 'Predetermined change control plan for AI/ML modifications'],
  ]),
];

// Legacy alias — the generic drug plan, retained as the neutral fallback.
const DEFAULT_DRUG_TASKS: MilestoneDefinition[] = DRUG_MARKETING_TASKS;

const TASK_BLUEPRINTS: Record<string, TaskBlueprint> = {
  // Drug / cross-cutting families
  drug_cta_tasks: { id: 'drug_cta_tasks', name: 'Clinical Trial Application Tasks', milestones: DRUG_CTA_TASKS },
  drug_marketing_tasks: { id: 'drug_marketing_tasks', name: 'Marketing Authorisation Tasks', milestones: DRUG_MARKETING_TASKS },
  generic_marketing_tasks: { id: 'generic_marketing_tasks', name: 'Generic Marketing Tasks', milestones: GENERIC_MARKETING_TASKS },
  variation_supplement_tasks: { id: 'variation_supplement_tasks', name: 'Variation / Supplement Tasks', milestones: VARIATION_SUPPLEMENT_TASKS },
  renewal_tasks: { id: 'renewal_tasks', name: 'Renewal Tasks', milestones: RENEWAL_TASKS },
  master_file_tasks: { id: 'master_file_tasks', name: 'Master File Tasks', milestones: MASTER_FILE_TASKS },
  pediatric_plan_tasks: { id: 'pediatric_plan_tasks', name: 'Pediatric Plan Tasks', milestones: PEDIATRIC_PLAN_TASKS },
  designation_request_tasks: { id: 'designation_request_tasks', name: 'Designation Request Tasks', milestones: DESIGNATION_TASKS },
  aggregate_safety_tasks: { id: 'aggregate_safety_tasks', name: 'Aggregate Safety / PV Tasks', milestones: AGGREGATE_SAFETY_TASKS },
  meeting_briefing_tasks: { id: 'meeting_briefing_tasks', name: 'Meeting / Briefing Tasks', milestones: MEETING_BRIEFING_TASKS },
  cmc_quality_tasks: { id: 'cmc_quality_tasks', name: 'CMC / Quality Tasks', milestones: CMC_QUALITY_TASKS },
  clinical_document_tasks: { id: 'clinical_document_tasks', name: 'Clinical Document Tasks', milestones: CLINICAL_DOCUMENT_TASKS },
  ctd_module_tasks: { id: 'ctd_module_tasks', name: 'CTD Module Tasks', milestones: CTD_MODULE_TASKS },
  // Device / IVD families
  device_submission_tasks: { id: 'device_submission_tasks', name: 'Device Market Submission Tasks', milestones: DEVICE_SUBMISSION_TASKS },
  device_presub_tasks: { id: 'device_presub_tasks', name: 'Device Pre-Submission Tasks', milestones: DEVICE_PRESUB_TASKS },
  device_clinical_tasks: { id: 'device_clinical_tasks', name: 'Device Clinical Investigation Tasks', milestones: DEVICE_CLINICAL_TASKS },
  qms_tasks: { id: 'qms_tasks', name: 'Quality Management System Tasks', milestones: QMS_TASKS },
  device_postmarket_tasks: { id: 'device_postmarket_tasks', name: 'Device Post-Market Tasks', milestones: DEVICE_POSTMARKET_TASKS },
  device_software_tasks: { id: 'device_software_tasks', name: 'Device Software Lifecycle Tasks', milestones: DEVICE_SOFTWARE_TASKS },
  // Explicit keys for the MDR Art. 117 / IVDR Art. 48(6) consultations. The
  // NB Opinion is a device-dossier assessment (evidence → assemble → submit &
  // respond to deficiencies) — the family resolver would give this
  // pharma_biotech pre_submission row the drug meeting/briefing plan, which is
  // the wrong rhythm. The Art. 48(6) consultation is a question-driven
  // scientific-opinion request, not a market submission, so it takes the
  // pre-submission consultation rhythm rather than device_submission_tasks.
  eu_mdr_art117_nbop_tasks: { id: 'eu_mdr_art117_nbop_tasks', name: 'MDR Art. 117 NB Opinion Tasks', milestones: DEVICE_SUBMISSION_TASKS },
  eu_ivdr_art48_consult_tasks: { id: 'eu_ivdr_art48_consult_tasks', name: 'IVDR Art. 48(6) Consultation Tasks', milestones: DEVICE_PRESUB_TASKS },
  // Back-compat keys used as explicit defaultTaskBlueprint on the core US drug entries
  us_ind_tasks: { id: 'us_ind_tasks', name: 'IND Task Blueprint', milestones: DRUG_CTA_TASKS },
  us_nda_tasks: { id: 'us_nda_tasks', name: 'NDA Task Blueprint', milestones: DRUG_MARKETING_TASKS },
  us_bla_tasks: { id: 'us_bla_tasks', name: 'BLA Task Blueprint', milestones: DRUG_MARKETING_TASKS },
  default_tasks: { id: 'default_tasks', name: 'Standard Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
};

/**
 * Resolve which task blueprint a registry entry uses. An explicit, real
 * defaultTaskBlueprint wins; otherwise the entry is resolved to a workflow
 * family by (applicationFamily, segment, productClass). A drug CTA plan is
 * wrong for an eSTAR device 510(k), an ISO 13485 QMS file, or an aggregate PV
 * report — this keeps each family on its real rhythm instead of the generic
 * drug-dossier plan. Shared by the runtime bootstrap and the coverage gate so
 * they never diverge.
 */
export function resolveTaskBlueprintKey(entry: RegulatoryApplicationType): string {
  const explicit = entry.defaultTaskBlueprint;
  if (explicit && explicit in TASK_BLUEPRINTS && explicit !== 'default_tasks') return explicit;

  const seg = entry.segment;
  const isDevice = seg === 'medical_devices' || seg === 'diagnostics_ivd';
  const fam = entry.applicationFamily;

  switch (fam) {
    case 'clinical_trial':
      return isDevice ? 'device_clinical_tasks' : 'drug_cta_tasks';
    case 'marketing_authorization':
      if (isDevice) return 'device_submission_tasks';
      return entry.productClass?.includes('generic') ? 'generic_marketing_tasks' : 'drug_marketing_tasks';
    case 'pre_submission':
      return isDevice ? 'device_presub_tasks' : 'meeting_briefing_tasks';
    case 'post_market':
      return isDevice ? 'device_postmarket_tasks' : 'aggregate_safety_tasks';
    case 'supplement':
      return isDevice ? 'device_submission_tasks' : 'variation_supplement_tasks';
    case 'variation':
      return 'variation_supplement_tasks';
    case 'renewal':
      return 'renewal_tasks';
    case 'master_file':
      return 'master_file_tasks';
    case 'pediatric':
      return 'pediatric_plan_tasks';
    case 'orphan':
    case 'designation':
      return 'designation_request_tasks';
    case 'safety_report':
      return 'aggregate_safety_tasks';
    case 'quality_cmc':
      return 'cmc_quality_tasks';
    case 'clinical_document':
      return 'clinical_document_tasks';
    case 'dossier_module':
      return 'ctd_module_tasks';
    case 'device_clearance':
    case 'device_approval':
    case 'companion_diagnostic':
      return 'device_submission_tasks';
    case 'quality_system':
      return 'qms_tasks';
    case 'software_documentation':
      return 'device_software_tasks';
    default:
      return 'default_tasks';
  }
}

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
  return TASK_BLUEPRINTS[resolveTaskBlueprintKey(entry)] || TASK_BLUEPRINTS.default_tasks;
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
