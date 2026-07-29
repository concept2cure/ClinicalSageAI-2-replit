/**
 * Document template library — the canonical SECTION STRUCTURE (heading skeleton)
 * of the key submission documents, with each section's purpose and regulatory basis.
 *
 * WHY THIS EXISTS: server/services/regulatory/templateCatalog.ts already lists
 * document templates as METADATA (id, title, format, aiDraftable) but carries no
 * actual document structure — there is no canonical heading outline an author or
 * the section-generation engine can scaffold against. This library supplies that:
 * for each document, the ordered sections (number + heading + purpose + required),
 * keyed by the same ids templateCatalog uses where they overlap.
 *
 * HONESTY ABOUT CONTENT: these are the FACTUAL document structures defined by the
 * cited published guidance (ICH M4Q/M4S/M4E for the CTD summaries; 21 CFR 807.92
 * for the 510(k) summary; the EU SmPC guideline / Directive 2001/83/EC Art. 11 for
 * the SmPC; EU MDR Annex I for the GSPR). They are heading skeletons + concise
 * purpose notes — NOT drafted regulatory prose and NOT a substitute for the current
 * agency template. Authors fill the content; this provides the spine.
 *
 * PURE + DETERMINISTIC data + lookups: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/document-template-library
 */

export interface TemplateSection {
  /** Section number within the document (e.g. "2.5.4", "4.1", "I.1"). */
  number: string;
  heading: string;
  /** What this section is for (concise, factual). */
  purpose: string;
  required: boolean;
}

export interface DocumentTemplateStructure {
  /** Stable id; matches templateCatalog ids where the document overlaps. */
  id: string;
  title: string;
  /** Submission families this structure applies to. */
  families: Array<'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis'>;
  /** CTD section code where applicable (e.g. "2.5"). */
  ctdSection?: string;
  /** Published structure source. */
  regulatoryBasis: string;
  sections: TemplateSection[];
}

export const DOCUMENT_TEMPLATES: DocumentTemplateStructure[] = [
  // ── CTD Module 2 summaries (ICH M4) ─────────────────────────────────────────
  {
    id: 'quality_overall_summary',
    title: 'Quality Overall Summary (QOS)',
    families: ['ectd'],
    ctdSection: '2.3',
    regulatoryBasis: 'ICH M4Q(R1) — CTD Quality',
    sections: [
      { number: '2.3.Intro', heading: 'Introduction', purpose: 'Proprietary name, nonproprietary name, dosage form, strength, route, and proposed indication.', required: true },
      { number: '2.3.S', heading: 'Drug Substance', purpose: 'Summary of general information, manufacture, characterisation, control, reference standards, container closure, and stability for each drug substance.', required: true },
      { number: '2.3.P', heading: 'Drug Product', purpose: 'Summary of description/composition, development, manufacture, control of excipients and product, reference standards, container closure, and stability.', required: true },
      { number: '2.3.A', heading: 'Appendices', purpose: 'Facilities and equipment, adventitious agents safety evaluation, and other appendices.', required: false },
      { number: '2.3.R', heading: 'Regional Information', purpose: 'Region-specific quality information (e.g. process validation scheme, medical devices).', required: false },
    ],
  },
  {
    id: 'nonclinical_overview',
    title: 'Nonclinical Overview',
    families: ['ectd'],
    ctdSection: '2.4',
    regulatoryBasis: 'ICH M4S(R2) — CTD Safety',
    sections: [
      { number: '2.4.1', heading: 'Overview of the Nonclinical Testing Strategy', purpose: 'Rationale and approach for the nonclinical program.', required: true },
      { number: '2.4.2', heading: 'Pharmacology', purpose: 'Integrated overview of primary/secondary pharmacodynamics, safety pharmacology, and interactions.', required: true },
      { number: '2.4.3', heading: 'Pharmacokinetics', purpose: 'Integrated overview of absorption, distribution, metabolism, excretion, and interactions.', required: true },
      { number: '2.4.4', heading: 'Toxicology', purpose: 'Integrated overview of single/repeat-dose toxicity, genotoxicity, carcinogenicity, reproductive/developmental toxicity, and local tolerance.', required: true },
      { number: '2.4.5', heading: 'Integrated Overview and Conclusions', purpose: 'Coherent risk characterisation across the nonclinical findings.', required: true },
      { number: '2.4.6', heading: 'List of Literature References', purpose: 'References cited in the nonclinical overview.', required: false },
    ],
  },
  {
    id: 'clinical_overview',
    title: 'Clinical Overview',
    families: ['ectd'],
    ctdSection: '2.5',
    regulatoryBasis: 'ICH M4E(R2) — CTD Efficacy',
    sections: [
      { number: '2.5.1', heading: 'Product Development Rationale', purpose: 'Scientific rationale and the development program’s logic.', required: true },
      { number: '2.5.2', heading: 'Overview of Biopharmaceutics', purpose: 'Critical analysis of formulation/biopharmaceutic data.', required: true },
      { number: '2.5.3', heading: 'Overview of Clinical Pharmacology', purpose: 'PK, PD, exposure-response, and special-population pharmacology.', required: true },
      { number: '2.5.4', heading: 'Overview of Efficacy', purpose: 'Critical analysis of efficacy across the relevant studies and endpoints.', required: true },
      { number: '2.5.5', heading: 'Overview of Safety', purpose: 'Critical analysis of the safety database, exposure, and key risks.', required: true },
      { number: '2.5.6', heading: 'Benefits and Risks Conclusions', purpose: 'Integrated benefit-risk assessment supporting the indication.', required: true },
    ],
  },
  {
    id: 'clinical_summary',
    title: 'Clinical Summary',
    families: ['ectd'],
    ctdSection: '2.7',
    regulatoryBasis: 'ICH M4E(R2) — CTD Efficacy',
    sections: [
      { number: '2.7.1', heading: 'Summary of Biopharmaceutic Studies and Associated Analytical Methods', purpose: 'Factual summary of biopharmaceutic study results and methods.', required: true },
      { number: '2.7.2', heading: 'Summary of Clinical Pharmacology Studies', purpose: 'Factual summary of human PK/PD and clinical pharmacology.', required: true },
      { number: '2.7.3', heading: 'Summary of Clinical Efficacy', purpose: 'Factual summary of efficacy by indication, with pooled analyses.', required: true },
      { number: '2.7.4', heading: 'Summary of Clinical Safety', purpose: 'Factual summary of exposure, adverse events, labs, and special populations.', required: true },
      { number: '2.7.5', heading: 'Literature References', purpose: 'References cited in the clinical summary.', required: false },
      { number: '2.7.6', heading: 'Synopses of Individual Studies', purpose: 'Tabular study synopses.', required: false },
    ],
  },

  // ── Administrative ──────────────────────────────────────────────────────────
  {
    id: 'cover_letter',
    title: 'Submission Cover Letter',
    families: ['ectd', 'estar', 'ctis'],
    ctdSection: '1.1',
    regulatoryBasis: 'Regional Module 1 administrative guidance (FDA eCTD / EU M1 / PMDA)',
    sections: [
      { number: '1', heading: 'Applicant and Product Identification', purpose: 'Applicant/sponsor, product, application/sequence number, and submission type.', required: true },
      { number: '2', heading: 'Purpose of the Submission', purpose: 'What this sequence contains and why it is being filed.', required: true },
      { number: '3', heading: 'Regulatory References', purpose: 'Prior meetings, agreements, designations, and related applications.', required: false },
      { number: '4', heading: 'Contents Overview', purpose: 'High-level list of the documents/modules included.', required: true },
      { number: '5', heading: 'Contact and Signature', purpose: 'Responsible contact and authorised signatory.', required: true },
    ],
  },

  // ── FDA device — 510(k) summary ─────────────────────────────────────────────
  {
    id: 'k510_summary',
    title: '510(k) Summary',
    families: ['estar'],
    regulatoryBasis: '21 CFR 807.92 (510(k) Summary)',
    sections: [
      { number: '1', heading: 'Submitter Information', purpose: 'Submitter name, address, contact, and date prepared.', required: true },
      { number: '2', heading: 'Device Name', purpose: 'Trade/proprietary name, common name, and classification name.', required: true },
      { number: '3', heading: 'Predicate Device(s)', purpose: 'The legally marketed predicate(s) to which equivalence is claimed.', required: true },
      { number: '4', heading: 'Device Description', purpose: 'Description of the device and how it functions.', required: true },
      { number: '5', heading: 'Intended Use / Indications for Use', purpose: 'Statement of intended use and indications.', required: true },
      { number: '6', heading: 'Technological Characteristics Comparison', purpose: 'Comparison of the device’s technology to the predicate.', required: true },
      { number: '7', heading: 'Performance Data', purpose: 'Summary of non-clinical and, where applicable, clinical performance testing.', required: true },
      { number: '8', heading: 'Substantial Equivalence Conclusion', purpose: 'Conclusion that the device is substantially equivalent to the predicate.', required: true },
    ],
  },

  // ── EU — SmPC ───────────────────────────────────────────────────────────────
  {
    id: 'smpc',
    title: 'Summary of Product Characteristics (SmPC)',
    families: ['ectd'],
    regulatoryBasis: 'Directive 2001/83/EC Art. 11; EU SmPC guideline / QRD template',
    sections: [
      { number: '1', heading: 'Name of the Medicinal Product', purpose: 'Invented name, strength, and pharmaceutical form.', required: true },
      { number: '2', heading: 'Qualitative and Quantitative Composition', purpose: 'Active substance(s) and excipients with known effect.', required: true },
      { number: '3', heading: 'Pharmaceutical Form', purpose: 'The pharmaceutical form and appearance.', required: true },
      { number: '4', heading: 'Clinical Particulars', purpose: 'Indications, posology, contraindications, warnings, interactions, fertility/pregnancy, effects on driving, undesirable effects, overdose (4.1–4.9).', required: true },
      { number: '5', heading: 'Pharmacological Properties', purpose: 'Pharmacodynamic, pharmacokinetic, and preclinical safety properties (5.1–5.3).', required: true },
      { number: '6', heading: 'Pharmaceutical Particulars', purpose: 'Excipients, incompatibilities, shelf life, storage, container, handling (6.1–6.6).', required: true },
      { number: '7', heading: 'Marketing Authorisation Holder', purpose: 'Name and address of the MAH.', required: true },
      { number: '8', heading: 'Marketing Authorisation Number(s)', purpose: 'The MA number(s).', required: true },
      { number: '9', heading: 'Date of First Authorisation / Renewal', purpose: 'Authorisation and renewal dates.', required: true },
      { number: '10', heading: 'Date of Revision of the Text', purpose: 'Date the SmPC text was last revised.', required: true },
    ],
  },

  // ── EU device — GSPR (MDR Annex I) ──────────────────────────────────────────
  {
    id: 'gspr_checklist',
    title: 'General Safety and Performance Requirements (GSPR) Checklist',
    families: ['eu_mdr', 'eu_ivdr'],
    regulatoryBasis: 'Regulation (EU) 2017/745 (MDR) Annex I (IVDR Annex I is parallel)',
    sections: [
      { number: 'I', heading: 'Chapter I — General Requirements', purpose: 'Requirements 1–9: safety/performance, risk management, risk-control, lifecycle risk.', required: true },
      { number: 'II', heading: 'Chapter II — Requirements Regarding Design and Manufacture', purpose: 'Requirements 10–22: chemical/physical/biological properties, infection, construction, software, energy, etc.', required: true },
      { number: 'III', heading: 'Chapter III — Information Supplied with the Device', purpose: 'Requirement 23: label and instructions for use.', required: true },
    ],
  },

  // ── EU IVD — Performance Evaluation Report ──────────────────────────────────
  {
    id: 'performance_evaluation_report',
    title: 'Performance Evaluation Report (PER)',
    families: ['eu_ivdr'],
    regulatoryBasis: 'Regulation (EU) 2017/746 (IVDR) Annex XIII',
    sections: [
      { number: '1', heading: 'Scientific Validity', purpose: 'Demonstration of the association of the analyte with the clinical condition.', required: true },
      { number: '2', heading: 'Analytical Performance', purpose: 'Analytical sensitivity/specificity, accuracy, precision, and other analytical characteristics.', required: true },
      { number: '3', heading: 'Clinical Performance', purpose: 'Diagnostic sensitivity/specificity and predictive values in the intended population.', required: true },
      { number: '4', heading: 'Performance Evaluation Conclusion', purpose: 'Overall conclusion on benefit-risk based on the performance evidence.', required: true },
    ],
  },

  // ── EU CTA — IMPD ───────────────────────────────────────────────────────────
  {
    id: 'impd',
    title: 'Investigational Medicinal Product Dossier (IMPD)',
    families: ['ctis'],
    regulatoryBasis: 'Regulation (EU) 536/2014; EU IMPD guidance',
    sections: [
      { number: 'S', heading: 'Drug Substance (Quality)', purpose: 'Quality data on the active substance for the IMP.', required: true },
      { number: 'P', heading: 'Drug Product (Quality)', purpose: 'Quality data on the investigational medicinal product.', required: true },
      { number: 'NC', heading: 'Nonclinical Pharmacology and Toxicology', purpose: 'Nonclinical safety supporting the trial.', required: true },
      { number: 'C', heading: 'Previous Clinical Trial and Human Experience', purpose: 'Summary of prior clinical experience relevant to safety.', required: true },
      { number: 'BR', heading: 'Overall Benefit-Risk Assessment', purpose: 'Integrated benefit-risk for the proposed trial.', required: true },
    ],
  },

  // ── Investigator's Brochure (ICH E6) ────────────────────────────────────────
  {
    id: 'investigators_brochure',
    title: "Investigator's Brochure (IB)",
    families: ['ectd', 'ctis'],
    regulatoryBasis: 'ICH E6(R2) Good Clinical Practice §7',
    sections: [
      { number: '1', heading: 'Summary', purpose: 'Concise summary of the significant physical, chemical, pharmaceutical, pharmacological, toxicological, and clinical information.', required: true },
      { number: '2', heading: 'Introduction', purpose: 'Chemical/generic name, properties, rationale, and anticipated indications.', required: true },
      { number: '3', heading: 'Physical, Chemical and Pharmaceutical Properties and Formulation', purpose: 'Description of the substance and formulation.', required: true },
      { number: '4', heading: 'Nonclinical Studies', purpose: 'Nonclinical pharmacology, pharmacokinetics, and toxicology results.', required: true },
      { number: '5', heading: 'Effects in Humans', purpose: 'Pharmacokinetics, safety, efficacy, and marketing experience in humans.', required: true },
      { number: '6', heading: 'Summary of Data and Guidance for the Investigator', purpose: 'Overall discussion and guidance on recognising/treating possible overdose and adverse reactions.', required: true },
    ],
  },

  // ── EU Risk Management Plan (GVP Module V) ──────────────────────────────────
  {
    id: 'risk_management_plan',
    title: 'Risk Management Plan (RMP)',
    families: ['ectd'],
    regulatoryBasis: 'EU GVP Module V; Commission Implementing Regulation (EU) 520/2012',
    sections: [
      { number: 'I', heading: 'Product Overview', purpose: 'Administrative information about the product and the RMP.', required: true },
      { number: 'II', heading: 'Safety Specification', purpose: 'Modules SI–SVIII: epidemiology, nonclinical, clinical-trial exposure, populations not studied, post-authorisation experience, and the safety concerns (important identified/potential risks, missing information).', required: true },
      { number: 'III', heading: 'Pharmacovigilance Plan', purpose: 'Routine and additional pharmacovigilance activities to characterise the safety concerns.', required: true },
      { number: 'IV', heading: 'Plans for Post-Authorisation Efficacy Studies', purpose: 'PAES where required.', required: false },
      { number: 'V', heading: 'Risk Minimisation Measures', purpose: 'Routine and additional risk-minimisation measures and their effectiveness evaluation.', required: true },
      { number: 'VI', heading: 'Summary of the Risk Management Plan', purpose: 'Public-facing summary.', required: true },
      { number: 'VII', heading: 'Annexes', purpose: 'Supporting annexes.', required: false },
    ],
  },

  // ── Periodic Benefit-Risk Evaluation Report (ICH E2C(R2)) ───────────────────
  {
    id: 'pbrer',
    title: 'Periodic Benefit-Risk Evaluation Report (PBRER/PSUR)',
    families: ['ectd'],
    regulatoryBasis: 'ICH E2C(R2); EU GVP Module VII',
    sections: [
      { number: '1', heading: 'Introduction', purpose: 'Reporting interval, product(s), and scope.', required: true },
      { number: '2', heading: 'Worldwide Marketing Authorisation Status', purpose: 'Authorisation dates and indications by country.', required: true },
      { number: '3', heading: 'Actions Taken for Safety Reasons', purpose: 'Significant safety-related actions in the interval.', required: true },
      { number: '4', heading: 'Changes to Reference Safety Information', purpose: 'Changes to the RSI in the interval.', required: true },
      { number: '5', heading: 'Estimated Exposure and Use Patterns', purpose: 'Cumulative and interval patient exposure.', required: true },
      { number: '6', heading: 'Data in Summary Tabulations', purpose: 'Cumulative and interval adverse-event tabulations.', required: true },
      { number: '7', heading: 'Summaries of Significant Findings from Clinical Trials', purpose: 'Completed/ongoing trial safety findings.', required: true },
      { number: '8', heading: 'Findings from Non-Interventional Studies', purpose: 'Safety findings from observational studies.', required: false },
      { number: '9', heading: 'Information from Other Clinical Trials and Sources', purpose: 'Other relevant safety information.', required: false },
      { number: '10', heading: 'Non-Clinical Data', purpose: 'Relevant nonclinical safety findings.', required: false },
      { number: '11', heading: 'Literature', purpose: 'Relevant published literature.', required: false },
      { number: '15', heading: 'Signal and Risk Evaluation', purpose: 'Summary of safety concerns, signal evaluation, and risk characterisation.', required: true },
      { number: '16', heading: 'Benefit Evaluation', purpose: 'Baseline and newly identified benefit information.', required: true },
      { number: '17', heading: 'Integrated Benefit-Risk Analysis', purpose: 'Integrated benefit-risk for approved indications.', required: true },
      { number: '18', heading: 'Conclusions and Actions', purpose: 'Conclusions and any proposed/needed actions.', required: true },
    ],
  },

  // ── Clinical Study Report (ICH E3) ──────────────────────────────────────────
  {
    id: 'clinical_study_report',
    title: 'Clinical Study Report (CSR)',
    families: ['ectd'],
    ctdSection: '5.3.5.1',
    regulatoryBasis: 'ICH E3 — Structure and Content of Clinical Study Reports',
    sections: [
      { number: '1', heading: 'Title Page', purpose: 'Study identification.', required: true },
      { number: '2', heading: 'Synopsis', purpose: 'Brief structured summary of the study.', required: true },
      { number: '6', heading: 'Introduction', purpose: 'Background and rationale.', required: true },
      { number: '7', heading: 'Study Objectives', purpose: 'Primary and secondary objectives.', required: true },
      { number: '8', heading: 'Investigational Plan', purpose: 'Design, methodology, randomisation, blinding, treatments, and endpoints.', required: true },
      { number: '9', heading: 'Study Patients', purpose: 'Disposition, protocol deviations.', required: true },
      { number: '10', heading: 'Efficacy Evaluation', purpose: 'Analysis populations, efficacy results, and statistical methods.', required: true },
      { number: '11', heading: 'Safety Evaluation', purpose: 'Exposure, adverse events, deaths/SAEs, labs, vital signs.', required: true },
      { number: '12', heading: 'Discussion and Overall Conclusions', purpose: 'Integrated interpretation of efficacy and safety.', required: true },
      { number: '14', heading: 'Tables, Figures and Graphs', purpose: 'Referenced in-text displays.', required: false },
      { number: '16', heading: 'Appendices', purpose: 'Protocol, sample CRF, statistical documentation, and listings.', required: false },
    ],
  },
];

// ── Lookups (pure) ────────────────────────────────────────────────────────────

const BY_ID = new Map(DOCUMENT_TEMPLATES.map((t) => [t.id, t]));

export function getDocumentTemplate(id: string): DocumentTemplateStructure | undefined {
  return BY_ID.get(id);
}

/** Templates applicable to a submission family. */
export function templatesForFamily(
  family: 'ectd' | 'estar' | 'eu_mdr' | 'eu_ivdr' | 'ctis'
): DocumentTemplateStructure[] {
  return DOCUMENT_TEMPLATES.filter((t) => t.families.includes(family));
}

/** Template by its CTD section code, where defined. */
export function templateForCtdSection(ctdSection: string): DocumentTemplateStructure | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.ctdSection === ctdSection);
}

export function documentTemplateIds(): string[] {
  return DOCUMENT_TEMPLATES.map((t) => t.id);
}

export default {
  DOCUMENT_TEMPLATES,
  getDocumentTemplate,
  templatesForFamily,
  templateForCtdSection,
  documentTemplateIds,
};
