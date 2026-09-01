/**
 * CMC Write-Through Service
 *
 * Ensures every CMC data-entry save (drug substance, drug product, analytical method,
 * stability study, specification, batch record, change control, comparability, etc.)
 * automatically upserts a canonical source object in cmc_source_objects and marks
 * impacted Module 3 sections stale.
 *
 * This closes the gap between legacy CMC data tables and the Module 3 canonical layer.
 *
 * Usage: call `writeThroughToCanonicalSource(...)` after any CMC create/update that
 * should feed Module 3 documentation.
 */

import { getPool } from '../db';
import { createSourceHash } from './cmc-module3-compiler';
import {
  FINISHED_PRODUCT,
  NON_BATCH_SAMPLE_TYPES,
  impactedSectionsForSourceType,
  normalizeMaterialScope,
  type CmcSourceType,
} from './module3Composer';
import unifiedTaskService from './unifiedTaskService';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WriteThroughResult {
  sourceObjectId: string;
  sourceHash: string;
  staleSections: string[];
  isNew: boolean;
}

interface WriteThroughInput {
  orgId: number;
  projectId: string;
  sourceType: CmcSourceType;
  /** Unique key within (projectId, sourceType) — e.g. record UUID or table:id */
  sourceKey: string;
  /** The payload that Module 3 composition will read */
  sourcePayload: Record<string, any>;
  /** Who triggered this write (userId or 'system') */
  createdBy?: string;
  /** If true, auto-creates a review/approval task in the unified task system */
  createReviewTask?: boolean;
  /** Numeric project ID for the unified task system (concept2cure projects table) */
  numericProjectId?: number;
}

/** Human-readable labels for CMC source types */
const SOURCE_TYPE_LABELS: Record<string, string> = {
  drug_substance: 'Drug Substance',
  drug_product: 'Drug Product',
  method: 'Analytical Method',
  stability: 'Stability Study',
  specification: 'Specification',
  batch: 'Batch Record',
  change_control: 'Change Control',
  comparability: 'Comparability Assessment',
  process_validation: 'Process Validation',
  manufacturing_process: 'Manufacturing Process',
  characterization: 'Characterization',
  reference_standard: 'Reference Standard',
  container_closure: 'Container Closure',
  excipient: 'Excipient',
};

// ── Mapping helpers: legacy CMC record → canonical source payload ─────────

/**
 * A compact textual projection of a record's own json (criteria, controls) for
 * payload keys the composer reads as TEXT (`val()` renders String(v), so an
 * object would print "[object Object]" into a narrative). Nothing is
 * invented — every key and value is the record's own; anything non-scalar is
 * simply omitted from the projection.
 */
function textOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join('; ');
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => {
        // An EMPTY value is not a fact — "release: " must never survive into
        // a payload where its truthiness fakes a limit nobody entered.
        if (typeof x === 'string' && x.trim()) return `${k}: ${x.trim()}`;
        if (typeof x === 'number') return `${k}: ${x}`;
        return '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}


/**
 * Does this recorded result carry an actual measurement?
 *
 * §3.2.S.4.4 / §3.2.P.5.4 require quantitative results per test, not
 * "conforms" statements — so an empty object, an empty array, an object whose
 * every value is blank, and an observation with no measured value all count
 * as NO result. A key-count check let all four through and marked the section
 * complete on a test nobody has a number for.
 */
export function hasQuantitativeResult(results: unknown): boolean {
  if (results === null || results === undefined || results === '') return false;
  if (typeof results === 'string') return results.trim().length > 0;
  if (typeof results === 'number') return Number.isFinite(results);
  if (Array.isArray(results)) return results.some((r) => hasQuantitativeResult(r));
  if (typeof results === 'object') {
    const entries = Object.entries(results as Record<string, unknown>);
    if (entries.length === 0) return false;
    /* An observation alone is a narrative note, not a measurement: the
       register's own form separates `value`/`unit` from `observation`. */
    const measured = entries.filter(([k]) => k.toLowerCase() !== 'observation');
    if (measured.length === 0) return false;
    return measured.some(([, v]) => hasQuantitativeResult(v));
  }
  return false;
}

/**
 * Map a drugSubstances row to a canonical source payload.
 *
 * The §3.2.S register form nests manufacturer / route / site inside the
 * `manufacturing_process` json (drugSubstanceBody in cmcRegisterForms.ts) —
 * the flat reads alone left 3.2.S.1's required `manufacturer` and 3.2.S.2's
 * `manufacturingRoute` permanently blank while the staffer's save succeeded.
 * Canonical payload keys stay first, so a caller that already holds a
 * canonical-shaped payload passes through unchanged (same rule as the
 * stability mapper below).
 */
export function mapDrugSubstancePayload(record: Record<string, any>): Record<string, any> {
  const mp = (record.manufacturingProcess ?? record.manufacturing_process ?? {}) as Record<string, any>;
  const route = record.manufacturingRoute || record.manufacturing_route || mp.route || '';
  return {
    name: record.substanceName || record.substance_name || '',
    inn: record.inn || '',
    manufacturer: record.manufacturer || mp.manufacturer || '',
    manufacturingSite: record.manufacturingSite || record.manufacturing_site || mp.site || '',
    cas: record.casNumber || record.cas || record.cas_number || '',
    molecularFormula: record.molecularFormula || record.molecular_formula || '',
    molecularWeight: record.molecularWeight || record.molecular_weight || '',
    structure: record.structure || record.structuralFormula || record.structural_formula || '',
    manufacturingRoute: route,
    /* The form labels the route field as "the §3.2.S.2.2 description"; at this
       register's granularity the recorded route IS the process description
       3.2.S.2 requires. Nothing is invented — an empty route stays empty. */
    processDescription: record.processDescription || record.process_description || route,
    specifications: record.specifications || null,
    stability_data: record.stability_data || record.stability || null,
    characterization_data: record.characterization_data || null,
    impurities: record.impurities || record.impuritiesProfile || record.impurities_profile || null,
    reference_materials:
      record.reference_materials || record.controlOfMaterials || record.control_of_materials || null,
    physicochemicalProperties: record.physicochemicalProperties || record.physicochemical_properties || null,
    biologicalActivity: record.biologicalActivity || record.biological_activity || null,
    /* Deliberately NOT aliased from the structure field: a SMILES string is
       not structural-elucidation evidence, and 3.2.S.3 claiming it would
       overstate the record. The characterization register (coverage
       evaluation, build item 4) is that field's honest producer. */
    structuralElucidation: record.structuralElucidation || record.structural_elucidation || null,
    qualificationBasis: record.qualificationBasis || record.qualification_basis || null,
    developmentPhase: record.developmentPhase || record.development_phase || '',
    status: record.status || '',
  };
}

/**
 * Map a drugProducts row to a canonical source payload.
 *
 * The §3.2.P register form nests the container closure inside
 * `packaging_materials` and the process description/site inside
 * `manufacturing_process` (drugProductBody in cmcRegisterForms.ts); the flat
 * `containerClosure` / snake-only `manufacturing_process` reads dropped both.
 */
export function mapDrugProductPayload(record: Record<string, any>): Record<string, any> {
  const mp = (record.manufacturingProcess ?? record.manufacturing_process ?? {}) as Record<string, any>;
  const pkg = (record.packagingMaterials ?? record.packaging_materials ?? {}) as Record<string, any>;
  /* composition and formulation are TEXT in the payload: every consumer —
     3.2.P.1's narrative and table, the 3.2.R.1.* composition statement, and
     3.2.A.3's animal/human-origin scan — reads them with val() (String(v)),
     so a passed-through json rendered "[object Object]" into governed
     narratives and hid "gelatin" from the TSE/BSE scan, which then asserted
     no animal-origin excipients OVER a gelatin composition. An empty {} maps
     to null so it can never satisfy a required field. The structured objects
     travel on *Detail keys. */
  const compositionRaw = record.composition ?? record.formulation ?? null;
  const compositionText =
    typeof compositionRaw === 'string'
      ? compositionRaw.trim()
      : (typeof (compositionRaw as Record<string, any> | null)?.description === 'string'
          ? String((compositionRaw as Record<string, any>).description).trim()
          : '') || textOf(compositionRaw);
  const batchFormulaRaw =
    record.formulation ?? record.batchFormula ?? record.batch_formula ?? null;
  const batchFormulaText =
    typeof batchFormulaRaw === 'string' ? batchFormulaRaw.trim() : textOf(batchFormulaRaw);
  const objOrNull = (v: unknown) =>
    v != null && typeof v === 'object' && Object.keys(v as object).length > 0 ? v : null;
  return {
    name: record.productName || record.product_name || '',
    dosageForm: record.dosageForm || record.dosage_form || '',
    dosageFormDescription: record.dosageForm || record.dosage_form || '',
    strength: record.strength || '',
    routeOfAdministration: record.routeOfAdministration || record.route_of_administration || '',
    containerClosure:
      record.containerClosure || record.container_closure ||
      pkg.containerClosure || pkg.container_closure || '',
    batchSize: record.batchSize || record.batch_size || '',
    /* 3.2.P.3's `formulation` is the BATCH formula — mapped from the row's
       batch_formula json only. The per-unit composition (a P.1 fact) is
       deliberately not aliased in: rendering it as the batch formula would
       overstate the record. */
    formulation: batchFormulaText || null,
    batchFormulaDetail: objOrNull(batchFormulaRaw),
    composition: compositionText || null,
    compositionDetail: objOrNull(compositionRaw),
    excipients: record.excipients || null,
    manufacturing_process: record.manufacturing_process || record.manufacturingProcess || null,
    processDescription: record.processDescription || record.process_description || mp.description || '',
    manufacturingSite: record.manufacturingSite || record.manufacturing_site || mp.site || '',
    processControls: record.processControls || record.process_controls || null,
    specifications: record.specifications || null,
    stability_data: record.stability_data || record.stability || null,
    components: record.components || null,
    version: record.version || null,
    status: record.status || '',
  };
}

/**
 * Map an analyticalMethods row to a canonical source payload.
 *
 * The register row's identity lives in `title` / `methodCode` / `technique`
 * and its lifecycle in `status` ('development' | 'validation' | 'validated' |
 * 'retired' — the validation vocabulary 3.2.S.4 renders); the old
 * methodName/methodType/validationStatus-only reads matched none of them, so
 * every registered method composed as "Not specified / Pending" and the ICH
 * Q2 record the UI captures (ichQ2Parameters, validationDate) was dropped.
 */
export function mapAnalyticalMethodPayload(record: Record<string, any>): Record<string, any> {
  return {
    methodName: record.methodName || record.method_name || record.title || '',
    methodCode: record.methodCode || record.method_code || '',
    methodType: record.methodType || record.method_type || record.technique || '',
    technique: record.technique || '',
    analyte: record.analyte || '',
    matrix: record.matrix || '',
    purpose: record.purpose || '',
    principle: record.principle || '',
    procedure: record.procedure || '',
    validationStatus: record.validationStatus || record.validation_status || record.status || '',
    acceptanceCriteria: record.acceptanceCriteria || record.acceptance_criteria || '',
    /* The Q2(R2) validation record, whole: which characteristics were
       validated and when. */
    ichQ2Parameters: record.ichQ2Parameters || record.ich_q2_parameters || null,
    validationDate: record.validationDate || record.validation_date || null,
    validation_data: record.validation_data || record.ichQ2Parameters || record.ich_q2_parameters || null,
    specificity_data: record.specificity_data || null,
    linearity_data: record.linearity_data || null,
    accuracy_data: record.accuracy_data || null,
    precision_data: record.precision_data || null,
    robustness_data: record.robustness_data || null,
    system_suitability: record.system_suitability || record.systemSuitability || null,
    status: record.status || '',
  };
}

/**
 * Map a stabilityStudies row to a canonical source payload.
 *
 * The row is the DRIZZLE `stability_studies` shape (shared/schema.ts):
 * studyTitle / storageConditions[] / stabilityData / shelfLife / batchNumber.
 * The first version of this mapper read keys the row has NEVER had
 * (studyName / storageCondition / results / shelfLifeClaim / batchesStudied),
 * so each of those stored '' or null, the composer's required fields for
 * 3.2.S.7 and 3.2.P.8 were permanently unsatisfiable, and recorded stability
 * data — pull-point results, the shelf-life claim, the batch — silently
 * never reached the compiled dossier. The payload keys are the composer's
 * contract and stay as they are; the ROW keys now actually feed them.
 */
export function mapStabilityPayload(record: Record<string, any>): Record<string, any> {
  const asArr = (v: unknown): unknown[] | null =>
    Array.isArray(v) ? v : v == null || v === '' ? null : [v];
  const storageArr =
    asArr(record.storageCondition ?? record.storage_condition) ??
    asArr(record.storageConditions ?? record.storage_conditions);
  return {
    studyName: record.studyName || record.study_name || record.studyTitle || record.study_title || '',
    studyType: record.studyType || record.study_type || '',
    storageCondition: storageArr ? storageArr.join(', ') : '',
    duration: record.duration || '',
    timePoints: record.timePoints || record.time_points || '',
    containerClosure: record.containerClosure || record.container_closure || '',
    testParameters: record.testParameters || record.test_parameters || '',
    stabilityParameters: record.testParameters || record.test_parameters || '',
    status: record.status || '',
    startedDate: record.startedDate || record.started_date || record.startDate || record.start_date || null,
    completedDate: record.completedDate || record.completed_date || null,
    // The result-bearing field the composer's data-inspection reads: the
    // study's recorded pull points live in `stability_data` on the row.
    results: record.results || record.stabilityData || record.stability_data || null,
    // The composer renders this as a list; the row records ONE batch per study.
    batchesStudied:
      asArr(record.batchesStudied ?? record.batches_studied) ??
      asArr(record.batchNumber ?? record.batch_number),
    packagingConfiguration: record.packagingConfiguration || record.packaging_configuration || null,
    shelfLifeClaim:
      record.shelfLifeClaim || record.shelf_life_claim || record.shelfLife || record.shelf_life || null,
  };
}

/**
 * Map a quality_specifications row to a canonical source payload.
 *
 * The row is the RAW snake_case shape the spec routes write
 * (migrations/20260823_cmc_register_store_parity.sql). validationStatus /
 * impurityLimits stay as canonical-caller passthroughs — the table has no
 * such columns, and 3.2.S.4's `validationStatus` is honestly produced by the
 * METHOD register (its lifecycle status), not invented here.
 */
export function mapSpecificationPayload(record: Record<string, any>): Record<string, any> {
  const criteria = record.acceptanceCriteria ?? record.acceptance_criteria ?? null;
  const materialType = record.materialType || record.material_type || '';
  /* 3.2.P.5 is the DRUG PRODUCT specification. The composer matches sources
     by TYPE only, so if every spec emitted releaseCriteria, a drug-substance
     or excipient spec's limits would render under the drug product's release
     criteria and flip P.5 green — cross-material bleed into a governed
     section. Only a drug-product spec produces the field. */
  const isDrugProductSpec = /drug[\s_-]?product/i.test(materialType);
  /* The register's shape separates the release limit from the shelf-life
     limit ({release, shelf} — cmcSpec.ts): they are DIFFERENT regulatory
     claims and must not be folded into one string under the release label. */
  const relText =
    typeof (criteria as Record<string, any> | null)?.release === 'string'
      ? String((criteria as Record<string, any>).release).trim()
      : '';
  const shelfText =
    typeof (criteria as Record<string, any> | null)?.shelf === 'string'
      ? String((criteria as Record<string, any>).shelf).trim()
      : '';
  const hasReleaseShelfShape =
    criteria != null && typeof criteria === 'object' &&
    ('release' in (criteria as object) || 'shelf' in (criteria as object));
  return {
    materialType,
    materialName: record.materialName || record.material_name || '',
    acceptanceCriteria: criteria,
    /* 3.2.P.5's required field: the release limits ARE this register's
       acceptance criteria — the composer read `releaseCriteria` and nothing
       ever emitted it. Text, because the P.5 narrative reads it with val();
       the structured object stays on acceptanceCriteria; empty limits map to
       null, never to a truthy "release: " that fakes completeness. */
    releaseCriteria:
      record.releaseCriteria ?? record.release_criteria ??
      (isDrugProductSpec
        ? (hasReleaseShelfShape ? relText : textOf(criteria)) || null
        : null),
    shelfLifeCriteria:
      record.shelfLifeCriteria ?? record.shelf_life_criteria ??
      (isDrugProductSpec && shelfText ? shelfText : null),
    testParameters: record.testParameters || record.test_parameters || null,
    testMethods: record.testMethods || record.test_methods || null,
    justification: record.justification || '',
    regulatoryBasis: record.regulatoryBasis || record.regulatory_basis || null,
    approvalStatus: record.approvalStatus || record.approval_status || '',
    validationStatus: record.validationStatus || record.validation_status || '',
    impurityLimits: record.impurityLimits || record.impurity_limits || null,
  };
}

/**
 * Map a batch_records row to a canonical source payload.
 *
 * The row is the RAW snake_case cmc_batch_records shape
 * (migrations/0006_regulatory_atoms.sql + the 20260823 parity columns). The
 * governed release decision — disposition, release status, who released and
 * when — was captured under §11 re-auth and then never exported; it travels
 * now. `formulation` stays a canonical-caller passthrough: this table has no
 * such column, and the batch formula's honest producer is the drug product
 * row's batch_formula json.
 */
export function mapBatchRecordPayload(record: Record<string, any>): Record<string, any> {
  return {
    batchNumber: record.batchNumber || record.batch_number || '',
    productName: record.productName || record.product_name || '',
    batchType: record.batchType || record.batch_type || '',
    materialType: record.materialType || record.material_type || '',
    scale: record.scale || '',
    batchSize: record.batchSize || record.batch_size || '',
    batchSizeUnit: record.batchSizeUnit || record.batch_size_unit || '',
    manufacturingDate: record.manufacturingDate || record.manufacturing_date || null,
    expiryDate: record.expiryDate || record.expiry_date || null,
    manufacturingSite: record.manufacturingSite || record.manufacturing_site || record.site || '',
    processVersion: record.processVersion || record.process_version || '',
    status: record.status || '',
    processParameters: record.processParameters || record.process_parameters || null,
    inProcessControls: record.inProcessControls || record.in_process_controls || null,
    yieldData: record.yieldData || record.yield_data || null,
    deviations: record.deviations || null,
    releaseTesting: record.releaseTesting || record.release_testing || null,
    specificationCompliance: record.specificationCompliance || record.specification_compliance || null,
    oosEvents: record.oosEvents || record.oos_events || null,
    disposition: record.disposition || '',
    releaseStatus: record.releaseStatus || record.release_status || '',
    releasedBy: record.releasedBy || record.released_by || '',
    releasedAt: record.releasedAt || record.released_at || null,
    formulation: record.formulation || null,
  };
}

/**
 * Map a change_control row to a canonical source payload.
 *
 * The register row (cmcChangeControl, shared/schema.ts) identifies a change
 * by `changeNumber`, nests the assessed risk inside the `risk_assessment`
 * json, and records the filing category in `regulatory_filing` — the ICH Q12
 * classification the whole record exists to carry. All three were dropped, so
 * a canonical change read as an untitled change with no risk level and no
 * filing category.
 */
export function mapChangeControlPayload(record: Record<string, any>): Record<string, any> {
  const risk = (record.riskAssessment ?? record.risk_assessment ?? null) as Record<string, any> | null;
  const changeNumber = record.changeNumber || record.change_number || '';
  return {
    changeNumber,
    changeTitle: record.changeTitle || record.change_title || record.title || changeNumber,
    changeType: record.changeType || record.change_type || '',
    changeDescription: record.changeDescription || record.change_description || record.description || '',
    impactAssessment: record.impactAssessment || record.impact_assessment || '',
    justification: record.justification || '',
    status: record.status || '',
    priority: record.priority || '',
    riskLevel:
      record.riskLevel || record.risk_level ||
      (typeof risk?.level === 'string' ? risk.level : '') || '',
    regulatoryFiling: record.regulatoryFiling || record.regulatory_filing || null,
    implementationDate: record.implementationDate || record.implementation_date || null,
    affectedSystems: record.affectedSystems || record.affected_systems || null,
    regulatoryImpact: record.regulatoryImpact || record.regulatory_impact || null,
  };
}

/**
 * Map a comparability assessment row to a canonical source payload.
 */
export function mapComparabilityPayload(record: Record<string, any>): Record<string, any> {
  return {
    assessmentName: record.assessmentName || record.assessment_name || record.title || '',
    changedElement: record.changedElement || record.changed_element || record.product || '',
    changeType: record.changeType || record.change_type || record.type || '',
    status: record.status || '',
    comparabilityStatus: record.status || '',
    affectedProcessParameters: record.affectedProcessParameters || record.affected_process_parameters || record.methods || null,
    justification: record.justification || record.outcome || '',
    reviewedBy: record.reviewedBy || record.reviewed_by || record.owner || '',
  };
}

/**
 * Map a process_validation row to a canonical source payload.
 *
 * The register (processValidation, shared/schema.ts) records the lifecycle
 * stage, the batches in scope, the CPPs/CQAs and the control strategy — six
 * of the old mapper's eight reads named columns this table never had, so the
 * staffer's recorded validation reached Module 3 as a process name and a
 * status. 3.2.S.2's `processControls` is honestly produced by the recorded
 * control strategy; `processDescription` deliberately is NOT aliased from it
 * (a control strategy is not a process description — that field's producer is
 * the drug substance/product record's own process text).
 */
export function mapProcessValidationPayload(record: Record<string, any>): Record<string, any> {
  const controlStrategy = record.controlStrategy ?? record.control_strategy ?? null;
  const batches = record.consecutiveBatches ?? record.batchNumbers ?? record.batch_numbers ?? null;
  return {
    validationType: record.validationType || record.validation_type || record.stage || '',
    processName: record.processName || record.process_name || '',
    stage: record.stage || '',
    batchNumbers: record.batchNumbers || record.batch_numbers || null,
    /* The composer's process-validation slots read `protocol`,
       `validationStatus` and `consecutiveBatches` (3.2.S.2 / 3.2.P.3) — keys
       nothing produced, so the PV summary table could never render. The PV
       record's lifecycle status IS its validation status; the batches in
       scope render as text. */
    protocol: record.protocol || record.validationProtocol || record.validation_protocol || '',
    validationStatus: record.validationStatus || record.validation_status || record.status || '',
    consecutiveBatches: Array.isArray(batches)
      ? batches.filter(Boolean).join(', ')
      : typeof batches === 'string'
        ? batches
        : '',
    batchSize: record.batchSize || record.batch_size || '',
    processDescription: record.processDescription || record.process_description || '',
    /* Text, because the 3.2.S.2 narrative reads processControls with val();
       the control strategy's own summary sentence is the honest statement,
       with a keyed projection as the fallback for other recorded shapes. The
       structured object stays on controlStrategy below. */
    processControls:
      record.processControls || record.process_controls ||
      (typeof (controlStrategy as Record<string, any> | null)?.summary === 'string'
        ? (controlStrategy as Record<string, any>).summary
        : textOf(controlStrategy) || null),
    criticalProcessParameters:
      record.criticalProcessParameters || record.critical_process_parameters || null,
    criticalQualityAttributes:
      record.criticalQualityAttributes || record.critical_quality_attributes || null,
    controlStrategy,
    validationProtocol: record.validationProtocol || record.validation_protocol || '',
    validationReport: record.validationReport || record.validation_report || '',
    acceptanceCriteria: record.acceptanceCriteria || record.acceptance_criteria || null,
    results: record.results || null,
    approvalDate: record.approvalDate || record.approval_date || null,
    status: record.status || '',
  };
}

/**
 * Map a qc_testing row to a canonical source payload — the batch-analyses
 * evidence behind §3.2.S.4.4 / §3.2.P.5.4.
 *
 * `qc_testing` was the ONE CMC register with no write-through. A QC analyst
 * recorded a release result against its specification, a second person reviewed
 * it under the §11 two-person rule, and none of it reached Module 3 — the two
 * sections whose whole job is to carry quantitative batch results were composed
 * without ever seeing the QC file.
 *
 * `batchAnalyses` is the field the section rules require. It is emitted only
 * when there is an actual result to report: a QC record with no results is a
 * pending test, and letting it satisfy the requirement would mark the section
 * complete on the strength of a test nobody has run yet.
 */
export function mapQcTestingPayload(record: Record<string, any>): Record<string, any> {
  const results = record.testResults ?? record.test_results ?? null;
  const specifications = record.specifications ?? null;
  const status = record.passFailStatus || record.pass_fail_status || '';
  const sampleType = String(record.sampleType || record.sample_type || '').toLowerCase();
  /* A batch analysis is a test OF THE MATERIAL. A cleaning-verification swab
     and a reference-standard qualification are neither: they belong to GMP
     cleaning records and §3.2.S.5/§3.2.P.6 respectively, and letting them
     satisfy §3.2.S.4.4 / §3.2.P.5.4's batch-analyses requirement marked those
     sections complete on evidence that is not batch data. The composer's
     renderer reads this SAME flag off the payload, so the table and the
     completeness bit can never disagree about what counts. */
  const isBatchAnalysis = !NON_BATCH_SAMPLE_TYPES.includes(sampleType);
  const hasResult = isBatchAnalysis && hasQuantitativeResult(results);
  return {
    sampleId: record.sampleId || record.sample_id || '',
    sampleType: record.sampleType || record.sample_type || '',
    testMethod: record.testMethod || record.test_method || '',
    testResults: results,
    specifications,
    passFailStatus: status,
    certificateOfAnalysis: record.certificateOfAnalysis || record.certificate_of_analysis || '',
    /* §3.2.S.4.4 / §3.2.P.5.4 require quantitative results per test, not
       "conforms" statements — so the presence of a recorded result is what
       counts here, not the presence of a row. */
    /* Which SIDE this result is evidence for, decided once here and honoured
       by both the completeness rules and the renderer. §3.2.S.4 requires
       drugSubstanceBatchAnalyses and §3.2.P.5 requires
       drugProductBatchAnalyses, so a finished-product result can no longer
       turn the drug-substance section green on a table that section will
       never render (and vice versa). */
    isBatchAnalysis,
    batchAnalysisSide: isBatchAnalysis ? (sampleType === FINISHED_PRODUCT ? 'drug_product' : 'drug_substance') : null,
    batchAnalyses: hasResult ? results : null,
    drugSubstanceBatchAnalyses: hasResult && sampleType !== FINISHED_PRODUCT ? results : null,
    drugProductBatchAnalyses: hasResult && sampleType === FINISHED_PRODUCT ? results : null,
    /* Reviewed status travels with the payload: an unreviewed result is not yet
       releasable evidence, and a reader of the composed section needs to know
       which it is looking at. */
    reviewed: Boolean(record.reviewedBy ?? record.reviewed_by),
    releaseDate: record.releaseDate || record.release_date || null,
  };
}


/**
 * Is anything actually recorded in this json value?
 *
 * An empty object, an array of empty objects, and an object whose every value
 * is a blank string are all "nothing was recorded" — and all of them are
 * truthy. A truthiness check on a container closure record's
 * `extractables_leachables` therefore reported an E&L study for a form the
 * staffer opened and left blank, which is the same class of lie as a green
 * completeness bar over an empty section.
 */
export function hasRecordedValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.some(hasRecordedValue);
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasRecordedValue);
  return false;
}

/**
 * Map a cmc_container_closures row to a canonical source payload.
 *
 * §3.2.S.6 and §3.2.P.7 both match EVERY container_closure source, so the side
 * has to be carried on the payload or a drug-product blister turns the
 * drug-substance section green on a system that section never renders — the
 * defect that once filed a finished-product QC result under §3.2.S.4.4. The
 * scope is resolved ONCE here, through the composer's own
 * `normalizeMaterialScope`, and the side-scoped keys the section rules require
 * are emitted from that single decision; the renderer resolves the same scope
 * off the same payload, so what counts and what renders cannot disagree.
 *
 * `containerClosureStudies` is §3.2.P.2's required field — the development work
 * behind the chosen packaging. It is emitted only from the drug-product side
 * and only when a study is actually recorded, and it names the studies on file
 * rather than restating their conclusions.
 */
export function mapContainerClosurePayload(record: Record<string, any>): Record<string, any> {
  const scope = normalizeMaterialScope(record.scope, 'drug_product');
  const forDs = scope === 'drug_substance' || scope === 'both';
  const forDp = scope === 'drug_product' || scope === 'both';

  const systemName = record.systemName || record.system_name || '';
  const container = record.containerDescription || record.container_description || '';
  const closure = record.closureDescription || record.closure_description || '';
  const justification = record.suitabilityJustification || record.suitability_justification || '';
  const materials = record.materialsOfConstruction ?? record.materials_of_construction ?? null;
  const compendial = record.compendialStandards ?? record.compendial_standards ?? null;
  const el = record.extractablesLeachables ?? record.extractables_leachables ?? null;
  const integrity = record.integrityTesting ?? record.integrity_testing ?? null;

  const studies: string[] = [];
  if (hasRecordedValue(el)) {
    const type = (el && typeof el === 'object' && !Array.isArray(el) ? String((el as any).studyType || '') : '').trim();
    studies.push(type ? `extractables/leachables (${type})` : 'extractables/leachables study');
  }
  if (hasRecordedValue(integrity)) {
    const method = (integrity && typeof integrity === 'object' && !Array.isArray(integrity) ? String((integrity as any).method || '') : '').trim();
    studies.push(method ? `container closure integrity (${method})` : 'container closure integrity testing');
  }
  const studySummary = studies.length > 0
    ? `${systemName || container || 'Container closure system'}: ${studies.join('; ')}`
    : '';

  return {
    scope,
    systemName,
    componentType: record.componentType || record.component_type || '',
    containerDescription: container,
    closureDescription: closure,
    suitabilityJustification: justification,
    materialsOfConstruction: hasRecordedValue(materials) ? materials : null,
    compendialStandards: hasRecordedValue(compendial) ? compendial : null,
    extractablesLeachables: hasRecordedValue(el) ? el : null,
    integrityTesting: hasRecordedValue(integrity) ? integrity : null,
    supplier: record.supplier || '',
    status: record.status || 'draft',
    qualificationDate: record.qualificationDate || record.qualification_date || null,
    /* Side-scoped completeness keys — §3.2.S.6 requires the drugSubstance*
       trio and §3.2.P.7 the drugProduct* trio. Blank stays blank: a system
       recorded without a suitability justification must NOT complete either
       section, because that justification is the whole substance of the
       section. */
    drugSubstanceContainerDescription: forDs && container ? container : null,
    drugSubstanceClosureDescription: forDs && closure ? closure : null,
    drugSubstanceSuitabilityJustification: forDs && justification ? justification : null,
    drugProductContainerDescription: forDp && container ? container : null,
    drugProductClosureDescription: forDp && closure ? closure : null,
    drugProductSuitabilityJustification: forDp && justification ? justification : null,
    containerClosureStudies: forDp && studySummary ? studySummary : null,
  };
}

/**
 * Map a cmc_reference_standards row to a canonical source payload.
 *
 * Side-scoped for the same reason as the container closure mapper above:
 * §3.2.S.5 and §3.2.P.6 both match every reference_standard source.
 *
 * `referenceStandardDescription` is built from the record's own identifying
 * fields — nothing is invented, and a record with neither a name nor a code
 * produces no description rather than an empty one that would satisfy the
 * completeness gate.
 */
export function mapReferenceStandardPayload(record: Record<string, any>): Record<string, any> {
  const scope = normalizeMaterialScope(record.scope, 'drug_substance');
  const forDs = scope === 'drug_substance' || scope === 'both';
  const forDp = scope === 'drug_product' || scope === 'both';

  const code = String(record.standardCode || record.standard_code || '').trim();
  const name = String(record.standardName || record.standard_name || '').trim();
  const type = String(record.standardType || record.standard_type || '').trim();
  const lot = String(record.lotNumber || record.lot_number || '').trim();
  const assigned = String(record.assignedValue || record.assigned_value || '').trim();
  const coa = String(record.certificateOfAnalysis || record.certificate_of_analysis || '').trim();

  const head = [name, code ? `(${code})` : ''].filter(Boolean).join(' ');
  const detail = [
    type ? `${type} standard` : '',
    lot ? `lot ${lot}` : '',
    assigned ? `assigned value ${assigned}` : '',
  ].filter(Boolean).join(', ');
  const description = head ? [head, detail].filter(Boolean).join(' — ') : '';

  return {
    scope,
    standardCode: code,
    standardName: name,
    standardType: type,
    lotNumber: lot,
    assignedValue: assigned,
    materialSource: record.materialSource || record.material_source || '',
    characterization: hasRecordedValue(record.characterization) ? record.characterization : null,
    certificateOfAnalysis: coa,
    qualificationProtocol: record.qualificationProtocol || record.qualification_protocol || '',
    storageConditions: record.storageConditions || record.storage_conditions || '',
    expiryDate: record.expiryDate || record.expiry_date || null,
    retestDate: record.retestDate || record.retest_date || null,
    status: record.status || 'draft',
    qualificationDate: record.qualificationDate || record.qualification_date || null,
    referenceStandardDescription: description || null,
    /* Side-scoped completeness keys for §3.2.S.5 / §3.2.P.6. */
    drugSubstanceReferenceStandard: forDs && description ? description : null,
    drugSubstanceReferenceStandardCoA: forDs && coa ? coa : null,
    drugProductReferenceStandard: forDp && description ? description : null,
    drugProductReferenceStandardCoA: forDp && coa ? coa : null,
  };
}

// ── Core write-through function ────────────────────────────────────────────

/**
 * Upserts a canonical source object from a CMC data-entry record and marks
 * impacted Module 3 sections stale.
 *
 * This is non-blocking for the caller — failures are logged but do not
 * prevent the primary CMC save from succeeding.
 */
export async function writeThroughToCanonicalSource(input: WriteThroughInput): Promise<WriteThroughResult | null> {
  const { orgId, projectId, sourceType, sourceKey, sourcePayload, createdBy } = input;

  if (!projectId) {
    console.warn('[CMC Write-Through] No projectId provided — skipping canonical source upsert');
    return null;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sourceHash = createSourceHash(sourcePayload);

    // 1. Upsert into cmc_source_objects
    const upsertResult = await client.query(
      `INSERT INTO cmc_source_objects
         (organization_id, project_id, source_type, source_key, source_payload, source_hash, version)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1)
       ON CONFLICT (organization_id, project_id, source_type, source_key, version)
       DO UPDATE SET source_payload = excluded.source_payload,
                     source_hash   = excluded.source_hash,
                     updated_at    = NOW()
       RETURNING id, (xmax = 0) AS is_new`,
      [orgId, projectId, sourceType, sourceKey, JSON.stringify(sourcePayload), sourceHash],
    );

    const sourceObjectId = upsertResult.rows[0].id;
    const isNew = upsertResult.rows[0].is_new;

    // 2. Record provenance event
    await client.query(
      `INSERT INTO cmc_provenance_events
         (organization_id, project_id, artifact_type, artifact_id, event_type, event_payload, created_by)
       VALUES ($1, $2, 'source_object', $3, 'write_through', $4::jsonb, $5)`,
      [
        orgId,
        projectId,
        sourceObjectId,
        JSON.stringify({
          sourceType,
          sourceKey,
          origin: 'cmc_data_entry',
          isNew,
        }),
        createdBy || 'system',
      ],
    );

    // 3. Mark impacted Module 3 sections stale
    const staleSections = impactedSectionsForSourceType(sourceType);

    if (staleSections.length > 0) {
      const staleReason = `Source data updated: ${sourceType} (${sourceKey})`;
      await client.query(
        `UPDATE cmc_module3_sections
         SET stale = true,
             stale_reason = $1,
             updated_at = NOW()
         WHERE organization_id = $2
           AND project_id = $3
           AND section_key = ANY($4)
           AND (approval_state != 'locked')`,
        [staleReason, orgId, projectId, staleSections],
      );
    }

    await client.query('COMMIT');

    // 4. Optionally create a review task in the unified task system
    if (input.createReviewTask && isNew) {
      const label = SOURCE_TYPE_LABELS[sourceType] || sourceType;
      try {
        await unifiedTaskService.createUnifiedTask({
          moduleType: 'CMC',
          title: `Review: ${label} data entry`,
          description: `New ${label} data was entered for this project and needs review before it can be merged into Module 3 documentation. Impacted sections: ${staleSections.join(', ') || 'none identified'}.`,
          category: 'data-review',
          taskType: 'review',
          priority: 'medium',
          sourceEntityId: String(sourceObjectId),
          sourceEntityType: `cmc_source_object:${sourceType}`,
          organizationId: orgId,
          projectId: input.numericProjectId,
          metadata: {
            sourceType,
            sourceKey,
            sourceObjectId: String(sourceObjectId),
            staleSections,
            origin: 'cmc_write_through',
          },
        });
      } catch (taskErr) {
        // Non-blocking: task creation failure should not affect the write-through
        console.warn('[CMC Write-Through] Failed to create review task:', taskErr);
      }
    }

    return {
      sourceObjectId: String(sourceObjectId),
      sourceHash,
      staleSections,
      isNew,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    // Non-blocking: log and return null so the primary CMC save still succeeds
    console.error('[CMC Write-Through] Failed to upsert canonical source:', err);
    return null;
  } finally {
    client.release();
  }
}

// ── Convenience wrappers ───────────────────────────────────────────────────

export async function writeThroughDrugSubstance(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'drug_substance',
    sourceKey: `drug_substance:${recordId}`,
    sourcePayload: mapDrugSubstancePayload(record),
    createdBy,
  });
}

export async function writeThroughDrugProduct(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'drug_product',
    sourceKey: `drug_product:${recordId}`,
    sourcePayload: mapDrugProductPayload(record),
    createdBy,
  });
}

export async function writeThroughAnalyticalMethod(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'method',
    sourceKey: `method:${recordId}`,
    sourcePayload: mapAnalyticalMethodPayload(record),
    createdBy,
  });
}

export async function writeThroughStabilityStudy(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'stability',
    sourceKey: `stability:${recordId}`,
    sourcePayload: mapStabilityPayload(record),
    createdBy,
  });
}

export async function writeThroughQcTesting(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'qc_result',
    sourceKey: `qc_result:${recordId}`,
    sourcePayload: mapQcTestingPayload(record),
    createdBy,
  });
}

export async function writeThroughSpecification(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'specification',
    sourceKey: `specification:${recordId}`,
    sourcePayload: mapSpecificationPayload(record),
    createdBy,
  });
}

export async function writeThroughBatchRecord(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'batch',
    sourceKey: `batch:${recordId}`,
    sourcePayload: mapBatchRecordPayload(record),
    createdBy,
  });
}

export async function writeThroughChangeControl(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'change_control',
    sourceKey: `change_control:${recordId}`,
    sourcePayload: mapChangeControlPayload(record),
    createdBy,
  });
}

export async function writeThroughComparability(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'comparability',
    sourceKey: `comparability:${recordId}`,
    sourcePayload: mapComparabilityPayload(record),
    createdBy,
  });
}

export async function writeThroughContainerClosure(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'container_closure',
    sourceKey: `container_closure:${recordId}`,
    sourcePayload: mapContainerClosurePayload(record),
    createdBy,
  });
}

export async function writeThroughReferenceStandard(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'reference_standard',
    sourceKey: `reference_standard:${recordId}`,
    sourcePayload: mapReferenceStandardPayload(record),
    createdBy,
  });
}

export async function writeThroughProcessValidation(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'process_validation',
    sourceKey: `process_validation:${recordId}`,
    sourcePayload: mapProcessValidationPayload(record),
    createdBy,
  });
}
