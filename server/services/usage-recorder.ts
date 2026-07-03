/**
 * @fileoverview API usage recorder — the writer for api_usage_logs.
 * @module server/services/usage-recorder
 *
 * api_usage_logs is the source table for the billing dashboard
 * (/api/billing/usage*), the weekly usage limits + overage stack
 * (services/weekly-usage-limits.ts), and the Anthropic-style plan usage
 * windows (services/usage-windows.ts). Until this module, NOTHING wrote
 * the table — every consumer aggregated an empty relation, so limits and
 * dashboards read zero regardless of real AI spend.
 *
 * The canonical producer is the AI gateway (services/ai-gateway/gateway.ts):
 * every routed LLM call records one row with the serving model, real token
 * counts, and estimated cost. Other metered producers (uploads, exports)
 * can call recordApiUsageSafe directly.
 *
 * Recording is strictly fire-and-forget: a metering outage must never fail
 * the user action being metered. Validation/normalization is a PURE function
 * (normalizeUsageEntry) so it is unit-testable without a DB.
 */

import { pool } from '../db.js';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('usage-recorder');

export interface ApiUsageEntry {
  organizationId: number;
  userId?: number | null;
  /** Billing module bucket ('ai_assistance', '510k', 'cer', 'documents', ...). */
  module?: string;
  /** Endpoint / task identifier for drill-down (e.g. gateway taskType). */
  endpoint?: string | null;
  /** LLM that served the call — feeds per-model usage buckets. */
  model?: string | null;
  requestCount?: number;
  tokensUsed?: number;
  costCents?: number;
  metadata?: Record<string, unknown> | null;
}

export interface NormalizedUsageEntry {
  organizationId: number;
  userId: number | null;
  module: string;
  endpoint: string | null;
  model: string | null;
  requestCount: number;
  tokensUsed: number;
  costCents: number;
  metadata: Record<string, unknown> | null;
}

/**
 * PURE: convert an estimated USD cost to integer cents for the ledger
 * column. Rounds half-up; the precise USD figure should travel in
 * metadata so sub-cent calls remain auditable.
 */
export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 100);
}

/**
 * PURE: validate + normalize a usage entry. Returns null when the entry is
 * not attributable to a tenant (no finite positive organizationId) — an
 * unattributed call cannot be metered against anyone and is dropped, not
 * guessed. Negative counters clamp to 0.
 */
export function normalizeUsageEntry(entry: ApiUsageEntry): NormalizedUsageEntry | null {
  const orgId = Number(entry.organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return null;
  const userId = entry.userId == null ? null : Number(entry.userId);
  const clamp = (n: unknown, fallback: number): number => {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : fallback;
  };
  const module = typeof entry.module === 'string' && entry.module.trim()
    ? entry.module.trim()
    : 'ai_assistance';
  return {
    organizationId: orgId,
    userId: userId != null && Number.isFinite(userId) ? userId : null,
    module,
    endpoint: entry.endpoint?.toString().trim() || null,
    model: entry.model?.toString().trim() || null,
    requestCount: Math.max(1, clamp(entry.requestCount, 1)),
    tokensUsed: clamp(entry.tokensUsed, 0),
    costCents: clamp(entry.costCents, 0),
    metadata: entry.metadata ?? null,
  };
}

/**
 * Record a usage row. Returns true when a row was written, false when the
 * entry was dropped (unattributable) or the write failed. Never throws.
 */
export async function recordApiUsage(entry: ApiUsageEntry): Promise<boolean> {
  const row = normalizeUsageEntry(entry);
  if (!row) return false;
  try {
    await pool.query(
      `INSERT INTO api_usage_logs
         (organization_id, user_id, module, endpoint, model, request_count, tokens_used, cost_cents, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        row.organizationId,
        row.userId,
        row.module,
        row.endpoint,
        row.model,
        row.requestCount,
        row.tokensUsed,
        row.costCents,
        row.metadata ? JSON.stringify(row.metadata) : null,
      ],
    );
    return true;
  } catch (err) {
    logger.error('recordApiUsage failed', {
      module: row.module,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Fire-and-forget wrapper — the form producers should use inline with a
 * user action. Swallows everything (recordApiUsage already never throws;
 * this guards the promise chain too).
 */
export function recordApiUsageSafe(entry: ApiUsageEntry): void {
  void recordApiUsage(entry).catch(() => undefined);
}
