/**
 * @fileoverview AnA Research API Routes
 * @module server/routes/deep-research
 *
 * REST + SSE endpoints for deep research jobs, connector management,
 * and usage tracking.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { loadLicense, requireTier } from '../services/license-manager.js';
import {
  launchResearchJob,
  getJobStatus,
  listJobs,
  cancelJob,
  onJobProgress,
} from '../services/deep-research-orchestrator.js';
import {
  getConnectorCatalog,
  storeCredentials,
} from '../services/connectors/connector-registry.js';
import { getUsageSummary } from '../services/usage-metering.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);
router.use(loadLicense());

// ═══════════════════════════════════════════════════════════════════════════════
// RESEARCH JOBS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/deep-research/jobs — Launch a new deep research job
 */
router.post('/jobs', requireTier('standard'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const orgId = user?.organizationId || (req as any).tenantContext?.organizationId;

    if (!orgId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    const { query, connectorIds, projectId, depth } = req.body;

    if (!query?.indication) {
      return res.status(400).json({ error: 'query.indication is required' });
    }

    const job = await launchResearchJob({
      organizationId: Number(orgId),
      userId: Number(user?.id || user?.userId),
      projectId: projectId || null,
      query,
      connectorIds: connectorIds || ['clinical_trials_gov', 'pubmed'],
      depth: depth || 'standard',
    });

    res.status(201).json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes('quota') || message.includes('tier') ? 403 : 500;
    res.status(status).json({ error: message });
  }
});

/**
 * GET /api/deep-research/jobs — List jobs for current org
 */
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const jobs = await listJobs(Number(orgId), limit);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/deep-research/jobs/:id — Get job status + results
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const job = await getJobStatus(parseInt(req.params.id, 10));
    res.json(job);
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

/**
 * POST /api/deep-research/jobs/:id/stop — Cancel a running job
 */
router.post('/jobs/:id/stop', async (req: Request, res: Response) => {
  try {
    await cancelJob(parseInt(req.params.id, 10));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/deep-research/jobs/:id/stream — SSE stream for progress
 */
router.get('/jobs/:id/stream', async (req: Request, res: Response) => {
  const jobId = parseInt(req.params.id, 10);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send initial status
  try {
    const job = await getJobStatus(jobId);
    res.write(`data: ${JSON.stringify({ progress: job.progress, status: job.status })}\n\n`);

    if (job.status === 'complete' || job.status === 'failed') {
      res.write(`data: ${JSON.stringify({ progress: 100, status: job.status, done: true })}\n\n`);
      res.end();
      return;
    }
  } catch {
    res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
    res.end();
    return;
  }

  // Register for progress updates
  onJobProgress(jobId, (progress, status, data) => {
    try {
      res.write(`data: ${JSON.stringify({ progress, status, ...data })}\n\n`);
      if (status === 'complete' || status === 'failed') {
        res.end();
      }
    } catch {
      // Client disconnected
    }
  });

  // Clean up on disconnect
  req.on('close', () => {
    // Progress callback will be cleaned up by orchestrator
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/deep-research/connectors — List available connectors + status
 */
router.get('/connectors', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const catalog = await getConnectorCatalog(Number(orgId));
    res.json({ connectors: catalog });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/deep-research/connectors — Store connector credentials
 */
router.post('/connectors', requireTier('professional'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const { connectorId, credentials } = req.body;
    if (!connectorId || !credentials) {
      return res.status(400).json({ error: 'connectorId and credentials are required' });
    }

    await storeCredentials(Number(orgId), connectorId, credentials);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/deep-research/usage — Usage/credits for billing period
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId || (req as any).tenantContext?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'Organization context required' });

    const summary = await getUsageSummary(Number(orgId));
    res.json({ usage: summary });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
