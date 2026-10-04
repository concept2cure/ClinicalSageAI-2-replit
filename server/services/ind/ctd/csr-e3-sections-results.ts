/**
 * ICH E3 §10–§13: the patients studied, efficacy, safety and the conclusions.
 *
 * Part of the E3 overlay assembled in csr-e3-guidance.ts; see the header of
 * csr-e3-sections-plan.ts for what each field means. These are the sections
 * the locked database feeds: every count, estimate and listing named here is
 * read from the analysis datasets and the section 14 outputs, never written
 * by hand or by a model.
 */

import type { E3Section } from './types.js';
import { CDISC_CONVENTION, FDA_E3 } from './csr-e3-basis.js';

export const E3_RESULTS_SECTIONS: E3Section[] = [
  { number: '10', title: 'Study Patients', applies: 'always' },
  {
    number: '10.1', title: 'Disposition of Patients', applies: 'always',
    purpose: 'Accounts for every patient who entered the study, so each later denominator can be checked against it.',
    contains: ['The numbers randomised, and the numbers who entered and completed each phase of the study (or each week or month)', 'Every post-randomisation discontinuation, by treatment group and major reason (adverse event, lost to follow-up, poor compliance, withdrew consent, ...)', 'The listing of discontinued patients in Appendix 16.2.1'],
    sources: ['ADSL (end-of-study and end-of-treatment status and reasons, population flags)', 'SDTM DS'],
    presentation: ['A flow diagram of patients from screening to completion', 'A disposition table by treatment group and period'],
    pitfalls: ['Counts that do not reconcile with the analysis sets in §11.1 and the synopsis', 'An "other" reason category large enough to hide adverse-event discontinuations'],
    see: ['11.1', '16.2.1'],
    basis: [CDISC_CONVENTION],
  },
  {
    number: '10.2', title: 'Protocol Deviations', applies: 'always',
    contains: ['All important deviations relating to inclusion or exclusion criteria, conduct of the study, patient management or assessment', 'A summary by centre, grouped: entered without meeting entry criteria; met withdrawal criteria but were not withdrawn; received the wrong treatment or dose; received an excluded concomitant treatment', 'The listing in Appendix 16.2.2'],
    sources: ['SDTM DV', 'The deviation log, with each deviation’s classification as important or not under the study’s own definition'],
    pitfalls: ['Deviations classified after unblinding without saying so', 'Important deviations that changed analysis-set membership not cross-referenced to §11.1'],
    see: ['16.2.2', '11.1'],
  },
  { number: '11', title: 'Efficacy Evaluation', applies: 'always' },
  {
    number: '11.1', title: 'Data Sets Analysed', applies: 'always',
    contains: ['Exactly which patients were included in each efficacy analysis (for example all patients receiving any study drug, all with any efficacy observation, completers, a time window, a compliance threshold)', 'The reason each excluded patient was excluded', 'A tabular listing of the patients, visits and observations excluded from the efficacy analysis, in Appendix 16.2.3'],
    sources: ['ADSL population flags (for example ITTFL, FASFL, PPROTFL, SAFFL) and their derivations in define.xml'],
    pitfalls: ['Analysis-set definitions that differ from the SAP without a §9.8 entry'],
    see: ['10.1', '16.2.3', '9.7.1'],
    basis: [CDISC_CONVENTION],
  },
  {
    number: '11.2', title: 'Demographic and Other Baseline Characteristics', applies: 'always',
    contains: ['Group data for the critical demographic and baseline characteristics, and for other factors arising during the study that could affect response', 'Demographic variables (age, sex, race); disease factors (entry criteria, duration, severity, stage, prior treatment); other factors (concurrent illness, relevant prior illness and treatment, concomitant treatment, factors such as weight or renal function)', 'Data for the all-patients set first, then for other major analysis sets where they differ', 'The comparability of the treatment groups on every relevant characteristic'],
    sources: ['ADSL (AGE, SEX, RACE, ETHNIC and baseline characteristics)', 'SDTM DM, MH, CM, SC, SU, VS'],
    presentation: ['Summary tables and figures in section 14.1; individual data in Appendix 16.2.4'],
    see: ['14.1', '16.2.4'],
    basis: [CDISC_CONVENTION],
  },
  {
    number: '11.3', title: 'Measurements of Treatment Compliance', applies: 'always',
    contains: ['Compliance of individual patients with the treatment regimen, and drug concentrations in body fluids, summarised and analysed by treatment group and time interval', 'Individual data tabulated in Appendix 16.2.5'],
    sources: ['ADEX / SDTM EX, DA (drug accountability)', 'ADPC / SDTM PC'],
    see: ['16.2.5'],
    basis: [CDISC_CONVENTION],
  },
  { number: '11.4', title: 'Efficacy Results and Tabulations of Individual Patient Data', applies: 'always' },
  {
    number: '11.4.1', title: 'Analysis of Efficacy', applies: 'always',
    contains: ['Treatment groups compared on every critical measure of efficacy — primary and secondary endpoints, any pharmacodynamic endpoints — and on any per-patient benefit-risk assessment used', 'The results of every analysis planned in the protocol, and an analysis that includes all patients with on-study data', 'Each comparison as an estimate of the treatment effect with its confidence interval', 'Planned and unplanned (post hoc) analyses identified as such'],
    sources: ['Efficacy ADaM datasets (BDS; ADTTE for time-to-event)', 'The section 14.2 outputs, each from the program the SAP specifies'],
    presentation: ['Summary tables and figures in section 14.2'],
    pitfalls: ['p-values without estimates and confidence intervals', 'Post hoc analyses presented as if planned', 'For an E9(R1) study, results not tied to the estimand, or intercurrent events handled differently from the plan without saying so'],
    see: ['14.2', '9.7.1'],
    basis: [CDISC_CONVENTION],
  },
  { number: '11.4.2', title: 'Statistical/Analytical Issues', applies: 'always', contains: ['How each statistical issue below was handled, against the plan in §9.7.1'] },
  { number: '11.4.2.1', title: 'Adjustments for Covariates', applies: 'when-applicable', contains: ['The covariates adjusted for, whether pre-specified, and how results change without the adjustment'] },
  { number: '11.4.2.2', title: 'Handling of Dropouts or Missing Data', applies: 'always', contains: ['How dropouts and missing data were handled, and the sensitivity analyses showing how much the conclusions depend on that handling'], pitfalls: ['A single imputation method with no sensitivity analysis'] },
  { number: '11.4.2.3', title: 'Interim Analyses and Data Monitoring', applies: 'when-applicable', contains: ['Every interim analysis, planned or not: its timing, who saw the results, the adjustment made to the significance level, and any decision it led to'] },
  { number: '11.4.2.4', title: 'Multicentre Studies', applies: 'when-applicable', contains: ['How centres were handled in the analysis, and the consistency of the treatment effect across centres or regions'] },
  { number: '11.4.2.5', title: 'Multiple Comparison/Multiplicity', applies: 'when-applicable', contains: ['How the type I error was controlled across endpoints, doses, time points and analyses'] },
  { number: '11.4.2.6', title: 'Use of an "Efficacy Subset" of Patients', applies: 'when-applicable', contains: ['Why any subset was used for the efficacy analysis, and how its results compare with the analysis of all patients'] },
  { number: '11.4.2.7', title: 'Active-Control Studies Intended to Show Equivalence', applies: 'when-applicable', contains: ['The equivalence or non-inferiority margin and its justification, and the analysis of the confidence interval against it'] },
  { number: '11.4.2.8', title: 'Examination of Subgroups', applies: 'always', contains: ['Subgroup results for important demographic and baseline factors, with the caution that unplanned subgroup findings carry'], presentation: ['Forest plots of the treatment effect by subgroup'] },
  { number: '11.4.3', title: 'Tabulation of Individual Response Data', applies: 'always', contains: ['Individual response data by treatment group, in Appendix 16.2.6'], see: ['16.2.6'] },
  { number: '11.4.4', title: 'Drug Dose, Drug Concentration, and Relationships to Response', applies: 'when-applicable', contains: ['The relationship of dose or concentration to response, where the design allows it to be examined'] },
  { number: '11.4.5', title: 'Drug-Drug and Drug-Disease Interactions', applies: 'when-applicable', contains: ['Any apparent relationship between response and concomitant therapy or concurrent illness'] },
  { number: '11.4.6', title: 'By-Patient Displays', applies: 'when-applicable', contains: ['Individual patient outcomes for patient groups where a by-patient view adds to the group summaries'] },
  { number: '11.4.7', title: 'Efficacy Conclusions', applies: 'always', contains: ['The important efficacy conclusions, concisely: primary and secondary endpoints, pre-specified and alternative statistical approaches, and exploratory analyses'] },
  {
    number: '12', title: 'Safety Evaluation', applies: 'always',
    purpose: 'Safety at three levels: how much exposure there was to assess it; the common adverse events and laboratory changes, compared across groups; and the deaths, serious and other significant adverse events, found by close examination of the patients who died or left the study early because of an adverse event.',
    sources: ['ADSL, ADEX, ADAE, ADLB, ADVS, ADEG (or the sponsor’s equivalents)', 'The clinical database reconciled with the safety database before lock'],
    basis: [CDISC_CONVENTION],
  },
  {
    number: '12.1', title: 'Extent of Exposure', applies: 'always',
    contains: ['The number of patients exposed, by dose, by duration and by demographic subgroup', 'Exposure in patient-time where it matters to the comparison', 'Drug concentration data where available'],
    sources: ['ADEX', 'ADSL treatment start and end dates and duration'],
    presentation: ['Exposure tables by dose and duration'],
    basis: [CDISC_CONVENTION],
  },
  { number: '12.2', title: 'Adverse Events (AEs)', applies: 'always', sources: ['ADAE (treatment-emergent flag, MedDRA coding, severity or grade, relationship, seriousness, action taken, outcome)', 'SDTM AE'], pitfalls: ['The MedDRA version or the definition of a treatment-emergent event not stated'], basis: [CDISC_CONVENTION] },
  { number: '12.2.1', title: 'Brief Summary of Adverse Events', applies: 'always', contains: ['A brief narrative of the overall adverse event experience, supported by the tabulations and analyses that follow'] },
  {
    number: '12.2.2', title: 'Display of Adverse Events', applies: 'always',
    contains: ['All adverse events occurring after study treatment began, displayed in summary tables in section 14.3.1 by body system and preferred term and by treatment group, with the number of patients having each event — including events likely related to the underlying disease or a concomitant illness, unless the authority has agreed otherwise', 'In the body of the report, a summary table of the relatively common adverse events', 'Displays by severity and by the investigator’s assessment of relationship to treatment'],
    pitfalls: ['Disease-related events left out of the tables without a prior agreement'],
    see: ['14.3.1', '16.2.7'],
    basis: [FDA_E3],
  },
  { number: '12.2.3', title: 'Analysis of Adverse Events', applies: 'always', contains: ['The common adverse events compared between treatment groups, and analysed for factors that may affect their frequency: time course, dose or concentration, demographic characteristics'] },
  {
    number: '12.2.4', title: 'Listing of Adverse Events by Patient', applies: 'always',
    contains: ['Every adverse event for each patient, including the same event on several occasions, listed in Appendix 16.2.7 with both the preferred term and the original term the investigator used'],
    pitfalls: ['A listing that shows only coded terms', 'Listing counts that do not reconcile with the section 14.3.1 tables'],
    see: ['16.2.7'],
    basis: [FDA_E3],
  },
  { number: '12.3', title: 'Deaths, Other Serious Adverse Events, and Other Significant Adverse Events', applies: 'always', sources: ['ADAE seriousness and outcome variables', 'ADSL death flag, date and cause', 'SDTM DS', 'The safety database, reconciled with the clinical database'], basis: [CDISC_CONVENTION] },
  { number: '12.3.1', title: 'Listing of Deaths, Other Serious Adverse Events and Other Significant Adverse Events', applies: 'always', contains: ['Listings of deaths, other serious adverse events and other significant adverse events, by patient'], see: ['14.3.2'] },
  { number: '12.3.1.1', title: 'Deaths', applies: 'always', contains: ['Every death during the study and the follow-up period, including deaths after a patient stopped treatment'] },
  { number: '12.3.1.2', title: 'Other Serious Adverse Events', applies: 'always', contains: ['Every serious adverse event other than a death, including those after the patient stopped treatment'] },
  { number: '12.3.1.3', title: 'Other Significant Adverse Events', applies: 'always', contains: ['Marked haematological and other laboratory abnormalities that were not serious adverse events', 'Adverse events that led to an intervention: withdrawal from treatment, dose reduction, or significant additional concomitant therapy'] },
  {
    number: '12.3.2', title: 'Narratives of Deaths, Other Serious Adverse Events and Certain Other Significant Adverse Events', applies: 'always',
    contains: ['A brief narrative for each death, each other serious adverse event, and each other significant adverse event judged of special interest', 'Each narrative: the nature and intensity of the event, its clinical course and its timing relative to the test drug, relevant laboratory measurements, whether and when the drug was stopped, countermeasures, post-mortem findings, the investigator’s and (where appropriate) the sponsor’s opinion on causality', 'Each narrative also: patient identifier, age and sex, general clinical condition, the disease being treated and its duration, relevant concomitant and previous illnesses and medications, and the test drug dose and duration'],
    presentation: ['Long narratives placed in section 14.3.3 and referenced from the text'],
    pitfalls: ['Narratives that do not reconcile with the safety database or the listings', 'Causality from the investigator only, with no sponsor assessment where one was made'],
    see: ['14.3.3', '16.3.1'],
  },
  { number: '12.3.3', title: 'Analysis and Discussion of Deaths, Other Serious Adverse Events and Other Significant Adverse Events', applies: 'always', contains: ['The significance of the deaths, serious and other significant adverse events leading to withdrawal, dose reduction or additional therapy, and their relationship to treatment'] },
  { number: '12.4', title: 'Clinical Laboratory Evaluation', applies: 'always', sources: ['ADLB (BDS: parameter, value, baseline, change, reference-range indicators, shift)', 'SDTM LB', 'Laboratory reference ranges'], basis: [CDISC_CONVENTION] },
  { number: '12.4.1', title: 'Listing of Individual Laboratory Measurements by Patient (16.2.8) and Each Abnormal Laboratory Value (14.3.4)', applies: 'always', contains: ['Individual measurements by patient in Appendix 16.2.8, where the authority requires them', 'Each abnormal laboratory value, by patient, in section 14.3.4'], see: ['16.2.8', '14.3.4'] },
  { number: '12.4.2', title: 'Evaluation of Each Laboratory Parameter', applies: 'always' },
  { number: '12.4.2.1', title: 'Laboratory Values Over Time', applies: 'always', contains: ['Group means or medians for each parameter at each time, by treatment group'] },
  { number: '12.4.2.2', title: 'Individual Patient Changes', applies: 'always', contains: ['Changes in individual patients, for example as shift tables from normal to abnormal'], presentation: ['Shift tables by treatment group'] },
  { number: '12.4.2.3', title: 'Individual Clinically Significant Abnormalities', applies: 'always', contains: ['The clinically significant abnormalities, each considered for its relationship to treatment; for liver tests, the combinations that may signal drug-induced liver injury'] },
  { number: '12.5', title: 'Vital Signs, Physical Findings and Other Observations Related to Safety', applies: 'always', contains: ['Vital signs, physical findings, ECGs and other safety observations, analysed and presented in the same way as the laboratory variables'], sources: ['ADVS, ADEG', 'SDTM VS, EG, PE'], basis: [CDISC_CONVENTION] },
  {
    number: '12.6', title: 'Safety Conclusions', applies: 'always',
    contains: ['The overall safety evaluation, with particular attention to events that changed the dose or needed additional medication, serious adverse events, events leading to withdrawal, and deaths', 'Any patients or patient groups at increased risk, with attention to vulnerable groups present in small numbers (children, pregnant women, the frail elderly, people with marked abnormalities of drug metabolism or excretion)', 'What the safety evaluation implies for the possible uses of the drug'],
  },
  {
    number: '13', title: 'Discussion and Overall Conclusions', applies: 'always',
    contains: ['The efficacy and safety results and the relationship of risks and benefit, summarised and discussed with reference to the tables, figures and sections above', 'Their clinical relevance and importance in the light of other existing data', 'Any specific benefits or special precautions needed for individual subjects or at-risk groups, and any implications for the conduct of future studies'],
    pitfalls: ['New results introduced here', 'Results repeated rather than discussed', 'Conclusions stronger than §11.4.7 and §12.6 support'],
    see: ['11.4.7', '12.6', '2'],
  },
];
