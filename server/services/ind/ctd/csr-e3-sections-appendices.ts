/**
 * ICH E3 §14–§16: the tables, figures and listings, the references, and the
 * appendices — and E3's display annexes (Annex I–IVb).
 *
 * Part of the E3 overlay assembled in csr-e3-guidance.ts; see the header of
 * csr-e3-sections-plan.ts for what each field means. §16 numbering is E3's
 * own (16.1.1–16.1.12, 16.2.1–16.2.8, 16.3.1–16.3.2, 16.4).
 *
 * 2026-10-29 (CSR slice 4, docs/design/CSR_END_TO_END_2026-10-29.md): until
 * this date 27 of these headings carried only their title. Each now says what
 * it carries and, under `presentation`, how its outputs are numbered,
 * displayed or compiled. These headings are compiled from programmed outputs
 * and source documents, never drafted (e3SectionDraftingMode: 'manual'), so
 * they carry no `writing`. The TFL numbering and display conventions are
 * platform practice unless a basis says otherwise; the grading-scale and
 * exposure-adjusted-rate notes are craft, not E3.
 */

import type { E3Basis, E3Section } from './types.js';
import { CDISC_CONVENTION } from './csr-e3-basis.js';
import { CFR_314_50_F, E3_QA_R1, FDA_E3, FDA_PDF_SPECS, FDA_SDTCG, FDA_STUDY_DATA_TRC, practice } from './regulatory-basis.js';

const TFL_PRACTICE = practice('CSR TFL numbering and display practice (the SAP\'s shells decide)');

const SECTION_14: E3Section[] = [
  {
    number: '14', title: 'Tables, Figures and Graphs Referred to But Not Included in the Text', applies: 'always',
    purpose: 'The summary tables, figures and graphs the text cites but does not carry — the outputs every number in the body comes from.',
    sources: ['The SAP’s table, listing and figure shells, programmed from the ADaM datasets, each output identified so it can be traced to its program and dataset'],
    presentation: ['Each output numbered and cited from the text', 'Titles name the analysis set and treatment groups; footnotes define abbreviations and methods', 'Numbered by the heading it serves: 14.1.x demographic, 14.2.x efficacy, 14.3.1.x adverse events, 14.3.2 deaths and serious events, 14.3.3 narratives, 14.3.4 abnormal laboratory values, 14.3.5.x other safety (laboratory, vital signs, ECG) where the SAP adds it', 'Every output carries its program name, the dataset and the run date in a footer, so a rerun is detectable'],
    pitfalls: ['A value in the text that no longer matches its output after a rerun', 'An output cited in the text and not provided'],
    basis: [FDA_SDTCG, TFL_PRACTICE],
  },
  {
    number: '14.1', title: 'Demographic Data', applies: 'always', contains: ['Summary figures and tables of demographic and baseline data'],
    presentation: ['One column per treatment group and a total column; n, mean (SD), median, minimum and maximum for continuous variables; n (%) for categories, with the denominator in the column header (N=)', 'One table per analysis set the SAP requires, all-patients set first; prior and concomitant medications by ATC class and WHODrug preferred name, with the WHODrug version in the footnote'],
    see: ['11.2'], basis: [TFL_PRACTICE],
  },
  {
    number: '14.2', title: 'Efficacy Data', applies: 'always', contains: ['Summary figures and tables of the efficacy results'],
    presentation: ['One table per estimand and analysis: the estimate, its confidence interval and the p-value as the model gives them, the model and its covariates in the footnote, and the estimand’s intercurrent-event handling stated in the title or footnote', 'Time-to-event endpoints: Kaplan–Meier figure with numbers at risk under the axis, medians with confidence intervals, the hazard ratio, events and censoring counts', 'Subgroup forest plots with the estimate and interval for each level, and the overall result'],
    see: ['11.4.1'], basis: [TFL_PRACTICE],
  },
  {
    number: '14.3', title: 'Safety Data', applies: 'always',
    purpose: 'The safety outputs the text summarises: the adverse event tables, the listings and narratives of deaths and serious events, and each abnormal laboratory value.',
    presentation: ['Numbered 14.3.1–14.3.4 as E3 orders them, then any further safety outputs the SAP specifies (laboratory, vital-sign and ECG summaries) as 14.3.5 onwards'],
    see: ['12'], basis: [TFL_PRACTICE],
  },
  {
    number: '14.3.1', title: 'Displays of Adverse Events', applies: 'always', contains: ['The adverse event summary tables (§12.2.2)'],
    presentation: ['An overview table first (any TEAE, related, serious, leading to discontinuation, fatal), then TEAEs by system organ class and preferred term, then by maximum severity or grade, then by relationship', 'A patient is counted once per preferred term and once per system organ class, at the highest severity or grade where the table is by severity; the footnote says so and names the MedDRA version', 'SOCs in the internationally agreed order or by decreasing frequency, as the SAP says; PTs within SOC by decreasing frequency in the test group', 'Exposure-adjusted incidence rates (patients with the event per patient-years at risk) where exposure differs between groups, with the exposure definition in the footnote', 'Grades named with their scale and version (CTCAE, DAIDS, or the FDA vaccine toxicity scale for solicited reactions)'],
    see: ['12.2.2'], basis: [FDA_E3, TFL_PRACTICE],
  },
  {
    number: '14.3.2', title: 'Listings of Deaths, Other Serious and Significant Adverse Events', applies: 'always',
    contains: ['Listings, by patient, of every death, every other serious adverse event and every other significant adverse event, as §12.3.1 counts them'],
    presentation: ['One listing per category, sorted by treatment group and patient: patient identifier, age, sex, preferred term and verbatim term, study day of onset, duration, severity or grade, seriousness criteria, action taken, outcome, relatedness'],
    see: ['12.3.1'], basis: [TFL_PRACTICE],
  },
  {
    number: '14.3.3', title: 'Narratives of Deaths, Other Serious and Certain Other Significant Adverse Events', applies: 'always',
    contains: ['The narratives §12.3.2 calls for, when they are too long or too many for the text'],
    presentation: ['One narrative per patient, in treatment-group and patient order, each headed with the patient identifier and the event, each in the order §12.3.2 sets', 'A bookmark per narrative in the PDF, so a reviewer reaches a patient from the bookmark tree'],
    see: ['12.3.2'], basis: [FDA_PDF_SPECS, TFL_PRACTICE],
  },
  {
    number: '14.3.4', title: 'Abnormal Laboratory Value Listing (Each Patient)', applies: 'always',
    contains: ['Each abnormal laboratory value, by patient, as §12.4.1 calls for'],
    presentation: ['By parameter and patient: visit, study day, value, unit, reference range, flag or grade (with the scale and version), baseline value', 'The abnormality criterion (outside the reference range, a grade threshold, or the protocol’s clinically significant criterion) stated in the title or footnote'],
    see: ['12.4.1'], basis: [FDA_E3, TFL_PRACTICE],
  },
];

const SECTION_15: E3Section[] = [
  {
    number: '15', title: 'Reference List', applies: 'always',
    contains: ['The literature pertinent to the evaluation of the study', 'Copies of important publications attached in Appendices 16.1.11 and 16.1.12'],
    presentation: ['One consistent citation style, numbered in order of first citation in the text', 'Each reference cited in the text at least once'],
    see: ['16.1.11', '16.1.12'],
    basis: [FDA_E3],
  },
];

const SECTION_16_1: E3Section[] = [
  {
    number: '16', title: 'Appendices', applies: 'always',
    purpose: 'Everything a reviewer needs to verify the report. Prefaced by a full list of the appendices available; where the authority permits some to be provided on request, the report says which are submitted.',
    contains: ['At a minimum (ICH E3 Q&A (R1)): the protocol and every amendment, the sample case report form, the IEC / IRB approvals, the investigator list with qualifications, study-specific laboratory or analytical methods, and the patient data listings for adverse events, serious adverse events and efficacy'],
    presentation: ['A list of the appendices at the front, marking which are submitted and which are available on request', 'In an eCTD, each appendix group filed as its own leaf under the study, with the study tagging file naming its file tag'],
    basis: [E3_QA_R1],
  },
  {
    number: '16.1', title: 'Study Information', applies: 'always',
    purpose: 'The study’s source documents: protocol, case report form, ethics and consent, investigators, signatures, batches, randomisation, audits, statistical documentation, laboratory standardisation and publications.',
    presentation: ['Each document filed as it was approved or used, not retyped; scanned documents searchable'],
  },
  { number: '16.1.1', title: 'Protocol and protocol amendments', applies: 'always', contains: ['The final protocol and every amendment, in chronological order'], presentation: ['Each version with its date and version number, the amendment summaries of changes included'], basis: [E3_QA_R1] },
  {
    number: '16.1.2', title: 'Sample case report form (unique pages only)', applies: 'always',
    contains: ['One blank copy of each unique page of the case report form — a page that repeats at several visits is included once'],
    presentation: ['Unique pages only, in visit order; an annotated CRF (the SDTM variable behind each field) is filed with the datasets, not here'],
  },
  {
    number: '16.1.3', title: 'List of IECs or IRBs (plus the name of the committee chair if required by the regulatory authority) — Representative written information for patient and sample consent forms', applies: 'always',
    contains: ['Every IEC or IRB that reviewed the study, with the chair’s name where the authority requires it', 'A representative patient information sheet and consent form, and the versions used'],
    presentation: ['A table: committee, address, sites covered, chair where required'],
    see: ['5.1', '5.3'],
  },
  {
    number: '16.1.4', title: 'List and description of investigators and other important participants in the study, including brief (1 page) CVs or equivalent summaries of training and experience relevant to the performance of the clinical study', applies: 'always',
    contains: ['Every investigator, with affiliation, role and qualifications', 'A brief (one-page) CV or equivalent summary of training and experience for each, and for others whose participation materially affected the conduct of the study'],
    presentation: ['A table by site (site number, investigator, institution), followed by the CVs in the same order'],
    see: ['6'],
  },
  {
    number: '16.1.5', title: 'Signatures of principal or coordinating investigator(s) or sponsor’s responsible medical officer, depending on the regulatory authority’s requirement', applies: 'authority-dependent',
    contains: ['The signature page (E3 Annex II): the signatory’s statement that they have read the report and that it accurately describes the conduct and results of the study, with name, affiliation, signature and date'],
    presentation: ['E3 Annex II layout; one page per signatory'],
  },
  {
    number: '16.1.6', title: 'Listing of patients receiving test drug(s)/investigational product(s) from specific batches, where more than one batch was used', applies: 'when-applicable',
    contains: ['For each batch of test drug and comparator used: the patients who received it'],
    presentation: ['A listing by batch number and patient identifier, with treatment group'],
    see: ['9.4.2'],
  },
  {
    number: '16.1.7', title: 'Randomisation scheme and codes (patient identification and treatment assigned)', applies: 'always',
    contains: ['The randomisation scheme (method, stratification, blocking) and the codes: each patient identifier with the treatment assigned'],
    presentation: ['A listing by patient: randomisation number, stratum, assigned treatment, actual treatment where different'],
    see: ['9.4.3'],
  },
  {
    number: '16.1.8', title: 'Audit certificates (if available)', applies: 'when-applicable',
    contains: ['The certificates of the audits performed, where available'],
    presentation: ['Each certificate as issued, with the audited site or process and the date'],
    see: ['9.6'],
  },
  {
    number: '16.1.9', title: 'Documentation of statistical methods', applies: 'always',
    contains: ['The detailed documentation of the statistical methods — usually the final SAP and any analysis-specific documentation — while the text of the report describes the analysis for clinical and statistical reviewers'],
    presentation: ['The final SAP with its date and version, then any amendment, then analysis-specific documentation'],
    see: ['9.7.1'],
    basis: [FDA_E3, E3_QA_R1],
  },
  {
    number: '16.1.10', title: 'Documentation of inter-laboratory standardisation methods and quality assurance procedures if used', applies: 'when-applicable',
    contains: ['How results from different laboratories were standardised, and the laboratories’ quality assurance procedures, where more than one laboratory was used'],
    presentation: ['The methods documentation, then the reference ranges by laboratory'],
    see: ['9.5.4'],
  },
  {
    number: '16.1.11', title: 'Publications based on the study', applies: 'when-applicable',
    contains: ['Copies of publications based on the study'],
    presentation: ['Each publication as published, in date order'],
    basis: [FDA_E3],
  },
  {
    number: '16.1.12', title: 'Important publications referenced in the report', applies: 'when-applicable',
    contains: ['Copies of the important publications cited in the report'],
    presentation: ['In the order of the reference list (§15)'],
    basis: [FDA_E3],
  },
];

const SECTION_16_2: E3Section[] = [
  {
    number: '16.2', title: 'Patient Data Listings', applies: 'always',
    sources: ['Programmed from the SDTM / ADaM datasets the tables use, so a listing and its table cannot disagree'],
    purpose: 'The patient-level listings behind the tables, one per E3 subject, from the same datasets.',
    presentation: ['Sorted by treatment group, site and patient; the patient identifier as USUBJID; study days relative to first dose'],
    basis: [CDISC_CONVENTION],
  },
  { number: '16.2.1', title: 'Discontinued patients', applies: 'always', contains: ['Every patient who discontinued, with the date or study day and the reason'], presentation: ['By group and patient: last dose, last visit, reason as recorded on the CRF'], see: ['10.1'] },
  { number: '16.2.2', title: 'Protocol deviations', applies: 'always', contains: ['Every protocol deviation by patient, with its category and whether it was classified important'], presentation: ['By centre and patient, grouped by the §10.2 categories'], see: ['10.2'] },
  { number: '16.2.3', title: 'Patients excluded from the efficacy analysis', applies: 'always', contains: ['Every patient, visit and observation excluded from each efficacy analysis, with the reason'], presentation: ['By analysis set, group and patient (E3 asks for a tabular listing)'], see: ['11.1'] },
  { number: '16.2.4', title: 'Demographic data', applies: 'always', contains: ['Each patient’s demographic and baseline data'], presentation: ['By group and patient, the variables summarised in §14.1'], see: ['11.2'] },
  { number: '16.2.5', title: 'Compliance and/or drug concentration data (if available)', applies: 'when-applicable', contains: ['Each patient’s compliance data and drug concentrations, where collected'], presentation: ['By group, patient and visit; concentrations with time relative to dose and the assay’s lower limit of quantification'], see: ['11.3'] },
  { number: '16.2.6', title: 'Individual efficacy response data', applies: 'always', contains: ['Each patient’s efficacy data, by visit, for every efficacy variable analysed'], presentation: ['By group, patient and visit, with imputed values flagged as imputed'], see: ['11.4.3'] },
  { number: '16.2.7', title: 'Adverse event listings (each patient)', applies: 'always', contains: ['Every adverse event for each patient, with both the preferred term and the investigator’s original term'], presentation: ['By group and patient: verbatim term, preferred term, SOC, onset and end study day, severity or grade, seriousness, relationship, action taken, outcome; treatment-emergent events flagged'], see: ['12.2.4'], basis: [FDA_E3] },
  { number: '16.2.8', title: 'Listing of individual laboratory measurements by patient, when required by regulatory authorities', applies: 'authority-dependent', contains: ['Every laboratory measurement for each patient, where the authority requires it'], presentation: ['By parameter, patient and visit, with reference range and flag'], see: ['12.4.1'] },
];

const SECTION_16_3_4: E3Section[] = [
  {
    number: '16.3', title: 'Case Report Forms', applies: 'always',
    purpose: 'The completed case report forms an authority requires: those of the patients who died, had other serious adverse events or withdrew for an adverse event, and any others submitted.',
    presentation: ['One file or bookmark per patient, in group and patient order'],
    basis: [FDA_PDF_SPECS],
  },
  {
    number: '16.3.1', title: 'CRFs for deaths, other serious adverse events and withdrawals for AE', applies: 'always',
    contains: ['For an FDA application: the case report form of every patient who died during a clinical study or did not complete it because of an adverse event, whether or not the event was believed drug-related, including patients on reference drug or placebo (21 CFR 314.50(f)(2), which FDA may waive for a study where the forms are unnecessary for its review)'],
    presentation: ['Each patient’s complete CRF, including data clarification forms; selected by the death, serious-event and discontinuation-for-AE flags in the analysis data so none is missed'],
    see: ['12.3.2'],
    basis: [CFR_314_50_F],
  },
  {
    number: '16.3.2', title: 'Other CRFs submitted', applies: 'when-applicable',
    contains: ['Any further case report forms the sponsor submits or the authority requests'],
    presentation: ['As in 16.3.1, with the reason for their selection stated in the appendix list'],
  },
  {
    number: '16.4', title: 'Individual Patient Data Listings (US Archival Listings)', applies: 'authority-dependent',
    contains: ['For FDA: the case report tabulations of 21 CFR 314.50(f)(1). Where the study’s data are submitted as standardised datasets they are filed as eCTD study data (Module 5 datasets with define.xml, a Trial Summary dataset for every study, and DM and ADSL), which FDA’s technical rejection criteria check (1734, 1736)'],
    presentation: ['Filed as datasets with define.xml in the eCTD study data folders, not as PDF listings'],
    basis: [CFR_314_50_F, FDA_STUDY_DATA_TRC, FDA_SDTCG],
  },
];

export const E3_APPENDIX_SECTIONS: E3Section[] = [...SECTION_14, ...SECTION_15, ...SECTION_16_1, ...SECTION_16_2, ...SECTION_16_3_4];

/**
 * One of ICH E3's annexes: a display model for a heading — the layout and the
 * elements a reviewer expects to see, not content. Titles and elements are E3's
 * as recalled; the 1995 text could not be read on 2026-10-29 (egress refused).
 * E3 has no title-page annex: the title page's elements are §1's own.
 * Not exhaustive: E3's later annexes (as recalled, V–VII: the listing models
 * for discontinued patients and for patients and observations excluded from
 * the efficacy analysis, §10.1 / §11.1) are not modelled here yet, and IVb's
 * title and elements in particular are owed a check against the read text.
 */
export interface E3Annex {
  id: 'I' | 'II' | 'IIIa' | 'IIIb' | 'IVa' | 'IVb';
  title: string;
  /** The E3 headings the annex models. */
  for: string[];
  elements: string[];
  basis: E3Basis[];
}

const ANNEX_BASIS: E3Basis[] = [FDA_E3];

export const E3_ANNEXES: readonly E3Annex[] = Object.freeze([
  {
    id: 'I', title: 'Synopsis', for: ['2'],
    elements: ['A header box on every page: name of sponsor/company; name of finished product; name of active ingredient; individual study table referring to part of the dossier (volume, page; for national authority use only)', 'Title of study; investigators; study centre(s); publication (reference)', 'Studied period (date of first enrolment, date of last completed) and phase of development', 'Objectives; methodology; number of patients (planned and analysed); diagnosis and main criteria for inclusion', 'Test product, dose, mode of administration, batch number; duration of treatment; reference therapy, dose, mode of administration, batch number', 'Criteria for evaluation (efficacy, safety); statistical methods', 'Summary — conclusions: efficacy results, safety results, conclusion', 'Date of the report'],
    basis: ANNEX_BASIS,
  },
  {
    id: 'II', title: 'Principal or Coordinating Investigator(s) Signature(s) or Sponsor’s Responsible Medical Officer', for: ['16.1.5'],
    elements: ['Study title', 'The statement that the signatory has read the report and confirms that, to the best of their knowledge, it accurately describes the conduct and results of the study', 'Name, affiliation or address, signature and date of each signatory'],
    basis: ANNEX_BASIS,
  },
  {
    id: 'IIIa', title: 'Study Design and Schedule of Assessments (design schematic)', for: ['9.1'],
    elements: ['A flow diagram of the study periods in time order: screening, any run-in or washout, randomisation, each treatment period by group with doses, follow-up', 'The timing of each period (weeks or days) and the point of randomisation', 'The number of patients planned per group'],
    basis: ANNEX_BASIS,
  },
  {
    id: 'IIIb', title: 'Study Design and Schedule of Assessments (schedule table)', for: ['9.1', '9.5.1'],
    elements: ['Visits and their timing as columns, assessments and procedures as rows (consent, history, physical examination, vital signs, laboratory, ECG, efficacy assessments, adverse event recording, study drug dispensing and accountability)', 'A mark where an assessment is made, with footnotes for windows and conditions', 'The sampling times for drug concentrations, biomarkers or patient-reported outcomes, where collected'],
    basis: ANNEX_BASIS,
  },
  {
    id: 'IVa', title: 'Disposition of Patients (flow chart)', for: ['10.1'],
    elements: ['Patients screened and not randomised, with reasons', 'Patients randomised, then for each group: treated, completed, and discontinued with the number for each reason (adverse event, lack of efficacy, lost to follow-up, protocol violation, withdrew consent, other)', 'The numbers in each analysis set'],
    basis: ANNEX_BASIS,
  },
  {
    id: 'IVb', title: 'Disposition of Patients (by study period)', for: ['10.1'],
    elements: ['For a design with several periods (run-in, double-blind, extension), the patients entering and completing each period by group', 'The reasons for discontinuation within each period', 'The time of each discontinuation relative to the period (week or visit)'],
    basis: ANNEX_BASIS,
  },
]);

/** The annexes that model one heading, in E3 order. */
export function e3AnnexesFor(number: string): E3Annex[] {
  return E3_ANNEXES.filter((a) => a.for.includes(number));
}
