/**
 * US IND Blueprint — Uses the existing deep IND eCTD section map as source of truth.
 *
 * This blueprint delegates to the adapter that reads from
 * services/regulatory/ind-ectd-sections.ts rather than duplicating definitions.
 *
 * For the full 108-section deep hierarchy, use getFullINDSectionsForBootstrap().
 * For the registry-compatible SectionBlueprint, use the adapted version.
 *
 * @module server/services/regulatory/registry/blueprints/usIndBlueprint
 */

import type { SectionBlueprint, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildUSIndBlueprint } from '../adapters/usIndFromExistingSections.js';

// ─── Task Blueprint ───────────────────────────────────────────────────────────

const IND_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_pre_ind',
    title: 'Pre-IND Preparation',
    description: 'Pre-IND meeting request and preparation',
    phase: 'pre_submission',
    order: 0,
    tasks: [
      { id: 't_pre_ind_meeting', title: 'Pre-IND Meeting Request', description: 'Prepare Type B meeting briefing document', assigneeRole: 'regulatory_lead', estimatedDays: 14 },
      { id: 't_pre_ind_questions', title: 'Define Questions for FDA', description: 'Draft targeted questions for FDA feedback', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_module_3',
    title: 'Module 3 — Quality/CMC',
    description: 'Chemistry, Manufacturing, and Controls documentation',
    phase: 'authoring',
    order: 1,
    tasks: [
      { id: 't_drug_substance', title: 'Drug Substance (3.2.S)', description: 'General info, manufacture, characterization, control, stability', assigneeRole: 'cmc_lead', estimatedDays: 30 },
      { id: 't_drug_product', title: 'Drug Product (3.2.P)', description: 'Description, composition, manufacture, control, stability', assigneeRole: 'cmc_lead', estimatedDays: 25 },
      { id: 't_quality_summary', title: 'Quality Overall Summary (2.3)', description: 'High-level quality summary per ICH M4Q', assigneeRole: 'cmc_lead', estimatedDays: 10, dependencies: ['t_drug_substance', 't_drug_product'] },
    ],
  },
  {
    id: 'ms_module_4',
    title: 'Module 4 — Nonclinical',
    description: 'Nonclinical pharmacology, PK, and toxicology reports',
    phase: 'authoring',
    order: 2,
    tasks: [
      { id: 't_pharmacology', title: 'Pharmacology Studies (4.2.1)', description: 'Primary/secondary pharmacodynamics, safety pharmacology', assigneeRole: 'nonclinical_lead', estimatedDays: 15 },
      { id: 't_pk_studies', title: 'Pharmacokinetic Studies (4.2.2)', description: 'ADME studies', assigneeRole: 'nonclinical_lead', estimatedDays: 10 },
      { id: 't_toxicology', title: 'Toxicology Studies (4.2.3)', description: 'Single/repeat dose, genotox, repro tox', assigneeRole: 'nonclinical_lead', estimatedDays: 20 },
      { id: 't_nonclinical_overview', title: 'Nonclinical Overview (2.4)', description: 'Integrated nonclinical assessment', assigneeRole: 'nonclinical_lead', estimatedDays: 7, dependencies: ['t_pharmacology', 't_pk_studies', 't_toxicology'] },
    ],
  },
  {
    id: 'ms_module_5',
    title: 'Module 5 — Clinical',
    description: 'Clinical protocol and any available clinical data',
    phase: 'authoring',
    order: 3,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Phase 1 clinical study protocol', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_investigator_brochure', title: 'Investigator Brochure', description: 'Comprehensive IB for investigators', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_clinical_overview', title: 'Clinical Overview (2.5)', description: 'High-level clinical assessment', assigneeRole: 'clinical_lead', estimatedDays: 7, dependencies: ['t_protocol'] },
    ],
  },
  {
    id: 'ms_module_1',
    title: 'Module 1 — Administrative',
    description: 'FDA forms, cover letter, commitments',
    phase: 'authoring',
    order: 4,
    tasks: [
      { id: 't_form_1571', title: 'Form FDA 1571', description: 'IND Application form', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
      { id: 't_form_1572', title: 'Form FDA 1572', description: 'Statement of Investigator', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
      { id: 't_cover_letter', title: 'Cover Letter', description: 'IND cover letter to FDA', assigneeRole: 'regulatory_lead', estimatedDays: 1 },
    ],
  },
  {
    id: 'ms_review',
    title: 'Internal Review',
    description: 'QC, compliance review, and sign-off',
    phase: 'review',
    order: 5,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Cross-section consistency and formatting check', assigneeRole: 'qa_lead', estimatedDays: 5 },
      { id: 't_compliance', title: 'Regulatory Compliance Check', description: '21 CFR 312 compliance validation', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_medical_review', title: 'Medical/Scientific Review', description: 'Clinical and scientific accuracy review', assigneeRole: 'medical_officer', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_finalize',
    title: 'Finalization & Submission',
    description: 'eCTD packaging, signatures, and gateway submission',
    phase: 'finalization',
    order: 6,
    tasks: [
      { id: 't_signatures', title: 'Electronic Signatures', description: '21 CFR Part 11 compliant e-signatures', assigneeRole: 'sponsor_signatory', estimatedDays: 2 },
      { id: 't_ectd_package', title: 'eCTD Assembly', description: 'Assemble eCTD submission package per ICH M2/M8', assigneeRole: 'publishing_lead', estimatedDays: 3 },
      { id: 't_gateway_submit', title: 'ESG Submission', description: 'Submit via FDA Electronic Submissions Gateway', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const US_IND_TASK_BLUEPRINT: TaskBlueprint = {
  id: 'us_ind_tasks',
  name: 'US IND Task Blueprint',
  milestones: IND_MILESTONES,
};

/**
 * Get the US IND section blueprint (adapted from existing deep map).
 */
export async function getUSIndSectionBlueprint(): Promise<SectionBlueprint> {
  return buildUSIndBlueprint();
}

export { US_IND_TASK_BLUEPRINT as taskBlueprint };
