/**
 * US NDA Blueprint — New Drug Application (505(b)(1))
 * Full CTD with all clinical sections required.
 *
 * @module server/services/regulatory/registry/blueprints/usNdaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildMarketingAuthorizationBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildMarketingAuthorizationBlueprint(
  'us_nda_full_sections',
  'US NDA Sections (Full CTD)',
  'US'
);

const NDA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_pre_nda', title: 'Pre-NDA Preparation', description: 'Pre-NDA meeting and submission planning', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pre_nda_meeting', title: 'Pre-NDA Meeting (Type A)', description: 'FDA Type A meeting for submission planning', assigneeRole: 'regulatory_lead', estimatedDays: 14 },
      { id: 't_submission_plan', title: 'Submission Plan', description: 'Define rolling/complete submission strategy', assigneeRole: 'regulatory_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_cmc', title: 'Module 3 — CMC', description: 'Chemistry, Manufacturing, and Controls', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_drug_substance', title: 'Drug Substance (3.2.S)', description: 'Complete drug substance documentation', assigneeRole: 'cmc_lead', estimatedDays: 40 },
      { id: 't_drug_product', title: 'Drug Product (3.2.P)', description: 'Complete drug product documentation', assigneeRole: 'cmc_lead', estimatedDays: 35 },
      { id: 't_qos', title: 'Quality Overall Summary (2.3)', description: 'ICH M4Q summary', assigneeRole: 'cmc_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_nonclinical', title: 'Module 4 — Nonclinical', description: 'Complete nonclinical package', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_nonclinical_reports', title: 'Nonclinical Study Reports', description: 'All pharmacology, PK, and toxicology reports', assigneeRole: 'nonclinical_lead', estimatedDays: 30 },
      { id: 't_nonclinical_overview', title: 'Nonclinical Overview (2.4) & Summaries (2.6)', description: 'Integrated nonclinical assessment', assigneeRole: 'nonclinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_clinical', title: 'Module 5 — Clinical', description: 'Complete clinical data package', phase: 'authoring', order: 3,
    tasks: [
      { id: 't_csrs', title: 'Clinical Study Reports (5.3)', description: 'All pivotal and supportive CSRs', assigneeRole: 'clinical_lead', estimatedDays: 60 },
      { id: 't_clinical_summary', title: 'Clinical Summary (2.7)', description: 'Integrated clinical summary', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_clinical_overview', title: 'Clinical Overview (2.5)', description: 'Benefit-risk assessment', assigneeRole: 'clinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_labeling', title: 'Labeling', description: 'Prescribing information and labeling', phase: 'authoring', order: 4,
    tasks: [
      { id: 't_pi', title: 'Prescribing Information', description: 'Draft PI/labeling per FDA guidance', assigneeRole: 'regulatory_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_review', title: 'Review & QC', description: 'Internal review cycle', phase: 'review', order: 5,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality control across all modules', assigneeRole: 'qa_lead', estimatedDays: 10 },
      { id: 't_compliance', title: 'Regulatory Compliance', description: '21 CFR 314 compliance validation', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_finalize', title: 'Finalization & Submission', description: 'eCTD assembly and gateway submission', phase: 'finalization', order: 6,
    tasks: [
      { id: 't_signatures', title: 'Electronic Signatures', description: 'Part 11 compliant signatures', assigneeRole: 'sponsor_signatory', estimatedDays: 3 },
      { id: 't_ectd', title: 'eCTD Assembly & Validation', description: 'Build and validate eCTD package', assigneeRole: 'publishing_lead', estimatedDays: 5 },
      { id: 't_submit', title: 'ESG Submission', description: 'Submit via FDA ESG', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'us_nda_tasks',
  name: 'US NDA Task Blueprint',
  milestones: NDA_MILESTONES,
};
