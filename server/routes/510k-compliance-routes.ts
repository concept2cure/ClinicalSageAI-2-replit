/**
 * FDA 510(k) Compliance Check Routes (DEPRECATED)
 *
 * @deprecated This route file is deprecated as of 2026-01-26.
 * Please migrate to /api/fda510k-unified/compliance
 * Sunset date: 2026-06-30
 *
 * This file implements the backend API endpoints to support automated compliance
 * checks for 510(k) submissions. These endpoints allow for checking submission
 * completeness, regulatory compliance, and validating against FDA guidelines.
 *
 * @see /api/fda510k-unified/docs for migration guide
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { create510kDeprecationNotice } from '../middleware/deprecation';

// Load environment variables
dotenv.config();

// Create router
const router = express.Router();

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/compliance'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Multi-tenancy middleware to extract and validate organization context
const extractTenantContext = (req: Request, res: Response, next: Function) => {
  const organizationId = (req.headers['x-organization-id'] as string) || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  // Attach tenant context to request object for downstream use
  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
  };

  next();
};

// Apply tenant context middleware to all routes
router.use(extractTenantContext);

/**
 * GET /api/fda510k/compliance-results/:projectId
 * Get compliance check results for a specific project
 */
router.get('/compliance-results/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const tenantContext = (req as any).tenantContext;

    console.log('Compliance results request:', {
      projectId,
      tenantContext,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Return simulated compliance check results
    // In a production environment, this would be retrieved from a database
    const results = {
      projectId,
      timestamp: new Date().toISOString(),
      overallScore: 78,
      completedSections: 8,
      totalSections: 10,
      criticalIssues: 2,
      warnings: 3,
      sections: [
        {
          id: 'sec-001',
          name: 'Administrative Information',
          status: 'passed',
          checks: [
            {
              id: 'check-001',
              description: 'All required administrative fields are completed',
              status: 'passed',
              message: 'All required fields present and validated',
              autoFixAvailable: false,
            },
            {
              id: 'check-002',
              description: 'Contact information format is valid',
              status: 'passed',
              message: 'Contact information follows FDA format requirements',
              autoFixAvailable: false,
            },
          ],
        },
        {
          id: 'sec-002',
          name: 'Device Description',
          status: 'warning',
          checks: [
            {
              id: 'check-003',
              description: 'Device description includes all required elements',
              status: 'passed',
              message: 'All required elements present',
              autoFixAvailable: false,
            },
            {
              id: 'check-004',
              description: 'Technical specifications are sufficiently detailed',
              status: 'warning',
              message: 'Technical specifications could be more detailed with quantitative values',
              autoFixAvailable: false,
            },
          ],
        },
        {
          id: 'sec-003',
          name: 'Substantial Equivalence',
          status: 'failed',
          checks: [
            {
              id: 'check-005',
              description: 'Predicate device is properly identified',
              status: 'passed',
              message: 'Predicate device K-number and information validated',
              autoFixAvailable: false,
            },
            {
              id: 'check-006',
              description: 'Comparison table includes all required characteristics',
              status: 'failed',
              message: 'Missing performance data comparison with predicate device',
              autoFixAvailable: true,
              autoFixDescription:
                'Generate a performance data comparison table based on provided device specifications',
            },
          ],
        },
        {
          id: 'sec-004',
          name: 'Performance Testing',
          status: 'failed',
          checks: [
            {
              id: 'check-007',
              description: 'Test protocols are adequately described',
              status: 'passed',
              message: 'Test protocols well-documented',
              autoFixAvailable: false,
            },
            {
              id: 'check-008',
              description: 'Test results support substantial equivalence claim',
              status: 'failed',
              message: 'Statistical analysis of test results is insufficient',
              autoFixAvailable: true,
              autoFixDescription: 'Generate statistical analysis of existing test data',
            },
          ],
        },
        {
          id: 'sec-005',
          name: 'Labeling',
          status: 'warning',
          checks: [
            {
              id: 'check-009',
              description: 'Labeling includes all required elements',
              status: 'warning',
              message: 'Warning statements could be more prominently displayed',
              autoFixAvailable: true,
              autoFixDescription: 'Reformat warning statements to meet FDA guidance',
            },
            {
              id: 'check-010',
              description: 'Instructions for use are clear and comprehensive',
              status: 'passed',
              message: 'Instructions for use are clearly presented',
              autoFixAvailable: false,
            },
          ],
        },
      ],
    };

    res.json(results);
  } catch (error: any) {
    console.error('Error fetching compliance results:', error);
    res.status(500).json({
      error: error.message,
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/fda510k/run-compliance-check
 * Run a new compliance check for a 510(k) submission
 */
router.post('/run-compliance-check', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.body;
    const tenantContext = (req as any).tenantContext;

    console.log('Run compliance check request:', {
      projectId,
      tenantContext,
    });

    // Simulate processing delay for a complex operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Return simulated compliance check results
    // In a production environment, this would perform an actual check
    const results = {
      projectId,
      timestamp: new Date().toISOString(),
      overallScore: 82, // Improved score after addressing some issues
      completedSections: 9,
      totalSections: 10,
      criticalIssues: 1, // Reduced critical issues
      warnings: 2, // Reduced warnings
      sections: [
        {
          id: 'sec-001',
          name: 'Administrative Information',
          status: 'passed',
          checks: [
            {
              id: 'check-001',
              description: 'All required administrative fields are completed',
              status: 'passed',
              message: 'All required fields present and validated',
              autoFixAvailable: false,
            },
            {
              id: 'check-002',
              description: 'Contact information format is valid',
              status: 'passed',
              message: 'Contact information follows FDA format requirements',
              autoFixAvailable: false,
            },
          ],
        },
        {
          id: 'sec-002',
          name: 'Device Description',
          status: 'passed', // Improved from warning
          checks: [
            {
              id: 'check-003',
              description: 'Device description includes all required elements',
              status: 'passed',
              message: 'All required elements present',
              autoFixAvailable: false,
            },
            {
              id: 'check-004',
              description: 'Technical specifications are sufficiently detailed',
              status: 'passed', // Improved from warning
              message: 'Technical specifications include comprehensive quantitative values',
              autoFixAvailable: false,
            },
          ],
        },
        {
          id: 'sec-003',
          name: 'Substantial Equivalence',
          status: 'warning', // Improved from failed
          checks: [
            {
              id: 'check-005',
              description: 'Predicate device is properly identified',
              status: 'passed',
              message: 'Predicate device K-number and information validated',
              autoFixAvailable: false,
            },
            {
              id: 'check-006',
              description: 'Comparison table includes all required characteristics',
              status: 'warning', // Improved from failed
              message: 'Performance data comparison could be more detailed',
              autoFixAvailable: true,
              autoFixDescription:
                'Enhance the performance data comparison table with additional metrics',
            },
          ],
        },
        {
          id: 'sec-004',
          name: 'Performance Testing',
          status: 'failed', // Still failed
          checks: [
            {
              id: 'check-007',
              description: 'Test protocols are adequately described',
              status: 'passed',
              message: 'Test protocols well-documented',
              autoFixAvailable: false,
            },
            {
              id: 'check-008',
              description: 'Test results support substantial equivalence claim',
              status: 'failed',
              message: 'Statistical analysis of test results is insufficient',
              autoFixAvailable: true,
              autoFixDescription: 'Generate statistical analysis of existing test data',
            },
          ],
        },
        {
          id: 'sec-005',
          name: 'Labeling',
          status: 'warning', // Still warning
          checks: [
            {
              id: 'check-009',
              description: 'Labeling includes all required elements',
              status: 'warning',
              message: 'Warning statements could be more prominently displayed',
              autoFixAvailable: true,
              autoFixDescription: 'Reformat warning statements to meet FDA guidance',
            },
            {
              id: 'check-010',
              description: 'Instructions for use are clear and comprehensive',
              status: 'passed',
              message: 'Instructions for use are clearly presented',
              autoFixAvailable: false,
            },
          ],
        },
      ],
    };

    res.json(results);
  } catch (error: any) {
    console.error('Error running compliance check:', error);
    res.status(500).json({
      error: error.message,
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/fda510k/apply-auto-fix
 * Apply an automatic fix for a specific compliance issue
 */
router.post('/apply-auto-fix', async (req: Request, res: Response) => {
  try {
    const { projectId, sectionId, checkId } = req.body;
    const tenantContext = (req as any).tenantContext;

    console.log('Apply auto-fix request:', {
      projectId,
      sectionId,
      checkId,
      tenantContext,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Return simulated auto-fix result
    // In a production environment, this would actually modify the submission
    const result = {
      projectId,
      sectionId,
      checkId,
      timestamp: new Date().toISOString(),
      status: 'success',
      message: 'Automatic fix applied successfully',
      details: {
        fixType: 'content-generation',
        affectedDocument: 'substantial-equivalence.docx',
        changesSummary: 'Added performance data comparison table with statistical analysis',
      },
    };

    res.json(result);
  } catch (error: any) {
    console.error('Error applying auto-fix:', error);
    res.status(500).json({
      error: error.message,
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /api/fda510k/export-compliance-report
 * Export compliance check results as a report
 */
router.post('/export-compliance-report', async (req: Request, res: Response) => {
  try {
    const { projectId, format = 'pdf' } = req.body;
    const tenantContext = (req as any).tenantContext;

    console.log('Export compliance report request:', {
      projectId,
      format,
      tenantContext,
    });

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Return simulated export result
    // In a production environment, this would generate and store a real report
    const result = {
      projectId,
      timestamp: new Date().toISOString(),
      status: 'success',
      format,
      fileName: `510k-compliance-report-${projectId}.${format}`,
      fileSizeBytes: 1258000,
      downloadUrl: `/api/fda510k/download-report/${projectId}?format=${format}&token=simulated-secure-token`,
      expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    res.json(result);
  } catch (error: any) {
    console.error('Error exporting compliance report:', error);
    res.status(500).json({
      error: error.message,
      status: 'error',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
