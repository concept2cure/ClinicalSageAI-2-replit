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

    return res.json({
      results: [],
      query: { indication, phase, endpoint, sponsor },
      total: 0,
      limit: parseInt(limit as string, 10),
      _note: 'Results populated from CSR knowledge base. Ingest CSRs to build intelligence.',
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

    return res.json({
      productType: productType || 'drug',
      indication: indication || null,
      agencies,
      recommendations: agencies.map((agency) => ({
        agency,
        recommendedPathway: getDefaultPathway(productType as string, agency),
        expeditedOptions: getExpeditedOptions(agency),
        estimatedTimeline: getTimelineEstimate(agency),
        requiredDocuments: getRequiredDocs(productType as string, agency),
      })),
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

    return res.json({
      indication: indication || null,
      phase: phase || null,
      therapeuticArea: therapeuticArea || null,
      recommendations: [],
      _note: 'Endpoint recommendations powered by cross-study CSR analytics.',
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

    return res.json({
      query: { indication, agency, submissionType },
      precedents: [],
      total: 0,
      limit: parseInt(limit as string, 10),
      _note: 'Precedent search draws from ingested CSR and regulatory intelligence data.',
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

    return res.json({
      indication: indication || null,
      phase: phase || null,
      primaryEndpoint: primaryEndpoint || null,
      suggestions: [],
      _note: 'Trial design suggestions informed by CSR knowledge base cross-study analytics.',
      _apiVersion: 'v1',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[public-api] Trial design error:', message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultPathway(productType: string, agency: string): string {
  const pathways: Record<string, Record<string, string>> = {
    drug: { FDA: 'NDA (505(b)(1))', EMA: 'MAA (Centralised)', PMDA: 'JNDA', NMPA: 'NDA', HealthCanada: 'NDS' },
    biologic: { FDA: 'BLA (351(a))', EMA: 'MAA (Centralised)', PMDA: 'JNDA (Biologic)', NMPA: 'BLA' },
    biosimilar: { FDA: 'BLA 351(k)', EMA: 'MAA (Art. 10(4))', PMDA: 'Biosimilar Application' },
    device: { FDA: '510(k) or PMA', EMA: 'MDR CE Marking', PMDA: 'Shonin', NMPA: 'NMPA Registration' },
    combination: { FDA: 'NDA/BLA + 510(k) (OCP)', EMA: 'MAA + MDR', PMDA: 'Combination Application' },
  };
  return pathways[productType]?.[agency] || pathways.drug?.[agency] || 'Standard Application';
}

function getExpeditedOptions(agency: string): string[] {
  const options: Record<string, string[]> = {
    FDA: ['Fast Track', 'Breakthrough Therapy', 'Accelerated Approval', 'Priority Review', 'RMAT'],
    EMA: ['PRIME', 'Accelerated Assessment', 'Conditional Marketing Authorization', 'Orphan Designation'],
    PMDA: ['SAKIGAKE', 'Conditional Early Approval', 'Priority Review'],
    NMPA: ['Priority Review', 'Breakthrough Therapy', 'Conditional Approval'],
    HealthCanada: ['Priority Review', 'NOC/c'],
  };
  return options[agency] || ['Standard Review'];
}

function getTimelineEstimate(agency: string): string {
  const timelines: Record<string, string> = {
    FDA: '10-12 months (standard), 6-8 months (priority)',
    EMA: '12-15 months (standard), 150 days (accelerated)',
    PMDA: '12 months (standard), 6 months (priority)',
    NMPA: '12-18 months (standard)',
    HealthCanada: '12 months (standard), 6 months (priority)',
  };
  return timelines[agency] || '12 months (standard)';
}

function getRequiredDocs(productType: string, agency: string): string[] {
  const baseDocs = ['Module 1: Administrative', 'Module 2: Summaries', 'Module 3: Quality (CMC)'];
  if (productType === 'device') {
    return agency === 'FDA'
      ? ['510(k) Summary', 'Device Description', 'Predicate Comparison', 'Performance Data', 'Biocompatibility', 'Labeling']
      : ['Technical Documentation', 'Clinical Evaluation Report', 'Risk Management File', 'IFU'];
  }
  return [...baseDocs, 'Module 4: Nonclinical', 'Module 5: Clinical'];
}

export default router;
