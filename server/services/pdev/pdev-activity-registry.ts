/**
 * PDEV Activity Registry — canonical CIRM-aligned PDEV → IND activities.
 *
 * This is the **closed enum** that defines every governed PDEV activity
 * across the four workstreams (CMC, Nonclinical, Clinical, Regulatory)
 * and the five lifecycle stages (Early PDEV, Late PDEV, FDA Pre-IND
 * meeting, IND package development, post-IND clearance).
 *
 * Each activity declares:
 *   - the workstream it belongs to
 *   - the PDEV stage it gates
 *   - the required documents it produces (by stable document code)
 *   - the eCTD module / section the artifacts file into
 *   - upstream dependencies on other activity keys
 *   - the submission-impact (does it block IND assembly readiness?)
 *
 * This module is the source of truth consumed by:
 *   - server/services/pdev/pdev-orchestrator.ts
 *   - server/services/pdev/pdev-readiness-service.ts
 *   - server/services/pdev/pdev-ind-assembly.ts
 *   - server/routes/pdev/pdev-routes.ts
 *
 * Per CLAUDE.md (search-before-build / no demo rows in v2): this file
 * defines closed enums only. There are no per-program demo rows in this
 * registry — per-program state lives in the pdev_program_activities table.
 *
 * @kit-registry-no-consumer-yet — UI pane lands when the PDEV phase ships;
 * backend consumer (routes) lands in this PR.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PdevWorkstream = 'cmc' | 'nonclinical' | 'clinical' | 'regulatory';

export type PdevStage =
  | 'early_pdev'           // candidate optimization through pilot studies
  | 'late_pdev'            // IND-enabling studies / GLP / process scale-up
  | 'pre_ind_meeting'      // INTERACT through Pre-IND meeting + minutes
  | 'ind_package'          // building the IND submission
  | 'post_ind';            // clearance tracking, IRs, amendments

export type EctdModule = 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'none';

export interface PdevRequiredDocument {
  /** Stable document code, kebab-case. Stored on the artifact and on
   *  pdev_program_activities.required_documents. Must remain stable. */
  code: string;
  /** Human-readable title (sentence case). */
  title: string;
  /** eCTD module destination (or 'none' for working documents). */
  ectdModule: EctdModule;
  /** Optional eCTD section number (e.g. '3.2.S.1', '2.4'). */
  ectdSection?: string;
  /** Whether this document is required for IND submission readiness. */
  mandatoryForInd: boolean;
}

export interface PdevActivity {
  /** Stable activity key, dotted (workstream.activity). */
  key: string;
  /** Workstream. */
  workstream: PdevWorkstream;
  /** Stage where this activity is first expected. */
  stage: PdevStage;
  /** Display title (sentence case). */
  title: string;
  /** One-line description for hover/help. */
  description: string;
  /** Required governed documents this activity produces. */
  requiredDocuments: PdevRequiredDocument[];
  /** Upstream dependencies (other activity keys that should complete first). */
  dependsOn: string[];
  /** Whether incomplete state blocks IND assembly readiness. */
  blocksIndAssembly: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CMC — Candidate optimization through GMP readiness
// ─────────────────────────────────────────────────────────────────────────────

const CMC_ACTIVITIES: PdevActivity[] = [
  {
    key: 'cmc.candidate_optimization',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'Candidate optimization',
    description: 'Lead optimization and developability assessment.',
    requiredDocuments: [
      { code: 'cmc-candidate-optimization-report', title: 'Candidate optimization report', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
  {
    key: 'cmc.formulation_development',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'Formulation development',
    description: 'Dose form, excipient, and concentration development.',
    requiredDocuments: [
      { code: 'cmc-formulation-development-report', title: 'Formulation development report', ectdModule: 'm3', ectdSection: '3.2.P.2', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.candidate_optimization'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.process_development',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'Process development',
    description: 'Drug substance and drug product process development.',
    requiredDocuments: [
      { code: 'cmc-process-development-report', title: 'Process development report', ectdModule: 'm3', ectdSection: '3.2.S.2.6', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.candidate_optimization'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.ds_manufacturing',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Drug substance manufacturing',
    description: 'DS production, in-process controls, and release.',
    requiredDocuments: [
      { code: 'cmc-ds-manufacturing-summary', title: 'Drug substance manufacturing summary', ectdModule: 'm3', ectdSection: '3.2.S.2', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.process_development'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.dp_manufacturing',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Drug product manufacturing',
    description: 'DP production, in-process controls, and release.',
    requiredDocuments: [
      { code: 'cmc-dp-manufacturing-summary', title: 'Drug product manufacturing summary', ectdModule: 'm3', ectdSection: '3.2.P.3', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.formulation_development'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.gmp_readiness',
    workstream: 'cmc',
    stage: 'ind_package',
    title: 'GMP manufacturing readiness',
    description: 'Site, facility, and CDMO GMP readiness for IND.',
    requiredDocuments: [
      { code: 'cmc-gmp-readiness-memo', title: 'GMP readiness memo', ectdModule: 'm3', ectdSection: '3.2.A.1', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.ds_manufacturing', 'cmc.dp_manufacturing'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.analytical_method_development',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'Analytical method development',
    description: 'Identity, purity, potency, and impurity methods.',
    requiredDocuments: [
      { code: 'cmc-analytical-method-development-report', title: 'Analytical method development report', ectdModule: 'm3', ectdSection: '3.2.S.4.2', mandatoryForInd: true },
    ],
    dependsOn: [],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.analytical_qualification',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Analytical qualification',
    description: 'Method qualification or validation per ICH Q2(R1).',
    requiredDocuments: [
      { code: 'cmc-analytical-qualification-report', title: 'Analytical qualification report', ectdModule: 'm3', ectdSection: '3.2.S.4.3', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.analytical_method_development'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.specifications',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Specifications',
    description: 'DS and DP release and stability specifications.',
    requiredDocuments: [
      { code: 'cmc-ds-specifications', title: 'Drug substance specifications', ectdModule: 'm3', ectdSection: '3.2.S.4.1', mandatoryForInd: true },
      { code: 'cmc-dp-specifications', title: 'Drug product specifications', ectdModule: 'm3', ectdSection: '3.2.P.5.1', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.analytical_qualification'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.stability_program',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Stability program',
    description: 'Stability protocols and ongoing study data.',
    requiredDocuments: [
      { code: 'cmc-stability-protocol', title: 'Stability protocol', ectdModule: 'm3', ectdSection: '3.2.S.7.1', mandatoryForInd: true },
      { code: 'cmc-stability-summary', title: 'Stability summary', ectdModule: 'm3', ectdSection: '3.2.S.7.3', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.specifications'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.comparability',
    workstream: 'cmc',
    stage: 'late_pdev',
    title: 'Comparability assessment',
    description: 'Cross-batch and cross-process comparability per ICH Q5E.',
    requiredDocuments: [
      { code: 'cmc-comparability-assessment', title: 'Comparability assessment', ectdModule: 'm3', ectdSection: '3.2.S.2.6', mandatoryForInd: false },
    ],
    dependsOn: ['cmc.ds_manufacturing'],
    blocksIndAssembly: false,
  },
  {
    key: 'cmc.batch_records',
    workstream: 'cmc',
    stage: 'ind_package',
    title: 'Batch records',
    description: 'Executed batch records for IND clinical material.',
    requiredDocuments: [
      { code: 'cmc-batch-records-summary', title: 'Batch records summary', ectdModule: 'm3', ectdSection: '3.2.P.3.4', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.dp_manufacturing'],
    blocksIndAssembly: true,
  },
  {
    key: 'cmc.cdmo_vendor_qualification',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'CDMO and vendor qualification',
    description: 'Manufacturing site, vendor, and CDMO qualification evidence.',
    requiredDocuments: [
      { code: 'cmc-cdmo-vendor-evidence', title: 'CDMO and vendor evidence', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
  {
    key: 'cmc.development_plan',
    workstream: 'cmc',
    stage: 'early_pdev',
    title: 'CMC development plan',
    description: 'Cross-activity CMC plan and decision register.',
    requiredDocuments: [
      { code: 'cmc-development-plan', title: 'CMC development plan', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Nonclinical — pilot studies through IND-enabling
// ─────────────────────────────────────────────────────────────────────────────

const NONCLINICAL_ACTIVITIES: PdevActivity[] = [
  {
    key: 'nonclinical.development_plan',
    workstream: 'nonclinical',
    stage: 'early_pdev',
    title: 'Nonclinical development plan',
    description: 'Cross-study plan and dose-selection strategy.',
    requiredDocuments: [
      { code: 'nonclinical-development-plan', title: 'Nonclinical development plan', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
  {
    key: 'nonclinical.pilot_drf',
    workstream: 'nonclinical',
    stage: 'early_pdev',
    title: 'Pilot dose-range finding',
    description: 'Pilot DRF study to inform GLP study design.',
    requiredDocuments: [
      { code: 'nonclinical-pilot-drf-summary', title: 'Pilot DRF summary', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: false },
    ],
    dependsOn: ['nonclinical.development_plan'],
    blocksIndAssembly: false,
  },
  {
    key: 'nonclinical.pilot_safety_tox',
    workstream: 'nonclinical',
    stage: 'early_pdev',
    title: 'Pilot safety / toxicology',
    description: 'Pilot tox studies to triage candidates.',
    requiredDocuments: [
      { code: 'nonclinical-pilot-tox-summary', title: 'Pilot tox summary', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: false },
    ],
    dependsOn: ['nonclinical.development_plan'],
    blocksIndAssembly: false,
  },
  {
    key: 'nonclinical.efficacy',
    workstream: 'nonclinical',
    stage: 'early_pdev',
    title: 'Pharmacology and efficacy studies',
    description: 'In vivo and in vitro pharmacology / efficacy.',
    requiredDocuments: [
      { code: 'nonclinical-pharmacology-summary', title: 'Pharmacology / efficacy summary', ectdModule: 'm4', ectdSection: '4.2.1', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.development_plan'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.glp_tox',
    workstream: 'nonclinical',
    stage: 'late_pdev',
    title: 'GLP toxicology studies',
    description: 'IND-enabling GLP tox in two species per ICH M3(R2).',
    requiredDocuments: [
      { code: 'nonclinical-glp-tox-study-plan', title: 'GLP tox study plan', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: true },
      { code: 'nonclinical-glp-tox-study-summary', title: 'GLP tox study summary', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.pilot_safety_tox'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.pkpd_linkage',
    workstream: 'nonclinical',
    stage: 'late_pdev',
    title: 'PK / PD linkage',
    description: 'Cross-species PK and PK/PD modelling.',
    requiredDocuments: [
      { code: 'nonclinical-pkpd-summary', title: 'PK / PD summary', ectdModule: 'm4', ectdSection: '4.2.2', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.pilot_drf'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.species_justification',
    workstream: 'nonclinical',
    stage: 'late_pdev',
    title: 'Species justification',
    description: 'Justification of species choice for GLP tox.',
    requiredDocuments: [
      { code: 'nonclinical-species-rationale', title: 'Species rationale memo', ectdModule: 'm4', ectdSection: '4.2.3', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.efficacy', 'nonclinical.pkpd_linkage'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.safety_margins',
    workstream: 'nonclinical',
    stage: 'ind_package',
    title: 'Safety margins',
    description: 'Cross-study safety margin assessment supporting first dose.',
    requiredDocuments: [
      { code: 'nonclinical-safety-margin-assessment', title: 'Safety margin assessment', ectdModule: 'm2', ectdSection: '2.6.6', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.glp_tox', 'nonclinical.pkpd_linkage'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.study_reports',
    workstream: 'nonclinical',
    stage: 'ind_package',
    title: 'Nonclinical study reports',
    description: 'Final study reports filed into Module 4.',
    requiredDocuments: [
      { code: 'nonclinical-study-reports-index', title: 'Nonclinical study reports index', ectdModule: 'm4', ectdSection: '4.3', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.glp_tox'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.ind_enabling_summary',
    workstream: 'nonclinical',
    stage: 'ind_package',
    title: 'IND-enabling evidence summary',
    description: 'Module 2.4 written summary of nonclinical evidence.',
    requiredDocuments: [
      { code: 'nonclinical-module-2-4-summary', title: 'Nonclinical overview (Module 2.4)', ectdModule: 'm2', ectdSection: '2.4', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.study_reports', 'nonclinical.safety_margins'],
    blocksIndAssembly: true,
  },
  {
    key: 'nonclinical.dose_selection_rationale',
    workstream: 'nonclinical',
    stage: 'ind_package',
    title: 'First-in-human dose selection rationale',
    description: 'NOAEL-based / MABEL-based dose selection memo.',
    requiredDocuments: [
      { code: 'nonclinical-first-dose-rationale', title: 'First-in-human dose rationale', ectdModule: 'm2', ectdSection: '2.4', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.safety_margins'],
    blocksIndAssembly: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Clinical — development plan through trial startup
// ─────────────────────────────────────────────────────────────────────────────

const CLINICAL_ACTIVITIES: PdevActivity[] = [
  {
    key: 'clinical.development_plan',
    workstream: 'clinical',
    stage: 'late_pdev',
    title: 'Clinical development plan',
    description: 'Phase-by-phase clinical development strategy.',
    requiredDocuments: [
      { code: 'clinical-development-plan', title: 'Clinical development plan', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
  {
    key: 'clinical.protocol_synopsis',
    workstream: 'clinical',
    stage: 'late_pdev',
    title: 'Protocol synopsis',
    description: 'Short-form protocol synopsis for Pre-IND.',
    requiredDocuments: [
      { code: 'clinical-protocol-synopsis', title: 'Protocol synopsis', ectdModule: 'm5', ectdSection: '5.3.5', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.development_plan'],
    blocksIndAssembly: true,
  },
  {
    key: 'clinical.full_protocol',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Full clinical protocol',
    description: 'Final FIH protocol filed in Module 5.',
    requiredDocuments: [
      { code: 'clinical-full-protocol', title: 'Full clinical protocol', ectdModule: 'm5', ectdSection: '5.3.5', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.protocol_synopsis'],
    blocksIndAssembly: true,
  },
  {
    key: 'clinical.endpoint_rationale',
    workstream: 'clinical',
    stage: 'late_pdev',
    title: 'Endpoint rationale',
    description: 'Justification of primary and secondary endpoints.',
    requiredDocuments: [
      { code: 'clinical-endpoint-rationale', title: 'Endpoint rationale memo', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['clinical.development_plan'],
    blocksIndAssembly: false,
  },
  {
    key: 'clinical.statistical_assumptions',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Statistical assumptions',
    description: 'Power, sample size, and analysis assumptions.',
    requiredDocuments: [
      { code: 'clinical-statistical-assumptions', title: 'Statistical assumptions memo', ectdModule: 'm5', ectdSection: '5.3.5', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.endpoint_rationale'],
    blocksIndAssembly: true,
  },
  {
    key: 'clinical.trial_startup',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Trial startup checklist',
    description: 'IRB, site activation, and supplies readiness.',
    requiredDocuments: [
      { code: 'clinical-trial-startup-checklist', title: 'Trial startup checklist', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['clinical.full_protocol'],
    blocksIndAssembly: false,
  },
  {
    key: 'clinical.site_access_plan',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Site and access plan',
    description: 'Site selection, patient access, and enrollment strategy.',
    requiredDocuments: [
      { code: 'clinical-site-access-plan', title: 'Site and access plan', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['clinical.full_protocol'],
    blocksIndAssembly: false,
  },
  {
    key: 'clinical.safety_monitoring',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Safety monitoring plan',
    description: 'DSMB charter, stopping rules, and pharmacovigilance plan.',
    requiredDocuments: [
      { code: 'clinical-safety-monitoring-plan', title: 'Safety monitoring plan', ectdModule: 'm5', ectdSection: '5.3.5', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.full_protocol'],
    blocksIndAssembly: true,
  },
  {
    key: 'clinical.investigator_brochure',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Investigator brochure',
    description: 'IB source summary; full IB lives outside Module 5.',
    requiredDocuments: [
      { code: 'clinical-investigator-brochure-source', title: 'IB source summary', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.full_protocol'],
    blocksIndAssembly: true,
  },
  {
    key: 'clinical.protocol_risk_assessment',
    workstream: 'clinical',
    stage: 'ind_package',
    title: 'Protocol risk assessment',
    description: 'Cross-protocol risk assessment incorporating nonclinical safety.',
    requiredDocuments: [
      { code: 'clinical-protocol-risk-assessment', title: 'Protocol risk assessment', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['clinical.full_protocol', 'nonclinical.safety_margins'],
    blocksIndAssembly: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory — INTERACT through IND clearance
// ─────────────────────────────────────────────────────────────────────────────

const REGULATORY_ACTIVITIES: PdevActivity[] = [
  {
    key: 'regulatory.strategy_memo',
    workstream: 'regulatory',
    stage: 'early_pdev',
    title: 'Regulatory strategy memo',
    description: 'Cross-program regulatory strategy and pathway choice.',
    requiredDocuments: [
      { code: 'regulatory-strategy-memo', title: 'Regulatory strategy memo', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: [],
    blocksIndAssembly: false,
  },
  {
    key: 'regulatory.interact_request',
    workstream: 'regulatory',
    stage: 'early_pdev',
    title: 'INTERACT request',
    description: 'CDER INTERACT meeting request package.',
    requiredDocuments: [
      { code: 'regulatory-interact-request', title: 'INTERACT request', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['regulatory.strategy_memo'],
    blocksIndAssembly: false,
  },
  {
    key: 'regulatory.interact_briefing',
    workstream: 'regulatory',
    stage: 'early_pdev',
    title: 'INTERACT briefing package',
    description: 'INTERACT meeting briefing package.',
    requiredDocuments: [
      { code: 'regulatory-interact-briefing', title: 'INTERACT briefing package', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['regulatory.interact_request'],
    blocksIndAssembly: false,
  },
  {
    key: 'regulatory.pre_ind_request',
    workstream: 'regulatory',
    stage: 'pre_ind_meeting',
    title: 'Pre-IND meeting request',
    description: 'Type B Pre-IND meeting request.',
    requiredDocuments: [
      { code: 'regulatory-pre-ind-request', title: 'Pre-IND meeting request', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['regulatory.strategy_memo'],
    blocksIndAssembly: false,
  },
  {
    key: 'regulatory.pre_ind_briefing',
    workstream: 'regulatory',
    stage: 'pre_ind_meeting',
    title: 'Pre-IND briefing book',
    description: 'Pre-IND briefing book with questions and supporting data.',
    requiredDocuments: [
      { code: 'regulatory-pre-ind-briefing-book', title: 'Pre-IND briefing book', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: [
      'regulatory.pre_ind_request',
      'cmc.development_plan',
      'nonclinical.development_plan',
      'clinical.development_plan',
    ],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.fda_questions',
    workstream: 'regulatory',
    stage: 'pre_ind_meeting',
    title: 'FDA question list',
    description: 'Curated list of sponsor questions for FDA.',
    requiredDocuments: [
      { code: 'regulatory-fda-question-list', title: 'FDA question list', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['regulatory.pre_ind_briefing'],
    blocksIndAssembly: false,
  },
  {
    key: 'regulatory.fda_meeting_minutes',
    workstream: 'regulatory',
    stage: 'pre_ind_meeting',
    title: 'FDA meeting minutes',
    description: 'Official FDA Pre-IND meeting minutes and sponsor notes.',
    requiredDocuments: [
      { code: 'regulatory-fda-meeting-minutes', title: 'FDA meeting minutes', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.fda_questions'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.fda_feedback_tracker',
    workstream: 'regulatory',
    stage: 'pre_ind_meeting',
    title: 'FDA feedback tracker',
    description: 'Tracker linking each FDA comment to a downstream action.',
    requiredDocuments: [
      { code: 'regulatory-fda-feedback-tracker', title: 'FDA feedback tracker', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.fda_meeting_minutes'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.ind_readiness',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'IND readiness assessment',
    description: 'Cross-workstream IND readiness check.',
    requiredDocuments: [
      { code: 'regulatory-ind-readiness-assessment', title: 'IND readiness assessment', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.fda_feedback_tracker'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.ind_submission_checklist',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'IND submission checklist',
    description: 'Submission-day checklist with sign-off owners.',
    requiredDocuments: [
      { code: 'regulatory-ind-submission-checklist', title: 'IND submission checklist', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.ind_readiness'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.ind_module_map',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'IND module map',
    description: 'Map of all artifacts to eCTD module / section.',
    requiredDocuments: [
      { code: 'regulatory-ind-module-map', title: 'IND module map', ectdModule: 'none', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.ind_readiness'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.cover_letter',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Cover letter',
    description: 'IND cover letter (Module 1.1).',
    requiredDocuments: [
      { code: 'regulatory-ind-cover-letter', title: 'IND cover letter', ectdModule: 'm1', ectdSection: '1.1', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.ind_module_map'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.module_1_admin',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Module 1 administrative package',
    description: 'Forms 1571 / 1572 / 3674, statement of investigator, and admin.',
    requiredDocuments: [
      { code: 'regulatory-module-1-admin', title: 'Module 1 administrative package', ectdModule: 'm1', ectdSection: '1', mandatoryForInd: true },
    ],
    dependsOn: ['regulatory.cover_letter'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.module_2_summaries',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Module 2 summaries',
    description: 'CTD summaries (2.2, 2.3, 2.4, 2.5, 2.6, 2.7).',
    requiredDocuments: [
      { code: 'regulatory-module-2-summaries', title: 'Module 2 summaries', ectdModule: 'm2', ectdSection: '2', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.ind_enabling_summary', 'cmc.specifications'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.module_3_cmc',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Module 3 CMC package',
    description: 'CMC dossier filed in Module 3.',
    requiredDocuments: [
      { code: 'regulatory-module-3-cmc', title: 'Module 3 CMC package', ectdModule: 'm3', ectdSection: '3', mandatoryForInd: true },
    ],
    dependsOn: ['cmc.gmp_readiness', 'cmc.batch_records', 'cmc.stability_program'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.module_4_nonclinical',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Module 4 nonclinical package',
    description: 'Nonclinical study reports filed in Module 4.',
    requiredDocuments: [
      { code: 'regulatory-module-4-nonclinical', title: 'Module 4 nonclinical package', ectdModule: 'm4', ectdSection: '4', mandatoryForInd: true },
    ],
    dependsOn: ['nonclinical.study_reports', 'nonclinical.ind_enabling_summary'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.module_5_clinical',
    workstream: 'regulatory',
    stage: 'ind_package',
    title: 'Module 5 clinical package',
    description: 'Clinical protocol and IB filed in Module 5.',
    requiredDocuments: [
      { code: 'regulatory-module-5-clinical', title: 'Module 5 clinical package', ectdModule: 'm5', ectdSection: '5', mandatoryForInd: true },
    ],
    dependsOn: ['clinical.full_protocol', 'clinical.safety_monitoring', 'clinical.investigator_brochure'],
    blocksIndAssembly: true,
  },
  {
    key: 'regulatory.ind_clearance',
    workstream: 'regulatory',
    stage: 'post_ind',
    title: 'IND clearance tracking',
    description: 'Post-submission FDA clock, IRs, holds, and clearance status.',
    requiredDocuments: [
      { code: 'regulatory-ind-clearance-status', title: 'IND clearance status report', ectdModule: 'none', mandatoryForInd: false },
    ],
    dependsOn: ['regulatory.ind_submission_checklist'],
    blocksIndAssembly: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const PDEV_ACTIVITIES: readonly PdevActivity[] = Object.freeze([
  ...CMC_ACTIVITIES,
  ...NONCLINICAL_ACTIVITIES,
  ...CLINICAL_ACTIVITIES,
  ...REGULATORY_ACTIVITIES,
]);

const ACTIVITIES_BY_KEY: ReadonlyMap<string, PdevActivity> = new Map(
  PDEV_ACTIVITIES.map(a => [a.key, a])
);

export function getActivityByKey(key: string): PdevActivity | undefined {
  return ACTIVITIES_BY_KEY.get(key);
}

export function getActivitiesByWorkstream(workstream: PdevWorkstream): PdevActivity[] {
  return PDEV_ACTIVITIES.filter(a => a.workstream === workstream);
}

export function getActivitiesByStage(stage: PdevStage): PdevActivity[] {
  return PDEV_ACTIVITIES.filter(a => a.stage === stage);
}

export const PDEV_WORKSTREAMS: readonly PdevWorkstream[] = Object.freeze([
  'cmc',
  'nonclinical',
  'clinical',
  'regulatory',
]);

export const PDEV_STAGES: readonly PdevStage[] = Object.freeze([
  'early_pdev',
  'late_pdev',
  'pre_ind_meeting',
  'ind_package',
  'post_ind',
]);

/** Per-program activity state lifecycle. Mirrors the brief's required states
 *  while remaining compatible with existing approval / lifecycle enums. */
export const PDEV_ACTIVITY_STATES = [
  'not_started',
  'drafting',
  'ai_draft_generated',
  'evidence_linked',
  'human_review_required',
  'in_review',
  'changes_requested',
  'approved',
  'locked',
  'submission_ready',
  'submitted',
  'agency_feedback_received',
  'revision_required',
  'superseded',
] as const;

export type PdevActivityState = (typeof PDEV_ACTIVITY_STATES)[number];

/** Subset of states that count as "complete" for readiness rollup math. */
export const PDEV_COMPLETED_STATES: readonly PdevActivityState[] = Object.freeze([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

/** Subset that counts as "in flight". */
export const PDEV_IN_FLIGHT_STATES: readonly PdevActivityState[] = Object.freeze([
  'drafting',
  'ai_draft_generated',
  'evidence_linked',
  'human_review_required',
  'in_review',
  'changes_requested',
  'agency_feedback_received',
  'revision_required',
]);
