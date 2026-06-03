/**
 * AI Gateway — Audit Logger
 *
 * Persists all AI call audit records for regulatory compliance (21 CFR Part 11).
 * Falls back to in-memory + console when no DB pool is available.
 */

import type { AuditLogEntry } from './types';

export class GatewayAuditLogger {
  private pool: any;
  private buffer: AuditLogEntry[] = [];
  private maxBufferSize = 100;
  private tableInitialized = false;

  constructor(dbPool?: unknown) {
    this.pool = dbPool || null;
  }

  /**
   * Log an audit entry. Non-blocking — failures are swallowed with console.error.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    // Always buffer for in-memory access
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }

    // Console log in development
    if (process.env.NODE_ENV !== 'production') {
      const costStr = entry.estimatedCostUsd > 0
        ? ` cost=$${entry.estimatedCostUsd.toFixed(5)}`
        : '';
      console.log(
        `[AI Gateway Audit] ${entry.success ? '✓' : '✗'} ` +
        `${entry.provider}/${entry.model} ` +
        `task=${entry.taskType} ` +
        `tokens=${entry.totalTokens}${costStr} ` +
        `${entry.latencyMs}ms ` +
        `org=${entry.organizationId || '-'} ` +
        `user=${entry.userId || '-'} ` +
        `caller=${entry.callerModule || '-'} ` +
        `req=${entry.requestId}`,
      );
    }

    // Persist to database if available
    if (this.pool) {
      await this.persistToDb(entry);
    }
  }

  /**
   * Get recent audit entries from buffer.
   */
  getRecentEntries(limit = 20): AuditLogEntry[] {
    return this.buffer.slice(-limit);
  }

  /**
   * Get aggregate stats.
   */
  getStats(): {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    byProvider: Record<string, { count: number; tokens: number; cost: number }>;
  } {
    const stats = {
      totalRequests: this.buffer.length,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      byProvider: {} as Record<string, { count: number; tokens: number; cost: number }>,
    };

    let totalLatency = 0;

    for (const entry of this.buffer) {
      if (entry.success) stats.successCount++;
      else stats.failureCount++;

      stats.totalTokens += entry.totalTokens;
      stats.totalCostUsd += entry.estimatedCostUsd;
      totalLatency += entry.latencyMs;

      const prov = entry.provider;
      if (!stats.byProvider[prov]) {
        stats.byProvider[prov] = { count: 0, tokens: 0, cost: 0 };
      }
      stats.byProvider[prov].count++;
      stats.byProvider[prov].tokens += entry.totalTokens;
      stats.byProvider[prov].cost += entry.estimatedCostUsd;
    }

    stats.avgLatencyMs = stats.totalRequests > 0 ? totalLatency / stats.totalRequests : 0;

    return stats;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Database Persistence
  // ─────────────────────────────────────────────────────────────────────────

  private async persistToDb(entry: AuditLogEntry): Promise<void> {
    if (!this.pool) return;

    try {
      if (!this.tableInitialized) {
        await this.ensureTable();
        this.tableInitialized = true;
      }

      await this.pool.query(
        `INSERT INTO ai.gateway_audit_log (
          request_id, timestamp, provider, model, task_type, strategy,
          organization_id, user_id, project_id, caller_module,
          input_tokens, output_tokens, total_tokens, estimated_cost_usd,
          latency_ms, success, error, cached, deterministic, metadata,
          temperature, seed, prompt_hash, prompt_version, tried_models
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
        [
          entry.requestId,
          entry.timestamp,
          entry.provider,
          entry.model,
          entry.taskType,
          entry.strategy,
          entry.organizationId?.toString() || null,
          entry.userId?.toString() || null,
          entry.projectId?.toString() || null,
          entry.callerModule || null,
          entry.inputTokens,
          entry.outputTokens,
          entry.totalTokens,
          entry.estimatedCostUsd,
          entry.latencyMs,
          entry.success,
          entry.error || null,
          entry.cached,
          entry.deterministic,
          entry.metadata ? JSON.stringify(entry.metadata) : null,
          entry.temperature ?? null,
          entry.seed ?? null,
          entry.promptHash || null,
          entry.promptVersion || null,
          entry.triedModels ? JSON.stringify(entry.triedModels) : null,
        ],
      );
    } catch (error: any) {
      // Non-blocking — don't let audit failures break the gateway
      console.error(`[AI Gateway Audit] DB persist failed: ${error.message}`);
      process.emitWarning(`Audit log persistence failed: ${error.message}`, 'AuditWarning');
    }
  }

  private async ensureTable(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ai`);
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS ai.gateway_audit_log (
          id SERIAL PRIMARY KEY,
          request_id UUID NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT NOW(),
          provider VARCHAR(20) NOT NULL,
          model VARCHAR(64) NOT NULL,
          task_type VARCHAR(32) NOT NULL,
          strategy VARCHAR(32) NOT NULL,
          organization_id VARCHAR(64),
          user_id VARCHAR(64),
          project_id VARCHAR(64),
          caller_module VARCHAR(128),
          input_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          success BOOLEAN DEFAULT true,
          error TEXT,
          cached BOOLEAN DEFAULT false,
          deterministic BOOLEAN DEFAULT false,
          metadata JSONB,
          temperature NUMERIC(4,2),
          seed BIGINT,
          prompt_hash VARCHAR(64),
          prompt_version VARCHAR(64),
          tried_models JSONB
        )
      `);

      // Upgrade already-created tables with the reproducibility columns.
      await this.pool.query(`
        ALTER TABLE ai.gateway_audit_log
          ADD COLUMN IF NOT EXISTS temperature NUMERIC(4,2),
          ADD COLUMN IF NOT EXISTS seed BIGINT,
          ADD COLUMN IF NOT EXISTS prompt_hash VARCHAR(64),
          ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(64),
          ADD COLUMN IF NOT EXISTS tried_models JSONB
      `);

      // Create indexes for common queries
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_org ON ai.gateway_audit_log(organization_id);
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_timestamp ON ai.gateway_audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_provider ON ai.gateway_audit_log(provider);
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_request ON ai.gateway_audit_log(request_id);
        CREATE INDEX IF NOT EXISTS idx_gateway_audit_prompt_hash ON ai.gateway_audit_log(prompt_hash);
      `);

      console.log('[AI Gateway Audit] Database table ai.gateway_audit_log ready');
    } catch (error: any) {
      console.error(`[AI Gateway Audit] Table creation failed: ${error.message}`);
    }
  }
}
