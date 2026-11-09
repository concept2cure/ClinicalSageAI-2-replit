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
  { title: 'Finalise drug substance specification for the IND (§3.2.S.4.1)', moduleType: 'CMC', priority: 'high', status: 'in-progress', dueInDays: 10,
    description: 'Close the acceptance criteria for potency, SEC monomer and host cell protein with QC, then route the specification for approval.' },
  { title: 'Record the 6-month pull of the drug product stability study', moduleType: 'CMC', priority: 'medium', status: 'pending', dueInDays: 21,
    description: 'Enter the 6-month results at 5°C and 25°C/60% RH for lot C2C101-DP-2501 and re-run shelf-life trending.' },
  { title: 'Review sample size and power for Protocol C2C-101-201', moduleType: 'Biostatistics', priority: 'high', status: 'review', dueInDays: 7,
    description: 'Confirm the PASI 75 week-16 assumptions (placebo 8%, active 50%) and the 15% dropout allowance before the protocol is signed.' },
  { title: "Draft the Investigator's Brochure summary of nonclinical findings", moduleType: 'Nonclinical', priority: 'medium', status: 'pending', dueInDays: 28,
    description: 'Summarise the 26-week cynomolgus toxicology study and tissue cross-reactivity results for IB section 5.' },
  { title: 'Complete Form FDA 1571 and 1572 for sequence 0000', moduleType: 'IND', priority: 'critical', status: 'pending', dueInDays: 14,
    description: 'Fill the sponsor, investigator and IRB details and attach the signed forms to Module 1 of the original IND.' },
  { title: 'Approve the clinical protocol synopsis', moduleType: 'Clinical', priority: 'high', status: 'in-progress', dueInDays: 5,
    description: 'Medical monitor and biostatistics sign-off on Protocol Synopsis C2C-101-201.' },
];

const DS = 'C2C-101 drug substance';
const DP = 'C2C-101 drug product, 100 mg/mL prefilled syringe';

export const BIOTECH_CMC = {
  /**
   * The drug substance §3.2.S is written about. Without it
   * `compositionRefusal` answers CMC_MODALITY_NOT_ESTABLISHED — "this project
   * records no drug substance" — rather than the refusal that is TRUE of
   * C2C-101, which is that a monoclonal antibody's quality requirements are
   * ICH Q6B, Q5A(R2) and Q5C and are not composed here (P-28). The modality is
   * STATED: `classifySubstanceModality` would otherwise read it from the route,
   * and a demo whose composition scope depends on that heuristic changes
   * meaning when someone rewords a process description.
   */
  substance: {
    name: 'C2C-101',
    inn: 'fictional — no INN assigned',
    manufacturer: 'Concept2Cure Biologics (fictional)',
    site: 'Building 4, Cambridge MA (fictional)',
    route: 'CHO-K1 fed-batch cell culture; harvest by depth filtration; Protein A capture, low-pH viral inactivation, cation and anion exchange, viral filtration, UF/DF into formulation buffer.',
    structuralFormula: 'Humanised IgG1 heavy and light chain sequences — see §3.2.S.3.1 (fictional).',
    modality: 'biologic',
    biologicalOrigin: 'CHO-K1 cell culture',
    cellLine: 'CHO-K1, master cell bank MCB-C2C101-01 (fictional)',
    sourceOrganism: 'Chinese hamster (Cricetulus griseus) ovary cell line',
    viralSafetyEvaluation: 'Fictional ICH Q5A(R2) record: low-pH inactivation and 20 nm viral filtration, each with a validated log reduction; MCB and end-of-production cells tested.',
    tseStatus: 'No animal-derived raw materials in the process or the media (fictional record, EMA EMEA/410/01).',
    developmentPhase: 'phase_2',
    status: 'development',
  },

  /** The finished product §3.2.P.1 – §3.2.P.8 is written about. */
  product: {
    name: 'C2C-101 injection',
    dosageForm: 'Solution for injection',
    strength: '100 mg/mL',
    route: 'Subcutaneous',
    composition: 'C2C-101 100 mg/mL, histidine buffer pH 6.0, sucrose, polysorbate 80, water for injection.',
    batchFormula: 'Per 2.0 L batch: C2C-101 200 g, L-histidine 3.1 g, L-histidine hydrochloride 4.9 g, sucrose 160 g, polysorbate 80 0.4 g, water for injection to 2.0 L (fictional).',
    process: 'Thaw and pool drug substance, compound to target with buffer and excipients, 0.22 µm sterile filtration, aseptic fill into vials, visual inspection, label and pack.',
    site: 'Building 7 aseptic fill suite, Cambridge MA (fictional)',
    containerClosure: '2 mL Type I borosilicate glass vial, fluoropolymer-laminated bromobutyl stopper, aluminium crimp seal.',
    status: 'development',
  },

  /**
   * The analytical procedures the specifications below are measured by, one per
   * distinct `method` string. They are recorded in the method register because
   * the approval route resolves a limit's named procedure against it and
   * refuses METHOD_NOT_IN_REGISTER otherwise
   * (services/cmc/analytical-method-source.ts) — and because §3.2.S.4.3's
   * Analytical Methods table has no other source.
   *
   * `status` is never `validated` here: validation is a governed act with a
   * signature (POST /analytical-methods/:id/validate), and a create carrying
   * that word is refused with a 409. The seeder records each method with its
   * ICH Q2 parameters, which is what the validation signs for, and performs
   * the signature when a signer credential is supplied.
   */
  methods: [
    { code: 'AM-101', title: 'Cell-based IL-23-induced IL-17A release assay', purpose: 'Potency', analyte: 'C2C-101 (IL-23p19 neutralising activity)', matrix: 'Drug substance and drug product', technique: 'Cell-based bioassay', status: 'validation',
      characteristics: ['specificity', 'accuracy', 'precision (repeatability)', 'precision (intermediate)', 'linearity', 'range'],
      summary: 'Relative potency against the reference standard across 50–200% of nominal; intermediate precision CV 12%, within the 70–130% release range the specification sets.' },
    { code: 'AM-102', title: 'Size-exclusion HPLC, UV 280 nm', purpose: 'Purity and aggregation', analyte: 'Monomer, high molecular weight species', matrix: 'Drug substance and drug product', technique: 'SEC-HPLC', status: 'validation',
      characteristics: ['specificity', 'accuracy', 'precision (repeatability)', 'linearity', 'range', 'quantitation limit'],
      summary: 'Monomer and HMW species resolved with R > 1.5; quantitation limit 0.1% HMW, below the 3.0% specification limit.' },
    { code: 'AM-103', title: 'CHO HCP ELISA', purpose: 'Process-related impurity', analyte: 'CHO host cell protein', matrix: 'Drug substance', technique: 'Sandwich ELISA', status: 'validation',
      characteristics: ['specificity', 'accuracy', 'precision (repeatability)', 'linearity', 'range', 'quantitation limit'],
      summary: 'Antibody coverage established by 2-D Western blot; quantitation limit 2 ppm against a 100 ppm limit, spike recovery 85–115%.' },
    { code: 'AM-104', title: 'Visual inspection; potentiometry', purpose: 'Appearance and pH', analyte: 'Appearance, pH', matrix: 'Drug product', technique: 'Visual inspection (Ph. Eur. 2.9.20); potentiometry', status: 'validation',
      characteristics: ['specificity', 'precision (repeatability)'],
      summary: 'Appearance is a qualitative identity-class test; pH precision 0.02 units against a 5.5–6.5 range.' },
    { code: 'AM-105', title: 'Light obscuration (USP <787>)', purpose: 'Subvisible particles', analyte: 'Particles ≥10 µm and ≥25 µm', matrix: 'Drug product', technique: 'Light obscuration', status: 'validation',
      characteristics: ['specificity', 'precision (repeatability)', 'accuracy'],
      summary: 'Compendial procedure verified for this product per USP <787>; counts against the 6000 / 600 per container limits.' },
  ],
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

/**
 * Protocol C2C-101-201's design as the protocol states it (biotech-content.mjs:
 * synopsis, §9 sample size, SAP §2-5): three arms 1:1:1, 180 participants, a
 * composite estimand for PASI 75 at Week 16, a stratified CMH test with
 * non-responder imputation at a two-sided 0.025 per comparison, and a fixed
 * sequence. The sizing comparison is the conservative one, 100 mg vs placebo
 * (55 % vs 8 %). 2026-10-31: the seeded design had two arms and no estimand,
 * analysis or populations, and contradicted the protocol beside it.
 */
export const BIOTECH_STUDY_DESIGN = {
  title: T('C2C-101-201 — Phase 2 dose-ranging study in plaque psoriasis'),
  acronym: 'C2C-201',
  phase: '2',
  indication: 'Moderate-to-severe plaque psoriasis',
  productType: 'biologic',
  targetRegions: ['US'],
  objectives: [
    { level: 'primary', order: 1, text: 'To evaluate the efficacy of two subcutaneous dose regimens of C2C-101 compared with placebo in adults with moderate-to-severe plaque psoriasis.', endpointName: 'PASI 75 at Week 16' },
    { level: 'secondary', order: 2, text: 'To evaluate sPGA 0/1, PASI 90, PASI 100 and change in DLQI at Week 16.', endpointName: 'sPGA 0/1 at Week 16' },
  ],
  endpoints: [
    { role: 'primary', name: 'PASI 75 at Week 16', type: 'binary', definition: 'At least a 75% reduction from baseline in Psoriasis Area and Severity Index at Week 16.', timepoint: 'Week 16' },
    { role: 'key_secondary', name: 'sPGA 0/1 at Week 16', type: 'binary', definition: 'Static Physician Global Assessment of clear (0) or almost clear (1) at Week 16.', timepoint: 'Week 16' },
  ],
  estimands: [{
    endpointName: 'PASI 75 at Week 16',
    population: 'Adults with moderate-to-severe plaque psoriasis as defined by the eligibility criteria (all randomized, ITT)',
    variable: 'PASI 75 response at Week 16',
    summaryMeasure: 'Difference in response proportions with a 95% confidence interval',
    treatmentCondition: 'C2C-101 100 mg or 200 mg versus placebo, as randomized',
    strategy: 'composite',
    intercurrentEvents: [
      { name: 'Discontinuation of study treatment for any reason', strategy: 'composite', justification: 'Counted as non-response.' },
      { name: 'Use of prohibited psoriasis therapy', strategy: 'composite', justification: 'Counted as non-response.' },
    ],
  }],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'dose_ranging', controlType: 'placebo', controlJustification: 'Placebo control for 16 weeks is accepted in moderate-to-severe psoriasis; participants then enter an open-label extension.' },
  population: {
    targetDescription: 'Adults aged 18–75 with chronic plaque psoriasis for at least 6 months, PASI ≥ 12, BSA ≥ 10% and sPGA ≥ 3.',
    analysisPopulations: [
      { kind: 'ITT', definition: 'All randomized participants, analysed as randomized.', isPrimaryAnalysisSet: true },
      { kind: 'Safety', definition: 'All participants who received at least one dose, analysed by treatment received.' },
      { kind: 'PP', definition: 'ITT participants without major protocol deviations affecting the primary endpoint, defined before unblinding.' },
      { kind: 'PK', definition: 'Participants with at least one evaluable post-dose concentration.' },
    ],
    eligibility: [],
  },
  arms: [
    { name: 'C2C-101 200 mg', interventions: [{ name: 'C2C-101 200 mg', role: 'investigational', dose: '200 mg', route: 'subcutaneous', regimen: 'Weeks 0 and 4, then every 8 weeks' }] },
    { name: 'C2C-101 100 mg', interventions: [{ name: 'C2C-101 100 mg', role: 'investigational', dose: '100 mg', route: 'subcutaneous', regimen: 'Weeks 0 and 4, then every 8 weeks' }] },
    { name: 'Placebo', interventions: [{ name: 'Placebo', role: 'placebo', route: 'subcutaneous', regimen: 'Weeks 0 and 4, then every 8 weeks' }] },
  ],
  randomization: { ratio: [1, 1, 1], allocationMethod: 'stratified', stratificationFactors: ['Body weight (≤ 90 kg, > 90 kg)', 'Prior biologic exposure (yes/no)'], blinding: 'double' },
  statisticalPlan: {
    alpha: 0.025,
    power: 0.9,
    plannedSampleSize: 180,
    dropoutRate: 0.08,
    plannedAnalyses: [
      { endpointName: 'PASI 75 at Week 16', method: 'CMH', estimandEndpointName: 'PASI 75 at Week 16' },
      { endpointName: 'sPGA 0/1 at Week 16', method: 'CMH' },
    ],
    multiplicity: { method: 'fixed_sequence', alphaAllocation: [{ endpointName: 'PASI 75 at Week 16', alpha: 0.025 }] },
    missingDataStrategy: 'Non-responder imputation; sensitivity by multiple imputation under missing at random and a tipping-point analysis',
    sensitivityAnalysesSpecified: true,
    powerAssumptions: { eventRate: 0.08, effectSize: 0.47 },
  },
};

/**
 * A FICTIONAL FDA information request on the C2C-101 IND, filed in the
 * program's data room and logged in its agency inbox, so the inbox proposes
 * its numbered questions (G3, shared/agency/letter-questions.ts). Not issued
 * by FDA; no real person is named. Fixed text, so its checksum is the same on
 * every run; ASCII only, as its file name becomes the source's title.
 */
export const BIOTECH_IR_LETTER = {
  fileName: '[Demo] FDA information request (fictional) - IND C2C-101.txt',
  communication: {
    sourceType: 'uploaded_official_correspondence',
    communicationType: 'FDA information request (fictional demo), IND C2C-101',
    sourceChannel: 'Demo seed: fictional letter',
    letterClass: 'information_request',
    urgency: 'high',
    responseRequired: true,
  },
  expect: { commitments: [], questions: 3 },
  text: `DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.

Food and Drug Administration
Silver Spring MD 20993

IND C2C-101 (fictional)
INFORMATION REQUEST

Concept2Cure Therapeutics (fictional demonstration sponsor)
Attention: Regulatory Affairs

Dear Regulatory Affairs:

Please refer to your Investigational New Drug Application (IND) for C2C-101, a
humanized IgG1 anti-IL-23p19 monoclonal antibody, 100 mg/mL solution in a prefilled
syringe.

We are reviewing your submission and have the following requests for information:

1. Provide the batch analysis data for each drug substance lot used in the 26-week
   cynomolgus toxicology study, including host cell protein and SEC monomer results.

2. Justify the proposed potency acceptance criterion for drug product release.
   Specifically:
   a. state the assay's intermediate precision, and
   b. describe how the criterion relates to the lots used in the toxicology study.

3. Submit the 6-month stability results for drug product lot C2C101-DP-2501 at 5 C
   and 25 C/60% RH, with the shelf-life trending.

Please submit your response as an amendment to this IND.

If you have any questions, call the Regulatory Project Manager for this application.

Sincerely,
{See appended electronic signature page}

DEMONSTRATION ONLY: FICTIONAL LETTER. NOT ISSUED BY FDA.
`,
};
