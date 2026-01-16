import { Router } from 'express';
import { db } from '../../lib/database.js';

type LogEventOptions = {
  tenantId?: number | null;
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  severity?: string | null;
  resourceType?: string | null;
};

export const logEvent = async (
  actor: string,
  action: string,
  target: string | null,
  details: any,
  options: LogEventOptions = {}
) => {
  try {
    const tenantId = options.tenantId ?? 0;
    const resourceType = options.resourceType || 'system';

    await db.query(
      `
      INSERT INTO audit_logs (
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        actor_id,
        action_type,
        target_resource,
        details,
        ip_address,
        user_agent,
        session_id,
        severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        tenantId,
        options.userId ?? null,
        action,
        resourceType,
        target,
        actor,
        action,
        target,
        JSON.stringify(details ?? {}),
        options.ipAddress ?? null,
        options.userAgent ?? null,
        options.sessionId ?? null,
        options.severity ?? 'info',
      ]
    );
  } catch (e) {
    console.error('CRITICAL: AUDIT LOG FAILURE', e);
  }
};

const router = Router();

router.get('/health', async (req, res) => {
  const start = Date.now();
  try {
    await db.query('SELECT 1');
    const dbLatency = Date.now() - start;

    const stats = await db.query('SELECT COUNT(*) as count FROM deficiency_bank');

    res.json({
      status: 'OPERATIONAL',
      db_latency_ms: dbLatency,
      intelligence_assets: parseInt(stats.rows[0].count, 10),
      services: {
        database: 'CONNECTED',
        openai: 'STANDBY',
        scheduler: 'ACTIVE',
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: 'CRITICAL_FAILURE', error: err?.message || 'Health check failed' });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const tenantHeader = req.headers['x-organization-id'] || req.headers['x-tenant-id'];
    const tenantId = tenantHeader ? Number(tenantHeader) : null;

    const query = tenantId
      ? `
        SELECT
          id,
          timestamp,
          COALESCE(actor_id, user_id::text, 'SYSTEM') as actor_id,
          COALESCE(action_type, action) as action_type,
          COALESCE(target_resource, resource_id, resource_type) as target_resource,
          details
        FROM audit_logs
        WHERE tenant_id = $1
        ORDER BY timestamp DESC
        LIMIT 50
      `
      : `
        SELECT
          id,
          timestamp,
          COALESCE(actor_id, user_id::text, 'SYSTEM') as actor_id,
          COALESCE(action_type, action) as action_type,
          COALESCE(target_resource, resource_id, resource_type) as target_resource,
          details
        FROM audit_logs
        ORDER BY timestamp DESC
        LIMIT 50
      `;

    const logs = tenantId ? await db.query(query, [tenantId]) : await db.query(query);
    res.json(logs.rows || []);
  } catch (err) {
    console.error('Audit Retrieval Failed', err);
    res.status(500).json({ error: 'Audit Retrieval Failed' });
  }
});

export default router;
