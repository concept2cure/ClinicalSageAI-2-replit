import { Router } from 'express';
import ESGSubmissionService from '../services/ESGSubmissionService.js';
import { db } from '../db';
import { fda510kSubmissionPackages, fda510kProjects } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();
const esgService = new ESGSubmissionService();

/**
 * Submit 510(k) package to FDA ESG
 */
router.post('/api/510k/:projectId/esg/submit', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = parseInt(req.headers['x-user-id'] as string || '1');
    const organizationId = parseInt(req.headers['x-organization-id'] as string || '1');

    // Submit to FDA ESG
    const response = await esgService.submitToFDA(
      parseInt(projectId),
      userId,
      organizationId
    );

    res.json({
      success: true,
      ...response
    });
  } catch (error) {
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