/**
 * Project Bootstrap — Registry-driven project initialization.
 *
 * When a project is created, this module determines:
 * 1. Which section/dossier blueprint to use
 * 2. Which templates to pre-select
 * 3. Which milestones/tasks to generate
 * 4. What readiness expectations to set
 *
 * All driven by the Global Regulatory Registry — no switch statements.
 *
 * @module shared/regulatory/project-bootstrap
 */

import type {
  RegulatoryApplicationType,
  SectionBlueprint,
  SectionDefinition,
  TaskBlueprint,
  MilestoneDefinition,
} from './document-taxonomy';

// ─── Section Blueprints ───────────────────────────────────────────────────────

/** CTD Module 1-5 section blueprint (used by IND, NDA, BLA, MAA, etc.) */
const CTD_SECTIONS: SectionDefinition[] = [
  { code: '1.1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '1.2', title: 'Administrative Forms', module: 1, required: true, contentType: 'form' },
  { code: '1.5', title: 'Table of Contents', module: 1, required: true, contentType: 'list' },
  { code: '2.2', title: 'Introduction', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4' },
  { code: '2.3', title: 'Quality Overall Summary', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4Q(R1)' },
  { code: '2.4', title: 'Nonclinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4S(R2)' },
  { code: '2.5', title: 'Clinical Overview', module: 2, required: true, contentType: 'narrative', guidance: 'ICH M4E(R2)' },
  { code: '2.6', title: 'Nonclinical Summaries', module: 2, required: true, contentType: 'mixed', guidance: 'ICH M4S(R2)' },
  { code: '2.7', title: 'Clinical Summary', module: 2, required: false, contentType: 'mixed', guidance: 'ICH M4E(R2)' },
  { code: '3.2.S', title: 'Drug Substance', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.P', title: 'Drug Product', module: 3, required: true, contentType: 'mixed', guidance: 'ICH M4Q(R1)' },
  { code: '3.2.A', title: 'Appendices', module: 3, required: false, contentType: 'mixed' },
  { code: '4.2.1', title: 'Pharmacology', module: 4, required: true, contentType: 'narrative', guidance: 'ICH S7A/S7B' },
  { code: '4.2.2', title: 'Pharmacokinetics', module: 4, required: true, contentType: 'mixed', guidance: 'ICH S3A/S3B' },
  { code: '4.2.3', title: 'Toxicology', module: 4, required: true, contentType: 'mixed', guidance: 'ICH M3(R2)' },
  { code: '5.3', title: 'Clinical Study Reports', module: 5, required: false, contentType: 'mixed', guidance: 'ICH E3' },
  { code: '5.4', title: 'Literature References', module: 5, required: true, contentType: 'list' },
];

/** Device submission sections (510(k), PMA) */
const DEVICE_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Cover Letter', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Indications for Use', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Device Description', module: 1, required: true, contentType: 'mixed' },
  { code: '4', title: 'Substantial Equivalence', module: 1, required: true, contentType: 'narrative' },
  { code: '5', title: 'Performance Testing', module: 1, required: true, contentType: 'data' },
  { code: '6', title: 'Biocompatibility', module: 1, required: false, contentType: 'data' },
  { code: '7', title: 'Software Documentation', module: 1, required: false, contentType: 'mixed' },
  { code: '8', title: 'Labeling', module: 1, required: true, contentType: 'narrative' },
  { code: '9', title: 'Clinical Data', module: 1, required: false, contentType: 'data' },
  { code: '10', title: 'Summary', module: 1, required: true, contentType: 'narrative' },
];

/** CER sections (EU MDR) */
const CER_SECTIONS: SectionDefinition[] = [
  { code: '1', title: 'Executive Summary', module: 1, required: true, contentType: 'narrative' },
  { code: '2', title: 'Scope of Clinical Evaluation', module: 1, required: true, contentType: 'narrative' },
  { code: '3', title: 'Clinical Background', module: 1, required: true, contentType: 'narrative' },
  { code: '4', title: 'Clinical Evidence', module: 1, required: true, contentType: 'mixed' },
  { code: '5', title: 'Post-Market Data', module: 1, required: true, contentType: 'data' },
  { code: '6', title: 'Risk-Benefit Analysis', module: 1, required: true, contentType: 'narrative' },
  { code: '7', title: 'Conclusions', module: 1, required: true, contentType: 'narrative' },
];

const SECTION_BLUEPRINTS: Record<string, SectionBlueprint> = {
  // US Drug Applications
  us_ind_sections: { id: 'us_ind_sections', name: 'IND Sections (CTD)', sections: CTD_SECTIONS },
  us_nda_sections: { id: 'us_nda_sections', name: 'NDA Sections (CTD)', sections: CTD_SECTIONS.map(s => s.code === '2.7' || s.code === '5.3' ? { ...s, required: true } : s) },
  us_bla_sections: { id: 'us_bla_sections', name: 'BLA Sections (CTD)', sections: CTD_SECTIONS.map(s => s.code === '2.7' || s.code === '5.3' ? { ...s, required: true } : s) },
  us_anda_sections: { id: 'us_anda_sections', name: 'ANDA Sections', sections: CTD_SECTIONS.filter(s => ['1.1', '1.2', '2.3', '3.2.S', '3.2.P', '5.3', '5.4'].includes(s.code)) },
  us_505b2_sections: { id: 'us_505b2_sections', name: '505(b)(2) Sections', sections: CTD_SECTIONS },

  // US Device Applications
  us_510k_sections: { id: 'us_510k_sections', name: '510(k) Sections', sections: DEVICE_SECTIONS },
  us_pma_sections: { id: 'us_pma_sections', name: 'PMA Sections', sections: DEVICE_SECTIONS.map(s => ({ ...s, required: true })) },
  us_de_novo_sections: { id: 'us_de_novo_sections', name: 'De Novo Sections', sections: DEVICE_SECTIONS },

  // EU Applications
  eu_cta_sections: { id: 'eu_cta_sections', name: 'EU CTA Sections', sections: CTD_SECTIONS },
  eu_maa_sections: { id: 'eu_maa_sections', name: 'MAA Sections (CTD)', sections: CTD_SECTIONS.map(s => ({ ...s, required: true })) },
  eu_cer_sections: { id: 'eu_cer_sections', name: 'CER Sections (EU MDR)', sections: CER_SECTIONS },

  // Default fallback
  default_sections: { id: 'default_sections', name: 'Standard CTD Sections', sections: CTD_SECTIONS },
};

// ─── Task Blueprints ──────────────────────────────────────────────────────────

const DEFAULT_DRUG_TASKS: MilestoneDefinition[] = [
  {
    id: 'ms_authoring', title: 'Document Authoring', description: 'Draft all required sections', phase: 'authoring', order: 1,
    tasks: [
      { id: 't_draft_m2', title: 'Draft Module 2 Summaries', description: 'Clinical, nonclinical, quality overviews' },
      { id: 't_draft_m3', title: 'Draft Module 3 Quality', description: 'Drug substance and drug product sections' },
      { id: 't_draft_m5', title: 'Draft Module 5 Clinical', description: 'Clinical study reports' },
    ],
  },
  {
    id: 'ms_review', title: 'Internal Review', description: 'QC and compliance review', phase: 'review', order: 2,
    tasks: [
      { id: 't_qc_review', title: 'QC Review', description: 'Quality control check of all sections' },
      { id: 't_compliance', title: 'Compliance Check', description: 'Regulatory compliance validation' },
    ],
  },
  {
    id: 'ms_finalize', title: 'Finalization', description: 'Signatures, packaging, submission', phase: 'finalization', order: 3,
    tasks: [
      { id: 't_signatures', title: 'Electronic Signatures', description: '21 CFR Part 11 compliant e-signatures' },
      { id: 't_ectd_package', title: 'eCTD Packaging', description: 'Assemble eCTD submission package' },
      { id: 't_submit', title: 'Submit to Agency', description: 'Electronic submission via gateway' },
    ],
  },
];

const TASK_BLUEPRINTS: Record<string, TaskBlueprint> = {
  us_ind_tasks: { id: 'us_ind_tasks', name: 'IND Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  us_nda_tasks: { id: 'us_nda_tasks', name: 'NDA Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  us_bla_tasks: { id: 'us_bla_tasks', name: 'BLA Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
  default_tasks: { id: 'default_tasks', name: 'Standard Task Blueprint', milestones: DEFAULT_DRUG_TASKS },
};

// ─── Bootstrap Functions ──────────────────────────────────────────────────────

/**
 * Get the section blueprint for a registry entry.
 * Falls back to default CTD sections if no specific blueprint exists.
 */
export function getSectionBlueprintForEntry(entry: RegulatoryApplicationType): SectionBlueprint {
  return SECTION_BLUEPRINTS[entry.defaultSectionBlueprint] || SECTION_BLUEPRINTS.default_sections;
}

/**
 * Get the task blueprint for a registry entry.
 */
export function getTaskBlueprintForEntry(entry: RegulatoryApplicationType): TaskBlueprint {
  return TASK_BLUEPRINTS[entry.defaultTaskBlueprint] || TASK_BLUEPRINTS.default_tasks;
}

/**
 * Bootstrap a new project from a registry entry.
 * Returns everything needed to initialize the project's sections and tasks.
 */
export function bootstrapProject(entry: RegulatoryApplicationType): {
  sections: SectionDefinition[];
  milestones: MilestoneDefinition[];
  requiredArtifacts: string[];
  dossierStandard: string;
  validationProfile: string;
} {
  const sectionBlueprint = getSectionBlueprintForEntry(entry);
  const taskBlueprint = getTaskBlueprintForEntry(entry);

  return {
    sections: sectionBlueprint.sections,
    milestones: taskBlueprint.milestones,
    requiredArtifacts: entry.requiredArtifacts,
    dossierStandard: entry.dossierStandard,
    validationProfile: entry.validationProfile,
  };
}

export { SECTION_BLUEPRINTS, TASK_BLUEPRINTS };
