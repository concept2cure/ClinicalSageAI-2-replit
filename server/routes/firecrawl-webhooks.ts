import { Router } from 'express';
import express from 'express';
import { verifyFirecrawlWebhook } from '../integrations/firecrawl/webhook';
import { getPool } from '../db';
import { firecrawlError } from '../integrations/firecrawl/errors';
import { runWithTenantScope } from '../db/tenantStore';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('firecrawl-webhook');

const router = Router();

router.post('/', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
  const rawPayload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const signature = req.header('x-firecrawl-signature') || req.header('x-signature') || undefined;
  const isValid = verifyFirecrawlWebhook(rawPayload, signature);

  // Verify BEFORE anything is written. Until 2026-09-24 this route INSERTed an
  // audit row first, with no catch, in the super-admin scope, for every request
  // from anyone. The route is public (session-auth open list) and mounted
  // unconditionally, and with FIRECRAWL_WEBHOOK_SECRET unset every request is
  // unverified — so production answered each one 500 (the table is on no
  // applier) instead of 401, and had the table existed any internet client could
  // have written rows past RLS. A refused request is logged, not stored.
  if (!isValid) {
    logger.warn('webhook verification failed', { signaturePresent: Boolean(signature) });
    return res.status(401).json(firecrawlError('webhook_verification_failed'));
  }

  await runWithTenantScope(
    {
      tenantId: '0',
      role: 'app_super_admin',
      source: 'request',
      caller: 'firecrawl-webhook:audit',
    },
    () =>
      getPool().query(
        `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
       VALUES ($1,$2,$3,$4,NOW())`,
        [0, null, 'firecrawl_webhook_received', JSON.stringify({ signaturePresent: true })]
      )
  );

  return res.json({ success: true });
});

export default router;
