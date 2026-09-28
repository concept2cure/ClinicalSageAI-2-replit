/**
 * Public API Routes — External Programmatic Access
 *
 * These endpoints are authenticated via API key (X-API-Key header) rather than JWT.
 * Each endpoint requires a specific scope on the API key.
 *
 * Endpoints:
 *   GET /api/v1/csr/search              Search CSR knowledge base
 *   GET /api/v1/regulatory/pathways      Get regulatory pathway recommendations
 *   GET /api/v1/endpoints/recommend      Get endpoint recommendations
 *   GET /api/v1/precedent/search         Search regulatory precedents
 *   GET /api/v1/trial-design/suggest     Get trial design suggestions
 *   GET /api/v1/documents                List vault document metadata
 *   GET /api/v1/documents/:id            Fetch one vault document's metadata
 *
 * @module server/routes/public-api
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/api-key-service.js';
import {
  decisionPermitsMethod,
  getTenantAccessPosture,
} from '../services/tenant/tenant-lifecycle.js';
import { enforceStorageQuota } from '../middleware/storageQuotaGuard.js';
// Centralized, fleet-wide scope guard (server/middleware/enterprise-security.ts).
// Imported as requireApiScope to avoid colliding with the legacy single-scope
// helper below. Demonstrates the shared mechanism on the two most sensitive
// endpoints; see usage at /precedent/search and /trial-design/suggest.
import { requireScope as requireApiScope } from '../middleware/enterprise-security.js';
import { recordUsage, checkQuota } from '../services/usage-metering.js';
import { checkWeeklyLimit, recordWeeklyAlerts, recordOverageUnits } from '../services/weekly-usage-limits.js';
import { csrSearchService } from '../services/csr-search-service.js';
import { getRegulatoryPathwayIntelligence } from '../services/regulatory-pathway-intelligence.js';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service.js';
import { precedentEngine } from '../services/precedent-engine.js';
import { createScopedLogger } from '../utils/logger.js';
import { runWithTenantScope } from '../db/tenantStore';
import { API_KEY_SCOPES } from '../../shared/schema/api-keys.js';
import {
  listVaultDocuments,
  getVaultDocument,
  isUuid,
  VaultStoreUnavailableError,
  VAULT_CLASSIFICATIONS,
  VAULT_PROCESSING_STATUSES,
} from '../services/vault/vault-document-index.service.js';

const log = createScopedLogger('public-api');

// In-memory sliding window rate limiter per API key
const rateLimitWindows = new Map<number, { count: number; resetAt: number }>();

// Periodic cleanup of expired rate limit windows (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [keyId, window] of rateLimitWindows) {
    if (now >= window.resetAt) {
      rateLimitWindows.delete(keyId);
    }
  }
}, 300_000);

const router = Router();

// ============================================================================
// API KEY AUTH MIDDLEWARE
// ============================================================================

interface ApiRequest extends Request {
  apiOrganizationId?: number;
  apiScopes?: string[];
  apiKeyId?: number;
}

async function requireApiKey(req: ApiRequest, res: Response, next: NextFunction) {
  const rawKey = req.headers['x-api-key'] as string;

  if (!rawKey) {
    return res.status(401).json({
      error: 'API key required',
      message: 'Provide your API key in the X-API-Key header',
      docs: '/api/v1/docs',
    });
  }

  const result = await runWithTenantScope(
    {
      tenantId: '0',
      role: 'app_super_admin',
      source: 'request',
      caller: 'public-api:key-resolution',
    },
    () => validateApiKey(rawKey)
  );

  if (!result.valid) {
    return res.status(401).json({
      error: 'Invalid API key',
      reason: result.reason,
    });
  }

  // Sliding window rate limit: 60 requests per minute per API key
  const keyId = result.keyId!;
  const now = Date.now();
  const WINDOW_MS = 60_000;
  const MAX_REQUESTS = 60;

  let window = rateLimitWindows.get(keyId);
  if (!window || now >= window.resetAt) {
    window = { count: 0, resetAt: now + WINDOW_MS };
    rateLimitWindows.set(keyId, window);
  }

  window.count++;

  // Set rate limit headers on every response
  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - window.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(window.resetAt / 1000));

  if (window.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Maximum ${MAX_REQUESTS} requests per minute. Retry after ${Math.ceil((window.resetAt - now) / 1000)}s.`,
      retryAfter: Math.ceil((window.resetAt - now) / 1000),
    });
  }

  // ── Tenant lifecycle ────────────────────────────────────────────────────────
  // `/api/v1` is on PUBLIC_API_ALLOWLIST (middleware/authBoundary.ts) precisely
  // because it authenticates with X-API-Key rather than a session — which means
  // it never reaches `enforceTenantLifecycle`. Without this check the guard
  // covers the session surface and leaves a hole exactly the shape of the public
  // API: an organization suspended for non-payment, a terminated contract, or a
  // security incident kept full programmatic read AND write access, using a key
  // that is itself still 'active' because key status and ORGANISATION status are
  // different facts. `validateApiKey` only ever checked the former.
  //
  // Deliberately NOT a carve-out like billing: there is no equivalent of "you
  // must be able to reach checkout" here. A suspended tenant's integration
  // should stop, and stop visibly, with a machine-readable code its client can
  // branch on rather than a bare 403.
  const posture = await getTenantAccessPosture(result.organizationId!);
  if (!posture) {
    // Fail closed, matching the session path. A suspension must not lapse
    // because a lookup failed.
    return res.status(503).json({
      error: 'TENANT_STATE_UNVERIFIED',
      message: 'Organization status could not be verified. Please retry shortly.',
    });
  }
  if (!decisionPermitsMethod(posture.decision, req.method)) {
    return res.status(403).json({
      error: posture.code,
      message: posture.reason,
      tenantState: posture.state,
    });
  }

  req.apiOrganizationId = result.organizationId;
  req.apiScopes = result.scopes;
  req.apiKeyId = result.keyId;
  // Mark the request as API-key authenticated so the shared requireApiScope
  // guard (server/middleware/enterprise-security.ts) engages. Every route on
  // this router reaches handlers only via this middleware, so the flag is
  // always set before any requireApiScope check runs.
  (req as Request).authMethod = 'api_key';
  return runWithTenantScope(
    {
      tenantId: String(result.organizationId),
      role: 'api_key',
      source: 'request',
      caller: req.path,
    },
    next
  );
}

function requireScope(scope: string) {
  return (req: ApiRequest, res: Response, next: NextFunction) => {
    if (!req.apiScopes?.includes(scope)) {
      return res.status(403).json({
        error: 'Insufficient scope',
        required: scope,
        available: req.apiScopes,
      });
    }
    next();
  };
}

function requireQuota(featureId: string) {
  return async (req: ApiRequest, res: Response, next: NextFunction) => {
    if (!req.apiOrganizationId) {
      return next();
    }

    try {
      const quota = await checkQuota(req.apiOrganizationId, featureId);
      if (!quota.allowed) {
        return res.status(403).json({
          error: 'Quota exceeded',
          feature: featureId,
          remaining: quota.remaining,
          limit: quota.limit,
          upgradeRequired: quota.upgradeRequired || null,
          message: quota.limit === 0
            ? `This feature requires a ${quota.upgradeRequired || 'paid'} plan.`
            : 'Monthly quota exhausted. Upgrade your plan or wait for the next billing cycle.',
        });
      }
    } catch {
      // Quota check failure should not block the request — log and continue
      log.warn('[public-api] Quota check failed for org', {
        organizationId: req.apiOrganizationId,
        featureId,
      });
    }

    next();
  };
}

// ============================================================================
// PUBLIC ENDPOINTS (no auth required)
// ============================================================================

router.get('/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'healthy',
    service: 'ClinicalSageAI Public API',
    version: 'v1',
    timestamp: new Date().toISOString(),
    endpoints: 7,
  });
});

router.get('/docs', (_req: Request, res: Response) => {
  return res.json({
    service: 'ClinicalSageAI Public API',
    version: 'v1',
    authentication: {
      method: 'API Key',
      header: 'X-API-Key',
      format: 'csai_<key>',
      /* The GRANTABLE list itself, not a copy of it. A hand-maintained copy is
         how `documents:read` came to be advertised here while no route
         required it: the two lists could disagree, and nothing compared them.
         Derived, they cannot — and the test in
         server/routes/__tests__/public-api-documents.test.ts asserts the
         remaining half, that every scope advertised here is required by an
         endpoint listed below. */
      scopes: [...API_KEY_SCOPES],
    },
    endpoints: [
      {
        path: '/api/v1/csr/search',
        method: 'GET',
        scope: 'csr:read',
        description: 'Search the CSR knowledge base — clinical study reports harvested from global regulatory repositories',
        parameters: {
          indication: { type: 'string', description: 'Disease/condition (e.g., "non-small cell lung cancer")' },
          phase: { type: 'string', description: 'Clinical trial phase (e.g., "Phase 3")' },
          endpoint: { type: 'string', description: 'Clinical endpoint to filter by' },
          sponsor: { type: 'string', description: 'Sponsor company name' },
          limit: { type: 'number', default: 20, description: 'Max results to return' },
        },
      },
      {
        path: '/api/v1/regulatory/pathways',
        method: 'GET',
        scope: 'regulatory:read',
        description: 'Get regulatory pathway recommendations across global agencies (FDA, EMA, PMDA, NMPA, Health Canada)',
        parameters: {
          productType: { type: 'string', enum: ['drug', 'biologic', 'biosimilar', 'device', 'generic', 'combination'], default: 'drug' },
          indication: { type: 'string', description: 'Target indication' },
          targetAgencies: { type: 'string', description: 'Comma-separated agency codes (e.g., "FDA,EMA")' },
        },
      },
      {
        path: '/api/v1/endpoints/recommend',
        method: 'GET',
        scope: 'endpoints:read',
        description: 'Get clinical endpoint recommendations powered by cross-study analytics',
        parameters: {
          indication: { type: 'string', description: 'Disease/condition' },
          phase: { type: 'string', description: 'Trial phase' },
          therapeuticArea: { type: 'string', description: 'Therapeutic area' },
        },
      },
      {
        path: '/api/v1/precedent/search',
        method: 'GET',
        scope: 'precedent:read',
        description: 'Search regulatory precedents — historical submission outcomes, approval decisions, and deficiency patterns',
        parameters: {
          indication: { type: 'string', description: 'Disease/condition' },
          agency: { type: 'string', description: 'Regulatory agency' },
          submissionType: { type: 'string', description: 'Submission type (NDA, BLA, 510k, etc.)' },
          limit: { type: 'number', default: 10, description: 'Max results to return' },
        },
      },
      {
        path: '/api/v1/trial-design/suggest',
        method: 'GET',
        scope: 'trial-design:read',
        description: 'Get trial design suggestions combining precedent intelligence with endpoint analytics',
        parameters: {
          indication: { type: 'string', description: 'Disease/condition' },
          phase: { type: 'string', description: 'Trial phase' },
          primaryEndpoint: { type: 'string', description: 'Primary endpoint under consideration' },
        },
      },
      {
        path: '/api/v1/documents',
        method: 'GET',
        scope: 'documents:read',
        description: 'List vault document metadata for your organization. Metadata only — this endpoint never returns document bytes or extracted text, and never discloses storage addressing.',
        parameters: {
          programId: { type: 'string', description: 'Filter to one regulatory program (UUID)' },
          documentType: { type: 'string', description: 'Filter by document type' },
          // From the schema enums, not a restated copy: a value documented here
          // that the column does not accept is a lie in the API's own manual.
          classification: { type: 'string', enum: VAULT_CLASSIFICATIONS, description: 'Filter by confidentiality classification' },
          processingStatus: { type: 'string', enum: VAULT_PROCESSING_STATUSES, description: 'Filter by ingest processing status' },
          ctdSection: { type: 'string', description: 'Filter by assigned CTD section code (e.g. "3.2.P.5")' },
          limit: { type: 'number', default: 50, description: 'Page size, maximum 200' },
          offset: { type: 'number', default: 0, description: 'Page offset' },
        },
      },
      {
        path: '/api/v1/documents/:id',
        method: 'GET',
        scope: 'documents:read',
        description: 'Fetch metadata for one vault document by UUID. Returns 404 both when no such document exists and when it belongs to another organization.',
        parameters: {
          id: { type: 'string', description: 'Document UUID (path parameter)' },
        },
      },
    ],
    rateLimit: {
      default: '60 requests/minute per API key',
      configurable: true,
    },
  });
});

// ============================================================================
// REQUEST LOGGING & INPUT SANITIZATION
// ============================================================================

function sanitizeQueryParam(value: unknown, maxLen = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  const str = String(value).trim();
  if (str.length === 0) return undefined;
  // Truncate excessively long inputs
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function parsePositiveInt(value: unknown, defaultVal: number, max = 100): number {
  const num = parseInt(String(value), 10);
  if (isNaN(num) || num < 1) return defaultVal;
  return Math.min(num, max);
}

// Apply API key auth to all subsequent routes
router.use(requireApiKey);

// Storage quota. `/api/v1` has no content-bearing write route TODAY, so this is
// a no-op on every current path — mounted anyway, and deliberately.
//
// The lifecycle guard above had to be retrofitted onto this router after the
// session surface was already covered, because a key-authenticated transport is
// invisible to a guard mounted in the auth chain. Mounting the storage guard now
// means the first `/api/v1` upload route is metered by construction rather than
// by whoever writes it remembering. The guard evaluates only multipart /
// octet-stream / large bodies, so it costs nothing on the JSON routes here.
router.use(enforceStorageQuota);

// Log every authenticated API request for observability
router.use((req: ApiRequest, _res: Response, next: NextFunction) => {
  log.debug(
    `[public-api] ${req.method} ${req.path} org=${req.apiOrganizationId} key=${req.apiKeyId}`,
  );
  next();
});

// Enforce the per-org WEEKLY request limit + overage cap (opt-in; orgs with no
// configured limit pass straight through). Fails open on a metering error so a
// monitoring outage never blocks the API. Per-feature monthly quotas are still
// enforced separately by requireQuota() on each route.
router.use((req: ApiRequest, res: Response, next: NextFunction) => {
  const orgId = req.apiOrganizationId;
  if (orgId == null) {
    next();
    return;
  }
  checkWeeklyLimit(orgId, 'requests', 1)
    .then((decision) => {
      res.setHeader('X-Weekly-State', decision.state);
      if (Number.isFinite(decision.weeklyLimit)) res.setHeader('X-Weekly-Limit', String(decision.weeklyLimit));
      res.setHeader('X-Weekly-Used', String(decision.used));
      res.setHeader('X-Weekly-Reset', decision.resetAt.toISOString());
      if (decision.state === 'warn' || decision.state === 'overage' || decision.state === 'blocked') {
        void recordWeeklyAlerts(orgId, decision);
      }
      if (!decision.allowed) {
        const retrySecs = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retrySecs));
        res.status(429).json({
          error: 'Weekly usage limit reached',
          code: 'WEEKLY_LIMIT_EXCEEDED',
          metric: 'requests',
          used: decision.used,
          limit: decision.weeklyLimit,
          cap: decision.effectiveCap,
          resetAt: decision.resetAt.toISOString(),
        });
        return;
      }
      if (decision.state === 'overage') {
        req.weeklyOverage = decision;
        void recordOverageUnits(orgId, decision);
      }
      next();
    })
    .catch((err: unknown) => {
      log.error('[public-api] weekly limit check failed (fail-open)', {
        err: err instanceof Error ? err.message : String(err),
      });
      next();
    });
});

// ============================================================================
// GET /api/v1/csr/search — Search CSR Knowledge Base
// ============================================================================

router.get('/csr/search', requireScope('csr:read'), requireQuota('api_csr_search'), async (req: ApiRequest, res: Response) => {
  try {
    const indication = sanitizeQueryParam(req.query.indication);
    const phase = sanitizeQueryParam(req.query.phase);
    const endpoint = sanitizeQueryParam(req.query.endpoint);
    const sponsor = sanitizeQueryParam(req.query.sponsor);
    const limit = parsePositiveInt(req.query.limit, 20, 100);

    // Record usage
    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_csr_search', 1, {
        apiKeyId: req.apiKeyId,
        query: { indication, phase, endpoint, sponsor },
      }).catch((err: unknown) => {
        log.error('[public-api] recordUsage failed (api_csr_search)', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const searchResults = await csrSearchService.searchCSRs({
      indication: indication as string,
      phase: phase as string,
      query_text: endpoint || sponsor || '',
      limit,
    });

    return res.json({
      results: searchResults.csrs,
      query: { indication, phase, endpoint, sponsor },
      total: searchResults.results_count,
      limit,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[public-api] CSR search error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/regulatory/pathways — Regulatory Pathway Recommendations
// ============================================================================

router.get('/regulatory/pathways', requireScope('regulatory:read'), requireQuota('api_regulatory_pathways'), async (req: ApiRequest, res: Response) => {
  try {
    const { productType, indication, targetAgencies } = req.query;

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_regulatory_pathways', 1, {
        apiKeyId: req.apiKeyId,
      }).catch((err: unknown) => {
        log.error('[public-api] recordUsage failed (api_regulatory_pathways)', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const agencies = targetAgencies
      ? (targetAgencies as string).split(',').map((a) => a.trim())
      : ['FDA'];

    const engine = getRegulatoryPathwayIntelligence();
    const recommendations = engine.recommendPathway({
      productType: (productType as 'drug' | 'biologic' | 'device' | 'biosimilar' | 'generic' | 'combination') || 'drug',
      indication: (indication as string) || 'general',
      targetAgencies: agencies,
    });

    return res.json({
      productType: productType || 'drug',
      indication: indication || null,
      agencies,
      recommendations,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[public-api] Regulatory pathways error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/endpoints/recommend — Endpoint Recommendations
// ============================================================================

router.get('/endpoints/recommend', requireScope('endpoints:read'), requireQuota('api_endpoint_recommend'), async (req: ApiRequest, res: Response) => {
  try {
    const { indication, phase, therapeuticArea } = req.query;

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_endpoint_recommend', 1, {
        apiKeyId: req.apiKeyId,
      }).catch((err: unknown) => {
        log.error('[public-api] recordUsage failed (api_endpoint_recommend)', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const recommender = getEndpointRecommenderService();
    const recommendations = await recommender.getComprehensiveEndpointRecommendations(
      (indication as string) || 'general',
      phase as string,
      10,
      therapeuticArea as string,
    );

    return res.json({
      indication: indication || null,
      phase: phase || null,
      therapeuticArea: therapeuticArea || null,
      recommendations,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[public-api] Endpoint recommend error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/precedent/search — Regulatory Precedent Search
// ============================================================================

// Sensitive: exposes historical regulatory submission outcomes / deficiency
// patterns. Guarded by the shared fleet-wide requireApiScope in addition to
// the legacy local requireScope (defense in depth — both must pass).
router.get('/precedent/search', requireApiScope('precedent:read'), requireScope('precedent:read'), requireQuota('api_precedent_search'), async (req: ApiRequest, res: Response) => {
  try {
    const indication = sanitizeQueryParam(req.query.indication);
    const agency = sanitizeQueryParam(req.query.agency);
    const submissionType = sanitizeQueryParam(req.query.submissionType);
    const limit = parsePositiveInt(req.query.limit, 10, 50);

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_precedent_search', 1, {
        apiKeyId: req.apiKeyId,
      }).catch((err: unknown) => {
        log.error('[public-api] recordUsage failed (api_precedent_search)', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    let precedents = await precedentEngine.search({
      indication: indication as string,
      submissionType: submissionType || 'NDA',
      query: indication as string,
      limit: limit * 2, // Over-fetch to allow agency filtering
    });

    // Filter by agency if provided
    if (agency) {
      precedents = precedents.filter((p: any) =>
        !p.agency || p.agency.toLowerCase().includes((agency as string).toLowerCase())
      );
    }
    precedents = precedents.slice(0, limit);

    return res.json({
      query: { indication, agency, submissionType },
      precedents,
      total: precedents.length,
      limit,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[public-api] Precedent search error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/trial-design/suggest — Trial Design Suggestions
// ============================================================================

// Sensitive: synthesizes precedent strategy + endpoint analytics into trial
// design guidance. Guarded by the shared fleet-wide requireApiScope plus the
// legacy local requireScope (both must pass).
router.get('/trial-design/suggest', requireApiScope('trial-design:read'), requireScope('trial-design:read'), requireQuota('api_trial_design'), async (req: ApiRequest, res: Response) => {
  try {
    const { indication, phase, primaryEndpoint, submissionType } = req.query;
    const resolvedSubmissionType = sanitizeQueryParam(submissionType) || 'NDA';

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_trial_design', 1, {
        apiKeyId: req.apiKeyId,
      }).catch((err: unknown) => {
        log.error('[public-api] recordUsage failed (api_trial_design)', {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Combine precedent strategy + endpoint recommendations for trial design suggestions
    const [strategy, endpointRecs] = await Promise.all([
      precedentEngine.recommendStrategy({
        submissionType: resolvedSubmissionType,
        indication: indication as string,
        query: primaryEndpoint as string,
      }, req.apiOrganizationId ?? undefined),
      getEndpointRecommenderService().getComprehensiveEndpointRecommendations(
        (indication as string) || 'general',
        phase as string,
        5,
      ),
    ]);

    return res.json({
      indication: indication || null,
      phase: phase || null,
      primaryEndpoint: primaryEndpoint || null,
      submissionType: resolvedSubmissionType,
      strategy,
      recommendedEndpoints: endpointRecs,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('[public-api] Trial design error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// DOCUMENTS — VAULT DOCUMENT INDEX (METADATA ONLY)
// ============================================================================

/**
 * `documents:read` was grantable, offered in the admin key editor, and listed
 * in this file's own /docs response — and enforced by NO route. An operator
 * could tick it, hand the key to an integrator, and reasonably believe
 * programmatic document access was switched on; the integrator had nothing to
 * call, and no error explained why, because there was no endpoint to receive
 * the call. These two routes are what the scope always claimed to grant.
 *
 * The read model, the disclosable column list, the tenant predicate and the
 * reasons behind each are in
 * server/services/vault/vault-document-index.service.ts. In short: metadata
 * only — never bytes, never `extracted_text`, never storage addressing — and
 * tenancy enforced by joining through `regulatory_programs` rather than
 * trusting the nullable `vault.documents.organization_id`.
 *
 * Guarded by the shared fleet-wide requireApiScope plus the legacy local
 * requireScope (both must pass), matching the treatment of the other sensitive
 * endpoints on this router.
 */

function resolveApiOrg(req: ApiRequest, res: Response): number | undefined {
  const organizationId = req.apiOrganizationId;
  if (!organizationId) {
    // requireApiKey always sets this. Refuse rather than run a query whose
    // tenant predicate would be parameterised with undefined.
    res.status(403).json({
      error: 'ORGANIZATION_UNRESOLVED',
      message: 'No organization is associated with this API key.',
    });
    return undefined;
  }
  return organizationId;
}

function meterDocumentRead(req: ApiRequest): void {
  if (!req.apiOrganizationId) return;
  recordUsage(req.apiOrganizationId, 0, 'api_documents_list', 1, {
    apiKeyId: req.apiKeyId,
  }).catch((err: unknown) => {
    log.error('[public-api] recordUsage failed (api_documents_list)', {
      err: err instanceof Error ? err.message : String(err),
    });
  });
}

/** A vault schema this environment never provisioned is a 503, never an empty
 *  page. Rendering it as `documents: []` would report an infrastructure fault
 *  as "this organization has no documents". */
function handleDocumentError(error: unknown, res: Response, label: string): Response {
  if (error instanceof VaultStoreUnavailableError) {
    log.error(`[public-api] ${label}: vault store unavailable`, { code: error.code });
    return res.status(503).json({
      error: 'VAULT_STORE_UNAVAILABLE',
      message: 'The document store is not available in this environment. This is not an empty result.',
    });
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  log.error(`[public-api] ${label} error:`, message);
  return res.status(500).json({ error: 'Internal server error' });
}

router.get(
  '/documents',
  requireApiScope('documents:read'),
  requireScope('documents:read'),
  requireQuota('api_documents_list'),
  async (req: ApiRequest, res: Response) => {
    const organizationId = resolveApiOrg(req, res);
    if (organizationId === undefined) return res;

    const limit = parsePositiveInt(req.query.limit, 50, 200);
    const rawOffset = parseInt(String(req.query.offset ?? '0'), 10);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.min(rawOffset, 1_000_000) : 0;

    // Validate before binding: program_id is uuid and classification/status are
    // enums, so an unchecked value reaches Postgres as 22P02 and would surface
    // as a 500 for what is really a client error.
    const programId = sanitizeQueryParam(req.query.programId);
    if (programId !== undefined && !isUuid(programId)) {
      return res.status(400).json({ error: 'INVALID_PARAMETER', parameter: 'programId', message: 'programId must be a UUID.' });
    }
    const classification = sanitizeQueryParam(req.query.classification)?.toUpperCase();
    if (classification !== undefined && !VAULT_CLASSIFICATIONS.includes(classification)) {
      return res.status(400).json({ error: 'INVALID_PARAMETER', parameter: 'classification', allowed: VAULT_CLASSIFICATIONS });
    }
    const procStatus = sanitizeQueryParam(req.query.processingStatus)?.toUpperCase();
    if (procStatus !== undefined && !VAULT_PROCESSING_STATUSES.includes(procStatus)) {
      return res.status(400).json({ error: 'INVALID_PARAMETER', parameter: 'processingStatus', allowed: VAULT_PROCESSING_STATUSES });
    }

    try {
      const { documents, total } = await listVaultDocuments({
        organizationId,
        programId,
        classification,
        processingStatus: procStatus,
        documentType: sanitizeQueryParam(req.query.documentType),
        ctdSection: sanitizeQueryParam(req.query.ctdSection),
        limit,
        offset,
      });

      meterDocumentRead(req);

      return res.json({
        documents,
        // The window is reported so a client can tell a short page from the end
        // of the cabinet instead of inferring one from the other.
        page: { limit, offset, returned: documents.length, total },
        _apiVersion: 'v1',
      });
    } catch (error: unknown) {
      return handleDocumentError(error, res, 'Documents list');
    }
  },
);

router.get(
  '/documents/:id',
  requireApiScope('documents:read'),
  requireScope('documents:read'),
  requireQuota('api_documents_list'),
  async (req: ApiRequest, res: Response) => {
    const organizationId = resolveApiOrg(req, res);
    if (organizationId === undefined) return res;

    const id = sanitizeQueryParam(req.params.id);
    if (id === undefined || !isUuid(id)) {
      return res.status(400).json({ error: 'INVALID_PARAMETER', parameter: 'id', message: 'Document id must be a UUID.' });
    }

    try {
      const document = await getVaultDocument(organizationId, id);

      // One 404 for "no such document" and for "not yours" alike: a distinct
      // response for the second confirms the id exists in another tenant.
      if (!document) {
        return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', id });
      }

      meterDocumentRead(req);
      return res.json({ document, _apiVersion: 'v1' });
    } catch (error: unknown) {
      return handleDocumentError(error, res, 'Document fetch');
    }
  },
);

export default router;
