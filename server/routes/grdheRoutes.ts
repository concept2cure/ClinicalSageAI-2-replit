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
import { grdheService } from '../services/grdhe/grdheService';
import {
  DataRegion,
  TerminologySystem,
  RegulatoryFormat,
  ExportStatus,
  SignatureMeaning,
  CreateExportJobRequest,
  CreateAdverseEventRequest,
  SignatureRequest
} from '../services/grdhe/types';
import {
  generateFDA3500AXML,
  generateE2BR3XML,
  validateForFDA,
  validateForE2BR3,
  SUPPORTED_FORMATS,
  SupportedFormat
} from '../services/grdhe/exportGenerators';

const router = Router();

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
 * Validate tenant ID middleware.
 *
 * The URL-path `:tenantId` is the addressed tenant. It MUST match the
 * organizationUuid carried by the verified JWT — accepting it from the
 * body or query (as the previous implementation did) is exactly the
 * IDOR shape PRs #496-#499 closed.
 */
const validateTenantId = (req: Request, res: Response, next: NextFunction) => {
  const tenantId = String(req.params.tenantId ?? '');

  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_TENANT_ID',
        message: 'Tenant ID is required',
      },
    });
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_TENANT_ID',
        message: 'Tenant ID must be a valid UUID',
      },
    });
  }

  const authedUuid =
    (req as any).user?.organizationUuid ??
    (req as any).tenantContext?.organizationUuid;
  if (!authedUuid || String(authedUuid).toLowerCase() !== tenantId.toLowerCase()) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'TENANT_MISMATCH',
        message: 'Authenticated tenant does not match the requested tenant',
      },
    });
  }

  next();
};

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
  const { tenantId, primaryRegion, allowedProcessingRegions, ...rest } = req.body;
  
  if (!tenantId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_TENANT_ID',
        message: 'Tenant ID is required'
      }
    });
  }
  
  const config = await grdheService.setDataResidencyConfig({
    tenantId,
    primaryRegion,
    allowedProcessingRegions,
    ...rest
  });
  
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
  const { tenantId, region } = req.body;
  
  if (!tenantId || !region) {
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
  
  const mappingId = await grdheService.addTerminologyMapping(mappingData);
  
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
  
  try {
    const job = await grdheService.createExportJob(request);
    
    res.status(201).json({
      success: true,
      data: job
    });
  } catch (error: any) {
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
    res.status(404).json({
      success: false,
      error: {
        code: 'JOB_NOT_FOUND',
        message: error.message
      }
    });
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
  
  try {
    // Get job details
    const job = await grdheService.getExportJob(jobId);
    
    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'JOB_ALREADY_COMPLETED',
          message: 'This export job has already been completed'
        }
      });
    }
    
    if (job.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'JOB_CANCELLED',
          message: 'This export job has been cancelled'
        }
      });
    }
    
    // Update status to processing
    await grdheService.updateExportJobStatus(jobId, 'transforming', {
      progressPercent: 10,
      currentStep: 'Loading source data'
    });
    
    // Get source entities
    // For adverse events
    if (job.sourceEntityType === 'adverse_event') {
      const results: any[] = [];
      
      for (const entityId of job.sourceEntityIds) {
        // Update progress
        await grdheService.updateExportJobStatus(jobId, 'transforming', {
          progressPercent: 30,
          currentStep: `Processing entity ${entityId}`
        });
        
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
          });
          
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
      
      // Complete the job
      if (results.length > 0 && results[0].content) {
        const outputFileName = results[0].fileName || `export_${jobId}.xml`;
        const outputPath = `/exports/${job.tenantId}/${outputFileName}`;
        
        await grdheService.completeExportJob(jobId, outputPath, results[0].content);
        
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
      });
    } catch { /* non-blocking: best-effort status update */ }
    
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: error.message
      }
    });
  }
}));

/**
 * POST /api/grdhe/exports/:jobId/cancel
 * Cancel an export job
 */
router.post('/exports/:jobId/cancel', asyncHandler(async (req: Request, res: Response) => {
  const jobId = String(req.params.jobId);
  const { reason } = req.body;
  
  try {
    await grdheService.updateExportJobStatus(jobId, 'cancelled', {
      errorMessage: reason || 'Cancelled by user'
    });
    
    const job = await grdheService.getExportJob(jobId);
    
    res.json({
      success: true,
      data: job
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CANCEL_FAILED',
        message: error.message
      }
    });
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
  
  // Validate required fields
  const requiredFields = ['tenantId', 'caseNumber', 'receiveDate', 'patient', 'reactions', 'suspectProducts', 'reporter'];
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
  
  try {
    const event = await grdheService.createCanonicalAdverseEvent(request);
    
    res.status(201).json({
      success: true,
      data: event
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CREATE_FAILED',
        message: error.message
      }
    });
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
    res.status(404).json({
      success: false,
      error: {
        code: 'EVENT_NOT_FOUND',
        message: error.message
      }
    });
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
    res.status(404).json({
      success: false,
      error: {
        code: 'EVENT_NOT_FOUND',
        message: error.message
      }
    });
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
    res.status(404).json({
      success: false,
      error: {
        code: 'EVENT_NOT_FOUND',
        message: error.message
      }
    });
  }
}));

// =============================================================================
// ELECTRONIC SIGNATURE ENDPOINTS (21 CFR Part 11)
// =============================================================================

/**
 * POST /api/grdhe/signatures
 * Create an electronic signature
 */
router.post('/signatures', asyncHandler(async (req: Request, res: Response) => {
  const request: SignatureRequest = req.body;
  
  // Validate required fields
  const requiredFields = ['objectType', 'objectId', 'meaning', 'reason', 'userId', 'password'];
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
  
  // Validate meaning against the canonical SignatureMeaning vocabulary.
  const validMeanings: SignatureMeaning[] = [
    'authored',
    'reviewed',
    'verified',
    'approved',
    'rejected',
    'acknowledged',
    'witnessed',
    'responsible_for_content',
    'legal_responsibility',
  ];
  if (!validMeanings.includes(request.meaning)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_MEANING',
        message: `Invalid signature meaning. Must be one of: ${validMeanings.join(', ')}`
      }
    });
  }
  
  try {
    const signature = await grdheService.createElectronicSignature(request);
    
    res.status(201).json({
      success: true,
      data: signature
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'SIGNATURE_FAILED',
        message: error.message
      }
    });
  }
}));

/**
 * GET /api/grdhe/signatures/:signatureId/verify
 * Verify an electronic signature
 */
router.get('/signatures/:signatureId/verify', asyncHandler(async (req: Request, res: Response) => {
  const signatureId = String(req.params.signatureId);
  
  const result = await grdheService.verifyElectronicSignature(signatureId);
  
  res.json({
    success: true,
    data: result
  });
}));

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
  
  const auditLog = await grdheService.getAuditLog(tableName, recordId, {
    limit: limit ? parseInt(limit as string) : 100,
    offset: offset ? parseInt(offset as string) : 0
  });
  
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
        electronicSignatures: true,
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
  console.error('[GRDHE ERROR]', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.message || 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
});

export default router;
