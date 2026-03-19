/**
 * =============================================================================
 * Manufacturing Service
 * =============================================================================
 * Enterprise service for ISA-95/FHIR manufacturing data management,
 * batch execution records, and quality test results.
 * 
 * Features:
 * - ISA-95 to FHIR mapping management
 * - Equipment registry and qualification tracking
 * - Batch execution record management
 * - Quality test result capture
 * - GxP compliance support
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  ISA95FHIRMapping,
  TransformationRule,
  EquipmentRegistry,
  EquipmentStatus,
  ISA95Hierarchy,
  QualificationStatus,
  BatchExecutionRecord,
  BatchStatus,
  EquipmentUsage,
  ProcessParameter,
  Deviation,
  QualityTestResult,
  QualityDecision,
  Specification,
  TestResultValue,
  ServiceResult,
  PaginatedResult,
  SearchCriteria
} from './types';

export interface ManufacturingServiceConfig {
  pool: Pool;
  enableFHIRMapping?: boolean;
}

export class ManufacturingService {
  private pool: Pool;
  private readonly schema = 'manufacturing';
  private readonly enableFHIRMapping: boolean;

  constructor(config: ManufacturingServiceConfig) {
    this.pool = config.pool;
    this.enableFHIRMapping = config.enableFHIRMapping ?? true;
  }

  // ===========================================================================
  // ISA-95 / FHIR MAPPINGS
  // ===========================================================================

  /**
   * Create an ISA-95 to FHIR mapping
   */
  async createMapping(
    mapping: Omit<ISA95FHIRMapping, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<ISA95FHIRMapping>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.isa95_fhir_mappings (
          id, tenant_id, isa95_element, isa95_path, fhir_resource_type,
          fhir_path, transformation_rule, bidirectional, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          mapping.tenantId,
          mapping.isa95Element,
          mapping.isa95Path,
          mapping.fhirResourceType,
          mapping.fhirPath,
          JSON.stringify(mapping.transformationRule),
          mapping.bidirectional,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapISA95FHIRMapping(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MAPPING_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get mappings for a tenant
   */
  async getMappings(
    tenantId: string,
    options?: { fhirResourceType?: string; isa95Element?: string }
  ): Promise<ServiceResult<ISA95FHIRMapping[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE tenant_id = $1';
      const params: unknown[] = [tenantId];
      let paramIndex = 2;

      if (options?.fhirResourceType) {
        whereClause += ` AND fhir_resource_type = $${paramIndex++}`;
        params.push(options.fhirResourceType);
      }

      if (options?.isa95Element) {
        whereClause += ` AND isa95_element = $${paramIndex++}`;
        params.push(options.isa95Element);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.isa95_fhir_mappings ${whereClause}`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapISA95FHIRMapping),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MAPPING_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Apply ISA-95 to FHIR transformation
   */
  async transformISA95ToFHIR(
    mappingId: string,
    isa95Data: Record<string, unknown>
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const startTime = Date.now();

    try {
      const mappingResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.isa95_fhir_mappings WHERE id = $1`,
        [mappingId]
      );

      if (mappingResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Mapping not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const mapping = this.mapISA95FHIRMapping(mappingResult.rows[0]);
      const rule = mapping.transformationRule;

      // Apply transformation based on rule type
      let fhirData: Record<string, unknown> = {};

      switch (rule.mappingType) {
        case 'direct':
          // Direct mapping - copy value at path
          fhirData = this.getNestedValue(isa95Data, mapping.isa95Path);
          break;

        case 'computed':
          // Apply expression (simplified - would use a proper expression evaluator)
          if (rule.expression) {
            // For demo, just copy with prefix
            fhirData = {
              [mapping.fhirPath]: this.getNestedValue(isa95Data, mapping.isa95Path)
            };
          }
          break;

        case 'lookup':
          // Lookup table transformation
          if (rule.lookupTable) {
            const sourceValue = String(this.getNestedValue(isa95Data, mapping.isa95Path));
            fhirData = {
              [mapping.fhirPath]: rule.lookupTable[sourceValue] || sourceValue
            };
          }
          break;
      }

      return {
        success: true,
        data: {
          resourceType: mapping.fhirResourceType,
          ...fhirData
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TRANSFORM_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // EQUIPMENT REGISTRY
  // ===========================================================================

  /**
   * Register equipment
   */
  async registerEquipment(
    equipment: Omit<EquipmentRegistry, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<EquipmentRegistry>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.equipment_registry (
          id, tenant_id, equipment_id, equipment_name, equipment_type,
          manufacturer, model_number, serial_number, site_location,
          installation_date, status, fhir_device_reference,
          isa95_hierarchy, qualification_status, next_calibration_due,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          id,
          equipment.tenantId,
          equipment.equipmentId,
          equipment.equipmentName,
          equipment.equipmentType,
          equipment.manufacturer,
          equipment.modelNumber,
          equipment.serialNumber,
          equipment.siteLocation,
          equipment.installationDate,
          equipment.status || EquipmentStatus.OPERATIONAL,
          equipment.fhirDeviceReference,
          JSON.stringify(equipment.isa95Hierarchy),
          JSON.stringify(equipment.qualificationStatus),
          equipment.nextCalibrationDue,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapEquipmentRegistry(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EQUIPMENT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update equipment status
   */
  async updateEquipmentStatus(
    equipmentId: string,
    status: EquipmentStatus,
    tenantId?: string
  ): Promise<ServiceResult<EquipmentRegistry>> {
    const startTime = Date.now();

    try {
      const params: unknown[] = [status, equipmentId];
      let whereClause = 'WHERE id = $2';
      if (tenantId) {
        params.push(tenantId);
        whereClause += ` AND tenant_id = $${params.length}`;
      }
      const result = await this.pool.query(
        `UPDATE ${this.schema}.equipment_registry
         SET status = $1, updated_at = NOW()
         ${whereClause}
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Equipment not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapEquipmentRegistry(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EQUIPMENT_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * List equipment with filtering
   */
  async listEquipment(
    tenantId: string,
    criteria?: SearchCriteria & {
      status?: EquipmentStatus;
      equipmentType?: string;
      siteLocation?: string;
      needsCalibration?: boolean;
    }
  ): Promise<ServiceResult<PaginatedResult<EquipmentRegistry>>> {
    const startTime = Date.now();
    const page = criteria?.page || 1;
    const pageSize = criteria?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    try {
      let whereClause = 'WHERE tenant_id = $1';
      const params: unknown[] = [tenantId];
      let paramIndex = 2;

      if (criteria?.status) {
        whereClause += ` AND status = $${paramIndex++}`;
        params.push(criteria.status);
      }

      if (criteria?.equipmentType) {
        whereClause += ` AND equipment_type = $${paramIndex++}`;
        params.push(criteria.equipmentType);
      }

      if (criteria?.siteLocation) {
        whereClause += ` AND site_location = $${paramIndex++}`;
        params.push(criteria.siteLocation);
      }

      if (criteria?.needsCalibration) {
        whereClause += ` AND next_calibration_due <= NOW() + INTERVAL '30 days'`;
      }

      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM ${this.schema}.equipment_registry ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(pageSize, offset);
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.equipment_registry 
         ${whereClause}
         ORDER BY equipment_name
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: {
          items: result.rows.map(this.mapEquipmentRegistry),
          total,
          page,
          pageSize,
          hasNext: offset + result.rows.length < total,
          hasPrevious: page > 1
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'EQUIPMENT_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get equipment requiring calibration
   */
  async getEquipmentNeedingCalibration(
    tenantId: string,
    daysAhead: number = 30
  ): Promise<ServiceResult<EquipmentRegistry[]>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.equipment_registry 
         WHERE tenant_id = $1
           AND next_calibration_due <= NOW() + INTERVAL '1 day' * $2
           AND status = 'operational'
         ORDER BY next_calibration_due`,
        [tenantId, daysAhead]
      );

      return {
        success: true,
        data: result.rows.map(this.mapEquipmentRegistry),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CALIBRATION_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // BATCH EXECUTION RECORDS
  // ===========================================================================

  /**
   * Create a batch execution record
   */
  async createBatchRecord(
    batch: Omit<BatchExecutionRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<BatchExecutionRecord>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.batch_execution_records (
          id, tenant_id, batch_id, product_id, batch_number,
          recipe_name, recipe_version, scheduled_start, actual_start,
          actual_end, status, equipment_used, process_parameters,
          deviations, fhir_medication_batch_ref, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          id,
          batch.tenantId,
          batch.batchId,
          batch.productId,
          batch.batchNumber,
          batch.recipeName,
          batch.recipeVersion,
          batch.scheduledStart,
          batch.actualStart,
          batch.actualEnd,
          batch.status || BatchStatus.PLANNED,
          JSON.stringify(batch.equipmentUsed || []),
          JSON.stringify(batch.processParameters || []),
          JSON.stringify(batch.deviations || []),
          batch.fhirMedicationBatchRef,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapBatchRecord(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BATCH_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update batch status
   */
  async updateBatchStatus(
    batchId: string,
    status: BatchStatus,
    options?: { actualStart?: Date; actualEnd?: Date }
  ): Promise<ServiceResult<BatchExecutionRecord>> {
    const startTime = Date.now();

    try {
      let updateFields = 'status = $1, updated_at = NOW()';
      const params: unknown[] = [status, batchId];
      let paramIndex = 3;

      if (options?.actualStart) {
        updateFields += `, actual_start = $${paramIndex++}`;
        params.splice(paramIndex - 2, 0, options.actualStart);
      }

      if (options?.actualEnd) {
        updateFields += `, actual_end = $${paramIndex++}`;
        params.splice(paramIndex - 2, 0, options.actualEnd);
      }

      const result = await this.pool.query(
        `UPDATE ${this.schema}.batch_execution_records 
         SET ${updateFields}
         WHERE id = $2
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapBatchRecord(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BATCH_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Record process parameter
   */
  async recordProcessParameter(
    batchId: string,
    parameter: ProcessParameter
  ): Promise<ServiceResult<BatchExecutionRecord>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.batch_execution_records 
         SET process_parameters = process_parameters || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify([parameter]), batchId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapBatchRecord(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PARAMETER_RECORD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Record a deviation
   */
  async recordDeviation(
    batchId: string,
    deviation: Deviation
  ): Promise<ServiceResult<BatchExecutionRecord>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.batch_execution_records 
         SET deviations = deviations || $1::jsonb,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify([deviation]), batchId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapBatchRecord(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DEVIATION_RECORD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // QUALITY TEST RESULTS
  // ===========================================================================

  /**
   * Record quality test result
   */
  async recordTestResult(
    testResult: Omit<QualityTestResult, 'id'>
  ): Promise<ServiceResult<QualityTestResult>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.quality_test_results (
          id, tenant_id, batch_id, test_id, test_name, test_method,
          specification, result, quality_decision, tested_by,
          reviewed_by, tested_at, reviewed_at, fhir_observation_ref
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          id,
          testResult.tenantId,
          testResult.batchId,
          testResult.testId,
          testResult.testName,
          testResult.testMethod,
          JSON.stringify(testResult.specification),
          JSON.stringify(testResult.result),
          testResult.qualityDecision || QualityDecision.PENDING,
          testResult.testedBy,
          testResult.reviewedBy,
          testResult.testedAt,
          testResult.reviewedAt,
          testResult.fhirObservationRef
        ]
      );

      return {
        success: true,
        data: this.mapQualityTestResult(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TEST_RESULT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update quality decision
   */
  async updateQualityDecision(
    resultId: string,
    decision: QualityDecision,
    reviewedBy: string
  ): Promise<ServiceResult<QualityTestResult>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.quality_test_results 
         SET quality_decision = $1, reviewed_by = $2, reviewed_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [decision, reviewedBy, resultId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Test result not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapQualityTestResult(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DECISION_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get test results for a batch
   */
  async getBatchTestResults(
    batchId: string
  ): Promise<ServiceResult<QualityTestResult[]>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.quality_test_results 
         WHERE batch_id = $1
         ORDER BY tested_at`,
        [batchId]
      );

      return {
        success: true,
        data: result.rows.map(this.mapQualityTestResult),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TEST_RESULTS_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Check batch release readiness
   */
  async checkBatchReleaseReadiness(
    batchId: string
  ): Promise<ServiceResult<{
    ready: boolean;
    pendingTests: number;
    failedTests: number;
    openDeviations: number;
    issues: string[];
  }>> {
    const startTime = Date.now();

    try {
      // Get batch and test results
      const batchResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.batch_execution_records WHERE id = $1`,
        [batchId]
      );

      if (batchResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Batch not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const batch = this.mapBatchRecord(batchResult.rows[0]);

      const testResults = await this.pool.query(
        `SELECT quality_decision, COUNT(*) as count
         FROM ${this.schema}.quality_test_results 
         WHERE batch_id = $1
         GROUP BY quality_decision`,
        [batchId]
      );

      const issues: string[] = [];
      let pendingTests = 0;
      let failedTests = 0;

      for (const row of testResults.rows) {
        switch (row.quality_decision) {
          case QualityDecision.PENDING:
            pendingTests = parseInt(row.count, 10);
            issues.push(`${pendingTests} test(s) pending review`);
            break;
          case QualityDecision.REJECTED:
            failedTests = parseInt(row.count, 10);
            issues.push(`${failedTests} test(s) failed`);
            break;
          case QualityDecision.UNDER_INVESTIGATION:
            issues.push(`${row.count} test(s) under investigation`);
            break;
        }
      }

      // Check open deviations
      const openDeviations = batch.deviations.filter(d => !d.resolvedAt).length;
      if (openDeviations > 0) {
        issues.push(`${openDeviations} open deviation(s)`);
      }

      // Check batch status
      if (batch.status !== BatchStatus.COMPLETED) {
        issues.push(`Batch status is ${batch.status}, not completed`);
      }

      return {
        success: true,
        data: {
          ready: issues.length === 0,
          pendingTests,
          failedTests,
          openDeviations,
          issues
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'RELEASE_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return current;
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapISA95FHIRMapping = (row: Record<string, unknown>): ISA95FHIRMapping => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    isa95Element: row.isa95_element as string,
    isa95Path: row.isa95_path as string,
    fhirResourceType: row.fhir_resource_type as string,
    fhirPath: row.fhir_path as string,
    transformationRule: row.transformation_rule as TransformationRule,
    bidirectional: row.bidirectional as boolean,
    validatedAt: row.validated_at ? new Date(row.validated_at as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapEquipmentRegistry = (row: Record<string, unknown>): EquipmentRegistry => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    equipmentId: row.equipment_id as string,
    equipmentName: row.equipment_name as string,
    equipmentType: row.equipment_type as string,
    manufacturer: row.manufacturer as string | undefined,
    modelNumber: row.model_number as string | undefined,
    serialNumber: row.serial_number as string | undefined,
    siteLocation: row.site_location as string,
    installationDate: row.installation_date ? new Date(row.installation_date as string) : undefined,
    status: row.status as EquipmentStatus,
    fhirDeviceReference: row.fhir_device_reference as string | undefined,
    isa95Hierarchy: row.isa95_hierarchy as ISA95Hierarchy,
    qualificationStatus: row.qualification_status as QualificationStatus,
    nextCalibrationDue: row.next_calibration_due ? new Date(row.next_calibration_due as string) : undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapBatchRecord = (row: Record<string, unknown>): BatchExecutionRecord => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    batchId: row.batch_id as string,
    productId: row.product_id as string,
    batchNumber: row.batch_number as string,
    recipeName: row.recipe_name as string,
    recipeVersion: row.recipe_version as string,
    scheduledStart: new Date(row.scheduled_start as string),
    actualStart: row.actual_start ? new Date(row.actual_start as string) : undefined,
    actualEnd: row.actual_end ? new Date(row.actual_end as string) : undefined,
    status: row.status as BatchStatus,
    equipmentUsed: row.equipment_used as EquipmentUsage[],
    processParameters: row.process_parameters as ProcessParameter[],
    deviations: row.deviations as Deviation[],
    fhirMedicationBatchRef: row.fhir_medication_batch_ref as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapQualityTestResult = (row: Record<string, unknown>): QualityTestResult => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    batchId: row.batch_id as string,
    testId: row.test_id as string,
    testName: row.test_name as string,
    testMethod: row.test_method as string,
    specification: row.specification as Specification,
    result: row.result as TestResultValue,
    qualityDecision: row.quality_decision as QualityDecision,
    testedBy: row.tested_by as string,
    reviewedBy: row.reviewed_by as string | undefined,
    testedAt: new Date(row.tested_at as string),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string) : undefined,
    fhirObservationRef: row.fhir_observation_ref as string | undefined
  });
}
