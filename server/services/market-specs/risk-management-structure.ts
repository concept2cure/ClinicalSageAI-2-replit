/**
 * Risk management file structure (ISO 14971:2019) — the risk-management process
 * sections, with reviewer questions and a deterministic completeness assessment.
 *
 * WHY THIS EXISTS (audit gap): risk management (MDR Annex II §5; an FDA 510(k)/PMA
 * expectation) was referenced but never structured. This models the ISO 14971
 * Risk Management File (RMF): plan → analysis → evaluation → control → overall
 * residual risk → review → report → production/post-production, each with the
 * questions an assessor asks.
 *
 * HONESTY: reflects the ISO 14971:2019 process structure. It is the regulated
 * structure + reviewer questions, NOT the risk assessment itself and not the
 * assessor's decision — the manufacturer performs the analysis.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/risk-management-structure
 */

export interface RmfSection {
  id: string;
  number: string;
  title: string;
  purpose: string;
  required: boolean;
  reviewerQuestions: string[];
}

/** The ISO 14971:2019 risk-management-file sections. */
export const RMF_SECTIONS: RmfSection[] = [
  {
    id: 'plan',
    number: '1',
    title: 'Risk Management Plan',
    purpose: 'Define the scope, responsibilities, the criteria for risk acceptability, verification activities, and the method for collecting/reviewing production and post-production information.',
    required: true,
    reviewerQuestions: [
      'Are the risk-acceptability criteria defined BEFORE the analysis (not reverse-engineered from the results)?',
      'Does the plan assign responsibilities and cover the full device lifecycle?',
    ],
  },
  {
    id: 'analysis',
    number: '2',
    title: 'Risk Analysis',
    purpose: 'Document the intended use and reasonably foreseeable misuse, identify safety-related characteristics, identify hazards and hazardous situations, and estimate the associated risk(s).',
    required: true,
    reviewerQuestions: [
      'Is reasonably foreseeable MISUSE analysed, not just intended use?',
      'Are hazards traced to hazardous situations and to harm (sequence of events), with severity and probability estimated?',
      'Are use-related hazards (use error) included (linking to IEC 62366-1)?',
    ],
  },
  {
    id: 'evaluation',
    number: '3',
    title: 'Risk Evaluation',
    purpose: 'Evaluate each estimated risk against the acceptability criteria from the plan.',
    required: true,
    reviewerQuestions: [
      'Is every estimated risk evaluated against the pre-defined acceptability criteria?',
    ],
  },
  {
    id: 'control',
    number: '4',
    title: 'Risk Control',
    purpose: 'Analyse and implement control options (in priority: inherently safe design → protective measures → information for safety), evaluate residual risk, and check for risks introduced by the controls themselves.',
    required: true,
    reviewerQuestions: [
      'Are control options applied in the ISO 14971 priority order (design first, information for safety last)?',
      'Is residual risk re-evaluated after each control, and are any NEW risks introduced by the controls assessed?',
      'Is the effectiveness of each risk-control measure verified?',
    ],
  },
  {
    id: 'overall_residual_risk',
    number: '5',
    title: 'Evaluation of Overall Residual Risk',
    purpose: 'Evaluate the overall residual risk against the acceptability criteria and the benefits, and ensure significant residual risks are disclosed.',
    required: true,
    reviewerQuestions: [
      'Is the OVERALL residual risk (not just individual risks) judged acceptable against the benefits?',
      'Are significant residual risks disclosed in the accompanying information (IFU)?',
    ],
  },
  {
    id: 'review',
    number: '6',
    title: 'Risk Management Review',
    purpose: 'Review, before release, that the risk management plan was executed and the risk management file is appropriate.',
    required: true,
    reviewerQuestions: [
      'Was a pre-release review performed confirming the plan was implemented and the RMF is complete?',
    ],
  },
  {
    id: 'report',
    number: '7',
    title: 'Risk Management Report',
    purpose: 'Summarise the results of the risk management process and the conclusion on overall residual risk acceptability.',
    required: true,
    reviewerQuestions: [
      'Does the report conclude on overall residual-risk acceptability and reference the supporting RMF records?',
    ],
  },
  {
    id: 'post_production',
    number: '8',
    title: 'Production and Post-Production Activities',
    purpose: 'Define the system to collect and review production and post-production information and to feed it back into the risk management process.',
    required: true,
    reviewerQuestions: [
      'Is there a defined system to feed production/post-production (complaints, PMS/PMCF) data back into the risk analysis?',
      'Are triggers defined for revisiting risk acceptability when new information arrives?',
    ],
  },
];

const SECTION_BY_ID = new Map(RMF_SECTIONS.map((s) => [s.id, s]));

export function getRmfSection(id: string): RmfSection | undefined {
  return SECTION_BY_ID.get(id);
}

export function rmfSectionIds(): string[] {
  return RMF_SECTIONS.map((s) => s.id);
}

export function rmfReviewerQuestions(): Array<{ sectionId: string; question: string }> {
  return RMF_SECTIONS.flatMap((s) => s.reviewerQuestions.map((q) => ({ sectionId: s.id, question: q })));
}

export interface RmfAssessment {
  ready: boolean;
  missingRequiredSections: string[];
  presentCount: number;
  totalRequired: number;
}

export function assessRmfStructure(presentSectionIds: string[]): RmfAssessment {
  const present = new Set(presentSectionIds);
  const required = RMF_SECTIONS.filter((s) => s.required);
  const missingRequiredSections = required.filter((s) => !present.has(s.id)).map((s) => s.id);
  return {
    ready: missingRequiredSections.length === 0,
    missingRequiredSections,
    presentCount: required.length - missingRequiredSections.length,
    totalRequired: required.length,
  };
}

export default { RMF_SECTIONS, getRmfSection, rmfSectionIds, rmfReviewerQuestions, assessRmfStructure };
