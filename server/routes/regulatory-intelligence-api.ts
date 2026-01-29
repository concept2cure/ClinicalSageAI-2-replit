/**
 * Regulatory Intelligence API Routes
 * 
 * Endpoints for FDA alerts, MAUDE, recalls, guidances, and morning briefing.
 * 
 * @module server/routes/regulatory-intelligence-api
 * @version 1.0.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createScopedLogger } from '../utils/logger';
import { authMiddleware } from '../auth';
import { tenantContextMiddleware } from '../middleware/tenantContext';
import { RegulatoryIntelligenceService } from '../services/regulatory-intelligence-service';
import { searchDeviceReports, analyzeMaudeData } from '../fda_maude_client.js';
import { gatherIntegratedData } from '../data_integration.js';

const logger = createScopedLogger('regulatory-intel-api');
const router = Router();

// Apply authentication
router.use(authMiddleware);
router.use(tenantContextMiddleware);

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const regulatoryService = new RegulatoryIntelligenceService();

const morningBriefingQuerySchema = z.object({
  phase: z.string().optional(),
  indication: z.string().optional(),
  productCode: z.string().optional(),
  deviceName: z.string().optional(),
  manufacturer: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/regulatory-intelligence/morning-briefing
 * Returns personalized morning briefing with alerts, priorities, and insights
 */
router.get('/morning-briefing', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'anonymous';
    const userName = (req as any).user?.name || 'User';
    const query = morningBriefingQuerySchema.parse(req.query);

    logger.info('Generating morning briefing', { userId, query });

    await regulatoryService.initialize();

    const phase = query.phase || 'Phase 1';
    const regulatorySummary = await regulatoryService.getRegulatoryIntelligence(
      phase,
      query.indication
    );

    const maudeReports = query.productCode || query.deviceName || query.manufacturer
      ? await searchDeviceReports({
          productCode: query.productCode || '',
          deviceName: query.deviceName || '',
          manufacturer: query.manufacturer || '',
          dateFrom: query.dateFrom || '',
          dateTo: query.dateTo || '',
          limit: 50,
        })
      : [];

    const maudeAnalysis = analyzeMaudeData(maudeReports);

    const integratedData = await gatherIntegratedData({
      productId: query.productCode,
      productName: query.deviceName,
      manufacturer: query.manufacturer,
      isDevice: true,
      isDrug: false,
    });

    const alerts = regulatorySummary.key_requirements
      .filter(req => req.compliance_level === 'mandatory')
      .slice(0, 6)
      .map((req, index) => ({
        id: `req-${index}`,
        title: `${req.agency} ${req.guideline}`,
        summary: req.requirement,
        priority: 'high',
        category: 'compliance',
        source: req.agency,
        sourceUrl: req.document_reference,
        publishedAt: req.last_updated,
        recommendations: [req.requirement],
        read: false,
      }));

    const guidanceAlerts = regulatorySummary.relevant_guidance.slice(0, 4).map((guidance, index) => ({
      id: `guidance-${index}`,
      title: guidance.title,
      summary: guidance.summary,
      priority: 'medium',
      category: 'intelligence',
      source: guidance.agency,
      sourceUrl: guidance.url,
      publishedAt: `${guidance.year}-01-01`,
      recommendations: guidance.tags,
      read: false,
    }));

    const allAlerts = [...alerts, ...guidanceAlerts];

    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        userName,
        stats: {
          totalAlerts: allAlerts.length,
          criticalAlerts: allAlerts.filter(a => a.priority === 'critical').length,
          pendingDeadlines: 0,
          activeProjects: 0,
          complianceScore: Math.min(100, 60 + regulatorySummary.key_requirements.length),
        },
        alerts: allAlerts,
        priorities: [],
        insights: [
          {
            id: 'insight-maude',
            type: 'risk',
            message: maudeAnalysis.summary,
            impact: maudeAnalysis.serious_events > 0 ? 'negative' : 'positive',
          },
          {
            id: 'insight-integrated',
            type: 'trend',
            message: `Integrated sources: ${(integratedData.sources || []).join(', ') || 'None'}`,
            impact: 'positive',
          },
        ],
        regulatorySummary,
        maudeSummary: maudeAnalysis,
      },
    });
  } catch (error) {
    logger.error('Failed to generate morning briefing', { error });
    res.status(500).json({ success: false, error: 'Failed to generate briefing' });
  }
});

/**
 * GET /api/regulatory-intelligence/alerts
 * Returns regulatory alerts with optional filtering
 */
router.get('/alerts', async (req: Request, res: Response) => {
  try {
    const { priority, category, unreadOnly, phase, indication } = req.query;

    await regulatoryService.initialize();
    const regulatorySummary = await regulatoryService.getRegulatoryIntelligence(
      (phase as string) || 'Phase 1',
      indication as string | undefined
    );

    const alerts = regulatorySummary.key_requirements.map((req, index) => ({
      id: `req-${index}`,
      title: `${req.agency} ${req.guideline}`,
      summary: req.requirement,
      priority: req.compliance_level === 'mandatory' ? 'high' : 'medium',
      category: 'compliance',
      source: req.agency,
      sourceUrl: req.document_reference,
      publishedAt: req.last_updated,
      recommendations: [req.requirement],
      read: false,
    }));

    let filteredAlerts = alerts;

    if (priority) {
      filteredAlerts = filteredAlerts.filter(a => a.priority === priority);
    }

    if (category) {
      filteredAlerts = filteredAlerts.filter(a => a.category === category);
    }

    if (unreadOnly === 'true') {
      filteredAlerts = filteredAlerts.filter(a => !a.read);
    }

    res.json({
      success: true,
      data: filteredAlerts,
      total: filteredAlerts.length,
    });
  } catch (error) {
    logger.error('Failed to fetch alerts', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

/**
 * POST /api/regulatory-intelligence/alerts/:id/read
 * Mark an alert as read
 */
router.post('/alerts/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // In production, update database
    logger.info('Marking alert as read', { alertId: id });
    
    res.json({ success: true, data: { id, read: true } });
  } catch (error) {
    logger.error('Failed to mark alert as read', { error });
    res.status(500).json({ success: false, error: 'Failed to update alert' });
  }
});

/**
 * GET /api/regulatory-intelligence/maude
 * Search MAUDE database for adverse events
 */
router.get('/maude', async (req: Request, res: Response) => {
  try {
    const { productCode, deviceName, manufacturer, dateFrom, dateTo, limit = '50' } = req.query;

    logger.info('Searching MAUDE database', { productCode, deviceName, manufacturer });

    const results = await searchDeviceReports({
      productCode: (productCode as string) || '',
      deviceName: (deviceName as string) || '',
      manufacturer: (manufacturer as string) || '',
      dateFrom: (dateFrom as string) || '',
      dateTo: (dateTo as string) || '',
      limit: parseInt(limit as string, 10) || 50,
    });

    const analysis = analyzeMaudeData(results);

    res.json({
      success: true,
      data: results,
      total: results.length,
      analysis,
      meta: {
        query: { productCode, deviceName, manufacturer, dateFrom, dateTo },
        limit: parseInt(limit as string, 10) || 50,
      },
    });
  } catch (error) {
    logger.error('MAUDE search failed', { error });
    res.status(500).json({ success: false, error: 'MAUDE search failed' });
  }
});

/**
 * GET /api/regulatory-intelligence/recalls
 * Get FDA recalls and safety communications
 */
router.get('/recalls', async (req: Request, res: Response) => {
  try {
    const { classification, status, dateRange } = req.query;

    logger.info('Fetching recalls', { classification, status, dateRange });

    res.json({
      success: true,
      data: [],
      total: 0,
      meta: { note: 'Recall feed not yet integrated in this endpoint.' },
    });
  } catch (error) {
    logger.error('Failed to fetch recalls', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch recalls' });
  }
});

/**
 * GET /api/regulatory-intelligence/guidances
 * Get FDA guidance documents
 */
router.get('/guidances', async (req: Request, res: Response) => {
  try {
    const { phase, indication } = req.query;

    logger.info('Fetching FDA guidances', { phase, indication });

    await regulatoryService.initialize();
    const summary = await regulatoryService.getRegulatoryIntelligence(
      (phase as string) || 'Phase 1',
      indication as string | undefined
    );

    const guidances = summary.relevant_guidance.map((guidance, index) => ({
      id: `guidance-${index}`,
      title: guidance.title,
      documentType: 'Guidance',
      center: guidance.agency,
      issueDate: `${guidance.year}-01-01`,
      topics: guidance.tags,
      summary: guidance.summary,
      documentUrl: guidance.url,
      publicCommentDeadline: null,
    }));

    res.json({
      success: true,
      data: guidances,
      total: guidances.length,
    });
  } catch (error) {
    logger.error('Failed to fetch guidances', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch guidances' });
  }
});

/**
 * GET /api/regulatory-intelligence/pdufa-dates
 * Get PDUFA action dates and milestones
 */
router.get('/pdufa-dates', async (req: Request, res: Response) => {
  try {
    const { upcoming = 'true', applicationNumber } = req.query;

    logger.info('Fetching PDUFA dates', { upcoming, applicationNumber });

    res.json({
      success: true,
      data: [],
      total: 0,
      meta: { note: 'PDUFA feed not yet integrated in this endpoint.' },
    });
  } catch (error) {
    logger.error('Failed to fetch PDUFA dates', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch PDUFA dates' });
  }
});

/**
 * GET /api/regulatory-intelligence/alerts/stream
 * SSE endpoint for real-time alerts
 */
router.get('/alerts/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const userId = (req as any).user?.id || 'anonymous';
  logger.info('SSE connection established', { userId });
  
  // Send initial ping
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
  
  // In production, subscribe to alert queue/pubsub
  const intervalId = setInterval(() => {
    // Send heartbeat
    res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);
  
  req.on('close', () => {
    clearInterval(intervalId);
    logger.info('SSE connection closed', { userId });
  });
});

export default router;
