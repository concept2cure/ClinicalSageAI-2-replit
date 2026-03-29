/**
 * US BLA Blueprint — Biologics License Application
 *
 * @module server/services/regulatory/registry/blueprints/usBlaBlueprint
 */

import type { TaskBlueprint, MilestoneDefinition } from '../../../../../shared/regulatory/document-taxonomy.js';
import { buildMarketingAuthorizationBlueprint } from '../adapters/ctdBlueprintNormalizer.js';

export const sectionBlueprint = buildMarketingAuthorizationBlueprint(
  'us_bla_full_sections',
  'US BLA Sections (Full CTD)',
  'US'
);

const BLA_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'ms_pre_bla', title: 'Pre-BLA Preparation', description: 'Pre-BLA meeting and biologics-specific planning', phase: 'pre_submission', order: 0,
    tasks: [
      { id: 't_pre_bla_meeting', title: 'Pre-BLA Meeting', description: 'FDA Type A meeting for BLA submission strategy', assigneeRole: 'regulatory_lead', estimatedDays: 14 },
    ],
  },
  {
    id: 'ms_cmc', title: 'Module 3 — CMC (Biologics)', description: 'Biologics-specific CMC documentation', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_drug_substance', title: 'Drug Substance (3.2.S)', description: 'Cell line, fermentation, purification, characterization', assigneeRole: 'cmc_lead', estimatedDays: 45 },
      { id: 't_drug_product', title: 'Drug Product (3.2.P)', description: 'Formulation, fill-finish, container closure', assigneeRole: 'cmc_lead', estimatedDays: 35 },
      { id: 't_comparability', title: 'Comparability Studies', description: 'Process change comparability if applicable', assigneeRole: 'cmc_lead', estimatedDays: 20 },
    ],
  },
  {
    id: 'ms_nonclinical', title: 'Module 4 — Nonclinical', description: 'Nonclinical package including immunogenicity', phase: 'authoring', order: 2,
    tasks: [
      { id: 't_nonclinical', title: 'Nonclinical Reports', description: 'Pharmacology, PK, toxicology, immunogenicity', assigneeRole: 'nonclinical_lead', estimatedDays: 30 },
    ],
  },
  {
    id: 'ms_clinical', title: 'Module 5 — Clinical', description: 'Clinical data package with immunogenicity focus', phase: 'authoring', order: 3,
    tasks: [
      { id: 't_csrs', title: 'Clinical Study Reports', description: 'Pivotal efficacy and safety CSRs', assigneeRole: 'clinical_lead', estimatedDays: 60 },
      { id: 't_immunogenicity', title: 'Immunogenicity Analysis', description: 'Anti-drug antibody and immunogenicity data', assigneeRole: 'clinical_lead', estimatedDays: 15 },
      { id: 't_summaries', title: 'Clinical Overview & Summary', description: 'Modules 2.5 and 2.7', assigneeRole: 'clinical_lead', estimatedDays: 25 },
    ],
  },
  {
    id: 'ms_review', title: 'Review & QC', description: 'Internal review', phase: 'review', order: 4,
    tasks: [
      { id: 't_qc', title: 'QC Review', description: 'Cross-module QC', assigneeRole: 'qa_lead', estimatedDays: 10 },
      { id: 't_compliance', title: 'Compliance (21 CFR 601)', description: 'BLA-specific compliance check', assigneeRole: 'regulatory_lead', estimatedDays: 5 },
    ],
  },
  {
    id: 'ms_finalize', title: 'Finalization', description: 'eCTD assembly and submission', phase: 'finalization', order: 5,
    tasks: [
      { id: 't_signatures', title: 'Signatures', description: 'Part 11 signatures', assigneeRole: 'sponsor_signatory', estimatedDays: 2 },
      { id: 't_ectd', title: 'eCTD Assembly', description: 'Package and validate', assigneeRole: 'publishing_lead', estimatedDays: 5 },
      { id: 't_submit', title: 'Submit', description: 'ESG submission', assigneeRole: 'publishing_lead', estimatedDays: 1 },
    ],
  },
];

export const taskBlueprint: TaskBlueprint = {
  id: 'us_bla_tasks',
  name: 'US BLA Task Blueprint',
  milestones: BLA_MILESTONES,
};
