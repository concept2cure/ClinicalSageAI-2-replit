import { Router } from 'express';
import { getPool } from '../db.ts';
import { authMiddleware, requireAdminRole } from '../auth';

const router = Router();
router.use(authMiddleware);
router.use(requireAdminRole);

router.get('/:tenantId', async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const pool = getPool();
  const result = await pool.query(
    `SELECT * FROM external_tool_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  res.json({ success: true, data: result.rows[0] || null });
});

router.post('/:tenantId', async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const actorUserId = Number((req as any).userId || 0);
  const body = req.body || {};
  const pool = getPool();

  await pool.query(
    `INSERT INTO external_tool_settings
      (tenant_id, firecrawl_enabled, firecrawl_daily_free_scrapes, firecrawl_role_policy_json, firecrawl_domain_allowlist_json, firecrawl_category_policy_json, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET
      firecrawl_enabled = EXCLUDED.firecrawl_enabled,
      firecrawl_daily_free_scrapes = EXCLUDED.firecrawl_daily_free_scrapes,
      firecrawl_role_policy_json = EXCLUDED.firecrawl_role_policy_json,
      firecrawl_domain_allowlist_json = EXCLUDED.firecrawl_domain_allowlist_json,
      firecrawl_category_policy_json = EXCLUDED.firecrawl_category_policy_json,
      updated_at = NOW()`,
    [
      tenantId,
      Boolean(body.firecrawl_enabled),
      Number(body.firecrawl_daily_free_scrapes ?? process.env.DEFAULT_FIRECRAWL_DAILY_FREE_SCRAPES ?? 5),
      JSON.stringify(body.firecrawl_role_policy_json || {}),
      JSON.stringify(body.firecrawl_domain_allowlist_json || []),
      JSON.stringify(body.firecrawl_category_policy_json || {}),
    ]
  );

  await pool.query(
    `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
     VALUES ($1,$2,'workspace_tool_settings_updated',$3,NOW())`,
    [tenantId, actorUserId || null, JSON.stringify(body)]
  );

  res.json({ success: true });
});

router.get('/:tenantId/diagnostics', async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const pool = getPool();
  const [settings, usage, audit] = await Promise.all([
    pool.query(`SELECT * FROM external_tool_settings WHERE tenant_id = $1`, [tenantId]),
    pool.query(
      `SELECT * FROM firecrawl_usage_daily WHERE tenant_id = $1 ORDER BY usage_date DESC LIMIT 14`,
      [tenantId]
    ),
    pool.query(
      `SELECT event_type, event_payload_json, created_at
         FROM external_tool_audit_log
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [tenantId]
    ),
  ]);

  res.json({
    success: true,
    data: {
      settings: settings.rows[0] || null,
      usageLast14Days: usage.rows,
      recentAuditEvents: audit.rows,
      readiness: {
        featureFlagEnabled: process.env.FEATURE_FIRECRAWL_ENABLED === 'true',
        firecrawlApiKeyConfigured: Boolean(process.env.FIRECRAWL_API_KEY),
        webhookSecretConfigured: Boolean(process.env.FIRECRAWL_WEBHOOK_SECRET),
      },
    },
  });
});

export default router;
