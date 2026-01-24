/**
 * =============================================================================
 * Digital Twin Runtime Service
 * =============================================================================
 * Enterprise service for pharmaceutical Digital Twin management,
 * model serving, and drift detection for Real-Time Release Testing (RTRT).
 * 
 * Features:
 * - Digital Twin lifecycle management
 * - State synchronization with physical assets
 * - RTRT prediction engine
 * - Drift detection and alerting
 * - Model version management
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  DigitalTwin,
  TwinType,
  TwinOperationalState,
  DigitalTwinModel,
  RTRTPrediction,
  CQAPrediction,
  ReleaseDecision,
  ServiceResult,
  PaginatedResult,
  SearchCriteria
} from './types';

export interface DigitalTwinRuntimeConfig {
  pool: Pool;
  driftCheckIntervalMs?: number;
  defaultPredictionHorizonHours?: number;
  defaultDriftThreshold?: number;
}

export interface PredictionInput {
  batchId: string;
  inputFeatures: Record<string, unknown>;
  requestedCQAs?: string[];
}

export interface DriftAnalysis {
  driftDetected: boolean;
  driftScore: number;
  driftingFeatures: Array<{
    featureName: string;
    expectedRange: [number, number];
    actualValue: number;
    deviation: number;
  }>;
  recommendation: string;
}

export class DigitalTwinRuntime {
  private pool: Pool;
  private readonly schema = 'manufacturing';
  private readonly driftCheckIntervalMs: number;
  private readonly defaultPredictionHorizonHours: number;
  private readonly defaultDriftThreshold: number;

  constructor(config: DigitalTwinRuntimeConfig) {
    this.pool = config.pool;
    this.driftCheckIntervalMs = config.driftCheckIntervalMs || 60000;
    this.defaultPredictionHorizonHours = config.defaultPredictionHorizonHours || 24;
    this.defaultDriftThreshold = config.defaultDriftThreshold || 0.15;
  }

  // ===========================================================================
  // DIGITAL TWIN MANAGEMENT
  // ===========================================================================

  /**
   * Create a new Digital Twin
   */
  async createDigitalTwin(
    twin: Omit<DigitalTwin, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<DigitalTwin>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.digital_twins (
          id, tenant_id, twin_type, physical_asset_id, twin_name,
          model_definition, current_state, operational_state,
          last_sync_at, prediction_horizon_hours, drift_threshold,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          id,
          twin.tenantId,
          twin.twinType,
          twin.physicalAssetId,
          twin.twinName,
          JSON.stringify(twin.modelDefinition),
          JSON.stringify(twin.currentState || {}),
          twin.operationalState || TwinOperationalState.TRAINING,
          twin.lastSyncAt,
          twin.predictionHorizonHours || this.defaultPredictionHorizonHours,
          twin.driftThreshold || this.defaultDriftThreshold,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapDigitalTwin(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TWIN_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get Digital Twin by ID
   */
  async getDigitalTwin(twinId: string): Promise<ServiceResult<DigitalTwin>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.digital_twins WHERE id = $1`,
        [twinId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Digital Twin ${twinId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDigitalTwin(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'TWIN_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update Digital Twin operational state
   */
  async updateOperationalState(
    twinId: string,
    state: TwinOperationalState
  ): Promise<ServiceResult<DigitalTwin>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.digital_twins 
         SET operational_state = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [state, twinId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Digital Twin not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDigitalTwin(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'STATE_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Synchronize state from physical asset
   */
  async syncFromPhysicalAsset(
    twinId: string,
    physicalState: Record<string, unknown>
  ): Promise<ServiceResult<DigitalTwin>> {
    const startTime = Date.now();

    try {
      // Get current twin state
      const twinResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.digital_twins WHERE id = $1`,
        [twinId]
      );

      if (twinResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Digital Twin not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const twin = this.mapDigitalTwin(twinResult.rows[0]);

      // Merge states (physical overrides digital where applicable)
      const mergedState = {
        ...twin.currentState,
        ...physicalState,
        lastSyncTimestamp: new Date().toISOString()
      };

      const result = await this.pool.query(
        `UPDATE ${this.schema}.digital_twins 
         SET current_state = $1, last_sync_at = NOW(), updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(mergedState), twinId]
      );

      return {
        success: true,
        data: this.mapDigitalTwin(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update model definition
   */
  async updateModelDefinition(
    twinId: string,
    modelDefinition: DigitalTwinModel
  ): Promise<ServiceResult<DigitalTwin>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.digital_twins 
         SET model_definition = $1, operational_state = 'validation', updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(modelDefinition), twinId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Digital Twin not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapDigitalTwin(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MODEL_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * List Digital Twins
   */
  async listDigitalTwins(
    tenantId: string,
    criteria?: SearchCriteria & {
      twinType?: TwinType;
      operationalState?: TwinOperationalState;
      physicalAssetId?: string;
    }
  ): Promise<ServiceResult<PaginatedResult<DigitalTwin>>> {
    const startTime = Date.now();
    const page = criteria?.page || 1;
    const pageSize = criteria?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    try {
      let whereClause = 'WHERE tenant_id = $1';
      const params: unknown[] = [tenantId];
      let paramIndex = 2;

      if (criteria?.twinType) {
        whereClause += ` AND twin_type = $${paramIndex++}`;
        params.push(criteria.twinType);
      }

      if (criteria?.operationalState) {
        whereClause += ` AND operational_state = $${paramIndex++}`;
        params.push(criteria.operationalState);
      }

      if (criteria?.physicalAssetId) {
        whereClause += ` AND physical_asset_id = $${paramIndex++}`;
        params.push(criteria.physicalAssetId);
      }

      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM ${this.schema}.digital_twins ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(pageSize, offset);
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.digital_twins 
         ${whereClause}
         ORDER BY twin_name
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: {
          items: result.rows.map(this.mapDigitalTwin),
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
          code: 'TWIN_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // RTRT PREDICTIONS
  // ===========================================================================

  /**
   * Generate RTRT prediction for batch release
   */
  async generateRTRTPrediction(
    twinId: string,
    input: PredictionInput
  ): Promise<ServiceResult<RTRTPrediction>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the Digital Twin
      const twinResult = await client.query(
        `SELECT * FROM ${this.schema}.digital_twins 
         WHERE id = $1 AND operational_state = 'active'`,
        [twinId]
      );

      if (twinResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'TWIN_NOT_ACTIVE', message: 'Digital Twin not found or not active' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const twin = this.mapDigitalTwin(twinResult.rows[0]);

      // Run drift detection
      const driftAnalysis = await this.analyzeDrift(twin, input.inputFeatures);

      // Generate predictions for CQAs
      // In production, this would call the actual ML model
      const predictedCqa: CQAPrediction[] = this.simulateCQAPredictions(
        twin.modelDefinition,
        input.inputFeatures,
        input.requestedCQAs
      );

      // Calculate overall confidence
      const avgConfidence = predictedCqa.reduce((sum, p) => sum + p.inSpecProbability, 0) / predictedCqa.length;

      // Determine release decision
      let releaseDecision: ReleaseDecision;
      if (driftAnalysis.driftDetected) {
        releaseDecision = ReleaseDecision.MANUAL_REVIEW;
      } else if (avgConfidence >= 0.95) {
        releaseDecision = ReleaseDecision.RTRT_APPROVED;
      } else if (avgConfidence >= 0.80) {
        releaseDecision = ReleaseDecision.TRADITIONAL_TESTING;
      } else {
        releaseDecision = ReleaseDecision.REJECTED;
      }

      // Store prediction
      const predictionId = uuidv4();
      const result = await client.query(
        `INSERT INTO ${this.schema}.rtrt_predictions (
          id, digital_twin_id, batch_id, prediction_timestamp,
          predicted_cqa, confidence_score, model_version,
          input_features, release_decision, drift_detected, created_at
        ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *`,
        [
          predictionId,
          twinId,
          input.batchId,
          JSON.stringify(predictedCqa),
          avgConfidence,
          twin.modelDefinition.modelVersion,
          JSON.stringify(input.inputFeatures),
          releaseDecision,
          driftAnalysis.driftDetected
        ]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapRTRTPrediction(result.rows[0]),
        metadata: {
          executionTimeMs: Date.now() - startTime,
          warnings: driftAnalysis.driftDetected ? ['Model drift detected'] : undefined
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'PREDICTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Record actual outcome for prediction validation
   */
  async recordActualOutcome(
    predictionId: string,
    actualOutcome: Record<string, unknown>
  ): Promise<ServiceResult<RTRTPrediction>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.rtrt_predictions 
         SET actual_outcome = $1
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(actualOutcome), predictionId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Prediction not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapRTRTPrediction(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'OUTCOME_RECORD_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get predictions for a batch
   */
  async getBatchPredictions(batchId: string): Promise<ServiceResult<RTRTPrediction[]>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.rtrt_predictions 
         WHERE batch_id = $1
         ORDER BY prediction_timestamp DESC`,
        [batchId]
      );

      return {
        success: true,
        data: result.rows.map(this.mapRTRTPrediction),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PREDICTIONS_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // DRIFT DETECTION
  // ===========================================================================

  /**
   * Analyze drift for a Digital Twin
   */
  async analyzeDrift(
    twin: DigitalTwin,
    inputFeatures: Record<string, unknown>
  ): Promise<DriftAnalysis> {
    const driftingFeatures: DriftAnalysis['driftingFeatures'] = [];
    let totalDeviation = 0;

    // Get expected ranges from training metadata
    const trainingMetadata = twin.modelDefinition.trainingMetadata;
    if (!trainingMetadata) {
      return {
        driftDetected: false,
        driftScore: 0,
        driftingFeatures: [],
        recommendation: 'No training metadata available for drift analysis'
      };
    }

    // Check each feature
    for (const featureName of trainingMetadata.features) {
      const featureValue = inputFeatures[featureName];
      if (typeof featureValue !== 'number') continue;

      // Simulate expected ranges (in production, these would come from training data)
      const expectedMean = 100; // placeholder
      const expectedStd = 10; // placeholder
      const expectedRange: [number, number] = [
        expectedMean - 2 * expectedStd,
        expectedMean + 2 * expectedStd
      ];

      if (featureValue < expectedRange[0] || featureValue > expectedRange[1]) {
        const deviation = Math.abs(featureValue - expectedMean) / expectedStd;
        driftingFeatures.push({
          featureName,
          expectedRange,
          actualValue: featureValue,
          deviation
        });
        totalDeviation += deviation;
      }
    }

    const driftScore = trainingMetadata.features.length > 0
      ? totalDeviation / trainingMetadata.features.length
      : 0;

    const driftDetected = driftScore > twin.driftThreshold;

    let recommendation: string;
    if (driftDetected) {
      if (driftScore > 0.5) {
        recommendation = 'Critical drift detected. Model retraining required before use.';
      } else {
        recommendation = 'Moderate drift detected. Consider manual review of predictions.';
      }
    } else {
      recommendation = 'Model operating within expected parameters.';
    }

    return {
      driftDetected,
      driftScore,
      driftingFeatures,
      recommendation
    };
  }

  /**
   * Run drift check for all active twins
   */
  async runDriftCheckForActiveTwins(
    tenantId: string
  ): Promise<ServiceResult<Array<{ twinId: string; driftAnalysis: DriftAnalysis }>>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT dt.*, 
                (SELECT input_features 
                 FROM ${this.schema}.rtrt_predictions rp 
                 WHERE rp.digital_twin_id = dt.id 
                 ORDER BY rp.prediction_timestamp DESC 
                 LIMIT 1) as latest_features
         FROM ${this.schema}.digital_twins dt
         WHERE dt.tenant_id = $1 AND dt.operational_state = 'active'`,
        [tenantId]
      );

      const analyses: Array<{ twinId: string; driftAnalysis: DriftAnalysis }> = [];

      for (const row of result.rows) {
        const twin = this.mapDigitalTwin(row);
        const latestFeatures = row.latest_features || twin.currentState;

        if (Object.keys(latestFeatures).length > 0) {
          const driftAnalysis = await this.analyzeDrift(twin, latestFeatures);
          analyses.push({ twinId: twin.id, driftAnalysis });
        }
      }

      return {
        success: true,
        data: analyses,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'DRIFT_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // MODEL PERFORMANCE
  // ===========================================================================

  /**
   * Calculate model performance metrics
   */
  async calculateModelPerformance(
    twinId: string,
    options?: { startDate?: Date; endDate?: Date }
  ): Promise<ServiceResult<{
    totalPredictions: number;
    predictionsWithOutcome: number;
    accuracy: number;
    meanAbsoluteError: number;
    driftRate: number;
  }>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE digital_twin_id = $1';
      const params: unknown[] = [twinId];
      let paramIndex = 2;

      if (options?.startDate) {
        whereClause += ` AND prediction_timestamp >= $${paramIndex++}`;
        params.push(options.startDate);
      }

      if (options?.endDate) {
        whereClause += ` AND prediction_timestamp <= $${paramIndex++}`;
        params.push(options.endDate);
      }

      const result = await this.pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(actual_outcome) as with_outcome,
          AVG(CASE WHEN drift_detected THEN 1 ELSE 0 END) as drift_rate,
          predicted_cqa, actual_outcome, confidence_score
         FROM ${this.schema}.rtrt_predictions
         ${whereClause}
         GROUP BY digital_twin_id, predicted_cqa, actual_outcome, confidence_score`,
        params
      );

      // Calculate metrics
      let totalPredictions = 0;
      let predictionsWithOutcome = 0;
      let correctPredictions = 0;
      let totalError = 0;
      let driftCount = 0;

      for (const row of result.rows) {
        totalPredictions += parseInt(row.total, 10);
        predictionsWithOutcome += parseInt(row.with_outcome, 10);
        driftCount += parseFloat(row.drift_rate) * parseInt(row.total, 10);

        if (row.actual_outcome) {
          // Compare predictions to actuals (simplified)
          const predictions = row.predicted_cqa as CQAPrediction[];
          const actuals = row.actual_outcome as Record<string, number>;

          for (const pred of predictions) {
            const actual = actuals[pred.attributeName];
            if (actual !== undefined) {
              const error = Math.abs(pred.predictedValue - actual);
              totalError += error;
              if (pred.confidenceInterval.lower <= actual && actual <= pred.confidenceInterval.upper) {
                correctPredictions++;
              }
            }
          }
        }
      }

      return {
        success: true,
        data: {
          totalPredictions,
          predictionsWithOutcome,
          accuracy: predictionsWithOutcome > 0 ? correctPredictions / predictionsWithOutcome : 0,
          meanAbsoluteError: predictionsWithOutcome > 0 ? totalError / predictionsWithOutcome : 0,
          driftRate: totalPredictions > 0 ? driftCount / totalPredictions : 0
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PERFORMANCE_CALC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // SIMULATION HELPERS
  // ===========================================================================

  /**
   * Simulate CQA predictions (placeholder for actual ML model)
   */
  private simulateCQAPredictions(
    modelDef: DigitalTwinModel,
    inputFeatures: Record<string, unknown>,
    requestedCQAs?: string[]
  ): CQAPrediction[] {
    // In production, this would call the actual ML model
    // For now, generate synthetic predictions
    const defaultCQAs = ['Assay', 'Dissolution', 'Content Uniformity', 'Impurities'];
    const cqas = requestedCQAs || defaultCQAs;

    return cqas.map(cqa => {
      const baseValue = 98 + Math.random() * 4; // 98-102%
      const uncertainty = 1 + Math.random() * 2;

      return {
        attributeName: cqa,
        predictedValue: baseValue,
        confidenceInterval: {
          lower: baseValue - uncertainty,
          upper: baseValue + uncertainty
        },
        inSpecProbability: 0.90 + Math.random() * 0.09 // 90-99%
      };
    });
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapDigitalTwin = (row: Record<string, unknown>): DigitalTwin => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    twinType: row.twin_type as TwinType,
    physicalAssetId: row.physical_asset_id as string | undefined,
    twinName: row.twin_name as string,
    modelDefinition: row.model_definition as DigitalTwinModel,
    currentState: row.current_state as Record<string, unknown>,
    operationalState: row.operational_state as TwinOperationalState,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at as string) : undefined,
    predictionHorizonHours: row.prediction_horizon_hours as number,
    driftThreshold: parseFloat(row.drift_threshold as string),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapRTRTPrediction = (row: Record<string, unknown>): RTRTPrediction => ({
    id: row.id as string,
    digitalTwinId: row.digital_twin_id as string,
    batchId: row.batch_id as string,
    predictionTimestamp: new Date(row.prediction_timestamp as string),
    predictedCqa: row.predicted_cqa as CQAPrediction[],
    confidenceScore: parseFloat(row.confidence_score as string),
    modelVersion: row.model_version as string,
    inputFeatures: row.input_features as Record<string, unknown>,
    releaseDecision: row.release_decision as ReleaseDecision,
    actualOutcome: row.actual_outcome as Record<string, unknown> | undefined,
    driftDetected: row.drift_detected as boolean,
    createdAt: new Date(row.created_at as string)
  });
}
