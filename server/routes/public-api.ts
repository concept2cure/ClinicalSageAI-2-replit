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
import { recordUsage } from '../services/usage-metering.js';
import { csrSearchService } from '../services/csr-search-service.js';
import { getRegulatoryPathwayIntelligence } from '../services/regulatory-pathway-intelligence.js';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service.js';
import { precedentEngine } from '../services/precedent-engine.js';

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

// Apply API key auth to all routes
router.use(requireApiKey);

// ============================================================================
// GET /api/v1/csr/search — Search CSR Knowledge Base
// ============================================================================

router.get('/csr/search', requireScope('csr:read'), async (req: ApiRequest, res: Response) => {
  try {
    const { indication, phase, endpoint, sponsor, limit = '20' } = req.query;

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
      query_text: endpoint as string || sponsor as string,
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      results: searchResults.csrs,
      query: { indication, phase, endpoint, sponsor },
      total: searchResults.results_count,
      limit: parseInt(limit as string, 10),
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

router.get('/regulatory/pathways', requireScope('regulatory:read'), async (req: ApiRequest, res: Response) => {
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

router.get('/endpoints/recommend', requireScope('endpoints:read'), async (req: ApiRequest, res: Response) => {
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

router.get('/precedent/search', requireScope('precedent:read'), async (req: ApiRequest, res: Response) => {
  try {
    const { indication, agency, submissionType, limit = '10' } = req.query;

    if (req.apiOrganizationId) {
      recordUsage(req.apiOrganizationId, 0, 'api_precedent_search', 1, {
        apiKeyId: req.apiKeyId,
      }).catch(() => {});
    }

    const precedents = await precedentEngine.search({
      indication: indication as string,
      submissionType: (submissionType as string) || 'NDA',
      query: indication as string,
      limit: parseInt(limit as string, 10),
    });

    return res.json({
      query: { indication, agency, submissionType },
      precedents,
      total: precedents.length,
      limit: parseInt(limit as string, 10),
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

router.get('/trial-design/suggest', requireScope('trial-design:read'), async (req: ApiRequest, res: Response) => {
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
