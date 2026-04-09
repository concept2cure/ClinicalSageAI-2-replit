import { Router } from 'express';
import { firecrawlScrape } from '../integrations/firecrawl/scrape';
import {
  getFirecrawlQuotaStatus,
  recordSuccessfulFirecrawlScrape,
} from '../integrations/firecrawl/usage';
import { evaluateFirecrawlPolicy } from '../integrations/firecrawl/policy';
import { getPool } from '../db.ts';
import { firecrawlError } from '../integrations/firecrawl/errors';
import { authMiddleware } from '../auth';
import { normalizeEvidence, persistEvidence } from '../services/research-intelligence';
import { indexGovernedDocument } from '../services/search/opensearchClient';

const router = Router();
router.use(authMiddleware);

router.get('/quota-status', async (req, res) => {
  try {
    const tenantId = Number((req as any).tenantId || req.query.tenantId || 0);
    if (!tenantId) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT' } });
    const quota = await getFirecrawlQuotaStatus(tenantId);
    return res.json({ success: true, data: quota });
  } catch (err: any) {
    console.error('[firecrawl] quota-status error:', err?.message || err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Firecrawl quota check failed' } });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const correlationId =
      String(req.header('x-correlation-id') || '') || `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tenantId = Number((req as any).tenantId || req.body.tenantId || 0);
    const { url } = req.body || {};
    if (!tenantId || !url) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT' } });

    const pool = getPool();
    let canonicalUrl = url;
    try {
      const u = new URL(url);
      u.hash = '';
      canonicalUrl = u.toString();
    } catch {
      canonicalUrl = url;
    }

    // Cache-hit path: if already captured today for this tenant, reuse evidence and do not charge.
    const cacheRes = await pool.query(
      `SELECT id, title, metadata_json, created_at
         FROM external_evidence_documents
        WHERE tenant_id = $1
          AND canonical_url = $2
          AND created_at >= date_trunc('day', NOW())
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId, canonicalUrl]
    );
    if (cacheRes.rows[0]) {
      const quota = await getFirecrawlQuotaStatus(tenantId);
      return res.json({
        success: true,
        data: {
          url,
          canonicalUrl,
          title: cacheRes.rows[0].title,
          metadata: cacheRes.rows[0].metadata_json || {},
        },
        quota,
        correlationId,
        cached: true,
        evidenceDocumentId: cacheRes.rows[0].id,
      });
    }

    const settingsRes = await pool.query(
      `SELECT firecrawl_enabled, firecrawl_domain_allowlist_json, firecrawl_role_policy_json, firecrawl_category_policy_json
         FROM external_tool_settings WHERE tenant_id = $1`,
      [tenantId]
    );
    const settings = settingsRes.rows[0] || {};
    const allowlist = Array.isArray(settings.firecrawl_domain_allowlist_json)
      ? settings.firecrawl_domain_allowlist_json
      : [];
    const policyResult = evaluateFirecrawlPolicy({
      enabled: Boolean(settings.firecrawl_enabled ?? true),
      requestedUrl: url,
      domainAllowlist: allowlist,
      categoryPolicy: settings.firecrawl_category_policy_json || {},
    });
    if (!policyResult.allowed) {
      return res.status(403).json({ ...firecrawlError('policy_blocked'), correlationId });
    }

    const rolePolicy = settings.firecrawl_role_policy_json || {};
    const restrictedRoles = Array.isArray(rolePolicy?.allowedRoles) ? rolePolicy.allowedRoles : null;
    const requestRole = String((req as any).user?.role || (req as any).role || 'unknown');
    if (restrictedRoles && restrictedRoles.length > 0 && !restrictedRoles.includes(requestRole)) {
      return res.status(403).json({ ...firecrawlError('policy_blocked'), correlationId });
    }

    const quota = await getFirecrawlQuotaStatus(tenantId);
    if (!quota.allowed) {
      return res.status(429).json({ ...firecrawlError('quota_exhausted'), quota, correlationId });
    }

    console.info('[firecrawl.scrape.request]', {
      correlationId,
      tenantId,
      url,
      route: '/api/firecrawl/scrape',
    });
    await pool.query(
      `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
       VALUES ($1,$2,'firecrawl_scrape_requested',$3,NOW())`,
      [tenantId, Number((req as any).userId || 0) || null, JSON.stringify({ correlationId, url })]
    );
    const data = await firecrawlScrape(url);
    const hasContent = Boolean((data as any)?.markdown || (data as any)?.html);
    if (!hasContent) {
      return res.status(422).json(firecrawlError('normalization_failed', 'Scrape returned no usable content.'));
    }
    const normalized = normalizeEvidence({
      provider: 'firecrawl',
      url: data.url || url,
      title: (data as any)?.metadata?.title,
      markdown: data.markdown,
      html: data.html,
      metadata: data.metadata,
    });
    const evidenceDocumentId = await persistEvidence({
      tenantId,
      sourceProvider: 'firecrawl',
      acquisitionMethod: 'direct_scrape',
      url: normalized.url,
      title: normalized.title,
      rawMarkdown: normalized.payload?.markdown,
      rawHtml: normalized.payload?.html,
      metadata: {
        correlationId,
        route: '/api/firecrawl/scrape',
        canonicalUrl: normalized.canonicalUrl,
        domain: normalized.domain,
        regulatorySignals: normalized.regulatorySignals,
      },
    }).catch(() => null);

    if (evidenceDocumentId) {
      await indexGovernedDocument({
        id: String(evidenceDocumentId),
        organizationId: tenantId,
        docType: 'external_evidence',
        title: normalized.title || normalized.url,
        source: 'firecrawl',
        provenance: normalized.canonicalUrl,
        tags: normalized.regulatorySignals || [],
        lifecycleState: 'ingested',
        content: (normalized.payload?.markdown || normalized.payload?.html || '').slice(0, 30000),
      }).catch(() => undefined);
    }
    await recordSuccessfulFirecrawlScrape(tenantId, 1);
    const updatedQuota = await getFirecrawlQuotaStatus(tenantId);

    console.info('[firecrawl.scrape.success]', {
      correlationId,
      tenantId,
      url,
      quotaRemaining: updatedQuota.remaining,
    });
    await pool.query(
      `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
       VALUES ($1,$2,'firecrawl_scrape_succeeded',$3,NOW())`,
      [
        tenantId,
        Number((req as any).userId || 0) || null,
        JSON.stringify({ correlationId, url, quotaRemaining: updatedQuota.remaining }),
      ]
    );
    return res.json({
      success: true,
      data,
      quota: updatedQuota,
      correlationId,
      evidenceDocumentId,
      cached: false,
    });
  } catch (error: any) {
    return res.status(502).json(firecrawlError('provider_error', error?.message));
  }
});

export default router;
