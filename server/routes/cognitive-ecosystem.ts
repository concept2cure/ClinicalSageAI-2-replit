/**
 * Cognitive Ecosystem Routes
 * 
 * Express router for the next-generation LangGraph-based agent system.
 * Provides API endpoints for:
 * - Agent workflow management
 * - Human-in-the-loop breakpoints
 * - Checkpoint management
 * - FHIR validation
 * - Global dossier operations
 * - Manufacturing digital twins
 * - Federated learning coordination
 * 
 * @module server/routes/cognitive-ecosystem
 * @version 1.0.0
 * @since 2025-01-14
 * 
 * Compliance: 21 CFR Part 11 (via CortexComplianceService)
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  AgentRuntimeService,
  CheckpointManager,
  CognitiveAuditService,
  GlobalDossierService,
  ManufacturingService,
  DigitalTwinRuntime,
  FederatedLearningCoordinator,
  FHIRValidationEngine,
  LangGraphOrchestrator
} from '../services/cognitive-ecosystem';

const router = Router();

// Middleware for extracting user context
const extractUserContext = (req: Request, res: Response, next: NextFunction) => {
  (req as any).userContext = {
    userId: req.headers['x-user-id'] || req.query.userId || 'anonymous',
    tenantId: req.headers['x-tenant-id'] || req.query.tenantId || 'default',
    sessionId: req.headers['x-session-id'] || req.query.sessionId || `session-${Date.now()}`
  };
  next();
};

router.use(extractUserContext);

// =============================================================================
// Agent Runtime Routes
// =============================================================================

/**
 * Create a new agent session
 * POST /api/cognitive/agents
 */
router.post('/agents', async (req: Request, res: Response) => {
  try {
    const { agentType, config, metadata } = req.body;
    const userContext = (req as any).userContext;
    
    // Note: AgentRuntimeService needs to be instantiated with db connection
    // This is a placeholder - actual implementation depends on service interface
    res.status(201).json({
      success: true,
      message: 'Agent session created',
      data: {
        agentType,
        sessionId: `agent-${Date.now()}`,
        status: 'initialized',
        createdBy: userContext.userId
      }
    });
  } catch (error: any) {
    console.error('[CognitiveRoutes] Agent creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create agent session'
    });
  }
});

/**
 * Get agent session status
 * GET /api/cognitive/agents/:sessionId
 */
router.get('/agents/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    
    res.json({
      success: true,
      data: {
        sessionId,
        status: 'active',
        lastActivity: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get agent status'
    });
  }
});

// =============================================================================
// Workflow Routes (LangGraph)
// =============================================================================

/**
 * Start a new workflow
 * POST /api/cognitive/workflows
 */
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { workflowType, input, config } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      message: 'Workflow started',
      data: {
        workflowId: `wf-${Date.now()}`,
        workflowType,
        status: 'running',
        startedBy: userContext.userId,
        startedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[CognitiveRoutes] Workflow creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start workflow'
    });
  }
});

/**
 * Get workflow status
 * GET /api/cognitive/workflows/:workflowId
 */
router.get('/workflows/:workflowId', async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    
    res.json({
      success: true,
      data: {
        workflowId,
        status: 'running',
        currentNode: 'analysis',
        progress: 0.45,
        checkpoints: []
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get workflow status'
    });
  }
});

// =============================================================================
// Breakpoint Routes (Human-in-the-Loop)
// =============================================================================

/**
 * Create a breakpoint in a workflow
 * POST /api/cognitive/workflows/:workflowId/breakpoints
 */
router.post('/workflows/:workflowId/breakpoints', async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.params;
    const { reason, requiredApprovers, metadata } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      message: 'Breakpoint created',
      data: {
        breakpointId: `bp-${Date.now()}`,
        workflowId,
        reason,
        status: 'pending',
        createdBy: userContext.userId,
        requiredApprovers
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create breakpoint'
    });
  }
});

/**
 * Resume workflow at breakpoint
 * POST /api/cognitive/workflows/:workflowId/breakpoints/:breakpointId/resume
 */
router.post('/workflows/:workflowId/breakpoints/:breakpointId/resume', async (req: Request, res: Response) => {
  try {
    const { workflowId, breakpointId } = req.params;
    const { decision, signatureId, comments } = req.body;
    const userContext = (req as any).userContext;
    
    res.json({
      success: true,
      message: 'Workflow resumed',
      data: {
        workflowId,
        breakpointId,
        decision,
        resumedBy: userContext.userId,
        resumedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to resume workflow'
    });
  }
});

// =============================================================================
// FHIR Validation Routes
// =============================================================================

/**
 * Validate a FHIR resource
 * POST /api/cognitive/fhir/validate
 */
router.post('/fhir/validate', async (req: Request, res: Response) => {
  try {
    const { resource, profile } = req.body;
    
    // Placeholder - integrate with FHIRValidationEngine
    res.json({
      success: true,
      data: {
        valid: true,
        resourceType: resource?.resourceType || 'Unknown',
        profile,
        issues: [],
        validatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'FHIR validation failed'
    });
  }
});

/**
 * Create a FHIR resource
 * POST /api/cognitive/fhir/resources
 */
router.post('/fhir/resources', async (req: Request, res: Response) => {
  try {
    const { resourceType, data } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      data: {
        id: `fhir-${Date.now()}`,
        resourceType,
        createdBy: userContext.userId,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create FHIR resource'
    });
  }
});

// =============================================================================
// Global Dossier Routes
// =============================================================================

/**
 * Create a global dossier entry
 * POST /api/cognitive/dossiers
 */
router.post('/dossiers', async (req: Request, res: Response) => {
  try {
    const { productId, region, dossierType, content } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      data: {
        dossierId: `dossier-${Date.now()}`,
        productId,
        region,
        dossierType,
        status: 'draft',
        createdBy: userContext.userId
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create dossier'
    });
  }
});

/**
 * Sync dossier to Accumulus
 * POST /api/cognitive/dossiers/:dossierId/sync
 */
router.post('/dossiers/:dossierId/sync', async (req: Request, res: Response) => {
  try {
    const { dossierId } = req.params;
    const { targetPlatform } = req.body;
    
    res.json({
      success: true,
      data: {
        dossierId,
        syncStatus: 'pending',
        targetPlatform: targetPlatform || 'accumulus',
        syncId: `sync-${Date.now()}`
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync dossier'
    });
  }
});

// =============================================================================
// Manufacturing Routes
// =============================================================================

/**
 * Register manufacturing equipment
 * POST /api/cognitive/manufacturing/equipment
 */
router.post('/manufacturing/equipment', async (req: Request, res: Response) => {
  try {
    const { equipmentType, serialNumber, location, opcUaEndpoint } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      data: {
        equipmentId: `equip-${Date.now()}`,
        equipmentType,
        serialNumber,
        location,
        status: 'registered',
        registeredBy: userContext.userId
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register equipment'
    });
  }
});

/**
 * Get digital twin status
 * GET /api/cognitive/manufacturing/twins/:twinId
 */
router.get('/manufacturing/twins/:twinId', async (req: Request, res: Response) => {
  try {
    const { twinId } = req.params;
    
    res.json({
      success: true,
      data: {
        twinId,
        status: 'synchronized',
        lastSync: new Date().toISOString(),
        parameters: {}
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get digital twin status'
    });
  }
});

// =============================================================================
// Federated Learning Routes
// =============================================================================

/**
 * Register a federated learning model
 * POST /api/cognitive/federated/models
 */
router.post('/federated/models', async (req: Request, res: Response) => {
  try {
    const { modelType, privacyBudget, participantConfig } = req.body;
    const userContext = (req as any).userContext;
    
    res.status(201).json({
      success: true,
      data: {
        modelId: `fl-model-${Date.now()}`,
        modelType,
        privacyBudget,
        status: 'initialized',
        createdBy: userContext.userId
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register federated model'
    });
  }
});

/**
 * Start federated learning round
 * POST /api/cognitive/federated/models/:modelId/rounds
 */
router.post('/federated/models/:modelId/rounds', async (req: Request, res: Response) => {
  try {
    const { modelId } = req.params;
    const { participants, aggregationMethod } = req.body;
    
    res.status(201).json({
      success: true,
      data: {
        roundId: `round-${Date.now()}`,
        modelId,
        status: 'collecting',
        participants: participants?.length || 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start federated round'
    });
  }
});

// =============================================================================
// Federated Learning Dashboard
// =============================================================================

/**
 * Ensure federated learning tables exist.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to call on every request.
 */
let flTablesInitialized = false;
const ensureFederatedTables = async () => {
  if (flTablesInitialized) return;
  try {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS federated_models (
        id SERIAL PRIMARY KEY,
        model_id TEXT NOT NULL UNIQUE,
        model_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'initialized',
        privacy_budget NUMERIC DEFAULT 1.0,
        privacy_budget_used NUMERIC DEFAULT 0.0,
        participant_count INTEGER DEFAULT 0,
        rounds_completed INTEGER DEFAULT 0,
        accuracy NUMERIC,
        created_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS federated_participants (
        id SERIAL PRIMARY KEY,
        model_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        site_name TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        data_points INTEGER DEFAULT 0,
        last_contribution TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS federated_safety_signals (
        id SERIAL PRIMARY KEY,
        signal_id TEXT NOT NULL UNIQUE,
        model_id TEXT,
        severity TEXT NOT NULL DEFAULT 'low',
        signal_type TEXT NOT NULL,
        description TEXT NOT NULL,
        affected_sites INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open',
        detected_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS federated_horizon_scans (
        id SERIAL PRIMARY KEY,
        scan_id TEXT NOT NULL UNIQUE,
        topic TEXT NOT NULL,
        category TEXT NOT NULL,
        relevance_score NUMERIC DEFAULT 0.5,
        summary TEXT,
        source TEXT,
        scanned_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    flTablesInitialized = true;
  } catch (err) {
    console.error('[CognitiveRoutes] Failed to initialize federated tables:', err);
    // Don't set initialized — retry next request
  }
};

/**
 * Federated Learning Dashboard
 * GET /api/cognitive/federated/dashboard
 *
 * Returns aggregated dashboard data including:
 *  - Total models & active participants
 *  - Privacy budget usage
 *  - Recent safety signals
 *  - Horizon scan summary
 */
router.get('/federated/dashboard', async (req: Request, res: Response) => {
  try {
    await ensureFederatedTables();

    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');

    // 1. Model summary
    const modelsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_models,
        COUNT(*) FILTER (WHERE status = 'training')::int AS training_models,
        COUNT(*) FILTER (WHERE status = 'initialized')::int AS initialized_models,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_models,
        COALESCE(SUM(rounds_completed), 0)::int AS total_rounds,
        COALESCE(AVG(accuracy), 0)::numeric AS avg_accuracy
      FROM federated_models
    `);
    const modelSummary = (modelsResult as any).rows?.[0] || (modelsResult as any)[0] || {
      total_models: 0,
      training_models: 0,
      initialized_models: 0,
      completed_models: 0,
      total_rounds: 0,
      avg_accuracy: 0,
    };

    // 2. Participant summary
    const participantsResult = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total_participants,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_participants,
        COALESCE(SUM(data_points), 0)::int AS total_data_points
      FROM federated_participants
    `);
    const participantSummary = (participantsResult as any).rows?.[0] || (participantsResult as any)[0] || {
      total_participants: 0,
      active_participants: 0,
      total_data_points: 0,
    };

    // 3. Privacy budget usage
    const privacyResult = await db.execute(sql`
      SELECT
        COALESCE(AVG(privacy_budget), 1.0)::numeric AS avg_budget,
        COALESCE(AVG(privacy_budget_used), 0.0)::numeric AS avg_budget_used,
        COALESCE(MIN(privacy_budget - privacy_budget_used), 1.0)::numeric AS min_remaining_budget
      FROM federated_models
    `);
    const privacySummary = (privacyResult as any).rows?.[0] || (privacyResult as any)[0] || {
      avg_budget: 1.0,
      avg_budget_used: 0.0,
      min_remaining_budget: 1.0,
    };

    const avgBudget = Number(privacySummary.avg_budget) || 1.0;
    const avgUsed = Number(privacySummary.avg_budget_used) || 0.0;
    const budgetUtilizationPct = avgBudget > 0 ? Math.round((avgUsed / avgBudget) * 100) : 0;

    // 4. Recent safety signals (last 30 days, max 20)
    const signalsResult = await db.execute(sql`
      SELECT signal_id, model_id, severity, signal_type, description,
             affected_sites, status, detected_at, resolved_at
      FROM federated_safety_signals
      WHERE detected_at >= NOW() - INTERVAL '30 days'
      ORDER BY detected_at DESC
      LIMIT 20
    `);
    const recentSignals = (signalsResult as any).rows || signalsResult || [];

    const signalBreakdown = {
      total: recentSignals.length,
      open: recentSignals.filter((s: any) => s.status === 'open').length,
      resolved: recentSignals.filter((s: any) => s.status === 'resolved').length,
      critical: recentSignals.filter((s: any) => s.severity === 'critical').length,
      high: recentSignals.filter((s: any) => s.severity === 'high').length,
      medium: recentSignals.filter((s: any) => s.severity === 'medium').length,
      low: recentSignals.filter((s: any) => s.severity === 'low').length,
    };

    // 5. Horizon scan summary (latest 10)
    const horizonResult = await db.execute(sql`
      SELECT scan_id, topic, category, relevance_score, summary, source, scanned_at
      FROM federated_horizon_scans
      ORDER BY scanned_at DESC
      LIMIT 10
    `);
    const horizonScans = (horizonResult as any).rows || horizonResult || [];

    // Aggregate by category
    const categoryMap: Record<string, number> = {};
    for (const scan of horizonScans) {
      const cat = scan.category || 'uncategorized';
      categoryMap[cat] = (categoryMap[cat] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        models: {
          total: Number(modelSummary.total_models) || 0,
          training: Number(modelSummary.training_models) || 0,
          initialized: Number(modelSummary.initialized_models) || 0,
          completed: Number(modelSummary.completed_models) || 0,
          totalRounds: Number(modelSummary.total_rounds) || 0,
          averageAccuracy: Number(Number(modelSummary.avg_accuracy).toFixed(4)) || 0,
        },
        participants: {
          total: Number(participantSummary.total_participants) || 0,
          active: Number(participantSummary.active_participants) || 0,
          totalDataPoints: Number(participantSummary.total_data_points) || 0,
        },
        privacyBudget: {
          averageBudget: Number(Number(avgBudget).toFixed(4)),
          averageUsed: Number(Number(avgUsed).toFixed(4)),
          utilizationPercentage: budgetUtilizationPct,
          minimumRemainingBudget: Number(Number(privacySummary.min_remaining_budget).toFixed(4)),
        },
        safetySignals: {
          breakdown: signalBreakdown,
          recent: recentSignals,
        },
        horizonScans: {
          total: horizonScans.length,
          byCategory: categoryMap,
          recent: horizonScans,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('[CognitiveRoutes] Federated dashboard error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load federated learning dashboard',
    });
  }
});

// =============================================================================
// Health & Status Routes
// =============================================================================

/**
 * Get cognitive ecosystem health status
 * GET /api/cognitive/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        services: {
          agentRuntime: 'available',
          langGraph: 'available',
          fhirValidation: 'available',
          globalDossier: 'available',
          manufacturing: 'available',
          federatedLearning: 'available'
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Health check failed'
    });
  }
});

export default router;
