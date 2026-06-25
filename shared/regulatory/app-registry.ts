/**
 * App registry — the single source of truth for the platform's discipline apps.
 *
 * Before this file there were TWO parallel "app" lists that didn't know about
 * each other: the WorkspaceApp catalog (what the workspace surfaces) and the
 * license module catalog (what an org is entitled to — `enabledModules`). They
 * used different id spaces for the same things (e.g. `cmc` vs `cmc-wizard`,
 * `study_protocol_design` vs `protocol-designer`), which forced a hand-kept
 * bridge for entitlement gating.
 *
 * This registry unifies them: each app is defined once, and its sellable
 * entitlement module id is just a FIELD (`moduleId`). Apps without a moduleId
 * are always available (not separately sold). The module ids here are the REAL
 * ids from the platform module catalog (db/migrations — available_modules /
 * license `enabledModules`), verified, not guessed.
 *
 * @module shared/regulatory/app-registry
 */

/**
 * Full discipline workspaces a client opens from inside a project. Each is its
 * own surface (not a panel on the editor), shared across every document type,
 * and produces an artifact that flows back into the project's file tree.
 */
export type WorkspaceAppId =
  | 'study_protocol_design' // protocol, schedule-of-activities, CRF shells, feasibility
  | 'irb'                   // IRB / ethics — human-subjects governance
  | 'iacuc'                 // IACUC — animal-care governance
  | 'ibc'                   // IBC — biosafety governance
  | 'submission_center'     // assemble + transmit (dossier scope only)
  | 'cmc'                   // CMC / Module 3 quality workbench
  | 'nonclinical'           // Module 4 nonclinical
  | 'biostatistics'         // SAP, power, group-sequential, endpoint defensibility
  | 'clinical_csr'          // Module 5 / clinical study report authoring
  | 'risk'                  // ISO 14971 risk management
  | 'human_factors'         // IEC 62366-1
  | 'cybersecurity'         // FDA §524B
  | 'substantial_equiv'     // 510(k) predicate / SE
  | 'labeling'              // labeling / SPL / artwork
  | 'pharmacovigilance'     // PV / ICSR / safety
  | 'cer'                   // EU MDR/IVDR clinical evaluation report / performance eval
  | 'etmf'                  // electronic Trial Master File
  | 'market_access'         // coverage / reimbursement (CPT/HCPCS, payer dossier)
  | 'analytical_performance' // IVD analytical validation (precision, LoD/LoQ, linearity, interference — CLSI EP)
  | 'analytical_similarity'; // biosimilar / generic comparability (analytical similarity / bioequivalence)

/** The discipline an app belongs to — the organizing axis for apps. */
export type AppDiscipline =
  | 'governance'
  | 'submission'
  | 'quality_cmc'
  | 'nonclinical'
  | 'clinical'
  | 'biostatistics'
  | 'device_safety'
  | 'diagnostics'
  | 'labeling'
  | 'safety_pv'
  | 'commercial';

export interface AppRegistryEntry {
  id: WorkspaceAppId;
  label: string;
  discipline: AppDiscipline;
  /**
   * Entitlement module id from the platform module catalog (license
   * `enabledModules`), when this app maps to a separately sold module. Apps with
   * no moduleId are always available. These are REAL catalog ids, verified
   * against db/migrations/20260220_user_intelligence_platform.sql.
   */
  moduleId?: string;
  /** Artifact keys this app produces back into the project file tree. */
  produces: string[];
  /** Where those artifacts land in the dossier tree (CTD-ish hint). */
  landsAt: string;
}

export const APP_REGISTRY: Record<WorkspaceAppId, AppRegistryEntry> = {
  study_protocol_design: { id: 'study_protocol_design', label: 'Study & Protocol Design', discipline: 'clinical', moduleId: 'protocol-designer', produces: ['protocol', 'schedule_of_activities', 'crf_shells', 'feasibility'], landsAt: 'protocol / M5 (5.3.5)' },
  irb:               { id: 'irb', label: 'IRB / Ethics (human subjects)', discipline: 'governance', produces: ['irb_submission', 'informed_consent'], landsAt: 'study governance' },
  iacuc:             { id: 'iacuc', label: 'IACUC (animal care)', discipline: 'governance', produces: ['iacuc_protocol'], landsAt: 'nonclinical governance' },
  ibc:               { id: 'ibc', label: 'IBC (biosafety)', discipline: 'governance', produces: ['ibc_registration'], landsAt: 'study governance' },
  submission_center: { id: 'submission_center', label: 'Submission Center', discipline: 'submission', moduleId: 'ectd-coauthor', produces: ['assembled_bundle', 'transmittal'], landsAt: 'gateway / transmit' },
  cmc:               { id: 'cmc', label: 'CMC (Module 3)', discipline: 'quality_cmc', moduleId: 'cmc-wizard', produces: ['quality_overall_summary', 'drug_substance', 'drug_product', 'stability'], landsAt: 'M3' },
  nonclinical:       { id: 'nonclinical', label: 'Nonclinical (Module 4)', discipline: 'nonclinical', produces: ['nonclinical_overview', 'tox_reports'], landsAt: 'M4' },
  biostatistics:     { id: 'biostatistics', label: 'Biostatistics', discipline: 'biostatistics', produces: ['sap', 'power_analysis', 'statistical_methods'], landsAt: 'protocol / M5 (5.3.5)' },
  clinical_csr:      { id: 'clinical_csr', label: 'Clinical / CSR', discipline: 'clinical', moduleId: 'csr-author', produces: ['clinical_study_report', 'clinical_overview', 'clinical_summary'], landsAt: 'M5 / M2.5 / M2.7' },
  risk:              { id: 'risk', label: 'Risk Management (ISO 14971)', discipline: 'device_safety', produces: ['risk_management_file'], landsAt: 'GSPR / design controls' },
  human_factors:     { id: 'human_factors', label: 'Human Factors (IEC 62366-1)', discipline: 'device_safety', produces: ['hf_validation_report'], landsAt: 'device performance' },
  cybersecurity:     { id: 'cybersecurity', label: 'Cybersecurity (§524B)', discipline: 'device_safety', produces: ['sbom', 'cyber_risk_assessment'], landsAt: 'device performance' },
  substantial_equiv: { id: 'substantial_equiv', label: 'Substantial Equivalence', discipline: 'device_safety', moduleId: '510k-submission', produces: ['se_comparison', 'predicate_analysis'], landsAt: '510(k) SE' },
  labeling:          { id: 'labeling', label: 'Labeling', discipline: 'labeling', produces: ['draft_labeling', 'spl', 'ifu'], landsAt: 'M1 / labeling' },
  pharmacovigilance: { id: 'pharmacovigilance', label: 'Pharmacovigilance', discipline: 'safety_pv', moduleId: 'safety-signal', produces: ['icsr', 'psur'], landsAt: 'safety / M5.3.6' },
  cer:               { id: 'cer', label: 'Clinical Evaluation (CER/PER)', discipline: 'clinical', moduleId: 'cer-generator', produces: ['clinical_evaluation_report', 'pmcf_plan'], landsAt: 'EU MDR Annex II / IVDR PER' },
  etmf:              { id: 'etmf', label: 'Trial Master File (eTMF)', discipline: 'governance', produces: ['tmf_index', 'essential_documents'], landsAt: 'study governance' },
  market_access:     { id: 'market_access', label: 'Market Access & Coverage', discipline: 'commercial', produces: ['coverage_dossier', 'hcpcs_cpt_strategy'], landsAt: 'commercial / post-approval' },
  analytical_performance: { id: 'analytical_performance', label: 'Analytical Performance (IVD)', discipline: 'diagnostics', produces: ['precision', 'lod_loq', 'linearity', 'interference', 'analytical_performance_report'], landsAt: 'IVD analytical performance' },
  analytical_similarity:  { id: 'analytical_similarity', label: 'Analytical Similarity (biosimilar/generic)', discipline: 'quality_cmc', produces: ['similarity_assessment', 'tier_analysis', 'bioequivalence'], landsAt: 'M3.2 / comparability' },
};

/** The registry entry for an app id. */
export function getApp(id: WorkspaceAppId): AppRegistryEntry {
  return APP_REGISTRY[id];
}

/** The entitlement module id an app maps to, or undefined when always-available. */
export function appModuleId(id: WorkspaceAppId): string | undefined {
  return APP_REGISTRY[id]?.moduleId;
}

export default { APP_REGISTRY, getApp, appModuleId };
