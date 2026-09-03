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
  type CmcSourceType,
} from './module3Composer';
/* The scope rule is shared with the register surfaces, not owned by either
   side: see shared/cmc/material-scope.ts. */
import {
  EXCIPIENT_ROLES,
  isHumanOrAnimalOrigin,
  normalizeMaterialRole,
  normalizeMaterialScope,
} from '../../shared/cmc/material-scope';
import {
  DISSOLUTION_DEVELOPMENT_PURPOSES,
  DISSOLUTION_RELEASE_PURPOSE,
  normalizeDissolutionPurpose,
} from '../../shared/cmc/dissolution-purpose';
/* The ICH impurity classes are the assessment engine's vocabulary, not this
   module's: one definition, in services/cmc/impurity-assessment. */
import {
  CHARACTERIZATION_TYPE_FIELD,
  normalizeCharacterizationType,
} from '../../shared/cmc/characterization-type';
import { isAssessableImpurity } from './cmc/impurity-assessment';
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
  impurity_profile: 'Impurity Profile',
  dissolution_profile: 'Dissolution Profile',
  material_spec: 'Material Specification',
  qc_result: 'QC Result',
  raw_material_spec: 'Raw Material Specification',
  formulation_record: 'Formulation Record',
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
 * First truthy value among a record's aliases for one field, '' when none has
 * one — exactly what `alias(record, 'camelCase', 'snake_case')` did at 118
 * sites across these mappers.
 *
 * The registers write camelCase and the tables store snake_case, so every
 * mapper read both. Spelled out inline, each read cost two branch points and
 * the coalescing alone pushed these functions past the complexity ceiling —
 * the aliasing is noise, not logic, and it should not read as either.
 */
function alias(record: Record<string, any>, ...keys: string[]): any {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
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
    name: alias(record, 'substanceName', 'substance_name'),
    inn: record.inn || '',
    manufacturer: record.manufacturer || mp.manufacturer || '',
    manufacturingSite: record.manufacturingSite || record.manufacturing_site || mp.site || '',
    cas: alias(record, 'casNumber', 'cas', 'cas_number'),
    molecularFormula: alias(record, 'molecularFormula', 'molecular_formula'),
    molecularWeight: alias(record, 'molecularWeight', 'molecular_weight'),
    structure: alias(record, 'structure', 'structuralFormula', 'structural_formula'),
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
    developmentPhase: alias(record, 'developmentPhase', 'development_phase'),
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
    name: alias(record, 'productName', 'product_name'),
    dosageForm: alias(record, 'dosageForm', 'dosage_form'),
    dosageFormDescription: alias(record, 'dosageForm', 'dosage_form'),
    strength: record.strength || '',
    routeOfAdministration: alias(record, 'routeOfAdministration', 'route_of_administration'),
    containerClosure:
      record.containerClosure || record.container_closure ||
      pkg.containerClosure || pkg.container_closure || '',
    batchSize: alias(record, 'batchSize', 'batch_size'),
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
    methodName: alias(record, 'methodName', 'method_name', 'title'),
    methodCode: alias(record, 'methodCode', 'method_code'),
    methodType: alias(record, 'methodType', 'method_type', 'technique'),
    technique: record.technique || '',
    analyte: record.analyte || '',
    matrix: record.matrix || '',
    purpose: record.purpose || '',
    principle: record.principle || '',
    procedure: record.procedure || '',
    validationStatus: alias(record, 'validationStatus', 'validation_status', 'status'),
    acceptanceCriteria: alias(record, 'acceptanceCriteria', 'acceptance_criteria'),
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
    studyName: alias(record, 'studyName', 'study_name', 'studyTitle', 'study_title'),
    studyType: alias(record, 'studyType', 'study_type'),
    storageCondition: storageArr ? storageArr.join(', ') : '',
    duration: record.duration || '',
    timePoints: alias(record, 'timePoints', 'time_points'),
    containerClosure: alias(record, 'containerClosure', 'container_closure'),
    testParameters: alias(record, 'testParameters', 'test_parameters'),
    stabilityParameters: alias(record, 'testParameters', 'test_parameters'),
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
  const materialType = alias(record, 'materialType', 'material_type');
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
    materialName: alias(record, 'materialName', 'material_name'),
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
    approvalStatus: alias(record, 'approvalStatus', 'approval_status'),
    validationStatus: alias(record, 'validationStatus', 'validation_status'),
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
    batchNumber: alias(record, 'batchNumber', 'batch_number'),
    productName: alias(record, 'productName', 'product_name'),
    batchType: alias(record, 'batchType', 'batch_type'),
    materialType: alias(record, 'materialType', 'material_type'),
    scale: record.scale || '',
    batchSize: alias(record, 'batchSize', 'batch_size'),
    batchSizeUnit: alias(record, 'batchSizeUnit', 'batch_size_unit'),
    manufacturingDate: record.manufacturingDate || record.manufacturing_date || null,
    expiryDate: record.expiryDate || record.expiry_date || null,
    manufacturingSite: alias(record, 'manufacturingSite', 'manufacturing_site', 'site'),
    processVersion: alias(record, 'processVersion', 'process_version'),
    status: record.status || '',
    processParameters: record.processParameters || record.process_parameters || null,
    inProcessControls: record.inProcessControls || record.in_process_controls || null,
    yieldData: record.yieldData || record.yield_data || null,
    deviations: record.deviations || null,
    releaseTesting: record.releaseTesting || record.release_testing || null,
    specificationCompliance: record.specificationCompliance || record.specification_compliance || null,
    oosEvents: record.oosEvents || record.oos_events || null,
    disposition: record.disposition || '',
    releaseStatus: alias(record, 'releaseStatus', 'release_status'),
    releasedBy: alias(record, 'releasedBy', 'released_by'),
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
  const changeNumber = alias(record, 'changeNumber', 'change_number');
  return {
    changeNumber,
    changeTitle: record.changeTitle || record.change_title || record.title || changeNumber,
    changeType: alias(record, 'changeType', 'change_type'),
    changeDescription: alias(record, 'changeDescription', 'change_description', 'description'),
    impactAssessment: alias(record, 'impactAssessment', 'impact_assessment'),
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
    assessmentName: alias(record, 'assessmentName', 'assessment_name', 'title'),
    changedElement: alias(record, 'changedElement', 'changed_element', 'product'),
    changeType: alias(record, 'changeType', 'change_type', 'type'),
    status: record.status || '',
    comparabilityStatus: record.status || '',
    affectedProcessParameters: record.affectedProcessParameters || record.affected_process_parameters || record.methods || null,
    justification: alias(record, 'justification', 'outcome'),
    reviewedBy: alias(record, 'reviewedBy', 'reviewed_by', 'owner'),
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
    validationType: alias(record, 'validationType', 'validation_type', 'stage'),
    processName: alias(record, 'processName', 'process_name'),
    stage: record.stage || '',
    batchNumbers: record.batchNumbers || record.batch_numbers || null,
    /* The composer's process-validation slots read `protocol`,
       `validationStatus` and `consecutiveBatches` (3.2.S.2 / 3.2.P.3) — keys
       nothing produced, so the PV summary table could never render. The PV
       record's lifecycle status IS its validation status; the batches in
       scope render as text. */
    protocol: alias(record, 'protocol', 'validationProtocol', 'validation_protocol'),
    validationStatus: alias(record, 'validationStatus', 'validation_status', 'status'),
    consecutiveBatches: Array.isArray(batches)
      ? batches.filter(Boolean).join(', ')
      : typeof batches === 'string'
        ? batches
        : '',
    batchSize: alias(record, 'batchSize', 'batch_size'),
    processDescription: alias(record, 'processDescription', 'process_description'),
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
    validationProtocol: alias(record, 'validationProtocol', 'validation_protocol'),
    validationReport: alias(record, 'validationReport', 'validation_report'),
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
  const status = alias(record, 'passFailStatus', 'pass_fail_status');
  const sampleType = String(alias(record, 'sampleType', 'sample_type')).toLowerCase();
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
    sampleId: alias(record, 'sampleId', 'sample_id'),
    sampleType: alias(record, 'sampleType', 'sample_type'),
    testMethod: alias(record, 'testMethod', 'test_method'),
    testResults: results,
    specifications,
    passFailStatus: status,
    certificateOfAnalysis: alias(record, 'certificateOfAnalysis', 'certificate_of_analysis'),
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

  const systemName = alias(record, 'systemName', 'system_name');
  const componentType = String(alias(record, 'componentType', 'component_type')).trim().toLowerCase();
  /* Unstated means primary: the column defaults to 'primary', and a system
     recorded without a component type is the one holding the material far more
     often than not. */
  const isPrimary = componentType === '' || componentType === 'primary';
  const container = alias(record, 'containerDescription', 'container_description');
  const closure = alias(record, 'closureDescription', 'closure_description');
  const justification = alias(record, 'suitabilityJustification', 'suitability_justification');
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
    componentType: alias(record, 'componentType', 'component_type'),
    isPrimaryPackaging: isPrimary,
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
    /* ONE PRIMARY system carrying the whole story. Two things made a section
       green that should not have: `availableFields` is a union across every
       matched source, so two half-recorded systems satisfied the three keys
       between them; and a fully described SECONDARY carton satisfied a section
       whose subject is the container in contact with the material. §3.2.S.6 /
       §3.2.P.7 are complete when the primary container closure system is
       described with its suitability justification — a carton or a carrier can
       add to that, never stand in for it. */
    drugSubstanceContainerClosureComplete:
      forDs && isPrimary && container && closure && justification ? (systemName || container) : null,
    drugProductContainerClosureComplete:
      forDp && isPrimary && container && closure && justification ? (systemName || container) : null,
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

  const code = String(alias(record, 'standardCode', 'standard_code')).trim();
  const name = String(alias(record, 'standardName', 'standard_name')).trim();
  const type = String(alias(record, 'standardType', 'standard_type')).trim();
  const lot = String(alias(record, 'lotNumber', 'lot_number')).trim();
  const assigned = String(alias(record, 'assignedValue', 'assigned_value')).trim();
  const coa = String(alias(record, 'certificateOfAnalysis', 'certificate_of_analysis')).trim();

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
    materialSource: alias(record, 'materialSource', 'material_source'),
    characterization: hasRecordedValue(record.characterization) ? record.characterization : null,
    certificateOfAnalysis: coa,
    qualificationProtocol: alias(record, 'qualificationProtocol', 'qualification_protocol'),
    storageConditions: alias(record, 'storageConditions', 'storage_conditions'),
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
    /* One standard with both its identity and its Certificate of Analysis —
       see the note on the container closure equivalent above. */
    drugSubstanceReferenceStandardComplete: forDs && description && coa ? description : null,
    drugProductReferenceStandardComplete: forDp && description && coa ? description : null,
  };
}


/**
 * Map a cmc_impurity_profiles row to a canonical source payload.
 *
 * One row is ONE impurity. The composer collects across every impurity_profile
 * source rather than reading a first-match array, because a first-match read
 * over one-row-per-impurity payloads renders exactly one impurity and silently
 * drops the rest.
 *
 * Nothing is defaulted. In particular the unit is not: the column has a default
 * of '%', but a number recorded with the unit field cleared is not a percentage
 * because a column says so, and a ppm figure rendered as a percentage overstates
 * it twenty-thousand-fold. The assessment engine refuses that record instead.
 */
export function mapImpurityProfilePayload(record: Record<string, any>): Record<string, any> {
  const scope = normalizeMaterialScope(record.scope, 'drug_substance');
  const forDs = scope === 'drug_substance' || scope === 'both';
  const forDp = scope === 'drug_product' || scope === 'both';

  const impurityName = String(alias(record, 'impurityName', 'impurity_name')).trim();
  const observedLevel = record.observedLevel ?? record.observed_level ?? '';
  const levelUnit = String(record.levelUnit ?? record.level_unit ?? '').trim();
  const maximumDailyDose = String(record.maximumDailyDose ?? record.maximum_daily_dose ?? '').trim();
  const impurityType = String(alias(record, 'impurityType', 'impurity_type')).trim();
  const qualificationBasis = String(alias(record, 'qualificationBasis', 'qualification_basis')).trim();

  /* Assessable means the ICH comparison can actually be made — and that question
     is ASKED OF THE ENGINE, not approximated here. A field-presence proxy (a
     name, a level, a unit, a dose, a class that is not 'unresolved') is weaker
     than the engine in four ways: an unparseable dose, a unit that does not
     convert, a class ICH does not govern, and a comparator-prefixed level all
     satisfy the proxy and are then refused by the engine. The section reported
     itself 100% complete over impurities it rendered as "not assessable". */
  const assessableForDs = forDs && isAssessableImpurity(record, 'drug_substance');
  const assessableForDp = forDp && isAssessableImpurity(record, 'drug_product');

  return {
    scope,
    materialName: alias(record, 'materialName', 'material_name'),
    impurityName,
    impurityType,
    origin: record.origin || '',
    casNumber: alias(record, 'casNumber', 'cas_number'),
    molecularFormula: alias(record, 'molecularFormula', 'molecular_formula'),
    structure: record.structure || '',
    relativeRetentionTime: alias(record, 'relativeRetentionTime', 'relative_retention_time'),
    analyticalMethod: alias(record, 'analyticalMethod', 'analytical_method'),
    observedLevel: String(observedLevel),
    levelUnit,
    /* Carried so an elemental impurity can be assessed against the ICH Q3D
       permitted daily exposure for the route it is actually given by. Without
       it the assessment refuses, which is correct — Q3D's oral PDE is the most
       permissive of the three for most elements and may not be assumed. */
    routeOfAdministration: alias(record, 'routeOfAdministration', 'route_of_administration'),
    specificationLimit: alias(record, 'specificationLimit', 'specification_limit'),
    reportingThreshold: alias(record, 'reportingThreshold', 'reporting_threshold'),
    identificationThreshold: alias(record, 'identificationThreshold', 'identification_threshold'),
    qualificationThreshold: alias(record, 'qualificationThreshold', 'qualification_threshold'),
    maximumDailyDose,
    /* Qualification is the PRESENCE of a recorded basis, never a boolean a save
       can set. §3.2.S.3.2 reports an impurity as qualified only where this
       carries the study or comparator that qualifies it. */
    qualificationBasis,
    controlStrategy: alias(record, 'controlStrategy', 'control_strategy'),
    batchesObserved: record.batchesObserved || record.batches_observed || null,
    status: record.status || 'draft',
    qualifiedAt: record.qualificationDate || record.qualification_date || null,
    // Side-scoped completeness keys — §3.2.S.3 / §3.2.S.4 versus §3.2.P.5.
    drugSubstanceImpurityProfile: forDs && impurityName ? impurityName : null,
    drugProductImpurityProfile: forDp && impurityName ? impurityName : null,
    drugSubstanceImpurityProfileComplete: assessableForDs ? impurityName : null,
    drugProductImpurityProfileComplete: assessableForDp ? impurityName : null,
  };
}

/**
 * Map a cmc_dissolution_profiles row to a canonical source payload.
 *
 * `purpose` plays the part `scope` plays for the material-sided registers.
 * §3.2.P.2 is where the method was developed and where profiles are compared;
 * §3.2.P.5 is where the release acceptance criterion lives. The generic keys
 * both sections used to read — `condition`, `specification`, `results`,
 * `passFail` — are deliberately NOT emitted: they are first-match reads, so one
 * record would have rendered identically into both sections and four different
 * records could each have supplied one row of a table presented as one test.
 *
 * `passFail` is not carried from the record either. Whether a profile meets its
 * acceptance criterion is a comparison against the recorded specification, which
 * the section performs from the profile itself; a typed pass/fail is a
 * conclusion with no working shown.
 */
export function mapDissolutionProfilePayload(record: Record<string, any>): Record<string, any> {
  const purpose = normalizeDissolutionPurpose(record.purpose);
  const forDevelopment = DISSOLUTION_DEVELOPMENT_PURPOSES.includes(purpose);
  const forRelease = purpose === DISSOLUTION_RELEASE_PURPOSE;

  const results = record.results ?? null;
  const points = Array.isArray(results) ? results.filter((r) => r && typeof r === 'object') : [];
  const specification = String(record.specification || '').trim();
  const apparatus = String(record.apparatus || '').trim();
  const medium = String(record.medium || '').trim();
  const unitsTested = Number(record.unitsTested ?? record.units_tested);

  /* A profile the section can actually say something about: a method (what was
     it run on, in what), at least one timepoint with a mean, and the number of
     units behind that mean. A mean with no n is not a result a section can
     report a conformance or a comparison from. */
  const hasMeans = points.some((p: any) => p.meanPercent !== undefined && p.meanPercent !== null && p.meanPercent !== '');
  const hasUnits = Number.isFinite(unitsTested) && unitsTested > 0;
  const profileUsable = Boolean(apparatus) && Boolean(medium) && hasMeans && hasUnits;

  return {
    purpose,
    productName: alias(record, 'productName', 'product_name'),
    batchNumber: alias(record, 'batchNumber', 'batch_number'),
    strength: record.strength || '',
    apparatus,
    rotationSpeed: alias(record, 'rotationSpeed', 'rotation_speed'),
    medium,
    mediumVolume: alias(record, 'mediumVolume', 'medium_volume'),
    temperature: record.temperature || '',
    sinker: record.sinker || '',
    dissolutionSpecification: specification,
    unitsTested: hasUnits ? unitsTested : null,
    dissolutionResults: points.length > 0 ? points : null,
    comparisonBatch: alias(record, 'comparisonBatch', 'comparison_batch'),
    comparisonResults: hasRecordedValue(record.comparisonResults ?? record.comparison_results)
      ? (record.comparisonResults ?? record.comparison_results)
      : null,
    testDate: record.testDate || record.test_date || null,
    status: record.status || 'draft',
    // Purpose-scoped completeness keys — §3.2.P.2 versus §3.2.P.5.
    developmentDissolutionProfile: forDevelopment && points.length > 0 ? (record.productName || record.product_name || 'profile') : null,
    releaseDissolutionProfile: forRelease && points.length > 0 ? (record.productName || record.product_name || 'profile') : null,
    developmentDissolutionProfileComplete: forDevelopment && profileUsable ? (record.batchNumber || record.batch_number || 'profile') : null,
    /* The release section additionally needs the acceptance criterion the
       profile is judged against: a profile with no specification cannot carry a
       conformance statement, and a specification with no profile is a criterion
       nobody has measured against. */
    releaseDissolutionProfileComplete: forRelease && profileUsable && specification ? (record.batchNumber || record.batch_number || 'profile') : null,
  };
}


/* The material role and human/animal origin rules live in
   shared/cmc/material-scope.ts, because the register surface needs the same
   answers — it resolved the role with a substring test and recognised two
   origins where §3.2.A.3 recognises twelve. Re-exported here so the existing
   server callers keep their import path. */
export { EXCIPIENT_ROLES, normalizeMaterialRole, isHumanOrAnimalOrigin };

/**
 * Map a cmc_material_specs row to a canonical source payload.
 *
 * The role decides the source TYPE — see writeThroughMaterialSpec below — and
 * the payload carries the same fields either way, because §3.2.P.4 and
 * §3.2.S.2.3 ask the same questions of a material.
 *
 * `origin` is emitted exactly as recorded and never inferred. §3.2.A.3 reads
 * it: an excipient with no recorded origin is a question that section must ask,
 * not one it may answer.
 */
export function mapMaterialSpecPayload(record: Record<string, any>): Record<string, any> {
  const role = normalizeMaterialRole(record.materialRole ?? record.material_role);
  const isExcipient = EXCIPIENT_ROLES.includes(role);
  const materialName = String(alias(record, 'materialName', 'material_name')).trim();
  const analyticalProcedures = String(alias(record, 'analyticalProcedures', 'analytical_procedures')).trim();
  const testParameters = record.testParameters ?? record.test_parameters ?? null;
  const origin = String(record.origin || '').trim();
  const monograph = String(alias(record, 'compendialMonograph', 'compendial_monograph')).trim();

  /* The specification, projected to the text §3.2.P.4 renders. A json array of
     {test, method, acceptanceCriteria} rows is what the register stores; the
     section's required field is a description of the specification. */
  const specRows = Array.isArray(testParameters)
    ? testParameters.filter((r) => r && typeof r === 'object')
    : [];
  const specText = specRows.length > 0
    ? specRows
        .map((r: any) => [r.test, r.acceptanceCriteria].filter(Boolean).join(' '))
        .filter(Boolean)
        .join('; ')
    : (monograph ? `Complies with ${monograph}` : '');

  /* A material the section can actually describe: named, with a specification
     (its own tests or a monograph it complies with) AND a way of testing it.
     The analytical procedure was named in this comment and not tested, which
     left open exactly the union the key exists to close: one excipient could
     carry the completeness key while a DIFFERENT one supplied
     excipientAnalyticalProcedures, and §3.2.P.4 scored complete over an
     excipient with no recorded way of being tested. */
  const testable = Boolean(analyticalProcedures) || Boolean(monograph);
  const describable = Boolean(materialName) && Boolean(specText) && testable;

  return {
    materialRole: role,
    materialName,
    functionInFormulation: alias(record, 'functionInFormulation', 'function_in_formulation'),
    grade: record.grade || '',
    compendialMonograph: monograph,
    compendialCompliance: alias(record, 'compendialCompliance', 'compendial_compliance'),
    supplier: record.supplier || '',
    manufacturerSite: alias(record, 'manufacturerSite', 'manufacturer_site'),
    /* Never normalised and never guessed: §3.2.A.3 distinguishes "recorded as
       plant" from "not recorded", and a blank is the second. */
    origin,
    originDetail: alias(record, 'originDetail', 'origin_detail'),
    humanOrAnimalOrigin: origin ? isHumanOrAnimalOrigin(origin) : null,
    tseCertificate: alias(record, 'tseCertificate', 'tse_certificate'),
    testParameters: hasRecordedValue(testParameters) ? testParameters : null,
    analyticalProcedures,
    novelExcipient: Boolean(record.novelExcipient ?? record.novel_excipient),
    novelExcipientJustification: alias(record, 'novelExcipientJustification', 'novel_excipient_justification'),
    status: record.status || 'draft',
    /* §3.2.P.4's required fields, emitted from the EXCIPIENT side only: a
       starting material for the drug substance is §3.2.S.2.3 content and must
       not complete the drug product's excipient control section. */
    excipientSpecifications: isExcipient && specText ? specText : null,
    excipientAnalyticalProcedures:
      isExcipient && (analyticalProcedures || monograph)
        ? analyticalProcedures || `Per ${monograph}`
        : null,
    excipientControlComplete: isExcipient && describable ? materialName : null,
    /* And the raw-material side, for §3.2.S.2.3. */
    rawMaterialSpecification: !isExcipient && specText ? specText : null,
  };
}

/**
 * Map a cmc_formulation_records row to a canonical source payload.
 *
 * §3.2.P.1's composition table read a first-match `components` array, so a
 * project with several formulation versions rendered whichever arrived first
 * and dropped the others. The payload carries the version and its status so the
 * section can render the CURRENT formulation and say what it superseded.
 */
export function mapFormulationRecordPayload(record: Record<string, any>): Record<string, any> {
  const components = record.components ?? null;
  const rows = Array.isArray(components) ? components.filter((c) => c && typeof c === 'object') : [];
  const formulationName = String(alias(record, 'formulationName', 'formulation_name')).trim();
  const status = String(record.status || 'draft');

  /* An overage is a regulatory question in its own right (ICH Q8): a component
     carrying one without a recorded justification is something §3.2.P.1 must
     state rather than pass over. */
  const overaged = rows.filter((c: any) => String(c.overage ?? '').trim());
  const unjustifiedOverages = overaged.filter(
    (c: any) => !String(c.overageJustification ?? '').trim() && !String(alias(record, 'overageJustification', 'overage_justification')).trim(),
  );

  return {
    formulationName,
    version: record.version || '',
    dosageForm: alias(record, 'dosageForm', 'dosage_form'),
    /* The key §3.2.P.1 actually reads, and its own required field. The
       formulation register captured the dosage form, stored it and mapped it
       under `dosageForm`, which nothing reads — so the section kept printing
       "[dosage form not specified]" over a value the staffer had entered. */
    dosageFormDescription: alias(record, 'dosageForm', 'dosage_form'),
    strength: record.strength || '',
    batchSize: alias(record, 'batchSize', 'batch_size'),
    components: rows.length > 0 ? rows : null,
    theoreticalYield: alias(record, 'theoreticalYield', 'theoretical_yield'),
    overageJustification: alias(record, 'overageJustification', 'overage_justification'),
    unjustifiedOverageCount: unjustifiedOverages.length,
    supersedes: record.supersedes || '',
    status,
    /* §3.2.P.1 is complete when ONE formulation carries a named composition
       with its components — not when a name and a component list arrive on two
       different records — and only when that formulation is the CURRENT one.
       The section renders the quantitative composition only for a record marked
       current, so scoring it complete on a draft said the composition section
       was finished in the same breath as the section text said the governing
       composition was not established. */
    formulationComposition: formulationName && rows.length > 0 ? formulationName : null,
    formulationCompositionComplete:
      status.toLowerCase() === 'current' &&
      formulationName && rows.length > 0 && rows.every((c: any) => String(c.component || c.name || '').trim())
        ? formulationName
        : null,
  };
}


/** Rows of a jsonb column that is meant to hold an array of objects. */
function jsonObjectRows(value: unknown): Record<string, any>[] {
  return Array.isArray(value) ? value.filter((r) => r && typeof r === 'object') : [];
}

/**
 * Map a manufacturing_processes row to a canonical source payload.
 *
 * §3.2.S.2.2 and §3.2.P.3.3 want the same three things of a process: what the
 * steps are, what the critical parameters are and what is controlled in-process.
 * The register holds each as structured rows, so the payload carries both the
 * rows (for the tables) and the text the section narrative reads.
 *
 * The side is the stored `processType`, resolved through the shared material
 * scope so a drug-substance process cannot complete §3.2.P.3 and a drug-product
 * one cannot complete §3.2.S.2 — the same rule as the container closure and
 * reference standard registers.
 */
export function mapManufacturingProcessPayload(record: Record<string, any>): Record<string, any> {
  const side = normalizeMaterialScope(record.processType ?? record.process_type, 'drug_substance');
  const forSubstance = side === 'drug_substance' || side === 'both';
  const forProduct = side === 'drug_product' || side === 'both';

  const processName = String(alias(record, 'processName', 'process_name')).trim();
  const description = String(alias(record, 'processDescription', 'process_description')).trim();
  const steps = jsonObjectRows(record.processSteps ?? record.process_steps);
  const cpps = jsonObjectRows(record.criticalProcessParameters ?? record.critical_process_parameters);
  const controls = jsonObjectRows(record.processControls ?? record.process_controls);
  const equipment = jsonObjectRows(record.equipmentList ?? record.equipment_list);
  const validationStatus = String(alias(record, 'validationStatus', 'validation_status')).trim();

  /* The ordered unit operations ARE the process description when no prose one
     was written: "the process consists of X, then Y, then Z" is sourced from
     the recorded steps, not invented. Steps are rendered in the order they were
     recorded when none carries a number — reordering an unnumbered list would
     assert a sequence the register does not hold. */
  const ordered = steps
    .map((st, i) => ({ st, i, n: Number(st.stepNumber ?? st.step_number ?? st.order) }))
    .sort((a, b) => {
      const an = Number.isFinite(a.n) ? a.n : Number.POSITIVE_INFINITY;
      const bn = Number.isFinite(b.n) ? b.n : Number.POSITIVE_INFINITY;
      return an === bn ? a.i - b.i : an - bn;
    })
    .map(({ st }) => st);

  const stepText = ordered
    .map((st: any) => String(st.unitOperation || st.unit_operation || st.stepName || st.step_name || '').trim())
    .filter(Boolean)
    .join('; ');

  /* In-process controls come from two places the register offers — a
     process-level control list and per-step controls — and a section that read
     only one of them would report "no in-process controls" over a process that
     records them on every step. */
  const stepControls = ordered.flatMap((st: any) => jsonObjectRows(st.inProcessControls ?? st.in_process_controls));
  const allControls = [...controls, ...stepControls];
  const controlText = allControls
    .map((c: any) =>
      [c.test || c.control || c.parameter, c.acceptanceCriteria || c.acceptance_criteria || c.limit]
        .filter(Boolean)
        .join(' ')
    )
    .filter(Boolean)
    .join('; ');

  /* A process the section can actually describe: named, with an ordered set of
     steps and at least one in-process control. Emitted as ONE key from ONE
     record, because the composer's completeness is a union across matched
     sources — without it, a record carrying only a name and a second carrying
     only steps would add up to a complete manufacturing section. */
  const describable = Boolean(processName) && ordered.length > 0 && allControls.length > 0;

  return {
    processScope: side,
    processName,
    processType: alias(record, 'processType', 'process_type'),
    /* This register's lifecycle column is validation_status, not status -- the
       table predates the register family and its two readers already use that
       name. The composer drops a RETIRED source by reading `status`, so the
       lifecycle has to reach it under that key or a superseded synthetic route
       composes as the process the filing describes. It was emitted only as
       processValidationStatus, which the retirement filter cannot see and
       nothing rendered. */
    status: validationStatus,
    processSteps: ordered.length > 0 ? ordered : null,
    criticalProcessParameters: cpps.length > 0 ? cpps : null,
    processControlRows: allControls.length > 0 ? allControls : null,
    /* §3.2.S.2's two required fields are emitted from the DRUG SUBSTANCE side
       only. The composer's completeness is a union across every matched source,
       and `manufacturing_process` matches §3.2.S.2 whatever side it is on — so
       an unscoped `processDescription` would have let a tablet compression
       process complete the drug substance's manufacturing section. The
       drug-product side carries the same two facts under its own names; §3.2.P.3
       renders them from the side-scoped tables. */
    processDescription: forSubstance ? (description || stepText || '') : null,
    /* Text, because the §3.2.S.2 narrative reads processControls with a
       first-match string helper; the rows travel alongside for the table. */
    processControls: forSubstance ? (controlText || null) : null,
    drugProductProcessDescription: forProduct ? (description || stepText || '') : null,
    drugProductProcessControls: forProduct ? (controlText || null) : null,
    equipmentList: equipment.length > 0 ? equipment : null,
    facilityInfo: hasRecordedValue(record.facilityInfo ?? record.facility_info)
      ? (record.facilityInfo ?? record.facility_info)
      : null,
    processBatchSize: alias(record, 'batchSize', 'batch_size'),
    yieldData: hasRecordedValue(record.yieldData ?? record.yield_data)
      ? (record.yieldData ?? record.yield_data)
      : null,
    scaleUpData: hasRecordedValue(record.scaleUpData ?? record.scale_up_data)
      ? (record.scaleUpData ?? record.scale_up_data)
      : null,
    processDevelopment: alias(record, 'processDevelopment', 'process_development'),
    reprocessing: record.reprocessing || '',
    processValidationStatus: validationStatus,
    /* §3.2.S.2's completeness key, drug-substance side only. */
    manufacturingProcessComplete: forSubstance && describable ? processName : null,
    /* §3.2.P.3's, drug-product side only. */
    drugProductProcessComplete: forProduct && describable ? processName : null,
  };
}

/**
 * Map a cmc_characterization_studies row to a canonical source payload.
 *
 * A study answers ONE of §3.2.S.3.1's three questions — the one its stored
 * `studyType` names — and the payload emits only that field. This is the whole
 * point of storing the type: the composer's completeness is a union across
 * matched sources, so three NMR studies emitting all three fields would have
 * reported the characterisation section complete over no physicochemical data
 * and no bioactivity data at all.
 *
 * Unlike the registers where a *Complete key had to close that union, the union
 * IS correct across types here: an NMR study and a solubility study together do
 * establish two of the three.
 */
export function mapCharacterizationStudyPayload(record: Record<string, any>): Record<string, any> {
  const type = normalizeCharacterizationType(record.studyType ?? record.study_type);
  const side = normalizeMaterialScope(record.scope, 'drug_substance');
  const forSubstance = side === 'drug_substance' || side === 'both';

  const studyTitle = String(alias(record, 'studyTitle', 'study_title')).trim();
  const technique = String(record.technique || '').trim();
  const attribute = String(record.attribute || '').trim();
  const result = String(record.result ?? '').trim();
  /* No unit is invented. A recorded number whose unit was never captured is
     reported as unrecorded, the same refusal the impurity register makes. */
  const resultUnit = String(alias(record, 'resultUnit', 'result_unit')).trim();
  const conclusion = String(record.conclusion || '').trim();

  /* The sentence the section can stand behind: a technique and what it showed.
     A study with a title and nothing else establishes nothing, so it answers no
     required field — it still renders in the table, where a reviewer can see
     that it was run and that its result is missing. */
  const statement = [
    [technique, attribute].filter(Boolean).join(' — '),
    result ? `${result}${resultUnit ? ` ${resultUnit}` : ''}` : '',
    conclusion,
  ]
    .filter(Boolean)
    .join(': ');
  const establishes = Boolean(technique) && Boolean(result || conclusion);

  const payload: Record<string, any> = {
    characterizationScope: side,
    characterizationType: type,
    studyTitle,
    technique,
    attribute,
    characterizationResult: result,
    /* Emitted as recorded, so the section can say "unit not recorded" instead
       of printing a bare number that reads as whatever unit the reader assumes. */
    characterizationResultUnit: resultUnit,
    acceptanceReference: alias(record, 'acceptanceReference', 'acceptance_reference'),
    conclusion,
    studyReference: alias(record, 'studyReference', 'study_reference'),
    performedBy: alias(record, 'performedBy', 'performed_by'),
    performedDate: record.performedDate || record.performed_date || null,
    supportingData: hasRecordedValue(record.supportingData ?? record.supporting_data)
      ? (record.supportingData ?? record.supporting_data)
      : null,
    status: record.status || 'draft',
    characterizationStatement: statement || null,
    /* Whether the study established anything — a technique AND a readout. The
       statement alone is not that test: a study with a technique and no result
       still produces a statement naming the technique, and a section counting
       statements would have reported it as a finding. */
    characterizationEstablishes: establishes,
  };

  /* The one field this study type can answer — and only when the study
     actually established something, and only on the drug-substance side,
     because §3.2.S.3 is the drug substance's characterisation section. */
  payload[CHARACTERIZATION_TYPE_FIELD[type]] =
    forSubstance && establishes ? (statement || studyTitle) : null;

  return payload;
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

export async function writeThroughImpurityProfile(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'impurity_profile',
    sourceKey: `impurity_profile:${recordId}`,
    sourcePayload: mapImpurityProfilePayload(record),
    createdBy,
  });
}

export async function writeThroughDissolutionProfile(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'dissolution_profile',
    sourceKey: `dissolution_profile:${recordId}`,
    sourcePayload: mapDissolutionProfilePayload(record),
    createdBy,
  });
}

/**
 * The material register writes one of TWO canonical source types, decided by
 * the role: an excipient is §3.2.P.4 content, a raw or starting material is
 * §3.2.S.2.3 content. One register, one mapper, the section chosen by what the
 * material IS.
 */
export async function writeThroughMaterialSpec(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  const role = normalizeMaterialRole(record.materialRole ?? record.material_role);
  const sourceType: CmcSourceType = EXCIPIENT_ROLES.includes(role) ? 'excipient' : 'raw_material_spec';
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType,
    sourceKey: `${sourceType}:${recordId}`,
    sourcePayload: mapMaterialSpecPayload(record),
    createdBy,
  });
}

export async function writeThroughFormulationRecord(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'formulation_record',
    sourceKey: `formulation_record:${recordId}`,
    sourcePayload: mapFormulationRecordPayload(record),
    createdBy,
  });
}

export async function writeThroughManufacturingProcess(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'manufacturing_process',
    sourceKey: `manufacturing_process:${recordId}`,
    sourcePayload: mapManufacturingProcessPayload(record),
    createdBy,
  });
}

export async function writeThroughCharacterizationStudy(
  orgId: number, projectId: string, recordId: string, record: Record<string, any>, createdBy?: string,
): Promise<WriteThroughResult | null> {
  return writeThroughToCanonicalSource({
    orgId, projectId, sourceType: 'characterization',
    sourceKey: `characterization:${recordId}`,
    sourcePayload: mapCharacterizationStudyPayload(record),
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
