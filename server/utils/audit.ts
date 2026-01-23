import pool from '../lib/db.js';

type AuditPayload = {
  action: string;
  actorUserId?: string | number | null;
  actorEmail?: string | null;
  tenantId?: string | number | null;
  entityType?: string | null;
  entityId?: string | number | null;
  metadata?: Record<string, any> | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

/**
 * Enterprise-safe audit logger.
 * - Never throws (audit should not take down the app)
 * - Writes to DB if audit_logs table exists
 * - Falls back to console logging if DB insert fails
 */
export async function logAudit(payload: AuditPayload): Promise<void> {
  try {
    if (!payload?.action) return;

    const row = {
      action: payload.action,
      actor_user_id: payload.actorUserId ?? null,
      actor_email: payload.actorEmail ?? null,
      tenant_id: payload.tenantId ?? null,
      entity_type: payload.entityType ?? null,
      entity_id: payload.entityId ?? null,
      metadata: payload.metadata ?? null,
      ip: payload.ip ?? null,
      user_agent: payload.userAgent ?? null,
      request_id: payload.requestId ?? null,
    };

    await pool.query(
      `
      INSERT INTO audit_logs
        (action, actor_user_id, actor_email, tenant_id, entity_type, entity_id, metadata, ip, user_agent, request_id)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        row.action,
        row.actor_user_id,
        row.actor_email,
        row.tenant_id,
        row.entity_type,
        row.entity_id,
        row.metadata ? JSON.stringify(row.metadata) : null,
        row.ip,
        row.user_agent,
        row.request_id,
      ]
    );
  } catch (err) {
    try {
      console.warn('[AUDIT_FALLBACK]', {
        action: payload?.action,
        actorUserId: payload?.actorUserId ?? null,
        tenantId: payload?.tenantId ?? null,
        entityType: payload?.entityType ?? null,
        entityId: payload?.entityId ?? null,
        requestId: payload?.requestId ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    } catch (_) {
      // swallow all audit errors
    }
  }
}

export default { logAudit };
