/**
 * =============================================================================
 * Cognitive Regulatory Ecosystem - API Routes
 * =============================================================================
 * Express router exposing the cognitive ecosystem capabilities through
 * RESTful endpoints with authentication, validation, and error handling.
 * =============================================================================
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import {
  AgentRuntimeService,
  CheckpointManager,
  CognitiveAuditService,
  GlobalDossierService,
  ManufacturingService,
  DigitalTwinRuntime,
  FederatedLearningCoordinator,
  FHIRValidationEngine,
  LangGraphOrchestrator,
  AgentType,
  ThreadStatus,
  BreakpointType,
  BreakpointStatus,
  AuditSeverity,
  DossierType,
  DossierStatus,
  BatchStatus,
  FederatedModelType,
  FederatedModelStatus,
  SignalSeverity,
  HorizonScanCategory
} from '../services/cognitive-ecosystem';

// ===========================================================================
// TYPES
// ===========================================================================

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    email: string;
    roles: string[];
  };
}

interface RouterConfig {
  pool: Pool;
}

// ===========================================================================
// MIDDLEWARE
// ===========================================================================

/**
 * Require authentication middleware
 */
const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

/**
 * Require tenant ID middleware
 */
const requireTenant = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user?.tenantId) {
    res.status(400).json({ error: 'Tenant ID required' });
    return;
  }
  next();
};

/**
 * Error handler wrapper
 */
const asyncHandler = (fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
};

// ===========================================================================
// ROUTER FACTORY
// ===========================================================================

export function createCognitiveEcosystemRouter(config: RouterConfig): Router {
  const router = Router();
  const { pool } = config;

  // Initialize services
  const agentRuntime = new AgentRuntimeService({ pool });
  const checkpointManager = new CheckpointManager({ pool });
  const auditService = new CognitiveAuditService({ pool });
  const dossierService = new GlobalDossierService({ pool });
  const manufacturingService = new ManufacturingService({ pool });
  const digitalTwinRuntime = new DigitalTwinRuntime({ pool });
  const federatedLearning = new FederatedLearningCoordinator({ pool });
  const fhirValidation = new FHIRValidationEngine({ pool });

  // ===========================================================================
  // AGENT RUNTIME ROUTES
  // ===========================================================================

  /**
   * Create agent definition
   */
  router.post('/agents', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await agentRuntime.createAgentDefinition({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get agent definition
   */
  router.get('/agents/:agentId', requireAuth, asyncHandler(async (req, res) => {
    const result = await agentRuntime.getAgentDefinition(req.params.agentId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Create thread
   */
  router.post('/threads', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId, id: userId } = req.user!;
    const result = await agentRuntime.createThread({
      tenantId,
      userId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get thread
   */
  router.get('/threads/:threadId', requireAuth, asyncHandler(async (req, res) => {
    const result = await agentRuntime.getThread(req.params.threadId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Save checkpoint
   */
  router.post('/threads/:threadId/checkpoints', requireAuth, asyncHandler(async (req, res) => {
    const { userId } = req.user!;
    const result = await agentRuntime.saveCheckpoint({
      threadId: req.params.threadId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get checkpoint history
   */
  router.get('/threads/:threadId/checkpoints', requireAuth, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await checkpointManager.getCheckpointHistory(req.params.threadId, limit);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Create HITL breakpoint
   */
  router.post('/threads/:threadId/breakpoints', requireAuth, asyncHandler(async (req, res) => {
    const result = await agentRuntime.createHITLBreakpoint({
      threadId: req.params.threadId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Resolve HITL breakpoint
   */
  router.post('/breakpoints/:breakpointId/resolve', requireAuth, asyncHandler(async (req, res) => {
    const { id: userId } = req.user!;
    const result = await agentRuntime.resolveHITLBreakpoint(
      req.params.breakpointId,
      userId,
      req.body.decision,
      req.body.feedback
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  // ===========================================================================
  // COGNITIVE AUDIT ROUTES
  // ===========================================================================

  /**
   * Log audit event
   */
  router.post('/audit/events', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId, id: userId } = req.user!;
    const result = await auditService.logEvent({
      tenantId,
      actorId: userId,
      actorType: 'user',
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Query audit logs
   */
  router.get('/audit/events', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await auditService.queryAuditLogs(tenantId, {
      entityType: req.query.entityType as string,
      entityId: req.query.entityId as string,
      action: req.query.action as string,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 50
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Verify hash chain
   */
  router.get('/audit/verify/:entityType/:entityId', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await auditService.verifyHashChain(
      tenantId,
      req.params.entityType,
      req.params.entityId
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Create e-signature
   */
  router.post('/audit/signatures', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId, id: userId } = req.user!;
    const result = await auditService.createSignature({
      tenantId,
      signerId: userId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Verify e-signature
   */
  router.get('/audit/signatures/:signatureId/verify', requireAuth, asyncHandler(async (req, res) => {
    const result = await auditService.verifySignature(req.params.signatureId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  // ===========================================================================
  // GLOBAL DOSSIER ROUTES
  // ===========================================================================

  /**
   * Create dossier
   */
  router.post('/dossiers', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await dossierService.createDossier({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get dossier
   */
  router.get('/dossiers/:dossierId', requireAuth, asyncHandler(async (req, res) => {
    const result = await dossierService.getDossier(req.params.dossierId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Create regional branch
   */
  router.post('/dossiers/:dossierId/branches', requireAuth, asyncHandler(async (req, res) => {
    const result = await dossierService.createRegionalBranch(
      req.params.dossierId,
      req.body
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Sync global to regional
   */
  router.post('/dossiers/branches/:branchId/sync', requireAuth, asyncHandler(async (req, res) => {
    const result = await dossierService.syncGlobalToRegional(
      req.params.branchId,
      req.body.sectionIds
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Add regulatory comment
   */
  router.post('/dossiers/:dossierId/comments', requireAuth, asyncHandler(async (req, res) => {
    const result = await dossierService.addRegulatoryComment(
      req.params.dossierId,
      req.body
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  // ===========================================================================
  // MANUFACTURING ROUTES
  // ===========================================================================

  /**
   * Register equipment
   */
  router.post('/manufacturing/equipment', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await manufacturingService.registerEquipment({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get equipment
   */
  router.get('/manufacturing/equipment/:equipmentId', requireAuth, asyncHandler(async (req, res) => {
    const result = await manufacturingService.getEquipment(req.params.equipmentId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Create batch record
   */
  router.post('/manufacturing/batches', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId, id: userId } = req.user!;
    const result = await manufacturingService.createBatchRecord({
      tenantId,
      initiatedBy: userId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get batch record
   */
  router.get('/manufacturing/batches/:batchId', requireAuth, asyncHandler(async (req, res) => {
    const result = await manufacturingService.getBatchRecord(req.params.batchId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Record test result
   */
  router.post('/manufacturing/batches/:batchId/tests', requireAuth, asyncHandler(async (req, res) => {
    const { id: userId } = req.user!;
    const result = await manufacturingService.recordTestResult({
      batchId: req.params.batchId,
      performedBy: userId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Check batch release readiness
   */
  router.get('/manufacturing/batches/:batchId/release-readiness', requireAuth, asyncHandler(async (req, res) => {
    const result = await manufacturingService.checkBatchReleaseReadiness(req.params.batchId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Transform ISA-95 to FHIR
   */
  router.post('/manufacturing/transform/isa95-to-fhir', requireAuth, asyncHandler(async (req, res) => {
    const result = await manufacturingService.transformISA95ToFHIR(
      req.body.mappingId,
      req.body.isa95Data
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  // ===========================================================================
  // DIGITAL TWIN ROUTES
  // ===========================================================================

  /**
   * Create digital twin
   */
  router.post('/digital-twins', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await digitalTwinRuntime.createDigitalTwin({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get digital twin
   */
  router.get('/digital-twins/:twinId', requireAuth, asyncHandler(async (req, res) => {
    const result = await digitalTwinRuntime.getDigitalTwin(req.params.twinId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Sync from physical asset
   */
  router.post('/digital-twins/:twinId/sync', requireAuth, asyncHandler(async (req, res) => {
    const result = await digitalTwinRuntime.syncFromPhysicalAsset(
      req.params.twinId,
      req.body.sensorData
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Generate RTRT prediction
   */
  router.post('/digital-twins/:twinId/predictions', requireAuth, asyncHandler(async (req, res) => {
    const result = await digitalTwinRuntime.generateRTRTPrediction(
      req.params.twinId,
      req.body.inputParameters,
      req.body.predictionType
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Analyze drift
   */
  router.post('/digital-twins/:twinId/drift-analysis', requireAuth, asyncHandler(async (req, res) => {
    const result = await digitalTwinRuntime.analyzeDrift(
      req.params.twinId,
      req.body.actualOutcome
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  // ===========================================================================
  // FEDERATED LEARNING ROUTES
  // ===========================================================================

  /**
   * Create federated model
   */
  router.post('/federated/models', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await federatedLearning.createFederatedModel({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get federated model
   */
  router.get('/federated/models/:modelId', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.getFederatedModel(req.params.modelId);

    if (!result.success) {
      res.status(404).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Register participant
   */
  router.post('/federated/models/:modelId/participants', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.registerParticipant(
      req.params.modelId,
      req.body
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get model participants
   */
  router.get('/federated/models/:modelId/participants', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.getModelParticipants(req.params.modelId, {
      status: req.query.status as any
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Submit gradient
   */
  router.post('/federated/models/:modelId/gradients', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.submitGradient(req.params.modelId, {
      participantId: req.body.participantId,
      roundNumber: req.body.roundNumber,
      encryptedGradient: Buffer.from(req.body.encryptedGradient, 'base64'),
      sampleCount: req.body.sampleCount,
      localMetrics: req.body.localMetrics
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Aggregate gradients
   */
  router.post('/federated/models/:modelId/aggregate', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.aggregateGradients(req.params.modelId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Check privacy budget
   */
  router.get('/federated/participants/:participantId/privacy-budget', requireAuth, asyncHandler(async (req, res) => {
    const result = await federatedLearning.checkPrivacyBudget(req.params.participantId);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Report safety signal
   */
  router.post('/federated/safety-signals', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await federatedLearning.reportSafetySignal({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get active signals
   */
  router.get('/federated/safety-signals', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await federatedLearning.getActiveSignals(tenantId, {
      productIds: req.query.productIds ? (req.query.productIds as string).split(',') : undefined,
      severity: req.query.severity as SignalSeverity
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Add horizon scan
   */
  router.post('/federated/horizon-scans', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await federatedLearning.addHorizonScan({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get actionable scans
   */
  router.get('/federated/horizon-scans/actionable', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await federatedLearning.getActionableScans(tenantId, {
      category: req.query.category as HorizonScanCategory
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  // ===========================================================================
  // FHIR VALIDATION ROUTES
  // ===========================================================================

  /**
   * Create validation rule
   */
  router.post('/fhir/rules', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.createValidationRule({
      tenantId,
      ...req.body
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.data);
  }));

  /**
   * Get validation rules
   */
  router.get('/fhir/rules', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.getValidationRules(
      tenantId,
      req.query.resourceType as string,
      {
        profileUrl: req.query.profileUrl as string,
        includeInactive: req.query.includeInactive === 'true'
      }
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Validate resource
   */
  router.post('/fhir/validate', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.validateResource(tenantId, {
      resource: req.body.resource,
      profileUrl: req.body.profileUrl,
      ruleIds: req.body.ruleIds,
      includeWarnings: req.body.includeWarnings
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Batch validate resources
   */
  router.post('/fhir/validate/batch', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.validateBatch(tenantId, {
      resources: req.body.resources,
      stopOnFirstError: req.body.stopOnFirstError
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Get validation history
   */
  router.get('/fhir/validation-history/:resourceType/:resourceId', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.getValidationHistory(
      tenantId,
      req.params.resourceType,
      req.params.resourceId,
      { limit: parseInt(req.query.limit as string) || 10 }
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json(result.data);
  }));

  /**
   * Install built-in rules
   */
  router.post('/fhir/rules/install-builtin', requireAuth, requireTenant, asyncHandler(async (req, res) => {
    const { tenantId } = req.user!;
    const result = await fhirValidation.installBuiltInRules(
      tenantId,
      req.body.resourceTypes
    );

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ installedCount: result.data });
  }));

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  router.get('/health', asyncHandler(async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          agentRuntime: 'ready',
          checkpointManager: 'ready',
          auditService: 'ready',
          dossierService: 'ready',
          manufacturingService: 'ready',
          digitalTwinRuntime: 'ready',
          federatedLearning: 'ready',
          fhirValidation: 'ready'
        }
      });
    } catch (error) {
      res.status(503).json({ 
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Database connection failed'
      });
    }
  }));

  return router;
}

export default createCognitiveEcosystemRouter;
