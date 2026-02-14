import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { RegulatoryIntelligenceService } from '../services/regulatory-intelligence-service';

const router = express.Router();
const regulatoryService = new RegulatoryIntelligenceService();
router.use(authenticate);
router.get('/regulatory/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});
router.get('/regulatory/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
});
export default router;
