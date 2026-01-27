/**
 * Co-Author Routes
 * eCTD collaborative authoring service
 */
import { Router } from 'express';

const router = Router();

router.get('/sessions', (req, res) => {
  res.json({
    sessions: [],
    message: 'Co-author service ready',
  });
});

router.post('/sessions', (req, res) => {
  res.json({
    success: true,
    session: { id: Date.now(), ...req.body },
  });
});

export default router;
