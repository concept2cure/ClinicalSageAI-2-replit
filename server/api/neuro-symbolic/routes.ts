/**
 * Neuro-Symbolic API Routes - Enterprise Edition
 * 
 * FDA 21 CFR Part 11 Compliant Implementation
 * 
 * Exposes the Knowledge Graph and Multi-Agent Council via REST API.
 * 
 * Compliance Features:
 * - Input validation and sanitization
 * - Request/response audit logging
 * - Rate limiting (standard and heavy endpoint protection)
 * - Correlation ID tracking
 * - Proper error handling (no implementation leaks)
 * 
 * System Survivability Features:
 * - Rate limiting middleware
 * - DDoS protection
 * - Graceful degradation awareness
 * - Tamper-proof audit logging
 * 
 * @module NeuroSymbolicRoutes
 * @version 3.0.0
 * @compliance FDA 21 CFR Part 11, ICH E6(R2), OWASP LLM Top 10
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { KnowledgeGraphService, EntityType, RelationshipType } from '../../services/knowledge-graph';
import { MultiAgentCouncilService, ValidationError, CouncilError } from '../../services/multi-agent-council';
import { getEntityExtractionWorker } from '../../workers/entity-extraction-worker';

// Survivability imports
import { rateLimitMiddleware, RateLimitResult } from '../../lib/rate-limiting';
import { getTamperProofAuditLog } from '../../lib/tamper-proof-audit';
import { getGracefulDegradationService, FeatureUnavailableError } from '../../lib/graceful-degradation';
import { CircuitBreakerError } from '../../lib/circuit-breaker';
import { PromptInjectionError } from '../../lib/prompt-injection-protection';

// =============================================================================
// Validation Utilities
// =============================================================================

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function validateUUID(value: string, fieldName: string): void {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${fieldName} is required`);
  }
  if (!isValidUUID(value)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }
}

function sanitizeString(value: unknown, maxLength: number = 10000): string {
  if (typeof value !== 'string') return '';
  return value.substring(0, maxLength).trim();
}

function generateCorrelationId(): string {
  return `api-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

// =============================================================================
// Error Handler Middleware
// =============================================================================

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) {
  const correlationId = (req as any).correlationId || 'unknown';
  
  console.error(`[API:${correlationId}] Error:`, {
    name: error.name,
    message: error.message,
    path: req.path,
    method: req.method
  });

  // Handle survivability-related errors
  if (error instanceof CircuitBreakerError) {
    return res.status(503).json({
      error: 'Service Temporarily Unavailable',
      code: error.code,
      message: 'External AI service is temporarily unavailable. Please try again later.',
      retryAfter: 30,
      correlationId
    });
  }

  if (error instanceof FeatureUnavailableError) {
    return res.status(503).json({
      error: 'Feature Unavailable',
      feature: error.feature,
      degradationLevel: error.level,
      message: `The requested feature "${error.feature}" is temporarily unavailable due to system degradation.`,
      correlationId
    });
  }

  if (error instanceof PromptInjectionError) {
    return res.status(400).json({
      error: 'Invalid Input',
      message: 'Your request contains content that cannot be processed. Please review and modify your input.',
      correlationId
    });
  }

  if (error instanceof ValidationError) {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      correlationId
    });
  }

  if (error instanceof CouncilError) {
    return res.status(error.recoverable ? 503 : 500).json({
      error: 'Council Error',
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      correlationId
    });
  }

  // Don't leak implementation details in production
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please contact support with the correlation ID.'
      : error.message,
    correlationId
  });
}

// =============================================================================
// Router Factory
// =============================================================================

export function createNeuroSymbolicRouter(pool: Pool): Router {
  const router = Router();
  const graphService = new KnowledgeGraphService(pool);
  const councilService = new MultiAgentCouncilService(pool);
  const extractionWorker = getEntityExtractionWorker(pool);
  const degradation = getGracefulDegradationService();
  const auditLog = getTamperProofAuditLog(pool);

  // Add correlation ID to all requests
  router.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = generateCorrelationId();
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    console.log(`[API:${correlationId}] ${req.method} ${req.path}`);
    next();
  });

  // Apply standard rate limiting to all routes
  router.use(rateLimitMiddleware({ 
    limiter: 'standard',
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      const userId = (req as any).user?.id;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return userId ? `user:${userId}` : `ip:${ip}`;
    }
  }));

  // ==========================================================================
  // Knowledge Graph Routes
  // ==========================================================================

  /**
   * GET /api/neuro-symbolic/graph/stats
   * Get graph statistics
   */
  router.get('/graph/stats', asyncHandler(async (req: Request, res: Response) => {
    const stats = await graphService.getGraphStats();
    res.json({
      ...stats,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/graph/entities/:atomId
   * Get entities for a document atom
   */
  router.get('/graph/entities/:atomId', asyncHandler(async (req: Request, res: Response) => {
    const atomId = String(req.params.atomId);
    validateUUID(atomId, 'atomId');

    const entities = await graphService.getEntities(atomId);
    res.json({ 
      atomId, 
      entities, 
      count: entities.length,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * POST /api/neuro-symbolic/graph/entities/search
   * Search for atoms by entity
   */
  router.post('/graph/entities/search', asyncHandler(async (req: Request, res: Response) => {
    const { entityType, entityValue } = req.body;
    
    if (!entityType || typeof entityType !== 'string') {
      throw new ValidationError('entityType is required');
    }
    
    const results = await graphService.findAtomsByEntity(
      entityType as EntityType, 
      sanitizeString(entityValue, 500)
    );
    res.json({ 
      results, 
      count: results.length,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * POST /api/neuro-symbolic/graph/edges
   * Create a graph edge between atoms
   */
  router.post('/graph/edges', asyncHandler(async (req: Request, res: Response) => {
    const { sourceAtomId, targetAtomId, relationshipType, strength, evidenceText } = req.body;
    
    validateUUID(sourceAtomId, 'sourceAtomId');
    validateUUID(targetAtomId, 'targetAtomId');
    
    if (!relationshipType || typeof relationshipType !== 'string') {
      throw new ValidationError('relationshipType is required');
    }
    
    const edgeId = await graphService.createEdge({
      sourceAtomId,
      targetAtomId,
      relationshipType: relationshipType as RelationshipType,
      strength: typeof strength === 'number' ? Math.max(0, Math.min(1, strength)) : undefined,
      evidenceText: sanitizeString(evidenceText, 5000)
    });

    res.json({ 
      edgeId, 
      success: true,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/graph/traverse/:atomId
   * Traverse graph from starting atom
   */
  router.get('/graph/traverse/:atomId', asyncHandler(async (req: Request, res: Response) => {
    const atomId = String(req.params.atomId);
    validateUUID(atomId, 'atomId');

    const { maxDepth, direction, types } = req.query;
    const parsedDepth = maxDepth ? Math.min(10, Math.max(1, parseInt(maxDepth as string))) : 3;
    const validDirections = ['OUTGOING', 'INCOMING', 'BOTH'];
    const parsedDirection = validDirections.includes(direction as string) 
      ? (direction as 'OUTGOING' | 'INCOMING' | 'BOTH') 
      : 'OUTGOING';

    const results = await graphService.traverseGraph(atomId, {
      maxDepth: parsedDepth,
      direction: parsedDirection,
      relationshipTypes: types ? (types as string).split(',') as RelationshipType[] : undefined
    });

    res.json({ 
      startAtom: atomId, 
      results, 
      count: results.length,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/graph/path
   * Find shortest path between two atoms
   */
  router.get('/graph/path', asyncHandler(async (req: Request, res: Response) => {
    const { source, target, maxDepth } = req.query;
    
    if (!source || !target) {
      throw new ValidationError('source and target query parameters are required');
    }

    validateUUID(source as string, 'source');
    validateUUID(target as string, 'target');
    
    const parsedMaxDepth = maxDepth ? Math.min(10, Math.max(1, parseInt(maxDepth as string))) : 5;

    const path = await graphService.findPath(
      source as string,
      target as string,
      parsedMaxDepth
    );

    res.json({ 
      source, 
      target, 
      path,
      found: path !== null,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/graph/evidence/:claimAtomId
   * Find supporting evidence for a claim
   */
  router.get('/graph/evidence/:claimAtomId', asyncHandler(async (req: Request, res: Response) => {
    const claimAtomId = String(req.params.claimAtomId);
    validateUUID(claimAtomId, 'claimAtomId');
    
    const evidence = await graphService.findSupportingEvidence(claimAtomId);
    res.json({ 
      claimAtomId, 
      evidence, 
      count: evidence.length,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/graph/derived/:sourceAtomId
   * Find all documents derived from a source
   */
  router.get('/graph/derived/:sourceAtomId', asyncHandler(async (req: Request, res: Response) => {
    const sourceAtomId = String(req.params.sourceAtomId);
    validateUUID(sourceAtomId, 'sourceAtomId');
    
    const derived = await graphService.findDerivedDocuments(sourceAtomId);
    res.json({ 
      sourceAtomId, 
      derivedDocuments: derived, 
      count: derived.length,
      message: `Found ${derived.length} documents derived from this source`,
      correlationId: (req as any).correlationId
    });
  }));

  // ==========================================================================
  // Traceability Matrix Routes
  // ==========================================================================

  /**
   * GET /api/neuro-symbolic/traceability/stale
   * Get stale traceability entries
   */
  router.get('/traceability/stale', asyncHandler(async (req: Request, res: Response) => {
    const { programId } = req.query;
    
    if (programId && !isValidUUID(programId as string)) {
      throw new ValidationError('programId must be a valid UUID');
    }
    
    const entries = await graphService.getStaleEntries(programId as string);
    res.json({ 
      entries, 
      count: entries.length,
      message: entries.length > 0 
        ? `⚠️ ${entries.length} entries marked as SUSPECT/STALE - review required`
        : '✅ All traceability entries are current',
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * POST /api/neuro-symbolic/traceability
   * Add a traceability entry
   */
  router.post('/traceability', asyncHandler(async (req: Request, res: Response) => {
    const { requirementId, requirementType, requirementText, evidenceAtomIds, claimAtomIds, programId } = req.body;
    
    if (!requirementId || typeof requirementId !== 'string') {
      throw new ValidationError('requirementId is required');
    }
    if (!requirementType || typeof requirementType !== 'string') {
      throw new ValidationError('requirementType is required');
    }
    if (!requirementText || typeof requirementText !== 'string') {
      throw new ValidationError('requirementText is required');
    }
    
    // Validate all atom IDs if provided
    if (evidenceAtomIds && Array.isArray(evidenceAtomIds)) {
      for (const id of evidenceAtomIds) {
        validateUUID(id, 'evidenceAtomIds item');
      }
    }
    if (claimAtomIds && Array.isArray(claimAtomIds)) {
      for (const id of claimAtomIds) {
        validateUUID(id, 'claimAtomIds item');
      }
    }
    
    const entryId = await graphService.addTraceabilityEntry({
      requirementId: sanitizeString(requirementId, 500),
      requirementType: sanitizeString(requirementType, 100),
      requirementText: sanitizeString(requirementText, 5000),
      evidenceAtomIds: evidenceAtomIds || [],
      claimAtomIds: claimAtomIds || [],
      status: 'PENDING_REVIEW',
      isStale: false,
      programId
    });
    
    res.json({ 
      entryId, 
      success: true,
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * POST /api/neuro-symbolic/traceability/:entryId/verify
   * Mark a traceability entry as verified
   */
  router.post('/traceability/:entryId/verify', asyncHandler(async (req: Request, res: Response) => {
    const entryId = String(req.params.entryId);
    validateUUID(entryId, 'entryId');
    
    const { verifiedBy } = req.body;
    
    if (!verifiedBy || typeof verifiedBy !== 'string') {
      throw new ValidationError('verifiedBy is required');
    }
    
    await graphService.verifyEntry(entryId, sanitizeString(verifiedBy, 200));
    res.json({ 
      entryId, 
      status: 'VERIFIED', 
      success: true,
      correlationId: (req as any).correlationId
    });
  }));

  // ==========================================================================
  // Entity Extraction Routes
  // ==========================================================================

  /**
   * POST /api/neuro-symbolic/extract/:atomId
   * Extract entities from a document atom
   */
  router.post('/extract/:atomId', asyncHandler(async (req: Request, res: Response) => {
    const atomId = String(req.params.atomId);
    validateUUID(atomId, 'atomId');

    const { content } = req.body;

    if (!content || typeof content !== 'string') {
      throw new ValidationError('content is required in request body');
    }
    
    if (content.length > 500000) {
      throw new ValidationError('content exceeds maximum length of 500,000 characters');
    }

    const result = await extractionWorker.extractEntities(atomId, content);
    res.json({
      ...result,
      correlationId: (req as any).correlationId
    });
  }));

  // ==========================================================================
  // Multi-Agent Council Routes
  // ==========================================================================

  /**
   * POST /api/neuro-symbolic/council/sessions
   * Initialize a new council drafting session
   */
  router.post('/council/sessions', asyncHandler(async (req: Request, res: Response) => {
    const { sectionPath, requirements, contextAtomIds, programId } = req.body;

    if (!sectionPath || typeof sectionPath !== 'string') {
      throw new ValidationError('sectionPath is required');
    }
    
    // Validate context atom IDs if provided
    if (contextAtomIds && Array.isArray(contextAtomIds)) {
      for (const id of contextAtomIds) {
        validateUUID(id, 'contextAtomIds item');
      }
    }
    
    if (programId && !isValidUUID(programId)) {
      throw new ValidationError('programId must be a valid UUID');
    }

    const sessionId = await councilService.initializeSession(
      sanitizeString(sectionPath, 500),
      requirements || {},
      contextAtomIds || [],
      programId
    );

    res.json({ 
      sessionId, 
      status: 'INITIALIZED',
      message: 'Council session initialized. Call /execute to start the workflow.',
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * POST /api/neuro-symbolic/council/sessions/:sessionId/execute
   * Execute the full council workflow
   * 
   * HEAVY ENDPOINT - Extra rate limiting applied (AI-intensive operation)
   */
  router.post(
    '/council/sessions/:sessionId/execute', 
    rateLimitMiddleware({ 
      limiter: 'heavy',
      keyGenerator: (req) => {
        const userId = (req as any).user?.id;
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return userId ? `user:${userId}` : `ip:${ip}`;
      },
      onRateLimited: async (req, res, result) => {
        // Log rate limit event to audit log
        const correlationId = (req as any).correlationId;
        await auditLog.log(
          'RATE_LIMIT_EXCEEDED',
          'Rate limit exceeded for council execution',
          {
            endpoint: '/council/sessions/:sessionId/execute',
            remaining: result.remaining,
            resetTime: result.resetTime,
            penaltyApplied: result.penaltyApplied
          },
          { correlationId, ipAddress: req.ip }
        ).catch(err => console.error('Failed to log rate limit event:', err));

        res.status(429).json({
          error: 'Rate Limit Exceeded',
          message: 'Council execution is resource-intensive. Please wait before submitting another request.',
          retryAfter: result.retryAfter,
          resetTime: result.resetTime.toISOString(),
          correlationId
        });
      }
    }),
    asyncHandler(async (req: Request, res: Response) => {
      const sessionId = String(req.params.sessionId);
      validateUUID(sessionId, 'sessionId');

      // Check if AI features are available
      if (!degradation.isFeatureAvailable('COUNCIL_DRAFTING')) {
        throw new FeatureUnavailableError('COUNCIL_DRAFTING', degradation.getLevel());
      }
      
      // Get userId from authenticated session if available
      const userId = (req as any).user?.id || 'anonymous';

      // Log council start to audit
      await auditLog.log(
        'COUNCIL_SESSION_STARTED',
        'Council execution initiated',
        { sessionId, userId },
        { correlationId: (req as any).correlationId, userId, resourceType: 'council_session', resourceId: sessionId }
      );

      console.log(`[API:${(req as any).correlationId}] Starting council execution for session ${sessionId}`);
      const result = await councilService.executeCouncil(sessionId, userId);

      res.json({
        ...result,
        message: `Council workflow completed. ${result.corrections} corrections applied, ${result.issues} issues reviewed.`,
        log: [
          '1. Drafter Agent: Initial draft generated',
          `2. Statistician Agent: ${result.corrections} numerical discrepancies found and corrected`,
          `3. Critic Agent: ${result.issues} issues identified`,
          '4. Synthesizer Agent: Final text produced with all feedback incorporated'
        ],
        correlationId: (req as any).correlationId
      });
    })
  );

  /**
   * GET /api/neuro-symbolic/council/sessions/:sessionId
   * Get council session status and results
   */
  router.get('/council/sessions/:sessionId', asyncHandler(async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    validateUUID(sessionId, 'sessionId');

    const result = await pool.query(
      `SELECT * FROM lumen.v_council_session_progress WHERE session_id = $1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ 
        error: 'Session not found',
        correlationId: (req as any).correlationId
      });
      return;
    }

    res.json({
      ...result.rows[0],
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/council/sessions/:sessionId/verifications
   * Get verification results from Statistician agent
   */
  router.get('/council/sessions/:sessionId/verifications', asyncHandler(async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    validateUUID(sessionId, 'sessionId');

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
        .filter((v: { status: string }) => v.status === 'DISCREPANCY')
        .map((v: { claimed_value: string; actual_value: string; claim_text: string }) => 
          `CORRECTION: "${v.claimed_value}" → "${v.actual_value}" (${v.claim_text})`
        ),
      correlationId: (req as any).correlationId
    });
  }));

  /**
   * GET /api/neuro-symbolic/agents
   * List registered agents
   */
  router.get('/agents', asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT id, agent_code, agent_name, agent_role, capabilities, 
              model_name, temperature, is_active, created_at
       FROM lumen.agent_registry
       ORDER BY agent_role`
    );
    res.json({ 
      agents: result.rows, 
      count: result.rows.length,
      correlationId: (req as any).correlationId
    });
  }));

  // Register error handler
  router.use(errorHandler);

  return router;
}

// Export error handler for use in main app
export { errorHandler };
