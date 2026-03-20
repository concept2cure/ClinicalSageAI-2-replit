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
 *
 * @module server/routes/public-api
 */

import { Router, Request, Response, NextFunction } from 'express';
import { validateApiKey } from '../services/api-key-service.js';
import { recordUsage, checkQuota } from '../services/usage-metering.js';
import { csrSearchService } from '../services/csr-search-service.js';
import { getRegulatoryPathwayIntelligence } from '../services/regulatory-pathway-intelligence.js';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service.js';
import { precedentEngine } from '../services/precedent-engine.js';

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

  const result = await validateApiKey(rawKey);

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

  req.apiOrganizationId = result.organizationId;
  req.apiScopes = result.scopes;
  req.apiKeyId = result.keyId;
  next();
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
      console.warn('[public-api] Quota check failed for org', req.apiOrganizationId, featureId);
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
    endpoints: 5,
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
      scopes: ['csr:read', 'regulatory:read', 'endpoints:read', 'precedent:read', 'trial-design:read', 'documents:read'],
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

// Log every authenticated API request for observability
router.use((req: ApiRequest, _res: Response, next: NextFunction) => {
  console.log(
    `[public-api] ${req.method} ${req.path} org=${req.apiOrganizationId} key=${req.apiKeyId}`,
  );
  next();
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
      }).catch(() => {});
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
    console.error('[public-api] CSR search error:', message);
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
      }).catch(() => {});
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
    console.error('[public-api] Regulatory pathways error:', message);
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
      }).catch(() => {});
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
    console.error('[public-api] Endpoint recommend error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/precedent/search — Regulatory Precedent Search
// ============================================================================

router.get('/precedent/search', requireScope('precedent:read'), requireQuota('api_precedent_search'), async (req: ApiRequest, res: Response) => {
  try {
    const indication = sanitizeQueryParam(req.query.indication);
    const agency = sanitizeQueryParam(req.query.agency);
    const submissionType = sanitizeQueryParam(req.query.submissionType);
    const limit = parsePositiveInt(req.query.limit, 10, 50);

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_precedent_search', 1, {
        apiKeyId: req.apiKeyId,
      }).catch(() => {});
    }

    const precedents = await precedentEngine.search({
      indication: indication as string,
      submissionType: submissionType || 'NDA',
      query: indication as string,
      limit,
    });

    return res.json({
      query: { indication, agency, submissionType },
      precedents,
      total: precedents.length,
      limit,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[public-api] Precedent search error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// GET /api/v1/trial-design/suggest — Trial Design Suggestions
// ============================================================================

router.get('/trial-design/suggest', requireScope('trial-design:read'), requireQuota('api_trial_design'), async (req: ApiRequest, res: Response) => {
  try {
    const { indication, phase, primaryEndpoint } = req.query;

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_trial_design', 1, {
        apiKeyId: req.apiKeyId,
      }).catch(() => {});
    }

    // Combine precedent strategy + endpoint recommendations for trial design suggestions
    const [strategy, endpointRecs] = await Promise.all([
      precedentEngine.recommendStrategy({
        submissionType: 'NDA',
        indication: indication as string,
        query: primaryEndpoint as string,
      }),
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
      strategy,
      recommendedEndpoints: endpointRecs,
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[public-api] Trial design error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
