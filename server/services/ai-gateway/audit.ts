/**
 * AI Gateway — Audit Logger
 *
 * Persists all AI call audit records for regulatory compliance (21 CFR Part 11).
 * Falls back to in-memory + console when no DB pool is available.
 *
 * ── Two independent reasons this wrote nothing ───────────────────────────────
 * 1. `ai.gateway_audit_log` had no migration. Its only creator was runtime DDL
 *    here (`ensureTable()`), which a least-privileged runtime role can never
 *    execute — see db/migrations/20260813_ai_gateway_audit_log.sql.
 * 2. No caller ever supplied a pool. `GatewayConfig.dbPool` is optional and
 *    `buildConfig()` never set it, so `this.pool` was null on every production
 *    instance and `persistToDb` was never even reached. Every one of the 103
 *    `getGateway()` call sites calls it with no arguments.
 *
 * Either one alone reduces the ledger to a 100-entry in-memory ring buffer that
 * dies with the process. Both were true at once, and the gateway logged each
 * call as audited throughout. `resolveDefaultPool()` below closes the second.
 */

import type { AuditLogEntry } from './types';

/**
 * Resolve the application pool for callers that construct the logger without
 * one — i.e. all of them.
 *
 * Imported dynamically rather than at module top level on purpose: server/db/
 * runtime.ts opens a connection pool as an import side effect, and this module
 * is pulled in by unit tests and offline scripts that must not acquire a
 * database. Failure is swallowed to null — a pool-less context is legitimate
 * (tests, CLI tooling); it is only a defect in production, and the boot-time
 * `initialize()` is what says so.
 */
async function resolveDefaultPool(): Promise<any> {
  try {
    const runtime: any = await import('../../db/runtime');
    return runtime.getPool();
  } catch {
    return null;
  }
}

/** Message used by both the throwing initialize() and the per-call warning. */
export function missingStoreRemedy(detail: string): string {
  return (
    `AI provenance ledger unusable: ${detail}. ` +
    'ai.gateway_audit_log is created by db/migrations/20260813_ai_gateway_audit_log.sql; ' +
    'apply the migration set (npm run db:migrate:deploy) and ensure the runtime role ' +
    'holds INSERT on it (scripts/db/provision-app-role.mjs). Until then every AI call ' +
    'is unrecorded.'
  );
}

export class GatewayAuditLogger {
  private pool: any;
  private buffer: AuditLogEntry[] = [];
  private maxBufferSize = 100;
  private storeVerified = false;
  /** Set once the store is known unusable, so the failure is reported once, not per call. */
  private storeUnusable: string | null = null;

  /** Set once resolveDefaultPool() has been tried, so it is tried exactly once. */
  private poolResolved = false;

  constructor(dbPool?: unknown) {
    this.pool = dbPool || null;
    this.poolResolved = this.pool !== null;
  }

  /** The injected pool, or the application pool, resolved at most once. */
  private async getPool(): Promise<any> {
    if (this.poolResolved) return this.pool;
    this.poolResolved = true;
    this.pool = await resolveDefaultPool();
    return this.pool;
  }

  /**
   * Assert the provenance ledger is present and writable, and THROW if it is
   * not.
   *
   * Call this from boot, not from the request path. The per-call writer stays
   * deliberately non-blocking — an audit outage must not take down inference —
   * but "non-blocking" was previously indistinguishable from "silently doing
   * nothing forever", which is how this ledger came to record zero rows on a
   * provisioned database while the gateway logged every call as audited.
   * Failing loudly once, at boot, gives the outage somewhere to surface without
   * putting an availability risk on every generation.
   */
  async initialize(): Promise<void> {
    const pool = await this.getPool();
    if (!pool) {
      throw new Error(
        `[AI Gateway Audit] ${missingStoreRemedy(
          'no database pool is available, so records exist only in a 100-entry in-memory buffer',
        )}`,
      );
    }
    const problem = await this.checkStore(pool);
    if (problem) throw new Error(`[AI Gateway Audit] ${missingStoreRemedy(problem)}`);
    this.storeVerified = true;
  }

  /**
   * Returns a human-readable problem, or null when the store is usable.
   *
   * Deliberately two separate questions. `to_regclass` answers existence; a
   * table can exist and still be unwritable by the least-privileged runtime
   * role, and that second case is the one the old code could not distinguish
   * because its CREATE TABLE IF NOT EXISTS succeeded-as-no-op and its INSERT
   * then failed into the same swallowing catch.
   */
  private async checkStore(pool: any): Promise<string | null> {
    try {
      const { rows } = await pool.query(
        `SELECT to_regclass('ai.gateway_audit_log') IS NOT NULL AS present`,
      );
      if (!rows?.[0]?.present) return 'table ai.gateway_audit_log does not exist';

      const priv = await pool.query(
        `SELECT current_user AS role,
                has_table_privilege(current_user, 'ai.gateway_audit_log', 'INSERT') AS can_insert`,
      );
      if (!priv?.rows?.[0]?.can_insert) {
        return `role "${priv?.rows?.[0]?.role ?? 'unknown'}" lacks INSERT on ai.gateway_audit_log`;
      }
      return null;
    } catch (error: any) {
      return `probe failed: ${error?.message ?? String(error)}`;
    }
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

    // Persist. `if (this.pool)` used to guard this, and this.pool was null on
    // every production instance because nothing passed one — so the guard was
    // permanently false and the ledger was a ring buffer. persistToDb now
    // resolves the application pool itself and reports when it cannot.
    await this.persistToDb(entry);
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

  /**
   * Record that the ledger cannot be written, once, with the remedy — then stop
   * re-checking. Latching matters: without it a broken store re-probes the
   * database on every AI call and prints the same line every time, which is
   * indistinguishable from noise and gets filtered.
   */
  private reportUnusable(problem: string): void {
    this.storeUnusable = problem;
    const message = missingStoreRemedy(problem);
    console.error(`[AI Gateway Audit] ${message}`);
    process.emitWarning(message, 'AuditWarning');
  }

  private async persistToDb(entry: AuditLogEntry): Promise<void> {
    // Already known unusable — stay quiet. The condition was reported in full
    // the first time; repeating it once per AI call is how a real failure gets
    // filtered out of a log.
    if (this.storeUnusable) return;

    const pool = await this.getPool();
    if (!pool) {
      this.reportUnusable(
        'no database pool is available, so records exist only in a 100-entry in-memory buffer',
      );
      return;
    }

    try {
      if (!this.storeVerified) {
        const problem = await this.checkStore(pool);
        if (problem) {
          this.reportUnusable(problem);
          return;
        }
        this.storeVerified = true;
      }

      await pool.query(
        `INSERT INTO ai.gateway_audit_log (
          request_id, timestamp, provider, model, resolved_model, task_type, strategy,
          organization_id, user_id, project_id, caller_module,
          input_tokens, output_tokens, total_tokens, estimated_cost_usd,
          latency_ms, success, error, cached, deterministic, metadata,
          temperature, seed, prompt_hash, prompt_version, tried_models,
          substrate, region, retention_policy
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)`,
        [
          entry.requestId,
          entry.timestamp,
          entry.provider,
          entry.model,
          entry.resolvedModel || null,
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
          entry.substrate || null,
          entry.region || null,
          entry.retentionPolicy || null,
        ],
      );
    } catch (error: any) {
      // Non-blocking — don't let audit failures break the gateway
      console.error(`[AI Gateway Audit] DB persist failed: ${error.message}`);
      process.emitWarning(`Audit log persistence failed: ${error.message}`, 'AuditWarning');
    }
  }

  // ── Where ensureTable() used to be ───────────────────────────────────────
  //
  // It ran `CREATE SCHEMA IF NOT EXISTS ai` + `CREATE TABLE IF NOT EXISTS
  // ai.gateway_audit_log (...)` on the request pool, inside a catch that
  // logged "Table creation failed" and returned. On a least-privileged
  // deployment it could not work and could not report that it had not worked:
  // PostgreSQL evaluates the database-level CREATE privilege BEFORE the
  // IF NOT EXISTS short-circuit, so the non-superuser runtime role was refused
  // on the first statement even though schema `ai` already exists
  // (db/migrations/059_gcc_vector_embeddings.sql creates it).
  //
  // The table is now owned by db/migrations/20260813_ai_gateway_audit_log.sql,
  // registered in the deploy-time migration set. checkStore() above verifies
  // rather than provisions, and says which of the two things is wrong.
}
