import { Router } from 'express';
const router = Router();

// eCTD Module Structure routes
router.get('/modules', (req, res) => {
  res.json({ modules: ['m1', 'm2', 'm3', 'm4', 'm5'] });
});

router.get('/status', (req, res) => {
  res.json({ status: 'operational', version: '1.0' });
});

export default router;
