import { Router } from 'express';
import { firecrawlScrape } from '../integrations/firecrawl/scrape';
import {
  getFirecrawlQuotaStatus,
  recordSuccessfulFirecrawlScrape,
} from '../integrations/firecrawl/usage';
import {
  evaluateScrapeGuards,
  type FirecrawlTenantSettings,
} from '../integrations/firecrawl/guards';
import { getPool } from '../db';
import { firecrawlError } from '../integrations/firecrawl/errors';
import { authMiddleware } from '../auth';
import { requireAuthedOrgId } from '../utils/authedOrgId';
import { normalizeEvidence, persistEvidence } from '../services/research-intelligence';
import { indexGovernedDocument } from '../services/search/opensearchClient';

const router = Router();
router.use(authMiddleware);

type Pool = ReturnType<typeof getPool>;

/** Correlation id from the request header, or a generated fallback. */
function buildCorrelationId(req: any): string {
  return (
    String(req.header('x-correlation-id') || '') ||
    `fc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

/** Strip the fragment so cache keys are stable; pass through if unparhseable. */
function canonicalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/** Today's cached evidence row for this tenant+URL, or null (no charge on hit). */
async function findTodaysCachedEvidence(pool: Pool, tenantId: number, canonicalUrl: string) {
  const cacheRes = await pool.query(
    `SELECT id, title, metadata_json, created_at
       FROM external_evidence_documents
      WHERE tenant_id = $1
        AND canonical_url = $2
        AND created_at >= date_trunc('day', NOW())
      ORDER BY created_at DESC
      LIMIT 1`,
    [tenantId, canonicalUrl],
  );
  return cacheRes.rows[0] || null;
}

/** Load the tenant's Firecrawl settings row (empty object if none). */
async function loadFirecrawlSettings(pool: Pool, tenantId: number): Promise<FirecrawlTenantSettings> {
  const settingsRes = await pool.query(
    `SELECT firecrawl_enabled, firecrawl_domain_allowlist_json, firecrawl_role_policy_json, firecrawl_category_policy_json
       FROM external_tool_settings WHERE tenant_id = $1`,
    [tenantId],
  );
  return settingsRes.rows[0] || {};
}

/** Append a Firecrawl event to the tamper-evident external-tool audit log. */
async function writeFirecrawlAudit(
  pool: Pool,
  tenantId: number,
  actorUserId: number | null,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO external_tool_audit_log (tenant_id, actor_user_id, event_type, event_payload_json, created_at)
     VALUES ($1,$2,$3,$4,NOW())`,
    [tenantId, actorUserId, eventType, JSON.stringify(payload)],
  );
}

/** The tenant role for this request (best-effort across auth shapes). */
function resolveRequestRole(req: any): string {
  return String(req.user?.role || req.role || 'unknown');
}

/** The acting user id for audit rows, or null when unauthenticated/system. */
function resolveActorUserId(req: any): number | null {
  return Number(req.userId || 0) || null;
}

/** A scrape is usable only if the provider returned markdown or html. */
function hasScrapeContent(data: any): boolean {
  return Boolean(data?.markdown || data?.html);
}

/** OpenSearch tags derived from the normalized evidence's regulatory signals. */
function buildEvidenceTags(signals: any): string[] {
  return [
    ...(signals?.nctIds || []),
    ...(signals?.dois || []),
    ...(signals?.hasSafetyLanguage ? ['safety'] : []),
    ...(signals?.hasEfficacyLanguage ? ['efficacy'] : []),
    ...(signals?.hasRegulatoryLanguage ? ['regulatory'] : []),
  ];
}

/** Indexed body: markdown preferred, html fallback, capped at 30k chars. */
function evidenceIndexContent(normalized: any): string {
  return (normalized.payload?.markdown || normalized.payload?.html || '').slice(0, 30000);
}

/** Normalize, persist, and index a successful scrape; returns the evidence id. */
async function persistAndIndexScrape(params: {
  tenantId: number;
  correlationId: string;
  url: string;
  data: any;
}): Promise<number | null> {
  const { tenantId, correlationId, url, data } = params;
  const normalized = normalizeEvidence({
    provider: 'firecrawl',
    url: data.url || url,
    title: data?.metadata?.title,
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
      tags: buildEvidenceTags(normalized.regulatorySignals),
      lifecycleState: 'ingested',
      content: evidenceIndexContent(normalized),
    }).catch(() => undefined);
  }
  return evidenceDocumentId;
}

/** Human-actionable 403 message for the specific guard-denial reason. */
function guardDenialMessage(reason: string): string | undefined {
  if (reason === 'allowlist_required') {
    return 'Firecrawl is enabled for this workspace but has no domain allowlist configured. Add allowed domains to firecrawl_domain_allowlist_json before scraping.';
  }
  return undefined;
}

router.get('/quota-status', async (req, res) => {
  try {
    const orgGuard = requireAuthedOrgId(req, res);
    if (!orgGuard.ok) return;
    const tenantId = orgGuard.orgId;
    const quota = await getFirecrawlQuotaStatus(tenantId);
    return res.json({ success: true, data: quota });
  } catch (err: any) {
    console.error('[firecrawl] quota-status error:', err?.message || err);
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Firecrawl quota check failed' } });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const orgGuard = requireAuthedOrgId(req, res);
    if (!orgGuard.ok) return;
    const tenantId = orgGuard.orgId;
    const correlationId = buildCorrelationId(req);
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ success: false, error: { code: 'INVALID_INPUT' } });

    const pool = getPool();
    const canonicalUrl = canonicalizeUrl(url);

    // Cache-hit path: if already captured today for this tenant, reuse evidence and do not charge.
    const cached = await findTodaysCachedEvidence(pool, tenantId, canonicalUrl);
    if (cached) {
      const quota = await getFirecrawlQuotaStatus(tenantId);
      return res.json({
        success: true,
        data: { url, canonicalUrl, title: cached.title, metadata: cached.metadata_json || {} },
        quota,
        correlationId,
        cached: true,
        evidenceDocumentId: cached.id,
      });
    }

    const settings = await loadFirecrawlSettings(pool, tenantId);
    const guard = evaluateScrapeGuards({ settings, requestedUrl: url, requestRole: resolveRequestRole(req) });
    if (!guard.ok) {
      return res
        .status(guard.status)
        .json({ ...firecrawlError(guard.code, guardDenialMessage(guard.reason)), correlationId });
    }

    const quota = await getFirecrawlQuotaStatus(tenantId);
    if (!quota.allowed) {
      return res.status(429).json({ ...firecrawlError('quota_exhausted'), quota, correlationId });
    }

    const actorUserId = resolveActorUserId(req);
    console.info('[firecrawl.scrape.request]', { correlationId, tenantId, url, route: '/api/firecrawl/scrape' });
    await writeFirecrawlAudit(pool, tenantId, actorUserId, 'firecrawl_scrape_requested', { correlationId, url });

    const data = await firecrawlScrape(url);
    if (!hasScrapeContent(data)) {
      return res.status(422).json(firecrawlError('normalization_failed', 'Scrape returned no usable content.'));
    }

    const evidenceDocumentId = await persistAndIndexScrape({ tenantId, correlationId, url, data });

    await recordSuccessfulFirecrawlScrape(tenantId, 1);
    const updatedQuota = await getFirecrawlQuotaStatus(tenantId);
    console.info('[firecrawl.scrape.success]', { correlationId, tenantId, url, quotaRemaining: updatedQuota.remaining });
    await writeFirecrawlAudit(pool, tenantId, actorUserId, 'firecrawl_scrape_succeeded', {
      correlationId,
      url,
      quotaRemaining: updatedQuota.remaining,
    });

    return res.json({ success: true, data, quota: updatedQuota, correlationId, evidenceDocumentId, cached: false });
  } catch (error: any) {
    return res.status(502).json(firecrawlError('provider_error', error?.message));
  }
});

export default router;
