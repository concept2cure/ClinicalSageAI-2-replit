/**
 * =============================================================================
 * Checkpoint Manager Service
 * =============================================================================
 * LangGraph-compatible checkpoint persistence layer for PostgreSQL.
 * Implements the BaseCheckpointSaver interface pattern from LangGraph.
 * 
 * Features:
 * - Checkpoint serialization/deserialization
 * - Parent-child checkpoint relationships
 * - Channel-based state isolation
 * - Efficient checkpoint retrieval with cursors
 * - Time-travel debugging support
 * =============================================================================
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  Checkpoint,
  CheckpointMetadata,
  CheckpointWrite,
  ServiceResult
} from './types';

/**
 * LangGraph checkpoint tuple format
 */
export interface CheckpointTuple {
  config: CheckpointConfig;
  checkpoint: SerializedCheckpoint;
  metadata: CheckpointMetadata;
  parentConfig?: CheckpointConfig;
  pendingWrites?: PendingWrite[];
}

export interface CheckpointConfig {
  configurable: {
    thread_id: string;
    checkpoint_ns?: string;
    checkpoint_id?: string;
  };
}

export interface SerializedCheckpoint {
  v: number;
  id: string;
  ts: string;
  channel_values: Record<string, unknown>;
  channel_versions: Record<string, number>;
  versions_seen: Record<string, Record<string, number>>;
  pending_sends: unknown[];
}

export interface PendingWrite {
  task_id: string;
  channel: string;
  value: unknown;
}

export interface CheckpointManagerConfig {
  pool: Pool;
  schema?: string;
  serializerType?: 'json' | 'msgpack';
}

export class CheckpointManager {
  private pool: Pool;
  private readonly schema: string;
  private readonly serializerType: string;

  constructor(config: CheckpointManagerConfig) {
    this.pool = config.pool;
    this.schema = config.schema || 'agent_runtime';
    this.serializerType = config.serializerType || 'json';
  }

  /**
   * Get checkpoint tuple by config (LangGraph interface)
   */
  async getTuple(config: CheckpointConfig): Promise<CheckpointTuple | undefined> {
    const { thread_id, checkpoint_ns, checkpoint_id } = config.configurable;

    try {
      let query: string;
      let params: unknown[];

      if (checkpoint_id) {
        // Get specific checkpoint
        query = `
          SELECT c.*, p.id as parent_id, p.thread_id as parent_thread_id
          FROM ${this.schema}.checkpoints c
          LEFT JOIN ${this.schema}.checkpoints p ON c.parent_checkpoint_id = p.id
          WHERE c.id = $1 AND c.thread_id = $2
        `;
        params = [checkpoint_id, thread_id];
      } else {
        // Get latest checkpoint for thread
        query = `
          SELECT c.*, p.id as parent_id, p.thread_id as parent_thread_id
          FROM ${this.schema}.checkpoints c
          LEFT JOIN ${this.schema}.checkpoints p ON c.parent_checkpoint_id = p.id
          WHERE c.thread_id = $1
          ${checkpoint_ns ? 'AND c.channel = $2' : ''}
          ORDER BY c.created_at DESC
          LIMIT 1
        `;
        params = checkpoint_ns ? [thread_id, checkpoint_ns] : [thread_id];
      }

      const result = await this.pool.query(query, params);

      if (result.rows.length === 0) {
        return undefined;
      }

      const row = result.rows[0];
      const checkpointData = row.checkpoint_data;

      // Get pending writes
      const writesResult = await this.pool.query(
        `SELECT * FROM ${this.schema}.checkpoint_writes 
         WHERE checkpoint_id = $1 
         ORDER BY created_at ASC`,
        [row.id]
      );

      const pendingWrites: PendingWrite[] = writesResult.rows.map(w => ({
        task_id: w.task_id,
        channel: w.channel,
        value: this.deserializeBlob(w.blob)
      }));

      return {
        config: {
          configurable: {
            thread_id: row.thread_id,
            checkpoint_ns: row.channel,
            checkpoint_id: row.id
          }
        },
        checkpoint: {
          v: 1,
          id: row.id,
          ts: row.created_at.toISOString(),
          channel_values: checkpointData.channel_values || {},
          channel_versions: checkpointData.channel_versions || {},
          versions_seen: checkpointData.versions_seen || {},
          pending_sends: checkpointData.pending_sends || []
        },
        metadata: row.metadata || {},
        parentConfig: row.parent_id ? {
          configurable: {
            thread_id: row.parent_thread_id,
            checkpoint_id: row.parent_id
          }
        } : undefined,
        pendingWrites: pendingWrites.length > 0 ? pendingWrites : undefined
      };
    } catch (error) {
      console.error('Error getting checkpoint tuple:', error);
      return undefined;
    }
  }

  /**
   * List checkpoint tuples (LangGraph interface)
   */
  async *list(
    config: CheckpointConfig,
    options?: {
      limit?: number;
      before?: CheckpointConfig;
      filter?: Record<string, unknown>;
    }
  ): AsyncGenerator<CheckpointTuple> {
    const { thread_id, checkpoint_ns } = config.configurable;
    const limit = options?.limit || 100;

    try {
      let whereClause = 'WHERE c.thread_id = $1';
      const params: unknown[] = [thread_id];
      let paramIndex = 2;

      if (checkpoint_ns) {
        whereClause += ` AND c.channel = $${paramIndex++}`;
        params.push(checkpoint_ns);
      }

      if (options?.before?.configurable.checkpoint_id) {
        whereClause += ` AND c.created_at < (
          SELECT created_at FROM ${this.schema}.checkpoints WHERE id = $${paramIndex++}
        )`;
        params.push(options.before.configurable.checkpoint_id);
      }

      if (options?.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          whereClause += ` AND c.metadata->>'${key}' = $${paramIndex++}`;
          params.push(String(value));
        }
      }

      params.push(limit);

      const result = await this.pool.query(
        `SELECT c.*, p.id as parent_id, p.thread_id as parent_thread_id
         FROM ${this.schema}.checkpoints c
         LEFT JOIN ${this.schema}.checkpoints p ON c.parent_checkpoint_id = p.id
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex}`,
        params
      );

      for (const row of result.rows) {
        const checkpointData = row.checkpoint_data;

        yield {
          config: {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.channel,
              checkpoint_id: row.id
            }
          },
          checkpoint: {
            v: 1,
            id: row.id,
            ts: row.created_at.toISOString(),
            channel_values: checkpointData.channel_values || {},
            channel_versions: checkpointData.channel_versions || {},
            versions_seen: checkpointData.versions_seen || {},
            pending_sends: checkpointData.pending_sends || []
          },
          metadata: row.metadata || {},
          parentConfig: row.parent_id ? {
            configurable: {
              thread_id: row.parent_thread_id,
              checkpoint_id: row.parent_id
            }
          } : undefined
        };
      }
    } catch (error) {
      console.error('Error listing checkpoints:', error);
    }
  }

  /**
   * Put checkpoint (LangGraph interface)
   */
  async put(
    config: CheckpointConfig,
    checkpoint: SerializedCheckpoint,
    metadata: CheckpointMetadata,
    newVersions: Record<string, number>
  ): Promise<CheckpointConfig> {
    const { thread_id, checkpoint_ns } = config.configurable;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const checkpointId = checkpoint.id || uuidv4();

      // Find parent checkpoint
      const parentResult = await client.query(
        `SELECT id FROM ${this.schema}.checkpoints 
         WHERE thread_id = $1 
         ${checkpoint_ns ? 'AND channel = $2' : ''}
         ORDER BY created_at DESC 
         LIMIT 1`,
        checkpoint_ns ? [thread_id, checkpoint_ns] : [thread_id]
      );

      const parentId = parentResult.rows[0]?.id;

      // Insert checkpoint
      await client.query(
        `INSERT INTO ${this.schema}.checkpoints (
          id, thread_id, parent_checkpoint_id, channel, checkpoint_type,
          checkpoint_data, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          checkpoint_data = EXCLUDED.checkpoint_data,
          metadata = EXCLUDED.metadata`,
        [
          checkpointId,
          thread_id,
          parentId,
          checkpoint_ns || '__default__',
          'langgraph',
          JSON.stringify({
            channel_values: checkpoint.channel_values,
            channel_versions: { ...checkpoint.channel_versions, ...newVersions },
            versions_seen: checkpoint.versions_seen,
            pending_sends: checkpoint.pending_sends
          }),
          JSON.stringify(metadata),
          checkpoint.ts ? new Date(checkpoint.ts) : new Date()
        ]
      );

      // Update thread's current checkpoint
      await client.query(
        `UPDATE ${this.schema}.agent_threads 
         SET current_checkpoint_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [checkpointId, thread_id]
      );

      await client.query('COMMIT');

      return {
        configurable: {
          thread_id,
          checkpoint_ns: checkpoint_ns || '__default__',
          checkpoint_id: checkpointId
        }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Put writes (LangGraph interface)
   */
  async putWrites(
    config: CheckpointConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const { checkpoint_id } = config.configurable;

    if (!checkpoint_id) {
      throw new Error('checkpoint_id is required for putWrites');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const write of writes) {
        await client.query(
          `INSERT INTO ${this.schema}.checkpoint_writes (
            id, checkpoint_id, task_id, channel, write_type, blob, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            uuidv4(),
            checkpoint_id,
            taskId,
            write.channel,
            typeof write.value,
            this.serializeBlob(write.value)
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete checkpoint and all descendants
   */
  async delete(config: CheckpointConfig): Promise<void> {
    const { thread_id, checkpoint_id } = config.configurable;

    if (!checkpoint_id) {
      // Delete all checkpoints for thread
      await this.pool.query(
        `DELETE FROM ${this.schema}.checkpoint_writes 
         WHERE checkpoint_id IN (
           SELECT id FROM ${this.schema}.checkpoints WHERE thread_id = $1
         )`,
        [thread_id]
      );
      await this.pool.query(
        `DELETE FROM ${this.schema}.checkpoints WHERE thread_id = $1`,
        [thread_id]
      );
    } else {
      // Delete specific checkpoint and descendants using recursive CTE
      await this.pool.query(
        `WITH RECURSIVE descendants AS (
          SELECT id FROM ${this.schema}.checkpoints WHERE id = $1
          UNION ALL
          SELECT c.id FROM ${this.schema}.checkpoints c
          JOIN descendants d ON c.parent_checkpoint_id = d.id
        )
        DELETE FROM ${this.schema}.checkpoint_writes 
        WHERE checkpoint_id IN (SELECT id FROM descendants)`,
        [checkpoint_id]
      );

      await this.pool.query(
        `WITH RECURSIVE descendants AS (
          SELECT id FROM ${this.schema}.checkpoints WHERE id = $1
          UNION ALL
          SELECT c.id FROM ${this.schema}.checkpoints c
          JOIN descendants d ON c.parent_checkpoint_id = d.id
        )
        DELETE FROM ${this.schema}.checkpoints 
        WHERE id IN (SELECT id FROM descendants)`,
        [checkpoint_id]
      );
    }
  }

  // ===========================================================================
  // TIME TRAVEL OPERATIONS
  // ===========================================================================

  /**
   * Restore state to a specific checkpoint (time travel)
   */
  async restoreToCheckpoint(
    threadId: string,
    checkpointId: string
  ): Promise<ServiceResult<CheckpointTuple>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Verify checkpoint exists and belongs to thread
      const checkpointResult = await client.query(
        `SELECT * FROM ${this.schema}.checkpoints 
         WHERE id = $1 AND thread_id = $2`,
        [checkpointId, threadId]
      );

      if (checkpointResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Checkpoint not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      // Update thread's current checkpoint
      await client.query(
        `UPDATE ${this.schema}.agent_threads 
         SET current_checkpoint_id = $1, updated_at = NOW()
         WHERE id = $2`,
        [checkpointId, threadId]
      );

      // Mark checkpoints after this point as abandoned (soft delete)
      await client.query(
        `UPDATE ${this.schema}.checkpoints 
         SET metadata = metadata || '{"abandoned": true}'::jsonb
         WHERE thread_id = $1 
           AND created_at > (SELECT created_at FROM ${this.schema}.checkpoints WHERE id = $2)`,
        [threadId, checkpointId]
      );

      await client.query('COMMIT');

      // Get the restored checkpoint tuple
      const tuple = await this.getTuple({
        configurable: { thread_id: threadId, checkpoint_id: checkpointId }
      });

      return {
        success: true,
        data: tuple,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'RESTORE_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Fork from a checkpoint to create a new timeline
   */
  async forkFromCheckpoint(
    sourceThreadId: string,
    checkpointId: string,
    newThreadId: string,
    createdBy: string
  ): Promise<ServiceResult<CheckpointConfig>> {
    const startTime = Date.now();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get the source checkpoint
      const checkpointResult = await client.query(
        `SELECT * FROM ${this.schema}.checkpoints 
         WHERE id = $1 AND thread_id = $2`,
        [checkpointId, sourceThreadId]
      );

      if (checkpointResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Source checkpoint not found' },
          metadata: { executionTimeMs: Date.now() - startTime }
        };
      }

      const sourceCheckpoint = checkpointResult.rows[0];

      // Create the new thread
      await client.query(
        `INSERT INTO ${this.schema}.agent_threads (
          id, agent_definition_id, product_id, tenant_id, parent_thread_id,
          context_data, status, hitl_required, created_at, updated_at, created_by
        ) SELECT $1, agent_definition_id, product_id, tenant_id, $2,
                 context_data || '{"forked_from": "${checkpointId}"}'::jsonb, 
                 'active', hitl_required, NOW(), NOW(), $3
        FROM ${this.schema}.agent_threads WHERE id = $2`,
        [newThreadId, sourceThreadId, createdBy]
      );

      // Create a new checkpoint in the forked thread
      const newCheckpointId = uuidv4();
      await client.query(
        `INSERT INTO ${this.schema}.checkpoints (
          id, thread_id, parent_checkpoint_id, channel, checkpoint_type,
          checkpoint_data, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          newCheckpointId,
          newThreadId,
          checkpointId,
          sourceCheckpoint.channel,
          sourceCheckpoint.checkpoint_type,
          JSON.stringify(sourceCheckpoint.checkpoint_data),
          JSON.stringify({
            ...sourceCheckpoint.metadata,
            forked_from: { thread_id: sourceThreadId, checkpoint_id: checkpointId },
            forked_at: new Date().toISOString(),
            forked_by: createdBy
          })
        ]
      );

      // Update new thread's current checkpoint
      await client.query(
        `UPDATE ${this.schema}.agent_threads 
         SET current_checkpoint_id = $1
         WHERE id = $2`,
        [newCheckpointId, newThreadId]
      );

      // Record the branch
      await client.query(
        `INSERT INTO ${this.schema}.thread_branches (
          id, source_thread_id, branch_name, branch_point, status, created_at, created_by
        ) VALUES ($1, $2, $3, $4, 'active', NOW(), $5)`,
        [uuidv4(), sourceThreadId, `fork-${newThreadId}`, checkpointId, createdBy]
      );

      await client.query('COMMIT');

      return {
        success: true,
        data: {
          configurable: {
            thread_id: newThreadId,
            checkpoint_id: newCheckpointId
          }
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: {
          code: 'FORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get checkpoint history with diffs
   */
  async getCheckpointHistory(
    threadId: string,
    options?: { limit?: number; includeAbandoned?: boolean }
  ): Promise<ServiceResult<CheckpointTuple[]>> {
    const startTime = Date.now();

    try {
      let whereClause = 'WHERE c.thread_id = $1';
      if (!options?.includeAbandoned) {
        whereClause += " AND (c.metadata->>'abandoned' IS NULL OR c.metadata->>'abandoned' = 'false')";
      }

      const result = await this.pool.query(
        `SELECT c.*, p.id as parent_id, p.thread_id as parent_thread_id,
                p.checkpoint_data as parent_data
         FROM ${this.schema}.checkpoints c
         LEFT JOIN ${this.schema}.checkpoints p ON c.parent_checkpoint_id = p.id
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $2`,
        [threadId, options?.limit || 50]
      );

      const history: CheckpointTuple[] = result.rows.map(row => {
        const checkpointData = row.checkpoint_data;

        return {
          config: {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.channel,
              checkpoint_id: row.id
            }
          },
          checkpoint: {
            v: 1,
            id: row.id,
            ts: row.created_at.toISOString(),
            channel_values: checkpointData.channel_values || {},
            channel_versions: checkpointData.channel_versions || {},
            versions_seen: checkpointData.versions_seen || {},
            pending_sends: checkpointData.pending_sends || []
          },
          metadata: {
            ...row.metadata,
            diff: row.parent_data ? this.computeDiff(row.parent_data, checkpointData) : null
          },
          parentConfig: row.parent_id ? {
            configurable: {
              thread_id: row.parent_thread_id,
              checkpoint_id: row.parent_id
            }
          } : undefined
        };
      });

      return {
        success: true,
        data: history,
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'HISTORY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        metadata: { executionTimeMs: Date.now() - startTime }
      };
    }
  }

  // ===========================================================================
  // SERIALIZATION HELPERS
  // ===========================================================================

  private serializeBlob(value: unknown): Buffer {
    if (this.serializerType === 'json') {
      return Buffer.from(JSON.stringify(value), 'utf8');
    }
    // For msgpack, we'd use a library like @msgpack/msgpack
    return Buffer.from(JSON.stringify(value), 'utf8');
  }

  private deserializeBlob(blob: Buffer): unknown {
    if (this.serializerType === 'json') {
      return JSON.parse(blob.toString('utf8'));
    }
    return JSON.parse(blob.toString('utf8'));
  }

  private computeDiff(
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ): Record<string, unknown> {
    const diff: Record<string, unknown> = {};

    const beforeChannels = (before.channel_values || {}) as Record<string, unknown>;
    const afterChannels = (after.channel_values || {}) as Record<string, unknown>;

    // Added channels
    for (const key of Object.keys(afterChannels)) {
      if (!(key in beforeChannels)) {
        diff[`+${key}`] = afterChannels[key];
      } else if (JSON.stringify(beforeChannels[key]) !== JSON.stringify(afterChannels[key])) {
        diff[`~${key}`] = { before: beforeChannels[key], after: afterChannels[key] };
      }
    }

    // Removed channels
    for (const key of Object.keys(beforeChannels)) {
      if (!(key in afterChannels)) {
        diff[`-${key}`] = beforeChannels[key];
      }
    }

    return diff;
  }
}
