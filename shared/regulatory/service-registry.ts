/**
 * Service registry — the catalog of inline/AnA capabilities and the selection
 * logic that decides which are in scope for a given document type.
 *
 * Services are capabilities with NO standalone workspace — they feed AnA and
 * are invoked inline while the client authors. Each maps to a real backend
 * service domain. The selected document type decides which are in scope.
 *
 * Extracted from workspace-config.ts for modularity (the service catalog is
 * self-contained and growing). workspace-config re-exports the types so
 * downstream consumers are unaffected.
 *
 * @module shared/regulatory/service-registry
 */

import type { ApplicationFamily, ProductClass } from './document-taxonomy.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type WorkspaceScope = 'dossier' | 'document' | 'record' | 'registration';
export type WorkspaceVocabulary = 'drug' | 'device' | 'ivd' | 'quality' | 'generic';

export type WorkspaceServiceId =
  | 'knowledge_base'             // ICH / pathways / standards / deficiencies lookup
  | 'regulatory_intelligence'   // CRL/RTF prediction, blended readiness scoring
  | 'cross_artifact_intelligence' // consistency across the dossier
  | 'readiness_assessment'      // per-domain readiness verdicts
  | 'precedent_intelligence'    // precedent mining / predicate intelligence
  | 'literature_search'         // PubMed / scientific literature
  | 'evidence_search'           // evidence fabric / sufficiency
  | 'cdisc_validation'          // SDTM / ADaM conformance
  | 'statistical_defensibility' // endpoint / power sanity (thin; not the biostat app)
  | 'substantial_equivalence_check' // predicate comparison analysis (device/IVD)
  | 'external_intelligence'    // agency feeds / review-timeline signals
  | 'compliance_calendar'      // post-approval obligation deadlines + escalation
  | 'change_control'           // post-approval change classification + vehicle routing
  | 'health_economics'         // HTA intelligence, value evidence, reimbursement routing
  | 'special_designations'     // expedited programs, orphan, breakthrough eligibility
  | 'pediatric_intelligence'   // pediatric study-plan obligations (PREA iPSP, PIP)
  | 'inspection_readiness'     // PAI/BIMO/GMP readiness assessment
  | 'controlled_substances'    // DEA scheduling, handling controls, perpetual inventory
  | 'cdx_intelligence'         // companion-diagnostic pairing, biomarker validity, co-development
  | 'financial_disclosures'    // 21 CFR 54 FCOI — investigator financial disclosure (3454/3455)
  | 'cmc_consistency'          // CMC contradiction detection across specs, stability, batches
  | 'dose_optimization'        // exposure-response / Project Optimus dose selection
  | 'effort_certification'    // 2 CFR 200.430 personnel effort certification (grant-funded)
  | 'study_design_judgment'   // biostatistics judgment pipeline (power, fragility, defensibility)
  | 'nonclinical_send'        // SEND domain validation + CTD M4 routing + readiness gate
  | 'estimand_framework'      // ICH E9(R1) estimand definition, multiplicity strategy
  | 'endpoint_intelligence'   // endpoint recommendation from CSR corpus + regulatory guidance
  | 'contradiction_detection' // formal contradiction governance (authority states, overlays)
  | 'biologics_pathway'       // modality-specific pathways + biosimilar requirements
  | 'combination_product'     // FDA OCP primary mode determination + regulatory mapping
  | 'rwe_analytics'           // real-world evidence study design + FHIR execution
  | 'external_control_arm'    // external/historical control synthesis (PSM, IPW, Bayesian)
  | 'outcome_prediction'      // regulatory outcome prediction from CSR precedent corpus
  | 'adaptive_trial_operations' // interim analysis, stopping rules, IDMC reporting
  | 'fih_dose_derivation'     // MRSD/MABEL first-in-human starting dose computation
  | 'reviewer_simulation'     // anticipated reviewer questions by persona
  | 'analytical_method_validation'; // ICH Q2(R2) method validation assessment

export interface WorkspaceService {
  id: WorkspaceServiceId;
  label: string;
  /** Where the capability shows up. */
  feeds: 'ana' | 'inline' | 'both';
}

// ─── Catalog ────────────────────────────────────────────────────────────────

const SERVICE_CATALOG: Record<WorkspaceServiceId, Omit<WorkspaceService, 'id'>> = {
  knowledge_base:               { label: 'Knowledge base (ICH / standards / deficiencies)', feeds: 'both' },
  regulatory_intelligence:      { label: 'Regulatory intelligence (CRL/RTF, readiness)', feeds: 'both' },
  cross_artifact_intelligence:  { label: 'Cross-artifact consistency', feeds: 'ana' },
  readiness_assessment:         { label: 'Readiness assessment', feeds: 'both' },
  precedent_intelligence:       { label: 'Precedent / predicate intelligence', feeds: 'both' },
  literature_search:            { label: 'Literature search', feeds: 'inline' },
  evidence_search:              { label: 'Evidence search / sufficiency', feeds: 'both' },
  cdisc_validation:             { label: 'CDISC validation (SDTM / ADaM)', feeds: 'inline' },
  statistical_defensibility:    { label: 'Statistical defensibility check', feeds: 'ana' },
  substantial_equivalence_check:{ label: 'Substantial-equivalence check', feeds: 'both' },
  external_intelligence:        { label: 'External agency intelligence', feeds: 'ana' },
  compliance_calendar:          { label: 'Compliance calendar (obligations & deadlines)', feeds: 'both' },
  change_control:               { label: 'Change-control classification & vehicle routing', feeds: 'both' },
  health_economics:             { label: 'Health-economics & market-access intelligence', feeds: 'both' },
  special_designations:         { label: 'Special designations & expedited programs', feeds: 'both' },
  pediatric_intelligence:       { label: 'Pediatric study-plan obligations (PREA/PIP)', feeds: 'both' },
  inspection_readiness:         { label: 'Inspection readiness (PAI/BIMO/GMP)', feeds: 'both' },
  controlled_substances:        { label: 'Controlled-substances scheduling & compliance', feeds: 'both' },
  cdx_intelligence:             { label: 'Companion-diagnostic pairing & co-development', feeds: 'both' },
  financial_disclosures:        { label: 'Financial disclosures (21 CFR 54 FCOI)', feeds: 'both' },
  cmc_consistency:              { label: 'CMC consistency & contradiction detection', feeds: 'both' },
  dose_optimization:            { label: 'Dose optimization (exposure-response / Project Optimus)', feeds: 'both' },
  effort_certification:         { label: 'Effort certification (2 CFR 200.430)', feeds: 'both' },
  study_design_judgment:        { label: 'Study-design judgment (power / fragility / defensibility)', feeds: 'both' },
  nonclinical_send:             { label: 'Nonclinical SEND validation & CTD M4 routing', feeds: 'both' },
  estimand_framework:           { label: 'Estimand framework (ICH E9(R1) / multiplicity)', feeds: 'both' },
  endpoint_intelligence:        { label: 'Endpoint intelligence (CSR corpus / regulatory precedent)', feeds: 'both' },
  contradiction_detection:      { label: 'Contradiction detection & governance (authority / overlays)', feeds: 'ana' },
  biologics_pathway:            { label: 'Biologics pathway intelligence (modality / biosimilar)', feeds: 'both' },
  combination_product:          { label: 'Combination-product classification (FDA OCP / primary mode)', feeds: 'both' },
  rwe_analytics:                { label: 'Real-world evidence analytics (FHIR / comparative cohort)', feeds: 'both' },
  external_control_arm:         { label: 'External control-arm synthesis (PSM / IPW / Bayesian borrowing)', feeds: 'both' },
  outcome_prediction:           { label: 'Regulatory outcome prediction (design → success rate)', feeds: 'both' },
  adaptive_trial_operations:    { label: 'Adaptive trial operations (interim analysis / IDMC / stopping rules)', feeds: 'both' },
  fih_dose_derivation:          { label: 'First-in-human dose derivation (MRSD / MABEL)', feeds: 'both' },
  reviewer_simulation:          { label: 'Reviewer simulation (anticipated questions by persona)', feeds: 'ana' },
  analytical_method_validation: { label: 'Analytical method validation (ICH Q2(R2))', feeds: 'both' },
};

export function getService(id: WorkspaceServiceId): WorkspaceService {
  return { id, ...SERVICE_CATALOG[id] };
}

// ─── Selection logic ────────────────────────────────────────────────────────

/** Decide which inline/AnA services are in scope for this selection. */
export function servicesFor(opts: {
  scope: WorkspaceScope;
  vocabulary: WorkspaceVocabulary;
  family: ApplicationFamily | null;
  ctdModule: string | null;
  productClasses: ProductClass[];
  isRegulatory: boolean;
}): WorkspaceService[] {
  const { scope, vocabulary, family, ctdModule, productClasses, isRegulatory } = opts;
  const ids = new Set<WorkspaceServiceId>(['knowledge_base', 'cross_artifact_intelligence']);

  // Non-regulatory docs (SOP/WI) get authoring aids only — no agency intelligence.
  if (!isRegulatory) {
    return [...ids].map(getService);
  }

  ids.add('regulatory_intelligence');
  ids.add('readiness_assessment');

  const mod = (ctdModule ?? '').toUpperCase();
  const spansAll = scope === 'dossier';
  const isDeviceOrIvd =
    vocabulary === 'device' || vocabulary === 'ivd' ||
    productClasses.includes('medical_device') || productClasses.includes('ivd');
  const isClinical = spansAll || mod.includes('M5') || family === 'clinical_document' || family === 'clinical_trial';

  if (isClinical) {
    ids.add('literature_search');
    ids.add('evidence_search');
    ids.add('cdisc_validation');
    ids.add('statistical_defensibility');
    ids.add('precedent_intelligence');
  }
  if (isDeviceOrIvd) {
    ids.add('precedent_intelligence');
    ids.add('evidence_search');
    if (family === 'device_clearance' || scope === 'dossier') ids.add('substantial_equivalence_check');
  }
  if (scope === 'dossier') ids.add('external_intelligence');

  if (scope === 'dossier' || scope === 'registration' || family === 'safety_report') {
    ids.add('compliance_calendar');
    ids.add('change_control');
  }
  if (family === 'supplement' || family === 'variation') {
    ids.add('change_control');
  }

  if (family === 'marketing_authorization' || family === 'device_approval' || family === 'device_clearance') {
    ids.add('health_economics');
  }

  if (
    family === 'clinical_trial' || family === 'marketing_authorization' ||
    family === 'device_approval' || family === 'device_clearance' ||
    family === 'designation' || family === 'orphan'
  ) {
    ids.add('special_designations');
  }

  if (
    family === 'marketing_authorization' || family === 'clinical_trial' ||
    family === 'pediatric'
  ) {
    ids.add('pediatric_intelligence');
  }

  if (scope === 'dossier' || family === 'marketing_authorization' || family === 'device_approval') {
    ids.add('inspection_readiness');
  }

  if (
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (scope === 'dossier' || family === 'clinical_trial' || family === 'marketing_authorization')
  ) {
    ids.add('controlled_substances');
  }

  if (
    family === 'companion_diagnostic' ||
    (vocabulary === 'ivd' && scope === 'dossier')
  ) {
    ids.add('cdx_intelligence');
  }

  if (
    family === 'clinical_trial' || family === 'marketing_authorization' ||
    (isClinical && scope === 'dossier')
  ) {
    ids.add('financial_disclosures');
  }

  if (
    scope === 'dossier' ||
    mod.includes('M3') ||
    family === 'marketing_authorization' || family === 'device_approval'
  ) {
    ids.add('cmc_consistency');
  }

  if (
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (family === 'clinical_trial' || family === 'marketing_authorization' || scope === 'dossier')
  ) {
    ids.add('dose_optimization');
  }

  if (family === 'clinical_trial') {
    ids.add('effort_certification');
  }

  // Study-design judgment: clinical drug/biologic dossiers and clinical trial families
  if (
    isClinical &&
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (scope === 'dossier' || family === 'clinical_trial' || family === 'marketing_authorization')
  ) {
    ids.add('study_design_judgment');
  }

  // Nonclinical SEND validation: drug dossiers with M4 scope
  if (
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (spansAll || mod.includes('M4') || family === 'clinical_trial' || family === 'marketing_authorization')
  ) {
    ids.add('nonclinical_send');
  }

  // Estimand framework: clinical trial design and M5 analysis plans
  if (
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (family === 'clinical_trial' || mod.includes('M5') || (isClinical && scope === 'dossier'))
  ) {
    ids.add('estimand_framework');
  }

  // Endpoint intelligence: clinical trial design and marketing authorization
  if (
    family === 'clinical_trial' || family === 'marketing_authorization' ||
    family === 'device_approval' || family === 'device_clearance' ||
    (isClinical && scope === 'dossier')
  ) {
    ids.add('endpoint_intelligence');
  }

  // Contradiction detection: dossier-level governance
  if (scope === 'dossier') {
    ids.add('contradiction_detection');
  }

  // Biologics pathway: biologic/biosimilar/atmp/vaccine product classes
  if (
    productClasses.some((p) =>
      ['biologic', 'biosimilar', 'atmp', 'vaccine'].includes(p),
    )
  ) {
    ids.add('biologics_pathway');
  }

  // Combination product: when multiple product classes span drug+device/IVD
  if (
    productClasses.length >= 2 &&
    productClasses.some((p) => ['small_molecule', 'biologic', 'biosimilar'].includes(p)) &&
    productClasses.some((p) => ['medical_device', 'ivd'].includes(p))
  ) {
    ids.add('combination_product');
  }

  // RWE analytics: clinical dossier work where real-world data can inform design
  if (
    isClinical &&
    (family === 'marketing_authorization' || family === 'clinical_trial' || scope === 'dossier')
  ) {
    ids.add('rwe_analytics');
  }

  // External control arm: single-arm or accelerated approval contexts
  if (
    isClinical &&
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (family === 'clinical_trial' || family === 'marketing_authorization' || scope === 'dossier')
  ) {
    ids.add('external_control_arm');
  }

  // Outcome prediction: strategy-phase design optimization
  if (
    family === 'clinical_trial' || family === 'marketing_authorization' ||
    family === 'device_approval' || family === 'device_clearance' ||
    scope === 'dossier'
  ) {
    ids.add('outcome_prediction');
  }

  // Adaptive trial operations: interim analysis and IDMC reporting for adaptive designs
  if (
    isClinical &&
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (family === 'clinical_trial' || family === 'marketing_authorization' || scope === 'dossier')
  ) {
    ids.add('adaptive_trial_operations');
  }

  // FIH dose derivation: MRSD/MABEL computation for first-in-human studies
  if (
    (vocabulary === 'drug' || vocabulary === 'generic') &&
    (family === 'clinical_trial' || family === 'marketing_authorization' ||
     (spansAll && (mod.includes('M4') || isClinical)))
  ) {
    ids.add('fih_dose_derivation');
  }

  // Reviewer simulation: anticipated questions for any regulatory submission
  if (scope === 'dossier') {
    ids.add('reviewer_simulation');
  }

  // Analytical method validation: ICH Q2(R2) for CMC/analytical dossiers
  if (
    scope === 'dossier' ||
    mod.includes('M3') ||
    family === 'marketing_authorization' || family === 'device_approval'
  ) {
    ids.add('analytical_method_validation');
  }

  return [...ids].map(getService);
}
