/**
 * CMC Dashboard Routes
 * Chemistry, Manufacturing, and Controls dashboard
 */
import { Router, Response } from 'express';

const router = Router();

const sendSuccess = <T>(res: Response, data: T) => res.json({ success: true, data });

router.get('/status', (req, res) => {
  return sendSuccess(res, {
    status: 'ready',
    message: 'CMC dashboard service ready',
  });
});

router.get('/metrics', (req, res) => {
  return sendSuccess(res, {
    metrics: {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
    },
  });
});

router.get('/projects', (req, res) => {
  return sendSuccess(res, {
    projects: [],
    total: 0,
  });
});

export default router;
