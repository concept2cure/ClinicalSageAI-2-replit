/**
 * Clinical Evaluation Report (CER) structure — the MEDDEV 2.7/1 Rev 4 process
 * STAGES and the canonical CER report SECTION model (MDR Annex XIV Part A), with
 * per-section reviewer questions and a deterministic completeness assessment.
 *
 * WHY THIS EXISTS (audit gap): the platform stores a CER as a generic document
 * (cerReports / cerSections) with no enforced regulatory structure — a Notified
 * Body would reject it on technical completeness. This module supplies the missing
 * regulated structure: the five MEDDEV stages (the clinical-evaluation PROCESS) and
 * the CER report sections (the DOCUMENT), each section flagged for whether it needs
 * clinical data / evaluator qualification / equivalence and carrying the questions
 * an NB reviewer actually asks. `assessCerStructure` reports readiness + gaps.
 *
 * HONESTY: the stages/sections reflect MEDDEV 2.7/1 Rev 4 and MDR (2017/745)
 * Annex XIV Part A. This is the regulated structure + reviewer questions, NOT the
 * NB's review decision and not drafted CER content — authors fill the evidence.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/cer-structure
 */

export interface CerStage {
  stage: number;
  id: string;
  title: string;
  purpose: string;
  /** The concrete output that closes this stage. */
  output: string;
}

/** The five MEDDEV 2.7/1 Rev 4 clinical-evaluation stages (the PROCESS). */
export const CER_STAGES: CerStage[] = [
  {
    stage: 0,
    id: 'scope_plan',
    title: 'Stage 0 — Scope and Clinical Evaluation Plan (CEP)',
    purpose: 'Define the scope of the clinical evaluation and plan it: intended purpose, target groups, indications, claims, equivalence approach, and the methods/criteria to be used.',
    output: 'Clinical Evaluation Plan (CEP)',
  },
  {
    stage: 1,
    id: 'identify',
    title: 'Stage 1 — Identification of Pertinent Data',
    purpose: 'Identify all pertinent data: data generated/held by the manufacturer (clinical investigations, PMS/PMCF, complaints) and data from the scientific literature (device and equivalent/similar devices, and the state of the art).',
    output: 'Literature search protocol + identified data sets',
  },
  {
    stage: 2,
    id: 'appraise',
    title: 'Stage 2 — Appraisal of Pertinent Data',
    purpose: 'Appraise each data set for methodological quality (scientific validity), relevance to the device and intended purpose, and the weighting/contribution it makes to demonstrating conformity.',
    output: 'Appraisal of each data set against predefined criteria',
  },
  {
    stage: 3,
    id: 'analyse',
    title: 'Stage 3 — Analysis of the Clinical Data',
    purpose: 'Analyse the appraised data as a whole: demonstrate conformity with the relevant GSPR (safety, performance, acceptable benefit-risk, acceptable side-effects), substantiate the claims, and compare against the current state of the art.',
    output: 'Demonstration of conformity, benefit-risk, and residual-risk acceptability',
  },
  {
    stage: 4,
    id: 'report',
    title: 'Stage 4 — Finalisation of the Clinical Evaluation Report (CER)',
    purpose: 'Document the clinical evaluation: the CER summarising the CEP, the data identified/appraised/analysed, the conclusions, the qualification of the evaluators, and the date of the next evaluation.',
    output: 'Clinical Evaluation Report (CER)',
  },
];

export interface CerSection {
  id: string;
  number: string;
  title: string;
  purpose: string;
  required: boolean;
  /** True when the section must be substantiated by clinical data (not just narrative). */
  requiresClinicalData: boolean;
  /** True only when equivalence to another device is claimed. */
  equivalenceOnly?: boolean;
  /** The questions an NB clinical reviewer asks of this section. */
  reviewerQuestions: string[];
}

/** The canonical CER report sections (MDR Annex XIV Part A; MEDDEV 2.7/1 Rev 4). */
export const CER_SECTIONS: CerSection[] = [
  {
    id: 'summary',
    number: '1',
    title: 'Summary',
    purpose: 'Concise summary of the clinical evaluation: device, scope, evidence, and the benefit-risk conclusion.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Does the summary state a clear benefit-risk conclusion consistent with the body of the report?',
      'Is the intended purpose stated exactly as in the IFU and the CEP?',
    ],
  },
  {
    id: 'scope',
    number: '2',
    title: 'Scope of the Clinical Evaluation',
    purpose: 'Define the device, intended purpose, indications, target populations, claims, and the scope/limits of the evaluation (mirrors the CEP).',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Does the scope cover every indication and claim in the IFU?',
      'Are all clinical claims to be substantiated explicitly listed?',
    ],
  },
  {
    id: 'clinical_background',
    number: '3',
    title: 'Clinical Background, Current Knowledge, State of the Art',
    purpose: 'Describe the medical condition, alternative therapies/devices, and the current state of the art against which the device is assessed.',
    required: true,
    requiresClinicalData: true,
    reviewerQuestions: [
      'Is the state of the art defined with a documented, reproducible literature methodology?',
      'Are accepted alternative treatments and their outcomes characterised for benchmarking?',
    ],
  },
  {
    id: 'device_description',
    number: '4',
    title: 'Device Under Evaluation',
    purpose: 'Describe the device, its technology, intended purpose, variants, and accessories; relate it to the device on the market.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Does the description match the technical documentation and the device actually marketed?',
      'Are all variants/sizes/configurations covered by the clinical evidence?',
    ],
  },
  {
    id: 'equivalence',
    number: '5',
    title: 'Equivalence (where claimed)',
    purpose: 'Demonstrate clinical, technical, and biological equivalence to the claimed equivalent device, and justify access to its data.',
    required: false,
    requiresClinicalData: true,
    equivalenceOnly: true,
    reviewerQuestions: [
      'Is equivalence demonstrated across ALL three characteristics (clinical, technical, biological) per MDCG 2020-5?',
      'Does the manufacturer have sufficient access to the equivalent device’s technical documentation/data?',
      'Are any differences shown to have no significant clinical impact?',
    ],
  },
  {
    id: 'clinical_data',
    number: '6',
    title: 'Type, Generation and Sources of Clinical Data',
    purpose: 'Identify the clinical data used: manufacturer-held (clinical investigations, PMS/PMCF, complaints) and literature (device, equivalent/similar devices).',
    required: true,
    requiresClinicalData: true,
    reviewerQuestions: [
      'Is the literature search protocol pre-specified, reproducible, and free of selection bias?',
      'Is PMS/PMCF data included and reconciled with the clinical evidence?',
      'Is the totality of pertinent data identified — both favourable and unfavourable?',
    ],
  },
  {
    id: 'appraisal',
    number: '7',
    title: 'Appraisal of the Clinical Data',
    purpose: 'Appraise each data set for scientific validity, relevance, and weighting using predefined criteria.',
    required: true,
    requiresClinicalData: true,
    reviewerQuestions: [
      'Were predefined appraisal criteria applied consistently to every data set?',
      'Is the methodological quality (and its limitations) of each study characterised?',
    ],
  },
  {
    id: 'analysis',
    number: '8',
    title: 'Analysis of the Clinical Data',
    purpose: 'Analyse the data as a whole to demonstrate conformity with the relevant GSPR, the benefit-risk profile, acceptable side-effects, and substantiation of claims against the state of the art.',
    required: true,
    requiresClinicalData: true,
    reviewerQuestions: [
      'Is conformity with each relevant GSPR (safety, performance, benefit-risk) demonstrated by the data?',
      'Are all residual risks acceptable when weighed against the benefits and the state of the art?',
      'Is every clinical claim substantiated by the analysed data?',
      'Is there sufficient clinical evidence, or are PMCF/clinical-investigation gaps identified?',
    ],
  },
  {
    id: 'pmcf',
    number: '9',
    title: 'Post-Market Clinical Follow-up (PMCF) Considerations',
    purpose: 'Identify residual risks/uncertainties to be addressed by PMCF, and how the CER will be updated.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Does the PMCF plan address the clinical evidence gaps and residual uncertainties identified in the analysis?',
      'Is a justified frequency for updating the clinical evaluation defined?',
    ],
  },
  {
    id: 'conclusions',
    number: '10',
    title: 'Conclusions',
    purpose: 'State the conclusions of the clinical evaluation, including the benefit-risk determination and conformity with the relevant GSPR.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Do the conclusions follow logically from the analysis (no unsupported leaps)?',
      'Is the benefit-risk conclusion explicit and consistent with the IFU claims?',
    ],
  },
  {
    id: 'evaluator_qualification',
    number: '11',
    title: 'Qualification of the Evaluators',
    purpose: 'Document the qualifications (CVs) and declarations of interest of those who performed the clinical evaluation.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Do the evaluators have documented expertise in the device technology, its application, and clinical-data appraisal?',
      'Are declarations of interest provided?',
    ],
  },
  {
    id: 'references',
    number: '12',
    title: 'References and Appendices',
    purpose: 'List all references and attach the literature search protocol/report, appraisal records, and full-text articles.',
    required: true,
    requiresClinicalData: false,
    reviewerQuestions: [
      'Are the literature search protocol and results attached and traceable to the appraisal?',
      'Are full texts (not only abstracts) available for the pivotal references?',
    ],
  },
];

// ── Lookups + assessment (pure) ───────────────────────────────────────────────

const SECTION_BY_ID = new Map(CER_SECTIONS.map((s) => [s.id, s]));

export function getCerSection(id: string): CerSection | undefined {
  return SECTION_BY_ID.get(id);
}

export function cerSectionIds(): string[] {
  return CER_SECTIONS.map((s) => s.id);
}

/** Every reviewer question across the CER, flattened (for an oversight checklist). */
export function cerReviewerQuestions(): Array<{ sectionId: string; question: string }> {
  return CER_SECTIONS.flatMap((s) => s.reviewerQuestions.map((q) => ({ sectionId: s.id, question: q })));
}

export interface CerAssessment {
  ready: boolean;
  missingRequiredSections: string[];
  /** Required sections present but flagged as needing clinical-data substantiation. */
  sectionsNeedingClinicalData: string[];
  presentCount: number;
  totalRequired: number;
  /** True when equivalence is claimed and the equivalence section is present. */
  equivalenceAddressed: boolean;
}

/**
 * Assess a CER against the canonical structure. The equivalence section is required
 * only when `equivalenceClaimed` is true. A section "needs clinical data" is
 * surfaced (not a blocker) so the author/reviewer can confirm substantiation.
 */
export function assessCerStructure(
  presentSectionIds: string[],
  opts: { equivalenceClaimed?: boolean } = {}
): CerAssessment {
  const present = new Set(presentSectionIds);

  const required = CER_SECTIONS.filter((s) => {
    if (s.equivalenceOnly) return opts.equivalenceClaimed === true;
    return s.required;
  });

  const missingRequiredSections = required.filter((s) => !present.has(s.id)).map((s) => s.id);
  const sectionsNeedingClinicalData = required
    .filter((s) => s.requiresClinicalData && present.has(s.id))
    .map((s) => s.id);

  return {
    ready: missingRequiredSections.length === 0,
    missingRequiredSections,
    sectionsNeedingClinicalData,
    presentCount: required.length - missingRequiredSections.length,
    totalRequired: required.length,
    equivalenceAddressed: opts.equivalenceClaimed === true ? present.has('equivalence') : true,
  };
}

export default {
  CER_STAGES,
  CER_SECTIONS,
  getCerSection,
  cerSectionIds,
  cerReviewerQuestions,
  assessCerStructure,
};
