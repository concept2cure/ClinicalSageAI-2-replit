/**
 * Real-Time Validation API Routes
 * 
 * Provides endpoints for real-time document validation with AI-powered suggestions
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import realTimeValidationService from '../services/realTimeValidationService';
// @ts-ignore - JavaScript middleware file
import { authenticateToken } from '../middleware/auth';
// @ts-ignore - JavaScript middleware file
import { requireOrganizationContext } from '../middleware/tenantContext';

const router = Router();

// Apply authentication and organization context middleware
router.use(authenticateToken);
router.use(requireOrganizationContext);

// Validation request schema
const validateRequestSchema = z.object({
  sessionId: z.string(),
  content: z.string(),
  documentType: z.string(),
  immediateMode: z.boolean().optional(),
  documentId: z.number().optional(),
  agency: z.string().optional()
});

/**
 * POST /api/realtime-validation/validate
 * Validate document content in real-time
 */
router.post('/validate', async (req, res) => {
  try {
    const validatedData = validateRequestSchema.parse(req.body);
    const { organizationId } = req as any;
    
    const result = await realTimeValidationService.validateContent(
      validatedData.sessionId,
      validatedData.content,
      validatedData.documentType,
      validatedData.immediateMode,
      organizationId,
      validatedData.documentId,
      validatedData.agency
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Validation error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Validation failed' 
    });
  }
});

/**
 * DELETE /api/realtime-validation/session/:sessionId
 * Clear validation session cache
 */
router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  realTimeValidationService.clearSession(sessionId);
  
  res.json({
    success: true,
    message: 'Session cleared'
  });
});

/**
 * GET /api/realtime-validation/statistics
 * Get validation statistics for the organization
 */
router.get('/statistics', async (req, res) => {
  try {
    const { organizationId } = req as any;
    
    const stats = await realTimeValidationService.getValidationStatistics(organizationId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics' 
    });
  }
});

// Note: WebSocket endpoint removed - requires express-ws setup
// Real-time validation events can be polled via the /validate endpoint
// or implemented with Server-Sent Events (SSE) if needed

export default router;