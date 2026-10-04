/**
 * ICH E3 §14–§16: the tables, figures and listings, the references, and the
 * appendices.
 *
 * Part of the E3 overlay assembled in csr-e3-guidance.ts; see the header of
 * csr-e3-sections-plan.ts for what each field means. §16 numbering is E3's
 * own (16.1.1–16.1.12, 16.2.1–16.2.8, 16.3.1–16.3.2, 16.4).
 */

import type { E3Section } from './types.js';
import { CFR_314_50_F, E3_QA_R1, FDA_E3, FDA_SDTCG, FDA_STUDY_DATA_TRC } from './csr-e3-basis.js';

export const E3_APPENDIX_SECTIONS: E3Section[] = [
  {
    number: '14', title: 'Tables, Figures and Graphs Referred to But Not Included in the Text', applies: 'always',
    purpose: 'The summary tables, figures and graphs the text cites but does not carry — the outputs every number in the body comes from.',
    sources: ['The SAP’s table, listing and figure shells, programmed from the ADaM datasets, each output identified so it can be traced to its program and dataset'],
    presentation: ['Each output numbered and cited from the text', 'Titles name the analysis set and treatment groups; footnotes define abbreviations and methods'],
    pitfalls: ['A value in the text that no longer matches its output after a rerun', 'An output cited in the text and not provided'],
    basis: [FDA_SDTCG],
  },
  { number: '14.1', title: 'Demographic Data', applies: 'always', contains: ['Summary figures and tables of demographic and baseline data'], see: ['11.2'] },
  { number: '14.2', title: 'Efficacy Data', applies: 'always', contains: ['Summary figures and tables of the efficacy results'], see: ['11.4.1'] },
  { number: '14.3', title: 'Safety Data', applies: 'always' },
  { number: '14.3.1', title: 'Displays of Adverse Events', applies: 'always', contains: ['The adverse event summary tables (§12.2.2)'], see: ['12.2.2'], basis: [FDA_E3] },
  { number: '14.3.2', title: 'Listings of Deaths, Other Serious and Significant Adverse Events', applies: 'always', see: ['12.3.1'] },
  { number: '14.3.3', title: 'Narratives of Deaths, Other Serious and Certain Other Significant Adverse Events', applies: 'always', see: ['12.3.2'] },
  { number: '14.3.4', title: 'Abnormal Laboratory Value Listing (Each Patient)', applies: 'always', see: ['12.4.1'], basis: [FDA_E3] },
  {
    number: '15', title: 'Reference List', applies: 'always',
    contains: ['The literature pertinent to the evaluation of the study', 'Copies of important publications attached in Appendices 16.1.11 and 16.1.12'],
    see: ['16.1.11', '16.1.12'],
    basis: [FDA_E3],
  },
  {
    number: '16', title: 'Appendices', applies: 'always',
    purpose: 'Everything a reviewer needs to verify the report. Prefaced by a full list of the appendices available; where the authority permits some to be provided on request, the report says which are submitted.',
    contains: ['At a minimum (ICH E3 Q&A (R1)): the protocol and every amendment, the sample case report form, the IEC / IRB approvals, the investigator list with qualifications, study-specific laboratory or analytical methods, and the patient data listings for adverse events, serious adverse events and efficacy'],
    basis: [E3_QA_R1],
  },
  { number: '16.1', title: 'Study Information', applies: 'always' },
  { number: '16.1.1', title: 'Protocol and protocol amendments', applies: 'always', contains: ['The final protocol and every amendment, in chronological order'], basis: [E3_QA_R1] },
  { number: '16.1.2', title: 'Sample case report form (unique pages only)', applies: 'always' },
  { number: '16.1.3', title: 'List of IECs or IRBs (plus the name of the committee chair if required by the regulatory authority) — Representative written information for patient and sample consent forms', applies: 'always', see: ['5.1', '5.3'] },
  { number: '16.1.4', title: 'List and description of investigators and other important participants in the study, including brief (1 page) CVs or equivalent summaries of training and experience relevant to the performance of the clinical study', applies: 'always', see: ['6'] },
  { number: '16.1.5', title: 'Signatures of principal or coordinating investigator(s) or sponsor’s responsible medical officer, depending on the regulatory authority’s requirement', applies: 'authority-dependent' },
  { number: '16.1.6', title: 'Listing of patients receiving test drug(s)/investigational product(s) from specific batches, where more than one batch was used', applies: 'when-applicable', see: ['9.4.2'] },
  { number: '16.1.7', title: 'Randomisation scheme and codes (patient identification and treatment assigned)', applies: 'always', see: ['9.4.3'] },
  { number: '16.1.8', title: 'Audit certificates (if available)', applies: 'when-applicable', see: ['9.6'] },
  {
    number: '16.1.9', title: 'Documentation of statistical methods', applies: 'always',
    contains: ['The detailed documentation of the statistical methods — usually the final SAP and any analysis-specific documentation — while the text of the report describes the analysis for clinical and statistical reviewers'],
    see: ['9.7.1'],
    basis: [FDA_E3, E3_QA_R1],
  },
  { number: '16.1.10', title: 'Documentation of inter-laboratory standardisation methods and quality assurance procedures if used', applies: 'when-applicable', see: ['9.5.4'] },
  { number: '16.1.11', title: 'Publications based on the study', applies: 'when-applicable', basis: [FDA_E3] },
  { number: '16.1.12', title: 'Important publications referenced in the report', applies: 'when-applicable', basis: [FDA_E3] },
  { number: '16.2', title: 'Patient Data Listings', applies: 'always', sources: ['Programmed from the SDTM / ADaM datasets the tables use, so a listing and its table cannot disagree'] },
  { number: '16.2.1', title: 'Discontinued patients', applies: 'always', see: ['10.1'] },
  { number: '16.2.2', title: 'Protocol deviations', applies: 'always', see: ['10.2'] },
  { number: '16.2.3', title: 'Patients excluded from the efficacy analysis', applies: 'always', see: ['11.1'] },
  { number: '16.2.4', title: 'Demographic data', applies: 'always', see: ['11.2'] },
  { number: '16.2.5', title: 'Compliance and/or drug concentration data (if available)', applies: 'when-applicable', see: ['11.3'] },
  { number: '16.2.6', title: 'Individual efficacy response data', applies: 'always', see: ['11.4.3'] },
  { number: '16.2.7', title: 'Adverse event listings (each patient)', applies: 'always', contains: ['Every adverse event for each patient, with both the preferred term and the investigator’s original term'], see: ['12.2.4'], basis: [FDA_E3] },
  { number: '16.2.8', title: 'Listing of individual laboratory measurements by patient, when required by regulatory authorities', applies: 'authority-dependent', see: ['12.4.1'] },
  { number: '16.3', title: 'Case Report Forms', applies: 'always' },
  {
    number: '16.3.1', title: 'CRFs for deaths, other serious adverse events and withdrawals for AE', applies: 'always',
    contains: ['For an FDA application: the case report form of every patient who died during a clinical study or did not complete it because of an adverse event, whether or not the event was believed drug-related, including patients on reference drug or placebo (21 CFR 314.50(f)(2), which FDA may waive for a study where the forms are unnecessary for its review)'],
    see: ['12.3.2'],
    basis: [CFR_314_50_F],
  },
  { number: '16.3.2', title: 'Other CRFs submitted', applies: 'when-applicable' },
  {
    number: '16.4', title: 'Individual Patient Data Listings (US Archival Listings)', applies: 'authority-dependent',
    contains: ['For FDA: the case report tabulations of 21 CFR 314.50(f)(1). Where the study’s data are submitted as standardised datasets they are filed as eCTD study data (Module 5 datasets with define.xml, a Trial Summary dataset for every study, and DM and ADSL), which FDA’s technical rejection criteria check (1734, 1736)'],
    basis: [CFR_314_50_F, FDA_STUDY_DATA_TRC, FDA_SDTCG],
  },
];
