/**
 * Medical-writing knowledge base + guidance composer for AnA.
 *
 * Encodes the authoritative, well-established standards and craft of regulatory
 * and scientific medical writing — by DOCUMENT TYPE × THERAPEUTIC AREA × REGION/
 * MARKET × AUDIENCE/CLIENT SEGMENT — so AnA grounds drafting in real conventions
 * (ICH E3/E6/M4, EU MDR/MEDDEV/IVDR, SPIRIT/CONSORT/STROBE/PRISMA, ICMJE, GPP
 * 2022, AMWA/EMWA craft) rather than improvising.
 *
 * This is the *craft + standards* layer; live literature/evidence "scouring" is
 * provided by the search tools (PubMed, bioRxiv/medRxiv, ClinicalTrials.gov,
 * openFDA, CMS). Combined, they make AnA an evidence-grounded expert writer.
 *
 * Deterministic, dependency-free, and data-driven — every entry is a record, so
 * coverage is extended by adding data, and `composeMedicalWritingGuidance`
 * assembles the relevant subset for any request.
 *
 * @module server/services/ana/medical-writing
 */

export interface DocumentTypeStandard {
  id: string;
  label: string;
  segment: 'drug' | 'device' | 'ivd' | 'general';
  governingStandards: string[];
  purpose: string;
  defaultAudience: string;
  /** Ordered section outline. */
  structure: string[];
  keyRequirements: string[];
  commonPitfalls: string[];
  aliases?: string[];
}

export interface TherapeuticAreaConvention {
  id: string;
  label: string;
  endpoints: string[];
  terminology: string[];
  reportingConventions: string[];
  keyGuidances: string[];
  aliases?: string[];
}

export interface RegionConvention {
  id: string;
  label: string;
  authority: string;
  dossierStandard: string;
  styleNotes: string[];
  aliases?: string[];
}

export interface AudienceRegister {
  id: string;
  label: string;
  tone: string;
  readingLevel: string;
  emphasis: string[];
  avoid: string[];
  aliases?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Global craft rules — AMWA/EMWA competencies, ICMJE, GPP 2022, plain-language.
// ─────────────────────────────────────────────────────────────────────────────

export const GLOBAL_STYLE_RULES: string[] = [
  'Lead with the conclusion; structure top-down (BLUF). Every section answers a regulatory or scientific question.',
  'One claim per sentence; prefer the active voice and past tense for completed methods/results.',
  'Quantify everything: effect sizes with 95% CIs and p-values, denominators with every percentage, absolute not just relative risk.',
  'Define each abbreviation at first use; keep a single abbreviation list; do not abbreviate terms used <3 times.',
  'Numbers: numerals for data; consistent decimal places justified by the measurement precision; SI units (with conventional units where the region expects them).',
  'Never overstate: distinguish statistical significance from clinical relevance; label post-hoc and exploratory analyses as such; do not imply causation from association.',
  'Every data statement is traceable to a source table/figure/listing (source-data verification) — no orphan numbers.',
  'Consistency is law: a value, term, or claim must be identical everywhere it appears (cross-reference integrity).',
  'Benefit–risk is framed explicitly and even-handedly; limitations are stated, not buried.',
  'GPP 2022: disclose authorship, contributorship, funding, and medical-writing support; follow ICMJE authorship criteria for manuscripts.',
];

// ─────────────────────────────────────────────────────────────────────────────
// Document types
// ─────────────────────────────────────────────────────────────────────────────

const DOCUMENT_TYPES: DocumentTypeStandard[] = [
  {
    id: 'protocol',
    label: 'Clinical Study Protocol',
    segment: 'drug',
    governingStandards: ['ICH E6(R2) GCP', 'ICH E8(R1)', 'ICH E9 (statistics)', 'SPIRIT 2013'],
    purpose: 'Define the scientific design, conduct, and analysis of a clinical study so it is reproducible and ethically sound.',
    defaultAudience: 'regulator',
    structure: [
      'Synopsis', 'Background & rationale', 'Objectives & estimands', 'Endpoints',
      'Study design & schema', 'Eligibility (in/exclusion)', 'Treatments & dosing',
      'Assessments & schedule of activities', 'Statistical considerations (sample size, analysis sets, methods)',
      'Safety reporting', 'Ethics & informed consent', 'Data management & QC', 'References',
    ],
    keyRequirements: [
      'State the estimand (ICH E9(R1) addendum): population, treatment, endpoint, intercurrent-event strategy, summary measure.',
      'Pre-specify the primary analysis, multiplicity control, and handling of missing data.',
      'SPIRIT-complete: every item present and internally consistent with the schedule of activities.',
    ],
    commonPitfalls: ['Objectives not matched 1:1 to endpoints', 'Underspecified sample-size assumptions', 'Schedule of activities inconsistent with the narrative'],
    aliases: ['study protocol', 'clinical protocol', 'csp'],
  },
  {
    id: 'csr',
    label: 'Clinical Study Report (CSR)',
    segment: 'drug',
    governingStandards: ['ICH E3', 'CORE Reference 2016'],
    purpose: 'Report the methods and results of a single clinical study completely and without spin.',
    defaultAudience: 'regulator',
    structure: [
      'Title page & synopsis', 'Ethics', 'Investigators & administrative structure', 'Introduction',
      'Objectives', 'Investigational plan (design, methods)', 'Study patients (disposition, deviations)',
      'Efficacy evaluation', 'Safety evaluation (exposure, AEs, deaths/SAEs, labs)',
      'Discussion & overall conclusions', 'Tables/figures', 'Reference list', 'Appendices (16.x)',
    ],
    keyRequirements: [
      'Follow ICH E3 numbering exactly; synopsis is self-contained.',
      'Disposition (CONSORT-style flow), protocol deviations, and analysis-set definitions are explicit.',
      'Safety told completely: exposure, common AEs by SOC/PT (MedDRA), deaths/SAEs/discontinuations with narratives.',
    ],
    commonPitfalls: ['Efficacy spin / underplayed safety', 'Mismatch between in-text values and source tables', 'Missing or thin AE narratives'],
    aliases: ['clinical study report', 'study report'],
  },
  {
    id: 'ib',
    label: "Investigator's Brochure (IB)",
    segment: 'drug',
    governingStandards: ['ICH E6(R2) §7'],
    purpose: 'Give investigators the clinical and nonclinical data relevant to safe study conduct and benefit–risk.',
    defaultAudience: 'clinician',
    structure: ['Summary', 'Physical/chemical/pharmaceutical properties', 'Nonclinical studies (PK/tox/pharmacology)', 'Effects in humans (PK, safety, efficacy)', 'Summary of data & guidance for the investigator', 'Reference safety information (RSI)'],
    keyRequirements: ['Include a clearly identified Reference Safety Information section for expectedness assessment of SAEs.', 'Update at least annually and on material new safety information.'],
    commonPitfalls: ['Outdated RSI', 'Guidance-for-investigator section missing actionable risk management'],
    aliases: ["investigators brochure", 'investigator brochure'],
  },
  {
    id: 'clinical_overview',
    label: 'Clinical Overview (CTD Module 2.5)',
    segment: 'drug',
    governingStandards: ['ICH M4E(R2)'],
    purpose: 'Provide a critical, integrated benefit–risk analysis of the clinical data supporting the application.',
    defaultAudience: 'regulator',
    structure: ['Product development rationale', 'Overview of biopharmaceutics', 'Overview of clinical pharmacology', 'Overview of efficacy', 'Overview of safety', 'Benefits and risks conclusions', 'Literature references'],
    keyRequirements: ['Be critical and interpretive (not a data dump — that is 2.7).', 'Build an explicit, integrated benefit–risk argument across studies.'],
    commonPitfalls: ['Duplicating the Summaries instead of interpreting', 'Benefit–risk not tied to the indication and population'],
    aliases: ['module 2.5', 'm2.5', 'clinical overview'],
  },
  {
    id: 'clinical_summary',
    label: 'Clinical Summary (CTD Module 2.7)',
    segment: 'drug',
    governingStandards: ['ICH M4E(R2)'],
    purpose: 'Provide a detailed, factual cross-study summary of clinical pharmacology, efficacy, and safety.',
    defaultAudience: 'regulator',
    structure: ['2.7.1 Biopharmaceutics', '2.7.2 Clinical pharmacology', '2.7.3 Clinical efficacy', '2.7.4 Clinical safety', '2.7.5 References', '2.7.6 Synopses of individual studies'],
    keyRequirements: ['Factual and comprehensive (interpretation lives in 2.5).', 'Integrated safety summary with pooled analyses where appropriate.'],
    commonPitfalls: ['Editorializing in 2.7', 'Inconsistent pooling definitions vs the SAP'],
    aliases: ['module 2.7', 'm2.7', 'clinical summary'],
  },
  {
    id: 'cer',
    label: 'Clinical Evaluation Report (CER)',
    segment: 'device',
    governingStandards: ['EU MDR 2017/745 Annex XIV Part A & Annex I (GSPR)', 'MEDDEV 2.7/1 rev 4', 'MDCG 2020-13'],
    purpose: 'Demonstrate conformity of a medical device with the relevant GSPRs via clinical evidence across its lifecycle.',
    defaultAudience: 'regulator',
    structure: ['Scope & device description', 'Clinical background / state of the art', 'Clinical evaluation plan', 'Equivalence (if claimed)', 'Literature appraisal (search protocol + appraisal)', 'Clinical investigation/clinical data appraisal', 'Benefit–risk vs state of the art', 'PMS/PMCF integration', 'Conclusions'],
    keyRequirements: ['Document a reproducible literature search protocol and appraisal method.', 'Establish state of the art and benefit–risk against it.', 'Integrate PMS/PMCF data (MDR closes the loop).'],
    commonPitfalls: ['Weak/undocumented literature methodology', 'Unjustified equivalence claims under MDR', 'State of the art not established'],
    aliases: ['clinical evaluation report'],
  },
  {
    id: 'pmcf',
    label: 'Post-Market Clinical Follow-up (PMCF) Plan/Report',
    segment: 'device',
    governingStandards: ['EU MDR 2017/745 Annex XIV Part B', 'MDCG 2020-7 / 2020-8'],
    purpose: 'Proactively collect and appraise clinical data on a CE-marked device to confirm safety/performance over its lifetime.',
    defaultAudience: 'regulator',
    structure: ['Objectives', 'PMCF methods/activities', 'Reference to CER & risk management', 'Evaluation of results', 'Impact on CER/benefit–risk', 'Conclusions & actions'],
    keyRequirements: ['Methods must answer specific residual-risk/clinical questions from the CER.', 'Feed results back into the CER and risk file.'],
    commonPitfalls: ['Generic activities not tied to residual risks', 'No feedback loop to the CER'],
    aliases: ['pmcf'],
  },
  {
    id: 'per',
    label: 'Performance Evaluation Report (IVD PER)',
    segment: 'ivd',
    governingStandards: ['EU IVDR 2017/746 Annex XIII', 'MDCG 2022-2'],
    purpose: 'Demonstrate scientific validity, analytical performance, and clinical performance of an IVD.',
    defaultAudience: 'regulator',
    structure: ['Scientific validity', 'Analytical performance', 'Clinical performance', 'Performance evaluation plan/report', 'Benefit–risk', 'PMPF integration'],
    keyRequirements: ['Cover all three pillars: scientific validity, analytical performance, clinical performance.', 'Tie analytical claims to established metrics (LoD, precision, trueness) with reference materials.'],
    commonPitfalls: ['Conflating analytical and clinical performance', 'Scientific validity not independently established'],
    aliases: ['performance evaluation report', 'ivd per'],
  },
  {
    id: 'manuscript',
    label: 'Journal Manuscript',
    segment: 'general',
    governingStandards: ['ICMJE Recommendations', 'CONSORT (RCT)', 'STROBE (observational)', 'PRISMA (systematic review)', 'GPP 2022'],
    purpose: 'Communicate study findings to the scientific community accurately, transparently, and reproducibly.',
    defaultAudience: 'clinician',
    structure: ['Title & abstract (structured)', 'Introduction', 'Methods', 'Results', 'Discussion', 'Limitations', 'Conclusions', 'Declarations (funding, COI, authorship, data availability)', 'References'],
    keyRequirements: ['Follow the reporting guideline matching the design (CONSORT/STROBE/PRISMA) and include the checklist + flow diagram.', 'ICMJE authorship; disclose funding, COI, and medical-writing support (GPP 2022).', 'Register trials; report per the registered protocol/SAP.'],
    commonPitfalls: ['Outcome switching vs registration', 'Spin in abstract/conclusions', 'Undisclosed writing support or COI'],
    aliases: ['publication', 'paper', 'journal article'],
  },
  {
    id: 'plain_language_summary',
    label: 'Plain-Language / Lay Summary',
    segment: 'general',
    governingStandards: ['EU CTR 536/2014 Annex V', 'GPP 2022 (lay summaries)', 'Health-literacy best practice'],
    purpose: 'Explain study purpose and results to participants and the public without jargon or promotion.',
    defaultAudience: 'patient',
    structure: ['What was the study about', 'How was it done', 'Who took part', 'What were the results', 'What are the side effects', 'How has it helped research', 'Where to learn more'],
    keyRequirements: ['Target ~6th–8th grade reading level; no promotion; non-misleading even-handed results.', 'No single-study overinterpretation; numbers given as natural frequencies (e.g., 1 in 10).'],
    commonPitfalls: ['Jargon and acronyms', 'Promotional tone', 'Cherry-picked positive results'],
    aliases: ['lay summary', 'plain language summary', 'pls'],
  },
  {
    id: 'regulatory_response',
    label: 'Response to Health-Authority Questions',
    segment: 'general',
    governingStandards: ['Region-specific procedural guidance (FDA IR, EMA LoQ/D120/D180, PMDA)'],
    purpose: 'Answer agency questions completely, directly, and defensibly to advance the review.',
    defaultAudience: 'regulator',
    structure: ['Restate the question verbatim', 'Direct answer (position)', 'Supporting rationale & data', 'Any new analyses (with methods)', 'Proposed labeling/commitment changes', 'Cross-references to the dossier'],
    keyRequirements: ['Answer the question actually asked, first sentence.', 'Make commitments explicit and traceable; reconcile with the existing dossier.'],
    commonPitfalls: ['Evasive or partial answers', 'Introducing inconsistencies with the submitted dossier'],
    aliases: ['information request response', 'response to questions', 'loq response'],
  },
  {
    id: 'rmp',
    label: 'Risk Management Plan (RMP)',
    segment: 'drug',
    governingStandards: ['EU GVP Module V', 'ICH E2E (pharmacovigilance planning)'],
    purpose: 'Characterize the safety profile and specify how risks are minimized and monitored.',
    defaultAudience: 'regulator',
    structure: ['Product overview', 'Safety specification (important identified/potential risks, missing information)', 'Pharmacovigilance plan', 'Risk-minimization measures', 'Summary of activities'],
    keyRequirements: ['Each safety concern maps to PV activities and risk-minimization measures.', 'Effectiveness of risk-minimization is measurable.'],
    commonPitfalls: ['Risks without corresponding mitigations', 'Routine measures labeled as additional'],
    aliases: ['risk management plan'],
  },
  {
    id: 'meeting_package',
    label: 'Regulatory Meeting/Briefing Package',
    segment: 'general',
    governingStandards: ['FDA formal-meeting guidance (Type A/B/C)', 'EMA scientific-advice procedure'],
    purpose: 'Frame specific questions to the agency and provide the minimum data to get an actionable answer.',
    defaultAudience: 'regulator',
    structure: ['Product & development context', 'Specific questions (numbered)', 'Company position per question', 'Supporting data/summaries', 'Proposed path forward'],
    keyRequirements: ['Questions are precise, answerable, and prioritized.', 'Each question has a clear company position and the data behind it.'],
    commonPitfalls: ['Open-ended/unanswerable questions', 'Data without a position'],
    aliases: ['briefing book', 'briefing document', 'pre-ind package'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Therapeutic areas
// ─────────────────────────────────────────────────────────────────────────────

const THERAPEUTIC_AREAS: TherapeuticAreaConvention[] = [
  {
    id: 'oncology', label: 'Oncology',
    endpoints: ['OS (gold standard)', 'PFS', 'ORR', 'DoR', 'DFS/EFS (adjuvant)', 'pCR (neoadjuvant)', 'PRO/QoL'],
    terminology: ['RECIST 1.1', 'iRECIST (immunotherapy)', 'Lugano (lymphoma)', 'RANO (CNS tumors)', 'CTCAE v5.0 (AEs)'],
    reportingConventions: ['Kaplan–Meier with median + 95% CI and HR (Cox)', 'Censoring rules pre-specified', 'Swimmer/waterfall plots for response', 'Data maturity (events/% ) reported'],
    keyGuidances: ['FDA oncology endpoints guidance', 'Project Optimus (dose optimization)', 'ICH E9(R1) estimands'],
    aliases: ['cancer', 'onc', 'tumor', 'tumour', 'hematology-oncology'],
  },
  {
    id: 'cardiology', label: 'Cardiology / Cardiovascular',
    endpoints: ['MACE (3-point/4-point — define components)', 'CV death', 'HF hospitalization', 'LVEF', 'KCCQ (PRO)'],
    terminology: ['NYHA class', 'Standardized CV endpoint definitions (2017/2018 ACC/AHA)', 'Adjudicated events (CEC)'],
    reportingConventions: ['Time-to-first-event + recurrent-event analyses', 'Independent endpoint adjudication', 'Non-inferiority margins justified for CV outcomes/safety'],
    keyGuidances: ['FDA CV outcomes (incl. diabetes CVOT history)', 'ICH E14 (QT)'],
    aliases: ['cardiovascular', 'cv', 'heart failure', 'cardio'],
  },
  {
    id: 'neuroscience', label: 'Neuroscience / CNS',
    endpoints: ['ADAS-Cog / CDR-SB (Alzheimer)', 'EDSS / ARR (MS)', 'UPDRS (Parkinson)', 'Seizure frequency (epilepsy)', 'PRO scales'],
    terminology: ['Validated rating scales with MCID', 'Central reading where applicable'],
    reportingConventions: ['MMRM for longitudinal continuous endpoints', 'Pre-specified handling of rater variability', 'Clinically meaningful within-patient change defined'],
    keyGuidances: ['FDA/EMA disease-specific guidances (AD, MS, PD, epilepsy)'],
    aliases: ['cns', 'neurology', 'psychiatry', 'neuro'],
  },
  {
    id: 'infectious_disease', label: 'Infectious Disease',
    endpoints: ['Clinical cure/response at TOC', 'Microbiological eradication', 'All-cause mortality (severe infection)'],
    terminology: ['ITT/mITT/CE/ME analysis populations', 'MIC and susceptibility (CLSI/EUCAST)'],
    reportingConventions: ['Non-inferiority designs with pre-specified margins', 'By-pathogen and by-population summaries'],
    keyGuidances: ['FDA indication-specific anti-infective guidances', 'EUCAST/CLSI breakpoints'],
    aliases: ['id', 'antimicrobial', 'antibiotic', 'antiviral', 'vaccine-preventable'],
  },
  {
    id: 'immunology', label: 'Immunology / Rheumatology / Dermatology',
    endpoints: ['ACR20/50/70 (RA)', 'DAS28', 'PASI 75/90/100 (psoriasis)', 'Clinical remission (IBD)', 'PRO (HAQ-DI, DLQI)'],
    terminology: ['Validated composite indices', 'Non-responder imputation (NRI) for binary endpoints'],
    reportingConventions: ['NRI/MI for missing binary outcomes pre-specified', 'Maintenance of effect across periods'],
    keyGuidances: ['Indication-specific FDA/EMA guidances'],
    aliases: ['rheumatology', 'dermatology', 'autoimmune', 'ibd', 'gastroenterology'],
  },
  {
    id: 'metabolic', label: 'Endocrinology / Metabolic',
    endpoints: ['HbA1c change (diabetes)', 'Body weight % (obesity)', 'CV outcomes (CVOT)', 'Hypoglycemia rates'],
    terminology: ['ADA/EASD definitions', 'Treat-to-target designs'],
    reportingConventions: ['Estimand for rescue medication/discontinuation (intercurrent events)', 'CVOT non-inferiority then superiority testing'],
    keyGuidances: ['FDA diabetes/obesity guidances', 'ICH E9(R1)'],
    aliases: ['diabetes', 'obesity', 'endocrine', 'metabolism'],
  },
  {
    id: 'respiratory', label: 'Respiratory',
    endpoints: ['FEV1 (trough/peak)', 'Exacerbation rate', 'ACQ/SGRQ (PRO)', 'Time to first exacerbation'],
    terminology: ['Reversibility criteria', 'GOLD/GINA staging'],
    reportingConventions: ['Negative binomial for exacerbation rates', 'On-treatment vs off-treatment estimands'],
    keyGuidances: ['FDA/EMA asthma & COPD guidances'],
    aliases: ['pulmonary', 'asthma', 'copd', 'lung'],
  },
  {
    id: 'rare_disease', label: 'Rare Disease',
    endpoints: ['Disease-specific functional/biomarker endpoints', 'Natural-history-anchored change'],
    terminology: ['External/historical controls', 'Surrogate endpoints (accelerated approval)'],
    reportingConventions: ['Small-N designs (n-of-1, crossover, Bayesian borrowing)', 'Natural history as comparator with bias controls'],
    keyGuidances: ['FDA rare-disease & natural-history guidances', 'EMA orphan & small-population guidance'],
    aliases: ['orphan', 'ultra-rare', 'natural history'],
  },
  {
    id: 'vaccines', label: 'Vaccines',
    endpoints: ['Vaccine efficacy/effectiveness', 'Immunogenicity (GMT, seroconversion/seroresponse)', 'Reactogenicity'],
    terminology: ['Correlates of protection', 'Per-protocol immunogenicity sets'],
    reportingConventions: ['Non-inferiority on immunogenicity (GMT ratio, seroresponse difference)', 'Solicited/unsolicited reactogenicity reporting'],
    keyGuidances: ['FDA/EMA/WHO vaccine guidances'],
    aliases: ['vaccine', 'immunization', 'prophylactic'],
  },
  {
    id: 'general', label: 'General / Cross-TA',
    endpoints: ['Pre-specified primary endpoint matched to the objective and estimand'],
    terminology: ['MedDRA (AEs)', 'Validated, fit-for-purpose instruments'],
    reportingConventions: ['Estimand-aligned analysis', 'Pre-specified multiplicity and missing-data handling'],
    keyGuidances: ['ICH E8(R1), E9(R1), E3, M4E'],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Regions / markets
// ─────────────────────────────────────────────────────────────────────────────

const REGIONS: RegionConvention[] = [
  { id: 'fda', label: 'United States (FDA)', authority: 'FDA', dossierStandard: 'eCTD; US Module 1 (2.3.1 forms, labeling per 21 CFR 201.57 PLR/PLLR)', styleNotes: ['US English', 'Concise, position-forward; reviewers value clear benefit–risk', 'PLR/PLLR labeling structure for prescription drugs'], aliases: ['us', 'usa', 'united states', 'fda'] },
  { id: 'ema', label: 'European Union (EMA)', authority: 'EMA / national competent authorities', dossierStandard: 'eCTD; EU Module 1; SmPC (QRD template), PL (lay), package leaflet readability testing', styleNotes: ['British/EU English', 'QRD templates for SmPC/PL', 'Lay-summary and readability-testing obligations'], aliases: ['eu', 'europe', 'ema', 'european union'] },
  { id: 'pmda', label: 'Japan (PMDA)', authority: 'PMDA / MHLW', dossierStandard: 'eCTD; JP Module 1; Japanese-language core documents (CTD-J)', styleNotes: ['Japanese for core/labeling; English summaries often accepted in consultation', 'Bridging/ethnic-factor considerations (ICH E5/E17)'], aliases: ['japan', 'pmda', 'jp', 'mhlw'] },
  { id: 'nmpa', label: 'China (NMPA)', authority: 'NMPA / CDE', dossierStandard: 'eCTD (China); Chinese-language dossier; CDE technical requirements', styleNotes: ['Chinese-language core documents', 'Local clinical-data expectations; ICH-aligned since 2017'], aliases: ['china', 'nmpa', 'cde'] },
  { id: 'hc', label: 'Canada (Health Canada)', authority: 'Health Canada', dossierStandard: 'eCTD; CA Module 1; bilingual labeling (English & French)', styleNotes: ['Bilingual (EN/FR) labeling', 'Product Monograph format'], aliases: ['canada', 'health canada', 'hc'] },
  { id: 'mhra', label: 'United Kingdom (MHRA)', authority: 'MHRA', dossierStandard: 'eCTD; UK Module 1; SmPC/PIL', styleNotes: ['British English', 'Post-Brexit national procedures; SmPC/PIL'], aliases: ['uk', 'united kingdom', 'mhra', 'britain'] },
  { id: 'tga', label: 'Australia (TGA)', authority: 'TGA', dossierStandard: 'eCTD; AU Module 1; PI (Product Information) & CMI', styleNotes: ['Australian English', 'PI/CMI documents; ARTG'], aliases: ['australia', 'tga'] },
  { id: 'ich', label: 'Global (ICH-aligned)', authority: 'ICH', dossierStandard: 'CTD/eCTD common technical document', styleNotes: ['Write the common core once; localize Module 1 + labeling per region', 'Default to ICH conventions when no single region is specified'], aliases: ['global', 'ich', 'international', 'multi-region', 'worldwide'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Audience registers / client segments
// ─────────────────────────────────────────────────────────────────────────────

const AUDIENCES: AudienceRegister[] = [
  { id: 'regulator', label: 'Health authority / regulator', tone: 'Precise, neutral, defensible — argue benefit–risk on the data', readingLevel: 'Expert', emphasis: ['Compliance with the governing standard', 'Traceability to source data', 'Even-handed benefit–risk'], avoid: ['Promotional language', 'Unsupported superiority claims'], aliases: ['agency', 'reviewer', 'authority'] },
  { id: 'payer', label: 'Payer / HTA body', tone: 'Value-focused, comparative, outcomes-driven', readingLevel: 'Expert', emphasis: ['Comparative effectiveness vs standard of care', 'Clinical + economic value, budget impact', 'Relevant subgroups & generalizability'], avoid: ['Surrogate-only claims without clinical linkage', 'Ignoring the comparator'], aliases: ['hta', 'reimbursement', 'market access', 'nice', 'icer'] },
  { id: 'clinician', label: 'Clinician / KOL', tone: 'Scientific, balanced, practice-relevant', readingLevel: 'Expert', emphasis: ['Mechanism, place in therapy, practical use', 'Honest limitations', 'Guideline context'], avoid: ['Marketing spin', 'Overstating effect sizes'], aliases: ['physician', 'kol', 'hcp', 'investigator'] },
  { id: 'patient', label: 'Patient / lay public', tone: 'Warm, plain, non-promotional, respectful', readingLevel: '6th–8th grade', emphasis: ['Plain language, natural frequencies', 'What it means for them', 'Balanced risks and benefits'], avoid: ['Jargon/acronyms', 'False reassurance', 'Promotion'], aliases: ['lay', 'public', 'participant', 'consumer'] },
];

// ─────────────────────────────────────────────────────────────────────────────
// Lookup + composition
// ─────────────────────────────────────────────────────────────────────────────

function findBy<T extends { id: string; aliases?: string[]; label?: string }>(
  list: T[],
  key: string | undefined
): T | undefined {
  if (!key) return undefined;
  const k = key.trim().toLowerCase();
  return (
    list.find(x => x.id === k) ||
    list.find(x => x.aliases?.some(a => a.toLowerCase() === k)) ||
    list.find(x => (x.label ?? '').toLowerCase() === k) ||
    // loose contains match (e.g. "non-small cell lung cancer" → oncology via alias 'cancer')
    list.find(x => x.aliases?.some(a => k.includes(a.toLowerCase())) || k.includes(x.id))
  );
}

export interface MedicalWritingRequest {
  documentType?: string;
  therapeuticArea?: string;
  region?: string;
  audience?: string;
  clientSegment?: string; // pharma | biotech | medtech/device | ivd | cro — informational
}

export interface MedicalWritingGuidance {
  resolved: {
    documentType: string | null;
    therapeuticArea: string | null;
    region: string;
    audience: string;
    clientSegment?: string;
  };
  documentStandard: DocumentTypeStandard | null;
  therapeuticArea: TherapeuticAreaConvention | null;
  region: RegionConvention;
  audience: AudienceRegister;
  globalStyleRules: string[];
  /** A ready-to-use markdown brief AnA can fold into its drafting context. */
  brief: string;
  /** When the document type wasn't recognized, the catalog of supported ids. */
  availableDocumentTypes?: string[];
}

/** List the supported knowledge keys (for discovery / the tool schema). */
export function listMedicalWritingCatalog() {
  return {
    documentTypes: DOCUMENT_TYPES.map(d => ({ id: d.id, label: d.label, segment: d.segment })),
    therapeuticAreas: THERAPEUTIC_AREAS.map(t => ({ id: t.id, label: t.label })),
    regions: REGIONS.map(r => ({ id: r.id, label: r.label })),
    audiences: AUDIENCES.map(a => ({ id: a.id, label: a.label })),
  };
}

function bullets(title: string, items: string[]): string {
  if (!items.length) return '';
  return `\n### ${title}\n${items.map(i => `- ${i}`).join('\n')}`;
}

/**
 * Compose grounded medical-writing guidance for a request. Always returns a
 * usable brief: unknown document type falls back to general craft + the catalog;
 * region defaults to ICH-global; audience defaults to the document's default (or
 * regulator).
 */
export function composeMedicalWritingGuidance(req: MedicalWritingRequest): MedicalWritingGuidance {
  const doc = findBy(DOCUMENT_TYPES, req.documentType) ?? null;
  const ta = findBy(THERAPEUTIC_AREAS, req.therapeuticArea) ?? null;
  const region = findBy(REGIONS, req.region) ?? REGIONS.find(r => r.id === 'ich')!;
  const audience =
    findBy(AUDIENCES, req.audience) ??
    findBy(AUDIENCES, doc?.defaultAudience) ??
    AUDIENCES.find(a => a.id === 'regulator')!;

  const parts: string[] = [];
  parts.push(
    `# Medical-writing guidance${doc ? `: ${doc.label}` : ''}` +
      `${ta ? ` — ${ta.label}` : ''} (${region.label}; audience: ${audience.label})`
  );

  if (doc) {
    parts.push(`\n**Purpose.** ${doc.purpose}`);
    parts.push(`\n**Governing standards.** ${doc.governingStandards.join('; ')}`);
    parts.push(bullets('Document structure', doc.structure));
    parts.push(bullets('Key requirements', doc.keyRequirements));
    parts.push(bullets('Common pitfalls to avoid', doc.commonPitfalls));
  } else {
    parts.push(
      `\n_Document type not recognized — applying general medical-writing craft. Supported types: ${DOCUMENT_TYPES.map(d => d.id).join(', ')}._`
    );
  }

  if (ta) {
    parts.push(`\n## Therapeutic area: ${ta.label}`);
    parts.push(bullets('Endpoints', ta.endpoints));
    parts.push(bullets('Terminology & scales', ta.terminology));
    parts.push(bullets('Reporting conventions', ta.reportingConventions));
    parts.push(bullets('Key guidances', ta.keyGuidances));
  }

  parts.push(`\n## Region/market: ${region.label}`);
  parts.push(`**Dossier standard.** ${region.dossierStandard}`);
  parts.push(bullets('Regional style', region.styleNotes));

  parts.push(`\n## Audience: ${audience.label}`);
  parts.push(`**Tone.** ${audience.tone}  \n**Reading level.** ${audience.readingLevel}`);
  parts.push(bullets('Emphasize', audience.emphasis));
  parts.push(bullets('Avoid', audience.avoid));

  parts.push(bullets('Universal craft rules (always apply)', GLOBAL_STYLE_RULES));
  parts.push(
    '\n## How to use the evidence\nGround every clinical claim in retrieved evidence: use search_literature (PubMed), ' +
      'search_clinical_evidence (ClinicalTrials.gov), search_drug_labels / search_drug_approvals / search_device_recalls ' +
      '(FDA), and assess_regulatory_landscape, then cite each source with its identifier and URL per the citation protocol.'
  );

  return {
    resolved: {
      documentType: doc?.id ?? null,
      therapeuticArea: ta?.id ?? null,
      region: region.id,
      audience: audience.id,
      clientSegment: req.clientSegment,
    },
    documentStandard: doc,
    therapeuticArea: ta,
    region,
    audience,
    globalStyleRules: GLOBAL_STYLE_RULES,
    brief: parts.filter(Boolean).join('\n'),
    availableDocumentTypes: doc ? undefined : DOCUMENT_TYPES.map(d => d.id),
  };
}
