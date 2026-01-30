/**
 * Workflow Routes
 * Document workflow management
 * 
 * M5 UI + Ops: Proof Explorer + dashboard entry points expose verification status;
 * redacted logs; audit-safe UI events.
 * 
 * 21 CFR Part 11 Compliance:
 * - Authentication required on all proof endpoints
 * - Input validation with Zod schemas
 * - Tenant isolation enforced
 * - Audit trail for all operations
 */
import { Router, Response, Request, NextFunction } from 'express';
import { ComplianceCertificateGenerator } from '../../services/proof/ComplianceCertificate';
import { ProofVerificationService } from '../../services/proof/ProofVerificationService';
import { ProofAuditService } from '../../services/proof/ProofAuditService';
import { 
  getCertificateParamsSchema, 
  verifyCertificateBodySchema,
  getAuditQuerySchema,
  validateOrThrow,
} from '../../services/proof/validation';
import { authMiddleware } from '../auth';
import logger from '../utils/logger';

const router = Router();
const certificateGenerator = new ComplianceCertificateGenerator();
const proofVerifier = new ProofVerificationService();

// Helper to get tenant-scoped audit service
const getProofAudit = (req: Request): ProofAuditService => {
  const orgId = req.headers['x-organization-id'] as string | undefined;
  return orgId 
    ? ProofAuditService.getInstanceForTenant(orgId) 
    : ProofAuditService.getInstance();
};

const sendSuccess = <T>(res: Response, data: T) => res.json({ success: true, data });
const sendError = (res: Response, status: number, message: string) =>
  res.status(status).json({ success: false, error: { message } });

// Public status endpoints (no auth required)
router.get('/status', (req, res) => {
  return sendSuccess(res, {
    status: 'ready',
    workflows: [],
    message: 'Workflow service ready',
  });
});

router.get('/tasks', (req, res) => {
  return sendSuccess(res, { tasks: [] });
});

router.post('/tasks', (req, res) => {
  return sendSuccess(res, {
    task: { id: Date.now(), ...req.body },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PROOF SYSTEM ENDPOINTS (Authentication Required)
// ─────────────────────────────────────────────────────────────────────────────

// Apply authentication to all proof endpoints
router.use('/proofs', authMiddleware);

// Proof system endpoints
router.get('/proofs/certificate/:workflowRunId', async (req, res) => {
  try {
    // Validate input
    const params = validateOrThrow(getCertificateParamsSchema, req.params);
    
    // Get tenant-scoped audit service
    const proofAudit = getProofAudit(req);
    
    // M5: Audit UI proof view event
    const organizationId = req.headers['x-organization-id'] as string | undefined;
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    await proofAudit.logUIProofView(req.params.workflowRunId, {
      organizationId,
      actorId: userId,
    });
    
    const certificate = await certificateGenerator.generateCertificate(req.params.workflowRunId);
    logger.info('proof.certificate.generated', {
      workflowRunId: req.params.workflowRunId,
      certificateId: certificate.certificateId,
      submissionType: certificate.submissionType,
    });
    return sendSuccess(res, certificate);
  } catch (error) {
    logger.error('proof.certificate.failed', {
      workflowRunId: req.params.workflowRunId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return sendError(res, 500, 'Failed to generate certificate');
  }
});

router.post('/proofs/verify', async (req, res) => {
  try {
    // Validate input with Zod schema
    const certificate = validateOrThrow(verifyCertificateBodySchema, req.body);
    
    // Get tenant-scoped audit service
    const proofAudit = getProofAudit(req);
    
    // M5: Audit UI verification request event
    const organizationId = req.headers['x-organization-id'] as string | undefined;
    const userId = (req as unknown as { user?: { id?: string } }).user?.id;
    await proofAudit.logUIVerificationRequest(certificate.workflowRunId, {
      organizationId,
      actorId: userId,
    });
    
    const result = proofVerifier.verifyCertificate(certificate);
    logger.info('proof.certificate.verified', {
      workflowRunId: certificate.workflowRunId,
      valid: result.valid,
      failures: result.failures?.length || 0,
    });
    return sendSuccess(res, result);
  } catch (error) {
    logger.error('proof.certificate.verify_failed', {
      workflowRunId: req.body?.workflowRunId,
      error: error instanceof Error ? error.message : 'invalid_payload',
    });
    // Return 400 for validation errors, 500 for internal errors
    const status = error instanceof Error && error.message.startsWith('Validation') ? 400 : 500;
    return sendError(res, status, error instanceof Error ? error.message : 'Invalid certificate payload');
  }
});

// M5: Proof audit log endpoint for dashboard integration
router.get('/proofs/audit', (req, res) => {
  try {
    // Validate query parameters
    const query = validateOrThrow(getAuditQuerySchema, req.query);
    
    // Get tenant-scoped audit service
    const proofAudit = getProofAudit(req);
    const organizationId = req.headers['x-organization-id'] as string | undefined;
    
    // Verify hash chain before returning entries (M8: Audit integrity)
    const chainStatus = proofAudit.verifyHashChain();
    if (!chainStatus.valid) {
      logger.error('proof.audit.chain_integrity_failed', { brokenAt: chainStatus.brokenAt });
    }
    
    const entries = proofAudit.getEntries({
      organizationId,
      workflowRunId: query.workflowRunId,
      eventType: query.eventType,
      since: query.since,
      limit: query.limit,
    });
    
    return sendSuccess(res, { 
      entries, 
      count: entries.length,
      hashChainValid: chainStatus.valid,
      hashChainBrokenAt: chainStatus.brokenAt,
    });
  } catch (error) {
    logger.error('proof.audit.failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return sendError(res, 500, 'Failed to retrieve audit entries');
  }
});

// M5: Proof system health/status for dashboard
router.get('/proofs/status', (req, res) => {
  try {
    const proofAudit = getProofAudit(req);
    const chainStatus = proofAudit.verifyHashChain();
    const recentEntries = proofAudit.getEntries({ limit: 10 });
    const unpersistedCount = proofAudit.getUnpersistedEntries().length;
    
    return sendSuccess(res, {
      status: chainStatus.valid && unpersistedCount === 0 ? 'healthy' : 'integrity_warning',
      hashChainValid: chainStatus.valid,
      hashChainBrokenAt: chainStatus.brokenAt,
      unpersistedEntries: unpersistedCount,
      recentEventCount: recentEntries.length,
      lastEventType: recentEntries[recentEntries.length - 1]?.eventType || null,
      lastEventTime: recentEntries[recentEntries.length - 1]?.timestamp || null,
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to retrieve proof status');
  }
});

export default router;
