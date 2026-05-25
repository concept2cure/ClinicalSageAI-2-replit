import { Router } from 'express';
import ESGSubmissionService from '../services/ESGSubmissionService.js';
import { db } from '../db';
import { fda510kSubmissionPackages, fda510kProjects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import auditService from '../services/auditService';

const router = Router();
const esgService = new ESGSubmissionService();

/**
 * Submit 510(k) package to FDA ESG
 */
router.post('/api/510k/:projectId/esg/submit', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = parseInt(req.headers['x-user-id'] as string || '');
    const organizationId = Number((req as any).user?.organizationId || (req as any).tenantId);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // Submit to FDA ESG
    const response = await esgService.submitToFDA(
      parseInt(projectId),
      userId,
      organizationId
    );

    // Most consequential mutation in the platform: a real submission to
    // FDA. The central audit trail captures who, what, when, and the FDA-
    // assigned tracking handle so an auditor can replay the timeline.
    void auditService.logAction({
      tenantId: organizationId,
      userId,
      action: 'k510_workflow.transmit',
      resourceType: 'fda_510k_submission_package',
      resourceId: String((response as any)?.packageId ?? (response as any)?.transactionId ?? projectId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        projectId: parseInt(projectId),
        transactionId: (response as any)?.transactionId ?? null,
        submissionId: (response as any)?.submissionId ?? null,
        ackStatus: (response as any)?.ackStatus ?? null,
      },
    });

    res.json({
      success: true,
      ...response
    });
  } catch (error) {
    // Failed transmits are also audited — a refused submission is itself
    // a Part 11 event.
    void auditService.logAction({
      tenantId: Number((req as any).user?.organizationId || (req as any).tenantId) || 0,
      userId: parseInt(req.headers['x-user-id'] as string || '') || undefined,
      action: 'k510_workflow.transmit.failed',
      resourceType: 'fda_510k_submission_package',
      resourceId: req.params.projectId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        projectId: parseInt(req.params.projectId),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    console.error('ESG submission error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit to FDA ESG'
    });
  }
});

/**
 * Check submission status
 */
router.get('/api/510k/esg/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const status = await esgService.checkSubmissionStatus(transactionId);

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check submission status'
    });
  }
});

/**
 * Get all submission packages for a project
 */
router.get('/api/510k/:projectId/submissions', async (req, res) => {
  try {
    const { projectId } = req.params;

    const submissions = await db!
      .select()
      .from(fda510kSubmissionPackages)
      .where(eq(fda510kSubmissionPackages.projectId, parseInt(projectId)));

    res.json({
      success: true,
      submissions
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submissions'
    });
  }
});

/**
 * Download FDA acknowledgment
 */
router.get('/api/510k/esg/acknowledgment/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const acknowledgment = await esgService.downloadAcknowledgment(transactionId);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename=FDA-Acknowledgment-${transactionId}.txt`);
    res.send(acknowledgment);
  } catch (error) {
    console.error('Acknowledgment download error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download acknowledgment'
    });
  }
});

/**
 * Get submission package details
 */
router.get('/api/510k/package/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;

    const [submissionPackage] = await db!
      .select()
      .from(fda510kSubmissionPackages)
      .where(eq(fda510kSubmissionPackages.packageId, packageId));

    if (!submissionPackage) {
      return res.status(404).json({
        success: false,
        error: 'Submission package not found'
      });
    }

    res.json({
      success: true,
      package: submissionPackage
    });
  } catch (error) {
    console.error('Error fetching package:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch submission package'
    });
  }
});

export default router;