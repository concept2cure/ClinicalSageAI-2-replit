/**
 * Japan Marketing Approval Blueprint — PMDA Marketing Approval Application
 *
 * @module server/services/regulatory/registry/blueprints/japanMaaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildMarketingAuthorizationBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildMarketingAuthorizationBlueprint(
  'jp_maa_sections',
  'Japan Marketing Approval Sections (CTD + JP Module 1)',
  'JP'
);

const JP_MAA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_consultation', title: 'PMDA Consultation', description: 'Pre-application consultation with PMDA', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_consultation', title: 'PMDA Pre-Application Consultation', description: 'Request and prepare for PMDA consultation', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_jp_strategy', title: 'Japan-Specific Strategy', description: 'Bridging study requirements, ethnic sensitivity assessment', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_cmc', title: 'Module 3 — Quality', description: 'CMC documentation per JP requirements', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_quality', title: 'Quality Package', description: 'Drug substance and product (JP-specific stability)', assigneeRole: 'cmc_lead', estimatedDays: 40 },
    ],
  },
  {
    id: 'ms_nonclinical', title: 'Module 4 — Nonclinical', description: 'Nonclinical data', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_nonclinical', title: 'Nonclinical Package', description: 'Module 4 with JP-specific requirements', assigneeRole: 'nonclinical_lead', estimatedDays: 25 },
    ],
  },
  {
    id: 'ms_clinical', title: 'Module 5 — Clinical', description: 'Clinical data package with bridging data', phase: 'authoring', order: 3,
    tasks: [
      { id: 't_csrs', title: 'Clinical Study Reports', description: 'Including Japanese bridging studies', assigneeRole: 'clinical_lead', estimatedDays: 50 },
      { id: 't_summaries', title: 'Clinical Overview & Summary', description: 'Modules 2.5 and 2.7 with ethnic factor analysis', assigneeRole: 'clinical_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_jp_specific', title: 'JP-Specific Documents', description: 'PMDA regional requirements', phase: 'authoring', order: 4,
    tasks: [
      { id: 't_jp_module1', title: 'Japan Module 1', description: 'Application form, CTD table of contents, CPP', assigneeRole: 'regulatory_lead', estimatedDays: 10 },
      { id: 't_package_insert', title: 'Package Insert (添付文書)', description: 'Japanese package insert', assigneeRole: 'regulatory_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_review', title: 'Review & QC', description: 'Internal review', phase: 'review', order: 5,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Cross-module quality check', assigneeRole: 'qa_lead', estimatedDays: 7 },
      { id: 't_translation', title: 'Translation Review', description: 'JP translation accuracy check', assigneeRole: 'regulatory_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_finalize', title: 'Submission', description: 'eCTD and PMDA gateway submission', phase: 'finalization', order: 6,
    tasks: [
      { id: 't_ectd', title: 'eCTD Assembly (JP spec)', description: 'Build PMDA-compliant eCTD', assigneeRole: 'publishing_lead', estimatedDays: 5 },
      { id: 't_submit', title: 'PMDA Gateway Submission', description: 'Submit via PMDA electronic gateway', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'jp_maa_tasks',
  name: 'Japan Marketing Approval Task Blueprint',
  milestones: JP_MAA_MILESTONES,
};
