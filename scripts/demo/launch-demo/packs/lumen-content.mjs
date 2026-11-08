/**
 * launch-demo/packs/lumen-content.mjs — the Lumen Bioscience demonstration
 * pack's content.
 *
 * Source: data/seeds/lumen-demo (public pipeline facts — company website, trial
 * listings) and its LMN-201 runbook, which sets the rules followed here:
 *   - the client is shown as "Lumen Bioscience (demo — not affiliated)", on its
 *     own slug, never the live company's `lumen-bioscience`;
 *   - no real Lumen person, account or authorization is represented;
 *   - nothing here is Lumen's protocol, SAP, source data or CSR. Program names,
 *     indications, phases, registry numbers and public endpoints come from the
 *     seed kit; every specification, stability result, batch, planning
 *     assumption and task is an ILLUSTRATIVE DEMO value and says so.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, demoTitle } from '../lib.mjs';

export const PACK = 'lumen';
export const T = (name) => demoTitle(PACK, name);
export const KIT = path.join(REPO_ROOT, 'data', 'seeds', 'lumen-demo', 'seed-data');
export const SEED = JSON.parse(fs.readFileSync(path.join(KIT, 'lumen_bioscience.seed.json'), 'utf8'));
export const CSR_SOURCE_FILE = path.join(KIT, 'lmn201_synthetic_csr_source_v1.json');

export const CLIENT = { name: 'Lumen Bioscience (demo — not affiliated)', slug: 'lumen-bioscience-demo' };
export const FOOTER = 'DEMONSTRATION — illustrative content built from public information — not affiliated with Lumen Bioscience, Inc.';

const program = (code) => {
  const p = SEED.programs.find((x) => x.code === code);
  if (!p) throw new Error(`Lumen seed kit has no program ${code}`);
  return p;
};

/** The projects, one per pipeline program the kit lists as a medicine in clinical or IND-enabling development. */
export const PROJECTS = [
  { code: 'LMN-201', name: 'LMN-201 — prevention of recurrent C. difficile infection (IND)', indication: 'Prevention of recurrent Clostridioides difficile infection', priority: 'high', targetInDays: 120 },
  { code: 'LMN-801', name: 'LMN-801 — oral hormone protein for weight loss (IND)', indication: 'Weight loss in adults with obesity or overweight, preserving lean mass', priority: 'high', targetInDays: 200 },
  { code: 'LMN-301', name: 'LMN-301 — intranasal biologic for viral respiratory infection (IND)', indication: 'Prevention of viral respiratory infection', priority: 'medium', targetInDays: 240 },
  { code: 'LMN-401', name: "LMN-401 — antibody cocktail for travelers' diarrhea (pre-IND)", indication: "Travelers' diarrhea and acute gastroenteritis", priority: 'medium', targetInDays: 330 },
].map((p) => ({ ...p, seed: program(p.code) }));

/** A one-document program overview in each project's Vault, from the kit's public facts. */
export function overviewPdf(p) {
  const s = p.seed;
  const studies = (s.studies ?? []).map((st) => {
    const bits = [st.title, st.registry_id && `Registry: ${st.registry_id}`, st.phase && `Phase: ${st.phase}`,
      st.design?.masking && `Design: ${[st.design.allocation, st.design.masking, st.design.control].filter(Boolean).join(', ')}`,
      st.enrollment?.target && `Planned enrollment: ${st.enrollment.target} ${st.enrollment.unit}`,
      st.endpoints?.primary && `Primary endpoint (public listing): ${st.endpoints.primary}`,
      st.status && `Status: ${st.status.replace(/_/g, ' ')}`];
    return bits.filter(Boolean).join('. ') + '.';
  });
  return {
    title: T(`${p.code} program overview`),
    subtitle: `${s.name} — ${s.modality} — ${s.stage}`,
    sections: [
      { heading: '1. Program', paragraphs: [`${s.summary} Indication: ${p.indication}. Development stage: ${s.stage}. Modality: ${s.modality}.`] },
      { heading: '2. Clinical studies (public listings)', paragraphs: studies.length ? studies : ['No registered clinical study is listed for this program in the public sources the demo was built from.'] },
      { heading: '3. Platform', paragraphs: [SEED.client.description] },
      { heading: '4. About this document', paragraphs: ['Built for a Concept2Cure demonstration from public information. It is not a Lumen Bioscience document and carries no company data beyond what is public.'] },
    ],
  };
}

const LMN201_DS = 'LMN-201 drug substance (illustrative)';
const LMN201_DP = 'LMN-201 enteric capsules (illustrative)';

export const LMN201_CMC = {
  specs: [
    { material: 'Drug substance', name: `${LMN201_DS} — identity`, release: 'Conforms to reference by peptide mapping', method: 'LC-MS peptide map', ich: 'ICH Q6B', justification: 'Illustrative demo specification.' },
    { material: 'Drug substance', name: `${LMN201_DS} — potency (toxin B neutralisation)`, release: '60–140% of reference standard', method: 'Cell-based toxin B cytotoxicity neutralisation assay', ich: 'ICH Q6B', justification: 'Illustrative demo range.' },
    { material: 'Drug substance', name: `${LMN201_DS} — microbial enumeration`, release: 'TAMC ≤ 10³ CFU/g; TYMC ≤ 10² CFU/g; absence of E. coli', method: 'Ph. Eur. 2.6.12 / 2.6.13', ich: 'ICH Q6B' },
    { material: 'Drug product', name: `${LMN201_DP} — enteric protection and release`, release: 'No release after 2 h in 0.1 N HCl; ≥ 80% released at 45 min in pH 6.8 buffer', method: 'USP <711> delayed-release, apparatus 2', ich: 'ICH Q6B' },
    { material: 'Drug product', name: `${LMN201_DP} — water content`, release: '≤ 8.0% w/w', method: 'Karl Fischer titration', ich: 'ICH Q6B' },
  ],
  stability: [
    { title: 'LMN-201 enteric capsules — long-term, 25°C/60% RH (illustrative)', product: LMN201_DP, batch: 'LMN201-DP-2405', dosageForm: 'Enteric capsule', strength: 'Illustrative', scope: 'DP',
      studyType: 'long-term', storage: ['LT', '25°C ± 2°C / 60% ± 5% RH'], duration: 24, monthsRunning: 12, timePoints: ['0', '3', '6', '9', '12', '18', '24'],
      parameters: ['Appearance', 'Potency', 'Water content', 'Enteric protection'], notes: 'Illustrative demo study; values are not Lumen data.',
      results: [
        { timePoint: '0', parameter: 'Potency', result: '104%', specification: '60–140%', withinSpecification: true },
        { timePoint: '3', parameter: 'Potency', result: '101%', specification: '60–140%', withinSpecification: true },
        { timePoint: '6', parameter: 'Potency', result: '98%', specification: '60–140%', withinSpecification: true },
        { timePoint: '9', parameter: 'Potency', result: '97%', specification: '60–140%', withinSpecification: true },
        { timePoint: '12', parameter: 'Potency', result: '95%', specification: '60–140%', withinSpecification: true },
        { timePoint: '0', parameter: 'Water content', result: '5.1%', specification: '≤ 8.0%', withinSpecification: true },
        { timePoint: '6', parameter: 'Water content', result: '5.6%', specification: '≤ 8.0%', withinSpecification: true },
        { timePoint: '12', parameter: 'Water content', result: '6.0%', specification: '≤ 8.0%', withinSpecification: true },
      ] },
    { title: 'LMN-201 enteric capsules — accelerated, 40°C/75% RH (illustrative)', product: LMN201_DP, batch: 'LMN201-DP-2405', dosageForm: 'Enteric capsule', strength: 'Illustrative', scope: 'DP',
      studyType: 'accelerated', storage: ['ACC', '40°C ± 2°C / 75% ± 5% RH'], duration: 6, monthsRunning: 6, timePoints: ['0', '1', '3', '6'],
      parameters: ['Potency', 'Water content'], notes: 'Illustrative demo study.',
      results: [
        { timePoint: '0', parameter: 'Potency', result: '104%', specification: '60–140%', withinSpecification: true },
        { timePoint: '3', parameter: 'Potency', result: '93%', specification: '60–140%', withinSpecification: true },
        { timePoint: '6', parameter: 'Potency', result: '86%', specification: '60–140%', withinSpecification: true },
      ] },
  ],
  batches: [
    { number: 'LMN201-DS-2403', product: LMN201_DS, yieldPercent: 84, openDeviations: 0 },
    { number: 'LMN201-DS-2404', product: LMN201_DS, yieldPercent: 87, openDeviations: 1 },
    { number: 'LMN201-DP-2405', product: LMN201_DP, yieldPercent: 95, openDeviations: 0 },
  ],
};

/**
 * RePreve as the public listing describes it (randomized, double-blind,
 * placebo-controlled, 375 planned, sustained clinical cure at 12 weeks). The
 * planning assumptions the engine sizes it from are ILLUSTRATIVE.
 */
export const LMN201_DESIGN = {
  title: T('LMN-201 RePreve (NCT05330182) — Phase 2/3, recurrence prevention'),
  acronym: 'RePreve',
  phase: '3',
  indication: 'Prevention of recurrent Clostridioides difficile infection',
  productType: 'biologic',
  targetRegions: ['US'],
  objectives: [{ level: 'primary', order: 1, text: 'To evaluate whether LMN-201 with standard-of-care antibiotics improves sustained clinical cure compared with placebo.', endpointName: 'Sustained clinical cure at week 12' }],
  endpoints: [{ role: 'primary', name: 'Sustained clinical cure at week 12', type: 'binary', definition: 'Initial clinical cure and no recurrence of C. difficile infection through week 12 (public listing).', timepoint: 'Week 12' }],
  // Illustrative from here: the public listing names the endpoint, not the estimand or analysis.
  estimands: [{
    endpointName: 'Sustained clinical cure at week 12',
    population: 'All randomized participants (ITT)',
    variable: 'Initial clinical cure and no recurrence of C. difficile infection through week 12',
    summaryMeasure: 'Difference in proportions with a 95% confidence interval',
    strategy: 'composite',
    intercurrentEvents: [{ name: 'Discontinuation of study treatment or rescue CDI therapy', strategy: 'composite', justification: 'Counted as not cured (illustrative).' }],
  }],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo', controlJustification: 'Placebo on top of standard-of-care antibiotics (public listing).' },
  population: {
    targetDescription: 'Adults recently diagnosed with C. difficile infection receiving standard-of-care antibiotics (public listing).',
    analysisPopulations: [
      { kind: 'ITT', definition: 'All randomized participants, analysed as randomized (illustrative).', isPrimaryAnalysisSet: true },
      { kind: 'Safety', definition: 'All participants who received at least one dose (illustrative).' },
    ],
    eligibility: [],
  },
  randomization: { ratio: [1, 1], allocationMethod: 'block', blinding: 'double' },
  arms: [
    { name: 'LMN-201 + standard of care', interventions: [{ name: 'LMN-201', role: 'investigational' }] },
    { name: 'Placebo + standard of care', interventions: [{ name: 'Placebo', role: 'placebo' }] },
  ],
  statisticalPlan: {
    alpha: 0.05,
    power: 0.8,
    dropoutRate: 0.1,
    plannedSampleSize: 375,
    plannedAnalyses: [{ endpointName: 'Sustained clinical cure at week 12', method: 'CMH', estimandEndpointName: 'Sustained clinical cure at week 12' }],
    missingDataStrategy: 'Participants with a missing week-12 assessment counted as not cured (illustrative)',
    // Illustrative demo assumptions, not the sponsor's.
    powerAssumptions: { eventRate: 0.7, effectSize: 0.14 },
  },
};

export const TASKS = {
  'LMN-201': [
    { title: 'Compile Module 3 drug product section for the enteric capsule', moduleType: 'CMC', priority: 'high', status: 'in-progress', dueInDays: 12, description: 'Bring the enteric capsule specification, release method and stability data into §3.2.P.' },
    { title: 'Record the 12-month long-term stability pull', moduleType: 'CMC', priority: 'medium', status: 'pending', dueInDays: 20, description: 'Enter potency and water content at 12 months for lot LMN201-DP-2405 and re-run shelf-life trending.' },
    { title: 'Confirm RePreve sample size assumptions with biostatistics', moduleType: 'Biostatistics', priority: 'high', status: 'review', dueInDays: 6, description: 'Check the illustrative placebo cure rate and treatment effect behind the 375-participant plan.' },
    { title: 'Prepare the annual IND report', moduleType: 'IND', priority: 'medium', status: 'pending', dueInDays: 45, description: 'Summarise RePreve enrolment, safety and manufacturing changes for the IND annual report (21 CFR 312.33).' },
    { title: 'Review the synthetic CSR source before table generation', moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 15, description: 'Select the SYNTHETIC LMN-201-like CSR source in the Vault and run the source checks. Demonstration only — not clinical evidence.' },
    /* The rest of the study's week, so the board reads like a team's (2026-11-06, the founder: "users, full story in
       data … tasking too"). Fictional people and sites; a name not on the roster stays with the person seeding. */
    { title: 'Close out the Site 104 missed week-12 visit deviation', moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: -2, assignee: 'Mo Monitor', criticalPath: true, description: 'Synthetic demo: participant 104-007 missed the week-12 window by 4 days. Confirm the root cause, the CAPA and the impact on the primary endpoint.' },
    { title: 'Triggered monitoring visit at Site 107 after the AE reporting-lag KRI breach', moduleType: 'Clinical', priority: 'high', status: 'pending', dueInDays: 5, assignee: 'Mo Monitor', criticalPath: true, description: 'Synthetic demo: the AE reporting lag at Site 107 crossed its threshold two periods running. Source-verify AEs and retrain the coordinator.' },
    { title: 'Reconcile SAE listings with the safety database before the data cut', moduleType: 'Clinical', priority: 'high', status: 'review', dueInDays: 3, assignee: 'Rhea Reviewer', criticalPath: true, description: 'Synthetic demo: three SAEs to reconcile between the EDC listing and the safety database.' },
    { title: 'Database lock readiness checklist', moduleType: 'Biostatistics', priority: 'high', status: 'pending', dueInDays: 21, assignee: 'Sam Statistician', criticalPath: true, description: 'Open queries, SAE reconciliation, protocol deviations classified, medical coding signed off.' },
    { title: 'Approve the CSR shells and the tables, listings and figures plan', moduleType: 'Biostatistics', priority: 'medium', status: 'completed', dueInDays: -5, assignee: 'Sam Statistician', description: 'TLF shells for ICH E3 sections 11 and 12, agreed with clinical and medical writing.' },
    { title: 'Requalify the courier after the shipment temperature excursion', moduleType: 'Quality', priority: 'high', status: 'blocked', dueInDays: 4, assignee: 'Quinn Quality', description: 'Synthetic demo: blocked until the courier returns its data-logger records for the excursion.' },
    { title: "Sign the Investigator's Brochure version 4 update", moduleType: 'Clinical', priority: 'medium', status: 'review', dueInDays: 9, assignee: 'Ava Approver', description: 'Section 5 updated with Part B safety; awaiting the approver\'s e-signature.' },
    { title: 'Release drug product lot LMN201-DP-2406 for Part B resupply', moduleType: 'CMC', priority: 'high', status: 'completed', dueInDays: -10, assignee: 'Cal CMC', description: 'Synthetic demo lot: release testing complete and the certificate of analysis filed in the Vault.' },
    { title: 'Respond to the FDA information request on capsule dissolution', moduleType: 'IND', priority: 'high', status: 'in-progress', dueInDays: 7, assignee: 'Ana Author', criticalPath: true, description: 'Fictional information request: justify the dissolution method for the enteric capsule at pH 6.8.' },
    { title: 'Train site staff on protocol amendment 2', moduleType: 'Clinical', priority: 'medium', status: 'completed', dueInDays: -14, assignee: 'Mo Monitor', description: 'Training records for all eight synthetic sites filed before first use of amendment 2.' },
    { title: 'File the IRB continuing review approval in the Vault', moduleType: 'Clinical', priority: 'low', status: 'completed', dueInDays: -3, assignee: 'Ana Author', description: 'Fictional central IRB approval for another year of the RePreve study.' },
  ],
  'LMN-801': [
    { title: 'Draft the Phase 2 protocol synopsis', moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: 14, description: 'Body weight change and lean mass preservation as co-primary candidates.' },
    { title: 'Plan the pre-IND meeting request', moduleType: 'IND', priority: 'medium', status: 'pending', dueInDays: 30, description: 'Questions on oral delivery of a hormone protein and the nonclinical package.' },
    { title: 'Nonclinical gap assessment for oral protein absorption', moduleType: 'Nonclinical', priority: 'medium', status: 'in-progress', dueInDays: 10, assignee: 'Ana Author', description: 'Which bioavailability and local-tolerance studies the IND still needs.' },
    { title: 'Draft the pre-IND briefing package', moduleType: 'IND', priority: 'high', status: 'pending', dueInDays: 21, assignee: 'Ava Approver', criticalPath: true, description: 'Briefing document and questions for the fictional pre-IND meeting.' },
    { title: 'Select the manufacturer for the enteric formulation', moduleType: 'CMC', priority: 'medium', status: 'blocked', dueInDays: 12, assignee: 'Cal CMC', description: 'Blocked on the quality agreement with the shortlisted fictional manufacturer.' },
  ],
  'LMN-301': [
    { title: "Summarise Phase 1 safety for the Investigator's Brochure", moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 25, description: 'Single and multiple intranasal doses in healthy volunteers (NCT06030414).' },
    { title: 'Nasal tolerability assessment plan', moduleType: 'Nonclinical', priority: 'low', status: 'pending', dueInDays: 40, description: 'Local tolerance findings to carry into the next protocol.' },
    { title: 'Compile Phase 1 safety tables for the IB update', moduleType: 'Biostatistics', priority: 'medium', status: 'review', dueInDays: 8, assignee: 'Sam Statistician', description: 'Synthetic summary tables of adverse events by dose cohort.' },
    { title: 'Draft the Phase 2 protocol concept', moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: 18, assignee: 'Ana Author', criticalPath: true, description: 'Population, endpoints and the dose to carry forward from Phase 1.' },
    { title: 'Close the Phase 1 database and archive the study files', moduleType: 'Clinical', priority: 'low', status: 'completed', dueInDays: -20, assignee: 'Rhea Reviewer', description: 'Synthetic demo: final archive filed in the Vault.' },
  ],
  'LMN-401': [
    { title: 'Field proof-of-concept study outline', moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 60, description: 'Planned 2026 field study, informed by the travelers\' diarrhea etiology study (NCT06363890).' },
    { title: 'Pre-IND meeting request letter', moduleType: 'IND', priority: 'high', status: 'pending', dueInDays: 12, assignee: 'Ava Approver', criticalPath: true, description: 'Fictional meeting request: the antibody cocktail, its nonclinical package and the field-study design.' },
    { title: 'Review the etiology study data listings', moduleType: 'Clinical', priority: 'medium', status: 'completed', dueInDays: -7, assignee: 'Rhea Reviewer', description: 'Synthetic listings reviewed; pathogen distribution summarised for the briefing package.' },
  ],
};

/**
 * A FICTIONAL FDA approval letter for LMN-201, filed in the LMN-201 data room
 * and logged in its agency inbox, so the inbox's "extract commitments"
 * (shared/agency/letter-commitments.ts, P-81, P-84) has a letter to read.
 * LMN-201 is not an approved product: no FDA action, no Lumen Bioscience
 * authorization and no real person is represented, and the letter says so at
 * its head and foot. It is addressed to the demonstration's own fictional
 * sponsor. The layout is FDA's, as the parser's test sets it out
 * (shared/agency/__tests__/letter-commitments.test.ts): two PMRs under 505(o)
 * with their schedules, a deferred PREA study, and a 506B PMC. Its dates are
 * fixed, so the bytes, and the data room's checksum of them, are the same on
 * every run. ASCII only: the upload's file name becomes the source's title.
 */
export const APPROVAL_LETTER = {
  fileName: '[Demo] FDA approval letter (fictional) - LMN-201 BLA 761901.txt',
  communication: {
    sourceType: 'uploaded_official_correspondence',
    communicationType: 'FDA approval letter (fictional demo), BLA 761901',
    sourceChannel: 'Demo seed: fictional letter',
    letterClass: 'approval_letter',
    urgency: 'medium',
    responseRequired: false,
  },
  /** What the inbox must find in it, or the step fails. */
  expect: { commitments: ['4710-1', '4710-2', '4710-3', '4710-4'], questions: 0 },
  text: `DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.
LMN-201 IS NOT AN APPROVED PRODUCT. NO LUMEN BIOSCIENCE AUTHORIZATION IS REPRESENTED.

Food and Drug Administration
Silver Spring MD 20993

BLA 761901
BLA APPROVAL

Concept2Cure Therapeutics (fictional demonstration sponsor)
Attention: Regulatory Affairs

Dear Regulatory Affairs:

Please refer to your biologics license application (BLA) submitted under section 351(a)
of the Public Health Service Act for LMN-201 (illustrative), an orally administered
antibody cocktail.

We have completed our review of this application. It is approved for the prevention of
recurrent Clostridioides difficile infection in adults. We remind you of your
postmarketing obligations, described below.

POSTMARKETING REQUIREMENTS UNDER 505(o)

Section 505(o)(3) of the FDCA authorizes FDA to require holders of approved drug and
biological product applications to conduct postmarketing studies and clinical trials
for certain purposes, if FDA makes certain findings required by the statute. We have
determined that you are required to conduct the following:

4710-1    Conduct a randomized, double-blind, placebo-controlled trial to evaluate the
          long-term safety of LMN-201, including serious hypersensitivity reactions, in
          adults treated for the prevention of recurrent C. difficile infection.

The timetable you submitted states that you will conduct this trial according to the
following schedule:

          Draft Protocol Submission:    06/2027
          Final Protocol Submission:    09/2027
          Trial Completion:             12/2029
          Final Report Submission:      06/2030

4710-2    Conduct an observational study in a US claims database to assess the incidence
          of serious gastrointestinal adverse events in patients treated with LMN-201,
          compared with patients treated with standard of care alone.

          Final Protocol Submission:    03/2027
          Study Completion:             09/2029
          Final Report Submission:      03/2030

PEDIATRIC RESEARCH EQUITY ACT REQUIREMENTS

We are deferring submission of your pediatric study for ages 2 to less than 18 years
for this application because this product is ready for approval for use in adults and
the pediatric study has not been completed. Your deferred pediatric study required
under section 505B(a) of the FDCA is a required postmarketing study, listed below.

4710-3    Conduct a pharmacokinetic, safety and efficacy study of LMN-201 in pediatric
          patients 2 to less than 18 years of age for the prevention of recurrent
          C. difficile infection.

          Final Protocol Submission:    March 2027
          Study Completion:             December 2029
          Final Report Submission:      June 30, 2030

POSTMARKETING COMMITMENTS SUBJECT TO REPORTING REQUIREMENTS UNDER SECTION 506B

We remind you of your postmarketing commitment:

4710-4    Develop and validate a cell-based toxin B neutralisation potency assay for
          LMN-201 drug substance release and stability testing, and submit the
          validation report.

          Final Report Submission:      12/2027

Submit clinical protocols to your IND for this product. Submit nonclinical and
chemistry, manufacturing, and controls protocols and all postmarketing final reports
to this BLA.

If you have any questions, call the Regulatory Project Manager for this application.

Sincerely,
{See appended electronic signature page}

DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.
`,
};

/**
 * A FICTIONAL FDA information request on the LMN-201 IND, so Communication has a letter that needs an answer and
 * Respond has questions to answer (2026-11-06, the founder: "full story in data"). Its three numbered questions are
 * the ones the inbox's splitter reads (shared/agency/__tests__/letter-questions.test.ts). It ties to the board's task
 * "Respond to the FDA information request on capsule dissolution". Not issued by FDA; the IND number is invented.
 * Fixed text and dates, so the data room's checksum is the same on every run. ASCII only.
 */
export const INFORMATION_REQUEST = {
  fileName: '[Demo] FDA information request (fictional) - LMN-201 IND 194021.txt',
  communication: {
    sourceType: 'uploaded_official_correspondence',
    communicationType: 'FDA information request (fictional demo), IND 194021',
    sourceChannel: 'Demo seed: fictional letter',
    letterClass: 'information_request',
    urgency: 'high',
    responseRequired: true,
  },
  expect: { commitments: [], questions: 3 },
  text: `DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.
NO LUMEN BIOSCIENCE AUTHORIZATION IS REPRESENTED. ALL DATA REFERRED TO ARE SYNTHETIC.

DEPARTMENT OF HEALTH AND HUMAN SERVICES
Food and Drug Administration
Silver Spring, MD 20993

IND 194021
October 28, 2026

Concept2Cure Therapeutics (fictional demonstration sponsor)
Attention: Regulatory Affairs

Dear Regulatory Affairs:

Please refer to your Investigational New Drug Application (IND) for LMN-201 (illustrative) enteric capsules.

We are reviewing your submission and have the following requests for information:

1. Provide the dissolution method and its discriminating power for the enteric capsule at pH 6.8, including
   the data supporting the acceptance criterion for lot LMN201-DP-2406.

2. Submit the 12-month long-term stability data for the drug product lots used in Part B, and justify the
   proposed shelf life if any result is trending toward its limit.

3. Clarify how serious adverse events reported at the clinical sites are reconciled with the safety
   database before each data cut, and identify any SAE that remains unreconciled.

Please submit your response as an amendment to this IND within 30 days.

If you have any questions, please contact the Regulatory Project Manager (fictional) at 301-796-0000.

Sincerely,
{See appended electronic signature page}
`,
};
