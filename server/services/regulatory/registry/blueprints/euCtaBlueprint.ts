/**
 * EU CTA Blueprint — Clinical Trial Application (EU CTR / CTIS)
 *
 * @module server/services/regulatory/registry/blueprints/euCtaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildClinicalTrialBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildClinicalTrialBlueprint(
  'eu_cta_sections',
  'EU CTA Sections (CTD + CTIS requirements)',
  'EU'
);

const CTA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_protocol', title: 'Protocol & IMPD', description: 'Clinical protocol and investigational medicinal product dossier', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Draft clinical trial protocol per ICH E6(R2)', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_impd', title: 'IMPD (Investigational Medicinal Product Dossier)', description: 'Quality, nonclinical, clinical sections of IMPD', assigneeRole: 'regulatory_lead', estimatedDays: 25 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Per ICH E6(R2) section 7', assigneeRole: 'clinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_ctis', title: 'CTIS Application', description: 'EU Clinical Trials Information System submission', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_ctis_form', title: 'CTIS Application Form', description: 'Complete CTIS application form', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_msc', title: 'Member State Concerned Selection', description: 'Select reporting and concerned member states', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_informed_consent', title: 'Informed Consent Forms', description: 'Per-country ICFs', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal review', phase: 'review', order: 2,
    tasks: [
      { id: 't_ethics_prep', title: 'Ethics Committee Preparation', description: 'Prepare ethics documentation', assigneeRole: 'regulatory_lead', estimatedDays: 7 },
      { id: 't_qc', title: 'QC Review', description: 'Quality check all documents', assigneeRole: 'qa_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'CTIS submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_ctis_submit', title: 'CTIS Portal Submission', description: 'Submit via CTIS', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'eu_cta_tasks',
  name: 'EU CTA Task Blueprint',
  milestones: CTA_MILESTONES,
};
