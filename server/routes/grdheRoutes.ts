/**
 * GRDHE API Routes - Global Regulatory Data Harmonization Engine
 * 
 * RESTful API endpoints for multi-jurisdictional regulatory data transformation.
 * Implements "One Entry, Many Exits" architecture for FDA, EMA, PMDA, and other agencies.
 * 
 * @version 1.0.0
 * @compliance 21 CFR Part 11, EU MDR 2017/745, GDPR Article 9, ISO 13485
 * 
 * API Structure:
 * - /api/grdhe/data-residency     - Data residency configuration
 * - /api/grdhe/terminology        - Terminology version management
 * - /api/grdhe/mappings           - Terminology and field mappings
 * - /api/grdhe/rules              - Mapping rule management
 * - /api/grdhe/exports            - Export job management
 * - /api/grdhe/adverse-events     - Canonical adverse event CRUD
 * - /api/grdhe/signatures         - Electronic signatures (21 CFR Part 11)
 * - /api/grdhe/audit              - Audit trail access
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  grdheService,
  AuditScopeError,
  ExportJobNotFoundError,
  AdverseEventNotFoundError,
  ExportJobRefusedError,
} from '../services/grdhe/grdheService';
import {
  DataRegion,
  TerminologySystem,
  RegulatoryFormat,
  ExportStatus,
  ExportJob,
  CreateExportJobRequest,
  CreateAdverseEventRequest
} from '../services/grdhe/types';
import {
  generateFDA3500AXML,
  generateE2BR3XML,
  validateForFDA,
  validateForE2BR3,
  SUPPORTED_FORMATS,
  SupportedFormat
} from '../services/grdhe/exportGenerators';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { authedActor } from '../utils/authedActor';

const router = Router();
const log = createScopedLogger('grdhe-routes');

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Audit logging middleware - logs all GRDHE API calls
 */
const auditMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Capture response
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = Date.now() - startTime;
    
    // Log to audit trail (async, don't await)
    if (process.env.GRDHE_AUDIT_ALL_REQUESTS === 'true') {
      console.log(`[GRDHE AUDIT] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Error handling wrapper
 */
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Assert an addressed tenant UUID matches the verified JWT's organizationUuid.
 *
 * The addressed tenant — whether it arrives in the URL path, the body, or the
 * query — MUST match the organizationUuid carried by the verified JWT.
 * Accepting it from a request field without this cross-check is exactly the
 * IDOR shape PRs #496-#499 closed. Shared by the path-param middleware
 * (validateTenantId) and the body-based write handlers below. Sends the failure
 * response and returns false; returns true when the caller may proceed.
 */
const assertTenantMatchesAuth = (req: Request, res: Response, tenantId: string): boolean => {
  if (!tenantId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_TENANT_ID',
        message: 'Tenant ID is required',
      },
    });
    return false;
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TENANT_ID',
        message: 'Tenant ID must be a valid UUID',
      },
    });
    return false;
  }

  const authedUuid =
    (req as any).user?.organizationUuid ??
    (req as any).tenantContext?.organizationUuid;
  if (!authedUuid || String(authedUuid).toLowerCase() !== tenantId.toLowerCase()) {
    res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_MISMATCH',
        message: 'Authenticated tenant does not match the requested tenant',
      },
    });
    return false;
  }

  return true;
};

const validateTenantId = (req: Request, res: Response, next: NextFunction) => {
  const tenantId = String(req.params.tenantId ?? '');
  if (!assertTenantMatchesAuth(req, res, tenantId)) return;
  next();
};

/**
 * The verified principal a GRDHE write is recorded against, or null after
 * answering 401. 2026-10-15: the service took the actor from
 * process.env.CURRENT_USER_ID, which nothing sets, so every write was recorded
 * as 'system', including for a token that identified no one.
 */
const requireWriteActor = (req: Request, res: Response): string | null => {
  const actor = authedActor(req);
  if (!actor) {
    res.status(401).json({
      success: false,
      error: {
        code: 'ACTOR_REQUIRED',
        message: 'A GRDHE write is recorded against the signed-in user, and this request identifies none',
      },
    });
    return null;
  }
  return actor;
};

/**
 * Why an export job may not be executed, or null. Completed and cancelled jobs
 * answer as before. 2026-10-15: a job listing several cases generated every
 * one, returned and recorded only the first, and was marked completed; it is
 * refused instead, one case per job.
 */
const executionRefusal = (job: ExportJob): { status: number; code: string; message: string } | null => {
  if (job.status === 'completed') {
    return { status: 400, code: 'JOB_ALREADY_COMPLETED', message: 'This export job has already been completed' };
  }
  if (job.status === 'cancelled') {
    return { status: 400, code: 'JOB_CANCELLED', message: 'This export job has been cancelled' };
  }
  if (job.sourceEntityIds.length !== 1) {
    return {
      status: 422,
      code: 'ONE_CASE_PER_EXPORT',
      message: `This export writes one case per job, and job ${job.id} lists ${job.sourceEntityIds.length}. Create one job per case.`,
    };
  }
  return null;
};

/** case_type and report_type as the canonical_adverse_events CHECK constraints accept them. */
const CASE_TYPES: readonly string[] = ['spontaneous', 'clinical_trial', 'literature', 'solicited', 'other'];
const REPORT_TYPES: readonly string[] = ['initial', 'followup', 'amendment', 'nullification'];

/** A calendar date as the ::date casts take it (YYYY-MM-DD, a day that exists). */
const isIsoDate = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** The SQLSTATE of a database error, under drizzle's "Failed query" wrapper. */
const sqlstate = (err: unknown): unknown =>
  (err as { cause?: { code?: unknown } } | null)?.cause?.code ?? (err as { code?: unknown } | null)?.code;

/*
 * 2026-10-15: the catches below answered 400 or 404 with error.message. Under
 * drizzle that is "Failed query: <SQL>\nparams: <values>" — the statement, its
 * relation names and the case's own field values — and a lost connection on a
 * read was a 404. A deliberate refusal keeps its answer in its own words;
 * anything else is the server's failure, logged against the request id
 * (serverError), never in the body.
 */
const notFound = (res: Response, code: string, message: string) =>
  res.status(404).json({ success: false, error: { code, message } });

router.use(auditMiddleware);

// =============================================================================
// DATA RESIDENCY ENDPOINTS
// =============================================================================

/**
 * GET /api/grdhe/data-residency/:tenantId
 * Get data residency configuration for a tenant
 */
router.get('/data-residency/:tenantId', validateTenantId, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId);
  
  const config = await grdheService.getDataResidencyConfig(tenantId);
  
  if (!config) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'DATA_RESIDENCY_NOT_FOUND',
        message: `No data residency configuration found for tenant ${tenantId}`
      }
    });
  }
  
  res.json({
    success: true,
    data: config
  });
}));

/**
 * POST /api/grdhe/data-residency
 * Create or update data residency configuration
 */
router.post('/data-residency', asyncHandler(async (req: Request, res: Response) => {
  // security-allow: tenantId is cross-checked against the JWT organizationUuid by assertTenantMatchesAuth below (grdhe keys on org UUID, not the numeric orgId requireAuthedOrgId returns).
  const { tenantId, primaryRegion, allowedProcessingRegions, ...rest } = req.body;

  const actor = requireWriteActor(req, res);
  if (!actor) return;
  if (!assertTenantMatchesAuth(req, res, String(tenantId ?? ''))) return;

  const config = await grdheService.setDataResidencyConfig(
    {
      tenantId,
      primaryRegion,
      allowedProcessingRegions,
      ...rest
    },
    actor
  );
  
  res.status(201).json({
    success: true,
    data: config
  });
}));

/**
 * POST /api/grdhe/data-residency/validate
 * Validate if tenant can process data in a specific region
 */
router.post('/data-residency/validate', asyncHandler(async (req: Request, res: Response) => {
  // security-allow: tenantId is cross-checked against the JWT organizationUuid by assertTenantMatchesAuth below (grdhe keys on org UUID, not the numeric orgId requireAuthedOrgId returns).
  const { tenantId, region } = req.body;

  if (!assertTenantMatchesAuth(req, res, String(tenantId ?? ''))) return;

  if (!region) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'Both tenantId and region are required'
      }
    });
  }

  const isValid = await grdheService.validateDataRegion(tenantId, region as DataRegion);
  
  res.json({
    success: true,
    data: {
      tenantId,
      region,
      isValid,
      message: isValid 
        ? `Tenant is authorized to process data in ${region}` 
        : `Tenant is NOT authorized to process data in ${region}`
    }
  });
}));

// =============================================================================
// TERMINOLOGY ENDPOINTS
// =============================================================================

/**
 * GET /api/grdhe/terminology/versions
 * List all terminology versions for a system
 */
router.get('/terminology/versions', asyncHandler(async (req: Request, res: Response) => {
  const { system } = req.query;
  
  if (!system) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_SYSTEM',
        message: 'Terminology system is required'
      }
    });
  }
  
  const versions = await grdheService.listTerminologyVersions(system as TerminologySystem);
  
  res.json({
    success: true,
    data: versions,
    count: versions.length
  });
}));

/**
 * GET /api/grdhe/terminology/versions/:versionId
 * Get a specific terminology version
 */
router.get('/terminology/versions/:versionId', asyncHandler(async (req: Request, res: Response) => {
  const versionId = String(req.params.versionId);
  
  const version = await grdheService.getTerminologyVersionById(versionId);
  
  if (!version) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'VERSION_NOT_FOUND',
        message: `Terminology version ${versionId} not found`
      }
    });
  }
  
  res.json({
    success: true,
    data: version
  });
}));

/**
 * GET /api/grdhe/terminology/current
 * Get current terminology version for system and jurisdiction
 */
router.get('/terminology/current', asyncHandler(async (req: Request, res: Response) => {
  const { system, jurisdiction, asOfDate } = req.query;
  
  if (!system) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_SYSTEM',
        message: 'Terminology system is required'
      }
    });
  }
  
  const version = await grdheService.getTerminologyVersion(
    system as TerminologySystem,
    jurisdiction as string || 'FDA',
    asOfDate ? new Date(asOfDate as string) : new Date()
  );
  
  if (!version) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'VERSION_NOT_FOUND',
        message: `No current version found for ${system} in ${jurisdiction || 'FDA'}`
      }
    });
  }
  
  res.json({
    success: true,
    data: version
  });
}));

/**
 * POST /api/grdhe/terminology/map
 * Map a terminology term to target system
 */
router.post('/terminology/map', asyncHandler(async (req: Request, res: Response) => {
  const { sourceSystem, sourceCode, targetSystem, targetJurisdiction } = req.body;
  
  if (!sourceSystem || !sourceCode || !targetSystem) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'sourceSystem, sourceCode, and targetSystem are required'
      }
    });
  }
  
  const mapping = await grdheService.mapTerminologyTerm(
    sourceSystem as TerminologySystem,
    sourceCode,
    targetSystem as TerminologySystem,
    targetJurisdiction || 'FDA'
  );
  
  res.json({
    success: true,
    data: mapping
  });
}));

/**
 * POST /api/grdhe/terminology/mappings
 * Add a new terminology mapping
 */
router.post('/terminology/mappings', asyncHandler(async (req: Request, res: Response) => {
  const mappingData = req.body;
  const actor = requireWriteActor(req, res);
  if (!actor) return;

  // Validate required fields
  const requiredFields = ['sourceSystem', 'sourceCode', 'targetSystem', 'targetCode', 'mappingType'];
  const missingFields = requiredFields.filter(f => !mappingData[f]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missingFields.join(', ')}`
      }
    });
  }
  
  const mappingId = await grdheService.addTerminologyMapping(mappingData, actor);
  
  res.status(201).json({
    success: true,
    data: { id: mappingId }
  });
}));

// =============================================================================
// MAPPING RULES ENDPOINTS
// =============================================================================

/**
 * GET /api/grdhe/rules
 * List mapping rules
 */
router.get('/rules', asyncHandler(async (req: Request, res: Response) => {
  const { targetFormat, sourceEntityType, isActive } = req.query;
  
  const rules = await grdheService.listMappingRules({
    targetFormat: targetFormat as RegulatoryFormat | undefined,
    sourceEntityType: sourceEntityType as string | undefined,
    isActive: isActive !== undefined ? isActive === 'true' : undefined
  });
  
  res.json({
    success: true,
    data: rules,
    count: rules.length
  });
}));

/**
 * GET /api/grdhe/rules/:ruleId
 * Get a specific mapping rule
 */
router.get('/rules/:ruleId', asyncHandler(async (req: Request, res: Response) => {
  const ruleId = String(req.params.ruleId);
  
  const rule = await grdheService.getMappingRuleById(ruleId);
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'RULE_NOT_FOUND',
        message: `Mapping rule ${ruleId} not found`
      }
    });
  }
  
  res.json({
    success: true,
    data: rule
  });
}));

/**
 * GET /api/grdhe/rules/format/:targetFormat/:sourceEntityType
 * Get mapping rule for format and entity type
 */
router.get('/rules/format/:targetFormat/:sourceEntityType', asyncHandler(async (req: Request, res: Response) => {
  const targetFormat = String(req.params.targetFormat);
  const sourceEntityType = String(req.params.sourceEntityType);

  const rule = await grdheService.getMappingRule(
    targetFormat as RegulatoryFormat,
    sourceEntityType
  );
  
  if (!rule) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'RULE_NOT_FOUND',
        message: `No approved mapping rule found for ${targetFormat}/${sourceEntityType}`
      }
    });
  }
  
  res.json({
    success: true,
    data: rule
  });
}));

// =============================================================================
// EXPORT JOB ENDPOINTS
// =============================================================================

/**
 * GET /api/grdhe/exports/formats
 * List supported export formats
 */
router.get('/exports/formats', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: SUPPORTED_FORMATS
  });
}));

/**
 * POST /api/grdhe/exports
 * Create a new export job
 */
router.post('/exports', asyncHandler(async (req: Request, res: Response) => {
  const request: CreateExportJobRequest = req.body;
  const actor = requireWriteActor(req, res);
  if (!actor) return;
  // 2026-10-15: the body's tenantId reached the service unchecked.
  if (!assertTenantMatchesAuth(req, res, String(request.tenantId ?? ''))) return;

  // Validate required fields
  const requiredFields = ['tenantId', 'sourceEntityType', 'sourceEntityIds', 'targetFormat', 'targetJurisdiction'];
  const missingFields = requiredFields.filter(f => !(request as any)[f]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missingFields.join(', ')}`
      }
    });
  }
  
  // Validate format is supported
  if (!Object.keys(SUPPORTED_FORMATS).includes(request.targetFormat)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNSUPPORTED_FORMAT',
        message: `Unsupported format: ${request.targetFormat}. Supported: ${Object.keys(SUPPORTED_FORMATS).join(', ')}`
      }
    });
  }

  // Case ids are UUIDs; anything else reached the ::uuid[] cast as a database error.
  const ids: unknown = request.sourceEntityIds;
  if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_SOURCE_ENTITY_IDS', message: 'sourceEntityIds must be a list of case ids (UUIDs)' },
    });
  }

  try {
    const job = await grdheService.createExportJob(request, actor);

    res.status(201).json({
      success: true,
      data: job
    });
  } catch (error: any) {
    if (!(error instanceof ExportJobRefusedError)) {
      return serverError(res, log, 'creating the export job', error);
    }
    res.status(400).json({
      success: false,
      error: {
        code: 'EXPORT_JOB_CREATION_FAILED',
        message: error.message
      }
    });
  }
}));

/**
 * GET /api/grdhe/exports/:jobId
 * Get export job status and details
 */
router.get('/exports/:jobId', asyncHandler(async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  
  try {
    const job = await grdheService.getExportJob(jobId);

    res.json({
      success: true,
      data: job
    });
  } catch (error: any) {
    if (!(error instanceof ExportJobNotFoundError)) {
      return serverError(res, log, 'reading the export job', error, { jobId });
    }
    notFound(res, 'JOB_NOT_FOUND', 'Export job not found');
  }
}));

/**
 * GET /api/grdhe/exports/tenant/:tenantId
 * List export jobs for a tenant
 */
router.get('/exports/tenant/:tenantId', validateTenantId, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId);
  const { status, targetFormat, limit, offset } = req.query;
  
  const jobs = await grdheService.listExportJobs(tenantId, {
    status: status as ExportStatus | undefined,
    targetFormat: targetFormat as RegulatoryFormat | undefined,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0
  });
  
  res.json({
    success: true,
    data: jobs,
    count: jobs.length
  });
}));

/**
 * POST /api/grdhe/exports/:jobId/execute
 * Execute an export job (generate XML)
 */
router.post('/exports/:jobId/execute', asyncHandler(async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const actor = requireWriteActor(req, res);
  if (!actor) return;

  try {
    // Get job details
    const job = await grdheService.getExportJob(jobId);

    const refusal = executionRefusal(job);
    if (refusal) {
      return res.status(refusal.status).json({ success: false, error: { code: refusal.code, message: refusal.message } });
    }

    // Update status to processing
    await grdheService.updateExportJobStatus(jobId, 'transforming', {
      progressPercent: 10,
      currentStep: 'Loading source data'
    }, actor);
    
    // Get source entities
    // For adverse events
    if (job.sourceEntityType === 'adverse_event') {
      const results: any[] = [];
      
      for (const entityId of job.sourceEntityIds) {
        // Update progress
        await grdheService.updateExportJobStatus(jobId, 'transforming', {
          progressPercent: 30,
          currentStep: `Processing entity ${entityId}`
        }, actor);
        
        // Get adverse event
        const event = await grdheService.getCanonicalAdverseEventById(entityId);
        
        // Generate XML based on format. job.targetFormat is typed as the
        // broad RegulatoryFormat union, but adverse-event export jobs store
        // the narrower SupportedFormat keys (the generators are keyed by
        // those), so compare against that vocabulary.
        let exportResult;

        switch (job.targetFormat as SupportedFormat) {
          case 'FDA_AE_3500A':
            exportResult = generateFDA3500AXML(event, job, job.terminologyVersions);
            break;
          case 'EMA_AE_E2B_R3':
            exportResult = generateE2BR3XML(event, job, job.terminologyVersions);
            break;
          default:
            return res.status(400).json({
              success: false,
              error: {
                code: 'UNSUPPORTED_FORMAT',
                message: `Export format ${job.targetFormat} is not yet implemented`
              }
            });
        }
        
        if (!exportResult.success) {
          await grdheService.updateExportJobStatus(jobId, 'failed', {
            errorMessage: 'Validation failed',
            errorDetails: { errors: exportResult.errors }
          }, actor);
          
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Export validation failed',
              details: exportResult.errors
            }
          });
        }
        
        results.push(exportResult);
      }
      
      // Complete the job. The XML is returned in this response and stored
      // nowhere, so the job records no output path (2026-10-15: it recorded
      // `/exports/<tenant>/<file>`, a file nothing wrote).
      if (results.length > 0 && results[0].content) {
        await grdheService.completeExportJob(jobId, {
          fileName: results[0].fileName || `export_${jobId}.xml`,
          content: results[0].content,
          mimeType: results[0].contentType
        }, actor);

        // Get updated job
        const completedJob = await grdheService.getExportJob(jobId);
        
        res.json({
          success: true,
          data: {
            job: completedJob,
            export: results[0]
          }
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_ENTITY_TYPE',
          message: `Entity type ${job.sourceEntityType} is not yet supported for export`
        }
      });
    }
  } catch (error: any) {
    // Update job status to failed
    try {
      await grdheService.updateExportJobStatus(jobId, 'failed', {
        errorMessage: error.message,
        errorDetails: { stack: error.stack }
      }, actor);
    } catch { /* non-blocking: best-effort status update */ }

    // The thrown text (driver or generator detail) goes to the log against the
    // request id, not into the body (P1-17, IAM-18 (1)).
    serverError(res, log, 'executing the export job', error, { jobId });
  }
}));

/**
 * POST /api/grdhe/exports/:jobId/cancel
 * Cancel an export job
 */
router.post('/exports/:jobId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const { reason } = req.body;
  const actor = requireWriteActor(req, res);
  if (!actor) return;

  try {
    await grdheService.updateExportJobStatus(jobId, 'cancelled', {
      errorMessage: reason || 'Cancelled by user'
    }, actor);
    
    const job = await grdheService.getExportJob(jobId);
    
    res.json({
      success: true,
      data: job
    });
  } catch (error: any) {
    // Not this tenant's job: say so, rather than a success with no job in it
    // (ledger L203).
    if (error instanceof ExportJobNotFoundError) {
      return notFound(res, 'NOT_FOUND', 'Export job not found');
    }
    serverError(res, log, 'cancelling the export job', error, { jobId });
  }
}));

// =============================================================================
// ADVERSE EVENT ENDPOINTS
// =============================================================================

/**
 * POST /api/grdhe/adverse-events
 * Create a canonical adverse event
 */
router.post('/adverse-events', asyncHandler(async (req: Request, res: Response) => {
  const request: CreateAdverseEventRequest = req.body;
  const actor = requireWriteActor(req, res);
  if (!actor) return;
  // 2026-10-15: the body's tenantId reached the service unchecked.
  if (!assertTenantMatchesAuth(req, res, String(request.tenantId ?? ''))) return;

  // Validate required fields (eventDate is NOT NULL in the table; a case
  // without one reached the database and came back as its error text).
  const requiredFields = ['tenantId', 'caseNumber', 'eventDate', 'receiveDate', 'patient', 'reactions', 'suspectProducts', 'reporter'];
  const missingFields = requiredFields.filter(f => !(request as any)[f]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missingFields.join(', ')}`
      }
    });
  }

  // 2026-10-15: intake stored `isSerious ?? false`, 'spontaneous' and
  // 'initial' when the caller said nothing, and the exports filed those as the
  // case's seriousness, report type and initial/follow-up status.
  const unstated = [
    typeof request.isSerious !== 'boolean' ? 'isSerious (true or false)' : null,
    !CASE_TYPES.includes(request.caseType) ? `caseType (one of ${CASE_TYPES.join(', ')})` : null,
    !REPORT_TYPES.includes(request.reportType) ? `reportType (one of ${REPORT_TYPES.join(', ')})` : null,
    !isIsoDate(request.eventDate) ? 'eventDate (YYYY-MM-DD)' : null,
    !isIsoDate(request.receiveDate) ? 'receiveDate (YYYY-MM-DD)' : null,
  ].filter((field): field is string => field !== null);
  if (unstated.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'CASE_FACTS_NOT_STATED',
        message: `A case states these; they are not assumed: ${unstated.join('; ')}`
      }
    });
  }

  try {
    const event = await grdheService.createCanonicalAdverseEvent(request, actor);

    res.status(201).json({
      success: true,
      data: event
    });
  } catch (error: any) {
    // unique (tenant_id, case_number, case_version): the case is already recorded.
    if (sqlstate(error) === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'CASE_EXISTS', message: `Case ${request.caseNumber} is already recorded for this tenant` },
      });
    }
    serverError(res, log, 'recording the adverse event', error);
  }
}));

/**
 * GET /api/grdhe/adverse-events/:eventId
 * Get adverse event by ID
 */
router.get('/adverse-events/:eventId', asyncHandler(async (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  
  try {
    const event = await grdheService.getCanonicalAdverseEventById(eventId);

    res.json({
      success: true,
      data: event
    });
  } catch (error: any) {
    if (!(error instanceof AdverseEventNotFoundError)) {
      return serverError(res, log, 'reading the adverse event', error, { eventId });
    }
    notFound(res, 'EVENT_NOT_FOUND', 'Adverse event not found');
  }
}));

/**
 * GET /api/grdhe/adverse-events/tenant/:tenantId/case/:caseNumber
 * Get adverse event by case number
 */
router.get('/adverse-events/tenant/:tenantId/case/:caseNumber', validateTenantId, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId);
  const caseNumber = String(req.params.caseNumber);
  const { version } = req.query;

  try {
    const event = await grdheService.getCanonicalAdverseEvent(
      tenantId,
      caseNumber,
      version ? parseInt(version as string) : undefined
    );

    res.json({
      success: true,
      data: event
    });
  } catch (error: any) {
    if (!(error instanceof AdverseEventNotFoundError)) {
      return serverError(res, log, 'reading the adverse event', error);
    }
    notFound(res, 'EVENT_NOT_FOUND', 'Adverse event not found');
  }
}));

/**
 * GET /api/grdhe/adverse-events/tenant/:tenantId
 * List adverse events for a tenant
 */
router.get('/adverse-events/tenant/:tenantId', validateTenantId, asyncHandler(async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId);
  const { status, isSerious, limit, offset } = req.query;
  
  const events = await grdheService.listCanonicalAdverseEvents(tenantId, {
    status: status as string | undefined,
    isSerious: isSerious !== undefined ? isSerious === 'true' : undefined,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0
  });
  
  res.json({
    success: true,
    data: events,
    count: events.length
  });
}));

/**
 * POST /api/grdhe/adverse-events/:eventId/validate
 * Validate adverse event for a specific format
 */
router.post('/adverse-events/:eventId/validate', asyncHandler(async (req: Request, res: Response) => {
  const eventId = String(req.params.eventId);
  const { targetFormat } = req.body;
  
  if (!targetFormat) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_FORMAT',
        message: 'targetFormat is required'
      }
    });
  }
  
  try {
    const event = await grdheService.getCanonicalAdverseEventById(eventId);
    
    let validation;
    switch (targetFormat) {
      case 'FDA_AE_3500A':
        validation = validateForFDA(event);
        break;
      case 'EMA_AE_E2B_R3':
        validation = validateForE2BR3(event);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_FORMAT',
            message: `Validation for ${targetFormat} is not yet implemented`
          }
        });
    }
    
    res.json({
      success: true,
      data: {
        valid: validation.errors.length === 0,
        errors: validation.errors,
        warnings: validation.warnings
      }
    });
  } catch (error: any) {
    if (!(error instanceof AdverseEventNotFoundError)) {
      return serverError(res, log, 'validating the adverse event', error, { eventId });
    }
    notFound(res, 'EVENT_NOT_FOUND', 'Adverse event not found');
  }
}));

// =============================================================================
// ELECTRONIC SIGNATURE ENDPOINTS (21 CFR Part 11) — retired 2026-09-10
// =============================================================================
//
// WO-16B findings 28 and 29. POST /signatures wrote a signature whose printed
// name was the user id, whose hash covered no content, and whose
// authentication was asserted but never performed; GET /signatures/:id/verify
// answered `valid: true` for every row it found. Both are gone. The routes stay
// so a caller is told where the one conforming path is, the same way
// POST /api/auth/enterprise/electronic-signature answers today
// (server/services/__tests__/signature-write-path-single.test.ts).

/**
 * POST /api/grdhe/signatures — REMOVED. Sign through /api/esignature/sign.
 */
router.post('/signatures', (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: {
      code: 'ESIGNATURE_ENDPOINT_REMOVED',
      message:
        'This endpoint recorded electronic signatures without verifying the signer and is retired. ' +
        'Use POST /api/esignature/sign, the single Part 11 signing path (credentials verified, content bound).',
      canonical: '/api/esignature/sign',
    },
  });
});

/**
 * GET /api/grdhe/signatures/:signatureId/verify — REMOVED. It verified nothing.
 */
router.get('/signatures/:signatureId/verify', (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: {
      code: 'ESIGNATURE_ENDPOINT_REMOVED',
      message:
        'This endpoint answered valid:true for every signature it found and is retired. ' +
        'Verify through GET /api/auth/enterprise/electronic-signature/:id/verify.',
      canonical: '/api/auth/enterprise/electronic-signature/:id/verify',
    },
  });
});

// =============================================================================
// AUDIT TRAIL ENDPOINTS
// =============================================================================

/**
 * GET /api/grdhe/audit/:tableName/:recordId
 * Get audit trail for a specific record
 */
router.get('/audit/:tableName/:recordId', asyncHandler(async (req: Request, res: Response) => {
  const tableName = String(req.params.tableName);
  const recordId = String(req.params.recordId);
  const { limit, offset } = req.query;
  
  // Validate table name (prevent SQL injection)
  const allowedTables = [
    'tenant_data_residency',
    'terminology_versions',
    'terminology_mappings',
    'mapping_rules',
    'export_jobs',
    'electronic_signatures',
    'canonical_adverse_events',
    'canonical_products'
  ];
  
  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TABLE',
        message: `Table ${tableName} is not auditable via this endpoint`
      }
    });
  }

  /* The allowlist above is an anti-SQL-injection measure — its own comment says
     so — and an allowlist is not an authorization check. Until 2026-09-10 it was
     the ONLY check here: recordId came straight off the URL, getAuditLog took no
     tenant, regulatory_harmonization.audit_log has no tenant column, and that
     schema carries no RLS policy (the sweep in 20260801_tenant_isolation_sweep.sql
     is `WHERE c.table_schema = 'public'`, so it cannot reach it). Any
     authenticated user of any tenant who supplied another tenant's record UUID
     got that record's full Part 11 before/after trail, old_data and new_data
     included.

     This is the IDOR shape the assertTenantMatchesAuth header above describes
     PRs #496-#499 closing elsewhere in this router. This endpoint was missed.
     Ownership is now proven in the service by joining the audited table, which
     is where the tenant key actually lives. */
  const authedTenantUuid =
    (req as any).user?.organizationUuid ??
    (req as any).tenantContext?.organizationUuid;
  if (!authedTenantUuid) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_CONTEXT_REQUIRED',
        message: 'An audit trail can only be read within a tenant context'
      }
    });
  }

  let auditLog;
  try {
    auditLog = await grdheService.getAuditLog(tableName, recordId, String(authedTenantUuid), {
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0
    });
  } catch (err) {
    /* Only a deliberate scope refusal answers 409. getAuditLog also runs an
       EXISTS probe and the audit query itself, and this used to catch EVERY
       throw — so a transient database error was reported to the caller as "this
       table cannot be tenant-scoped and is withheld", which is a false claim
       about the schema produced by an outage, in the same shape a real policy
       decision takes. A caller cannot retry a 409, and an operator reading it
       would go looking for a missing tenant column that is not missing.

       Today the refusals are: electronic_signatures (no tenant column at all —
       serving a Part 11 signature trail that cannot be attributed to a sponsor
       is the failure this endpoint's fix exists to stop) and any table added to
       the allowlist above without being classified in AUDITABLE_TABLE_SCOPES.
       See WO-13. Anything else rethrows to the router's error handler as a
       500, which is what it is. */
    if (!(err instanceof AuditScopeError)) throw err;

    return res.status(409).json({
      success: false,
      error: {
        code: err.code,
        message: `The audit trail for ${tableName} cannot be tenant-scoped and is withheld`
      }
    });
  }

  res.json({
    success: true,
    data: auditLog,
    count: auditLog.length
  });
}));

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * GET /api/grdhe/health
 * Health check endpoint
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      service: 'GRDHE',
      version: '1.0.0',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: {
        dataResidency: true,
        terminologyManagement: true,
        mappingRules: true,
        exportJobs: true,
        adverseEvents: true,
        // 2026-10-15: this said true while both signature routes answer 410
        // (retired 2026-09-10); signatures are made through /api/esignature/sign.
        electronicSignatures: false,
        auditTrail: true
      },
      supportedFormats: Object.keys(SUPPORTED_FORMATS)
    }
  });
}));

// =============================================================================
// ERROR HANDLER
// =============================================================================

router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  if (status >= 500) {
    // Every asyncHandler route without a catch of its own lands here. A server
    // failure's text (relation names, driver detail, a stack in development)
    // goes to the log against the request id, never into the body (P1-17,
    // IAM-18 (1)). An error that carries a 4xx status is a deliberate refusal
    // and keeps its answer below, unchanged.
    return serverError(res, log, 'handling the GRDHE request', err);
  }
  console.error('[GRDHE ERROR]', err);

  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

export default router;
