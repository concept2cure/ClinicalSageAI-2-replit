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
  ],
  'LMN-801': [
    { title: 'Draft the Phase 2 protocol synopsis', moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: 14, description: 'Body weight change and lean mass preservation as co-primary candidates.' },
    { title: 'Plan the pre-IND meeting request', moduleType: 'IND', priority: 'medium', status: 'pending', dueInDays: 30, description: 'Questions on oral delivery of a hormone protein and the nonclinical package.' },
  ],
  'LMN-301': [
    { title: "Summarise Phase 1 safety for the Investigator's Brochure", moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 25, description: 'Single and multiple intranasal doses in healthy volunteers (NCT06030414).' },
    { title: 'Nasal tolerability assessment plan', moduleType: 'Nonclinical', priority: 'low', status: 'pending', dueInDays: 40, description: 'Local tolerance findings to carry into the next protocol.' },
  ],
  'LMN-401': [
    { title: 'Field proof-of-concept study outline', moduleType: 'Clinical', priority: 'medium', status: 'pending', dueInDays: 60, description: 'Planned 2026 field study, informed by the travelers\' diarrhea etiology study (NCT06363890).' },
  ],
};
