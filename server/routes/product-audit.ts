/**
 * C2C Product Audit Questionnaire API
 * 
 * Provides endpoints for saving and retrieving audit questionnaire responses
 * for the Concept2Cure workflow. Responses are stored per-organization in memory.
 * 
 * Features:
 * - Save audit questionnaire responses
 * - Retrieve audit responses by organization
 * - Track audit progress and severity levels
 * - Maintain audit history per organization
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
// @ts-ignore - JavaScript middleware file
import { authenticateToken } from '../middleware/auth';
// @ts-ignore - JavaScript middleware file
import { requireOrganizationContext } from '../middleware/tenantContext';

const router = Router();

// Apply authentication and organization context middleware
router.use(authenticateToken);
router.use(requireOrganizationContext);

// In-memory storage for audit responses
// Map<organizationId, AuditState>
// 
// WARNING: Data is not persisted and will be lost on server restart.
// This is suitable for development and lightweight auditing only.
// For production use, migrate to database storage to ensure data persistence
// and proper audit trail compliance.
const auditStore = new Map<number, AuditState>();

/**
 * Type definitions for audit data
 */
interface AuditResponse {
  questionId: string;  // e.g. "1.1", "2.3"
  status: 'yes' | 'no' | 'partial' | 'in_progress' | null;
  notes: string;
  severity: 'p0' | 'p1' | 'p2' | 'p3' | 'verified' | null;
  updatedAt: string;
}

interface AuditState {
  organizationId: number;
  responses: Record<string, AuditResponse>;
  lastUpdated: string;
  auditor: string;
}

/**
 * Zod schema for audit response validation
 */
const auditResponseSchema = z.object({
  questionId: z.string().min(1, 'Question ID is required'),
  status: z.enum(['yes', 'no', 'partial', 'in_progress']).nullable(),
  notes: z.string().default(''),
  severity: z.enum(['p0', 'p1', 'p2', 'p3', 'verified']).nullable(),
  updatedAt: z.string().datetime()
});

const saveAuditRequestSchema = z.object({
  responses: z.record(z.string(), auditResponseSchema),
  auditor: z.string().optional()
});

/**
 * GET /api/product-audit/responses
 * Retrieve audit responses for the current organization
 */
router.get('/responses', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req as any;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization context is required'
      });
    }
    
    // Get existing audit state or return empty state
    const auditState = auditStore.get(organizationId) || {
      organizationId,
      responses: {},
      lastUpdated: new Date().toISOString(),
      auditor: user?.email || 'system'
    };
    
    res.json({
      success: true,
      data: auditState
    });
  } catch (error) {
    console.error('Error retrieving audit responses:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve audit responses'
    });
  }
});

/**
 * POST /api/product-audit/responses
 * Save audit questionnaire responses
 */
router.post('/responses', async (req: Request, res: Response) => {
  try {
    const { organizationId, user } = req as any;
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization context is required'
      });
    }
    
    // Validate request body
    const validatedData = saveAuditRequestSchema.parse(req.body);
    
    // Get existing audit state or create new one
    const existingState = auditStore.get(organizationId) || {
      organizationId,
      responses: {},
      lastUpdated: new Date().toISOString(),
      auditor: user?.email || 'system'
    };
    
    // Merge new responses with existing ones
    const updatedResponses = {
      ...existingState.responses,
      ...validatedData.responses
    };
    
    // Update audit state
    const updatedState: AuditState = {
      organizationId,
      responses: updatedResponses,
      lastUpdated: new Date().toISOString(),
      auditor: validatedData.auditor || existingState.auditor
    };
    
    // Save to store
    auditStore.set(organizationId, updatedState);
    
    res.json({
      success: true,
      data: updatedState,
      message: 'Audit responses saved successfully'
    });
  } catch (error) {
    console.error('Error saving audit responses:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to save audit responses'
    });
  }
});

export default router;
