/**
 * FDA Integration Routes (Simple)
 * FDA gateway integration service
 */
import { Router } from 'express';

const router = Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    connected: false,
    message: 'FDA integration service ready',
  });
});

router.get('/submissions', (req, res) => {
  res.json({
    submissions: [],
    message: 'No submissions found',
  });
});

export default router;
