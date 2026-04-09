import { getPool } from '../../db.ts';

export interface QuotaStatus {
  allowed: boolean;
  consumed: number;
  remaining: number;
  limit: number;
  reason?: 'policy_blocked' | 'quota_exhausted' | null;
}

export function usageDateForTenant(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export async function getFirecrawlDailySettings(tenantId: number) {
  const pool = getPool();
  const defaultLimit = Number(process.env.DEFAULT_FIRECRAWL_DAILY_FREE_SCRAPES || 5);
  try {
    const settingsRes = await pool.query(
      `SELECT firecrawl_enabled, firecrawl_daily_free_scrapes
         FROM external_tool_settings
        WHERE tenant_id = $1`,
      [tenantId]
    );
    const row = settingsRes.rows[0];
    return {
      enabled:
        process.env.FEATURE_FIRECRAWL_ENABLED === 'true' && (row?.firecrawl_enabled ?? true) === true,
      limit: Number(row?.firecrawl_daily_free_scrapes ?? defaultLimit),
    };
  } catch (err: any) {
    // Table may not exist yet — degrade gracefully
    if (err?.code === '42P01') {
      return { enabled: false, limit: defaultLimit };
    }
    throw err;
  }
}

export async function checkAndReserveFirecrawlQuota(tenantId: number, requestedOps = 1) {
  // Backwards-compatible helper retained for existing callers.
  // New code paths should prefer:
  // - getFirecrawlQuotaStatus() for pre-check
  // - recordSuccessfulFirecrawlScrape() after successful provider call
  const pool = getPool();
  const { enabled, limit } = await getFirecrawlDailySettings(tenantId);
  if (!enabled) {
    return { allowed: false, consumed: 0, remaining: 0, limit, reason: 'policy_blocked' as const };
  }

  const usageDate = usageDateForTenant();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO firecrawl_usage_daily (tenant_id, usage_date, successful_standard_scrapes, credits_estimated)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (tenant_id, usage_date) DO NOTHING`,
      [tenantId, usageDate]
    );

    const usageRes = await client.query(
      `SELECT successful_standard_scrapes
         FROM firecrawl_usage_daily
        WHERE tenant_id = $1 AND usage_date = $2
        FOR UPDATE`,
      [tenantId, usageDate]
    );

    const consumed = Number(usageRes.rows[0]?.successful_standard_scrapes ?? 0);
    if (consumed + requestedOps > limit) {
      await client.query('ROLLBACK');
      return { allowed: false, consumed, remaining: Math.max(limit - consumed, 0), limit, reason: 'quota_exhausted' as const };
    }

    await client.query(
      `UPDATE firecrawl_usage_daily
          SET successful_standard_scrapes = successful_standard_scrapes + $3,
              updated_at = NOW()
        WHERE tenant_id = $1 AND usage_date = $2`,
      [tenantId, usageDate, requestedOps]
    );

    await client.query('COMMIT');
    return {
      allowed: true,
      consumed: consumed + requestedOps,
      remaining: Math.max(limit - (consumed + requestedOps), 0),
      limit,
      reason: null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getFirecrawlQuotaStatus(tenantId: number): Promise<QuotaStatus> {
  const pool = getPool();
  const { enabled, limit } = await getFirecrawlDailySettings(tenantId);
  if (!enabled) {
    return { allowed: false, consumed: 0, remaining: 0, limit, reason: 'policy_blocked' };
  }

  const usageDate = usageDateForTenant();
  const usageRes = await pool.query(
    `SELECT successful_standard_scrapes
       FROM firecrawl_usage_daily
      WHERE tenant_id = $1 AND usage_date = $2`,
    [tenantId, usageDate]
  );
  const consumed = Number(usageRes.rows[0]?.successful_standard_scrapes ?? 0);
  const remaining = Math.max(limit - consumed, 0);
  return {
    allowed: remaining > 0,
    consumed,
    remaining,
    limit,
    reason: remaining > 0 ? null : 'quota_exhausted',
  };
}

export async function recordSuccessfulFirecrawlScrape(tenantId: number, successfulOps = 1) {
  const pool = getPool();
  const usageDate = usageDateForTenant();
  await pool.query(
    `INSERT INTO firecrawl_usage_daily
      (tenant_id, usage_date, successful_standard_scrapes, credits_estimated, created_at, updated_at)
     VALUES ($1, $2, $3, $3, NOW(), NOW())
     ON CONFLICT (tenant_id, usage_date)
     DO UPDATE SET
      successful_standard_scrapes = firecrawl_usage_daily.successful_standard_scrapes + EXCLUDED.successful_standard_scrapes,
      credits_estimated = firecrawl_usage_daily.credits_estimated + EXCLUDED.credits_estimated,
      updated_at = NOW()`,
    [tenantId, usageDate, successfulOps]
  );
}
