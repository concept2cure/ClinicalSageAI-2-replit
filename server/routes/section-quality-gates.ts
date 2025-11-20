/**
 * Section Quality Gates Routes
 *
 * API routes for validating section quality gates and managing override requests.
 * Implements risk-based quality gating according to CtQ factor completion.
 */

import { Router } from 'express';
import { z } from 'zod';
import { TenantDb } from '../db/tenantDb';
import { validateBody } from '../middleware/validation.js';
import tenantContext from '../middleware/tenantContext.js';
import {
  validateSectionQualityGate,
  requestSectionGateOverride,
  getSectionOverrideStatus,
  processSectionOverrideRequest,
} from '../services/sectionQualityGating';

const router = Router();

// Apply tenant context middleware to all routes
router.use(tenantContext);

/**
 * Schema for section validation request
 */
const validateSectionSchema = z.object({
  projectId: z.number().int().positive(),
  sectionKey: z.string().min(1),
});

/**
 * Schema for section override request
 */
const requestOverrideSchema = z.object({
  projectId: z.number().int().positive(),
  sectionKey: z.string().min(1),
  reason: z.string().min(5),
});

/**
 * Schema for getting override status
 */
const getOverrideStatusSchema = z.object({
  projectId: z.number().int().positive(),
  sectionKey: z.string().min(1),
});

/**
 * Schema for processing an override request
 */
const processOverrideSchema = z.object({
  approvalId: z.number().int().positive(),
  approved: z.boolean(),
  comment: z.string().optional(),
});

/**
 * GET /api/section-quality-gates/validate
 * Validate section quality gate based on CtQ factors
 */
router.get('/validate', validateRequest(validateSectionSchema, 'query'), async (req, res) => {
  try {
    const { projectId, sectionKey } = req.query as any;
    const organizationId = req.tenantContext?.organizationId;

    if (!organizationId) {
      return res.status(403).json({
        success: false,
        message: 'Organization context is required',
      });
    }

    const validationResult = await validateSectionQualityGate(
      tenantDb,
      organizationId,
      parseInt(projectId as string, 10),
      sectionKey as string
    );

    // If there's already an approved override for this section, include it in the response
    const overrideStatus = await getSectionOverrideStatus(
      tenantDb,
      organizationId,
      parseInt(projectId as string, 10),
      sectionKey as string
    );

    return res.json({
      success: true,
      data: {
        validation: validationResult,
        override: overrideStatus,
      },
    });
  } catch (error: any) {
    console.error('[SectionQualityGate] Validation error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to validate section quality gate',
    });
  }
});

/**
 * POST /api/section-quality-gates/override
 * Request a quality gate override for a section
 */
router.post('/override', validateRequest(requestOverrideSchema), async (req, res) => {
  try {
    const { projectId, sectionKey, reason } = req.body;
    const organizationId = req.tenantContext?.organizationId;
    const userId = req.tenantContext?.userId;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        message: 'Organization and user context are required',
      });
    }

    // First validate the section to get the validation details
    const validationResult = await validateSectionQualityGate(
      tenantDb,
      organizationId,
      projectId,
      sectionKey
    );

    if (!validationResult) {
      return res.status(404).json({
        success: false,
        message: 'Section validation failed',
      });
    }

    // If section is already valid, no need for override
    if (validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: 'Section already passes quality validation, no override needed',
      });
    }

    // Request the override
    const overrideResult = await requestSectionGateOverride(
      tenantDb,
      organizationId,
      projectId,
      sectionKey,
      userId,
      reason,
      validationResult
    );

    return res.json({
      success: overrideResult.success,
      message: overrideResult.message,
      data: {
        approvalId: overrideResult.approvalId,
        status: overrideResult.success
          ? validationResult.overrideRequiresApproval
            ? 'pending'
            : 'approved'
          : 'failed',
      },
    });
  } catch (error: any) {
    console.error('[SectionQualityGate] Override request error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to request section override',
    });
  }
});

/**
 * GET /api/section-quality-gates/override-status
 * Get the current override status for a section
 */
router.get(
  '/override-status',
  validateRequest(getOverrideStatusSchema, 'query'),
  async (req, res) => {
    try {
      const { projectId, sectionKey } = req.query as any;
      const organizationId = req.tenantContext?.organizationId;

      if (!organizationId) {
        return res.status(403).json({
          success: false,
          message: 'Organization context is required',
        });
      }

      const overrideStatus = await getSectionOverrideStatus(
        tenantDb,
        organizationId,
        parseInt(projectId as string, 10),
        sectionKey as string
      );

      return res.json({
        success: true,
        data: overrideStatus,
      });
    } catch (error: any) {
      console.error('[SectionQualityGate] Get override status error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get section override status',
      });
    }
  }
);

/**
 * POST /api/section-quality-gates/process-override
 * Approve or reject an override request
 */
router.post('/process-override', validateRequest(processOverrideSchema), async (req, res) => {
  try {
    const { approvalId, approved, comment } = req.body;
    const organizationId = req.tenantContext?.organizationId;
    const userId = req.tenantContext?.userId;

    if (!organizationId || !userId) {
      return res.status(403).json({
        success: false,
        message: 'Organization and user context are required',
      });
    }

    const result = await processSectionOverrideRequest(
      tenantDb,
      approvalId,
      organizationId,
      userId,
      approved,
      comment
    );

    return res.json({
      success: true,
      message: approved ? 'Override request approved' : 'Override request rejected',
      data: result,
    });
  } catch (error: any) {
    console.error('[SectionQualityGate] Process override error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process override request',
    });
  }
});

export default router;
