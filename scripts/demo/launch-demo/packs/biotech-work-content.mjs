/**
 * launch-demo/packs/biotech-work-content.mjs — C2C-101's tasks, CMC registers
 * and study design (fictional), written by work-areas.mjs.
 *
 * C2C-101 is the pack's fictional humanized IgG1 anti-IL-23p19 antibody, a
 * 100 mg/mL solution in a prefilled syringe. The figures below are planning
 * and test values of a demonstration product, not data from any real study.
 */
import { T } from './biotech-content.mjs';

export const BIOTECH_TASKS = [
  { title: T('Finalise drug substance specification for the IND (§3.2.S.4.1)'), moduleType: 'CMC', priority: 'high', status: 'in-progress', dueInDays: 10,
    description: 'Close the acceptance criteria for potency, SEC monomer and host cell protein with QC, then route the specification for approval.' },
  { title: T('Record the 6-month pull of the drug product stability study'), moduleType: 'CMC', priority: 'medium', status: 'pending', dueInDays: 21,
    description: 'Enter the 6-month results at 5°C and 25°C/60% RH for lot C2C101-DP-2501 and re-run shelf-life trending.' },
  { title: T('Review sample size and power for Protocol C2C-101-201'), moduleType: 'Biostatistics', priority: 'high', status: 'review', dueInDays: 7,
    description: 'Confirm the PASI 75 week-16 assumptions (placebo 8%, active 50%) and the 15% dropout allowance before the protocol is signed.' },
  { title: T('Draft the Investigator\'s Brochure summary of nonclinical findings'), moduleType: 'Nonclinical', priority: 'medium', status: 'pending', dueInDays: 28,
    description: 'Summarise the 26-week cynomolgus toxicology study and tissue cross-reactivity results for IB section 5.' },
  { title: T('Complete Form FDA 1571 and 1572 for sequence 0000'), moduleType: 'IND', priority: 'critical', status: 'pending', dueInDays: 14,
    description: 'Fill the sponsor, investigator and IRB details and attach the signed forms to Module 1 of the original IND.' },
  { title: T('Approve the clinical protocol synopsis'), moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: 5,
    description: 'Medical monitor and biostatistics sign-off on Protocol Synopsis C2C-101-201.' },
];

const DS = 'C2C-101 drug substance';
const DP = 'C2C-101 drug product, 100 mg/mL prefilled syringe';

export const BIOTECH_CMC = {
  specs: [
    { material: 'Drug substance', name: `${DS} — potency (IL-23 neutralisation bioassay)`, release: '70–130% of reference standard', method: 'Cell-based IL-23-induced IL-17A release assay', ich: 'ICH Q6B', justification: 'Range set from development lots and assay variability (CV 12%).' },
    { material: 'Drug substance', name: `${DS} — purity by SEC-HPLC`, release: 'Monomer ≥ 95.0%; high molecular weight species ≤ 3.0%', method: 'Size-exclusion HPLC, UV 280 nm', ich: 'ICH Q6B' },
    { material: 'Drug substance', name: `${DS} — host cell protein`, release: '≤ 100 ppm', method: 'CHO HCP ELISA', ich: 'ICH Q6B' },
    { material: 'Drug product', name: `${DP} — appearance and pH`, release: 'Clear to slightly opalescent, colourless to slightly yellow; pH 5.5–6.5', shelf: 'Clear to slightly opalescent; pH 5.5–6.5', method: 'Visual inspection; potentiometry', ich: 'ICH Q6B' },
    { material: 'Drug product', name: `${DP} — subvisible particles`, release: '≥10 µm: ≤ 6000 per container; ≥25 µm: ≤ 600 per container', method: 'Light obscuration (USP <787>)', ich: 'ICH Q6B' },
  ],
  stability: [
    { title: 'C2C-101 drug product — long-term, 5°C', product: DP, batch: 'C2C101-DP-2501', dosageForm: 'Solution for injection', strength: '100 mg/mL', scope: 'DP',
      studyType: 'long-term', storage: ['LT', '5°C ± 3°C'], duration: 36, monthsRunning: 6, timePoints: ['0', '1', '3', '6', '9', '12', '18', '24', '36'],
      parameters: ['Appearance', 'pH', 'SEC monomer', 'Potency'], notes: 'Upright and inverted orientation; primary registration lot.',
      results: [
        { timePoint: '0', parameter: 'SEC monomer', result: '98.9%', specification: '≥ 95.0%', withinSpecification: true },
        { timePoint: '3', parameter: 'SEC monomer', result: '98.7%', specification: '≥ 95.0%', withinSpecification: true },
        { timePoint: '6', parameter: 'SEC monomer', result: '98.5%', specification: '≥ 95.0%', withinSpecification: true },
        { timePoint: '0', parameter: 'Potency', result: '102%', specification: '70–130%', withinSpecification: true },
        { timePoint: '3', parameter: 'Potency', result: '99%', specification: '70–130%', withinSpecification: true },
        { timePoint: '6', parameter: 'Potency', result: '101%', specification: '70–130%', withinSpecification: true },
      ] },
    { title: 'C2C-101 drug product — accelerated, 25°C/60% RH', product: DP, batch: 'C2C101-DP-2501', dosageForm: 'Solution for injection', strength: '100 mg/mL', scope: 'DP',
      studyType: 'accelerated', storage: ['ACC', '25°C ± 2°C / 60% ± 5% RH'], duration: 6, monthsRunning: 3, timePoints: ['0', '1', '3', '6'],
      parameters: ['Appearance', 'SEC monomer', 'Potency'], notes: 'Supports excursion statements for labelling.',
      results: [
        { timePoint: '0', parameter: 'SEC monomer', result: '98.9%', specification: '≥ 95.0%', withinSpecification: true },
        { timePoint: '1', parameter: 'SEC monomer', result: '98.1%', specification: '≥ 95.0%', withinSpecification: true },
        { timePoint: '3', parameter: 'SEC monomer', result: '97.0%', specification: '≥ 95.0%', withinSpecification: true },
      ] },
  ],
  batches: [
    { number: 'C2C101-DS-2412', product: DS, yieldPercent: 88, openDeviations: 0 },
    { number: 'C2C101-DS-2501', product: DS, yieldPercent: 91, openDeviations: 1 },
    { number: 'C2C101-DP-2501', product: DP, yieldPercent: 96, openDeviations: 0 },
  ],
};

/** Protocol C2C-101-201's design as the protocol states it, with the planning assumptions the engine sizes it from. */
export const BIOTECH_STUDY_DESIGN = {
  title: T('C2C-101-201 — Phase 2 dose-ranging study in plaque psoriasis'),
  acronym: 'C2C-201',
  phase: '2',
  indication: 'Moderate-to-severe plaque psoriasis',
  productType: 'biologic',
  targetRegions: ['US'],
  objectives: [{ level: 'primary', order: 1, text: 'To evaluate the efficacy of C2C-101 compared with placebo in adults with moderate-to-severe plaque psoriasis.', endpointName: 'PASI 75 at week 16' }],
  endpoints: [{ role: 'primary', name: 'PASI 75 at week 16', type: 'binary', definition: 'Proportion of participants with at least a 75% reduction from baseline in Psoriasis Area and Severity Index at week 16.', timepoint: 'Week 16' }],
  estimands: [],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'parallel_group', controlType: 'placebo', controlJustification: 'Placebo control for 16 weeks is accepted in moderate-to-severe psoriasis, with rescue to active treatment.' },
  population: { targetDescription: 'Adults aged 18–75 with chronic plaque psoriasis for at least 6 months, BSA ≥ 10%, PASI ≥ 12 and sPGA ≥ 3.', analysisPopulations: [], eligibility: [] },
  arms: [
    { name: 'C2C-101 100 mg SC', interventions: [{ name: 'C2C-101 100 mg', role: 'investigational' }] },
    { name: 'Placebo SC', interventions: [{ name: 'Placebo', role: 'placebo' }] },
  ],
  statisticalPlan: {
    alpha: 0.05,
    power: 0.9,
    dropoutRate: 0.15,
    plannedAnalyses: [],
    powerAssumptions: { eventRate: 0.08, effectSize: 0.42 },
  },
};
