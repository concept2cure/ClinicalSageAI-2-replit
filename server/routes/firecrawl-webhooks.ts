import { Router } from 'express';
import express from 'express';
import { verifyFirecrawlWebhook } from '../integrations/firecrawl/webhook';
import { getPool } from '../db.ts';
import { firecrawlError } from '../integrations/firecrawl/errors';

const router = Router();

router.post('/', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signature = req.header('x-firecrawl-signature') || req.header('x-signature') || undefined;
  const isValid = verifyFirecrawlWebhook(rawPayload, signature);

  const pool = getPool();
  await pool.query(
    `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [
      Number((req as any).tenantId || 0),
      null,
      isValid ? 'firecrawl_webhook_received' : 'webhook_verification_failed',
      JSON.stringify({ rawPayload, signaturePresent: Boolean(signature) }),
    ]
  );

  if (!isValid) {
    return res.status(401).json(firecrawlError('webhook_verification_failed'));
  }

  return res.json({ success: true });
});

export default router;
