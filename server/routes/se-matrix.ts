/** The legacy endpoint never queued a render: a timestamp-based ID was returned
 * after payload generation. Refuse before generating content until a real
 * governed factory contract exists. The launch catalog remains unchanged. */
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireShadowProgramAccess } from '../services/defense-packet/request-contract';

const router = Router();
router.use(authenticateToken);
router.post('/:programId/se-matrix/render', requireShadowProgramAccess, (_req, res) =>
  res.status(501).json({ code: 'SE_MATRIX_RENDER_UNAVAILABLE',
    error: 'SE matrix rendering is not connected to a governed render service. No render job was created.', renderJobId: null }));
export default router;
