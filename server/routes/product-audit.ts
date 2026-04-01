/**
 * C2C Product Audit Questionnaire API
 *
 * Provides endpoints for saving and retrieving audit questionnaire responses
 * for the Concept2Cure workflow. Responses are stored in projectMemoryEntries.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
// @ts-ignore - JavaScript middleware file
import { authenticateToken } from '../middleware/auth';
// @ts-ignore - JavaScript middleware file
import { requireOrganizationContext } from '../middleware/tenantContext';
import { createFeatureStore } from '../utils/feature-persistence';

const router = Router();
const store = createFeatureStore('product_audit');

router.use(authenticateToken);
router.use(requireOrganizationContext);

const auditResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  status: z.enum(['yes', 'no', 'partial', 'in_progress']).nullable(),
  notes: z.string().default(''),
  severity: z.enum(['p0', 'p1', 'p2', 'p3', 'verified']).nullable(),
  updatedAt: z.string().datetime(),
});

const saveAuditRequestSchema = z.object({
  responses: z.record(z.string(), auditResponseSchema),
  auditor: z.string().optional(),
});

router.get('/responses', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req as any;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context is required' });
    }

    const rows = await store.query(organizationId, 'state');
    if (rows.length > 0) {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = rows[0];
      return res.json({ success: true, data });
    }

    res.json({
      success: true,
      data: {
        organizationId,
        responses: {},
        lastUpdated: new Date().toISOString(),
        auditor: user?.email || 'system',
      },
    });
  } catch (error) {
    console.error('Error retrieving audit responses:', error);
    res.status(500).json({ success: false, error: 'Failed to retrieve audit responses' });
  }
});

router.post('/responses', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req as any;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization context is required' });
    }

    const validatedData = saveAuditRequestSchema.parse(req.body);

    const existing = await store.query(organizationId, 'state');
    let existingResponses: Record<string, any> = {};
    if (existing.length > 0) {
      existingResponses = existing[0].responses || {};
    }

    const updatedState = {
      organizationId,
      responses: { ...existingResponses, ...validatedData.responses },
      lastUpdated: new Date().toISOString(),
      auditor: validatedData.auditor || user?.email || 'system',
    };

    if (existing.length > 0) {
      await store.update(existing[0].id, organizationId, updatedState);
    } else {
      await store.insert(organizationId, 'state', 'Product Audit State', updatedState);
    }

    res.json({ success: true, data: updatedState, message: 'Audit responses saved successfully' });
  } catch (error) {
    console.error('Error saving audit responses:', error);
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ success: false, error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ success: false, error: 'Failed to save audit responses' });
  }
});

export default router;
