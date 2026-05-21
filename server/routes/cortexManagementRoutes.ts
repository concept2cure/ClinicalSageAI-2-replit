/**
 * AnA RI - Management API Routes
 *
 * Comprehensive API for managing the AnA RI knowledge base.
 * Exposes knowledge graph, quality assessment, conflict detection,
 * version history, and administrative functions.
 *
 * @module server/routes/cortexManagementRoutes
 * @version 1.0.0
 * @enterprise true
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createKnowledgeGraphService } from '../services/knowledgeGraphService';
import { createAtomQualityService } from '../services/atomQualityService';
import { createConflictDetectionService } from '../services/conflictDetectionService';
import { createAtomVersionService } from '../services/atomVersionService';

// ═══════════════════════════════════════════════════════════════════════════
//                           ROUTE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createCortexManagementRoutes(pool: Pool): Router {
  const router = Router();

  // Initialize services
  const graphService = createKnowledgeGraphService(pool);
  const qualityService = createAtomQualityService(pool);
  const conflictService = createConflictDetectionService(pool);
  const versionService = createAtomVersionService(pool);

  // ═══════════════════════════════════════════════════════════════════════
  //                      KNOWLEDGE GRAPH ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /api/cortex/graph/stats
   * Get knowledge graph statistics
   */
  router.get('/graph/stats', async (req: Request, res: Response) => {
    try {
      const stats = await graphService.getStatistics();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Graph stats error:', error);
      res.status(500).json({ success: false, error: 'Failed to get graph statistics' });
    }
  });

  /**
   * GET /api/cortex/graph/neighbors/:atomId
   * Get neighbors of an atom in the knowledge graph
   */
  router.get('/graph/neighbors/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const depth = parseInt(req.query.depth as string) || 1;
      const relationshipTypes = req.query.types
        ? (req.query.types as string).split(',')
        : undefined;

      const neighbors = await graphService.getNeighbors(atomId, depth, relationshipTypes as any);

      res.json({
        success: true,
        data: {
          atomId,
          depth,
          neighbors,
          count: neighbors.length,
        },
      });
    } catch (error) {
      console.error('Get neighbors error:', error);
      res.status(500).json({ success: false, error: 'Failed to get neighbors' });
    }
  });

  /**
   * GET /api/cortex/graph/subgraph/:atomId
   * Get a subgraph around an atom
   */
  router.get('/graph/subgraph/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const depth = parseInt(req.query.depth as string) || 2;

      const subgraph = await graphService.getSubgraph(atomId, depth);

      res.json({
        success: true,
        data: subgraph,
      });
    } catch (error) {
      console.error('Get subgraph error:', error);
      res.status(500).json({ success: false, error: 'Failed to get subgraph' });
    }
  });

  /**
   * GET /api/cortex/graph/path
   * Find paths between two atoms
   */
  router.get('/graph/path', async (req: Request, res: Response) => {
    try {
      const { source, target } = req.query;
      const maxDepth = parseInt(req.query.maxDepth as string) || 5;

      if (!source || !target) {
        return res.status(400).json({
          success: false,
          error: 'source and target query parameters required',
        });
      }

      const paths = await graphService.findPaths(source as string, target as string, maxDepth);

      res.json({
        success: true,
        data: {
          source,
          target,
          paths,
          pathCount: paths.length,
        },
      });
    } catch (error) {
      console.error('Find path error:', error);
      res.status(500).json({ success: false, error: 'Failed to find paths' });
    }
  });

  /**
   * POST /api/cortex/graph/build/:atomId
   * Build knowledge graph edges for an atom
   */
  router.post('/graph/build/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const edgeCount = await graphService.buildEdgesForAtom(atomId);

      res.json({
        success: true,
        data: {
          atomId,
          edgesCreated: edgeCount,
        },
      });
    } catch (error) {
      console.error('Build edges error:', error);
      res.status(500).json({ success: false, error: 'Failed to build edges' });
    }
  });

  /**
   * POST /api/cortex/graph/build-all
   * Build knowledge graph for atoms without edges
   */
  router.post('/graph/build-all', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const result = await graphService.buildGraphForAllAtoms(limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Build all edges error:', error);
      res.status(500).json({ success: false, error: 'Failed to build graph' });
    }
  });

  /**
   * POST /api/cortex/graph/edge
   * Create a manual edge between atoms
   */
  router.post('/graph/edge', async (req: Request, res: Response) => {
    try {
      const { sourceAtomId, targetAtomId, relationshipType, relationshipStrength, bidirectional } =
        req.body;

      if (!sourceAtomId || !targetAtomId || !relationshipType) {
        return res.status(400).json({
          success: false,
          error: 'sourceAtomId, targetAtomId, and relationshipType required',
        });
      }

      const edgeId = await graphService.createEdge({
        sourceAtomId,
        targetAtomId,
        relationshipType,
        relationshipStrength: relationshipStrength || 0.8,
        bidirectional: bidirectional !== false,
        extractedFrom: 'manual',
        confidence: 0.9,
      });

      res.json({
        success: true,
        data: { edgeId },
      });
    } catch (error) {
      console.error('Create edge error:', error);
      res.status(500).json({ success: false, error: 'Failed to create edge' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //                      QUALITY ASSESSMENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /api/cortex/quality/distribution
   * Get quality score distribution
   */
  router.get('/quality/distribution', async (req: Request, res: Response) => {
    try {
      const distribution = await qualityService.getQualityDistribution();
      res.json({
        success: true,
        data: distribution,
      });
    } catch (error) {
      console.error('Quality distribution error:', error);
      res.status(500).json({ success: false, error: 'Failed to get quality distribution' });
    }
  });

  /**
   * GET /api/cortex/quality/by-type
   * Get quality breakdown by atom type
   */
  router.get('/quality/by-type', async (req: Request, res: Response) => {
    try {
      const byType = await qualityService.getQualityByType();
      res.json({
        success: true,
        data: byType,
      });
    } catch (error) {
      console.error('Quality by type error:', error);
      res.status(500).json({ success: false, error: 'Failed to get quality by type' });
    }
  });

  /**
   * GET /api/cortex/quality/low-quality
   * Get atoms below quality threshold
   */
  router.get('/quality/low-quality', async (req: Request, res: Response) => {
    try {
      const threshold = parseFloat(req.query.threshold as string) || 0.5;
      const limit = parseInt(req.query.limit as string) || 50;

      const lowQuality = await qualityService.getLowQualityAtoms(threshold, limit);
      res.json({
        success: true,
        data: {
          threshold,
          count: lowQuality.length,
          atoms: lowQuality,
        },
      });
    } catch (error) {
      console.error('Low quality atoms error:', error);
      res.status(500).json({ success: false, error: 'Failed to get low quality atoms' });
    }
  });

  /**
   * POST /api/cortex/quality/assess/:atomId
   * Assess quality of a specific atom
   */
  router.post('/quality/assess/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const report = await qualityService.assessAtom(atomId);

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      console.error('Assess atom error:', error);
      res.status(500).json({ success: false, error: 'Failed to assess atom' });
    }
  });

  /**
   * POST /api/cortex/quality/assess-unscored
   * Assess atoms without quality scores
   */
  router.post('/quality/assess-unscored', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const result = await qualityService.assessUnscored(limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Assess unscored error:', error);
      res.status(500).json({ success: false, error: 'Failed to assess unscored atoms' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //                      CONFLICT DETECTION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /api/cortex/conflicts/stats
   * Get conflict statistics
   */
  router.get('/conflicts/stats', async (req: Request, res: Response) => {
    try {
      const stats = await conflictService.getConflictStatistics();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Conflict stats error:', error);
      res.status(500).json({ success: false, error: 'Failed to get conflict stats' });
    }
  });

  /**
   * GET /api/cortex/conflicts/unresolved
   * Get unresolved conflicts
   */
  router.get('/conflicts/unresolved', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const conflicts = await conflictService.getUnresolvedConflicts(limit);

      res.json({
        success: true,
        data: {
          count: conflicts.length,
          conflicts,
        },
      });
    } catch (error) {
      console.error('Unresolved conflicts error:', error);
      res.status(500).json({ success: false, error: 'Failed to get unresolved conflicts' });
    }
  });

  /**
   * POST /api/cortex/conflicts/detect/:atomId
   * Detect conflicts for a specific atom
   */
  router.post('/conflicts/detect/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const conflicts = await conflictService.detectConflictsForAtom(atomId);

      res.json({
        success: true,
        data: {
          atomId,
          conflictsFound: conflicts.length,
          conflicts,
        },
      });
    } catch (error) {
      console.error('Detect conflicts error:', error);
      res.status(500).json({ success: false, error: 'Failed to detect conflicts' });
    }
  });

  /**
   * POST /api/cortex/conflicts/scan
   * Run full conflict detection scan
   */
  router.post('/conflicts/scan', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const result = await conflictService.runFullScan(limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Conflict scan error:', error);
      res.status(500).json({ success: false, error: 'Failed to run conflict scan' });
    }
  });

  /**
   * POST /api/cortex/conflicts/auto-resolve
   * Auto-resolve conflicts that can be automated
   */
  router.post('/conflicts/auto-resolve', async (req: Request, res: Response) => {
    try {
      const result = await conflictService.autoResolveConflicts();

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Auto-resolve error:', error);
      res.status(500).json({ success: false, error: 'Failed to auto-resolve conflicts' });
    }
  });

  /**
   * POST /api/cortex/conflicts/resolve/:conflictId
   * Manually resolve a conflict
   */
  router.post('/conflicts/resolve/:conflictId', async (req: Request, res: Response) => {
    try {
      const conflictIdRaw = req.params.conflictId; const conflictId = Array.isArray(conflictIdRaw) ? conflictIdRaw[0] : (conflictIdRaw ?? "");
      const { resolvedBy, notes } = req.body;

      if (!resolvedBy || !notes) {
        return res.status(400).json({
          success: false,
          error: 'resolvedBy and notes required',
        });
      }

      await conflictService.resolveConflict(conflictId, resolvedBy, notes);

      res.json({
        success: true,
        message: 'Conflict resolved',
      });
    } catch (error) {
      console.error('Resolve conflict error:', error);
      res.status(500).json({ success: false, error: 'Failed to resolve conflict' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //                      VERSION HISTORY ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /api/cortex/versions/stats
   * Get version statistics
   */
  router.get('/versions/stats', async (req: Request, res: Response) => {
    try {
      const stats = await versionService.getStatistics();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Version stats error:', error);
      res.status(500).json({ success: false, error: 'Failed to get version stats' });
    }
  });

  /**
   * GET /api/cortex/versions/:atomId
   * Get version history for an atom
   */
  router.get('/versions/:atomId', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const versions = await versionService.getVersionHistory(atomId);

      res.json({
        success: true,
        data: {
          atomId,
          versionCount: versions.length,
          versions,
        },
      });
    } catch (error) {
      console.error('Get versions error:', error);
      res.status(500).json({ success: false, error: 'Failed to get version history' });
    }
  });

  /**
   * GET /api/cortex/versions/:atomId/:versionNumber
   * Get a specific version
   */
  router.get('/versions/:atomId/:versionNumber', async (req: Request, res: Response) => {
    try {
      const { atomId, versionNumber } = req.params as { atomId: string; versionNumber: string };
      const version = await versionService.getVersion(atomId, parseInt(versionNumber));

      if (!version) {
        return res.status(404).json({ success: false, error: 'Version not found' });
      }

      res.json({
        success: true,
        data: version,
      });
    } catch (error) {
      console.error('Get version error:', error);
      res.status(500).json({ success: false, error: 'Failed to get version' });
    }
  });

  /**
   * GET /api/cortex/versions/:atomId/compare
   * Compare two versions
   */
  router.get('/versions/:atomId/compare', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const fromVersion = parseInt(req.query.from as string);
      const toVersion = parseInt(req.query.to as string);

      if (!fromVersion || !toVersion) {
        return res.status(400).json({
          success: false,
          error: 'from and to query parameters required',
        });
      }

      const comparison = await versionService.compareVersions(atomId, fromVersion, toVersion);

      res.json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      console.error('Compare versions error:', error);
      res.status(500).json({ success: false, error: 'Failed to compare versions' });
    }
  });

  /**
   * POST /api/cortex/versions/:atomId/rollback
   * Rollback to a previous version
   */
  router.post('/versions/:atomId/rollback', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const { targetVersion, rolledBackBy, reason } = req.body;

      if (!targetVersion || !rolledBackBy || !reason) {
        return res.status(400).json({
          success: false,
          error: 'targetVersion, rolledBackBy, and reason required',
        });
      }

      const newVersion = await versionService.rollbackToVersion(
        atomId,
        targetVersion,
        rolledBackBy,
        reason
      );

      res.json({
        success: true,
        data: {
          message: `Rolled back to version ${targetVersion}`,
          newVersion,
        },
      });
    } catch (error) {
      console.error('Rollback error:', error);
      res.status(500).json({ success: false, error: 'Failed to rollback' });
    }
  });

  /**
   * GET /api/cortex/versions/:atomId/audit
   * Get audit trail for an atom
   */
  router.get('/versions/:atomId/audit', async (req: Request, res: Response) => {
    try {
      const atomIdRaw = req.params.atomId; const atomId = Array.isArray(atomIdRaw) ? atomIdRaw[0] : (atomIdRaw ?? "");
      const auditTrail = await versionService.getAuditTrail(atomId);

      res.json({
        success: true,
        data: {
          atomId,
          entries: auditTrail,
        },
      });
    } catch (error) {
      console.error('Get audit trail error:', error);
      res.status(500).json({ success: false, error: 'Failed to get audit trail' });
    }
  });

  /**
   * POST /api/cortex/versions/:atomId/verify/:versionId
   * Verify version integrity
   */
  router.post('/versions/:atomId/verify/:versionId', async (req: Request, res: Response) => {
    try {
      const versionIdRaw = req.params.versionId; const versionId = Array.isArray(versionIdRaw) ? versionIdRaw[0] : (versionIdRaw ?? "");
      const result = await versionService.verifyVersionIntegrity(versionId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('Verify integrity error:', error);
      res.status(500).json({ success: false, error: 'Failed to verify integrity' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  //                      COMPREHENSIVE DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * GET /api/cortex/dashboard
   * Get comprehensive Cortex health dashboard
   */
  router.get('/dashboard', async (req: Request, res: Response) => {
    try {
      const [graphStats, qualityDist, conflictStats, versionStats, atomCounts] = await Promise.all([
        graphService.getStatistics(),
        qualityService.getQualityDistribution(),
        conflictService.getConflictStatistics(),
        versionService.getStatistics(),
        pool.query(`
          SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
            COUNT(DISTINCT atom_type) as atom_types
          FROM lumen_data_atoms
        `),
      ]);

      res.json({
        success: true,
        data: {
          overview: {
            totalAtoms: parseInt(atomCounts.rows[0].total),
            withEmbeddings: parseInt(atomCounts.rows[0].with_embeddings),
            atomTypes: parseInt(atomCounts.rows[0].atom_types),
          },
          knowledgeGraph: graphStats,
          quality: qualityDist,
          conflicts: conflictStats,
          versions: versionStats,
          health: {
            score: calculateHealthScore(qualityDist, conflictStats, graphStats),
            status: determineHealthStatus(qualityDist, conflictStats),
          },
        },
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, error: 'Failed to get dashboard' });
    }
  });

  return router;
}

// ═══════════════════════════════════════════════════════════════════════════
//                           HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function calculateHealthScore(
  quality: { excellent: number; good: number; fair: number; poor: number; avgScore: number },
  conflicts: { unresolved: number; total: number },
  graph: { totalEdges: number; totalNodes: number }
): number {
  // Quality component (40%)
  const qualityScore = quality.avgScore * 40;

  // Conflict component (30%) - lower is better
  const conflictRatio =
    conflicts.total > 0 ? (conflicts.total - conflicts.unresolved) / conflicts.total : 1;
  const conflictScore = conflictRatio * 30;

  // Connectivity component (30%)
  const connectivityRatio =
    graph.totalNodes > 0 ? Math.min(1, graph.totalEdges / (graph.totalNodes * 2)) : 0;
  const connectivityScore = connectivityRatio * 30;

  return Math.round(qualityScore + conflictScore + connectivityScore);
}

function determineHealthStatus(
  quality: { avgScore: number; unassessed: number },
  conflicts: { unresolved: number }
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (quality.avgScore >= 0.8 && conflicts.unresolved === 0) return 'excellent';
  if (quality.avgScore >= 0.6 && conflicts.unresolved < 5) return 'good';
  if (quality.avgScore >= 0.4 && conflicts.unresolved < 20) return 'fair';
  if (quality.avgScore >= 0.2 || conflicts.unresolved < 50) return 'poor';
  return 'critical';
}
