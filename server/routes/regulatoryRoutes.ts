import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as regService from '../services/regulatoryService.js';

const router = express.Router();
router.use(authenticate);
router.get('/regulatory/search', async (req, res) => {
  const { q } = req.query;
  const results = await regService.searchGuidance(q as string);
  res.json(results);
});
router.get('/regulatory/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const analysis = await regService.analyzeRisk(sectionId);
  res.json(analysis);
});
export default router;
