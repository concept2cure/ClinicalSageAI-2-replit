import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { RegulatoryIntelligenceService } from '../services/regulatory-intelligence-service';

const router = express.Router();
const regulatoryService = new RegulatoryIntelligenceService();
router.use(authenticate);

const defaultSubmissions = [
  {
    id: 'sub-001',
    title: 'IND Initial Submission',
    agency: 'FDA',
    status: 'in_review',
    type: 'IND',
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const defaultCalendarEvents = [
  {
    id: 'cal-001',
    title: 'FDA Type B Meeting',
    eventType: 'meeting',
    status: 'scheduled',
    priority: 'high',
    eventDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    submissionId: 'sub-001',
  },
];

router.get('/submissions', async (_req, res) => {
  return res.json({
    success: true,
    data: defaultSubmissions,
  });
});

router.get('/calendar', async (_req, res) => {
  return res.json({
    success: true,
    data: defaultCalendarEvents,
  });
});

router.post('/calendar', async (req, res) => {
  const { title, eventType, eventDate, submissionId, status, priority } = req.body || {};

  if (!title || !eventType || !eventDate) {
    return res.status(400).json({
      success: false,
      error: 'title, eventType, and eventDate are required',
    });
  }

  const newEvent = {
    id: `cal-${Date.now()}`,
    title,
    eventType,
    eventDate,
    submissionId: submissionId || null,
    status: status || 'scheduled',
    priority: priority || 'medium',
  };

  return res.status(201).json({
    success: true,
    data: newEvent,
  });
});

router.get('/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/regulatory/search', async (req, res) => {
  const { q, phase } = req.query;
  await regulatoryService.initialize();
  const results = await regulatoryService.getRegulatoryIntelligence(
    (phase as string) || 'Phase 2',
    q as string | undefined
  );
  res.json(results);
});

router.get('/risk/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  await regulatoryService.initialize();
  const analysis = await regulatoryService.analyzeProtocolCompliance(
    `Section ${sectionId}`,
    'Phase 2'
  );
  res.json({ sectionId, analysis });
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
