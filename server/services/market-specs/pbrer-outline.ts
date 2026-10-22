/**
 * The Periodic Benefit-Risk Evaluation Report (PBRER / PSUR) outline, ICH
 * E2C(R2) and EU GVP Module VII. Split out of document-template-library.ts on
 * 2026-10-18 when the review corrections (title page, executive summary, §20
 * appendices, the numbered subsections) took that file past its size ceiling;
 * the library imports it into DOCUMENT_TEMPLATES unchanged. The EU PSUR
 * registry filing reads it (REGISTRY_COMPONENT_TEMPLATES EU_PSUR → 'pbrer').
 *
 * Pure and deterministic: no database, no network, no model.
 *
 * @module server/services/market-specs/pbrer-outline
 */

import type { DocumentTemplateStructure } from './document-template-library';

export const PBRER_TEMPLATE: DocumentTemplateStructure = {
  id: 'pbrer',
  title: 'Periodic Benefit-Risk Evaluation Report (PBRER/PSUR)',
  families: ['ectd'],
  regulatoryBasis: 'ICH E2C(R2) title page, executive summary, §1–§20; EU GVP Module VII',
  // Interim hand copy of the E2C(R2) numbering until one canonical E2C(R2)
  // tree exists; the heading facts are in docs/evidence/D2-ANA-DOCUMENT-
  // INTELLIGENCE/2026-10-04-depth/b1-template-library-facts.md.
  //
  // Corrected 2026-10-18 (review finding): the title page, executive summary
  // and §20 appendices were missing, and §8–§12 were optional. GVP Module VII
  // asks every section to be completed, stating that there is no information
  // where there is none, as the E2F DSUR record does. The numbered subsections
  // E2C(R2) gives §5, §6, §7, §16, §17 and §18 are listed (recalled); 7.5 and
  // 16.5 apply only where their condition holds.
  frontMatter: [
    { number: 'title_page', heading: 'Title Page', purpose: 'Product, reporting interval, data lock point, date of report, MAH, and confidentiality statement.', required: true },
    { number: 'executive_summary', heading: 'Executive Summary', purpose: 'A concise summary of the report: interval, exposure, the important new safety and efficacy information, the overall benefit-risk evaluation and the actions.', required: true },
  ],
  sections: [
    { number: '1', heading: 'Introduction', purpose: 'Reporting interval, product(s), and scope.', required: true },
    { number: '2', heading: 'Worldwide Marketing Authorisation Status', purpose: 'Authorisation dates and indications by country.', required: true },
    { number: '3', heading: 'Actions Taken in the Reporting Interval for Safety Reasons', purpose: 'Significant safety-related actions in the interval.', required: true, formerTitles: ['Actions Taken for Safety Reasons'] },
    { number: '4', heading: 'Changes to Reference Safety Information', purpose: 'Changes to the RSI in the interval.', required: true },
    {
      number: '5', heading: 'Estimated Exposure and Use Patterns', purpose: 'Cumulative and interval patient exposure.', required: true,
      subsections: [
        { number: '5.1', heading: 'Cumulative Subject Exposure in Clinical Trials', purpose: 'Cumulative exposure of subjects in the MAH\'s clinical trials.', required: true },
        { number: '5.2', heading: 'Cumulative and Interval Patient Exposure from Marketing Experience', purpose: 'Post-marketing exposure, cumulative and for the interval.', required: true },
      ],
    },
    {
      number: '6', heading: 'Data in Summary Tabulations', purpose: 'Cumulative and interval adverse-event tabulations.', required: true,
      subsections: [
        { number: '6.1', heading: 'Reference Information', purpose: 'The coding dictionary and the reference safety information used.', required: true },
        { number: '6.2', heading: 'Cumulative Summary Tabulations of Serious Adverse Events from Clinical Trials', purpose: 'Serious adverse events from the MAH\'s clinical trials, cumulatively.', required: true },
        { number: '6.3', heading: 'Cumulative and Interval Summary Tabulations from Post-Marketing Data Sources', purpose: 'Adverse reactions from post-marketing sources, cumulatively and for the interval.', required: true },
      ],
    },
    {
      number: '7', heading: 'Summaries of Significant Findings from Clinical Trials during the Reporting Interval', purpose: 'Completed/ongoing trial safety findings.', required: true,
    formerTitles: ['Summaries of Significant Findings from Clinical Trials'],
      subsections: [
        { number: '7.1', heading: 'Completed Clinical Trials', purpose: 'Significant safety findings from trials completed in the interval.', required: true },
        { number: '7.2', heading: 'Ongoing Clinical Trials', purpose: 'Significant safety findings from ongoing trials.', required: true },
        { number: '7.3', heading: 'Long-Term Follow-Up', purpose: 'Findings from long-term follow-up of subjects.', required: true },
        { number: '7.4', heading: 'Other Therapeutic Use of the Medicinal Product', purpose: 'Findings from other programmes, such as expanded access.', required: true },
        { number: '7.5', heading: 'New Safety Data Related to Fixed Combination Therapies', purpose: 'Where the product is, or is used in, a fixed combination.', required: false },
      ],
    },
    { number: '8', heading: 'Findings from Non-Interventional Studies', purpose: 'Safety findings from observational studies; state none if none.', required: true },
    { number: '9', heading: 'Information from Other Clinical Trials and Sources', purpose: 'Other relevant safety information; state none if none.', required: true },
    { number: '10', heading: 'Non-Clinical Data', purpose: 'Relevant nonclinical safety findings; state none if none.', required: true },
    { number: '11', heading: 'Literature', purpose: 'Relevant published literature; state none if none.', required: true },
    { number: '12', heading: 'Other Periodic Reports', purpose: 'Significant findings from other periodic reports, including those from partners, not presented elsewhere; state none if none.', required: true },
    { number: '13', heading: 'Lack of Efficacy in Controlled Clinical Trials', purpose: 'Lack-of-efficacy data from clinical trials in the interval that bear on benefit-risk.', required: true },
    { number: '14', heading: 'Late-Breaking Information', purpose: 'Significant safety or efficacy information arising after the data lock point.', required: true },
    { number: '15', heading: 'Overview of Signals: New, Ongoing, or Closed', purpose: 'Signals new, ongoing, or closed during the reporting interval.', required: true },
    {
      number: '16', heading: 'Signal and Risk Evaluation', purpose: 'Summary of safety concerns, signal evaluation, and risk characterisation.', required: true,
      subsections: [
        { number: '16.1', heading: 'Summary of Safety Concerns', purpose: 'The important identified and potential risks and missing information at the start of the interval.', required: true },
        { number: '16.2', heading: 'Signal Evaluation', purpose: 'The evaluation of each signal closed in the interval.', required: true },
        { number: '16.3', heading: 'Evaluation of Risks and New Information', purpose: 'New information on the important risks and missing information.', required: true },
        { number: '16.4', heading: 'Characterisation of Risks', purpose: 'The characterisation of the important risks.', required: true },
        { number: '16.5', heading: 'Effectiveness of Risk Minimisation (if applicable)', purpose: 'Where additional risk minimisation is in place, its effectiveness.', required: false },
      ],
    },
    {
      number: '17', heading: 'Benefit Evaluation', purpose: 'Baseline and newly identified benefit information.', required: true,
      subsections: [
        { number: '17.1', heading: 'Important Baseline Efficacy and Effectiveness Information', purpose: 'The efficacy and effectiveness the evaluation starts from.', required: true },
        { number: '17.2', heading: 'Newly Identified Information on Efficacy and Effectiveness', purpose: 'Efficacy and effectiveness information new in the interval.', required: true },
        { number: '17.3', heading: 'Characterisation of Benefits', purpose: 'The integrated characterisation of the benefits.', required: true },
      ],
    },
    {
      number: '18', heading: 'Integrated Benefit-Risk Analysis for Approved Indications', purpose: 'Integrated benefit-risk for approved indications.', required: true,
      subsections: [
        { number: '18.1', heading: 'Benefit-Risk Context: Medical Need and Important Alternatives', purpose: 'The medical need the product meets and the alternatives.', required: true },
        { number: '18.2', heading: 'Benefit-Risk Analysis Evaluation', purpose: 'The evaluation of the balance of benefits and risks.', required: true },
      ],
    },
    { number: '19', heading: 'Conclusions and Actions', purpose: 'Conclusions and any proposed/needed actions.', required: true },
    { number: '20', heading: 'Appendices to the PBRER', purpose: 'The appendices E2C(R2) lists: reference safety information, cumulative and interval tabulations, the signal tabulation and listing of studies, among them.', required: true },
  ],
};
