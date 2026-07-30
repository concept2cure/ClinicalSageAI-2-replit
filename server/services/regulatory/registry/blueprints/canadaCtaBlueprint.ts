/**
 * Canada CTA Blueprint — Clinical Trial Application (Health Canada)
 *
 * Health Canada CTAs are filed under the Food and Drug Regulations (Division 5).
 * Default review target is 30 days; a Research Ethics Board (REB) approval and a
 * Qualified Investigator/site package accompany the CTA.
 *
 * @module server/services/regulatory/registry/blueprints/canadaCtaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildClinicalTrialBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildClinicalTrialBlueprint(
  'ca_cta_sections',
  'Canada CTA Sections (CTD + Health Canada Module 1)',
  'CA'
);

const CTA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_protocol', title: 'Protocol, IB & CTA-Quality', description: 'Clinical protocol, Investigator Brochure and CTA quality (CMC) information', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Draft clinical trial protocol per ICH E6(R2)', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Per ICH E6(R2) section 7', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_cta_quality', title: 'CTA Quality (Chemistry & Manufacturing) Information', description: 'Module 3 quality summary supporting the CTA', assigneeRole: 'cmc_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_hc_package', title: 'Health Canada CTA Package', description: 'Assemble the Health Canada regional CTA application', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_cta_form', title: 'Clinical Trial Application Form (HC/SC)', description: 'Complete the Health Canada CTA application form', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_reb', title: 'Research Ethics Board (REB) Approval', description: 'Obtain REB approval for each site', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_qidp', title: 'Qualified Investigator / Site Documentation', description: 'Qualified Investigator Undertaking and site information', assigneeRole: 'clinical_lead', estimatedDays: 7 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal QC and compliance review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality check all CTA documents', assigneeRole: 'qa_lead', estimatedDays: 5 },
      { id: 't_compliance', title: 'Compliance Check', description: 'Food and Drug Regulations (Division 5) compliance', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'Submit to Health Canada (30-day default review)', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_submit', title: 'Health Canada Submission', description: 'Submit CTA via the Common Electronic Submissions Gateway (CESG)', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'ca_cta_tasks',
  name: 'Canada CTA Task Blueprint',
  milestones: CTA_MILESTONES,
};
