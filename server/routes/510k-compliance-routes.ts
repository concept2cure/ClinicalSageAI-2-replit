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
import * as dotenv from 'dotenv';
import { create510kDeprecationNotice } from '../middleware/deprecation';
import { pool } from '../db';

// Load environment variables
dotenv.config();

// Create router
const router = express.Router();

// Apply deprecation notice to all routes in this file
router.use(create510kDeprecationNotice('/compliance'));

// Multi-tenancy middleware to extract and validate organization context
const extractTenantContext = (req: Request, res: Response, next: Function) => {
  const organizationId = String((req as any).user?.organizationId || '') || null;
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

    // This deprecated endpoint requires AI gateway configuration for real compliance analysis
    res.status(503).json({
      error: 'Service not configured',
      message: 'This endpoint requires AI gateway configuration. Please migrate to /api/fda510k-unified/compliance.',
      deprecated: true,
      migrateTo: '/api/fda510k-unified/compliance',
    });
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

    // This deprecated endpoint requires AI gateway configuration for real compliance analysis
    res.status(503).json({
      error: 'Service not configured',
      message: 'This endpoint requires AI gateway configuration. Please migrate to /api/fda510k-unified/compliance.',
      deprecated: true,
      migrateTo: '/api/fda510k-unified/compliance',
    });
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

    // Auto-fix requires AI gateway to generate content fixes
    res.status(503).json({
      error: 'Service not configured',
      message: 'This endpoint requires AI gateway configuration. Please migrate to /api/fda510k-unified/compliance.',
      deprecated: true,
      migrateTo: '/api/fda510k-unified/compliance',
    });
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

    // Report export requires a completed compliance check and report generation service
    res.status(501).json({
      error: 'Not implemented',
      message: 'Compliance report export is not yet implemented. Please migrate to /api/fda510k-unified/compliance.',
      deprecated: true,
      migrateTo: '/api/fda510k-unified/compliance',
    });
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
