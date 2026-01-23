/**
 * Neuro-Symbolic API Routes
 * 
 * Exposes the Knowledge Graph and Multi-Agent Council via REST API.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { KnowledgeGraphService } from '../../services/knowledge-graph';
import { MultiAgentCouncilService } from '../../services/multi-agent-council';
import { getEntityExtractionWorker } from '../../workers/entity-extraction-worker';

export function createNeuroSymbolicRouter(pool: Pool): Router {
  const router = Router();
  const graphService = new KnowledgeGraphService(pool);
  const councilService = new MultiAgentCouncilService(pool);
  const extractionWorker = getEntityExtractionWorker(pool);

  // ==========================================================================
  // Knowledge Graph Routes
  // ==========================================================================

  /**
   * GET /api/neuro-symbolic/graph/stats
   * Get graph statistics
   */
  router.get('/graph/stats', async (req: Request, res: Response) => {
    try {
      const stats = await graphService.getGraphStats();
      res.json(stats);
    } catch (error) {
      console.error('[API] Error getting graph stats:', error);
      res.status(500).json({ error: 'Failed to get graph statistics' });
    }
  });

  /**
   * GET /api/neuro-symbolic/graph/entities/:atomId
   * Get entities for a document atom
   */
  router.get('/graph/entities/:atomId', async (req: Request, res: Response) => {
    try {
      const { atomId } = req.params;
      const entities = await graphService.getEntities(atomId);
      res.json({ atomId, entities, count: entities.length });
    } catch (error) {
      console.error('[API] Error getting entities:', error);
      res.status(500).json({ error: 'Failed to get entities' });
    }
  });

  /**
   * POST /api/neuro-symbolic/graph/entities/search
   * Search for atoms by entity
   */
  router.post('/graph/entities/search', async (req: Request, res: Response) => {
    try {
      const { entityType, entityValue } = req.body;
      const results = await graphService.findAtomsByEntity(entityType, entityValue);
      res.json({ results, count: results.length });
    } catch (error) {
      console.error('[API] Error searching entities:', error);
      res.status(500).json({ error: 'Failed to search entities' });
    }
  });

  /**
   * POST /api/neuro-symbolic/graph/edges
   * Create a graph edge between atoms
   */
  router.post('/graph/edges', async (req: Request, res: Response) => {
    try {
      const { sourceAtomId, targetAtomId, relationshipType, strength, evidenceText } = req.body;
      
      const edgeId = await graphService.createEdge({
        sourceAtomId,
        targetAtomId,
        relationshipType,
        strength,
        evidenceText
      });

      res.json({ edgeId, success: true });
    } catch (error) {
      console.error('[API] Error creating edge:', error);
      res.status(500).json({ error: 'Failed to create edge' });
    }
  });

  /**
   * GET /api/neuro-symbolic/graph/traverse/:atomId
   * Traverse graph from starting atom
   */
  router.get('/graph/traverse/:atomId', async (req: Request, res: Response) => {
    try {
      const { atomId } = req.params;
      const { maxDepth, direction, types } = req.query;

      const results = await graphService.traverseGraph(atomId, {
        maxDepth: maxDepth ? parseInt(maxDepth as string) : 3,
        direction: (direction as 'OUTGOING' | 'INCOMING' | 'BOTH') || 'OUTGOING',
        relationshipTypes: types ? (types as string).split(',') as any : undefined
      });

      res.json({ 
        startAtom: atomId, 
        results, 
        count: results.length 
      });
    } catch (error) {
      console.error('[API] Error traversing graph:', error);
      res.status(500).json({ error: 'Failed to traverse graph' });
    }
  });

  /**
   * GET /api/neuro-symbolic/graph/path
   * Find shortest path between two atoms
   */
  router.get('/graph/path', async (req: Request, res: Response) => {
    try {
      const { source, target, maxDepth } = req.query;
      
      if (!source || !target) {
        return res.status(400).json({ error: 'source and target are required' });
      }

      const path = await graphService.findPath(
        source as string,
        target as string,
        maxDepth ? parseInt(maxDepth as string) : 5
      );

      res.json({ 
        source, 
        target, 
        path,
        found: path !== null 
      });
    } catch (error) {
      console.error('[API] Error finding path:', error);
      res.status(500).json({ error: 'Failed to find path' });
    }
  });

  /**
   * GET /api/neuro-symbolic/graph/evidence/:claimAtomId
   * Find supporting evidence for a claim
   */
  router.get('/graph/evidence/:claimAtomId', async (req: Request, res: Response) => {
    try {
      const { claimAtomId } = req.params;
      const evidence = await graphService.findSupportingEvidence(claimAtomId);
      res.json({ claimAtomId, evidence, count: evidence.length });
    } catch (error) {
      console.error('[API] Error finding evidence:', error);
      res.status(500).json({ error: 'Failed to find evidence' });
    }
  });

  /**
   * GET /api/neuro-symbolic/graph/derived/:sourceAtomId
   * Find all documents derived from a source
   */
  router.get('/graph/derived/:sourceAtomId', async (req: Request, res: Response) => {
    try {
      const { sourceAtomId } = req.params;
      const derived = await graphService.findDerivedDocuments(sourceAtomId);
      res.json({ 
        sourceAtomId, 
        derivedDocuments: derived, 
        count: derived.length,
        message: `Found ${derived.length} documents derived from this source`
      });
    } catch (error) {
      console.error('[API] Error finding derived documents:', error);
      res.status(500).json({ error: 'Failed to find derived documents' });
    }
  });

  // ==========================================================================
  // Traceability Matrix Routes
  // ==========================================================================

  /**
   * GET /api/neuro-symbolic/traceability/stale
   * Get stale traceability entries
   */
  router.get('/traceability/stale', async (req: Request, res: Response) => {
    try {
      const { programId } = req.query;
      const entries = await graphService.getStaleEntries(programId as string);
      res.json({ 
        entries, 
        count: entries.length,
        message: entries.length > 0 
          ? `⚠️ ${entries.length} entries marked as SUSPECT/STALE - review required`
          : '✅ All traceability entries are current'
      });
    } catch (error) {
      console.error('[API] Error getting stale entries:', error);
      res.status(500).json({ error: 'Failed to get stale entries' });
    }
  });

  /**
   * POST /api/neuro-symbolic/traceability
   * Add a traceability entry
   */
  router.post('/traceability', async (req: Request, res: Response) => {
    try {
      const entry = req.body;
      const entryId = await graphService.addTraceabilityEntry(entry);
      res.json({ entryId, success: true });
    } catch (error) {
      console.error('[API] Error adding traceability entry:', error);
      res.status(500).json({ error: 'Failed to add traceability entry' });
    }
  });

  /**
   * POST /api/neuro-symbolic/traceability/:entryId/verify
   * Mark a traceability entry as verified
   */
  router.post('/traceability/:entryId/verify', async (req: Request, res: Response) => {
    try {
      const { entryId } = req.params;
      const { verifiedBy } = req.body;
      await graphService.verifyEntry(entryId, verifiedBy || 'system');
      res.json({ entryId, status: 'VERIFIED', success: true });
    } catch (error) {
      console.error('[API] Error verifying entry:', error);
      res.status(500).json({ error: 'Failed to verify entry' });
    }
  });

  // ==========================================================================
  // Entity Extraction Routes
  // ==========================================================================

  /**
   * POST /api/neuro-symbolic/extract/:atomId
   * Extract entities from a document atom
   */
  router.post('/extract/:atomId', async (req: Request, res: Response) => {
    try {
      const { atomId } = req.params;
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'content is required in request body' });
      }

      const result = await extractionWorker.extractEntities(atomId, content);
      res.json(result);
    } catch (error) {
      console.error('[API] Error extracting entities:', error);
      res.status(500).json({ error: 'Failed to extract entities' });
    }
  });

  // ==========================================================================
  // Multi-Agent Council Routes
  // ==========================================================================

  /**
   * POST /api/neuro-symbolic/council/sessions
   * Initialize a new council drafting session
   */
  router.post('/council/sessions', async (req: Request, res: Response) => {
    try {
      const { sectionPath, requirements, contextAtomIds, programId } = req.body;

      if (!sectionPath) {
        return res.status(400).json({ error: 'sectionPath is required' });
      }

      const sessionId = await councilService.initializeSession(
        sectionPath,
        requirements || {},
        contextAtomIds || [],
        programId
      );

      res.json({ 
        sessionId, 
        status: 'INITIALIZED',
        message: 'Council session initialized. Call /execute to start the workflow.'
      });
    } catch (error) {
      console.error('[API] Error initializing council session:', error);
      res.status(500).json({ error: 'Failed to initialize council session' });
    }
  });

  /**
   * POST /api/neuro-symbolic/council/sessions/:sessionId/execute
   * Execute the full council workflow
   */
  router.post('/council/sessions/:sessionId/execute', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;

      console.log(`[Council] Starting execution for session ${sessionId}`);
      const result = await councilService.executeCouncil(sessionId);

      res.json({
        ...result,
        message: `Council workflow completed. ${result.corrections} corrections applied, ${result.issues} issues reviewed.`,
        log: [
          '1. Drafter Agent: Initial draft generated',
          `2. Statistician Agent: ${result.corrections} numerical discrepancies found and corrected`,
          `3. Critic Agent: ${result.issues} issues identified`,
          '4. Synthesizer Agent: Final text produced with all feedback incorporated'
        ]
      });
    } catch (error) {
      console.error('[API] Error executing council:', error);
      res.status(500).json({ error: 'Council execution failed', details: (error as Error).message });
    }
  });

  /**
   * GET /api/neuro-symbolic/council/sessions/:sessionId
   * Get council session status and results
   */
  router.get('/council/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const result = await pool.query(
        `SELECT * FROM lumen.v_council_session_progress WHERE session_id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('[API] Error getting session:', error);
      res.status(500).json({ error: 'Failed to get session' });
    }
  });

  /**
   * GET /api/neuro-symbolic/council/sessions/:sessionId/verifications
   * Get verification results from Statistician agent
   */
  router.get('/council/sessions/:sessionId/verifications', async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const result = await pool.query(
        `SELECT * FROM lumen.data_verifications WHERE session_id = $1 ORDER BY verified_at`,
        [sessionId]
      );

      const summary = await pool.query(
        `SELECT * FROM lumen.v_verification_summary WHERE session_id = $1`,
        [sessionId]
      );

      res.json({
        sessionId,
        verifications: result.rows,
        summary: summary.rows[0] || {},
        log: result.rows
          .filter(v => v.status === 'DISCREPANCY')
          .map(v => `CORRECTION: "${v.claimed_value}" → "${v.actual_value}" (${v.claim_text})`)
      });
    } catch (error) {
      console.error('[API] Error getting verifications:', error);
      res.status(500).json({ error: 'Failed to get verifications' });
    }
  });

  /**
   * GET /api/neuro-symbolic/agents
   * List registered agents
   */
  router.get('/agents', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT id, agent_code, agent_name, agent_role, capabilities, 
                model_name, temperature, is_active, created_at
         FROM lumen.agent_registry
         ORDER BY agent_role`
      );
      res.json({ agents: result.rows, count: result.rows.length });
    } catch (error) {
      console.error('[API] Error listing agents:', error);
      res.status(500).json({ error: 'Failed to list agents' });
    }
  });

  return router;
}
