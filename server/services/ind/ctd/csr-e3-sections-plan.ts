/**
 * ICH E3 §1–§9: the report's front matter and the study as planned.
 *
 * Part of the E3 overlay assembled in csr-e3-guidance.ts. Headings and
 * numbering are ICH E3's (Step 4, 1995). `contains` restates what E3 asks for
 * under each heading; `sources` is platform practice (which records and CDISC
 * datasets usually feed the section), never a requirement. `writing` (added
 * 2026-10-29, CSR slice 4) is how a senior writer writes the heading — craft,
 * with the report-wide rules in csr-e3-writing.ts. Every entry is advisory
 * reference structure: it says what belongs in a section, never what a study
 * found.
 */

import type { E3Section } from './types.js';
import { E3_QA_R1, FDA_PDF_SPECS, FDA_STUDY_DATA_TRC, ICH_E9_R1 } from './regulatory-basis.js';
import { W } from './csr-e3-writing.js';

export const E3_PLAN_SECTIONS: E3Section[] = [
  {
    number: '1', title: 'Title Page', applies: 'always', writing: ["Write it as a record, not prose: each element on its own line, in the order E3 lists them, with dates as the protocol and the clinical database record them.", W.fromConductRecords, "State the actual source-supported GCP position, including archiving, and its qualifications; if the evidence is unavailable, mark the statement as awaiting records rather than declare compliance.", "E3 Annex II is the signature page that §16.1.5 carries; the title page names the signatories, it does not reproduce their signatures."],
    purpose: 'Identifies the study and the report so a reviewer can place it in the application and match it to the protocol, the synopsis and the datasets.',
    contains: ['Study title', 'Name of the test drug / investigational product', 'Indication studied', 'If not apparent from the title, one or two sentences on design (parallel, crossover, blinding, randomisation), comparison, duration, dose and population', 'Name of the sponsor', 'Protocol identification (code or number)', 'Development phase', 'Study initiation date (first patient enrolled, or another verifiable definition)', 'Date of early termination, if any', 'Study completion date (last patient completed)', 'Name and affiliation of the principal or coordinating investigator(s) or the sponsor’s responsible medical officer', 'Name of the company / sponsor signatory', 'Statement that the study was performed in compliance with GCP, including the archiving of essential documents', 'Date of the report, and the title and date of any earlier report from the same study'],
    sources: ['Final protocol and amendments', 'Clinical trial management system milestones (first patient enrolled, last patient completed)', 'ADSL / DM reference dates'],
    pitfalls: ['Study dates that disagree with the synopsis, the TS dataset and the 2.7.6 synopsis', 'A GCP statement missing, or qualified without saying why'],
    see: ['2', '16.1.5'],
  },
  {
    number: '2', title: 'Synopsis', applies: 'always', writing: ["Follow the E3 Annex I layout, field by field; the results and conclusions fields are short paragraphs, the rest are entries.", W.slotsOnly, "Copy each figure from the body or the §14 output it cites, after the last table rerun; write the synopsis last.", "State efficacy as estimate with confidence interval, then the p-value; state safety in the same proportions the body gives it, including deaths and discontinuations for adverse events, never \"well tolerated\" alone.", W.presentConclusion],
    purpose: 'A self-contained summary of the whole study, usually no more than three pages, that a reviewer reads first and the application reuses as the study’s synopsis in Module 2.7.6.',
    contains: ['Sponsor, product and active ingredient', 'Study title, investigators, study centres and any publication', 'Studied period (dates) and phase', 'Objectives', 'Methodology (design, blinding, control, randomisation)', 'Number of patients planned and analysed', 'Diagnosis and main criteria for inclusion', 'Test product, dose, mode of administration and batch number(s)', 'Duration of treatment', 'Reference therapy, dose, mode of administration and batch number(s)', 'Criteria for evaluation: efficacy and safety', 'Statistical methods', 'Summary of results — efficacy and safety — and conclusions', 'Date of the report'],
    presentation: ['Every number in the synopsis equals the number in the body and in the section 14 tables', 'Results stated as estimates with confidence intervals, not p-values alone'],
    pitfalls: ['Synopsis figures left stale after a late TFL rerun', 'Conclusions stronger than §13', 'Safety results omitted or reduced to "well tolerated"'],
    see: ['13', '14', '2.7.6'],
  },
  {
    number: '3', title: 'Table of Contents for the Individual Clinical Study Report', applies: 'always',
    purpose: 'Locates every section, table, figure, listing and appendix of the report.',
    contains: ['Page number or other locating information for each section, including the summary tables, figures and graphs', 'A list of the appendices, tabulations and case report forms provided, with their locations'],
    presentation: ['A hyperlinked table of contents and bookmarks for a document of 5 or more pages; the bookmark hierarchy identical to the table of contents, up to four levels deep (FDA PDF specifications)'],
    pitfalls: ['A table of contents that is not hyperlinked, or bookmarks that stop short of its depth'],
    see: ['16'],
    basis: [FDA_PDF_SPECS],
  },
  {
    number: '4', title: 'List of Abbreviations and Definitions of Terms', applies: 'always', writing: ["One alphabetised two-column table (abbreviation, definition); define each abbreviation again at first use in the text and in each table footnote.", "Do not abbreviate a term used fewer than three times; keep the abbreviations identical to those in Module 2.7 and 2.5."],
    contains: ['Every abbreviation used, and the definition of every specialised or unusual term or measurement unit', 'Each abbreviation also spelled out at its first use in the text'],
    pitfalls: ['Abbreviations and terms that differ between the CSR, the 2.7 summaries and the 2.5 overview'],
  },
  {
    number: '5', title: 'Ethics', applies: 'always', writing: [W.noFigures, W.fromConductRecords],
    purpose: 'Shows the study was reviewed, conducted and consented as GCP and the regulations require.',
    sources: ['Trial master file: IEC/IRB approvals, consent form versions', 'Protocol and amendments'],
  },
  {
    number: '5.1', title: 'Independent Ethics Committee (IEC) or Institutional Review Board (IRB)', applies: 'always', writing: [W.pastConduct, W.fromConductRecords, "For each site and protocol/amendment/consent version, report the retained committee decision and date relative to enrolment or implementation. State that approval preceded an activity only if those records establish it; describe late or absent decisions and any documented exceptions. Point to the actual committee list in Appendix 16.1.3."],
    contains: ['Confirmation that the study and every amendment were reviewed by an IEC or IRB', 'The list of all IECs / IRBs consulted, in Appendix 16.1.3 (with the chair’s name where the authority requires it)'],
    see: ['16.1.3'],
  },
  {
    number: '5.2', title: 'Ethical Conduct of the Study', applies: 'always', writing: [W.fromConductRecords, "Describe the ethical standards and actual E6 revision recorded for the study, with source-supported conduct and any qualifications or noncompliance. Do not insert a standard Helsinki/GCP compliance sentence when the conduct records are missing or do not support it."],
    contains: ['Confirmation that the study was conducted in accordance with the ethical principles that have their origin in the Declaration of Helsinki'],
  },
  {
    number: '5.3', title: 'Patient Information and Consent', applies: 'always', writing: [W.pastConduct, W.fromConductRecords, "Report the source-supported consent process and timing relative to the first study-specific procedure, the approved versions and actual re-consent after relevant amendments. Identify recorded waivers, exceptions or deviations; if timing or documentation is missing, state that it is unknown rather than assert that every participant gave prior written consent."],
    contains: ['How and when informed consent was obtained in relation to enrolment (for example at allocation or at pre-screening)', 'Representative written information for patients and a sample consent form, in Appendix 16.1.3'],
    pitfalls: ['Re-consent after an amendment not described'],
    see: ['16.1.3'],
  },
  {
    number: '6', title: 'Investigators and Study Administrative Structure', applies: 'always', writing: [W.pastConduct, "Describe roles, not people: the committee or vendor and what it did; names and CVs go in Appendix 16.1.4. A table of committees and vendors with their responsibilities reads faster than prose."],
    contains: ['A brief description of the administrative structure: principal or coordinating investigator, steering committee, monitoring and evaluation committees (for example a data monitoring committee or an adjudication committee), institutions, statistician, central laboratories, contract research organisations, clinical trial supply management', 'In Appendix 16.1.4: the investigators with their affiliations, roles and qualifications, and the other people whose participation materially affected the conduct of the study'],
    sources: ['CTMS site and investigator lists', 'Form FDA 1572 records and CVs in the trial master file', 'Vendor and committee charters'],
    pitfalls: ['A data monitoring or adjudication committee, or a vendor’s role, missing', 'The 16.1.4 list disagreeing with the investigator records'],
    see: ['16.1.4'],
  },
  {
    number: '7', title: 'Introduction', applies: 'always', writing: ["One page at most; present tense for the established background (\"Clostridioides difficile infection recurs in\"), past tense for this study (\"This study was designed to\").", "Place the study in the development programme and name any agreement with a regulatory authority that shaped it; this is not a literature review and makes no efficacy claim."],
    contains: ['A brief statement (E3: at most one page) placing the study in the development of the test product', 'The critical features of the study — rationale and aims, target population, treatment, duration, primary endpoints — related to that development', 'Any guidelines followed in developing the protocol, and any agreements or meetings with regulatory authorities relevant to the study'],
    pitfalls: ['A literature review instead of a placement of the study', 'Agreements with FDA that shaped the endpoints (for example end-of-phase 2 minutes) not mentioned'],
  },
  {
    number: '8', title: 'Study Objectives', applies: 'always', writing: ["Quote the objectives as the final protocol states them, in the same order, primary first; past tense (\"The primary objective was to\").", "Pair each objective with its endpoint, and for an ICH E9(R1) study with its estimand, in a table."],
    contains: ['The overall purpose(s) of the study', 'The primary and secondary objectives as the protocol states them'],
    presentation: ['Each objective mapped to its endpoint and, for a study planned under ICH E9(R1), to its estimand'],
    pitfalls: ['Objectives reworded from the protocol'],
  },
  {
    number: '9', title: 'Investigational Plan', applies: 'always', writing: [W.noFigures, W.fromProtocol],
    purpose: 'The study as planned, and every change to that plan, so a reviewer can judge the results against it.',
    sources: ['Final protocol and every amendment', 'Statistical analysis plan, final and dated', 'Randomisation specification (IRT/IXRS)', 'Data monitoring committee charter, monitoring and data management plans', 'SDTM trial design domains (TA, TE, TV, TI, TS)'],
    basis: [FDA_STUDY_DATA_TRC],
    see: ['16.1.1', '16.1.9'],
  },
  {
    number: '9.1', title: 'Overall Study Design and Plan — Description', applies: 'always', writing: [W.pastConduct, "Open with one sentence that names design, blinding, control, randomisation ratio, population, treatment duration and number of sites (\"This was a Phase {phase}, randomised, double-blind, placebo-controlled, parallel-group study in {population} at {n_sites} sites\"); then the periods in order. The schematic follows E3 Annex IIIa and the schedule of assessments Annex IIIb."],
    contains: ['The design (for example parallel, crossover), briefly and clearly, with charts and diagrams as needed', 'Treatments studied, patient population and number of patients', 'Level and method of blinding', 'Kind of control', 'Method of assignment to treatment', 'Sequence and duration of all study periods (randomisation, run-in, washout, single- and double-blind treatment)', 'Any safety, data monitoring or special steering or evaluation committees', 'Any interim analyses', 'Any important differences from studies that used a very similar protocol'],
    presentation: ['A study schematic', 'The protocol and its amendments in Appendix 16.1.1; the unique pages of the case report form in 16.1.2'],
    see: ['16.1.1', '16.1.2'],
  },
  {
    number: '9.2', title: 'Discussion of Study Design, Including the Choice of Control Groups', applies: 'always', writing: ["Past tense for the choice (\"Placebo was chosen because\"); present tense only for established facts about the disease or the control.", "For a non-inferiority study, state the margin, how it was derived and why the control was expected to be effective in this study (assay sensitivity)."],
    contains: ['Why the design and the control (placebo, no treatment, active, dose comparison, historical) were chosen', 'Known or potential problems of the design or control given the disease and the therapies', 'For an active-control study intended to show equivalence or non-inferiority, the basis for expecting the control to have had its effect in this study'],
  },
  {
    number: '9.3', title: 'Selection of Study Population', applies: 'always', writing: [W.noFigures, W.fromProtocol],
    contains: ['The population and the criteria used to select it, and how suitable it is for the purposes of the study'],
  },
  { number: '9.3.1', title: 'Inclusion Criteria', applies: 'always', writing: ["Numbered list in protocol order and wording, past tense (\"Patients were eligible if they\"); cite the diagnostic criteria with their source."], contains: ['The inclusion criteria, with any diagnostic criteria used'] },
  { number: '9.3.2', title: 'Exclusion Criteria', applies: 'always', writing: ["Numbered list in protocol order; where a criterion's reason is not evident, state it; close with what the exclusions mean for generalising the results."], contains: ['The exclusion criteria and the reason for each where not evident', 'Any effect the exclusions have on how far the results can be generalised'] },
  { number: '9.3.3', title: 'Removal of Patients from Therapy or Assessment', applies: 'always', writing: [W.pastConduct, "Separate discontinuing treatment from withdrawing from the study, and say what follow-up continued after each."], contains: ['The predetermined reasons for removing patients from therapy or observation', 'The nature and duration of any planned follow-up of those patients'] },
  { number: '9.4', title: 'Treatments', applies: 'always', purpose: "The treatments as given: what each group received, how it was identified, assigned, dosed and blinded, what else patients could take, and how adherence was measured.", writing: [W.noFigures] },
  { number: '9.4.1', title: 'Treatments Administered', applies: 'always', writing: [W.pastConduct, "A table by group and period (product, dose, route, frequency, duration) reads better than prose; the text names anything unusual."], contains: ['The precise treatments or diagnostic agents for each group and period: route, dose, schedule, duration'] },
  {
    number: '9.4.2', title: 'Identity of Investigational Product(s)', applies: 'always', writing: [W.pastConduct, "List formulation, strength and batch numbers in a table; the patient-by-batch listing is Appendix 16.1.6."],
    contains: ['Formulation, strength and batch number(s) of each test drug and comparator', 'Where more than one batch was used, the patients who received each batch, in Appendix 16.1.6'],
    see: ['16.1.6'],
  },
  {
    number: '9.4.3', title: 'Method of Assigning Patients to Treatment Groups', applies: 'always', writing: [W.pastConduct, "Name the randomisation ratio, stratification factors with their levels, block use (not block size, if blinding depended on it) and the system that assigned treatment."],
    contains: ['The randomisation method — centralised allocation, stratification, blocking — and how assignments were generated and concealed', 'The randomisation scheme and codes in Appendix 16.1.7'],
    sources: ['IRT/IXRS randomisation specification and schedule', 'ADSL (RANDDT, ARM, ACTARM)'],
    see: ['16.1.7'],
  },
  { number: '9.4.4', title: 'Selection of Doses in the Study', applies: 'always', writing: ["Past tense for the choice; cite the prior study or nonclinical result each dose rests on by report number, not by figure."], contains: ['The doses or dose ranges used and the basis for choosing them (prior human data, nonclinical data, dose-ranging results)'] },
  { number: '9.4.5', title: 'Selection and Timing of Dose for Each Patient', applies: 'always', writing: [W.pastConduct, "Say how each patient's dose was set and changed (titration rules, dose modifications, interruptions), and when doses were taken relative to meals and assessments."], contains: ['How each patient’s dose was selected (fixed, titrated, weight-based)', 'Timing of dosing: time of day, relation to meals, to other drugs and to assessments'] },
  {
    number: '9.4.6', title: 'Blinding', applies: 'always', writing: [W.pastConduct, "Say who was blinded, how, and when and by whom the blind was broken; report every emergency unblinding, with its number given in §10.2 or a listing."],
    contains: ['How blinding was achieved (labelling, matching appearance, double-dummy)', 'The circumstances in which the blind could be broken, and who held the codes', 'Any unblinding during the study, and who had access to unblinded data (for example a data monitoring committee)', 'Where blinding was judged unnecessary for some observations, why'],
    pitfalls: ['Emergency code breaks or unblinded access not reported'],
  },
  { number: '9.4.7', title: 'Prior and Concomitant Therapy', applies: 'always', writing: [W.pastConduct, "Separate prohibited, restricted and permitted therapy; name rescue therapy and how its use was handled in the analysis (an intercurrent event under E9(R1)). Code medications with WHODrug and name its version."], contains: ['Drugs and procedures permitted or not permitted before and during the study, and how their use was recorded', 'Any effect of permitted therapies on the outcome measures'] },
  { number: '9.4.8', title: 'Treatment Compliance', applies: 'always', writing: [W.pastConduct, "Define compliance as the SAP computes it (for example doses taken divided by doses expected); the results are in §11.3."], contains: ['The measures taken to ensure and document compliance (drug accountability, diary cards, drug concentrations)'] },
  { number: '9.5', title: 'Efficacy and Safety Variables', applies: 'always', purpose: "What was measured, when, how and by whom — the efficacy and safety variables the results are judged on.", writing: [W.noFigures] },
  {
    number: '9.5.1', title: 'Efficacy and Safety Measurements Assessed and Flow Chart', applies: 'always', writing: [W.pastConduct, "Say how adverse events were elicited and recorded (definition, collection period, severity scale with its version, causality categories, seriousness criteria); the schedule of assessments follows E3 Annex IIIb."],
    contains: ['The efficacy and safety variables and laboratory tests, with their schedule and methods, and who made the measurements', 'How adverse events were defined and elicited (volunteered, checklist, questioning), and any rating scale', 'A flow chart of the frequency and timing of each assessment'],
    presentation: ['A schedule of assessments table'],
  },
  { number: '9.5.2', title: 'Appropriateness of Measurements', applies: 'when-applicable', writing: ["Present tense for established measurement properties (\"The scale is validated in\"); cite the validation source for each non-standard instrument."], contains: ['Where a measurement is not standard — not widely used, not validated — the evidence of its reliability, accuracy and relevance'] },
  { number: '9.5.3', title: 'Primary Efficacy Variable(s)', applies: 'always', writing: ["State the primary variable exactly as the SAP defines it: the measurement, the timepoint, the derivation (change from baseline, responder definition) and the analysis set."], contains: ['The primary measurements and endpoints used to judge efficacy, stated clearly', 'Where no single primary variable was named, how efficacy was to be judged'] },
  { number: '9.5.4', title: 'Drug Concentration Measurements', applies: 'when-applicable', writing: [W.pastConduct, "Name the matrix, sampling times relative to dose, the assay and its lower limit of quantification, and the laboratory."], contains: ['The samples taken, their timing relative to dosing, and the assay method (with laboratory methods in Appendix 16.1.10 where used)'], see: ['16.1.10'] },
  {
    number: '9.6', title: 'Data Quality Assurance', applies: 'always', writing: [W.pastConduct, "Describe the systems, not their virtues: monitoring approach (on-site, remote, risk-based), source data verification, central laboratory, data-management checks, audits; certificates go to 16.1.8."],
    contains: ['The quality assurance and quality control systems used to assure the quality of the data: investigator and monitor training, monitoring, central laboratories, data entry verification', 'Any audits, with audit certificates in Appendix 16.1.8 where available'],
    see: ['16.1.8'],
  },
  {
    number: '9.7', title: 'Statistical Methods Planned in the Protocol and Determination of Sample Size', applies: 'always', writing: [W.noFigures, W.fromConductRecords, "Report the actual SAP version/date and its recorded timing relative to database lock and unblinding. If these facts are missing, state that the timing is unknown. Describe finalization or changes after unblinding, including reasons, decision-makers and available data, and cross-reference §9.8; never rewrite late finalization as prespecification."],
    purpose: 'What was planned before the results were known — the reviewer’s reference for judging every analysis in §11 and §12.',
    see: ['16.1.9', '11.4.2'],
  },
  {
    number: '9.7.1', title: 'Statistical and Analytical Plans', applies: 'always', writing: [W.pastConduct, "For each estimand write its five attributes in order — population, treatment condition, variable, the strategy for each intercurrent event, population-level summary — then the main estimator, the sensitivity analyses and any supplementary analyses.", "Name the multiplicity procedure and the testing order; the plan is described here, the results in §11.4."],
    contains: ['The analyses planned in the protocol, and any change made before the outcome results were available', 'Analysis populations, the primary analysis, covariates, handling of missing data, interim analyses, multicentre aspects, multiple comparisons and subgroups', 'For a study planned under ICH E9(R1), the estimand for each primary and key secondary objective, with its five attributes: the population; the treatment condition of interest; the variable (endpoint); the intercurrent events (for example discontinuation of treatment, rescue medication, death) and the strategy for each — treatment policy, hypothetical, composite variable, while on treatment or principal stratum; and the population-level summary (for example a difference in means, a risk difference, a hazard ratio)', 'The main estimator for each estimand and its assumptions; the sensitivity analyses that test those assumptions for the same estimand, and any supplementary analyses (which target a different estimand), named as such', 'Full documentation of the statistical methods in Appendix 16.1.9'],
    pitfalls: ['The SAP finalised after unblinding, or its date relative to database lock and unblinding not stated', 'An estimand named without its intercurrent-event strategy, or a sensitivity analysis that targets a different estimand presented as a sensitivity analysis'],
    basis: [ICH_E9_R1],
  },
  { number: '9.7.2', title: 'Determination of Sample Size', applies: 'always', writing: [W.pastConduct, "Give every assumption the calculation used (effect, variability or event rate, alpha, power, dropout) and its source; a reader must be able to repeat the calculation from the sentence."], contains: ['The planned sample size and its basis: statistical considerations (power, significance level, assumed effect and variability, dropout) or practical limits'] },
  {
    number: '9.8', title: 'Changes in the Conduct of the Study or Planned Analyses', applies: 'always', writing: [W.pastConduct, "One entry per change, in date order: what changed, when, why, who decided, and whether it came before or after any unblinded data were available. A table works best; the active voice names who decided."],
    contains: ['Every change to the conduct of the study after it started (for example dropping a group, changing entry criteria or doses, adjusting the sample size)', 'For each: when and why, the procedure used to decide, who decided, and what data were available to whom at the time — whether or not it was a formal amendment', 'Changes to the planned analyses, and whether they were made before or after unblinding'],
    pitfalls: ['A change to the planned analysis not dated against unblinding'],
  },
];

/** Notes that apply to the report as a whole rather than one heading. */
export const E3_REPORT_NOTES: { text: string; basis: typeof E3_QA_R1 }[] = [
  { text: 'ICH E3 is a guideline, not a set of rigid requirements or a template; flexibility is inherent in its use, and a study it was not designed for (pharmacokinetics, quality of life) adapts its headings and says so.', basis: E3_QA_R1 },
  { text: 'Documents a reviewer always needs — the protocol (16.1.1), the statistical methods (16.1.9), the investigator and site list, the sample case report form — belong in the report even when they are also in the trial master file.', basis: E3_QA_R1 },
];
