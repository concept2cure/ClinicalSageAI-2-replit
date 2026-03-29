/**
 * China CTA Blueprint — NMPA Clinical Trial Application
 *
 * @module server/services/regulatory/registry/blueprints/chinaCtaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildClinicalTrialBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildClinicalTrialBlueprint(
  'cn_cta_sections',
  'China CTA Sections (CTD-based)',
  'DEFAULT'
);

const CN_CTA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_pre_cta', title: 'Pre-CTA Communication', description: 'NMPA pre-CTA communication', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pre_cta', title: 'Pre-CTA Communication', description: 'Pre-IND/CTA communication with CDE', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_cn_strategy', title: 'China-Specific Strategy', description: 'Chinese patient population and ethnic sensitivity', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_authoring', title: 'CTD Documentation', description: 'CTD-formatted dossier', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Protocol with China-specific requirements', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_quality', title: 'Quality Documentation', description: 'CMC per NMPA requirements', assigneeRole: 'cmc_lead', estimatedDays: 30 },
      { id: 't_nonclinical', title: 'Nonclinical Data', description: 'Nonclinical package', assigneeRole: 'nonclinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Updated IB', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_cn_specific', title: 'NMPA-Specific Documents', description: 'China regional requirements', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_cn_forms', title: 'CDE Application Forms', description: 'NMPA/CDE specific application forms', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_translation', title: 'Chinese Translation', description: 'Translate key documents to Chinese', assigneeRole: 'regulatory_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal review', phase: 'review', order: 3,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality check', assigneeRole: 'qa_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'CDE electronic submission', phase: 'finalization', order: 4,
    tasks: [
      { id: 't_submit', title: 'CDE Portal Submission', description: 'Submit via NMPA/CDE portal', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'cn_cta_tasks',
  name: 'China CTA Task Blueprint',
  milestones: CN_CTA_MILESTONES,
};
