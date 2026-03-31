import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../auth';
import { tenantContextMiddleware, requireOrganizationContext } from '../middleware/tenantContext';
import { createRedisRateLimiter } from '../middleware/redisRateLimiter';
import {
  enqueueAndRunComputeJob,
  getComputeJobDetail,
  listComputeJobs,
} from '../services/compute/computeService';
import { temporalWorkflowSpine } from '../services/workflows/temporal/temporalWorkflowSpine';

const router = Router();

const limiter = createRedisRateLimiter({
  rules: {
    concept2cure: {
      windowMs: 60_000,
      maxRequests: 80,
      message: 'Rate limit exceeded for compute API',
    },
  },
  perOrganization: true,
  keyPrefix: 'c2c:compute:',
});

router.use(limiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);


const startWorkflowSchema = z.object({
  workflowType: z.enum([
    'evidence_ingestion_enrichment',
    'document_export_compile',
    'report_generation_verify',
  ]),
  artifactId: z.string().optional(),
  payload: z.record(z.any()).default({}),
});

const transitionSchema = z.object({
  status: z.enum(['running', 'waiting_approval', 'completed', 'failed']),
  details: z.record(z.any()).optional(),
});

const createJobSchema = z.object({
  surfaceKey: z.enum(['ri_copilot', 'cmc_module3', 'ectd_ind', 'governed_export']),
  intentType: z.enum([
    'docx_generation',
    'spreadsheet_generation',
    'chart_report_generation',
    'pptx_generation',
    'bundle_assembly',
    'safe_html_generation',
  ]),
  title: z.string().min(3),
  content: z.string().min(3),
  ctdSection: z.string().optional(),
  format: z.enum(['docx', 'xlsx', 'pptx', 'zip', 'html']).default('docx'),
  metadata: z.record(z.any()).optional(),
});

router.get('/projects/:projectId/jobs', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const organizationId = Number(req.tenantContext?.organizationId || req.tenantId);
  const jobs = await listComputeJobs(projectId, organizationId);
  res.json({ success: true, data: jobs });
});

router.get('/projects/:projectId/jobs/:jobId', async (req, res) => {
  const projectId = Number(req.params.projectId);
  const organizationId = Number(req.tenantContext?.organizationId || req.tenantId);
  const detail = await getComputeJobDetail(projectId, organizationId, req.params.jobId);
  if (!detail) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  return res.json({ success: true, data: detail });
});

router.post('/projects/:projectId/jobs', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = Number(req.tenantContext?.organizationId || req.tenantId);
    const requestedById = Number(req.userId || 0);
    const payload = createJobSchema.parse(req.body || {});

    const result = await enqueueAndRunComputeJob({
      projectId,
      organizationId,
      requestedById,
      surfaceKey: payload.surfaceKey,
      intentType: payload.intentType,
      title: payload.title,
      content: payload.content,
      ctdSection: payload.ctdSection,
      format: payload.format,
      metadata: payload.metadata,
    });

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to execute compute job' });
  }
});



router.post('/projects/:projectId/governed-workflow-runs', async (req, res) => {
  try {
    const projectId = Number(req.params.projectId);
    const organizationId = Number(req.tenantContext?.organizationId || req.tenantId);
    const payload = startWorkflowSchema.parse(req.body || {});

    const started = await temporalWorkflowSpine.startWorkflow({
      workflowType: payload.workflowType,
      organizationId,
      projectId,
      artifactId: payload.artifactId,
      payload: payload.payload || {},
      triggeredBy: String(req.userId || 'system'),
    });

    await temporalWorkflowSpine.markTransition(started.runId, 'running', { trigger: 'api' });

    return res.status(201).json({ success: true, data: started });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to start governed workflow' });
  }
});



router.get('/projects/:projectId/governed-workflow-runs/:runId', async (req, res) => {
  try {
    const run = await temporalWorkflowSpine.getWorkflowRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ success: false, error: 'Workflow run not found' });
    }

    if (Number((run as any).organization_id) !== Number(req.tenantContext?.organizationId || req.tenantId)) {
      return res.status(403).json({ success: false, error: 'Workflow run not in organization scope' });
    }

    return res.json({ success: true, data: run });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load workflow run' });
  }
});

router.post('/projects/:projectId/governed-workflow-runs/:runId/transitions', async (req, res) => {
  try {
    const payload = transitionSchema.parse(req.body || {});
    await temporalWorkflowSpine.markTransition(req.params.runId, payload.status, {
      ...(payload.details || {}),
      actor: String(req.userId || 'system'),
      source: 'api-transition',
    });

    const run = await temporalWorkflowSpine.getWorkflowRun(req.params.runId);
    return res.json({ success: true, data: run });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update workflow run' });
  }
});

export default router;
