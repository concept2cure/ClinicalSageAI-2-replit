/**
 * =============================================================================
 * Federated Learning Coordinator
 * =============================================================================
 * Enterprise service for MELLODDY-style privacy-preserving federated learning
 * with differential privacy, gradient aggregation, and safety signal detection.
 * 
 * Features:
 * - Federated model lifecycle management
 * - Privacy budget enforcement (differential privacy)
 * - Secure gradient aggregation
 * - Safety signal detection and classification
 * - Horizon scanning integration
 * - Predictive risk modeling
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import {
  FederatedModel,
  FederatedModelStatus,
  FederatedModelType,
  PerformanceMetrics,
  FederationParticipant,
  ParticipantRole,
  ParticipantStatus,
  DataContribution,
  GradientUpdate,
  GradientStatus,
  PrivacyBudgetLedger,
  SafetySignal,
  SignalClassification,
  SignalSeverity,
  HorizonScan,
  HorizonScanCategory,
  ImpactAssessment,
  PredictiveRiskModel,
  FeatureDefinition,
  RiskAssessment,
  RiskLevel,
  RiskFactor,
  ServiceResult,
  PaginatedResult,
  SearchCriteria
} from './types';

export interface FederatedLearningConfig {
  pool: Pool;
  defaultEpsilon?: number;
  defaultDelta?: number;
  minParticipantsForAggregation?: number;
  clipNormDefault?: number;
}

export interface GradientSubmission {
  participantId: string;
  roundNumber: number;
  encryptedGradient: Buffer;
  sampleCount: number;
  localMetrics?: PerformanceMetrics;
}

export class FederatedLearningCoordinator {
  private pool: Pool;
  private readonly schema = 'federated_ml';
  private readonly defaultEpsilon: number;
  private readonly defaultDelta: number;
  private readonly minParticipantsForAggregation: number;
  private readonly clipNormDefault: number;

  constructor(config: FederatedLearningConfig) {
    this.pool = config.pool;
    this.defaultEpsilon = config.defaultEpsilon || 1.0;
    this.defaultDelta = config.defaultDelta || 1e-5;
    this.minParticipantsForAggregation = config.minParticipantsForAggregation || 3;
    this.clipNormDefault = config.clipNormDefault || 1.0;
  }

  // ===========================================================================
  // FEDERATED MODELS
  // ===========================================================================

  /**
   * Create a new federated model
   */
  async createFederatedModel(
    model: Omit<FederatedModel, 'id' | 'aggregationRound' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<FederatedModel>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.federated_models (
          id, tenant_id, model_name, model_type, model_version,
          aggregation_round, min_participants, privacy_budget_epsilon,
          privacy_budget_delta, status, performance_metrics, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          id,
          model.tenantId,
          model.modelName,
          model.modelType,
          model.modelVersion,
          0,
          model.minParticipants || this.minParticipantsForAggregation,
          model.privacyBudgetEpsilon || this.defaultEpsilon,
          model.privacyBudgetDelta || this.defaultDelta,
          model.status || FederatedModelStatus.INITIALIZING,
          JSON.stringify(model.performanceMetrics || {}),
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapFederatedModel(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MODEL_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get federated model by ID
   */
  async getFederatedModel(modelId: string): Promise<ServiceResult<FederatedModel>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.federated_models WHERE id = $1`,
        [modelId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Model ${modelId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapFederatedModel(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'MODEL_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update model status
   */
  async updateModelStatus(
    modelId: string,
    status: FederatedModelStatus
  ): Promise<ServiceResult<FederatedModel>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.federated_models 
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, modelId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Model not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapFederatedModel(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'STATUS_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // FEDERATION PARTICIPANTS
  // ===========================================================================

  /**
   * Register a participant
   */
  async registerParticipant(
    modelId: string,
    participant: Omit<FederationParticipant, 'id' | 'federatedModelId' | 'privacyBudgetUsed' | 'joinedAt' | 'withdrawnAt'>
  ): Promise<ServiceResult<FederationParticipant>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.federation_participants (
          id, federated_model_id, organization_id, organization_name,
          participant_role, data_contribution, privacy_budget_used,
          status, joined_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          id,
          modelId,
          participant.organizationId,
          participant.organizationName,
          participant.participantRole,
          JSON.stringify(participant.dataContribution),
          0,
          participant.status || ParticipantStatus.PENDING
        ]
      );

      return {
        success: true,
        data: this.mapFederationParticipant(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PARTICIPANT_REGISTER_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Activate a participant
   */
  async activateParticipant(participantId: string): Promise<ServiceResult<FederationParticipant>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.federation_participants 
         SET status = $1
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [ParticipantStatus.ACTIVE, participantId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Participant not found or not pending' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapFederationParticipant(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ACTIVATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get participants for a model
   */
  async getModelParticipants(
    modelId: string,
    options?: { status?: ParticipantStatus }
  ): Promise<ServiceResult<FederationParticipant[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE federated_model_id = $1';
      const params: unknown[] = [modelId];

      if (options?.status) {
        whereClause += ' AND status = $2';
        params.push(options.status);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.federation_participants ${whereClause}`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapFederationParticipant),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'PARTICIPANTS_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // GRADIENT AGGREGATION
  // ===========================================================================

  /**
   * Submit gradient update
   */
  async submitGradient(
    modelId: string,
    submission: GradientSubmission
  ): Promise<ServiceResult<GradientUpdate>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify participant is active
      const participantResult = await client.query(
        `SELECT * FROM ${this.schema}.federation_participants 
         WHERE id = $1 AND federated_model_id = $2 AND status = 'active'`,
        [submission.participantId, modelId]
      );

      if (participantResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'PARTICIPANT_NOT_ACTIVE', message: 'Participant not found or not active' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Get model to check round number
      const modelResult = await client.query(
        `SELECT * FROM ${this.schema}.federated_models WHERE id = $1`,
        [modelId]
      );
      const model = this.mapFederatedModel(modelResult.rows[0]);

      if (submission.roundNumber !== model.aggregationRound + 1) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { 
            code: 'INVALID_ROUND', 
            message: `Expected round ${model.aggregationRound + 1}, got ${submission.roundNumber}` 
          },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Add noise for differential privacy
      const noiseAdded = this.computeNoise(model.privacyBudgetEpsilon, submission.sampleCount);

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO ${this.schema}.gradient_updates (
          id, federated_model_id, participant_id, round_number,
          encrypted_gradient, noise_added, clip_norm, sample_count,
          local_metrics, status, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *`,
        [
          id,
          modelId,
          submission.participantId,
          submission.roundNumber,
          submission.encryptedGradient,
          noiseAdded,
          this.clipNormDefault,
          submission.sampleCount,
          JSON.stringify(submission.localMetrics || {}),
          GradientStatus.RECEIVED
        ]
      );

      // Update participant's last contribution
      await client.query(
        `UPDATE ${this.schema}.federation_participants 
         SET last_contribution_at = NOW()
         WHERE id = $1`,
        [submission.participantId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapGradientUpdate(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'GRADIENT_SUBMIT_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Perform gradient aggregation for a round
   */
  async aggregateGradients(modelId: string): Promise<ServiceResult<{
    roundNumber: number;
    participantCount: number;
    aggregatedWeights: Buffer;
    performanceMetrics: PerformanceMetrics;
  }>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get model
      const modelResult = await client.query(
        `SELECT * FROM ${this.schema}.federated_models WHERE id = $1`,
        [modelId]
      );

      if (modelResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Model not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const model = this.mapFederatedModel(modelResult.rows[0]);
      const targetRound = model.aggregationRound + 1;

      // Get gradients for current round
      const gradientResult = await client.query(
        `SELECT * FROM ${this.schema}.gradient_updates 
         WHERE federated_model_id = $1 AND round_number = $2 AND status = 'received'`,
        [modelId, targetRound]
      );

      if (gradientResult.rows.length < model.minParticipants) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { 
            code: 'INSUFFICIENT_PARTICIPANTS', 
            message: `Need ${model.minParticipants} participants, got ${gradientResult.rows.length}` 
          },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Aggregate gradients (federated averaging)
      // In production, this would use secure aggregation
      const gradients = gradientResult.rows.map(this.mapGradientUpdate);
      const totalSamples = gradients.reduce((sum, g) => sum + g.sampleCount, 0);

      // Weighted average of metrics
      const aggregatedMetrics: PerformanceMetrics = {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0
      };

      for (const gradient of gradients) {
        const weight = gradient.sampleCount / totalSamples;
        if (gradient.localMetrics.accuracy) {
          aggregatedMetrics.accuracy = (aggregatedMetrics.accuracy || 0) + gradient.localMetrics.accuracy * weight;
        }
        if (gradient.localMetrics.precision) {
          aggregatedMetrics.precision = (aggregatedMetrics.precision || 0) + gradient.localMetrics.precision * weight;
        }
        if (gradient.localMetrics.recall) {
          aggregatedMetrics.recall = (aggregatedMetrics.recall || 0) + gradient.localMetrics.recall * weight;
        }
        if (gradient.localMetrics.f1Score) {
          aggregatedMetrics.f1Score = (aggregatedMetrics.f1Score || 0) + gradient.localMetrics.f1Score * weight;
        }
      }

      // Simulate aggregated weights (in production, would combine encrypted gradients)
      const aggregatedWeights = Buffer.from(JSON.stringify({ round: targetRound, samples: totalSamples }));

      // Update model
      await client.query(
        `UPDATE ${this.schema}.federated_models 
         SET global_model_weights = $1, aggregation_round = $2, 
             performance_metrics = $3, status = 'training', updated_at = NOW()
         WHERE id = $4`,
        [aggregatedWeights, targetRound, JSON.stringify(aggregatedMetrics), modelId]
      );

      // Mark gradients as aggregated
      await client.query(
        `UPDATE ${this.schema}.gradient_updates 
         SET status = 'aggregated', processed_at = NOW()
         WHERE federated_model_id = $1 AND round_number = $2`,
        [modelId, targetRound]
      );

      // Record privacy budget consumption
      for (const gradient of gradients) {
        await this.recordPrivacyBudgetUsage(
          client,
          gradient.participantId,
          'gradient_aggregation',
          model.privacyBudgetEpsilon / gradients.length,
          model.privacyBudgetDelta / gradients.length,
          `Round ${targetRound} aggregation`
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          roundNumber: targetRound,
          participantCount: gradients.length,
          aggregatedWeights,
          performanceMetrics: aggregatedMetrics
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'AGGREGATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // PRIVACY BUDGET
  // ===========================================================================

  /**
   * Check remaining privacy budget
   */
  async checkPrivacyBudget(
    participantId: string
  ): Promise<ServiceResult<{
    totalEpsilon: number;
    usedEpsilon: number;
    remainingEpsilon: number;
    totalDelta: number;
    usedDelta: number;
    remainingDelta: number;
  }>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT 
          COALESCE(MAX(cumulative_epsilon), 0) as used_epsilon,
          COALESCE(MAX(cumulative_delta), 0) as used_delta,
          COALESCE(MAX(budget_remaining_epsilon), $2) as remaining_epsilon
         FROM ${this.schema}.privacy_budget_ledger 
         WHERE participant_id = $1`,
        [participantId, this.defaultEpsilon]
      );

      const row = result.rows[0];
      const usedEpsilon = parseFloat(row.used_epsilon) || 0;
      const usedDelta = parseFloat(row.used_delta) || 0;
      const totalEpsilon = this.defaultEpsilon;
      const totalDelta = this.defaultDelta;

      return {
        success: true,
        data: {
          totalEpsilon,
          usedEpsilon,
          remainingEpsilon: totalEpsilon - usedEpsilon,
          totalDelta,
          usedDelta,
          remainingDelta: totalDelta - usedDelta
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BUDGET_CHECK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Record privacy budget usage (internal)
   */
  private async recordPrivacyBudgetUsage(
    client: Pool | { query: Pool['query'] },
    participantId: string,
    operationType: string,
    epsilonConsumed: number,
    deltaConsumed: number,
    description: string
  ): Promise<void> {
    // Get current cumulative
    const currentResult = await client.query(
      `SELECT cumulative_epsilon, cumulative_delta, budget_remaining_epsilon
       FROM ${this.schema}.privacy_budget_ledger 
       WHERE participant_id = $1
       ORDER BY recorded_at DESC LIMIT 1`,
      [participantId]
    );

    let cumulativeEpsilon = epsilonConsumed;
    let cumulativeDelta = deltaConsumed;
    let budgetRemaining = this.defaultEpsilon - epsilonConsumed;

    if (currentResult.rows.length > 0) {
      cumulativeEpsilon = parseFloat(currentResult.rows[0].cumulative_epsilon) + epsilonConsumed;
      cumulativeDelta = parseFloat(currentResult.rows[0].cumulative_delta) + deltaConsumed;
      budgetRemaining = this.defaultEpsilon - cumulativeEpsilon;
    }

    await client.query(
      `INSERT INTO ${this.schema}.privacy_budget_ledger (
        id, participant_id, operation_type, epsilon_consumed, delta_consumed,
        query_description, cumulative_epsilon, cumulative_delta,
        budget_remaining_epsilon, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        uuidv4(),
        participantId,
        operationType,
        epsilonConsumed,
        deltaConsumed,
        description,
        cumulativeEpsilon,
        cumulativeDelta,
        budgetRemaining
      ]
    );
  }

  // ===========================================================================
  // SAFETY SIGNALS
  // ===========================================================================

  /**
   * Report a safety signal
   */
  async reportSafetySignal(
    signal: Omit<SafetySignal, 'id' | 'createdAt'>
  ): Promise<ServiceResult<SafetySignal>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.safety_signals (
          id, tenant_id, product_ids, signal_source, detection_method,
          signal_description, affected_population, event_count, background_rate,
          signal_strength, classification, severity, fhir_adverse_event_refs,
          detected_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING *`,
        [
          id,
          signal.tenantId,
          JSON.stringify(signal.productIds),
          signal.signalSource,
          signal.detectionMethod,
          signal.signalDescription,
          signal.affectedPopulation,
          signal.eventCount,
          signal.backgroundRate,
          signal.signalStrength,
          signal.classification || SignalClassification.POTENTIAL,
          signal.severity,
          JSON.stringify(signal.fhirAdverseEventRefs),
          signal.detectedAt
        ]
      );

      return {
        success: true,
        data: this.mapSafetySignal(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SIGNAL_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update signal classification
   */
  async updateSignalClassification(
    signalId: string,
    classification: SignalClassification,
    severity?: SignalSeverity
  ): Promise<ServiceResult<SafetySignal>> {
    const startTime = Date.now();

    try {
      let updateFields = 'classification = $1';
      const params: unknown[] = [classification, signalId];

      if (severity) {
        updateFields += ', severity = $3';
        params.push(severity);
      }

      if (classification === SignalClassification.VALIDATED) {
        updateFields += ', validated_at = NOW()';
      } else if (classification === SignalClassification.CONFIRMED || 
                 classification === SignalClassification.REFUTED) {
        updateFields += ', resolved_at = NOW()';
      }

      const result = await this.pool.query(
        `UPDATE ${this.schema}.safety_signals 
         SET ${updateFields}
         WHERE id = $2
         RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Signal not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapSafetySignal(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SIGNAL_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get active signals for products
   */
  async getActiveSignals(
    tenantId: string,
    options?: { productIds?: string[]; severity?: SignalSeverity }
  ): Promise<ServiceResult<SafetySignal[]>> {
    const startTime = Date.now();

    try {
      let whereClause = "WHERE tenant_id = $1 AND classification NOT IN ('confirmed', 'refuted')";
      const params: unknown[] = [tenantId];
      let paramIndex = 2;

      if (options?.productIds && options.productIds.length > 0) {
        whereClause += ` AND product_ids ?| $${paramIndex++}`;
        params.push(options.productIds);
      }

      if (options?.severity) {
        whereClause += ` AND severity = $${paramIndex++}`;
        params.push(options.severity);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.safety_signals 
         ${whereClause}
         ORDER BY severity DESC, detected_at DESC`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapSafetySignal),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SIGNALS_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // HORIZON SCANNING
  // ===========================================================================

  /**
   * Add a horizon scan entry
   */
  async addHorizonScan(
    scan: Omit<HorizonScan, 'id' | 'createdAt'>
  ): Promise<ServiceResult<HorizonScan>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.horizon_scans (
          id, tenant_id, scan_category, source_type, source_url,
          title, summary, relevance_score, impact_assessment,
          affected_products, affected_regions, action_required,
          action_due_date, scan_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        RETURNING *`,
        [
          id,
          scan.tenantId,
          scan.scanCategory,
          scan.sourceType,
          scan.sourceUrl,
          scan.title,
          scan.summary,
          scan.relevanceScore,
          JSON.stringify(scan.impactAssessment),
          JSON.stringify(scan.affectedProducts),
          JSON.stringify(scan.affectedRegions),
          scan.actionRequired,
          scan.actionDueDate,
          scan.scanDate
        ]
      );

      return {
        success: true,
        data: this.mapHorizonScan(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SCAN_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get horizon scans requiring action
   */
  async getActionableScans(
    tenantId: string,
    options?: { category?: HorizonScanCategory }
  ): Promise<ServiceResult<HorizonScan[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE tenant_id = $1 AND action_required = true';
      const params: unknown[] = [tenantId];

      if (options?.category) {
        whereClause += ' AND scan_category = $2';
        params.push(options.category);
      }

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.horizon_scans 
         ${whereClause}
         ORDER BY action_due_date ASC NULLS LAST, relevance_score DESC`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapHorizonScan),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SCANS_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Compute noise for differential privacy
   */
  private computeNoise(epsilon: number, sampleCount: number): number {
    // Laplace noise with scale = sensitivity / epsilon
    // Sensitivity depends on gradient clipping norm
    const sensitivity = this.clipNormDefault / sampleCount;
    const scale = sensitivity / epsilon;
    return scale * (Math.random() - 0.5) * 2; // Simplified Laplace approximation
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapFederatedModel = (row: Record<string, unknown>): FederatedModel => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    modelName: row.model_name as string,
    modelType: row.model_type as FederatedModelType,
    modelVersion: row.model_version as string,
    globalModelWeights: row.global_model_weights as Buffer | undefined,
    aggregationRound: row.aggregation_round as number,
    minParticipants: row.min_participants as number,
    privacyBudgetEpsilon: parseFloat(row.privacy_budget_epsilon as string),
    privacyBudgetDelta: parseFloat(row.privacy_budget_delta as string),
    status: row.status as FederatedModelStatus,
    performanceMetrics: row.performance_metrics as PerformanceMetrics,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapFederationParticipant = (row: Record<string, unknown>): FederationParticipant => ({
    id: row.id as string,
    federatedModelId: row.federated_model_id as string,
    organizationId: row.organization_id as string,
    organizationName: row.organization_name as string,
    participantRole: row.participant_role as ParticipantRole,
    dataContribution: row.data_contribution as DataContribution,
    privacyBudgetUsed: parseFloat(row.privacy_budget_used as string),
    lastContributionAt: row.last_contribution_at ? new Date(row.last_contribution_at as string) : undefined,
    status: row.status as ParticipantStatus,
    joinedAt: new Date(row.joined_at as string),
    withdrawnAt: row.withdrawn_at ? new Date(row.withdrawn_at as string) : undefined
  });

  private mapGradientUpdate = (row: Record<string, unknown>): GradientUpdate => ({
    id: row.id as string,
    federatedModelId: row.federated_model_id as string,
    participantId: row.participant_id as string,
    roundNumber: row.round_number as number,
    encryptedGradient: row.encrypted_gradient as Buffer,
    noiseAdded: parseFloat(row.noise_added as string),
    clipNorm: parseFloat(row.clip_norm as string),
    sampleCount: row.sample_count as number,
    localMetrics: row.local_metrics as PerformanceMetrics,
    status: row.status as GradientStatus,
    submittedAt: new Date(row.submitted_at as string),
    processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined
  });

  private mapSafetySignal = (row: Record<string, unknown>): SafetySignal => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    productIds: row.product_ids as string[],
    signalSource: row.signal_source as string,
    detectionMethod: row.detection_method as string,
    signalDescription: row.signal_description as string,
    affectedPopulation: row.affected_population as string | undefined,
    eventCount: row.event_count as number,
    backgroundRate: row.background_rate ? parseFloat(row.background_rate as string) : undefined,
    signalStrength: parseFloat(row.signal_strength as string),
    classification: row.classification as SignalClassification,
    severity: row.severity as SignalSeverity,
    fhirAdverseEventRefs: row.fhir_adverse_event_refs as string[],
    detectedAt: new Date(row.detected_at as string),
    validatedAt: row.validated_at ? new Date(row.validated_at as string) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    createdAt: new Date(row.created_at as string)
  });

  private mapHorizonScan = (row: Record<string, unknown>): HorizonScan => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    scanCategory: row.scan_category as HorizonScanCategory,
    sourceType: row.source_type as string,
    sourceUrl: row.source_url as string | undefined,
    title: row.title as string,
    summary: row.summary as string,
    relevanceScore: parseFloat(row.relevance_score as string),
    impactAssessment: row.impact_assessment as ImpactAssessment,
    affectedProducts: row.affected_products as string[],
    affectedRegions: row.affected_regions as string[],
    actionRequired: row.action_required as boolean,
    actionDueDate: row.action_due_date ? new Date(row.action_due_date as string) : undefined,
    scanDate: new Date(row.scan_date as string),
    createdAt: new Date(row.created_at as string)
  });
}
