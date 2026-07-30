/**
 * Japan CTN Blueprint — Clinical Trial Notification (治験届, PMDA)
 *
 * A Japanese Clinical Trial Notification (Chiken-todoke) is filed with the PMDA
 * at least 30 days before starting a trial. Foreign sponsors must act through an
 * in-country caretaker, documentation is in Japanese, and an ICH E5 ethnic-
 * bridging strategy is assessed early.
 *
 * @module server/services/regulatory/registry/blueprints/japanCtnBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildClinicalTrialBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildClinicalTrialBlueprint(
  'jp_ctn_sections',
  'Japan CTN Sections (CTD + PMDA Module 1)',
  'JP'
);

const CTN_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_consultation', title: 'PMDA Consultation & Bridging Strategy', description: 'Early PMDA consultation and ICH E5 ethnic-bridging assessment', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pmda_consult', title: 'PMDA Consultation (対面助言)', description: 'Request PMDA face-to-face consultation on the development plan', assigneeRole: 'regulatory_lead', estimatedDays: 30 },
      { id: 't_bridging', title: 'Ethnic Bridging Strategy (ICH E5)', description: 'Assess need for Japanese bridging data', assigneeRole: 'clinical_lead', estimatedDays: 10 },
    ],
  },
  {
    id: 'ms_protocol', title: 'Protocol & IB (Japanese)', description: 'Clinical protocol and Investigator Brochure prepared for Japan', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_protocol', title: 'Clinical Protocol (治験実施計画書)', description: 'Draft protocol per ICH E6(R2), Japanese translation', assigneeRole: 'clinical_lead', estimatedDays: 20 },
      { id: 't_ib', title: 'Investigator Brochure (治験薬概要書)', description: 'Per ICH E6(R2) section 7, Japanese translation', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_quality', title: 'Quality (CMC) Information', description: 'Module 3 quality package supporting the CTN', assigneeRole: 'cmc_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_ctn', title: 'CTN Preparation', description: 'Assemble the Clinical Trial Notification (治験届)', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_ctn_form', title: 'Clinical Trial Notification Form (治験届書)', description: 'Complete the PMDA CTN form', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
      { id: 't_caretaker', title: 'In-Country Caretaker Designation (国内管理人)', description: 'Designate the in-country caretaker for a foreign sponsor', assigneeRole: 'regulatory_lead', estimatedDays: 3 },
      { id: 't_irb', title: 'IRB Review', description: 'Institutional Review Board review at each site', assigneeRole: 'clinical_lead', estimatedDays: 15 },
    ],
  },
  {
    id: 'ms_submit', title: 'Submission', description: 'Submit CTN to PMDA (30-day review before trial start)', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_submit', title: 'PMDA Submission', description: 'Submit the Clinical Trial Notification to PMDA', assigneeRole: 'regulatory_lead', estimatedDays: 2 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'jp_ctn_tasks',
  name: 'Japan CTN Task Blueprint',
  milestones: CTN_MILESTONES,
};
