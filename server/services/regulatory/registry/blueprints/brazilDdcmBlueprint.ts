/**
 * Brazil DDCM Blueprint — ANVISA Dossiê de Desenvolvimento Clínico de Medicamento
 *
 * @module server/services/regulatory/registry/blueprints/brazilDdcmBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildClinicalTrialBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildClinicalTrialBlueprint(
  'br_ddcm_sections',
  'Brazil DDCM Sections (CTD-based)',
  'DEFAULT'
);

const DDCM_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_authoring', title: 'DDCM Documentation', description: 'Prepare ANVISA DDCM package', phase: 'authoring', order: 0,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol', description: 'Protocol with Brazil-specific requirements', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure', description: 'Current IB in Portuguese or English', assigneeRole: 'clinical_lead', estimatedDays: 5 },
      { id: 't_quality', title: 'Quality Documentation', description: 'CMC per ANVISA RDC requirements', assigneeRole: 'cmc_lead', estimatedDays: 25 },
      { id: 't_nonclinical', title: 'Nonclinical Data', description: 'Safety pharmacology and toxicology', assigneeRole: 'nonclinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_anvisa_specific', title: 'ANVISA Requirements', description: 'Brazil-specific regulatory documents', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_anvisa_forms', title: 'ANVISA Application Forms', description: 'Specific ANVISA forms and declarations', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_cep', title: 'CEP Ethics Approval', description: 'Comitê de Ética em Pesquisa submission', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_conep', title: 'CONEP Review (if required)', description: 'National ethics commission review', assigneeRole: 'regulatory_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_review', title: 'Review', description: 'Internal review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Quality check', assigneeRole: 'qa_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'ANVISA electronic submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_submit', title: 'ANVISA Portal Submission', description: 'Submit via ANVISA portal', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'br_ddcm_tasks',
  name: 'Brazil DDCM Task Blueprint',
  milestones: DDCM_MILESTONES,
};
