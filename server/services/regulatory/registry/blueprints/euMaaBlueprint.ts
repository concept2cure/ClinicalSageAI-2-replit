/**
 * EU MAA Blueprint — Marketing Authorisation Application (Centralised Procedure)
 *
 * @module server/services/regulatory/registry/blueprints/euMaaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildMarketingAuthorizationBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildMarketingAuthorizationBlueprint(
  'eu_maa_full_sections',
  'EU MAA Sections (Full CTD, EU Module 1)',
  'EU'
);

const MAA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_scientific_advice', title: 'Scientific Advice', description: 'EMA scientific advice and protocol assistance', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_scientific_advice', title: 'Scientific Advice Request', description: 'Request EMA SAWP advice', assigneeRole: 'regulatory_lead', estimatedDays: 21 },
      { id: 't_rapporteur', title: 'Rapporteur Allocation', description: 'Track rapporteur/co-rapporteur assignment', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_cmc', title: 'Module 3 — Quality', description: 'CMC documentation per EU requirements', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_drug_substance', title: 'Drug Substance (3.2.S)', description: 'Full drug substance documentation', assigneeRole: 'cmc_lead', estimatedDays: 40 },
      { id: 't_drug_product', title: 'Drug Product (3.2.P)', description: 'Full drug product documentation', assigneeRole: 'cmc_lead', estimatedDays: 35 },
      { id: 't_qos', title: 'Quality Overall Summary (2.3)', description: 'ICH M4Q summary', assigneeRole: 'cmc_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_nonclinical', title: 'Module 4 — Nonclinical', description: 'Nonclinical data package', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_nonclinical', title: 'Nonclinical Reports & Summaries', description: 'Full Module 4 + summaries (2.4, 2.6)', assigneeRole: 'nonclinical_lead', estimatedDays: 30 },
    ],
  },
  {
    id: 'ms_clinical', title: 'Module 5 — Clinical', description: 'Full clinical data package', phase: 'authoring', order: 3,
    tasks: [
      { id: 't_csrs', title: 'Clinical Study Reports (5.3)', description: 'All CSRs per ICH E3', assigneeRole: 'clinical_lead', estimatedDays: 60 },
      { id: 't_clinical_summaries', title: 'Clinical Overview & Summary (2.5, 2.7)', description: 'Integrated clinical assessment', assigneeRole: 'clinical_lead', estimatedDays: 25 },
    ],
  },
  {
    id: 'ms_eu_specific', title: 'EU-Specific Documents', description: 'SmPC, PIL, labelling, RMP', phase: 'authoring', order: 4,
    tasks: [
      { id: 't_smpc', title: 'Summary of Product Characteristics (SmPC)', description: 'Per EU template Rev 2', assigneeRole: 'regulatory_lead', estimatedDays: 15 },
      { id: 't_pil', title: 'Package Leaflet (PIL)', description: 'QRD template compliant', assigneeRole: 'regulatory_lead', estimatedDays: 10 },
      { id: 't_rmp', title: 'Risk Management Plan', description: 'EU RMP per GVP Module V', assigneeRole: 'safety_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_review', title: 'Review & QC', description: 'Internal review cycle', phase: 'review', order: 5,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Cross-module quality check', assigneeRole: 'qa_lead', estimatedDays: 10 },
      { id: 't_compliance', title: 'EU Regulatory Compliance', description: 'Directive 2001/83/EC compliance', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_finalize', title: 'Finalization & Submission', description: 'eCTD assembly and eSubmission gateway', phase: 'finalization', order: 6,
    tasks: [
      { id: 't_signatures', title: 'Signatures', description: 'EU qualified person signatures', assigneeRole: 'qualified_person', estimatedDays: 3 },
      { id: 't_ectd', title: 'eCTD Assembly', description: 'Build EU-compliant eCTD package', assigneeRole: 'publishing_lead', estimatedDays: 5 },
      { id: 't_submit', title: 'eSubmission', description: 'Submit via EMA eSubmission gateway', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'eu_maa_tasks',
  name: 'EU MAA Task Blueprint',
  milestones: MAA_MILESTONES,
};
