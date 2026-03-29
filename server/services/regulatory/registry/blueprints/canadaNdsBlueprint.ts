/**
 * Canada NDS Blueprint — New Drug Submission (Health Canada)
 *
 * @module server/services/regulatory/registry/blueprints/canadaNdsBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildMarketingAuthorizationBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildMarketingAuthorizationBlueprint(
  'ca_nds_sections',
  'Canada NDS Sections (CTD + HC Module 1)',
  'CA'
);

const NDS_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_pre_sub', title: 'Pre-Submission', description: 'Pre-submission meeting with Health Canada', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pre_sub_meeting', title: 'Pre-Submission Meeting', description: 'Request and attend HC pre-submission meeting', assigneeRole: 'regulatory_lead', estimatedDays: 21 },
    ],
  },
  {
    id: 'ms_cmc', title: 'Module 3 — Quality', description: 'CMC per HC requirements', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_quality', title: 'Quality Package (Module 3)', description: 'Drug substance and product documentation', assigneeRole: 'cmc_lead', estimatedDays: 40 },
      { id: 't_qos', title: 'Quality Overall Summary', description: 'Module 2.3', assigneeRole: 'cmc_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_nonclinical', title: 'Module 4 — Nonclinical', description: 'Nonclinical data', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_nonclinical', title: 'Nonclinical Package', description: 'Module 4 reports and Module 2.4/2.6 summaries', assigneeRole: 'nonclinical_lead', estimatedDays: 25 },
    ],
  },
  {
    id: 'ms_clinical', title: 'Module 5 — Clinical', description: 'Clinical data package', phase: 'authoring', order: 3,
    tasks: [
      { id: 't_clinical', title: 'Clinical Package', description: 'CSRs, clinical overview (2.5), clinical summary (2.7)', assigneeRole: 'clinical_lead', estimatedDays: 50 },
    ],
  },
  {
    id: 'ms_hc_specific', title: 'HC-Specific Requirements', description: 'Health Canada regional documents', phase: 'authoring', order: 4,
    tasks: [
      { id: 't_pm', title: 'Product Monograph', description: 'Health Canada Product Monograph', assigneeRole: 'regulatory_lead', estimatedDays: 15 },
      { id: 't_hc_admin', title: 'HC Administrative Forms', description: 'Health Canada specific Module 1 forms', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_review', title: 'Review & QC', description: 'Internal review', phase: 'review', order: 5,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Cross-module quality check', assigneeRole: 'qa_lead', estimatedDays: 7 },
    ],
  },
  {
    id: 'ms_finalize', title: 'Submission', description: 'eCTD and CESG submission', phase: 'finalization', order: 6,
    tasks: [
      { id: 't_ectd', title: 'eCTD Assembly', description: 'Build HC-compliant eCTD', assigneeRole: 'publishing_lead', estimatedDays: 4 },
      { id: 't_cesg', title: 'CESG Submission', description: 'Submit via Common Electronic Submissions Gateway', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'ca_nds_tasks',
  name: 'Canada NDS Task Blueprint',
  milestones: NDS_MILESTONES,
};
