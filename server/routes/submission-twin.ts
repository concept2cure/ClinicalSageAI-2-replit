/**
 * Submission Twin API Routes
 *
 * Living submission intelligence layer — claims, evidence, drift,
 * challenges, change impacts, readiness/fragility assessments.
 *
 * All routes: /api/submission-twin/...
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { submissionTwinService } from '../services/submission-twin-service';
import { enrichChangeImpact } from '../services/intelligence/rim-change-impact.js';

const router = Router();
const auth = authenticateToken;

function getOrgId(req: Request): number {
  const orgId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantContext?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): number {
  return (req as any).user?.id ?? (req as any).userId ?? 0;
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function parseIntParam(val: string, name: string): number {
  const n = parseInt(val, 10);
  if (isNaN(n) || n <= 0) throw new ValidationError(`Invalid ${name}: ${val}`);
  return n;
}

function handleError(res: Response, error: any) {
  const status = error instanceof ValidationError ? 400 : 500;
  if (status === 500) console.error('[SubmissionTwin] Error:', error);
  res.status(status).json({ success: false, error: error.message });
}

// ════════════════════════════════════════════════════════════
// FULL ASSESSMENT
// ════════════════════════════════════════════════════════════

/** Run a complete Submission Twin assessment on a package */
router.post('/assess/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const result = await submissionTwinService.runFullAssessment(packageId, orgId, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get assessment history for a package */
router.get('/assessments/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const assessments = await submissionTwinService.getAssessments(packageId, orgId);
    res.json({ success: true, data: assessments });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get detailed assessment with challenges, drift, impacts */
router.get('/assessment/:assessmentId', auth, async (req: Request, res: Response) => {
  try {
    const assessmentId = parseIntParam(req.params.assessmentId, 'assessmentId');
    const orgId = getOrgId(req);

    const detail = await submissionTwinService.getAssessmentDetail(assessmentId, orgId);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Assessment not found' });
    }
    res.json({ success: true, data: detail });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// CLAIMS & EVIDENCE
// ════════════════════════════════════════════════════════════

/** Extract claims from package artifacts */
router.post('/claims/extract/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const claims = await submissionTwinService.extractClaims(packageId, orgId);
    res.json({ success: true, data: claims });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get claim-to-evidence integrity map */
router.get('/claims/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const claimMap = await submissionTwinService.getClaimEvidenceMap(packageId, orgId);
    res.json({ success: true, data: claimMap });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Assess evidence support for all claims */
router.post('/evidence/assess/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const result = await submissionTwinService.assessEvidenceIntegrity(packageId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// NARRATIVE DRIFT
// ════════════════════════════════════════════════════════════

/** Detect narrative drift in package */
router.post('/drift/detect/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const alerts = await submissionTwinService.detectDrift(packageId, orgId);
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get active drift alerts */
router.get('/drift/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const alerts = await submissionTwinService.getDriftAlerts(packageId, orgId);
    res.json({ success: true, data: alerts });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Resolve a drift alert */
router.post('/drift/:alertId/resolve', auth, async (req: Request, res: Response) => {
  try {
    const alertId = parseIntParam(req.params.alertId, 'alertId');
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const resolved = await submissionTwinService.resolveDriftAlert(alertId, orgId, userId);
    res.json({ success: true, data: resolved });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// REGULATOR CHALLENGE SIMULATION
// ════════════════════════════════════════════════════════════

/** Simulate regulator challenges */
router.post('/challenges/simulate/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);
    const { assessmentId, lenses } = req.body;

    if (!assessmentId) {
      return res.status(400).json({ success: false, error: 'assessmentId is required' });
    }

    const challenges = await submissionTwinService.simulateChallenges(
      packageId, orgId, assessmentId, lenses
    );
    res.json({ success: true, data: challenges });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get challenges for a package or assessment */
router.get('/challenges/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);
    const assessmentId = req.query.assessmentId
      ? parseIntParam(req.query.assessmentId as string, 'assessmentId')
      : undefined;

    const challenges = await submissionTwinService.getChallenges(packageId, orgId, assessmentId);
    res.json({ success: true, data: challenges });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// CHANGE CONSEQUENCE INTELLIGENCE
// ════════════════════════════════════════════════════════════

/** Analyze impact of an artifact change */
router.post('/change-impact/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);
    const { changedArtifactId, changeDescription, changeType } = req.body;

    if (!changedArtifactId || !changeDescription || !changeType) {
      return res.status(400).json({
        success: false,
        error: 'changedArtifactId, changeDescription, and changeType are required',
      });
    }

    const impacts = await submissionTwinService.analyzeChangeImpact(
      packageId, changedArtifactId, changeDescription, changeType, orgId
    );

    // Enrich with RIM intelligence if section context is available
    const sectionCode = req.body.sectionCode;
    const rimEnrichment = sectionCode
      ? enrichChangeImpact(orgId, req.body.projectId ?? 0, sectionCode)
      : null;

    res.json({ success: true, data: impacts, rimIntelligence: rimEnrichment });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Get unresolved change impacts */
router.get('/change-impacts/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const impacts = await submissionTwinService.getChangeImpacts(packageId, orgId);
    res.json({ success: true, data: impacts });
  } catch (error: any) {
    handleError(res, error);
  }
});

/** Resolve a change impact */
router.post('/change-impact/:impactId/resolve', auth, async (req: Request, res: Response) => {
  try {
    const impactId = parseIntParam(req.params.impactId, 'impactId');
    const orgId = getOrgId(req);

    const resolved = await submissionTwinService.resolveChangeImpact(impactId, orgId);
    res.json({ success: true, data: resolved });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// NEXT BEST ARTIFACT
// ════════════════════════════════════════════════════════════

/** Predict the highest-value next governed artifact */
router.get('/next-artifact/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const prediction = await submissionTwinService.predictNextBestArtifact(packageId, orgId);
    res.json({ success: true, data: prediction });
  } catch (error: any) {
    handleError(res, error);
  }
});

// ════════════════════════════════════════════════════════════
// READINESS & FRAGILITY
// ════════════════════════════════════════════════════════════

/** Get readiness and fragility scores */
router.get('/readiness/:packageId', auth, async (req: Request, res: Response) => {
  try {
    const packageId = parseIntParam(req.params.packageId, 'packageId');
    const orgId = getOrgId(req);

    const result = await submissionTwinService.computeReadinessAndFragility(packageId, orgId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    handleError(res, error);
  }
});

export default router;
