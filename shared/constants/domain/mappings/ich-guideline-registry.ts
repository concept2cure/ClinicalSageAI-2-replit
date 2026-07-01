/**
 * ICH guideline registry — maps each guideline to description, flows, and applicability.
 * @module shared/constants/domain/mappings/ich-guideline-registry
 */

export interface IchGuideline {
  id: string;
  designation: string;
  title: string;
  category: 'quality' | 'efficacy' | 'safety' | 'multidisciplinary';
  /** Current version/revision. */
  version: string;
  /** Which flows reference this guideline. */
  relevantFlows: string[];
  /** Which product classes this applies to. */
  applicableProducts: string[];
  /** One-sentence summary. */
  summary: string;
}

export const ICH_GUIDELINES: IchGuideline[] = [
  // Quality (Q)
  { id: 'q1a', designation: 'ICH Q1A(R2)', title: 'Stability Testing of New Drug Substances and Products', category: 'quality', version: 'R2 (2003)', relevantFlows: ['cmc_specification', 'stability_study', 'ind_submission', 'nda_submission'], applicableProducts: ['small_molecule'], summary: 'Defines stability study design, storage conditions, and testing intervals for drug substances and drug products.' },
  { id: 'q1b', designation: 'ICH Q1B', title: 'Photostability Testing', category: 'quality', version: '1996', relevantFlows: ['stability_study', 'cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Establishes confirmatory and stress photostability testing requirements.' },
  { id: 'q1e', designation: 'ICH Q1E', title: 'Evaluation of Stability Data', category: 'quality', version: '2003', relevantFlows: ['stability_study'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Statistical approaches for shelf-life estimation from stability data.' },
  { id: 'q2', designation: 'ICH Q2(R2)', title: 'Validation of Analytical Procedures', category: 'quality', version: 'R2 (2023)', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Describes validation characteristics (accuracy, precision, specificity, linearity, range, robustness) for analytical methods.' },
  { id: 'q3a', designation: 'ICH Q3A(R2)', title: 'Impurities in New Drug Substances', category: 'quality', version: 'R2 (2006)', relevantFlows: ['cmc_specification', 'nda_submission'], applicableProducts: ['small_molecule'], summary: 'Reporting, identification, and qualification thresholds for impurities in drug substances.' },
  { id: 'q3b', designation: 'ICH Q3B(R2)', title: 'Impurities in New Drug Products', category: 'quality', version: 'R2 (2006)', relevantFlows: ['cmc_specification', 'nda_submission'], applicableProducts: ['small_molecule'], summary: 'Degradation product reporting, identification, and qualification thresholds.' },
  { id: 'q3c', designation: 'ICH Q3C(R8)', title: 'Residual Solvents', category: 'quality', version: 'R8 (2021)', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Classification of solvents and limits for residuals in pharmaceuticals.' },
  { id: 'q3d', designation: 'ICH Q3D(R2)', title: 'Elemental Impurities', category: 'quality', version: 'R2 (2022)', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'PDEs and risk assessment for elemental impurities from all sources.' },
  { id: 'q5a', designation: 'ICH Q5A(R2)', title: 'Viral Safety Evaluation of Biotechnology Products', category: 'quality', version: 'R2 (2024)', relevantFlows: ['bla_submission', 'cmc_specification', 'ind_submission'], applicableProducts: ['biologic', 'vaccine', 'biosimilar'], summary: 'Viral clearance/inactivation validation and adventitious agent testing for biologics.' },
  { id: 'q5c', designation: 'ICH Q5C', title: 'Stability of Biotechnological/Biological Products', category: 'quality', version: '1995', relevantFlows: ['stability_study', 'bla_submission'], applicableProducts: ['biologic', 'vaccine', 'biosimilar'], summary: 'Stability study design specific to biologics — potency, degradation, real-time testing emphasis.' },
  { id: 'q5e', designation: 'ICH Q5E', title: 'Comparability of Biotechnological/Biological Products', category: 'quality', version: '2004', relevantFlows: ['bla_submission', 'cmc_specification'], applicableProducts: ['biologic', 'biosimilar'], summary: 'Comparability studies for manufacturing changes affecting biologics quality, safety, or efficacy.' },
  { id: 'q6a', designation: 'ICH Q6A', title: 'Specifications: Test Procedures and Acceptance Criteria for New Drug Substances and Products', category: 'quality', version: '1999', relevantFlows: ['cmc_specification', 'nda_submission'], applicableProducts: ['small_molecule'], summary: 'Setting specifications for chemical drug substances and products.' },
  { id: 'q6b', designation: 'ICH Q6B', title: 'Specifications: Test Procedures for Biotechnological/Biological Products', category: 'quality', version: '1999', relevantFlows: ['cmc_specification', 'bla_submission'], applicableProducts: ['biologic', 'vaccine', 'biosimilar'], summary: 'Setting specifications for biologics including potency, purity, identity.' },
  { id: 'q8', designation: 'ICH Q8(R2)', title: 'Pharmaceutical Development', category: 'quality', version: 'R2 (2009)', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Quality by Design (QbD) approach; design space, CQAs, CPPs.' },
  { id: 'q9', designation: 'ICH Q9(R1)', title: 'Quality Risk Management', category: 'quality', version: 'R1 (2023)', relevantFlows: ['risk_management', 'cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Risk assessment, control, review, and communication for pharmaceutical quality.' },
  { id: 'q11', designation: 'ICH Q11', title: 'Development and Manufacture of Drug Substances', category: 'quality', version: '2012', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Drug substance manufacturing process development, CQAs, and control strategy.' },
  { id: 'q12', designation: 'ICH Q12', title: 'Technical and Regulatory Considerations for Pharmaceutical Product Lifecycle Management', category: 'quality', version: '2020', relevantFlows: ['cmc_specification'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Post-approval CMC change management framework; established conditions.' },
  // Efficacy (E)
  { id: 'e3', designation: 'ICH E3', title: 'Structure and Content of Clinical Study Reports', category: 'efficacy', version: '1995', relevantFlows: ['csr_report'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Defines the structure and content of clinical study reports for regulatory submissions.' },
  { id: 'e6', designation: 'ICH E6(R3)', title: 'Good Clinical Practice', category: 'efficacy', version: 'R3 (2023)', relevantFlows: ['protocol_development', 'sop_development'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Unified standard for designing, conducting, recording, and reporting clinical trials.' },
  { id: 'e8', designation: 'ICH E8(R1)', title: 'General Considerations for Clinical Studies', category: 'efficacy', version: 'R1 (2021)', relevantFlows: ['protocol_development'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Overall framework for clinical development strategy and study design.' },
  { id: 'e9', designation: 'ICH E9(R1)', title: 'Statistical Principles for Clinical Trials', category: 'efficacy', version: 'R1 (2019, Estimands)', relevantFlows: ['protocol_development', 'csr_report'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Statistical design, analysis, and reporting; R1 addendum introduces estimands framework.' },
  { id: 'e10', designation: 'ICH E10', title: 'Choice of Control Group', category: 'efficacy', version: '2000', relevantFlows: ['protocol_development'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Guidance on selecting appropriate control groups for clinical trials.' },
  // Safety (S)
  { id: 's6', designation: 'ICH S6(R1)', title: 'Preclinical Safety Evaluation of Biotechnology-Derived Pharmaceuticals', category: 'safety', version: 'R1 (2011)', relevantFlows: ['ind_submission', 'bla_submission'], applicableProducts: ['biologic'], summary: 'Nonclinical safety testing requirements specific to biotechnology-derived products.' },
  { id: 's9', designation: 'ICH S9', title: 'Nonclinical Evaluation for Anticancer Pharmaceuticals', category: 'safety', version: '2009', relevantFlows: ['ind_submission'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Modified nonclinical requirements for anticancer pharmaceuticals — shortened timelines justified by serious disease.' },
  // Multidisciplinary (M)
  { id: 'm3', designation: 'ICH M3(R2)', title: 'Nonclinical Safety Studies for Conduct of Human Clinical Trials', category: 'multidisciplinary', version: 'R2 (2009)', relevantFlows: ['ind_submission'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Timing and scope of nonclinical studies to support clinical development milestones.' },
  { id: 'm4', designation: 'ICH M4', title: 'The Common Technical Document (CTD)', category: 'multidisciplinary', version: '2004', relevantFlows: ['nda_submission', 'bla_submission'], applicableProducts: ['small_molecule', 'biologic'], summary: 'Harmonized format for Module 1-5 of regulatory submissions.' },
  { id: 'm7', designation: 'ICH M7(R2)', title: 'Assessment and Control of DNA Reactive (Mutagenic) Impurities', category: 'multidisciplinary', version: 'R2 (2023)', relevantFlows: ['cmc_specification', 'nda_submission'], applicableProducts: ['small_molecule'], summary: 'Risk assessment, TTC-based limits, and control strategies for mutagenic impurities.' },
];

export function getGuideline(id: string): IchGuideline | undefined {
  return ICH_GUIDELINES.find(g => g.id === id);
}

export function getGuidelinesForFlow(flowId: string): IchGuideline[] {
  return ICH_GUIDELINES.filter(g => g.relevantFlows.includes(flowId));
}

export function getGuidelinesForProduct(productClass: string): IchGuideline[] {
  return ICH_GUIDELINES.filter(g => g.applicableProducts.includes(productClass));
}

export function getGuidelinesByCategory(category: IchGuideline['category']): IchGuideline[] {
  return ICH_GUIDELINES.filter(g => g.category === category);
}
