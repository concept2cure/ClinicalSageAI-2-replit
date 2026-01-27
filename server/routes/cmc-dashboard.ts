/**
 * CMC Dashboard Routes
 * Chemistry, Manufacturing, and Controls dashboard
 */
import { Router } from 'express';

const router = Router();

router.get('/status', (req, res) => {
  res.json({
    status: 'ready',
    message: 'CMC dashboard service ready',
  });
});

router.get('/metrics', (req, res) => {
  res.json({
    metrics: {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
    },
  });
});

router.get('/projects', (req, res) => {
  res.json({
    projects: [],
    total: 0,
  });
});

export default router;
