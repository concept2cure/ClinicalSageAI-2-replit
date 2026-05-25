/**
 * Data Lineage API Routes — Multi-Perspective Lineage Reports
 *
 * Provides regulatory-grade endpoints for querying and reporting
 * on data lineage across all modules. Supports:
 *
 *   - Upstream/downstream trace (graph traversal)
 *   - Coverage analysis (% of content with source attribution)
 *   - Cross-module dependency map
 *   - Evidence chain justification
 *   - Integrity verification
 *   - Organization/project summary statistics
 *
 * All endpoints are tenant-scoped and require authentication.
 *
 * @module server/routes/data-lineage
 */
import { Router, Request, Response } from 'express';
import {
  traceUpstream,
  traceDownstream,
  getLineageCoverage,
  getCrossModuleReport,
  getEvidenceChainReport,
  checkLineageIntegrity,
  getLineageSummary,
} from '../services/data-lineage-service';
import { authMiddleware } from '../auth';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('data-lineage');

const router = Router();
router.use(authMiddleware);

// ═══════════════════════════════════════════════════════════════════════════════
// TRACE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/trace/upstream/:objectType/:objectId
 *
 * Walk the lineage graph backward: "Where did this object's data come from?"
 * Returns a DAG of all upstream sources with linkage types and confidence.
 */
router.get('/trace/upstream/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const { objectType, objectId } = req.params;
    const maxDepth = Math.min(Number(req.query.maxDepth) || 5, 10);

    const graph = await traceUpstream(orgId, String(objectType), String(objectId), maxDepth);
    res.json({
      success: true,
      data: graph,
      meta: { perspective: 'upstream', maxDepth },
    });
  } catch (err) {
    logger.error('Upstream trace error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to trace upstream lineage' });
  }
});

/**
 * GET /api/data-lineage/trace/downstream/:objectType/:objectId
 *
 * Walk the lineage graph forward: "Where was this source data used?"
 * Returns a DAG of all downstream targets with linkage types.
 */
router.get('/trace/downstream/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const { objectType, objectId } = req.params;
    const maxDepth = Math.min(Number(req.query.maxDepth) || 5, 10);

    const graph = await traceDownstream(orgId, String(objectType), String(objectId), maxDepth);
    res.json({
      success: true,
      data: graph,
      meta: { perspective: 'downstream', maxDepth },
    });
  } catch (err) {
    logger.error('Downstream trace error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to trace downstream lineage' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// COVERAGE & GAP ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/coverage/:objectType/:objectId
 *
 * Coverage report: "What % of this artifact has source attribution?"
 * Identifies which sections/fields have lineage and which are gaps.
 */
router.get('/coverage/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const { objectType, objectId } = req.params;
    const report = await getLineageCoverage(orgId, String(objectType), String(objectId));
    res.json({
      success: true,
      data: report,
      meta: { perspective: 'coverage' },
    });
  } catch (err) {
    logger.error('Coverage report error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate coverage report' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-MODULE MAP
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/cross-module
 *
 * Cross-module dependency map: which modules share data?
 * Query params: ?projectId=123 (optional, scopes to project)
 */
router.get('/cross-module', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const report = await getCrossModuleReport(orgId, projectId);
    res.json({
      success: true,
      data: report,
      meta: { perspective: 'cross-module' },
    });
  } catch (err) {
    logger.error('Cross-module report error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate cross-module report' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE CHAINS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/evidence/:objectType/:objectId
 *
 * Retrieve all persisted evidence chains for an object.
 * Shows what justified AI-generated content: source chain, confidence, reasoning.
 */
router.get('/evidence/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const { objectType, objectId } = req.params;
    const chains = await getEvidenceChainReport(orgId, String(objectType), String(objectId));
    res.json({
      success: true,
      data: chains,
      meta: {
        perspective: 'evidence-justification',
        totalChains: chains.length,
      },
    });
  } catch (err) {
    logger.error('Evidence chain report error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to retrieve evidence chains' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRITY VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/integrity
 *
 * Organization/project-level integrity check.
 * Verifies that source data hasn't changed since lineage was recorded.
 * Query params: ?projectId=123 (optional)
 */
router.get('/integrity', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const result = await checkLineageIntegrity(orgId, projectId);
    res.json({
      success: true,
      data: result,
      meta: { perspective: 'integrity' },
    });
  } catch (err) {
    logger.error('Integrity check error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to check lineage integrity' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY & STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/data-lineage/summary
 *
 * Organization/project summary: total records, breakdowns by type,
 * confidence distribution, evidence chain count.
 * Query params: ?projectId=123 (optional)
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).organizationId;
    if (!orgId) return res.status(401).json({ error: 'Organization context required' });

    const projectId = req.query.projectId ? Number(req.query.projectId) : undefined;
    const summary = await getLineageSummary(orgId, projectId);
    res.json({
      success: true,
      data: summary,
      meta: { perspective: 'summary' },
    });
  } catch (err) {
    logger.error('Summary error', { err: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Failed to generate lineage summary' });
  }
});

/**
 * GET /api/data-lineage/perspectives
 *
 * Returns the full list of available reporting perspectives
 * and their endpoint documentation.
 */
router.get('/perspectives', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      perspectives: [
        {
          name: 'upstream',
          description: 'Trace backwards — where did data come from?',
          endpoint: 'GET /api/data-lineage/trace/upstream/:objectType/:objectId',
          params: { maxDepth: 'number (1-10, default 5)' },
        },
        {
          name: 'downstream',
          description: 'Trace forward — where was data used?',
          endpoint: 'GET /api/data-lineage/trace/downstream/:objectType/:objectId',
          params: { maxDepth: 'number (1-10, default 5)' },
        },
        {
          name: 'coverage',
          description: 'What % of this object has source attribution?',
          endpoint: 'GET /api/data-lineage/coverage/:objectType/:objectId',
        },
        {
          name: 'cross-module',
          description: 'Which modules share data dependencies?',
          endpoint: 'GET /api/data-lineage/cross-module',
          params: { projectId: 'number (optional)' },
        },
        {
          name: 'evidence-justification',
          description: 'What evidence justified AI-generated content?',
          endpoint: 'GET /api/data-lineage/evidence/:objectType/:objectId',
        },
        {
          name: 'integrity',
          description: 'Has source data changed since it was referenced?',
          endpoint: 'GET /api/data-lineage/integrity',
          params: { projectId: 'number (optional)' },
        },
        {
          name: 'summary',
          description: 'Aggregate lineage statistics',
          endpoint: 'GET /api/data-lineage/summary',
          params: { projectId: 'number (optional)' },
        },
      ],
      totalPerspectives: 7,
      compliance: ['21 CFR Part 11 §11.10(e)', 'ICH E6(R3) §5.5.3', 'EU MDR Annex II §4.1'],
    },
  });
});

export default router;
