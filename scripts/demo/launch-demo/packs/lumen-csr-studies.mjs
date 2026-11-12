/**
 * launch-demo/packs/lumen-csr-studies.mjs — the three synthetic studies behind the Lumen account's completed CSRs
 * (2026-11-12, the founder: "more completed full CSR report faux examples in the demo environment that can be run
 * from my code space and connected to one demo access users").
 *
 * Each study is INVENTED. LMN-201's subject-level source is the kit's file (lmn201_synthetic_csr_source_v2.json,
 * already frozen into its CSR). LMN-801 and LMN-301 have none, so their sources are generated here, deterministically
 * from a fixed seed: the same bytes on every run and in every Codespace, so the Vault finds the file it filed before
 * and the frozen study data never moves. Every source is in the platform's own format (shared/csr-source-input.ts,
 * concept2cure.csr-source.v1) and passes its schema (lumen-csr-studies.test.mjs).
 *
 * What a study states beyond its data (objectives, criteria, sites, dates, people) is narrative for the report text
 * (lumen-csr-text.mjs). Every person, site, board and date is fictional, and every title says SYNTHETIC.
 */

/** Mulberry32: a small seeded generator, so a source is the same on every run. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** A normal draw (Box–Muller) from the seeded generator. */
function normal(rand, mean, sd) {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick(rand, weighted) {
  const total = weighted.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [value, w] of weighted) { r -= w; if (r <= 0) return value; }
  return weighted[weighted.length - 1][0];
}

/* ── The three studies ─────────────────────────────────────────────────────────────────────────────────────────── */

const COMMON_PEOPLE = {
  sponsorSignatory: 'Medical Director, Lumen Bioscience (fictional demo role)',
  statistician: 'Biostatistics lead, Concept2Cure demo team (fictional)',
  medicalWriter: 'Medical writing, Concept2Cure demo team (fictional)',
  cro: 'Northlake Clinical Services (fictional CRO)',
  centralLab: 'Cascade Central Laboratory (fictional)',
};

/**
 * LMN-201: the narrative for the kit's existing source. Its numbers all come from that file; nothing here restates
 * a count.
 */
export const LMN201_CSR = {
  key: 'lmn201',
  projectCode: 'LMN-201',
  role: 'in-review',
  reportTitle: 'LMN-201 RePreve Part B Clinical Study Report — SYNTHETIC',
  reportVersion: '1.0',
  sourceFromKit: true,
  shortName: 'LMN-201 Part B',
  productDescription: 'LMN-201 (illustrative): an oral cocktail of three toxin B-neutralising binding proteins and a phage-derived lysin, produced in spirulina and given with standard-of-care antibiotics',
  population: 'adults with a recent episode of Clostridioides difficile infection (CDI) receiving standard-of-care antibiotics',
  design: 'a randomised, double-blind, placebo-controlled, parallel-group study',
  durationText: '14 days of study treatment with follow-up to week 12',
  dates: { firstSubjectIn: '2025-11-03', lastSubjectOut: '2026-09-15', dataCut: '2026-10-01', report: '2026-11-12' },
  sites: [
    { id: '101', name: 'Riverbend Infectious Disease Clinic (fictional)', pi: 'Dr. Imani Okafor-Lindqvist (fictional)', irb: 'Harborview Research Ethics Board (fictional)' },
    { id: '104', name: 'Mesa Valley Gastroenterology (fictional)', pi: 'Dr. Tomas Varga (fictional)', irb: 'Harborview Research Ethics Board (fictional)' },
    { id: '106', name: 'Lakeshore Clinical Research Unit (fictional)', pi: 'Dr. Priya Raman (fictional)', irb: 'Lakeshore Institutional Review Board (fictional)' },
  ],
  objectives: {
    primary: ['To evaluate whether LMN-201 with standard-of-care antibiotics improves the synthetic global cure indicator compared with control.'],
    secondary: ['To describe the safety and tolerability of LMN-201 over 14 days of treatment and 12 weeks of follow-up.'],
    exploratory: ['To describe vital signs, laboratory shifts and concomitant medication use by arm.'],
  },
  inclusion: [
    'Adults aged 18 years or older at consent.',
    'A current episode of CDI with diarrhoea and a positive stool test for toxigenic C. difficile.',
    'Receiving or about to start standard-of-care antibiotics for the current episode.',
    'Able to give written informed consent and to swallow capsules.',
  ],
  exclusion: [
    'Fulminant or complicated CDI requiring intensive care.',
    'Inflammatory bowel disease or a planned faecal microbiota transplant during the study.',
    'Known hypersensitivity to spirulina or any component of the study product.',
    'Participation in another interventional study within 30 days.',
  ],
  dosing: { active: 'LMN-201 capsules, three times daily for 14 days (illustrative regimen)', control: 'matching placebo capsules, three times daily for 14 days' },
  randomisation: 'Participants were randomised 1:1 by an interactive response system using permuted blocks, stratified by site.',
  blinding: 'Participants, investigators, site staff and the sponsor\'s study team were blinded; placebo capsules matched the active capsules in appearance.',
  efficacyAnalysis: 'The primary analysis compared the proportion of participants meeting the synthetic global cure indicator between arms in the ITT population.',
  sampleSizeText: 'The sample size of this synthetic Part B demonstration was chosen to illustrate the report, not by a power calculation; it supports description and estimation, not a confirmatory test.',
};

/** LMN-801: Phase 1, first in human, healthy adults with overweight or obesity. Generated source. */
export const LMN801_CSR = {
  key: 'lmn801',
  projectCode: 'LMN-801',
  role: 'in-review',
  reportTitle: 'LMN-801 Phase 1 First-in-Human Multiple Ascending Dose Clinical Study Report — SYNTHETIC',
  reportVersion: '1.0',
  shortName: 'LMN-801 Phase 1 MAD',
  seed: 801_2026,
  sourceTitle: 'LMN-801 Phase 1 MAD CSR source — SYNTHETIC, NOT CLINICAL EVIDENCE',
  sourceCode: 'LMN-801-CSR-SOURCE-SYNTHETIC-1.json',
  studyInfo: {
    title: 'SYNTHETIC LMN-801 Phase 1 multiple ascending dose study — NOT ACTUAL DATA',
    protocolNumber: 'DEMO-LMN801-P1-MAD-001',
    phase: '1',
    indication: 'Weight management in adults with overweight or obesity (healthy volunteers)',
    sponsor: 'Lumen Bioscience — FICTIONAL DEMO, NOT A CLIENT',
    investigationalProduct: 'LMN-801 (illustrative oral hormone protein)',
    comparator: 'Placebo',
    studyDesign: 'Synthetic randomised, double-blind, placebo-controlled, multiple ascending dose demonstration',
    primaryEndpoint: 'Participants with at least one treatment-emergent adverse event',
    secondaryEndpoints: ['Percent change in body weight from baseline to Day 28 (exploratory)'],
    treatmentDuration: '28 days of once-daily dosing',
    targetAgencies: ['FDA'],
  },
  dataCutDate: '2026-08-29',
  arms: [
    { armId: 'LMN801_LOW', armName: 'Synthetic LMN-801 low dose', n: 8, dose: 'Synthetic low dose, once daily (not actual)' },
    { armId: 'LMN801_HIGH', armName: 'Synthetic LMN-801 high dose', n: 8, dose: 'Synthetic high dose, once daily (not actual)' },
    { armId: 'PLACEBO', armName: 'Placebo', n: 8, dose: 'Matching placebo, once daily' },
  ],
  subjectPrefix: 'DEMO-LMN801',
  siteIds: ['201', '202'],
  exposureDays: 28,
  ages: [21, 55],
  femaleShare: 0.5,
  bmi: [27, 34],
  races: [['White', 6], ['Black or African American', 2], ['Asian', 2], ['Other', 1]],
  discontinuation: { LMN801_LOW: 0.05, LMN801_HIGH: 0.12, PLACEBO: 0.05 },
  discontinuationReasons: [['Withdrawal by participant', 3], ['Adverse event', 2], ['Lost to follow-up', 1]],
  adverseEvents: [
    { pt: 'Nausea', soc: 'Gastrointestinal disorders', p: { LMN801_LOW: 0.25, LMN801_HIGH: 0.45, PLACEBO: 0.1 } },
    { pt: 'Decreased appetite', soc: 'Metabolism and nutrition disorders', p: { LMN801_LOW: 0.2, LMN801_HIGH: 0.35, PLACEBO: 0.05 } },
    { pt: 'Headache', soc: 'Nervous system disorders', p: { LMN801_LOW: 0.15, LMN801_HIGH: 0.15, PLACEBO: 0.15 } },
    { pt: 'Diarrhoea', soc: 'Gastrointestinal disorders', p: { LMN801_LOW: 0.1, LMN801_HIGH: 0.2, PLACEBO: 0.05 } },
    { pt: 'Fatigue', soc: 'General disorders and administration site conditions', p: { LMN801_LOW: 0.1, LMN801_HIGH: 0.1, PLACEBO: 0.1 } },
  ],
  activeArms: ['LMN801_LOW', 'LMN801_HIGH'],
  labs: ['Alanine aminotransferase (U/L)', 'Aspartate aminotransferase (U/L)', 'Lipase (U/L)', 'Glucose, fasting (mmol/L)'],
  vitals: [['Systolic blood pressure (mmHg)', 124, 9, { LMN801_LOW: -2, LMN801_HIGH: -4, PLACEBO: 0 }], ['Diastolic blood pressure (mmHg)', 79, 6, { LMN801_LOW: -1, LMN801_HIGH: -2, PLACEBO: 0 }], ['Pulse rate (beats/min)', 72, 8, { LMN801_LOW: 1, LMN801_HIGH: 3, PLACEBO: 0 }]],
  conmeds: [['Paracetamol (synthetic)', 'N02BE', 0.25], ['Ondansetron (synthetic)', 'A04AA', 0.08], ['Cetirizine (synthetic)', 'R06AE', 0.06]],
  efficacy: {
    kind: 'teae-primary',
    exploratory: { name: 'Percent change in body weight from baseline to Day 28 (exploratory)', mean: { LMN801_LOW: -1.6, LMN801_HIGH: -3.1, PLACEBO: -0.3 }, sd: 1.3 },
  },
  narrative: {
    productDescription: 'LMN-801 (illustrative): an orally delivered hormone protein produced in spirulina, intended to act in the gut to reduce appetite',
    population: 'healthy adults aged 18 to 55 years with a body-mass index of 27 to 35 kg/m²',
    design: 'a randomised, double-blind, placebo-controlled, multiple ascending dose study in two sequential cohorts',
    durationText: '28 days of once-daily dosing with follow-up to Day 42',
    dates: { firstSubjectIn: '2026-03-02', lastSubjectOut: '2026-08-14', dataCut: '2026-08-29', report: '2026-11-12' },
    sites: [
      { id: '201', name: 'Northfield Clinical Pharmacology Unit (fictional)', pi: 'Dr. Hannah Moreau (fictional)', irb: 'Northfield Independent Review Board (fictional)' },
      { id: '202', name: 'Cedar Point Phase 1 Centre (fictional)', pi: 'Dr. Samuel Achebe (fictional)', irb: 'Northfield Independent Review Board (fictional)' },
    ],
    objectives: {
      primary: ['To assess the safety and tolerability of multiple ascending oral doses of LMN-801 for 28 days.'],
      secondary: ['To describe the incidence, severity and relatedness of treatment-emergent adverse events by dose.'],
      exploratory: ['To describe the percent change in body weight from baseline to Day 28 by dose.'],
    },
    inclusion: [
      'Adults aged 18 to 55 years at screening, in good health by medical history, examination and laboratory tests.',
      'Body-mass index of 27.0 to 35.0 kg/m² and a stable weight (within 5%) for the three months before screening.',
      'Willing to keep their usual diet and activity throughout the study.',
      'Able to give written informed consent.',
    ],
    exclusion: [
      'Diabetes mellitus, or a fasting glucose of 7.0 mmol/L or higher at screening.',
      'Use of any weight-loss medicine or bariatric surgery at any time.',
      'History of pancreatitis, or lipase above the upper limit of normal at screening.',
      'Pregnancy, breastfeeding, or unwillingness to use effective contraception.',
    ],
    dosing: { active: 'LMN-801 capsules once daily for 28 days, low dose (Cohort 1) then high dose (Cohort 2) (illustrative)', control: 'matching placebo capsules once daily for 28 days' },
    randomisation: 'Within each cohort of 12, participants were randomised 2:1 to LMN-801 or placebo by an interactive response system; the high-dose cohort started after the safety review committee reviewed the low-dose cohort\'s Day 14 data.',
    blinding: 'Participants, investigators and site staff were blinded; the unblinded pharmacist dispensed capsules identical in appearance.',
    efficacyAnalysis: 'Phase 1: no hypothesis was tested. The primary endpoint, participants with at least one treatment-emergent adverse event, and the exploratory change in body weight are summarised descriptively by arm.',
    sampleSizeText: 'Twelve participants per cohort (8 on LMN-801, 4 on placebo) is conventional for a Phase 1 ascending dose study and was not based on a power calculation. The two cohorts\' placebo participants are pooled.',
  },
};

/** LMN-301: Phase 2a, human viral challenge, intranasal prophylaxis. Generated source. */
export const LMN301_CSR = {
  key: 'lmn301',
  projectCode: 'LMN-301',
  role: 'in-review',
  reportTitle: 'LMN-301 Phase 2a Viral Challenge Clinical Study Report — SYNTHETIC',
  reportVersion: '0.9',
  shortName: 'LMN-301 Phase 2a challenge',
  seed: 301_2026,
  sourceTitle: 'LMN-301 Phase 2a challenge CSR source — SYNTHETIC, NOT CLINICAL EVIDENCE',
  sourceCode: 'LMN-301-CSR-SOURCE-SYNTHETIC-1.json',
  studyInfo: {
    title: 'SYNTHETIC LMN-301 Phase 2a human viral challenge study — NOT ACTUAL DATA',
    protocolNumber: 'DEMO-LMN301-P2A-CHAL-001',
    phase: '2a',
    indication: 'Prevention of viral upper respiratory infection (human challenge model)',
    sponsor: 'Lumen Bioscience — FICTIONAL DEMO, NOT A CLIENT',
    investigationalProduct: 'LMN-301 (illustrative intranasal biologic)',
    comparator: 'Placebo',
    studyDesign: 'Synthetic randomised, double-blind, placebo-controlled human challenge demonstration',
    primaryEndpoint: 'Laboratory-confirmed symptomatic infection after challenge',
    secondaryEndpoints: ['Viral shedding on two or more consecutive days'],
    treatmentDuration: 'Twice-daily intranasal dosing from Day -1 to Day 6',
    targetAgencies: ['FDA'],
  },
  dataCutDate: '2026-07-31',
  arms: [
    { armId: 'LMN301', armName: 'Synthetic LMN-301 intranasal', n: 20, dose: 'Synthetic intranasal dose, twice daily (not actual)' },
    { armId: 'PLACEBO', armName: 'Placebo intranasal', n: 20, dose: 'Matching placebo spray, twice daily' },
  ],
  subjectPrefix: 'DEMO-LMN301',
  siteIds: ['301'],
  exposureDays: 8,
  ages: [18, 45],
  femaleShare: 0.45,
  races: [['White', 7], ['Black or African American', 2], ['Asian', 2], ['Other', 1]],
  discontinuation: { LMN301: 0.05, PLACEBO: 0.05 },
  discontinuationReasons: [['Withdrawal by participant', 3], ['Adverse event', 1]],
  adverseEvents: [
    { pt: 'Nasal discomfort', soc: 'Respiratory, thoracic and mediastinal disorders', p: { LMN301: 0.3, PLACEBO: 0.1 } },
    { pt: 'Rhinorrhoea', soc: 'Respiratory, thoracic and mediastinal disorders', p: { LMN301: 0.2, PLACEBO: 0.5 } },
    { pt: 'Headache', soc: 'Nervous system disorders', p: { LMN301: 0.2, PLACEBO: 0.3 } },
    { pt: 'Oropharyngeal pain', soc: 'Respiratory, thoracic and mediastinal disorders', p: { LMN301: 0.15, PLACEBO: 0.35 } },
    { pt: 'Epistaxis', soc: 'Respiratory, thoracic and mediastinal disorders', p: { LMN301: 0.1, PLACEBO: 0.05 } },
  ],
  activeArms: ['LMN301'],
  labs: ['Alanine aminotransferase (U/L)', 'Neutrophils (10^9/L)', 'C-reactive protein (mg/L)'],
  vitals: [['Body temperature (°C)', 36.7, 0.25, { LMN301: 0.05, PLACEBO: 0.3 }], ['Systolic blood pressure (mmHg)', 118, 9, { LMN301: 0, PLACEBO: 1 }], ['Pulse rate (beats/min)', 68, 8, { LMN301: 1, PLACEBO: 4 }]],
  conmeds: [['Paracetamol (synthetic)', 'N02BE', 0.3], ['Saline nasal spray (synthetic)', 'R01AX', 0.1]],
  efficacy: {
    kind: 'binary',
    primary: { name: 'Laboratory-confirmed symptomatic infection after challenge', p: { LMN301: 0.2, PLACEBO: 0.6 }, lowerIsBetter: true },
    secondary: { name: 'Viral shedding on two or more consecutive days', p: { LMN301: 0.35, PLACEBO: 0.7 }, lowerIsBetter: true },
  },
  narrative: {
    productDescription: 'LMN-301 (illustrative): an intranasal spray of spirulina-produced binding proteins intended to neutralise a respiratory virus at the nasal mucosa',
    population: 'healthy adults aged 18 to 45 years, seronegative or with a low neutralising titre to the challenge strain',
    design: 'a randomised, double-blind, placebo-controlled human viral challenge study conducted in quarantine',
    durationText: 'intranasal dosing twice daily from the day before challenge to Day 6, quarantine to Day 8 and follow-up to Day 28',
    dates: { firstSubjectIn: '2026-04-06', lastSubjectOut: '2026-07-10', dataCut: '2026-07-31', report: '2026-11-12' },
    sites: [
      { id: '301', name: 'Harbourside Human Challenge Unit (fictional)', pi: 'Dr. Elena Sørensen (fictional)', irb: 'Coastal Research Ethics Committee (fictional)' },
    ],
    objectives: {
      primary: ['To evaluate whether prophylactic intranasal LMN-301 reduces laboratory-confirmed symptomatic infection after viral challenge compared with placebo.'],
      secondary: ['To evaluate the effect of LMN-301 on viral shedding.', 'To describe the safety and local tolerability of intranasal LMN-301.'],
      exploratory: ['To describe body temperature and inflammatory markers after challenge.'],
    },
    inclusion: [
      'Healthy adults aged 18 to 45 years.',
      'A serum neutralising antibody titre to the challenge strain at or below the protocol threshold at screening.',
      'Willing to remain in quarantine from Day -2 to Day 8.',
      'Able to give written informed consent.',
    ],
    exclusion: [
      'An upper respiratory illness within 14 days before admission.',
      'Asthma, chronic rhinosinusitis, or nasal surgery within the past year.',
      'Use of intranasal medicines within 14 days before admission.',
      'Living with anyone at increased risk from respiratory infection.',
    ],
    dosing: { active: 'LMN-301 nasal spray, one actuation per nostril twice daily from Day -1 to Day 6 (illustrative)', control: 'matching placebo spray on the same schedule' },
    randomisation: 'Participants were randomised 1:1 by an interactive response system using permuted blocks of four.',
    blinding: 'Participants, investigators, quarantine staff and laboratory staff were blinded; the active and placebo sprays were identical in appearance, smell and taste.',
    efficacyAnalysis: 'The primary analysis compared the proportion of participants with laboratory-confirmed symptomatic infection between arms in the ITT population: the difference in proportions with a Wald 95% confidence interval and a two-sided Fisher\'s exact test.',
    sampleSizeText: null,
    assumedRates: { active: 0.2, control: 0.6, alpha: 0.05 },
  },
};

export const LUMEN_CSR_STUDIES = [LMN201_CSR, LMN801_CSR, LMN301_CSR];

/* ── Generating a source ───────────────────────────────────────────────────────────────────────────────────────── */

/** Two-sided Fisher's exact test for a 2×2 table [[a, b], [c, d]]. */
export function fisherExact(a, b, c, d) {
  const n = a + b + c + d;
  const row1 = a + b;
  const col1 = a + c;
  const logFact = (k) => { let s = 0; for (let i = 2; i <= k; i += 1) s += Math.log(i); return s; };
  const prob = (x) => Math.exp(logFact(row1) + logFact(n - row1) + logFact(col1) + logFact(n - col1)
    - logFact(n) - logFact(x) - logFact(row1 - x) - logFact(col1 - x) - logFact(n - row1 - col1 + x));
  const observed = prob(a);
  let p = 0;
  for (let x = Math.max(0, col1 + row1 - n); x <= Math.min(row1, col1); x += 1) {
    const px = prob(x);
    if (px <= observed * (1 + 1e-7)) p += px;
  }
  return Math.min(1, p);
}

/** The difference in proportions p1 − p2 with a Wald 95% confidence interval. */
export function riskDifference(x1, n1, x2, n2) {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const d = p1 - p2;
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2);
  return { difference: d, lower: d - 1.959964 * se, upper: d + 1.959964 * se };
}

/** Power of a two-sided two-proportion z-test (normal approximation), for the sample-size section. */
export function twoProportionPower(pa, pb, nPerArm, alpha = 0.05) {
  const z = 1.959964; // two-sided 0.05
  if (alpha !== 0.05) throw new Error('only alpha 0.05 is supported here');
  const pbar = (pa + pb) / 2;
  const se0 = Math.sqrt(2 * pbar * (1 - pbar) / nPerArm);
  const se1 = Math.sqrt((pa * (1 - pa) + pb * (1 - pb)) / nPerArm);
  const phi = (x) => 0.5 * (1 + Math.sign(x) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI)));
  return phi((Math.abs(pa - pb) - z * se0) / se1);
}

const subjectIdOf = (spec, site, seq) => `${spec.subjectPrefix}-${site}${String(seq).padStart(3, '0')}`;

/** Draw one subject's record set. */
function drawSubject(spec, rand, armId, site, seq) {
  const subjectId = subjectIdOf(spec, site, seq);
  const sex = rand() < spec.femaleShare ? 'F' : 'M';
  const age = Math.floor(spec.ages[0] + rand() * (spec.ages[1] - spec.ages[0] + 1));
  const race = pick(rand, spec.races);
  const demo = { subjectId, armId, age, sex, race, ethnicity: rand() < 0.15 ? 'Hispanic or Latino' : 'Not Hispanic or Latino' };
  if (spec.bmi) {
    const height = round(sex === 'F' ? normal(rand, 164, 6) : normal(rand, 177, 7), 0);
    const bmi = round(spec.bmi[0] + rand() * (spec.bmi[1] - spec.bmi[0]), 1);
    demo.height = height;
    demo.bmi = bmi;
    demo.weight = round((bmi * (height / 100) ** 2), 1);
  }
  const discontinues = rand() < spec.discontinuation[armId];
  const reason = discontinues ? pick(rand, spec.discontinuationReasons) : null;
  const aes = [];
  for (const ae of spec.adverseEvents) {
    if (rand() < ae.p[armId]) {
      aes.push({
        subjectId, armId, pt: ae.pt, soc: ae.soc,
        severity: pick(rand, [['mild', 7], ['moderate', 3]]),
        serious: false,
        related: spec.activeArms.includes(armId) ? pick(rand, [['related', 6], ['unrelated', 4]]) : pick(rand, [['related', 2], ['unrelated', 8]]),
        outcome: 'recovered',
        ledToDiscontinuation: false,
      });
    }
  }
  if (reason === 'Adverse event') {
    if (!aes.length) {
      const ae = spec.adverseEvents[0];
      aes.push({ subjectId, armId, pt: ae.pt, soc: ae.soc, severity: 'moderate', serious: false, related: spec.activeArms.includes(armId) ? 'related' : 'unrelated', outcome: 'recovered', ledToDiscontinuation: false });
    }
    aes[0].ledToDiscontinuation = true;
    aes[0].severity = 'moderate';
  }
  const status = !discontinues ? 'completed' : reason === 'Lost to follow-up' ? 'lost-to-followup' : 'discontinued';
  const disposition = { subjectId, armId, status, ...(discontinues ? { reason } : {}) };
  const vitals = spec.vitals.map(([parameter, mean, sd, shift]) => {
    const d = parameter.includes('°C') ? 1 : 0;
    const baseline = round(normal(rand, mean, sd), d);
    return { subjectId, armId, parameter, baseline, lastOnTreatment: round(baseline + normal(rand, shift[armId], sd / 3), d) };
  });
  const conmeds = spec.conmeds.filter(([, , p]) => rand() < p).map(([medication, atcClass]) => ({ subjectId, armId, medication, atcClass }));
  const outcomes = {};
  if (spec.efficacy.kind === 'binary') {
    outcomes.primary = rand() < spec.efficacy.primary.p[armId];
    outcomes.secondary = rand() < spec.efficacy.secondary.p[armId];
  } else {
    outcomes.exploratory = discontinues ? null : round(normal(rand, spec.efficacy.exploratory.mean[armId], spec.efficacy.exploratory.sd), 1);
  }
  return { participant: { subjectId, armId, randomized: true, safety: true, itt: true, completed: status === 'completed' }, demo, disposition, aes, vitals, conmeds, outcomes, discontinues };
}

const pct = (x, n) => (n ? `${round((100 * x) / n, 1).toFixed(1)}%` : '—');

/**
 * The synthetic source for a generated study, in concept2cure.csr-source.v1. Deterministic: the same spec gives the
 * same object, and so the same bytes.
 */
export function generateSource(spec) {
  const rand = seededRandom(spec.seed);
  const subjects = [];
  let seq = 0;
  for (const arm of spec.arms) {
    for (let i = 0; i < arm.n; i += 1) {
      seq += 1;
      const site = spec.siteIds[seq % spec.siteIds.length];
      subjects.push(drawSubject(spec, rand, arm.armId, site, seq));
    }
  }
  // Randomisation order, not arm order, for the listings.
  subjects.sort((x, y) => x.participant.subjectId.localeCompare(y.participant.subjectId));
  const byArm = (armId) => subjects.filter((s) => s.participant.armId === armId);
  const treatmentArms = spec.arms.map((a) => {
    const s = byArm(a.armId);
    const completed = s.filter((x) => x.participant.completed).length;
    return { armId: a.armId, armName: a.armName, randomized: s.length, populations: { safety: s.length, itt: s.length, completed } };
  });
  const adverseEvents = subjects.flatMap((s) => s.aes);
  const efficacy = [];
  if (spec.efficacy.kind === 'binary') {
    const control = spec.arms.find((a) => !spec.activeArms.includes(a.armId)).armId;
    for (const which of ['primary', 'secondary']) {
      const e = spec.efficacy[which];
      const counts = Object.fromEntries(spec.arms.map((a) => [a.armId, byArm(a.armId).filter((s) => s.outcomes[which]).length]));
      for (const a of spec.arms) {
        const n = byArm(a.armId).length;
        efficacy.push({ endpointName: e.name, endpointType: which, armId: a.armId, value: counts[a.armId] / n, display: `${counts[a.armId]}/${n} (${pct(counts[a.armId], n)})`, population: 'ITT' });
      }
      for (const active of spec.activeArms) {
        const n1 = byArm(active).length; const n2 = byArm(control).length;
        const rd = riskDifference(counts[active], n1, counts[control], n2);
        const p = fisherExact(counts[active], n1 - counts[active], counts[control], n2 - counts[control]);
        efficacy.push({
          endpointName: e.name, endpointType: which, value: round(rd.difference, 4),
          display: `${round(100 * rd.difference, 1)} percentage points (${spec.arms.find((a) => a.armId === active).armName} minus ${spec.arms.find((a) => a.armId === control).armName})`,
          ci: { lower: round(rd.lower, 4), upper: round(rd.upper, 4), level: '95% (Wald)' }, pValue: round(p, 4),
          method: `Difference in proportions, ${active} minus ${control}; Wald 95% confidence interval; two-sided Fisher's exact test`, population: 'ITT',
        });
      }
    }
  } else {
    // Phase 1: the primary endpoint is safety, counted from the adverse events; the weight change is descriptive.
    for (const a of spec.arms) {
      const s = byArm(a.armId);
      const withTeae = s.filter((x) => x.aes.length > 0).length;
      efficacy.push({ endpointName: spec.studyInfo.primaryEndpoint, endpointType: 'primary', armId: a.armId, value: withTeae / s.length, display: `${withTeae}/${s.length} (${pct(withTeae, s.length)})`, population: 'Safety' });
    }
    const ex = spec.efficacy.exploratory;
    for (const a of spec.arms) {
      const values = byArm(a.armId).map((s) => s.outcomes.exploratory).filter((v) => v !== null);
      const mean = values.reduce((x, y) => x + y, 0) / values.length;
      const sd = Math.sqrt(values.reduce((x, y) => x + (y - mean) ** 2, 0) / (values.length - 1));
      efficacy.push({ endpointName: ex.name, endpointType: 'exploratory', armId: a.armId, value: round(mean, 2), display: `mean ${round(mean, 1)}% (SD ${round(sd, 1)}), n=${values.length}`, population: 'Completers' });
    }
  }
  const exposure = spec.arms.map((a) => {
    const s = byArm(a.armId);
    const days = s.map((x) => (x.discontinues ? Math.max(1, Math.round(spec.exposureDays / 2)) : spec.exposureDays));
    const meanDays = days.reduce((x, y) => x + y, 0) / days.length;
    return { armId: a.armId, meanDailyDose: a.dose, meanExposureDays: round(meanDays, 1), totalPersonYears: round(days.reduce((x, y) => x + y, 0) / 365.25, 3) };
  });
  const labRand = seededRandom(spec.seed + 7);
  const labShifts = spec.arms.flatMap((a) => spec.labs.map((parameter) => {
    const total = byArm(a.armId).length;
    const fromNormal = total - (labRand() < 0.3 ? 1 : 0);
    const high = spec.activeArms.includes(a.armId) && labRand() < 0.5 ? 1 : (labRand() < 0.2 ? 1 : 0);
    return { armId: a.armId, parameter, shiftFromNormal: fromNormal, shiftToHigh: Math.min(high, fromNormal), shiftToLow: 0, totalAssessed: total };
  }));
  return {
    format: 'concept2cure.csr-source.v1',
    dataCutDate: spec.dataCutDate,
    studyInfo: { ...spec.studyInfo, sampleSize: subjects.length },
    participants: subjects.map((s) => s.participant),
    completeDomains: { disposition: true, demographics: true, efficacy: true, adverseEvents: true },
    studyData: {
      studyId: spec.studyInfo.protocolNumber,
      protocolNumber: spec.studyInfo.protocolNumber,
      treatmentArms,
      disposition: subjects.map((s) => s.disposition),
      dispositionCategories: ['completed', 'discontinued', 'lost-to-followup'],
      dispositionBasis: 'end-of-study',
      demographics: subjects.map((s) => s.demo),
      // Height and body-mass index are reported descriptively (shared/csr-source-input.ts requires the declaration).
      ...(spec.bmi ? { demographicsPresentation: 'descriptive' } : {}),
      efficacy,
      adverseEvents,
      exposure,
      labShifts,
      vitalSigns: subjects.flatMap((s) => s.vitals),
      concomitantMedications: subjects.flatMap((s) => s.conmeds),
    },
  };
}

/** The bytes the Vault files: stable JSON, so a re-run finds the file it filed. */
export function sourceBytes(source) {
  return Buffer.from(`${JSON.stringify(source, null, 1)}\n`, 'utf8');
}
