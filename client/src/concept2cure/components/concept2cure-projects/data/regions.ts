/**
 * Phase 3 Projects — New Project Dialog: regions + application types +
 * bootstrap previews + family labels.
 *
 * Verbatim from design-system/ui_kits/home/Projects.jsx
 * (NPD_*, lines 1361–1529). Per HANDOFF Open Questions item 3, this
 * table is the canonical lookup — do NOT regenerate slugs by
 * string-mangling display names.
 */
import type { Preset } from './phases';

export interface NpdRegion {
  region: string;
  country: string;
  agency: string;
  agencyFullName: string;
  count: number;
}

export const NPD_REGIONS: NpdRegion[] = [
  { region: 'US', country: 'United States', agency: 'FDA',         agencyFullName: 'Food and Drug Administration',           count: 14 },
  { region: 'EU', country: 'European Union', agency: 'EMA',         agencyFullName: 'European Medicines Agency',              count: 11 },
  { region: 'GB', country: 'United Kingdom', agency: 'MHRA',        agencyFullName: 'Medicines & Healthcare Regulatory Agency', count: 8 },
  { region: 'CA', country: 'Canada',         agency: 'HC',          agencyFullName: 'Health Canada',                          count: 7 },
  { region: 'JP', country: 'Japan',          agency: 'PMDA',        agencyFullName: 'Pharmaceuticals & Medical Devices Agency', count: 9 },
  { region: 'CH', country: 'Switzerland',    agency: 'Swissmedic',  agencyFullName: 'Swiss Agency for Therapeutic Products',  count: 6 },
];

export type NpdFamily =
  | 'device_clearance' | 'device_approval' | 'clinical_trial'
  | 'marketing_authorization' | 'supplement' | 'pre_submission';

export interface NpdType {
  family: NpdFamily;
  id: string;
  displayName: string;
  applicationType: string;
  dossierStandard: string;
  stage: string;
  preset: Preset;
}

export const NPD_TYPES: Record<string, NpdType[]> = {
  US: [
    { family: 'device_clearance',        id: '510k',    displayName: '510(k) Premarket Notification', applicationType: '510(k)', dossierStandard: 'eSTAR', stage: 'Premarket',      preset: '510K' },
    { family: 'device_approval',         id: 'pma',     displayName: 'PMA — Premarket Approval',       applicationType: 'PMA',     dossierStandard: 'eSTAR', stage: 'Premarket',      preset: '510K' },
    { family: 'device_approval',         id: 'denovo',  displayName: 'De Novo Classification',         applicationType: 'De Novo', dossierStandard: 'eSTAR', stage: 'Premarket',      preset: '510K' },
    { family: 'clinical_trial',          id: 'ind',     displayName: 'IND — Investigational New Drug', applicationType: 'IND',     dossierStandard: 'eCTD',  stage: 'Clinical',        preset: 'IND' },
    { family: 'marketing_authorization', id: 'nda',     displayName: 'NDA — New Drug Application',     applicationType: 'NDA',     dossierStandard: 'eCTD',  stage: 'Marketing',       preset: 'NDA' },
    { family: 'marketing_authorization', id: 'bla',     displayName: 'BLA — Biologics License',        applicationType: 'BLA',     dossierStandard: 'eCTD',  stage: 'Marketing',       preset: 'NDA' },
    { family: 'pre_submission',          id: 'qsub',    displayName: 'Q-Sub — Pre-submission Meeting', applicationType: 'Q-Sub',   dossierStandard: 'eSTAR', stage: 'Pre-submission',  preset: '510K' },
  ],
  EU: [
    { family: 'device_clearance',        id: 'mdr',     displayName: 'MDR Technical Documentation',   applicationType: 'MDR', dossierStandard: 'IMDRF',  stage: 'Conformity', preset: 'CER' },
    { family: 'device_clearance',        id: 'cer',     displayName: 'Clinical Evaluation Report',    applicationType: 'CER', dossierStandard: 'MEDDEV', stage: 'Conformity', preset: 'CER' },
    { family: 'marketing_authorization', id: 'maa',     displayName: 'MAA — Marketing Authorization', applicationType: 'MAA', dossierStandard: 'eCTD',   stage: 'Marketing',  preset: 'NDA' },
    { family: 'clinical_trial',          id: 'cta',     displayName: 'CTA — Clinical Trial Application', applicationType: 'CTA', dossierStandard: 'eCTD', stage: 'Clinical', preset: 'IND' },
  ],
  GB: [
    { family: 'marketing_authorization', id: 'mhra-ma',  displayName: 'UK Marketing Authorization',           applicationType: 'MA',  dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
    { family: 'clinical_trial',          id: 'mhra-cta', displayName: 'UK Clinical Trial Authorization',      applicationType: 'CTA', dossierStandard: 'eCTD', stage: 'Clinical',  preset: 'IND' },
  ],
  CA: [
    { family: 'marketing_authorization', id: 'nds',    displayName: 'NDS — New Drug Submission',         applicationType: 'NDS', dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
    { family: 'clinical_trial',          id: 'cta-ca', displayName: 'CTA — Clinical Trial Application',  applicationType: 'CTA', dossierStandard: 'eCTD', stage: 'Clinical',  preset: 'IND' },
  ],
  JP: [
    { family: 'marketing_authorization', id: 'jnda', displayName: 'J-NDA — Japan New Drug', applicationType: 'J-NDA', dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
  ],
  CH: [
    { family: 'marketing_authorization', id: 'sm-ma', displayName: 'Swissmedic Authorization', applicationType: 'MA', dossierStandard: 'eCTD', stage: 'Marketing', preset: 'NDA' },
  ],
};

export const NPD_FAMILY_LABELS: Record<NpdFamily, string> = {
  device_clearance:        'Device clearance',
  device_approval:         'Device approval',
  clinical_trial:          'Clinical trial',
  marketing_authorization: 'Marketing authorization',
  supplement:              'Supplement',
  pre_submission:          'Pre-submission',
};

export interface NpdSection {
  module: number;
  code: string;
  title: string;
  required: boolean;
}

export interface NpdMilestone {
  id: string;
  title: string;
  taskCount: number;
}

export interface NpdPreview {
  sections: NpdSection[];
  milestones: NpdMilestone[];
  artifacts: string[];
  gateway: string;
}

export const NPD_PREVIEWS: Record<string, NpdPreview> = {
  '510k': {
    sections: [
      { module: 1, code: '1.1', title: 'Cover letter',                       required: true },
      { module: 1, code: '1.2', title: 'Indications for use',                required: true },
      { module: 2, code: '2.1', title: 'Device description',                 required: true },
      { module: 2, code: '2.2', title: 'Substantial equivalence discussion', required: true },
      { module: 2, code: '2.3', title: 'Predicate comparison',               required: true },
      { module: 3, code: '3.1', title: 'Performance testing — bench',        required: true },
      { module: 3, code: '3.2', title: 'Biocompatibility',                   required: true },
      { module: 3, code: '3.3', title: 'Sterilization',                      required: false },
      { module: 4, code: '4.1', title: 'Labeling',                           required: true },
      { module: 4, code: '4.2', title: 'Instructions for use',               required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Predicate identified',           taskCount: 4 },
      { id: 'm2', title: 'Substantial equivalence drafted', taskCount: 7 },
      { id: 'm3', title: 'Bench testing complete',          taskCount: 12 },
      { id: 'm4', title: 'Internal QC pass',                taskCount: 5 },
      { id: 'm5', title: 'eSTAR submission',                taskCount: 3 },
    ],
    artifacts: ['cover_letter', 'predicate_comparison', 'se_discussion', 'bench_test_report', 'biocompatibility_report', 'labeling_pdf', 'ifu_pdf'],
    gateway: 'CDRH eSTAR',
  },
  pma: {
    sections: [
      { module: 1, code: '1.1', title: 'Cover letter',          required: true },
      { module: 2, code: '2.1', title: 'Device description',    required: true },
      { module: 3, code: '3.1', title: 'Nonclinical studies',   required: true },
      { module: 4, code: '4.1', title: 'Clinical investigations', required: true },
      { module: 5, code: '5.1', title: 'Manufacturing',         required: true },
      { module: 6, code: '6.1', title: 'Labeling',              required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Pre-submission meeting',  taskCount: 6 },
      { id: 'm2', title: 'Clinical study complete', taskCount: 22 },
      { id: 'm3', title: 'Module 3 nonclinical',    taskCount: 14 },
      { id: 'm4', title: 'PMA submission',          taskCount: 4 },
    ],
    artifacts: ['device_description', 'clinical_study_report', 'manufacturing_info', 'risk_analysis', 'labeling_pdf'],
    gateway: 'CDRH eSTAR',
  },
  ind: {
    sections: [
      { module: 1, code: '1571', title: 'Form FDA 1571',           required: true },
      { module: 1, code: '1572', title: 'Form FDA 1572',           required: true },
      { module: 2, code: '2.3',  title: 'Quality summary (CMC)',   required: true },
      { module: 3, code: '3.2',  title: 'Drug substance + product', required: true },
      { module: 4, code: '4.2',  title: 'Nonclinical study reports', required: true },
      { module: 5, code: '5.2',  title: 'Clinical protocol',       required: true },
      { module: 5, code: '5.3',  title: 'Investigator brochure',   required: true },
    ],
    milestones: [
      { id: 'm1', title: 'CMC information assembled', taskCount: 9 },
      { id: 'm2', title: 'Nonclinical complete',      taskCount: 11 },
      { id: 'm3', title: 'Protocol finalized',        taskCount: 6 },
      { id: 'm4', title: 'IND submission',            taskCount: 3 },
    ],
    artifacts: ['form_1571', 'form_1572', 'cmc_summary', 'nonclinical_reports', 'clinical_protocol', 'investigator_brochure'],
    gateway: 'FDA ESG',
  },
  nda: {
    sections: [
      { module: 1, code: '1.1', title: 'Administrative',          required: true },
      { module: 2, code: '2.2', title: 'CTD introduction',        required: true },
      { module: 2, code: '2.5', title: 'Clinical overview',       required: true },
      { module: 3, code: '3.2', title: 'Quality data',            required: true },
      { module: 4, code: '4.2', title: 'Nonclinical study reports', required: true },
      { module: 5, code: '5.3', title: 'Clinical study reports',  required: true },
    ],
    milestones: [
      { id: 'm1', title: 'Module 3 quality lockdown', taskCount: 18 },
      { id: 'm2', title: 'Module 4 nonclinical',      taskCount: 12 },
      { id: 'm3', title: 'Module 5 clinical',         taskCount: 26 },
      { id: 'm4', title: 'QC pass',                   taskCount: 7 },
      { id: 'm5', title: 'NDA submission',            taskCount: 3 },
    ],
    artifacts: ['quality_overall_summary', 'clinical_overview', 'nonclinical_overview', 'study_reports', 'integrated_summaries'],
    gateway: 'FDA ESG',
  },
  cer: {
    sections: [
      { module: 1, code: 'A.1', title: 'Scope',                       required: true },
      { module: 1, code: 'A.2', title: 'Device description',          required: true },
      { module: 2, code: 'B.1', title: 'State of the art',            required: true },
      { module: 2, code: 'B.2', title: 'Literature search',           required: true },
      { module: 3, code: 'C.1', title: 'Clinical data appraisal',     required: true },
      { module: 3, code: 'C.2', title: 'Benefit-risk',                required: true },
      { module: 4, code: 'D.1', title: 'PMS / PMCF integration',      required: false },
    ],
    milestones: [
      { id: 'm1', title: 'Search protocol approved', taskCount: 4 },
      { id: 'm2', title: 'Literature appraisal',     taskCount: 9 },
      { id: 'm3', title: 'Clinical data analysis',   taskCount: 7 },
      { id: 'm4', title: 'Notified Body review',     taskCount: 5 },
    ],
    artifacts: ['search_protocol', 'literature_review', 'clinical_data_table', 'benefit_risk', 'pms_plan'],
    gateway: 'EUDAMED',
  },
};

export const NPD_DEFAULT_PREVIEW: NpdPreview = {
  sections: [
    { module: 1, code: '1.1', title: 'Project setup',          required: true },
    { module: 1, code: '1.2', title: 'Cover letter',           required: true },
    { module: 2, code: '2.1', title: 'Application overview',   required: true },
    { module: 2, code: '2.2', title: 'Supporting data',        required: false },
  ],
  milestones: [
    { id: 'm1', title: 'Project kickoff',  taskCount: 3 },
    { id: 'm2', title: 'Data assembled',   taskCount: 6 },
    { id: 'm3', title: 'Submission',       taskCount: 2 },
  ],
  artifacts: ['cover_letter', 'application_form'],
  gateway: 'Generic gateway',
};
