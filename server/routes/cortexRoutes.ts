/**
 * Cortex Prime API Routes
 * 
 * RESTful API endpoints for the Cortex Prime unified AI brain.
 * 
 * @module server/routes/cortexRoutes
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getCortexPrimeService } from '../services/cortexPrimeService';
import { validateRequest } from '../middleware/validation';
import { requireAuth, requireOrgAccess } from '../middleware/auth';
import { z } from 'zod';

const router = Router();
const cortex = getCortexPrimeService();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CreateAtomSchema = z.object({
  atomType: z.string(),
  content: z.string(),
  structuredData: z.record(z.any()).optional(),
  sourceType: z.string().optional(),
  sourceId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional()
});

const SearchSchema = z.object({
  query: z.string().optional(),
  queryEmbedding: z.array(z.number()).optional(),
  atomTypes: z.array(z.string()).optional(),
  therapeuticArea: z.string().optional(),
  submissionType: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  minSimilarity: z.number().min(0).max(1).optional()
});

const CreateThreadSchema = z.object({
  threadType: z.string().optional(),
  title: z.string().optional(),
  contextAtomIds: z.array(z.string().uuid()).optional(),
  programId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional()
});

const CreateTraceSchema = z.object({
  threadId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  traceType: z.string().optional(),
  input: z.record(z.any()),
  reasoning: z.record(z.any()).optional()
});

const CompleteTraceSchema = z.object({
  output: z.record(z.any()),
  status: z.string().optional(),
  tokenUsage: z.record(z.any()).optional()
});

const TraverseSchema = z.object({
  startAtomId: z.string().uuid(),
  edgeTypes: z.array(z.string()).optional(),
  maxDepth: z.number().int().min(1).max(10).optional(),
  minStrength: z.number().min(0).max(1).optional()
});

const CreateEdgeSchema = z.object({
  sourceAtomId: z.string().uuid(),
  targetAtomId: z.string().uuid(),
  edgeType: z.string(),
  strength: z.number().min(0).max(1).optional(),
  evidence: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional()
});

const PredictionSchema = z.object({
  submissionId: z.string().uuid(),
  predictionType: z.string().optional()
});

const UncertaintySchema = z.object({
  contextType: z.string(),
  contextId: z.string().uuid(),
  inputData: z.record(z.any())
});

const CausalEffectSchema = z.object({
  graphId: z.string().uuid(),
  causeVariable: z.string(),
  effectVariable: z.string()
});

const CounterfactualSchema = z.object({
  graphId: z.string().uuid(),
  interventions: z.record(z.any())
});

const TransferSchema = z.object({
  targetDomainId: z.string().uuid(),
  queryEmbedding: z.array(z.number()),
  minSimilarity: z.number().min(0).max(1).optional()
});

const ExecuteTransferSchema = z.object({
  sourceKnowledgeId: z.string().uuid(),
  targetDomainId: z.string().uuid(),
  transformationRules: z.record(z.any()).optional()
});

const LearningExperienceSchema = z.object({
  experienceType: z.string(),
  input: z.record(z.any()),
  output: z.record(z.any()),
  wasSuccessful: z.boolean().optional()
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// All routes require authentication
router.use(requireAuth);

// Error handler wrapper
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================================
// HEALTH & DIAGNOSTICS
// ============================================================================

/**
 * GET /api/cortex/health
 * Health check for Cortex Prime
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = await cortex.healthCheck();
  res.json(health);
}));

/**
 * GET /api/cortex/stats
 * Statistics for Cortex Prime
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await cortex.getStatistics();
  res.json({ statistics: stats });
}));

// ============================================================================
// ATOM ROUTES
// ============================================================================

/**
 * POST /api/cortex/atoms
 * Create a new knowledge atom
 */
router.post('/atoms', 
  validateRequest(CreateAtomSchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const atom = await cortex.createAtom({
      orgId,
      ...req.body
    });
    res.status(201).json({ atom });
  })
);

/**
 * GET /api/cortex/atoms/:id
 * Get atom by ID
 */
router.get('/atoms/:id', asyncHandler(async (req, res) => {
  const atom = await cortex.getAtom(String(req.params.id ?? ""));
  if (!atom) {
    return res.status(404).json({ error: 'Atom not found' });
  }
  res.json({ atom });
}));

/**
 * PATCH /api/cortex/atoms/:id
 * Update atom
 */
router.patch('/atoms/:id',
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const atom = await cortex.updateAtom(String(req.params.id ?? ""), req.body);
    if (!atom) {
      return res.status(404).json({ error: 'Atom not found' });
    }
    res.json({ atom });
  })
);

/**
 * DELETE /api/cortex/atoms/:id
 * Soft delete atom
 */
router.delete('/atoms/:id',
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const deleted = await cortex.deleteAtom(String(req.params.id ?? ""));
    if (!deleted) {
      return res.status(404).json({ error: 'Atom not found' });
    }
    res.json({ success: true });
  })
);

// ============================================================================
// SEARCH ROUTES
// ============================================================================

/**
 * POST /api/cortex/search
 * Unified semantic search
 */
router.post('/search',
  validateRequest(SearchSchema),
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { query, queryEmbedding, ...options } = req.body;
    
    if (!queryEmbedding && !query) {
      return res.status(400).json({ error: 'Either query or queryEmbedding required' });
    }
    
    const results = await cortex.search(
      queryEmbedding || [],
      query,
      orgId,
      options
    );
    
    res.json({ results, count: results.length });
  })
);

/**
 * POST /api/cortex/search/fast
 * Fast search using 1536-dim embeddings
 */
router.post('/search/fast',
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { queryEmbedding, atomTypes, limit } = req.body;
    
    if (!queryEmbedding) {
      return res.status(400).json({ error: 'queryEmbedding required' });
    }
    
    const results = await cortex.searchFast(queryEmbedding, atomTypes, orgId, limit);
    res.json({ results, count: results.length });
  })
);

/**
 * POST /api/cortex/query
 * Master query endpoint
 */
router.post('/query',
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { query, queryEmbedding, ...options } = req.body;
    
    const results = await cortex.query(query, queryEmbedding, orgId, options);
    res.json(results);
  })
);

// ============================================================================
// GRAPH ROUTES
// ============================================================================

/**
 * POST /api/cortex/edges
 * Create edge between atoms
 */
router.post('/edges',
  validateRequest(CreateEdgeSchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const edge = await cortex.createEdge(req.body);
    res.status(201).json({ edge });
  })
);

/**
 * POST /api/cortex/traverse
 * Traverse reasoning graph
 */
router.post('/traverse',
  validateRequest(TraverseSchema),
  asyncHandler(async (req, res) => {
    const { startAtomId, edgeTypes, maxDepth, minStrength } = req.body;
    const results = await cortex.traverseReasoning(startAtomId, edgeTypes, maxDepth, minStrength);
    res.json({ results, count: results.length });
  })
);

// ============================================================================
// THREAD ROUTES
// ============================================================================

/**
 * POST /api/cortex/threads
 * Create conversation thread
 */
router.post('/threads',
  validateRequest(CreateThreadSchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const userId = req.user?.id;
    
    const thread = await cortex.createThread({
      orgId,
      userId,
      ...req.body
    });
    res.status(201).json({ thread });
  })
);

/**
 * GET /api/cortex/threads/:id
 * Get thread by ID
 */
router.get('/threads/:id', asyncHandler(async (req, res) => {
  const thread = await cortex.getThread(String(req.params.id ?? ""));
  if (!thread) {
    return res.status(404).json({ error: 'Thread not found' });
  }
  res.json({ thread });
}));

/**
 * GET /api/cortex/threads/:id/context
 * Assemble context for LLM
 */
router.get('/threads/:id/context', asyncHandler(async (req, res) => {
  const maxTokens = parseInt(req.query.maxTokens as string) || 8000;
  const includeHistory = req.query.includeHistory !== 'false';
  
  const context = await cortex.assembleContext(String(req.params.id ?? ""), maxTokens, includeHistory);
  res.json({ context });
}));

// ============================================================================
// TRACE ROUTES
// ============================================================================

/**
 * POST /api/cortex/traces
 * Create trace
 */
router.post('/traces',
  validateRequest(CreateTraceSchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const trace = await cortex.createTrace(req.body);
    res.status(201).json({ trace });
  })
);

/**
 * POST /api/cortex/traces/:id/complete
 * Complete trace with output
 */
router.post('/traces/:id/complete',
  validateRequest(CompleteTraceSchema),
  asyncHandler(async (req, res) => {
    const { output, status, tokenUsage } = req.body;
    const trace = await cortex.completeTrace(String(req.params.id ?? ""), output, status, tokenUsage);
    if (!trace) {
      return res.status(404).json({ error: 'Trace not found' });
    }
    res.json({ trace });
  })
);

// ============================================================================
// REGULATORY INTUITION ROUTES
// ============================================================================

/**
 * POST /api/cortex/intuition/signals
 * Extract regulatory signals from document
 */
router.post('/intuition/signals',
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { documentId, documentContent, documentType } = req.body;
    
    if (!documentId || !documentContent || !documentType) {
      return res.status(400).json({ error: 'documentId, documentContent, and documentType required' });
    }
    
    const signals = await cortex.extractRegulatorySignals(
      orgId!,
      documentId,
      documentContent,
      documentType
    );
    res.json({ signals, count: signals.length });
  })
);

/**
 * POST /api/cortex/intuition/predict
 * Generate intuition prediction
 */
router.post('/intuition/predict',
  validateRequest(PredictionSchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { submissionId, predictionType } = req.body;
    
    const prediction = await cortex.generatePrediction(orgId!, submissionId, predictionType);
    if (!prediction) {
      return res.status(404).json({ error: 'Could not generate prediction' });
    }
    res.json({ prediction });
  })
);

/**
 * POST /api/cortex/intuition/match-patterns
 * Match against rejection patterns
 */
router.post('/intuition/match-patterns',
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { submissionContent } = req.body;
    
    if (!submissionContent) {
      return res.status(400).json({ error: 'submissionContent required' });
    }
    
    const patterns = await cortex.matchRejectionPatterns(orgId!, submissionContent);
    res.json({ patterns, count: patterns.length });
  })
);

// ============================================================================
// EPISTEMIC INTELLIGENCE ROUTES
// ============================================================================

/**
 * POST /api/cortex/epistemic/uncertainty
 * Estimate uncertainty
 */
router.post('/epistemic/uncertainty',
  validateRequest(UncertaintySchema),
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { contextType, contextId, inputData } = req.body;
    
    const estimate = await cortex.estimateUncertainty(orgId!, contextType, contextId, inputData);
    if (!estimate) {
      return res.status(500).json({ error: 'Could not estimate uncertainty' });
    }
    res.json({ estimate });
  })
);

/**
 * POST /api/cortex/epistemic/gaps
 * Detect knowledge gaps
 */
router.post('/epistemic/gaps',
  requireOrgAccess,
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    const { domain, queryEmbedding } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'domain required' });
    }
    
    const gaps = await cortex.detectKnowledgeGaps(orgId!, domain, queryEmbedding);
    res.json({ gaps, count: gaps.length });
  })
);

// ============================================================================
// CAUSAL INFERENCE ROUTES
// ============================================================================

/**
 * POST /api/cortex/causal/effect
 * Estimate causal effect
 */
router.post('/causal/effect',
  validateRequest(CausalEffectSchema),
  asyncHandler(async (req, res) => {
    const { graphId, causeVariable, effectVariable } = req.body;
    
    const effect = await cortex.estimateCausalEffect(graphId, causeVariable, effectVariable);
    if (!effect) {
      return res.status(404).json({ error: 'Could not estimate causal effect' });
    }
    res.json({ effect });
  })
);

/**
 * POST /api/cortex/causal/counterfactual
 * Generate counterfactual scenario
 */
router.post('/causal/counterfactual',
  validateRequest(CounterfactualSchema),
  asyncHandler(async (req, res) => {
    const { graphId, interventions } = req.body;
    
    const scenario = await cortex.generateCounterfactual(graphId, interventions);
    res.json({ scenario });
  })
);

/**
 * POST /api/cortex/causal/interventions
 * Get intervention recommendations
 */
router.post('/causal/interventions',
  asyncHandler(async (req, res) => {
    const { graphId, targetOutcome, constraints } = req.body;
    
    if (!graphId || !targetOutcome) {
      return res.status(400).json({ error: 'graphId and targetOutcome required' });
    }
    
    const interventions = await cortex.recommendInterventions(graphId, targetOutcome, constraints);
    res.json({ interventions, count: interventions.length });
  })
);

// ============================================================================
// SELF-EVOLVING INTELLIGENCE ROUTES
// ============================================================================

/**
 * POST /api/cortex/evolution/experience
 * Record learning experience
 */
router.post('/evolution/experience',
  validateRequest(LearningExperienceSchema),
  asyncHandler(async (req, res) => {
    const orgId = req.user?.organizationId !== undefined ? String(req.user.organizationId) : undefined;
    
    const experience = await cortex.recordLearningExperience({
      orgId,
      ...req.body
    });
    res.status(201).json({ experience });
  })
);

/**
 * POST /api/cortex/evolution/distill
 * Run distillation
 */
router.post('/evolution/distill',
  asyncHandler(async (req, res) => {
    const minExperiences = parseInt(req.body.minExperiences) || 10;
    const insights = await cortex.runDistillation(minExperiences);
    res.json({ insights, count: insights.length });
  })
);

/**
 * GET /api/cortex/evolution/expertise
 * Get expertise scores
 */
router.get('/evolution/expertise', asyncHandler(async (req, res) => {
  const domain = req.query.domain as string;
  const scores = await cortex.getExpertiseScores(domain);
  res.json({ scores, count: scores.length });
}));

/**
 * POST /api/cortex/evolution/evolve
 * Trigger evolution cycle
 */
router.post('/evolution/evolve', asyncHandler(async (req, res) => {
  const result = await cortex.evolve();
  res.json(result);
}));

// ============================================================================
// CROSS-DOMAIN TRANSFER ROUTES
// ============================================================================

/**
 * POST /api/cortex/transfer/candidates
 * Find transfer candidates
 */
router.post('/transfer/candidates',
  validateRequest(TransferSchema),
  asyncHandler(async (req, res) => {
    const { targetDomainId, queryEmbedding, minSimilarity } = req.body;
    
    const candidates = await cortex.findTransferCandidates(
      targetDomainId,
      queryEmbedding,
      minSimilarity
    );
    res.json({ candidates, count: candidates.length });
  })
);

/**
 * POST /api/cortex/transfer/execute
 * Execute knowledge transfer
 */
router.post('/transfer/execute',
  validateRequest(ExecuteTransferSchema),
  asyncHandler(async (req, res) => {
    const { sourceKnowledgeId, targetDomainId, transformationRules } = req.body;
    
    const knowledge = await cortex.executeTransfer(
      sourceKnowledgeId,
      targetDomainId,
      transformationRules
    );
    
    if (!knowledge) {
      return res.status(500).json({ error: 'Transfer failed' });
    }
    res.json({ knowledge });
  })
);

/**
 * GET /api/cortex/transfer/similarity
 * Get domain similarity
 */
router.get('/transfer/similarity', asyncHandler(async (req, res) => {
  const { domain1, domain2 } = req.query;
  
  if (!domain1 || !domain2) {
    return res.status(400).json({ error: 'domain1 and domain2 required' });
  }
  
  const similarity = await cortex.getDomainSimilarity(
    domain1 as string,
    domain2 as string
  );
  res.json({ domain1, domain2, similarity });
}));

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Cortex API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default router;
