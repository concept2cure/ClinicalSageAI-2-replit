/**
 * IND Submissions Routes
 * 
 * Unified submission tracking routes for the IND Wizard -> eCTD Co-Author workflow.
 * Handles session management, data persistence, and phase transitions.
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../utils/logger';
import { generateUUID } from '../utils/id-generator';
import { storage } from '../storage';
import * as schema from '../../shared/schema';
import { authenticateToken } from '../middleware/auth.js';

const logger = createScopedLogger('ind-submissions');
const router = Router();

// SECURITY: every route in this router operates on tenant-scoped IND
// submissions. The router-level auth middleware enforces an
// authenticated JWT before any handler runs, eliminating the prior
// `?? 1` org-id fallback that let unauthenticated requests act as
// org 1.
router.use(authenticateToken);

// Second guard: an authenticated user MUST carry an organizationId
// claim. A token with no org context is treated as 403 once here,
// rather than letting individual handlers fall through to "what org is
// this even for" code paths.
router.use((req: Request, res: Response, next) => {
  const orgId =
    (req as any).user?.organizationId ??
    (req as any).tenantContext?.organizationId ??
    (req as any).organizationId;
  const userId = (req as any).user?.id ?? (req as any).userId;
  if (orgId == null || userId == null) {
    return res.status(403).json({
      success: false,
      error: 'Tenant context required',
    });
  }
  next();
});

/**
 * Org / user id getters. Safe by construction — the guard middleware
 * above guarantees both are present before any handler runs.
 */
function getAuthedOrgId(req: Request): number {
  return Number(
    (req as any).user?.organizationId ??
      (req as any).tenantContext?.organizationId ??
      (req as any).organizationId,
  );
}

function getAuthedUserId(req: Request): number {
  return Number((req as any).user?.id ?? (req as any).userId);
}

/**
 * Tenant-isolation guard for resources fetched by ID. The lookup
 * functions in storage don't all filter by org, so we enforce here:
 * a submission belonging to another org looks identical to "not found"
 * (prevents existence enumeration).
 */
function assertSameOrg(
  submission: { organizationId?: number | string | null } | null | undefined,
  orgId: number,
): boolean {
  if (!submission) return false;
  if (submission.organizationId == null) return false;
  return Number(submission.organizationId) === orgId;
}

/**
 * GET /api/ind-submissions/active
 * Get the active submission for the current session
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers['x-session-id'] as string;
    const organizationId = getAuthedOrgId(req);
    const userId = getAuthedUserId(req);

    logger.info('Fetching active submission', { sessionId, organizationId, userId });

    // Try to find by session ID first. Enforce tenant isolation post-fetch
    // because the storage lookup is session-scoped, not org-scoped — a
    // guessed session id from another org must not return a submission.
    let submission;
    if (sessionId) {
      const candidate = await storage.getIndSubmissionBySession(sessionId);
      if (assertSameOrg(candidate, organizationId)) {
        submission = candidate;
      }
    }
    
    // If not found by session, try to get the most recent active submission
    if (!submission) {
      submission = await storage.getActiveIndSubmission(organizationId, userId);
    }
    
    // If still no submission, create a new one
    if (!submission) {
      const submissionId = `SUB-${Date.now()}-${generateUUID().slice(0, 8)}`;
      const newSessionId = sessionId || `SESSION-${generateUUID()}`;
      
      submission = await storage.createIndSubmission({
        submissionId,
        sessionId: newSessionId,
        organizationId,
        createdById: userId,
        lastModifiedBy: userId,
        isActive: true,
        
        // Initialize with empty data
        drugName: '',
        indication: '',
        sponsor: '',
        phase: 'Phase I',
        currentPhase: 'ind-wizard',
        phases: {
          'ind-wizard': { status: 'in-progress', startedAt: new Date().toISOString() },
          'ectd-coauthor': { status: 'not-started' },
          'submission-review': { status: 'not-started' }
        },
        indWizardStatus: 'draft',
        indStepsCompleted: {
          step1: false,
          step2: false,
          step3: false,
          step4: false,
          step5: false,
          step6: false,
          step7: false
        },
        indStepData: {},
        ectdStatus: 'not-started'
      });
      
      logger.info('Created new submission', { submissionId: submission.submissionId });
    }
    
    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    logger.error('Error fetching active submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active submission'
    });
  }
});

/**
 * GET /api/ind-submissions/:submissionId
 * Get a specific submission by ID
 */
router.get('/:submissionId', async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const organizationId = getAuthedOrgId(req);

    const submission = await storage.getIndSubmission(submissionId);

    // Tenant isolation: a submission belonging to another org looks
    // identical to "not found" so existence can't be enumerated.
    if (!submission || !assertSameOrg(submission, organizationId)) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    logger.error('Error fetching submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submission'
    });
  }
});

/**
 * POST /api/ind-submissions/create
 * Create a new submission
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const organizationId = getAuthedOrgId(req);
    const userId = getAuthedUserId(req);
    const sessionId = req.headers['x-session-id'] as string || `SESSION-${generateUUID()}`;
    
    const {
      drugName = '',
      indication = '',
      sponsor = '',
      phase = 'Phase I',
      targetSubmissionDate,
      indProjectId
    } = req.body;
    
    const submissionId = `SUB-${Date.now()}-${generateUUID().slice(0, 8)}`;
    
    const submission = await storage.createIndSubmission({
      submissionId,
      sessionId,
      organizationId,
      createdById: userId,
      lastModifiedBy: userId,
      isActive: true,
      drugName,
      indication,
      sponsor,
      phase,
      targetSubmissionDate,
      indProjectId,
      currentPhase: 'ind-wizard',
      phases: {
        'ind-wizard': { status: 'in-progress', startedAt: new Date().toISOString() },
        'ectd-coauthor': { status: 'not-started' },
        'submission-review': { status: 'not-started' }
      },
      indWizardStatus: 'draft',
      indStepsCompleted: {
        step1: false,
        step2: false,
        step3: false,
        step4: false,
        step5: false,
        step6: false,
        step7: false
      },
      indStepData: {},
      ectdStatus: 'not-started'
    });
    
    logger.info('Created new submission', { submissionId: submission.submissionId });
    
    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    logger.error('Error creating submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create submission'
    });
  }
});

/**
 * PUT /api/ind-submissions/:submissionId
 * Update a submission
 */
router.put('/:submissionId', async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const userId = getAuthedUserId(req);
    const organizationId = getAuthedOrgId(req);
    const updates = req.body;

    // Tenant isolation: confirm the submission belongs to the caller's
    // org before mutating. Storage doesn't filter by org, so we gate
    // here. Foreign tenant looks like "not found" — never reveal that
    // the record exists.
    const existing = await storage.getIndSubmission(submissionId);
    if (!existing || !assertSameOrg(existing, organizationId)) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    // Prevent the body from re-targeting another tenant or rewriting
    // immutable provenance fields.
    delete updates.organizationId;
    delete updates.createdById;
    delete updates.submissionId;
    updates.lastModifiedBy = userId;

    const submission = await storage.updateIndSubmission(submissionId, updates);

    if (!submission) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }

    logger.info('Updated submission', { submissionId, organizationId });

    res.json({
      success: true,
      data: submission
    });
  } catch (error) {
    logger.error('Error updating submission:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update submission'
    });
  }
});

/**
 * POST /api/ind-submissions/:submissionId/ind-step
 * Update IND wizard step data
 */
router.post('/:submissionId/ind-step', async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { stepNumber, stepData, completed = false } = req.body;
    const userId = getAuthedUserId(req);
    const organizationId = getAuthedOrgId(req);

    // Get current submission, gated by org. Foreign tenant ⇒ 404.
    const submission = await storage.getIndSubmission(submissionId);
    if (!submission || !assertSameOrg(submission, organizationId)) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }
    
    // Update step data
    const indStepData = submission.indStepData || {};
    indStepData[`step${stepNumber}`] = stepData;
    
    // Update completion status
    const indStepsCompleted = submission.indStepsCompleted || {};
    indStepsCompleted[`step${stepNumber}`] = completed;
    
    // Check if all steps are completed
    const allStepsCompleted = Object.keys(indStepsCompleted).every(
      key => key.startsWith('step') && indStepsCompleted[key]
    );
    
    // Update IND wizard status if all steps completed
    let indWizardStatus = submission.indWizardStatus;
    if (allStepsCompleted) {
      indWizardStatus = 'completed';
    } else if (Object.values(indStepsCompleted).some(v => v)) {
      indWizardStatus = 'in-progress';
    }
    
    // Generate summary data if step 7 is completed
    let updates: any = {
      indStepData,
      indStepsCompleted,
      indWizardStatus,
      lastModifiedBy: userId
    };
    
    if (stepNumber === 7 && completed) {
      // Generate handoff data for eCTD
      updates.submissionSummary = generateSubmissionSummary(indStepData);
      updates.module2Data = extractModule2Data(indStepData);
      updates.module3Data = extractModule3Data(indStepData);
      updates.module5Data = extractModule5Data(indStepData);
      
      // Update phase status
      updates.phases = {
        ...submission.phases,
        'ind-wizard': { 
          status: 'completed', 
          completedAt: new Date().toISOString()
        }
      };
    }
    
    // Update core product info if available in step data
    if (stepData.drugName) updates.drugName = stepData.drugName;
    if (stepData.indication) updates.indication = stepData.indication;
    if (stepData.sponsor) updates.sponsor = stepData.sponsor;
    if (stepData.phase) updates.phase = stepData.phase;
    
    const updatedSubmission = await storage.updateIndSubmission(submissionId, updates);
    
    logger.info('Updated IND step', { submissionId, stepNumber, completed });
    
    res.json({
      success: true,
      data: updatedSubmission
    });
  } catch (error) {
    logger.error('Error updating IND step:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update IND step'
    });
  }
});

/**
 * POST /api/ind-submissions/:submissionId/transition-to-ectd
 * Transition from IND Wizard to eCTD Co-Author
 */
router.post('/:submissionId/transition-to-ectd', async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const userId = getAuthedUserId(req);
    const organizationId = getAuthedOrgId(req);

    const submission = await storage.getIndSubmission(submissionId);
    if (!submission || !assertSameOrg(submission, organizationId)) {
      return res.status(404).json({
        success: false,
        error: 'Submission not found'
      });
    }
    
    // SAFETY: Verify IND wizard is complete before transitioning
    if (submission.indWizardStatus && submission.indWizardStatus !== 'completed') {
      return res.status(409).json({
        success: false,
        error: 'IND Wizard must be completed before transitioning to eCTD Co-Author.',
        currentStatus: submission.indWizardStatus,
      });
    }

    // Generate summary data from IND wizard
    const indStepData = submission.indStepData || {};
    
    const updates = {
      currentPhase: 'ectd-coauthor',
      ectdStatus: 'in-progress',
      submissionSummary: generateSubmissionSummary(indStepData),
      module2Data: extractModule2Data(indStepData),
      module3Data: extractModule3Data(indStepData),
      module5Data: extractModule5Data(indStepData),
      phases: {
        ...submission.phases,
        'ectd-coauthor': { 
          status: 'in-progress', 
          startedAt: new Date().toISOString()
        }
      },
      lastModifiedBy: userId
    };
    
    const updatedSubmission = await storage.updateIndSubmission(submissionId, updates);
    
    logger.info('Transitioned to eCTD Co-Author', { submissionId });
    
    res.json({
      success: true,
      data: updatedSubmission
    });
  } catch (error) {
    logger.error('Error transitioning to eCTD:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to transition to eCTD'
    });
  }
});

/**
 * Helper Functions
 */

function generateSubmissionSummary(stepData: any): any {
  return {
    overview: 'IND submission for ' + (stepData.step1?.drugName || 'Drug'),
    indication: stepData.step1?.indication || '',
    sponsor: stepData.step1?.sponsor || '',
    phase: stepData.step1?.phase || 'Phase I',
    keyFindings: {
      nonclinical: stepData.step2?.summary || '',
      cmc: stepData.step3?.summary || '',
      clinical: stepData.step4?.summary || ''
    },
    regulatoryStrategy: stepData.step1?.regulatoryStrategy || '',
    completedSections: Object.keys(stepData).filter(key => stepData[key]),
    generatedAt: new Date().toISOString()
  };
}

function extractModule2Data(stepData: any): any {
  // Extract Quality/CMC data for Module 2
  return {
    drugSubstance: stepData.step3?.drugSubstance || {},
    drugProduct: stepData.step3?.drugProduct || {},
    qualityOverview: stepData.step3?.qualityOverview || '',
    analyticalMethods: stepData.step3?.analyticalMethods || [],
    stability: stepData.step3?.stability || {},
    specifications: stepData.step3?.specifications || {}
  };
}

function extractModule3Data(stepData: any): any {
  // Extract Manufacturing data for Module 3
  return {
    manufacturingProcess: stepData.step3?.manufacturingProcess || {},
    batchRecords: stepData.step3?.batchRecords || [],
    facilityInfo: stepData.step3?.facilityInfo || {},
    processValidation: stepData.step3?.processValidation || {},
    controlStrategy: stepData.step3?.controlStrategy || {}
  };
}

function extractModule5Data(stepData: any): any {
  // Extract Clinical protocol data for Module 5
  return {
    protocolNumber: stepData.step4?.protocolNumber || '',
    studyDesign: stepData.step4?.studyDesign || {},
    objectives: stepData.step4?.objectives || {},
    endpoints: stepData.step4?.endpoints || {},
    population: stepData.step4?.population || {},
    statisticalPlan: stepData.step4?.statisticalPlan || {},
    investigatorInfo: stepData.step5?.investigatorInfo || []
  };
}

export default router;