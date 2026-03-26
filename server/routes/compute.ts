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

export default router;
