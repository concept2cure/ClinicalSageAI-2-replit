import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { authenticate } from '../../middleware/authAdapter.js';
import { requireRoles } from '../../middleware/auth.js';
import {
  enqueueCSRHarvest,
  enqueueBatchCSRHarvest,
  getQueueStats,
  getJobStatus,
  CSRHarvestJob
} from '../../queue/CSRHarvestQueue.js';
import { CSRHarvesterService } from '../../services/CSRHarvesterService.js';

const router = Router();

// Apply authentication middleware to all routes
const authMiddleware = [authenticate, requireRoles('admin', 'data_scientist')];

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000
});

const harvester = new CSRHarvesterService(db);

/**
 * Validation schemas
 */
const SingleJobSchema = z.object({
  submissionId: z.string().min(3).max(100),
  pdfUrl: z.string().url(),
  priority: z.number().min(1).max(10).optional(),
  metadata: z.object({
    regulatoryAgency: z.string().optional(),
    drugName: z.string().optional(),
    studyId: z.string().optional()
  }).optional()
});

const BatchJobSchema = z.object({
  jobs: z.array(SingleJobSchema).min(1).max(100)
});

/**
 * POST /api/vault/harvest/enqueue
 * 
 * Enqueue CSR harvest jobs (single or batch up to 100)
 */
router.post('/enqueue', authMiddleware, async (req: Request, res: Response) => {
  try {
    const body = req.body;

    // Check if it's a batch or single job
    if (Array.isArray(body.jobs)) {
      // Batch mode
      const validated = BatchJobSchema.parse(body);

      if (validated.jobs.length > 100) {
        return res.status(400).json({
          status: 'error',
          message: 'Maximum 100 jobs per batch request'
        });
      }

      const jobIds = await enqueueBatchCSRHarvest(validated.jobs as CSRHarvestJob[]);

      return res.status(201).json({
        status: 'success',
        message: `${validated.jobs.length} jobs enqueued`,
        data: {
          jobIds,
          count: validated.jobs.length
        }
      });

    } else {
      // Single job mode
      const validated = SingleJobSchema.parse(body);

      const jobId = await enqueueCSRHarvest(validated as CSRHarvestJob);

      return res.status(201).json({
        status: 'success',
        message: 'Job enqueued',
        data: {
          jobId,
          submissionId: validated.submissionId
        }
      });
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }

    console.error('Enqueue error:', error);
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to enqueue job'
    });
  }
});

/**
 * GET /api/vault/harvest/status/:submissionId
 * 
 * Get ingestion status for a submission
 */
router.get('/status/:submissionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;

    const logs = await harvester.getIngestionStatus(submissionId);

    if (logs.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No ingestion records found for this submission'
      });
    }

    // Transform the data for response
    const formatted = logs.map(log => ({
      logId: log.log_id,
      submissionId: log.submission_id,
      pdfUrl: log.pdf_url,
      status: log.status,
      startedAt: log.started_at,
      completedAt: log.completed_at,
      metrics: {
        fileSizeBytes: log.file_size_bytes,
        downloadDurationMs: log.download_duration_ms,
        extractionDurationMs: log.extraction_duration_ms,
        totalDurationMs: log.total_duration_ms
      },
      quality: {
        confidence: log.extraction_confidence_score,
        completeness: log.completeness_score
      },
      error: log.error_message,
      retryCount: log.retry_count,
      csrId: log.csr_id,
      hash: log.pdf_sha256_hash
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        submissionId,
        logs: formatted,
        latestStatus: formatted[0].status
      }
    });

  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to retrieve status'
    });
  }
});

/**
 * GET /api/vault/harvest/queue/stats
 * 
 * Get queue statistics
 */
router.get('/queue/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const stats = await getQueueStats();

    return res.status(200).json({
      status: 'success',
      data: stats
    });

  } catch (error) {
    console.error('Queue stats error:', error);
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to retrieve queue stats'
    });
  }
});

/**
 * GET /api/vault/harvest/job/:jobId
 * 
 * Get job status by job ID
 */
router.get('/job/:jobId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        status: 'error',
        message: 'Job not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      data: job
    });

  } catch (error) {
    console.error('Job status error:', error);
    return res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to retrieve job status'
    });
  }
});

export default router;
