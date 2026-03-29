/**
 * Australia CTN Blueprint — TGA Clinical Trial Notification
 *
 * @module server/services/regulatory/registry/blueprints/australiaCtnBlueprint
 */

import type { SectionBlueprint, SectionDefinition, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';

const CTN_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'CTN Form', module: 1, required: true, contentType: 'form', guidance: 'TGA CTN Scheme' },
  { code: '2', title: 'Clinical Trial Protocol', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Investigator Brochure', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Product Information', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Ethics Committee Approval', module: 1, required: true, contentType: 'form' },
  { code: '6', title: 'Insurance/Indemnity Certificate', module: 1, required: true, contentType: 'form' },
  { code: '7', title: 'GMP Evidence', module: 1, required: false, contentType: 'form' },
  { code: '8', title: 'Informed Consent Form', module: 1, required: true, contentType: 'narrative' },
];

export const sectionBlueprint: SectionBlueprint = {
  id: 'au_ctn_sections',
  name: 'Australia CTN Sections',
  sections: CTN_SECTIONS,
};

const CTN_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_preparation', title: 'Document Preparation', description: 'Prepare CTN submission documents', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Finalize protocol for Australian sites', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Current IB', assigneeRole: 'clinical_lead', estimatedDays: 5 },
      { id: 't_product_info', title: 'Product Information', description: 'TGA product information', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_ethics', title: 'Ethics Approval', description: 'HREC approval', phase: 'review', order: 1,
    tasks: [
      { id: 't_hrec', title: 'HREC Submission', description: 'Submit to Human Research Ethics Committee', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
    ],
  },
  {
    id: 'ms_submit', title: 'CTN Notification', description: 'Submit CTN to TGA', phase: 'finalization', order: 2,
    tasks: [
      { id: 't_ctn_form', title: 'CTN Form', description: 'Complete and submit CTN form', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
      { id: 't_notify', title: 'TGA Notification', description: 'Notify TGA of clinical trial', assigneeRole: 'regulatory_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'au_ctn_tasks',
  name: 'Australia CTN Task Blueprint',
  milestones: CTN_MILESTONES,
};
