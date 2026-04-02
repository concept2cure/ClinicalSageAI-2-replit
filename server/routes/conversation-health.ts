/**
 * Conversation Health Monitoring — API Routes
 *
 * Endpoint for computing real-time conversation health scores
 * with multi-signal degradation detection.
 */

import { Router, Request, Response } from 'express';
import { computeConversationHealth } from '../services/conversation-health';

const router = Router();

/**
 * GET /api/conversation-health/:conversationId
 * Compute health score for a conversation
 *
 * Query params:
 *   organizationId (required) — the org context
 */
router.get('/:conversationId', async (req: Request, res: Response) => {
  try {
    const conversationId = parseInt(req.params.conversationId, 10);
    const organizationId =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      (req as any).user?.organizationId;

    if (!conversationId || isNaN(conversationId)) {
      return res.status(400).json({ success: false, error: 'Valid conversationId is required' });
    }
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'organizationId is required' });
    }

    const report = await computeConversationHealth(conversationId, Number(organizationId));

    res.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Conversation health error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
