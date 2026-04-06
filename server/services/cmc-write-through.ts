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
import { impactedSectionsForSourceType, type CmcSourceType } from './module3Composer';
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
 * Map a drugSubstances row to a canonical source payload.
 */
export function mapDrugSubstancePayload(record: Record<string, any>): Record<string, any> {
  return {
    name: record.substanceName || record.substance_name || '',
    manufacturer: record.manufacturer || '',
    cas: record.casNumber || record.cas || record.cas_number || '',
    molecularFormula: record.molecularFormula || record.molecular_formula || '',
    molecularWeight: record.molecularWeight || record.molecular_weight || '',
    structure: record.structure || '',
    manufacturingRoute: record.manufacturingRoute || record.manufacturing_route || '',
    specifications: record.specifications || null,
    stability_data: record.stability_data || null,
    characterization_data: record.characterization_data || null,
    impurities: record.impurities || null,
    reference_materials: record.reference_materials || null,
    physicochemicalProperties: record.physicochemicalProperties || record.physicochemical_properties || null,
    biologicalActivity: record.biologicalActivity || record.biological_activity || null,
    structuralElucidation: record.structuralElucidation || record.structural_elucidation || null,
    qualificationBasis: record.qualificationBasis || record.qualification_basis || null,
  };
}

/**
 * Map a drugProducts row to a canonical source payload.
 */
export function mapDrugProductPayload(record: Record<string, any>): Record<string, any> {
  return {
    name: record.productName || record.product_name || '',
    dosageForm: record.dosageForm || record.dosage_form || '',
    dosageFormDescription: record.dosageForm || record.dosage_form || '',
    strength: record.strength || '',
    routeOfAdministration: record.routeOfAdministration || record.route_of_administration || '',
    containerClosure: record.containerClosure || record.container_closure || '',
    batchSize: record.batchSize || record.batch_size || '',
    formulation: record.formulation || null,
    composition: record.formulation || record.composition || null,
    excipients: record.excipients || null,
    manufacturing_process: record.manufacturing_process || null,
    specifications: record.specifications || null,
    stability_data: record.stability_data || null,
    components: record.components || null,
    version: record.version || null,
  };
}

/**
 * Map an analyticalMethods row to a canonical source payload.
 */
export function mapAnalyticalMethodPayload(record: Record<string, any>): Record<string, any> {
  return {
    methodName: record.methodName || record.method_name || '',
    methodType: record.methodType || record.method_type || '',
    purpose: record.purpose || '',
    principle: record.principle || '',
    procedure: record.procedure || '',
    validationStatus: record.validationStatus || record.validation_status || '',
    acceptanceCriteria: record.acceptanceCriteria || record.acceptance_criteria || '',
    validation_data: record.validation_data || null,
    specificity_data: record.specificity_data || null,
    linearity_data: record.linearity_data || null,
    accuracy_data: record.accuracy_data || null,
    precision_data: record.precision_data || null,
    robustness_data: record.robustness_data || null,
    system_suitability: record.system_suitability || null,
  };
}

/**
 * Map a stabilityStudies row to a canonical source payload.
 */
export function mapStabilityPayload(record: Record<string, any>): Record<string, any> {
  return {
    studyName: record.studyName || record.study_name || '',
    studyType: record.studyType || record.study_type || '',
    storageCondition: record.storageCondition || record.storage_condition || '',
    duration: record.duration || '',
    timePoints: record.timePoints || record.time_points || '',
    containerClosure: record.containerClosure || record.container_closure || '',
    testParameters: record.testParameters || record.test_parameters || '',
    stabilityParameters: record.testParameters || record.test_parameters || '',
    status: record.status || '',
    startedDate: record.startedDate || record.started_date || null,
    completedDate: record.completedDate || record.completed_date || null,
    results: record.results || null,
    batchesStudied: record.batchesStudied || record.batches_studied || null,
    packagingConfiguration: record.packagingConfiguration || record.packaging_configuration || null,
    shelfLifeClaim: record.shelfLifeClaim || record.shelf_life_claim || null,
  };
}

/**
 * Map a quality_specifications row to a canonical source payload.
 */
export function mapSpecificationPayload(record: Record<string, any>): Record<string, any> {
  return {
    materialType: record.materialType || record.material_type || '',
    materialName: record.materialName || record.material_name || '',
    acceptanceCriteria: record.acceptanceCriteria || record.acceptance_criteria || null,
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
 */
export function mapBatchRecordPayload(record: Record<string, any>): Record<string, any> {
  return {
    batchNumber: record.batchNumber || record.batch_number || '',
    productName: record.productName || record.product_name || '',
    batchSize: record.batchSize || record.batch_size || '',
    manufacturingDate: record.manufacturingDate || record.manufacturing_date || null,
    expiryDate: record.expiryDate || record.expiry_date || null,
    manufacturingSite: record.manufacturingSite || record.manufacturing_site || '',
    status: record.status || '',
    processParameters: record.processParameters || record.process_parameters || null,
    inProcessControls: record.inProcessControls || record.in_process_controls || null,
    yieldData: record.yieldData || record.yield_data || null,
    deviations: record.deviations || null,
    releaseTesting: record.releaseTesting || record.release_testing || null,
    formulation: record.formulation || null,
  };
}

/**
 * Map a change_control row to a canonical source payload.
 */
export function mapChangeControlPayload(record: Record<string, any>): Record<string, any> {
  return {
    changeTitle: record.changeTitle || record.change_title || record.title || '',
    changeType: record.changeType || record.change_type || '',
    changeDescription: record.changeDescription || record.change_description || record.description || '',
    impactAssessment: record.impactAssessment || record.impact_assessment || '',
    justification: record.justification || '',
    status: record.status || '',
    priority: record.priority || '',
    riskLevel: record.riskLevel || record.risk_level || '',
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
 */
export function mapProcessValidationPayload(record: Record<string, any>): Record<string, any> {
  return {
    validationType: record.validationType || record.validation_type || '',
    processName: record.processName || record.process_name || '',
    batchSize: record.batchSize || record.batch_size || '',
    processDescription: record.processDescription || record.process_description || '',
    processControls: record.processControls || record.process_controls || null,
    acceptanceCriteria: record.acceptanceCriteria || record.acceptance_criteria || null,
    results: record.results || null,
    status: record.status || '',
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
       ON CONFLICT (project_id, source_type, source_key, version)
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
