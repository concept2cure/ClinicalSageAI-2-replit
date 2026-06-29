/**
 * Clinical Outcome Assessment (COA / PRO) Intelligence — Deterministic Knowledge Base
 *
 * Pure, in-code reference data and decision engines for selecting a Clinical
 * Outcome Assessment (COA) type, evaluating measurement properties, deriving a
 * meaningful within-patient change threshold and responder definition, judging
 * fit-for-purpose for a context of use, positioning a COA-based endpoint, and
 * planning COA development or selection.
 *
 * The four COA types covered are:
 *   PRO    — Patient-Reported Outcome (report comes directly from the patient,
 *            no interpretation by a clinician or anyone else)
 *   ClinRO — Clinician-Reported Outcome (report involves clinical judgment by a
 *            trained healthcare professional)
 *   ObsRO  — Observer-Reported Outcome (report from a non-clinician observer who
 *            can observe behavior/signs — e.g. a parent or caregiver — without
 *            clinical judgment or inference about unobservable concepts)
 *   PerfO  — Performance Outcome (report based on a standardized task actively
 *            performed by the patient, administered/scored per a protocol)
 *
 * NO LLM, NO network, NO database. Every function is closed-form and
 * reproducible: identical input always yields identical output.
 *
 * Regulatory / methodological grounding:
 *   - FDA Guidance for Industry: Patient-Reported Outcome Measures: Use in
 *     Medical Product Development to Support Labeling Claims (December 2009)
 *   - FDA Patient-Focused Drug Development (PFDD) Guidance Series:
 *       Guidance 1 — Collecting Comprehensive and Representative Input (2020)
 *       Guidance 2 — Methods to Identify What Is Important to Patients (2022)
 *       Guidance 3 — Selecting, Developing, or Modifying Fit-for-Purpose
 *                    Clinical Outcome Assessments (2023)
 *       Guidance 4 — Incorporating COAs Into Endpoints for Regulatory
 *                    Decision-Making (draft, 2023)
 *   - FDA Clinical Outcome Assessment (COA) Qualification Program; COA
 *     Compendium; Roadmap to Patient-Focused Outcome Measurement
 *   - ISPOR Good Research Practices for PRO Task Force reports (content
 *     validity Parts 1 & 2, 2011; mixed-modes; ePRO; PRO data analysis)
 *   - ISOQOL minimum standards for PRO measures used in patient-centered
 *     outcomes and comparative effectiveness research (2013)
 *   - EMA Reflection Paper on the regulatory guidance for the use of HRQoL
 *     measures in the evaluation of medicinal products (EMEA/CHMP/EWP/139391/2004)
 *
 * This module encodes the structured, decision-rule portions of those
 * documents. It is a clinical-science decision support engine; it is NOT a
 * substitute for review-division advice. Citations are provided so a reviewer
 * can confirm every recommendation against the primary source.
 *
 * @module server/services/clinical-outcome-assessment/coa-knowledge
 */

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 0 — Shared types
// ═════════════════════════════════════════════════════════════════════════════

/** The four FDA-recognized Clinical Outcome Assessment types. */
export type COAType = 'PRO' | 'ClinRO' | 'ObsRO' | 'PerfO';

/** Who can validly serve as the reporter / data source for a concept. */
export type Reporter =
  | 'patient'
  | 'clinician'
  | 'caregiver'
  | 'parent'
  | 'teacher'
  | 'trained_observer'
  | 'patient_performing_task';

/** Endpoint position in a trial's hierarchy. */
export type EndpointPosition =
  | 'primary'
  | 'key_secondary'
  | 'secondary'
  | 'exploratory'
  | 'not_recommended';

/** Qualitative adequacy grade used throughout the engines. */
export type AdequacyGrade =
  | 'adequate'
  | 'partially_adequate'
  | 'inadequate'
  | 'not_assessed';

/** Coarse population descriptor that drives reporter feasibility. */
export type PopulationType =
  | 'adult_cognitively_intact'
  | 'adult_cognitively_impaired'
  | 'elderly_frail'
  | 'adolescent'
  | 'child_school_age'
  | 'child_preschool'
  | 'infant_toddler'
  | 'critically_ill_unconscious'
  | 'severe_psychiatric';

/** Whether a concept is directly observable or known only to the patient. */
export type ConceptObservability =
  | 'patient_subjective' // symptom/feeling only the patient experiences (pain, fatigue, nausea)
  | 'observable_sign' // a sign an observer can see without inference (vomiting, tremor, mobility)
  | 'clinical_judgment' // requires trained clinical interpretation (severity rating, staging)
  | 'functional_capacity'; // capacity demonstrable through a standardized task (6-min walk)

/** A regulatory or methodological source reference. */
export interface CitationRef {
  source: string;
  detail: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — COA type reference registry
// ═════════════════════════════════════════════════════════════════════════════

/** Static reference description of a single COA type. */
export interface COATypeProfile {
  coaType: COAType;
  fullName: string;
  reportSource: string;
  definition: string;
  involvesClinicalJudgment: boolean;
  canCaptureUnobservableConcepts: boolean;
  typicalConcepts: string[];
  typicalInstruments: string[];
  strengths: string[];
  limitations: string[];
  keyValidationConsiderations: string[];
  citations: CitationRef[];
}

const COA_TYPE_REGISTRY: Record<COAType, COATypeProfile> = {
  PRO: {
    coaType: 'PRO',
    fullName: 'Patient-Reported Outcome',
    reportSource:
      'Directly from the patient about the status of the patient’s health condition, ' +
      'without amendment or interpretation by a clinician or anyone else.',
    definition:
      'A measurement based on a report that comes directly from the patient about ' +
      'the status of a health condition without interpretation of the patient’s ' +
      'response by a clinician or anyone else (FDA PRO Guidance 2009, Glossary).',
    involvesClinicalJudgment: false,
    canCaptureUnobservableConcepts: true,
    typicalConcepts: [
      'Pain intensity',
      'Fatigue',
      'Nausea',
      'Itch / pruritus',
      'Dyspnea (breathlessness)',
      'Emotional well-being / depression severity (self-reported)',
      'Symptom bother',
      'Physical functioning (self-reported ability)',
      'Health-related quality of life (HRQoL)',
      'Treatment satisfaction',
    ],
    typicalInstruments: [
      'Numeric Rating Scale (NRS) / Visual Analog Scale (VAS) for pain',
      'Brief Pain Inventory (BPI)',
      'PROMIS item banks (fatigue, physical function, pain interference)',
      'EORTC QLQ-C30 (oncology HRQoL)',
      'SF-36 / SF-12 generic HRQoL',
      'EQ-5D (preference-based utility)',
      'Asthma Control Questionnaire (ACQ) patient-reported items',
    ],
    strengths: [
      'Only valid source for concepts known only to the patient (symptoms, feelings, perceptions)',
      'Captures the patient’s direct experience — central to patient-focused drug development',
      'Can support symptomatic and HRQoL labeling claims',
    ],
    limitations: [
      'Requires intact self-report capacity (literacy, cognition, language, age)',
      'Susceptible to recall bias, response shift, missing data, and unblinding effects',
      'Subjective; needs strong content validity evidence to anchor the score in patient experience',
    ],
    keyValidationConsiderations: [
      'Content validity established with patients from the target population (concept elicitation + cognitive interviews)',
      'Appropriate recall period matched to the concept and treatment effect onset',
      'Reading level and translation/cultural adaptation for the intended population',
      'Clear, single-concept items with an unambiguous response scale and recall window',
    ],
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Definition, content-validity expectations, and labeling-claim framework for PROs' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Selecting/developing/modifying fit-for-purpose COAs including PROs' },
      { source: 'ISPOR PRO Content Validity Task Force (2011, Parts 1 & 2)', detail: 'Eliciting concepts and establishing content validity for PROs' },
    ],
  },
  ClinRO: {
    coaType: 'ClinRO',
    fullName: 'Clinician-Reported Outcome',
    reportSource:
      'From a trained healthcare professional after observation of the patient’s health condition.',
    definition:
      'A measurement based on a report that comes from a trained healthcare ' +
      'professional after observation of a patient’s health condition. A ClinRO ' +
      'involves a judgment or interpretation and can only measure concepts that ' +
      'can be observed by a clinician (FDA glossary / BEST resource).',
    involvesClinicalJudgment: true,
    canCaptureUnobservableConcepts: false,
    typicalConcepts: [
      'Disease severity / global clinical impression',
      'Skin lesion severity (e.g., psoriasis area and severity)',
      'Tumor response category (clinical assessment component)',
      'Joint counts (rheumatology)',
      'Wound healing stage',
      'Neurological examination ratings',
    ],
    typicalInstruments: [
      'Clinical Global Impression of Severity / Change (CGI-S / CGI-C)',
      'Psoriasis Area and Severity Index (PASI)',
      'Eczema Area and Severity Index (EASI)',
      'Hamilton Depression Rating Scale (HAM-D, clinician-rated)',
      'Investigator Global Assessment (IGA)',
      'Expanded Disability Status Scale (EDSS, MS)',
    ],
    strengths: [
      'Leverages trained clinical judgment to integrate signs into a severity rating',
      'Appropriate where the concept is a clinically observable sign or a synthesized clinical impression',
      'Standardized rater training improves consistency',
    ],
    limitations: [
      'Limited to concepts a clinician can observe; cannot validly measure internal patient experience',
      'Inter-rater and intra-rater variability require rater training and reliability monitoring',
      'Risk of measuring a construct distinct from the patient-relevant concept',
    ],
    keyValidationConsiderations: [
      'Explicit, anchored rating definitions to reduce inter-rater variability',
      'Rater qualification, training, and certification documented in the protocol',
      'Inter-rater and intra-rater (test-retest) reliability established',
      'Content validity that the rated construct maps to a clinically meaningful concept',
    ],
    citations: [
      { source: 'FDA-NIH BEST Glossary', detail: 'ClinRO definition (trained healthcare professional, involves judgment)' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Fit-for-purpose considerations applicable to ClinROs' },
      { source: 'FDA COA Qualification Program', detail: 'Qualification standards for ClinRO measures used as drug development tools' },
    ],
  },
  ObsRO: {
    coaType: 'ObsRO',
    fullName: 'Observer-Reported Outcome',
    reportSource:
      'From a non-clinician observer (e.g., a parent or caregiver) who can observe and report ' +
      'on the patient’s health condition without interpreting unobservable concepts.',
    definition:
      'A measurement based on a report of observable signs, events, or behaviors related ' +
      'to a patient’s health condition by someone other than the patient or a health ' +
      'professional. ObsROs are reports of observable concepts only and should not include ' +
      'the observer’s interpretation of how the patient feels or unobservable symptoms ' +
      '(FDA glossary / FDA Roadmap to Patient-Focused Outcome Measurement).',
    involvesClinicalJudgment: false,
    canCaptureUnobservableConcepts: false,
    typicalConcepts: [
      'Frequency of observable events (vomiting episodes, seizures, scratching)',
      'Observable behaviors (crying, irritability signs, play activity)',
      'Functional behaviors a caregiver can witness (feeding, sleeping, mobility)',
      'Observable signs in a non-communicative patient',
    ],
    typicalInstruments: [
      'Caregiver/parent diaries of observable events (e.g., vomiting episodes)',
      'Parent-reported symptom/behavior checklists limited to observable items',
      'Observer-completed daily activity logs',
    ],
    strengths: [
      'Enables outcome capture where the patient cannot self-report (young children, severe impairment)',
      'Best source for objectively observable events occurring in daily life outside the clinic',
      'Caregiver proximity allows capture across time and settings',
    ],
    limitations: [
      'Valid ONLY for directly observable concepts; cannot validly capture pain/feelings (those are PRO)',
      'Observer perception, burden, and proxy bias can distort reports of internal states',
      'Different observers (e.g., parent vs. teacher) may not be interchangeable',
    ],
    keyValidationConsiderations: [
      'Items strictly limited to observable signs/behaviors/events — no inference about feelings',
      'Define and standardize who the observer is and the observation context',
      'Evidence the observer reliably observes the concept across relevant settings',
      'Avoid proxy reporting of subjective experience, which the FDA does not equate to PRO data',
    ],
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Distinguishes observable proxy reports from patient self-report' },
      { source: 'FDA Roadmap to Patient-Focused Outcome Measurement', detail: 'ObsRO scope limited to observable concepts' },
      { source: 'ISPOR proxy-report good practices', detail: 'Use of observer/proxy reports for pediatric and cognitively impaired populations' },
    ],
  },
  PerfO: {
    coaType: 'PerfO',
    fullName: 'Performance Outcome',
    reportSource:
      'Based on a standardized task or activity actively undertaken by the patient ' +
      'according to a set of instructions, administered and scored by a trained professional.',
    definition:
      'A measurement based on standardized task(s) actively undertaken by a patient ' +
      'according to a set of instructions. A PerfO may be administered by an appropriately ' +
      'trained individual or completed by the patient independently (FDA glossary).',
    involvesClinicalJudgment: false,
    canCaptureUnobservableConcepts: false,
    typicalConcepts: [
      'Physical functional capacity (walking distance/speed)',
      'Cognitive task performance (memory, processing speed)',
      'Pulmonary function effort (spirometry as a performed task component)',
      'Manual dexterity / fine motor task performance',
      'Visual function task performance',
    ],
    typicalInstruments: [
      'Six-Minute Walk Test (6MWT)',
      'Timed Up and Go (TUG)',
      'Timed 25-Foot Walk (T25FW, MS)',
      'Cognitive performance batteries (e.g., paced auditory serial addition)',
      'Grip strength / nine-hole peg test',
    ],
    strengths: [
      'Objective, standardized, and observer-independent given a fixed protocol',
      'Captures functional capacity that self-report or clinician rating may not isolate',
      'Reproducible scoring reduces some rater subjectivity',
    ],
    limitations: [
      'Measures capacity under standardized conditions, not real-world performance or experience',
      'Sensitive to effort, motivation, learning/practice effects, and environment',
      'Requires standardized administration, equipment, and trained administrators',
    ],
    keyValidationConsiderations: [
      'Standardized administration manual, environment, and equipment calibration',
      'Account for learning/practice effects (e.g., training trials, multiple baseline assessments)',
      'Establish the task reflects a concept meaningful to patients (link capacity to daily function)',
      'Test-retest reliability under standardized conditions; clear scoring rules',
    ],
    citations: [
      { source: 'FDA-NIH BEST Glossary', detail: 'PerfO definition (standardized task, instructions, administration/scoring)' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Selecting/developing fit-for-purpose PerfO measures' },
      { source: 'FDA COA Qualification Program', detail: 'Qualification of PerfO measures as drug development tools' },
    ],
  },
};

/** Read-only accessor for a COA type profile (deterministic). */
export function getCOATypeProfile(coaType: COAType): COATypeProfile {
  return COA_TYPE_REGISTRY[coaType];
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — Population → reporter feasibility reference table
// ═════════════════════════════════════════════════════════════════════════════

/** Reporter-feasibility profile for a population type. */
export interface PopulationReporterProfile {
  population: PopulationType;
  label: string;
  selfReportFeasible: boolean;
  selfReportNotes: string;
  preferredAlternativeReporters: Reporter[];
  recommendedCOATypesWhenSelfReportLimited: COAType[];
  citations: CitationRef[];
}

const POPULATION_REPORTER_REGISTRY: Record<PopulationType, PopulationReporterProfile> = {
  adult_cognitively_intact: {
    population: 'adult_cognitively_intact',
    label: 'Cognitively intact adult',
    selfReportFeasible: true,
    selfReportNotes:
      'Self-report is the preferred and valid source for subjective concepts; PRO is first choice.',
    preferredAlternativeReporters: ['clinician'],
    recommendedCOATypesWhenSelfReportLimited: ['ClinRO', 'PerfO'],
    citations: [{ source: 'FDA PRO Guidance (2009)', detail: 'Self-report preferred when patient can reliably self-report' }],
  },
  adult_cognitively_impaired: {
    population: 'adult_cognitively_impaired',
    label: 'Cognitively impaired adult (e.g., moderate–severe dementia)',
    selfReportFeasible: false,
    selfReportNotes:
      'Self-report capacity may be limited; degree of impairment should be characterized. Mild impairment may still permit simplified PROs.',
    preferredAlternativeReporters: ['caregiver', 'clinician', 'trained_observer'],
    recommendedCOATypesWhenSelfReportLimited: ['ObsRO', 'ClinRO', 'PerfO'],
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'When patients cannot self-report, observer reports limited to observable concepts may be used' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Characterize self-report capacity in the target population' },
    ],
  },
  elderly_frail: {
    population: 'elderly_frail',
    label: 'Frail elderly adult',
    selfReportFeasible: true,
    selfReportNotes:
      'Self-report usually feasible if cognition intact; account for sensory limits, fatigue, and burden; simplify response scales.',
    preferredAlternativeReporters: ['caregiver', 'clinician'],
    recommendedCOATypesWhenSelfReportLimited: ['ClinRO', 'ObsRO', 'PerfO'],
    citations: [{ source: 'FDA PFDD Guidance 1 (2020)', detail: 'Ensure representative input including older adults; minimize burden' }],
  },
  adolescent: {
    population: 'adolescent',
    label: 'Adolescent (approx. 12–17 years)',
    selfReportFeasible: true,
    selfReportNotes:
      'Adolescents can generally self-report with age-appropriate instruments; validate content for the age band.',
    preferredAlternativeReporters: ['parent', 'clinician'],
    recommendedCOATypesWhenSelfReportLimited: ['ObsRO', 'ClinRO', 'PerfO'],
    citations: [{ source: 'FDA PRO Guidance (2009)', detail: 'Age-appropriate self-report instruments for older children/adolescents' }],
  },
  child_school_age: {
    population: 'child_school_age',
    label: 'School-age child (approx. 8–11 years)',
    selfReportFeasible: true,
    selfReportNotes:
      'Self-report may be feasible with developmentally appropriate, simplified instruments and cognitive testing in the age band; consider concurrent observer report.',
    preferredAlternativeReporters: ['parent', 'caregiver', 'teacher', 'clinician'],
    recommendedCOATypesWhenSelfReportLimited: ['ObsRO', 'ClinRO', 'PerfO'],
    citations: [{ source: 'FDA PRO Guidance (2009)', detail: 'Demonstrate children can understand items at their developmental level' }],
  },
  child_preschool: {
    population: 'child_preschool',
    label: 'Preschool child (approx. 2–7 years)',
    selfReportFeasible: false,
    selfReportNotes:
      'Reliable self-report generally not established below ~8 years; observer (parent/caregiver) report of observable concepts is preferred.',
    preferredAlternativeReporters: ['parent', 'caregiver', 'teacher'],
    recommendedCOATypesWhenSelfReportLimited: ['ObsRO', 'ClinRO', 'PerfO'],
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Young children may not reliably self-report; use ObsRO limited to observable concepts' },
    ],
  },
  infant_toddler: {
    population: 'infant_toddler',
    label: 'Infant / toddler (under ~2 years)',
    selfReportFeasible: false,
    selfReportNotes:
      'Self-report not feasible; rely on observer report of observable signs/behaviors and clinician assessment / performance tasks.',
    preferredAlternativeReporters: ['parent', 'caregiver', 'clinician'],
    recommendedCOATypesWhenSelfReportLimited: ['ObsRO', 'ClinRO', 'PerfO'],
    citations: [{ source: 'FDA Roadmap to Patient-Focused Outcome Measurement', detail: 'ObsRO/ClinRO for non-verbal populations; observable concepts only' }],
  },
  critically_ill_unconscious: {
    population: 'critically_ill_unconscious',
    label: 'Critically ill / unconscious / sedated patient',
    selfReportFeasible: false,
    selfReportNotes:
      'Self-report not feasible during the acute state; rely on clinician assessment, observable signs, and physiologic/performance measures.',
    preferredAlternativeReporters: ['clinician', 'trained_observer'],
    recommendedCOATypesWhenSelfReportLimited: ['ClinRO', 'ObsRO', 'PerfO'],
    citations: [{ source: 'FDA PFDD Guidance 3 (2023)', detail: 'Select fit-for-purpose COA when patient cannot self-report' }],
  },
  severe_psychiatric: {
    population: 'severe_psychiatric',
    label: 'Severe psychiatric impairment (e.g., acute psychosis)',
    selfReportFeasible: false,
    selfReportNotes:
      'Self-report reliability may be compromised in acute severe states; clinician-rated scales are commonly primary, with PRO where insight permits.',
    preferredAlternativeReporters: ['clinician', 'caregiver'],
    recommendedCOATypesWhenSelfReportLimited: ['ClinRO', 'ObsRO', 'PRO'],
    citations: [{ source: 'FDA PRO Guidance (2009)', detail: 'Consider whether self-report is reliable given the condition' }],
  },
};

/** Read-only accessor for a population reporter profile. */
export function getPopulationReporterProfile(population: PopulationType): PopulationReporterProfile {
  return POPULATION_REPORTER_REGISTRY[population];
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — Measurement-property reference standards
// ═════════════════════════════════════════════════════════════════════════════

/** A single measurement property and its acceptance benchmark. */
export interface MeasurementPropertyStandard {
  property: string;
  whatItIs: string;
  howAssessed: string;
  acceptanceBenchmark: string;
  citations: CitationRef[];
}

/** Module-level table — explicitly typed, NO `as const`. */
const MEASUREMENT_PROPERTY_STANDARDS: MeasurementPropertyStandard[] = [
  {
    property: 'Content validity',
    whatItIs:
      'The extent to which an instrument measures the concept of interest as it is experienced by the target patient population — the single most important property for a novel COA.',
    howAssessed:
      'Qualitative concept elicitation with target patients (saturation of concepts) plus cognitive interviews demonstrating items/instructions/response options/recall are understood as intended.',
    acceptanceBenchmark:
      'Documented concept elicitation reaching saturation in the target population and cognitive debriefing supporting comprehension and relevance; conceptual framework links each item to the concept of interest.',
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Content validity is the most important measurement property for PROs' },
      { source: 'ISPOR Content Validity Task Force (2011, Parts 1 & 2)', detail: 'Eliciting concepts and confirming item comprehension' },
      { source: 'FDA PFDD Guidance 2 (2022)', detail: 'Methods to identify what is important to patients' },
    ],
  },
  {
    property: 'Construct validity',
    whatItIs:
      'The degree to which scores relate to other measures in ways consistent with theoretical expectations (convergent, divergent, known-groups).',
    howAssessed:
      'Correlations with related/unrelated measures; known-groups comparisons (e.g., scores differ by disease severity strata as hypothesized).',
    acceptanceBenchmark:
      'Pre-specified hypotheses largely confirmed: moderate–strong correlations with conceptually related measures, weak with unrelated, and expected separation across known groups.',
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Construct validity via a priori hypotheses' },
      { source: 'ISOQOL minimum standards (2013)', detail: 'Construct validity expectations for PRO measures' },
    ],
  },
  {
    property: 'Test-retest reliability',
    whatItIs:
      'Reproducibility of scores over a period in which the concept is expected to be stable.',
    howAssessed:
      'Intraclass correlation coefficient (ICC) between two administrations in stable patients over an appropriate interval.',
    acceptanceBenchmark:
      'ICC ≥ 0.70 generally acceptable for group-level comparisons; higher (≥ 0.90) expected where individual-level decisions are made. Interval matched to concept stability.',
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Test-retest reliability over a stable period' },
      { source: 'ISOQOL minimum standards (2013)', detail: 'Reliability thresholds (ICC ≥ 0.70)' },
    ],
  },
  {
    property: 'Internal consistency reliability',
    whatItIs:
      'The degree to which items within a multi-item domain measure the same underlying concept.',
    howAssessed:
      'Cronbach’s alpha (and item-total correlations) within each multi-item domain/score.',
    acceptanceBenchmark:
      'Cronbach’s alpha ≥ 0.70 for group comparisons; very high alpha (> 0.90) may indicate item redundancy. Applies only to multi-item summed scores, not single-item PROs.',
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Internal consistency for multi-item domains' },
      { source: 'ISOQOL minimum standards (2013)', detail: 'Cronbach’s alpha ≥ 0.70' },
    ],
  },
  {
    property: 'Inter-rater reliability',
    whatItIs:
      'Agreement between different raters scoring the same patient — critical for ClinRO and administered PerfO.',
    howAssessed:
      'ICC or weighted kappa across raters; rater training/certification documented.',
    acceptanceBenchmark:
      'ICC/kappa ≥ 0.70 with documented rater training; lower values require remediation or central rating.',
    citations: [
      { source: 'FDA COA Qualification Program', detail: 'Inter-rater reliability for ClinRO/PerfO measures' },
    ],
  },
  {
    property: 'Ability to detect change (responsiveness)',
    whatItIs:
      'The capacity of the instrument to detect change in the concept when change has truly occurred.',
    howAssessed:
      'Longitudinal change in scores related to an external anchor of change (e.g., patient global impression of change) and effect sizes in known responders.',
    acceptanceBenchmark:
      'Scores change in the expected direction and magnitude in patients who improve/worsen per an external anchor; supports detecting treatment effect over the trial period.',
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Ability to detect change supporting endpoint use' },
      { source: 'ISPOR PRO Data Analysis good practices', detail: 'Responsiveness and longitudinal validity' },
    ],
  },
  {
    property: 'Structural validity / scoring',
    whatItIs:
      'Whether the item-to-domain structure and scoring algorithm are supported empirically.',
    howAssessed:
      'Factor analysis / item response theory; documented, reproducible scoring rules and handling of missing items.',
    acceptanceBenchmark:
      'Dimensionality supports the scoring model; scoring algorithm and missing-data rules pre-specified and reproducible.',
    citations: [
      { source: 'ISOQOL minimum standards (2013)', detail: 'Structural validity / scoring documentation' },
    ],
  },
  {
    property: 'Measurement invariance / cross-cultural validity',
    whatItIs:
      'Whether the instrument measures the concept equivalently across subgroups, languages, and modes.',
    howAssessed:
      'Differential item functioning analyses; documented translation/linguistic validation; equivalence across data-collection modes.',
    acceptanceBenchmark:
      'No material DIF across key subgroups; translations linguistically validated; mode equivalence demonstrated for mixed-mode collection.',
    citations: [
      { source: 'ISPOR ePRO and Mixed-Modes good practices', detail: 'Mode equivalence and measurement comparability' },
      { source: 'ISPOR Translation & Cultural Adaptation good practices', detail: 'Linguistic validation' },
    ],
  },
];

/** Read-only accessor for the measurement-property standards table. */
export function getMeasurementPropertyStandards(): MeasurementPropertyStandard[] {
  return MEASUREMENT_PROPERTY_STANDARDS.map((s: MeasurementPropertyStandard) => ({ ...s }));
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — selectCOAType
// ═════════════════════════════════════════════════════════════════════════════

export interface SelectCOATypeParams {
  /** Plain-language concept of interest, e.g. "pain intensity", "vomiting frequency". */
  conceptOfInterest: string;
  /** How observable the concept is — the primary driver of COA-type validity. */
  conceptObservability: ConceptObservability;
  /** Target population — drives whether self-report is feasible. */
  population: PopulationType;
  /** Optional: explicitly state who can best report the concept. */
  bestReporter?: Reporter;
  /** Optional: the disease/therapeutic area, used for context notes only. */
  disease?: string;
}

export interface COATypeRecommendation {
  coaType: COAType;
  suitability: 'primary' | 'acceptable' | 'not_appropriate';
  rationale: string;
}

export interface SelectCOATypeResult {
  conceptOfInterest: string;
  population: string;
  selfReportFeasible: boolean;
  recommendedCOATypes: COATypeRecommendation[];
  primaryRecommendation: COAType;
  reporterGuidance: string;
  cautions: string[];
  citations: CitationRef[];
}

/**
 * Select the appropriate COA type(s) for a concept of interest given who can
 * best report it, the disease, and the population. Deterministic decision tree
 * derived from the FDA COA-type definitions and the patient-self-report
 * feasibility rules in the FDA PRO Guidance (2009) and PFDD Guidance 3 (2023).
 */
export function selectCOAType(params: SelectCOATypeParams): SelectCOATypeResult {
  const pop = POPULATION_REPORTER_REGISTRY[params.population];
  const selfReportFeasible = pop.selfReportFeasible;
  const cautions: string[] = [];

  const recs: COATypeRecommendation[] = [];

  // Helper to push a recommendation.
  const add = (coaType: COAType, suitability: COATypeRecommendation['suitability'], rationale: string): void => {
    recs.push({ coaType, suitability, rationale });
  };

  switch (params.conceptObservability) {
    case 'patient_subjective': {
      // Only the patient experiences it → PRO is the only fully valid source.
      if (selfReportFeasible) {
        add('PRO', 'primary', 'The concept is a subjective experience known only to the patient and the population can reliably self-report, so a PRO is the only directly valid source (FDA PRO Guidance 2009).');
        add('ClinRO', 'not_appropriate', 'A clinician cannot directly observe an internal subjective experience; a ClinRO would measure a different construct.');
        add('ObsRO', 'not_appropriate', 'Observers can only report observable concepts; an observer cannot validly report the patient’s internal experience.');
        add('PerfO', 'not_appropriate', 'A performance task does not capture a subjective symptom experience.');
      } else {
        // Patient cannot self-report a subjective concept — a genuine measurement gap.
        cautions.push(
          'The concept is subjective (PRO-appropriate) but the population cannot reliably self-report. The FDA does NOT equate observer/proxy reports of unobservable experience with PRO data. Consider an ObsRO limited to OBSERVABLE correlates, a ClinRO of observable signs, or a PerfO of related function — and acknowledge the concept of interest may shift.',
        );
        add('ObsRO', 'acceptable', 'Where the patient cannot self-report, an ObsRO may capture OBSERVABLE behaviors/signs that correlate with the experience — but it cannot measure the unobservable experience itself.');
        add('ClinRO', 'acceptable', 'A ClinRO can rate observable clinical signs as an alternative when self-report is not feasible.');
        add('PerfO', 'acceptable', 'A PerfO may capture related functional capacity through a standardized task.');
        add('PRO', 'not_appropriate', 'A PRO is conceptually preferred but not feasible because the population cannot reliably self-report.');
      }
      break;
    }
    case 'observable_sign': {
      // Observable events/behaviors → ObsRO (or PRO if patient can self-report the same observable event).
      add('ObsRO', 'primary', 'The concept is a directly observable sign/event/behavior, which an ObsRO is specifically designed to capture (FDA Roadmap to Patient-Focused Outcome Measurement).');
      if (selfReportFeasible) {
        add('PRO', 'acceptable', 'If the patient can self-report the observable event reliably, a PRO (e.g., a patient diary of events) is also valid and may better reflect the patient’s experience.');
      } else {
        add('PRO', 'not_appropriate', 'The population cannot reliably self-report, so a PRO is not feasible for this observable concept.');
      }
      add('ClinRO', 'acceptable', 'A clinician can also rate the observable sign, though in-clinic assessment may miss events occurring in daily life.');
      add('PerfO', 'not_appropriate', 'A performance task is not the right modality for spontaneously occurring observable events.');
      break;
    }
    case 'clinical_judgment': {
      // Requires trained clinical interpretation → ClinRO.
      add('ClinRO', 'primary', 'The concept requires trained clinical judgment/interpretation, which is the defining feature of a ClinRO (FDA-NIH BEST glossary).');
      add('PRO', 'not_appropriate', 'A PRO cannot incorporate clinical judgment; the patient is not positioned to synthesize the clinical impression.');
      add('ObsRO', 'not_appropriate', 'An ObsRO is limited to observable concepts and must not include clinical interpretation.');
      add('PerfO', 'acceptable', 'A PerfO may complement a ClinRO where a standardized task isolates a functional component of the judged concept.');
      break;
    }
    case 'functional_capacity': {
      // Demonstrable via standardized task → PerfO.
      add('PerfO', 'primary', 'The concept is a functional capacity best demonstrated through a standardized task, which is the definition of a PerfO (FDA-NIH BEST glossary).');
      if (selfReportFeasible) {
        add('PRO', 'acceptable', 'A PRO of self-reported functioning captures the patient’s perception of capacity in daily life and often complements a PerfO; the two measure related but distinct constructs.');
      } else {
        add('PRO', 'not_appropriate', 'The population cannot reliably self-report perceived function.');
      }
      add('ClinRO', 'acceptable', 'A clinician can rate observed functional status as a complement to the performed task.');
      add('ObsRO', 'acceptable', 'An observer can report functional behaviors witnessed in daily life as a complement.');
      break;
    }
    default: {
      add('PRO', 'acceptable', 'Concept observability not specified; default to PRO if the concept is patient-experienced and self-report is feasible.');
    }
  }

  // Apply population-driven cautions.
  if (!selfReportFeasible) {
    cautions.push(`Population note: ${pop.label} — ${pop.selfReportNotes}`);
  }
  if (params.bestReporter && params.bestReporter !== 'patient' && params.conceptObservability === 'patient_subjective') {
    cautions.push(
      `You indicated the best reporter is "${params.bestReporter}", but the concept is subjective. A non-patient reporter of a subjective concept yields proxy/observer data, which the FDA does not treat as a PRO.`,
    );
  }
  if (params.disease) {
    cautions.push(`Confirm the concept of interest is relevant and important to patients in ${params.disease} via documented patient input (FDA PFDD Guidance 1–2).`);
  }

  // Determine the single primary recommendation.
  const primary = recs.find((r: COATypeRecommendation) => r.suitability === 'primary');
  const primaryRecommendation: COAType = primary
    ? primary.coaType
    : recs.find((r: COATypeRecommendation) => r.suitability === 'acceptable')?.coaType ?? 'PRO';

  const reporterGuidance = selfReportFeasible
    ? `Self-report is feasible in ${pop.label}; prefer the patient as reporter for patient-experienced concepts.`
    : `Self-report is limited in ${pop.label}; preferred alternative reporters: ${pop.preferredAlternativeReporters.join(', ')}. Limit observer reports to observable concepts.`;

  return {
    conceptOfInterest: params.conceptOfInterest,
    population: pop.label,
    selfReportFeasible,
    recommendedCOATypes: recs,
    primaryRecommendation,
    reporterGuidance,
    cautions,
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'COA-type definitions and patient self-report feasibility' },
      { source: 'FDA-NIH BEST Glossary', detail: 'ClinRO / ObsRO / PerfO definitions' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Selecting a fit-for-purpose COA type' },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — assessCOAValidation
// ═════════════════════════════════════════════════════════════════════════════

export interface AssessCOAValidationParams {
  /** COA type under evaluation. */
  coaType: COAType;
  /** Was content validity established in the target population? */
  contentValidityEstablished?: boolean;
  /** Was content validity established specifically in THIS context of use / population? */
  contentValidityInTargetPopulation?: boolean;
  /** Construct-validity hypotheses largely confirmed? */
  constructValidityConfirmed?: boolean;
  /** Test-retest ICC, if available. */
  testRetestICC?: number;
  /** Cronbach's alpha for multi-item domains, if applicable. */
  cronbachAlpha?: number;
  /** Inter-rater ICC/kappa (ClinRO / administered PerfO). */
  interRaterICC?: number;
  /** Whether the instrument is multi-item (internal consistency applies). */
  isMultiItem?: boolean;
  /** Ability-to-detect-change evidence available and supportive? */
  abilityToDetectChangeDemonstrated?: boolean;
}

export interface ValidationPropertyResult {
  property: string;
  grade: AdequacyGrade;
  finding: string;
  benchmark: string;
}

export interface AssessCOAValidationResult {
  coaType: COAType;
  overallAdequacy: AdequacyGrade;
  properties: ValidationPropertyResult[];
  gaps: string[];
  recommendations: string[];
  citations: CitationRef[];
}

const TEST_RETEST_ICC_THRESHOLD = 0.7;
const CRONBACH_ALPHA_THRESHOLD = 0.7;
const CRONBACH_ALPHA_REDUNDANCY = 0.9;
const INTER_RATER_THRESHOLD = 0.7;

/**
 * Evaluate measurement properties (content validity, construct validity,
 * reliability, ability to detect change) for a COA and report validation
 * adequacy plus gaps. Thresholds follow the FDA PRO Guidance (2009) and
 * ISOQOL minimum standards (2013).
 */
export function assessCOAValidation(params: AssessCOAValidationParams): AssessCOAValidationResult {
  const props: ValidationPropertyResult[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];

  // ── Content validity (most important) ─────────────────────────────────────
  let contentGrade: AdequacyGrade;
  if (params.contentValidityEstablished && params.contentValidityInTargetPopulation) {
    contentGrade = 'adequate';
  } else if (params.contentValidityEstablished && params.contentValidityInTargetPopulation === false) {
    contentGrade = 'partially_adequate';
    gaps.push('Content validity exists but was not established in the specific target population / context of use; relevance and comprehension must be reconfirmed.');
    recommendations.push('Conduct concept elicitation and cognitive interviews in the actual target population to confirm content validity for this context of use (FDA PRO Guidance 2009; PFDD Guidance 2).');
  } else if (params.contentValidityEstablished === undefined) {
    contentGrade = 'not_assessed';
    gaps.push('Content validity evidence was not provided — this is the single most important property and cannot be assumed.');
    recommendations.push('Document content validity: qualitative concept elicitation to saturation plus cognitive debriefing in the target population.');
  } else {
    contentGrade = 'inadequate';
    gaps.push('Content validity is not established; without it the COA cannot be assumed to measure the concept of interest as patients experience it.');
    recommendations.push('Establish content validity before relying on the COA for any endpoint (FDA PRO Guidance 2009).');
  }
  props.push({
    property: 'Content validity',
    grade: contentGrade,
    finding:
      contentGrade === 'adequate'
        ? 'Content validity established in the target population.'
        : 'Content validity is incomplete for this context of use.',
    benchmark: 'Concept elicitation to saturation + cognitive interviews in the target population.',
  });

  // ── Construct validity ────────────────────────────────────────────────────
  let constructGrade: AdequacyGrade;
  if (params.constructValidityConfirmed === true) {
    constructGrade = 'adequate';
  } else if (params.constructValidityConfirmed === false) {
    constructGrade = 'inadequate';
    gaps.push('Construct-validity hypotheses were not confirmed; relationships with related measures and known groups did not behave as expected.');
    recommendations.push('Re-examine the conceptual framework and re-test convergent/divergent and known-groups hypotheses.');
  } else {
    constructGrade = 'not_assessed';
    gaps.push('Construct validity not assessed (convergent/divergent and known-groups evidence missing).');
    recommendations.push('Pre-specify and test construct-validity hypotheses (FDA PRO Guidance 2009; ISOQOL 2013).');
  }
  props.push({
    property: 'Construct validity',
    grade: constructGrade,
    finding: constructGrade === 'adequate' ? 'A priori construct hypotheses largely confirmed.' : 'Construct validity evidence incomplete.',
    benchmark: 'Pre-specified convergent/divergent correlations and known-groups separation confirmed.',
  });

  // ── Test-retest reliability ───────────────────────────────────────────────
  let retestGrade: AdequacyGrade;
  let retestFinding: string;
  if (typeof params.testRetestICC === 'number') {
    if (params.testRetestICC >= TEST_RETEST_ICC_THRESHOLD) {
      retestGrade = 'adequate';
      retestFinding = `Test-retest ICC = ${params.testRetestICC.toFixed(2)} meets the ICC ≥ ${TEST_RETEST_ICC_THRESHOLD.toFixed(2)} benchmark.`;
    } else {
      retestGrade = 'inadequate';
      retestFinding = `Test-retest ICC = ${params.testRetestICC.toFixed(2)} is below the ICC ≥ ${TEST_RETEST_ICC_THRESHOLD.toFixed(2)} benchmark.`;
      gaps.push('Test-retest reliability below threshold; scores are not sufficiently reproducible over a stable period.');
      recommendations.push('Investigate sources of instability (recall period, item wording, administration) and re-assess reliability.');
    }
  } else {
    retestGrade = 'not_assessed';
    retestFinding = 'Test-retest reliability not provided.';
    gaps.push('Test-retest reliability (ICC) not assessed.');
    recommendations.push('Estimate test-retest reliability in stable patients over an interval matched to concept stability.');
  }
  props.push({ property: 'Test-retest reliability', grade: retestGrade, finding: retestFinding, benchmark: `ICC ≥ ${TEST_RETEST_ICC_THRESHOLD.toFixed(2)}` });

  // ── Internal consistency ──────────────────────────────────────────────────
  if (params.isMultiItem) {
    let icGrade: AdequacyGrade;
    let icFinding: string;
    if (typeof params.cronbachAlpha === 'number') {
      if (params.cronbachAlpha >= CRONBACH_ALPHA_THRESHOLD && params.cronbachAlpha < CRONBACH_ALPHA_REDUNDANCY) {
        icGrade = 'adequate';
        icFinding = `Cronbach’s alpha = ${params.cronbachAlpha.toFixed(2)} is within the acceptable range.`;
      } else if (params.cronbachAlpha >= CRONBACH_ALPHA_REDUNDANCY) {
        icGrade = 'partially_adequate';
        icFinding = `Cronbach’s alpha = ${params.cronbachAlpha.toFixed(2)} exceeds 0.90, which may indicate item redundancy.`;
        recommendations.push('Very high alpha (> 0.90) may indicate redundant items; review item content for over-overlap.');
      } else {
        icGrade = 'inadequate';
        icFinding = `Cronbach’s alpha = ${params.cronbachAlpha.toFixed(2)} is below the 0.70 benchmark.`;
        gaps.push('Internal consistency below threshold; items in the domain may not measure a single concept.');
        recommendations.push('Re-examine domain structure (factor analysis/IRT) and item-total correlations.');
      }
    } else {
      icGrade = 'not_assessed';
      icFinding = 'Internal consistency not provided for a multi-item instrument.';
      gaps.push('Internal consistency (Cronbach’s alpha) not assessed for multi-item domains.');
      recommendations.push('Report Cronbach’s alpha and item-total correlations for each multi-item domain.');
    }
    props.push({ property: 'Internal consistency', grade: icGrade, finding: icFinding, benchmark: `Cronbach’s alpha ≥ ${CRONBACH_ALPHA_THRESHOLD.toFixed(2)} (and < 0.90)` });
  } else {
    props.push({
      property: 'Internal consistency',
      grade: 'not_assessed',
      finding: 'Single-item instrument — internal consistency does not apply; rely on test-retest reliability.',
      benchmark: 'Not applicable to single-item PROs.',
    });
  }

  // ── Inter-rater reliability (ClinRO / administered PerfO) ──────────────────
  if (params.coaType === 'ClinRO' || params.coaType === 'PerfO') {
    let irGrade: AdequacyGrade;
    let irFinding: string;
    if (typeof params.interRaterICC === 'number') {
      if (params.interRaterICC >= INTER_RATER_THRESHOLD) {
        irGrade = 'adequate';
        irFinding = `Inter-rater ICC/kappa = ${params.interRaterICC.toFixed(2)} meets the ≥ ${INTER_RATER_THRESHOLD.toFixed(2)} benchmark.`;
      } else {
        irGrade = 'inadequate';
        irFinding = `Inter-rater ICC/kappa = ${params.interRaterICC.toFixed(2)} is below the ≥ ${INTER_RATER_THRESHOLD.toFixed(2)} benchmark.`;
        gaps.push('Inter-rater reliability below threshold; rater training/standardization or central rating needed.');
        recommendations.push('Strengthen rater training/certification or implement central rating to reduce inter-rater variability.');
      }
    } else {
      irGrade = 'not_assessed';
      irFinding = 'Inter-rater reliability not provided for a rater-dependent COA.';
      gaps.push('Inter-rater reliability not assessed for a ClinRO/administered PerfO.');
      recommendations.push('Establish inter-rater reliability with documented rater training (FDA COA Qualification Program).');
    }
    props.push({ property: 'Inter-rater reliability', grade: irGrade, finding: irFinding, benchmark: `ICC/kappa ≥ ${INTER_RATER_THRESHOLD.toFixed(2)}` });
  }

  // ── Ability to detect change (responsiveness) ─────────────────────────────
  let changeGrade: AdequacyGrade;
  if (params.abilityToDetectChangeDemonstrated === true) {
    changeGrade = 'adequate';
  } else if (params.abilityToDetectChangeDemonstrated === false) {
    changeGrade = 'inadequate';
    gaps.push('Ability to detect change not demonstrated; the COA may not detect a true treatment effect over the trial period.');
    recommendations.push('Demonstrate responsiveness using longitudinal data anchored to an external indicator of change.');
  } else {
    changeGrade = 'not_assessed';
    gaps.push('Ability to detect change not assessed.');
    recommendations.push('Assess responsiveness with anchor-based longitudinal analyses (FDA PRO Guidance 2009).');
  }
  props.push({
    property: 'Ability to detect change',
    grade: changeGrade,
    finding: changeGrade === 'adequate' ? 'Scores change as expected when the concept truly changes.' : 'Responsiveness evidence incomplete.',
    benchmark: 'Score change tracks an external anchor of change in the expected direction/magnitude.',
  });

  // ── Overall adequacy roll-up ──────────────────────────────────────────────
  const grades = props.map((p: ValidationPropertyResult) => p.grade);
  const anyInadequate = grades.some((g: AdequacyGrade) => g === 'inadequate');
  const contentInadequate = contentGrade === 'inadequate' || contentGrade === 'not_assessed';
  const anyNotAssessed = grades.some((g: AdequacyGrade) => g === 'not_assessed');
  const anyPartial = grades.some((g: AdequacyGrade) => g === 'partially_adequate');

  let overallAdequacy: AdequacyGrade;
  if (contentInadequate || anyInadequate) {
    overallAdequacy = 'inadequate';
  } else if (anyNotAssessed) {
    overallAdequacy = 'partially_adequate';
  } else if (anyPartial) {
    overallAdequacy = 'partially_adequate';
  } else {
    overallAdequacy = 'adequate';
  }

  if (overallAdequacy === 'adequate') {
    recommendations.push('Measurement properties support use; compile a validation dossier and confirm fit-for-purpose for the specific context of use.');
  }

  return {
    coaType: params.coaType,
    overallAdequacy,
    properties: props,
    gaps,
    recommendations,
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Measurement properties: content/construct validity, reliability, ability to detect change' },
      { source: 'ISOQOL minimum standards (2013)', detail: 'Reliability and validity thresholds for PRO measures' },
      { source: 'FDA COA Qualification Program', detail: 'Evidence standards for COA drug development tools' },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — determineMeaningfulChange
// ═════════════════════════════════════════════════════════════════════════════

export interface AnchorEstimate {
  /** Label for the anchor (e.g., "PGIC minimally improved"). */
  anchorLabel: string;
  /** Mean within-patient change in COA score in the "meaningfully improved" anchor group. */
  meanChangeInImprovedGroup: number;
  /** Correlation of the anchor with the COA change score (should be ≥ ~0.30–0.37 to be usable). */
  anchorCorrelation?: number;
}

export interface DistributionEstimate {
  /** Standard deviation of baseline scores (for 0.5 SD heuristic). */
  baselineSD?: number;
  /** Standard error of measurement (for SEM-based estimate). */
  sem?: number;
}

export interface DetermineMeaningfulChangeParams {
  /** Direction of improvement on the score. */
  improvementDirection: 'increase' | 'decrease';
  /** Anchor-based estimates (PRIMARY method). At least one is strongly recommended. */
  anchorEstimates?: AnchorEstimate[];
  /** Distribution-based estimates (SUPPORTIVE only). */
  distributionEstimate?: DistributionEstimate;
  /** Score range, for context (optional). */
  scoreRange?: { min: number; max: number };
}

export interface DetermineMeaningfulChangeResult {
  method: 'anchor_based_primary' | 'distribution_based_supportive_only' | 'insufficient_evidence';
  anchorBasedThreshold?: number;
  usableAnchors: { anchorLabel: string; thresholdContribution: number; usable: boolean; note: string }[];
  distributionBasedEstimates: { basis: string; value: number; note: string }[];
  recommendedThreshold?: number;
  responderDefinition?: string;
  cautions: string[];
  citations: CitationRef[];
}

const MIN_USABLE_ANCHOR_CORRELATION = 0.3;

/**
 * Determine a meaningful within-patient change threshold and a responder
 * definition. Anchor-based methods are PRIMARY; distribution-based methods are
 * SUPPORTIVE ONLY (they describe measurement precision, not patient meaning).
 * Follows FDA PRO Guidance (2009) and the FDA/PFDD emphasis on meaningful
 * WITHIN-PATIENT change.
 */
export function determineMeaningfulChange(params: DetermineMeaningfulChangeParams): DetermineMeaningfulChangeResult {
  const cautions: string[] = [];
  const usableAnchors: DetermineMeaningfulChangeResult['usableAnchors'] = [];
  const distributionBasedEstimates: DetermineMeaningfulChangeResult['distributionBasedEstimates'] = [];

  // ── Anchor-based (primary) ────────────────────────────────────────────────
  let anchorBasedThreshold: number | undefined;
  const usableValues: number[] = [];
  if (params.anchorEstimates && params.anchorEstimates.length > 0) {
    for (const a of params.anchorEstimates) {
      const corr = a.anchorCorrelation;
      const usable = corr === undefined || Math.abs(corr) >= MIN_USABLE_ANCHOR_CORRELATION;
      const note = usable
        ? (corr === undefined
            ? 'Anchor correlation not provided; confirm the anchor correlates with the COA change (≥ 0.30 recommended).'
            : `Anchor correlation |r| = ${Math.abs(corr).toFixed(2)} ≥ ${MIN_USABLE_ANCHOR_CORRELATION.toFixed(2)} — usable.`)
        : `Anchor correlation |r| = ${Math.abs(corr ?? 0).toFixed(2)} < ${MIN_USABLE_ANCHOR_CORRELATION.toFixed(2)} — too weak to anchor a threshold; excluded.`;
      if (!usable) {
        cautions.push(`Anchor "${a.anchorLabel}" excluded: correlation with COA change is too weak to be interpretable.`);
      } else {
        usableValues.push(a.meanChangeInImprovedGroup);
      }
      usableAnchors.push({ anchorLabel: a.anchorLabel, thresholdContribution: a.meanChangeInImprovedGroup, usable, note });
    }
    if (usableValues.length > 0) {
      // Use the mean of usable anchor estimates as the central anchor-based threshold.
      const sum = usableValues.reduce((acc: number, v: number) => acc + v, 0);
      anchorBasedThreshold = sum / usableValues.length;
    }
  } else {
    cautions.push('No anchor-based estimates provided. Anchor-based methods are the PRIMARY basis for a meaningful within-patient change threshold; distribution-based methods alone are insufficient (FDA PRO Guidance 2009).');
  }

  // ── Distribution-based (supportive only) ──────────────────────────────────
  if (params.distributionEstimate) {
    if (typeof params.distributionEstimate.baselineSD === 'number') {
      const halfSD = 0.5 * params.distributionEstimate.baselineSD;
      distributionBasedEstimates.push({
        basis: '0.5 × baseline SD (Norman half-SD heuristic)',
        value: halfSD,
        note: 'Supportive triangulation only; reflects distribution, not patient-perceived meaning.',
      });
    }
    if (typeof params.distributionEstimate.sem === 'number') {
      distributionBasedEstimates.push({
        basis: '1 × SEM (standard error of measurement)',
        value: params.distributionEstimate.sem,
        note: 'A change exceeding ~1 SEM is beyond measurement error; supportive of, not a substitute for, anchor-based meaning.',
      });
    }
  }

  // ── Decide method + recommended threshold ─────────────────────────────────
  let method: DetermineMeaningfulChangeResult['method'];
  let recommendedThreshold: number | undefined;
  let responderDefinition: string | undefined;

  if (anchorBasedThreshold !== undefined) {
    method = 'anchor_based_primary';
    recommendedThreshold = anchorBasedThreshold;
    const dirWord = params.improvementDirection === 'increase' ? 'increase of at least' : 'decrease of at least';
    const magnitude = Math.abs(anchorBasedThreshold);
    responderDefinition =
      `A responder is a patient whose within-patient change reflects a ${dirWord} ${magnitude.toFixed(2)} point(s) on the COA score, ` +
      `where this threshold is anchored to a patient-meaningful improvement (e.g., the global-impression anchor group). ` +
      `Cross-check against distribution-based estimates for consistency before finalizing.`;
    if (distributionBasedEstimates.length > 0) {
      cautions.push('Triangulate: confirm the anchor-based threshold is at least as large as the ~1 SEM measurement-error estimate so the responder threshold exceeds noise.');
    }
  } else if (distributionBasedEstimates.length > 0) {
    method = 'distribution_based_supportive_only';
    cautions.push('Only distribution-based estimates are available. These define a minimum detectable change beyond measurement error but do NOT establish patient-meaningful change. Obtain anchor-based evidence before defining a responder threshold for a labeling endpoint.');
    recommendedThreshold = undefined;
    responderDefinition = undefined;
  } else {
    method = 'insufficient_evidence';
    cautions.push('Neither anchor-based nor distribution-based evidence was provided; a meaningful change threshold cannot be derived.');
  }

  return {
    method,
    anchorBasedThreshold,
    usableAnchors,
    distributionBasedEstimates,
    recommendedThreshold,
    responderDefinition,
    cautions,
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Anchor-based methods primary; distribution-based supportive; responder definition' },
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Meaningful within-patient change for fit-for-purpose COAs' },
      { source: 'ISPOR PRO Data Analysis good practices', detail: 'Interpreting meaningful change and responder thresholds' },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — assessCOAFitForPurpose
// ═════════════════════════════════════════════════════════════════════════════

export interface AssessCOAFitForPurposeParams {
  coaType: COAType;
  /** Concept of interest the COA targets. */
  conceptOfInterest: string;
  /** Population in the planned trial. */
  population: PopulationType;
  /** Was content validity established in THIS population/context of use? */
  contentValidityInContextOfUse?: boolean;
  /** Does the COA's measured concept match the concept of interest for the claim? */
  conceptMatchesClaim?: boolean;
  /** Intended endpoint position. */
  intendedEndpointPosition?: EndpointPosition;
  /** Is a meaningful within-patient change threshold defined? */
  meaningfulChangeDefined?: boolean;
  /** Is the recall period appropriate for the concept and treatment timing? */
  recallPeriodAppropriate?: boolean;
  /** Has the data-collection mode (paper/ePRO) been validated/equated? */
  modeOfAdministrationValidated?: boolean;
  /** Intended labeling claim text (optional context). */
  intendedClaim?: string;
}

export interface FitForPurposeCriterion {
  criterion: string;
  status: 'met' | 'partially_met' | 'not_met' | 'unknown';
  finding: string;
}

export interface AssessCOAFitForPurposeResult {
  coaType: COAType;
  fitForPurpose: 'fit' | 'conditionally_fit' | 'not_fit';
  criteria: FitForPurposeCriterion[];
  blockingIssues: string[];
  recommendations: string[];
  citations: CitationRef[];
}

/**
 * Fit-for-purpose assessment for a specific context of use (population,
 * endpoint positioning, treatment, and claim). "Fit-for-purpose" means the
 * level of validation is sufficient to support the specific use (FDA PFDD
 * Guidance 3, 2023). A COA validated in one context is not automatically fit
 * for another.
 */
export function assessCOAFitForPurpose(params: AssessCOAFitForPurposeParams): AssessCOAFitForPurposeResult {
  const criteria: FitForPurposeCriterion[] = [];
  const blockingIssues: string[] = [];
  const recommendations: string[] = [];
  const pop = POPULATION_REPORTER_REGISTRY[params.population];

  // Reporter-type appropriateness for the population.
  const typeAppropriateForPop =
    pop.selfReportFeasible || params.coaType !== 'PRO';
  criteria.push({
    criterion: 'COA type appropriate for the population’s report capacity',
    status: typeAppropriateForPop ? 'met' : 'not_met',
    finding: typeAppropriateForPop
      ? `${params.coaType} is compatible with report capacity in ${pop.label}.`
      : `A PRO requires reliable self-report, which is limited in ${pop.label}; consider ObsRO/ClinRO/PerfO.`,
  });
  if (!typeAppropriateForPop) {
    blockingIssues.push(`A PRO is not fit-for-purpose in ${pop.label} due to limited self-report capacity.`);
    recommendations.push('Reconsider COA type (selectCOAType) given the population’s self-report capacity.');
  }

  // Content validity in the actual context of use.
  let cvStatus: FitForPurposeCriterion['status'];
  if (params.contentValidityInContextOfUse === true) cvStatus = 'met';
  else if (params.contentValidityInContextOfUse === false) cvStatus = 'not_met';
  else cvStatus = 'unknown';
  criteria.push({
    criterion: 'Content validity established in this context of use',
    status: cvStatus,
    finding:
      cvStatus === 'met'
        ? 'Content validity confirmed for this population and context of use.'
        : cvStatus === 'not_met'
          ? 'Content validity not established for this context of use.'
          : 'Content validity for this context of use is unknown.',
  });
  if (cvStatus === 'not_met') {
    blockingIssues.push('Content validity is not established for the specific context of use — fit-for-purpose cannot be claimed.');
    recommendations.push('Run concept elicitation + cognitive interviews in the actual target population (FDA PFDD Guidance 2–3).');
  } else if (cvStatus === 'unknown') {
    recommendations.push('Confirm and document content validity in the actual context of use before locking the endpoint.');
  }

  // Concept-to-claim alignment.
  let claimStatus: FitForPurposeCriterion['status'];
  if (params.conceptMatchesClaim === true) claimStatus = 'met';
  else if (params.conceptMatchesClaim === false) claimStatus = 'not_met';
  else claimStatus = 'unknown';
  criteria.push({
    criterion: 'Measured concept aligns with the intended claim',
    status: claimStatus,
    finding:
      claimStatus === 'met'
        ? 'The concept the COA measures supports the intended claim.'
        : claimStatus === 'not_met'
          ? 'The measured concept does not match the intended claim; the claim would overreach the evidence.'
          : 'Alignment between measured concept and intended claim not confirmed.',
  });
  if (claimStatus === 'not_met') {
    blockingIssues.push('The COA measures a concept that does not support the intended claim.');
    recommendations.push('Either align the claim language to the measured concept or select a COA matching the claim concept.');
  }

  // Meaningful within-patient change defined (needed for primary/key-secondary).
  const needsMeaningfulChange =
    params.intendedEndpointPosition === 'primary' || params.intendedEndpointPosition === 'key_secondary';
  let mcStatus: FitForPurposeCriterion['status'];
  if (params.meaningfulChangeDefined === true) mcStatus = 'met';
  else if (params.meaningfulChangeDefined === false) mcStatus = needsMeaningfulChange ? 'not_met' : 'partially_met';
  else mcStatus = 'unknown';
  criteria.push({
    criterion: 'Meaningful within-patient change threshold defined',
    status: mcStatus,
    finding:
      mcStatus === 'met'
        ? 'A responder threshold anchored to meaningful within-patient change is defined.'
        : 'A meaningful within-patient change threshold is not yet defined.',
  });
  if (needsMeaningfulChange && mcStatus !== 'met') {
    blockingIssues.push('A primary/key-secondary COA endpoint requires a pre-defined, anchor-based meaningful within-patient change threshold.');
    recommendations.push('Derive a meaningful change threshold via anchor-based methods (determineMeaningfulChange) before lock.');
  }

  // Recall period.
  let recallStatus: FitForPurposeCriterion['status'];
  if (params.recallPeriodAppropriate === true) recallStatus = 'met';
  else if (params.recallPeriodAppropriate === false) recallStatus = 'not_met';
  else recallStatus = 'unknown';
  criteria.push({
    criterion: 'Recall period appropriate for the concept and treatment timing',
    status: recallStatus,
    finding:
      recallStatus === 'met'
        ? 'Recall period is matched to the concept and the expected timing of treatment effect.'
        : 'Recall period appropriateness not confirmed; long recall risks recall bias for variable symptoms.',
  });
  if (recallStatus === 'not_met') {
    recommendations.push('Shorten/adjust the recall period to minimize recall bias and match the assessment schedule.');
  }

  // Mode of administration / measurement comparability.
  let modeStatus: FitForPurposeCriterion['status'];
  if (params.modeOfAdministrationValidated === true) modeStatus = 'met';
  else if (params.modeOfAdministrationValidated === false) modeStatus = 'not_met';
  else modeStatus = 'unknown';
  criteria.push({
    criterion: 'Data-collection mode validated / equated (e.g., paper-to-ePRO migration)',
    status: modeStatus,
    finding:
      modeStatus === 'met'
        ? 'Mode of administration validated or measurement equivalence demonstrated.'
        : 'Mode equivalence not confirmed; a migration (e.g., paper to ePRO) needs equivalence evidence.',
  });
  if (modeStatus === 'not_met') {
    recommendations.push('Demonstrate measurement equivalence for the data-collection mode (ISPOR ePRO/Mixed-Modes good practices).');
  }

  // ── Roll-up ───────────────────────────────────────────────────────────────
  let fitForPurpose: AssessCOAFitForPurposeResult['fitForPurpose'];
  if (blockingIssues.length > 0) {
    fitForPurpose = 'not_fit';
  } else if (criteria.some((c: FitForPurposeCriterion) => c.status === 'unknown' || c.status === 'partially_met' || c.status === 'not_met')) {
    fitForPurpose = 'conditionally_fit';
  } else {
    fitForPurpose = 'fit';
    recommendations.push('Document the fit-for-purpose rationale in a COA evidence dossier and confirm with the review division.');
  }

  if (params.intendedClaim) {
    recommendations.push(`Confirm the intended claim ("${params.intendedClaim}") is supported by the endpoint positioning and statistical plan.`);
  }

  return {
    coaType: params.coaType,
    fitForPurpose,
    criteria,
    blockingIssues,
    recommendations,
    citations: [
      { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Fit-for-purpose COA for a specific context of use' },
      { source: 'FDA PRO Guidance (2009)', detail: 'Context-of-use-specific validation and claim alignment' },
      { source: 'FDA PFDD Guidance 4 (draft 2023)', detail: 'Incorporating COAs into endpoints for decision-making' },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — positionCOAEndpoint
// ═════════════════════════════════════════════════════════════════════════════

export interface PositionCOAEndpointParams {
  coaType: COAType;
  /** Concept of interest. */
  conceptOfInterest: string;
  /** Is the concept central to how the patient feels, functions, or survives? */
  isCoreToFeelFunctionSurvive?: boolean;
  /** Is the COA fully validated and fit-for-purpose for this context of use? */
  fitForPurpose?: boolean;
  /** Is a meaningful within-patient change / responder definition pre-specified? */
  meaningfulChangeDefined?: boolean;
  /** Is the trial blinded? (Open-label weakens subjective endpoint interpretation.) */
  blinded?: boolean;
  /** Number of other primary/key-secondary endpoints already in the hierarchy. */
  otherKeyEndpointsCount?: number;
  /** Is a label claim the goal for this COA? */
  labelClaimSought?: boolean;
}

export interface PositionCOAEndpointResult {
  coaType: COAType;
  recommendedPosition: EndpointPosition;
  labelClaimFeasibility: 'feasible' | 'feasible_with_conditions' | 'not_feasible';
  multiplicityConsiderations: string[];
  rationale: string[];
  recommendations: string[];
  citations: CitationRef[];
}

/**
 * Position a COA-based endpoint (primary / key-secondary / secondary /
 * exploratory), judge label-claim feasibility, and surface multiplicity /
 * hierarchy considerations. Follows the FDA PRO Guidance (2009) labeling-claim
 * framework and PFDD Guidance 4 (draft 2023) on incorporating COAs into
 * endpoints, plus the FDA multiple-endpoints guidance principles.
 */
export function positionCOAEndpoint(params: PositionCOAEndpointParams): PositionCOAEndpointResult {
  const rationale: string[] = [];
  const recommendations: string[] = [];
  const multiplicityConsiderations: string[] = [];

  const core = params.isCoreToFeelFunctionSurvive === true;
  const fit = params.fitForPurpose === true;
  const mc = params.meaningfulChangeDefined === true;

  let recommendedPosition: EndpointPosition;

  if (!fit) {
    recommendedPosition = 'exploratory';
    rationale.push('The COA is not yet fit-for-purpose for this context of use, so it cannot anchor a confirmatory (primary/key-secondary) endpoint; position it as exploratory until validation is complete.');
    recommendations.push('Complete fit-for-purpose validation (content validity in context, meaningful change, mode equivalence) before elevating the endpoint.');
  } else if (core && mc) {
    recommendedPosition = 'primary';
    rationale.push('The concept is core to how patients feel/function (and may survive), the COA is fit-for-purpose, and a meaningful within-patient change/responder definition is pre-specified — supporting a primary endpoint.');
  } else if (core && !mc) {
    recommendedPosition = 'key_secondary';
    rationale.push('The concept is patient-central and the COA is fit-for-purpose, but a meaningful within-patient change threshold is not yet pre-specified; position as key-secondary pending the responder definition.');
    recommendations.push('Pre-specify a responder definition (determineMeaningfulChange) to support elevation to primary.');
  } else if (!core && mc) {
    recommendedPosition = 'key_secondary';
    rationale.push('The COA is fit-for-purpose with a defined responder threshold but the concept is supportive rather than the core efficacy concept; key-secondary placement supports an additional claim.');
  } else {
    recommendedPosition = 'secondary';
    rationale.push('The COA is fit-for-purpose but is a supportive concept without a pre-specified responder definition; position as secondary.');
  }

  // Blinding caution for subjective (PRO/ObsRO) endpoints.
  if ((params.coaType === 'PRO' || params.coaType === 'ObsRO') && params.blinded === false) {
    multiplicityConsiderations.push('Open-label design materially weakens interpretation of subjective PRO/ObsRO endpoints (knowledge of assignment can bias self/observer report); a confirmatory claim from an unblinded subjective endpoint is difficult to support.');
    if (recommendedPosition === 'primary') {
      recommendedPosition = 'key_secondary';
      rationale.push('Downgraded from primary to key-secondary because the trial is open-label and the endpoint is subjective.');
    }
    recommendations.push('Prefer a blinded design (or blinded outcome assessment) when a subjective COA endpoint is intended to support a claim.');
  }

  // Label-claim feasibility.
  let labelClaimFeasibility: PositionCOAEndpointResult['labelClaimFeasibility'];
  if (!params.labelClaimSought) {
    labelClaimFeasibility = 'not_feasible';
    rationale.push('No label claim is sought for this COA; it can still provide supportive/exploratory evidence.');
  } else if (!fit) {
    labelClaimFeasibility = 'not_feasible';
    rationale.push('A label claim requires a fit-for-purpose, adequately validated COA; this COA does not yet meet that bar.');
  } else if (recommendedPosition === 'primary' || recommendedPosition === 'key_secondary') {
    labelClaimFeasibility = mc ? 'feasible' : 'feasible_with_conditions';
    if (!mc) rationale.push('A label claim is feasible only once a pre-specified, anchor-based responder definition is in place.');
  } else {
    labelClaimFeasibility = 'feasible_with_conditions';
    rationale.push('A claim from a secondary endpoint is possible but typically requires inclusion in the controlled multiplicity hierarchy.');
  }

  // Multiplicity / hierarchy.
  if (params.labelClaimSought) {
    multiplicityConsiderations.push('Any COA endpoint intended to support a labeling claim must be included in the pre-specified statistical testing hierarchy with Type I error control (FDA Multiple Endpoints guidance).');
    const others = params.otherKeyEndpointsCount ?? 0;
    if (others > 0) {
      multiplicityConsiderations.push(`There ${others === 1 ? 'is' : 'are'} ${others} other key endpoint(s); place the COA endpoint explicitly in the hierarchy (e.g., gatekeeping/fixed-sequence) and define the alpha allocation.`);
    }
    multiplicityConsiderations.push('Pre-specify handling of missing data and intercurrent events for the COA endpoint under the ICH E9(R1) estimand framework.');
  }

  return {
    coaType: params.coaType,
    recommendedPosition,
    labelClaimFeasibility,
    multiplicityConsiderations,
    rationale,
    recommendations,
    citations: [
      { source: 'FDA PRO Guidance (2009)', detail: 'Labeling-claim framework for PRO endpoints' },
      { source: 'FDA PFDD Guidance 4 (draft 2023)', detail: 'Incorporating COAs into endpoints for regulatory decision-making' },
      { source: 'FDA Multiple Endpoints Guidance (2022)', detail: 'Multiplicity control and testing hierarchy' },
      { source: 'ICH E9(R1)', detail: 'Estimands and intercurrent events for COA endpoints' },
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 9 — planCOADevelopment
// ═════════════════════════════════════════════════════════════════════════════

export interface PlanCOADevelopmentParams {
  /** Concept of interest. */
  conceptOfInterest: string;
  /** COA type intended (from selectCOAType). */
  coaType: COAType;
  /** Population / context of use. */
  population: PopulationType;
  /** Does a candidate existing instrument exist? */
  existingInstrumentAvailable?: boolean;
  /** If existing, does it have documented content validity in this population? */
  existingHasContentValidityInPopulation?: boolean;
  /** Will the instrument be modified (items/recall/mode) from its validated form? */
  modificationPlanned?: boolean;
  /** Intended endpoint position (drives rigor + FDA engagement). */
  intendedEndpointPosition?: EndpointPosition;
  /** Is FDA COA qualification or label claim the goal? */
  seekingQualificationOrClaim?: boolean;
}

export interface COADevelopmentStep {
  phase: string;
  step: string;
  activities: string[];
  estimatedDurationMonths: number;
  fdaEngagement?: string;
  citations: CitationRef[];
}

export interface PlanCOADevelopmentResult {
  conceptOfInterest: string;
  coaType: COAType;
  strategy: 'select_existing' | 'modify_existing' | 'develop_de_novo';
  steps: COADevelopmentStep[];
  totalEstimatedDurationMonths: number;
  fdaEngagementPlan: string[];
  keyRisks: string[];
  citations: CitationRef[];
}

/**
 * Produce a COA development/selection roadmap (concept elicitation, instrument
 * selection vs de novo, cognitive interviews, psychometric validation, FDA
 * engagement) with an estimated timeline. Deterministic: branches only on the
 * provided flags. Timelines are planning estimates, not commitments.
 */
export function planCOADevelopment(params: PlanCOADevelopmentParams): PlanCOADevelopmentResult {
  const steps: COADevelopmentStep[] = [];
  const fdaEngagementPlan: string[] = [];
  const keyRisks: string[] = [];

  // Determine strategy.
  let strategy: PlanCOADevelopmentResult['strategy'];
  if (params.existingInstrumentAvailable && params.existingHasContentValidityInPopulation && !params.modificationPlanned) {
    strategy = 'select_existing';
  } else if (params.existingInstrumentAvailable && params.modificationPlanned) {
    strategy = 'modify_existing';
  } else if (params.existingInstrumentAvailable && params.existingHasContentValidityInPopulation === false) {
    strategy = 'modify_existing';
  } else {
    strategy = 'develop_de_novo';
  }

  const pfdd1: CitationRef = { source: 'FDA PFDD Guidance 1 (2020)', detail: 'Collecting comprehensive and representative patient input' };
  const pfdd2: CitationRef = { source: 'FDA PFDD Guidance 2 (2022)', detail: 'Methods to identify what is important to patients' };
  const pfdd3: CitationRef = { source: 'FDA PFDD Guidance 3 (2023)', detail: 'Selecting, developing, or modifying fit-for-purpose COAs' };
  const pfdd4: CitationRef = { source: 'FDA PFDD Guidance 4 (draft 2023)', detail: 'Incorporating COAs into endpoints' };
  const proGuidance: CitationRef = { source: 'FDA PRO Guidance (2009)', detail: 'Content validity, measurement properties, labeling claims' };
  const ispCV: CitationRef = { source: 'ISPOR Content Validity Task Force (2011)', detail: 'Concept elicitation and cognitive interviews' };

  // ── Phase 1 — Define context of use + conceptual framework ────────────────
  steps.push({
    phase: 'Phase 1 — Concept & Context of Use',
    step: 'Define the concept of interest and context of use; draft the conceptual framework',
    activities: [
      `Specify the concept of interest ("${params.conceptOfInterest}") and the context of use (population, disease, treatment, endpoint role).`,
      'Review existing literature and instruments for the concept.',
      'Draft a conceptual/disease model linking the concept to how patients feel or function.',
    ],
    estimatedDurationMonths: 3,
    fdaEngagement: params.seekingQualificationOrClaim ? 'Optional early advice (e.g., Critical Path Innovation Meeting) to align on the concept and context of use.' : undefined,
    citations: [pfdd1, pfdd3],
  });

  // ── Phase 2 — Concept elicitation (patient input) ─────────────────────────
  steps.push({
    phase: 'Phase 2 — Concept Elicitation',
    step: 'Qualitative concept elicitation with target patients',
    activities: [
      'Conduct qualitative interviews/focus groups with patients from the target population.',
      'Code transcripts and demonstrate concept saturation.',
      'Confirm which concepts are most important and relevant to patients.',
    ],
    estimatedDurationMonths: 5,
    citations: [pfdd2, ispCV],
  });

  // ── Phase 3 — Instrument selection vs de novo development / modification ───
  if (strategy === 'select_existing') {
    steps.push({
      phase: 'Phase 3 — Instrument Selection',
      step: 'Confirm an existing instrument is fit-for-purpose',
      activities: [
        'Map the existing instrument’s items to the conceptual framework.',
        'Verify documented content validity and measurement properties in this population.',
        'Confirm licensing, translations, and scoring documentation.',
      ],
      estimatedDurationMonths: 2,
      citations: [pfdd3, proGuidance],
    });
  } else if (strategy === 'modify_existing') {
    steps.push({
      phase: 'Phase 3 — Instrument Modification',
      step: 'Modify an existing instrument and re-establish content validity',
      activities: [
        'Define and justify modifications (items, recall period, response options, mode).',
        'Re-run cognitive interviews to confirm comprehension of modified content.',
        'Plan psychometric re-validation appropriate to the extent of modification.',
      ],
      estimatedDurationMonths: 6,
      fdaEngagement: 'Discuss whether modifications require full re-validation (modification can break prior validity).',
      citations: [pfdd3, proGuidance, ispCV],
    });
    keyRisks.push('Modifying a validated instrument can invalidate prior measurement evidence; budget for re-validation.');
  } else {
    steps.push({
      phase: 'Phase 3 — De Novo Development',
      step: 'Draft new items and response scales from elicited concepts',
      activities: [
        'Generate a draft item pool mapped one-to-one to elicited concepts.',
        'Define response options, recall period, and scoring approach.',
        'Plan translatability assessment if multinational use is intended.',
      ],
      estimatedDurationMonths: 5,
      citations: [pfdd3, ispCV],
    });
  }

  // ── Phase 4 — Cognitive interviews ────────────────────────────────────────
  steps.push({
    phase: 'Phase 4 — Cognitive Interviews',
    step: 'Cognitive debriefing to confirm content validity',
    activities: [
      'Conduct cognitive interviews (typically multiple rounds) in the target population.',
      'Confirm items, instructions, recall period, and response options are understood as intended.',
      'Finalize the instrument and lock the conceptual framework.',
    ],
    estimatedDurationMonths: 4,
    citations: [ispCV, proGuidance],
  });

  // ── Phase 5 — Psychometric validation ─────────────────────────────────────
  steps.push({
    phase: 'Phase 5 — Psychometric Validation',
    step: 'Quantitative psychometric evaluation',
    activities: [
      'Assess reliability (test-retest ICC; internal consistency for multi-item; inter-rater for ClinRO/PerfO).',
      'Assess construct validity (convergent/divergent, known-groups) against pre-specified hypotheses.',
      'Assess ability to detect change and derive meaningful within-patient change / responder thresholds (anchor-based primary).',
      'Document scoring algorithm and missing-data handling.',
    ],
    estimatedDurationMonths: 9,
    fdaEngagement: params.seekingQualificationOrClaim ? 'Submit a qualification package or seek Type C / clinical-outcome-assessment advice on the validation plan.' : undefined,
    citations: [proGuidance, pfdd3],
  });

  // ── Phase 6 — Endpoint integration + FDA engagement ───────────────────────
  steps.push({
    phase: 'Phase 6 — Endpoint Integration & FDA Engagement',
    step: 'Position the endpoint and align with FDA',
    activities: [
      'Position the COA in the endpoint hierarchy and define the responder/analysis (estimand) strategy.',
      'Pre-specify multiplicity control if a label claim is sought.',
      'Engage the review division (e.g., Type B/C meeting) to align on the COA, endpoint, and claim.',
    ],
    estimatedDurationMonths: 3,
    fdaEngagement: 'Confirm endpoint acceptability and claim language with the review division before pivotal trial lock.',
    citations: [pfdd4, proGuidance],
  });

  // ── FDA engagement plan summary ───────────────────────────────────────────
  if (params.seekingQualificationOrClaim) {
    fdaEngagementPlan.push('Consider the FDA COA Qualification Program if the COA will be used across multiple programs.');
    fdaEngagementPlan.push('Seek early FDA input on the concept of interest and context of use (e.g., Critical Path Innovation Meeting).');
    fdaEngagementPlan.push('Request a Type C / outcome-assessment meeting on the validation and meaningful-change plan.');
    fdaEngagementPlan.push('Confirm endpoint positioning, estimand, multiplicity, and claim language at a pre-pivotal meeting.');
  } else {
    fdaEngagementPlan.push('FDA engagement optional but recommended if the COA may later support a labeling claim.');
  }

  if (params.intendedEndpointPosition === 'primary' || params.intendedEndpointPosition === 'key_secondary') {
    keyRisks.push('A confirmatory COA endpoint requires a locked, fit-for-purpose instrument and pre-specified responder definition before the pivotal trial.');
  }
  if (POPULATION_REPORTER_REGISTRY[params.population].selfReportFeasible === false && params.coaType === 'PRO') {
    keyRisks.push(`The intended PRO may not be feasible in ${POPULATION_REPORTER_REGISTRY[params.population].label}; reconfirm reporter and COA type.`);
  }
  keyRisks.push('Translation/linguistic validation and ePRO migration add time; plan equivalence evidence early.');

  const totalEstimatedDurationMonths = steps.reduce(
    (acc: number, s: COADevelopmentStep) => acc + s.estimatedDurationMonths,
    0,
  );

  return {
    conceptOfInterest: params.conceptOfInterest,
    coaType: params.coaType,
    strategy,
    steps,
    totalEstimatedDurationMonths,
    fdaEngagementPlan,
    keyRisks,
    citations: [
      pfdd1,
      pfdd2,
      pfdd3,
      pfdd4,
      proGuidance,
      { source: 'FDA COA Qualification Program', detail: 'Qualification of COAs as drug development tools' },
    ],
  };
}
