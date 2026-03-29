/**
 * India CT Blueprint — CDSCO Clinical Trial Application (Form CT-04)
 *
 * @module server/services/regulatory/registry/blueprints/indiaCtBlueprint
 */

import type { SectionBlueprint, SectionDefinition, TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';

const INDIA_CT_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Form CT-04', module: 1, required: true, contentType: 'form', guidance: 'New Drugs and Clinical Trials Rules, 2019' },
  { code: '2', title: 'Clinical Trial Protocol', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Investigator Brochure', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Chemistry, Manufacturing & Controls', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Nonclinical Study Reports', module: 1, required: true, contentType: 'mixed' },
  { code: '6', title: 'Available Clinical Data', module: 1, required: false, contentType: 'mixed' },
  { code: '7', title: 'Informed Consent Document', module: 1, required: true, contentType: 'narrative' },
  { code: '8', title: 'Ethics Committee Approval', module: 1, required: true, contentType: 'form' },
  { code: '9', title: 'Undertaking by Sponsor', module: 1, required: true, contentType: 'form' },
  { code: '10', title: 'Insurance/Indemnity', module: 1, required: true, contentType: 'form' },
  { code: '11', title: 'Investigator CV and Site Details', module: 1, required: true, contentType: 'form' },
];

export const sectionBlueprint: SectionBlueprint = {
  id: 'in_ct04_sections',
  name: 'India CT-04 Sections',
  sections: INDIA_CT_SECTIONS,
};

const INDIA_CT_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_authoring', title: 'Document Preparation', description: 'Prepare CT-04 submission documents', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Protocol with India-specific requirements', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Current IB', assigneeRole: 'clinical_lead', estimatedDays: 5 },
      { id: 't_quality', title: 'CMC Documentation', description: 'Quality/CMC data per CDSCO requirements', assigneeRole: 'cmc_lead', estimatedDays: 20 },
      { id: 't_nonclinical', title: 'Nonclinical Package', description: 'Safety pharmacology and toxicology', assigneeRole: 'nonclinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_india_specific', title: 'CDSCO Requirements', description: 'India-specific regulatory documents', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_ct04', title: 'Form CT-04', description: 'Complete CDSCO Form CT-04', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_ethics', title: 'Ethics Committee Approval', description: 'IEC/IRB approval from Indian ethics committee', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_insurance', title: 'Insurance Documentation', description: 'Medical insurance for trial subjects per Indian rules', assigneeRole: 'regulatory_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality check', assigneeRole: 'qa_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'SUGAM portal submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_sugam', title: 'SUGAM Portal Submission', description: 'Submit via CDSCO SUGAM online portal', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'in_ct04_tasks',
  name: 'India CT-04 Task Blueprint',
  milestones: INDIA_CT_MILESTONES,
};
