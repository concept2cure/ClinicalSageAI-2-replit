/**
 * =============================================================================
 * Agent Runtime Service
 * =============================================================================
 * Enterprise service for LangGraph-compatible agent orchestration.
 * Manages agent definitions, threads, checkpoints, and HITL breakpoints.
 * 
 * Implements:
 * - Agent lifecycle management
 * - Thread creation and branching
 * - Checkpoint persistence (LangGraph compatible)
 * - HITL breakpoint enforcement
 * - Reasoning trace capture
 * - Governance constraint validation
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentDefinition,
  AgentType,
  AgentStatus,
  AgentThread,
  ThreadStatus,
  Checkpoint,
  CheckpointMetadata,
  CheckpointWrite,
  ThreadBranch,
  ReasoningTrace,
  ReasoningType,
  GovernanceConstraint,
  ConstraintType,
  HITLBreakpoint,
  BreakpointType,
  AdversarialReview,
  ReviewOutcome,
  ServiceResult,
  PaginatedResult,
  SearchCriteria
} from './types';

export interface AgentRuntimeConfig {
  pool: Pool;
  defaultModelProvider?: string;
  defaultModel?: string;
  maxCheckpointsPerThread?: number;
  enableReasoningCapture?: boolean;
}

export class AgentRuntimeService {
  private pool: Pool;
  private config: Required<AgentRuntimeConfig>;
  private readonly schema = 'agent_runtime';

  constructor(config: AgentRuntimeConfig) {
    this.pool = config.pool;
    this.config = {
      pool: config.pool,
      defaultModelProvider: config.defaultModelProvider || 'anthropic',
      defaultModel: config.defaultModel || 'claude-sonnet-4-20250514',
      maxCheckpointsPerThread: config.maxCheckpointsPerThread || 1000,
      enableReasoningCapture: config.enableReasoningCapture ?? true
    };
  }

  // ===========================================================================
  // AGENT DEFINITIONS
  // ===========================================================================

  /**
   * Create a new agent definition
   */
  async createAgentDefinition(
    definition: Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ServiceResult<AgentDefinition>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      const id = uuidv4();
      const now = new Date();

      const result = await client.query(
        `INSERT INTO ${this.schema}.agent_definitions (
          id, agent_type, display_name, description, version,
          system_prompt, capabilities, model_config, governance_rules, status,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          id,
          definition.agentType,
          definition.displayName,
          definition.description,
          definition.version,
          definition.systemPrompt,
          JSON.stringify(definition.capabilities),
          JSON.stringify(definition.modelConfig),
          JSON.stringify(definition.governanceRules),
          definition.status || AgentStatus.DRAFT,
          now,
          now
        ]
      );

      return {
        success: true,
        data: this.mapAgentDefinition(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AGENT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: { error }
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get agent definition by ID
   */
  async getAgentDefinition(id: string): Promise<ServiceResult<AgentDefinition>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.agent_definitions WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Agent definition ${id} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapAgentDefinition(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'AGENT_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * List agent definitions with filtering
   */
  async listAgentDefinitions(
    criteria?: SearchCriteria & { agentType?: AgentType; status?: AgentStatus }
  ): Promise<ServiceResult<PaginatedResult<AgentDefinition>>> {
    const startTime = Date.now();
    const page = criteria?.page || 1;
    const pageSize = criteria?.pageSize || 20;
    const offset = (page - 1) * pageSize;

    try {
      let whereClause = 'WHERE 1=1';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (criteria?.agentType) {
        whereClause += ` AND agent_type = $${paramIndex++}`;
        params.push(criteria.agentType);
      }

      if (criteria?.status) {
        whereClause += ` AND status = $${paramIndex++}`;
        params.push(criteria.status);
      }

      const countResult = await this.pool.query(
        `SELECT COUNT(*) FROM ${this.schema}.agent_definitions ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count, 10);

      params.push(pageSize, offset);
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.agent_definitions 
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: {
          items: result.rows.map(this.mapAgentDefinition),
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
          code: 'AGENT_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // AGENT THREADS
  // ===========================================================================

  /**
   * Create a new agent thread
   */
  async createThread(
    agentDefinitionId: string,
    tenantId: string,
    createdBy: string,
    options?: {
      productId?: string;
      parentThreadId?: string;
      contextData?: Record<string, unknown>;
      hitlRequired?: boolean;
    }
  ): Promise<ServiceResult<AgentThread>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      // Validate agent definition exists and is active
      const agentResult = await client.query(
        `SELECT id, status FROM ${this.schema}.agent_definitions WHERE id = $1`,
        [agentDefinitionId]
      );

      if (agentResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'AGENT_NOT_FOUND', message: 'Agent definition not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      if (agentResult.rows[0].status !== AgentStatus.ACTIVE) {
        return {
          success: false,
          error: { code: 'AGENT_NOT_ACTIVE', message: 'Agent definition is not active' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const id = uuidv4();
      const now = new Date();

      const result = await client.query(
        `INSERT INTO ${this.schema}.agent_threads (
          id, agent_definition_id, product_id, tenant_id, parent_thread_id,
          context_data, status, hitl_required, created_at, updated_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          id,
          agentDefinitionId,
          options?.productId,
          tenantId,
          options?.parentThreadId,
          JSON.stringify(options?.contextData || {}),
          ThreadStatus.ACTIVE,
          options?.hitlRequired ?? false,
          now,
          now,
          createdBy
        ]
      );

      return {
        success: true,
        data: this.mapAgentThread(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'THREAD_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get thread by ID with optional checkpoint history
   */
  async getThread(
    threadId: string,
    options?: { includeCheckpoints?: boolean; checkpointLimit?: number }
  ): Promise<ServiceResult<AgentThread & { checkpoints?: Checkpoint[] }>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.agent_threads WHERE id = $1`,
        [threadId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Thread ${threadId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const thread = this.mapAgentThread(result.rows[0]);
      let checkpoints: Checkpoint[] | undefined;

      if (options?.includeCheckpoints) {
        const checkpointResult = await this.pool.query(
          `SELECT * FROM ${this.schema}.checkpoints 
           WHERE thread_id = $1 
           ORDER BY created_at DESC 
           LIMIT $2`,
          [threadId, options.checkpointLimit || 50]
        );
        checkpoints = checkpointResult.rows.map(this.mapCheckpoint);
      }

      return {
        success: true,
        data: { ...thread, checkpoints },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'THREAD_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Update thread status
   */
  async updateThreadStatus(
    threadId: string,
    status: ThreadStatus
  ): Promise<ServiceResult<AgentThread>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `UPDATE ${this.schema}.agent_threads 
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, threadId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Thread ${threadId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapAgentThread(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'THREAD_UPDATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Create a branch from an existing thread
   */
  async createThreadBranch(
    sourceThreadId: string,
    branchName: string,
    createdBy: string,
    options?: {
      branchPoint?: string;
      hypothesis?: string;
    }
  ): Promise<ServiceResult<ThreadBranch>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the source thread
      const threadResult = await client.query(
        `SELECT * FROM ${this.schema}.agent_threads WHERE id = $1`,
        [sourceThreadId]
      );

      if (threadResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Source thread not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Determine branch point (latest checkpoint if not specified)
      let branchPoint = options?.branchPoint;
      if (!branchPoint) {
        const checkpointResult = await client.query(
          `SELECT id FROM ${this.schema}.checkpoints 
           WHERE thread_id = $1 
           ORDER BY created_at DESC 
           LIMIT 1`,
          [sourceThreadId]
        );
        branchPoint = checkpointResult.rows[0]?.id || sourceThreadId;
      }

      // Create the branch record
      const branchId = uuidv4();
      const branchResult = await client.query(
        `INSERT INTO ${this.schema}.thread_branches (
          id, source_thread_id, branch_name, branch_point, hypothesis, status, created_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, 'active', NOW(), $6)
        RETURNING *`,
        [branchId, sourceThreadId, branchName, branchPoint, options?.hypothesis, createdBy]
      );

      // Create a new thread as the branch target
      const newThreadId = uuidv4();
      await client.query(
        `INSERT INTO ${this.schema}.agent_threads (
          id, agent_definition_id, product_id, tenant_id, parent_thread_id,
          context_data, status, hitl_required, created_at, updated_at, created_by
        ) SELECT $1, agent_definition_id, product_id, tenant_id, $2,
                 context_data, 'active', hitl_required, NOW(), NOW(), $3
        FROM ${this.schema}.agent_threads WHERE id = $2`,
        [newThreadId, sourceThreadId, createdBy]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapThreadBranch(branchResult.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'BRANCH_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // CHECKPOINTS (LangGraph Compatible)
  // ===========================================================================

  /**
   * Save a checkpoint (LangGraph saver interface)
   */
  async saveCheckpoint(
    threadId: string,
    channel: string,
    checkpointType: string,
    checkpointData: Record<string, unknown>,
    metadata: CheckpointMetadata,
    parentCheckpointId?: string
  ): Promise<ServiceResult<Checkpoint>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      // Validate thread exists
      const threadResult = await client.query(
        `SELECT id, status FROM ${this.schema}.agent_threads WHERE id = $1`,
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'THREAD_NOT_FOUND', message: 'Thread not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const id = uuidv4();

      const result = await client.query(
        `INSERT INTO ${this.schema}.checkpoints (
          id, thread_id, parent_checkpoint_id, channel, checkpoint_type,
          checkpoint_data, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *`,
        [
          id,
          threadId,
          parentCheckpointId,
          channel,
          checkpointType,
          JSON.stringify(checkpointData),
          JSON.stringify(metadata)
        ]
      );

      // Update thread's current checkpoint
      await client.query(
        `UPDATE ${this.schema}.agent_threads 
         SET current_checkpoint_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [id, threadId]
      );

      return {
        success: true,
        data: this.mapCheckpoint(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECKPOINT_SAVE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<ServiceResult<Checkpoint>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.checkpoints WHERE id = $1`,
        [checkpointId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: `Checkpoint ${checkpointId} not found` },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      return {
        success: true,
        data: this.mapCheckpoint(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECKPOINT_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get latest checkpoint for a thread
   */
  async getLatestCheckpoint(threadId: string): Promise<ServiceResult<Checkpoint | null>> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.checkpoints 
         WHERE thread_id = $1 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [threadId]
      );

      return {
        success: true,
        data: result.rows.length > 0 ? this.mapCheckpoint(result.rows[0]) : null,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECKPOINT_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * List checkpoints for a thread with pagination
   */
  async listCheckpoints(
    threadId: string,
    options?: { limit?: number; before?: string; after?: string }
  ): Promise<ServiceResult<Checkpoint[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE thread_id = $1';
      const params: unknown[] = [threadId];
      let paramIndex = 2;

      if (options?.before) {
        whereClause += ` AND created_at < (SELECT created_at FROM ${this.schema}.checkpoints WHERE id = $${paramIndex++})`;
        params.push(options.before);
      }

      if (options?.after) {
        whereClause += ` AND created_at > (SELECT created_at FROM ${this.schema}.checkpoints WHERE id = $${paramIndex++})`;
        params.push(options.after);
      }

      params.push(options?.limit || 50);

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.checkpoints 
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapCheckpoint),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECKPOINT_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Write checkpoint data (for async writes)
   */
  async writeCheckpointData(
    checkpointId: string,
    taskId: string,
    channel: string,
    writeType: string,
    blob: Buffer
  ): Promise<ServiceResult<CheckpointWrite>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.checkpoint_writes (
          id, checkpoint_id, task_id, channel, write_type, blob, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        RETURNING *`,
        [id, checkpointId, taskId, channel, writeType, blob]
      );

      return {
        success: true,
        data: this.mapCheckpointWrite(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECKPOINT_WRITE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // REASONING TRACES
  // ===========================================================================

  /**
   * Record a reasoning trace
   */
  async recordReasoningTrace(
    threadId: string,
    checkpointId: string,
    trace: Omit<ReasoningTrace, 'id' | 'threadId' | 'checkpointId' | 'createdAt'>
  ): Promise<ServiceResult<ReasoningTrace>> {
    if (!this.config.enableReasoningCapture) {
      return {
        success: true,
        data: { id: '', threadId, checkpointId, ...trace, createdAt: new Date() },
        metadata: { executionTimeMs: 0, warnings: ['Reasoning capture disabled'] }
      };
    }

    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.reasoning_traces (
          id, thread_id, checkpoint_id, step_number, reasoning_type,
          input_summary, thought_process, output_summary, confidence_score,
          referenced_sources, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        RETURNING *`,
        [
          id,
          threadId,
          checkpointId,
          trace.stepNumber,
          trace.reasoningType,
          trace.inputSummary,
          trace.thoughtProcess,
          trace.outputSummary,
          trace.confidenceScore,
          JSON.stringify(trace.referencedSources)
        ]
      );

      return {
        success: true,
        data: this.mapReasoningTrace(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REASONING_TRACE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Get reasoning traces for a thread
   */
  async getReasoningTraces(
    threadId: string,
    options?: { checkpointId?: string; limit?: number }
  ): Promise<ServiceResult<ReasoningTrace[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE thread_id = $1';
      const params: unknown[] = [threadId];
      let paramIndex = 2;

      if (options?.checkpointId) {
        whereClause += ` AND checkpoint_id = $${paramIndex++}`;
        params.push(options.checkpointId);
      }

      params.push(options?.limit || 100);

      const result = await this.pool.query(
        `SELECT * FROM ${this.schema}.reasoning_traces 
         ${whereClause}
         ORDER BY step_number ASC
         LIMIT $${paramIndex}`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapReasoningTrace),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REASONING_TRACE_GET_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // GOVERNANCE CONSTRAINTS
  // ===========================================================================

  /**
   * Create a governance constraint
   */
  async createGovernanceConstraint(
    constraint: Omit<GovernanceConstraint, 'id' | 'createdAt'>
  ): Promise<ServiceResult<GovernanceConstraint>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.governance_constraints (
          id, constraint_type, scope, scope_id, constraint_definition,
          effective_from, effective_until, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          id,
          constraint.constraintType,
          constraint.scope,
          constraint.scopeId,
          JSON.stringify(constraint.constraintDefinition),
          constraint.effectiveFrom,
          constraint.effectiveUntil,
          constraint.createdBy
        ]
      );

      return {
        success: true,
        data: this.mapGovernanceConstraint(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONSTRAINT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Validate thread against governance constraints
   */
  async validateGovernanceConstraints(
    threadId: string,
    action: string
  ): Promise<ServiceResult<{ allowed: boolean; violations: string[] }>> {
    const startTime = Date.now();

    try {
      // Get thread with agent definition
      const threadResult = await this.pool.query(
        `SELECT t.*, a.governance_rules
         FROM ${this.schema}.agent_threads t
         JOIN ${this.schema}.agent_definitions a ON t.agent_definition_id = a.id
         WHERE t.id = $1`,
        [threadId]
      );

      if (threadResult.rows.length === 0) {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Thread not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const thread = threadResult.rows[0];
      const violations: string[] = [];

      // Get applicable constraints
      const constraintsResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.governance_constraints
         WHERE (scope = 'global' OR (scope = 'tenant' AND scope_id = $1)
                OR (scope = 'agent' AND scope_id = $2))
           AND effective_from <= NOW()
           AND (effective_until IS NULL OR effective_until > NOW())`,
        [thread.tenant_id, thread.agent_definition_id]
      );

      for (const constraint of constraintsResult.rows) {
        const definition = constraint.constraint_definition;

        // Check constraint type
        switch (constraint.constraint_type) {
          case ConstraintType.APPROVAL_REQUIRED:
            if (definition.actions?.includes(action) && !thread.hitl_required) {
              violations.push(`Action "${action}" requires HITL approval`);
            }
            break;

          case ConstraintType.READ_ONLY:
            if (definition.writeActions?.includes(action)) {
              violations.push(`Read-only constraint blocks action "${action}"`);
            }
            break;

          case ConstraintType.TIME_BOUNDED:
            const now = new Date();
            const allowedHours = definition.allowedHours || [0, 23];
            if (now.getHours() < allowedHours[0] || now.getHours() > allowedHours[1]) {
              violations.push(`Action not allowed outside hours ${allowedHours[0]}-${allowedHours[1]}`);
            }
            break;

          case ConstraintType.MAXIMUM_AUTONOMY:
            // Check if exceeds autonomy level
            const autonomyLevel = definition.level || 3;
            const actionAutonomy = definition.actionAutonomy?.[action] || 1;
            if (actionAutonomy > autonomyLevel) {
              violations.push(`Action "${action}" exceeds maximum autonomy level ${autonomyLevel}`);
            }
            break;
        }
      }

      return {
        success: true,
        data: { allowed: violations.length === 0, violations },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CONSTRAINT_VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // HITL BREAKPOINTS
  // ===========================================================================

  /**
   * Create a HITL breakpoint
   */
  async createHITLBreakpoint(
    threadId: string,
    checkpointId: string,
    breakpoint: Omit<HITLBreakpoint, 'id' | 'threadId' | 'checkpointId' | 'createdAt' | 'resolvedAt' | 'resolvedBy' | 'resolution'>
  ): Promise<ServiceResult<HITLBreakpoint>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.hitl_breakpoints (
          id, thread_id, checkpoint_id, breakpoint_type, trigger_condition,
          context_snapshot, required_role, due_date, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *`,
        [
          id,
          threadId,
          checkpointId,
          breakpoint.breakpointType,
          breakpoint.triggerCondition,
          JSON.stringify(breakpoint.contextSnapshot),
          breakpoint.requiredRole,
          breakpoint.dueDate
        ]
      );

      // Update thread status to awaiting human
      await this.pool.query(
        `UPDATE ${this.schema}.agent_threads 
         SET status = $1, hitl_required = true, updated_at = NOW()
         WHERE id = $2`,
        [ThreadStatus.AWAITING_HUMAN, threadId]
      );

      return {
        success: true,
        data: this.mapHITLBreakpoint(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BREAKPOINT_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  /**
   * Resolve a HITL breakpoint
   */
  async resolveHITLBreakpoint(
    breakpointId: string,
    resolvedBy: string,
    resolution: string
  ): Promise<ServiceResult<HITLBreakpoint>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE ${this.schema}.hitl_breakpoints 
         SET resolved_at = NOW(), resolved_by = $1, resolution = $2
         WHERE id = $3 AND resolved_at IS NULL
         RETURNING *`,
        [resolvedBy, resolution, breakpointId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Breakpoint not found or already resolved' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const breakpoint = result.rows[0];

      // Check if there are remaining unresolved breakpoints
      const pendingResult = await client.query(
        `SELECT COUNT(*) FROM ${this.schema}.hitl_breakpoints 
         WHERE thread_id = $1 AND resolved_at IS NULL`,
        [breakpoint.thread_id]
      );

      if (parseInt(pendingResult.rows[0].count, 10) === 0) {
        // Resume thread
        await client.query(
          `UPDATE ${this.schema}.agent_threads 
           SET status = $1, hitl_required = false, updated_at = NOW()
           WHERE id = $2`,
          [ThreadStatus.ACTIVE, breakpoint.thread_id]
        );
      }

      await client.query('COMMIT');

      return {
        success: true,
        data: this.mapHITLBreakpoint(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'BREAKPOINT_RESOLVE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get pending HITL breakpoints
   */
  async getPendingBreakpoints(
    tenantId?: string,
    options?: { threadId?: string; role?: string }
  ): Promise<ServiceResult<HITLBreakpoint[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE b.resolved_at IS NULL';
      const params: unknown[] = [];
      let paramIndex = 1;

      if (tenantId) {
        whereClause += ` AND t.tenant_id = $${paramIndex++}`;
        params.push(tenantId);
      }

      if (options?.threadId) {
        whereClause += ` AND b.thread_id = $${paramIndex++}`;
        params.push(options.threadId);
      }

      if (options?.role) {
        whereClause += ` AND (b.required_role IS NULL OR b.required_role = $${paramIndex++})`;
        params.push(options.role);
      }

      const result = await this.pool.query(
        `SELECT b.* FROM ${this.schema}.hitl_breakpoints b
         JOIN ${this.schema}.agent_threads t ON b.thread_id = t.id
         ${whereClause}
         ORDER BY b.due_date ASC NULLS LAST, b.created_at ASC`,
        params
      );

      return {
        success: true,
        data: result.rows.map(this.mapHITLBreakpoint),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'BREAKPOINT_LIST_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // ADVERSARIAL REVIEWS
  // ===========================================================================

  /**
   * Create an adversarial review
   */
  async createAdversarialReview(
    threadId: string,
    checkpointId: string,
    review: Omit<AdversarialReview, 'id' | 'threadId' | 'checkpointId' | 'createdAt' | 'resolvedAt'>
  ): Promise<ServiceResult<AdversarialReview>> {
    const startTime = Date.now();

    try {
      const id = uuidv4();

      const result = await this.pool.query(
        `INSERT INTO ${this.schema}.adversarial_reviews (
          id, thread_id, checkpoint_id, reviewer_agent_id, reviewer_user_id,
          challenge_type, challenge_points, outcome, resolution_notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *`,
        [
          id,
          threadId,
          checkpointId,
          review.reviewerAgentId,
          review.reviewerUserId,
          review.challengeType,
          JSON.stringify(review.challengePoints),
          review.outcome,
          review.resolutionNotes
        ]
      );

      return {
        success: true,
        data: this.mapAdversarialReview(result.rows[0]),
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REVIEW_CREATE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // MAPPER FUNCTIONS
  // ===========================================================================

  private mapAgentDefinition = (row: Record<string, unknown>): AgentDefinition => ({
    id: row.id as string,
    agentType: row.agent_type as AgentType,
    displayName: row.display_name as string,
    description: row.description as string | undefined,
    version: row.version as string,
    systemPrompt: row.system_prompt as string,
    capabilities: row.capabilities as string[],
    modelConfig: row.model_config as AgentDefinition['modelConfig'],
    governanceRules: row.governance_rules as AgentDefinition['governanceRules'],
    status: row.status as AgentStatus,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string)
  });

  private mapAgentThread = (row: Record<string, unknown>): AgentThread => ({
    id: row.id as string,
    agentDefinitionId: row.agent_definition_id as string,
    productId: row.product_id as string | undefined,
    tenantId: row.tenant_id as string,
    parentThreadId: row.parent_thread_id as string | undefined,
    contextData: row.context_data as Record<string, unknown>,
    status: row.status as ThreadStatus,
    hitlRequired: row.hitl_required as boolean,
    currentCheckpointId: row.current_checkpoint_id as string | undefined,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    createdBy: row.created_by as string
  });

  private mapCheckpoint = (row: Record<string, unknown>): Checkpoint => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    parentCheckpointId: row.parent_checkpoint_id as string | undefined,
    channel: row.channel as string,
    checkpointType: row.checkpoint_type as string,
    checkpointData: row.checkpoint_data as Record<string, unknown>,
    metadata: row.metadata as CheckpointMetadata,
    createdAt: new Date(row.created_at as string)
  });

  private mapCheckpointWrite = (row: Record<string, unknown>): CheckpointWrite => ({
    id: row.id as string,
    checkpointId: row.checkpoint_id as string,
    taskId: row.task_id as string,
    channel: row.channel as string,
    writeType: row.write_type as string,
    blob: row.blob as Buffer,
    createdAt: new Date(row.created_at as string)
  });

  private mapThreadBranch = (row: Record<string, unknown>): ThreadBranch => ({
    id: row.id as string,
    sourceThreadId: row.source_thread_id as string,
    branchName: row.branch_name as string,
    branchPoint: row.branch_point as string,
    hypothesis: row.hypothesis as string | undefined,
    status: row.status as string,
    mergedAt: row.merged_at ? new Date(row.merged_at as string) : undefined,
    mergedBy: row.merged_by as string | undefined,
    createdAt: new Date(row.created_at as string),
    createdBy: row.created_by as string
  });

  private mapReasoningTrace = (row: Record<string, unknown>): ReasoningTrace => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    stepNumber: row.step_number as number,
    reasoningType: row.reasoning_type as ReasoningType,
    inputSummary: row.input_summary as string,
    thoughtProcess: row.thought_process as string,
    outputSummary: row.output_summary as string,
    confidenceScore: parseFloat(row.confidence_score as string),
    referencedSources: row.referenced_sources as ReasoningTrace['referencedSources'],
    createdAt: new Date(row.created_at as string)
  });

  private mapGovernanceConstraint = (row: Record<string, unknown>): GovernanceConstraint => ({
    id: row.id as string,
    constraintType: row.constraint_type as ConstraintType,
    scope: row.scope as string,
    scopeId: row.scope_id as string | undefined,
    constraintDefinition: row.constraint_definition as Record<string, unknown>,
    effectiveFrom: new Date(row.effective_from as string),
    effectiveUntil: row.effective_until ? new Date(row.effective_until as string) : undefined,
    createdBy: row.created_by as string,
    createdAt: new Date(row.created_at as string)
  });

  private mapHITLBreakpoint = (row: Record<string, unknown>): HITLBreakpoint => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    breakpointType: row.breakpoint_type as BreakpointType,
    triggerCondition: row.trigger_condition as string,
    contextSnapshot: row.context_snapshot as Record<string, unknown>,
    requiredRole: row.required_role as string | undefined,
    dueDate: row.due_date ? new Date(row.due_date as string) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined,
    resolvedBy: row.resolved_by as string | undefined,
    resolution: row.resolution as string | undefined,
    createdAt: new Date(row.created_at as string)
  });

  private mapAdversarialReview = (row: Record<string, unknown>): AdversarialReview => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    checkpointId: row.checkpoint_id as string,
    reviewerAgentId: row.reviewer_agent_id as string | undefined,
    reviewerUserId: row.reviewer_user_id as string | undefined,
    challengeType: row.challenge_type as string,
    challengePoints: row.challenge_points as AdversarialReview['challengePoints'],
    outcome: row.outcome as ReviewOutcome,
    resolutionNotes: row.resolution_notes as string | undefined,
    createdAt: new Date(row.created_at as string),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at as string) : undefined
  });
}
