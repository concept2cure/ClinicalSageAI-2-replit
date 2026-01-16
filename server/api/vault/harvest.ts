/**
 * CSR Harvest API Routes
 * 
 * Endpoints:
 * - POST /api/vault/harvest/enqueue - Enqueue harvest jobs (up to 100)
 * - GET /api/vault/harvest/status - Get job status by submission_id
 */

import { Router, Request, Response } from 'express';
import { createScopedLogger } from '../../utils/logger';
import CSRHarvestQueue from '../../queue/CSRHarvestQueue';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

const router = Router();
const logger = createScopedLogger('harvest-routes');

// Initialize queue
const harvestQueue = new CSRHarvestQueue();

/**
 * Enqueue harvest jobs
 * POST /api/vault/harvest/enqueue
 * 
 * Body: {
 *   jobs: [
 *     { submissionId: string, sourceUrl: string, priority?: number }
 *   ]
 * }
 */
router.post('/enqueue', async (req: Request, res: Response) => {
  try {
    // Auth check - authenticateJWT middleware should be applied
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const { jobs } = req.body;

    // Validate input
    if (!jobs || !Array.isArray(jobs)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request: jobs array required',
      });
    }

    if (jobs.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request: at least one job required',
      });
    }

    if (jobs.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request: maximum 100 jobs per batch',
      });
    }

    // Validate each job
    for (const job of jobs) {
      if (!job.submissionId || !job.sourceUrl) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid job: submissionId and sourceUrl required',
        });
      }
    }

    // Enqueue jobs
    logger.info('Enqueueing harvest jobs', { count: jobs.length, userId: req.user.id });
    
    const jobIds = await harvestQueue.enqueueBatch(
      jobs.map(job => ({
        submissionId: job.submissionId,
        sourceUrl: job.sourceUrl,
        priority: job.priority || 5,
        metadata: {
          enqueuedBy: req.user.id,
          enqueuedAt: new Date().toISOString(),
          organizationId: req.user.organizationId,
        },
      }))
    );

    res.status(200).json({
      status: 'success',
      message: `${jobIds.length} jobs enqueued successfully`,
      data: {
        jobIds,
        count: jobIds.length,
      },
    });
  } catch (error) {
    logger.error('Failed to enqueue jobs', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to enqueue jobs',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get harvest status by submission_id
 * GET /api/vault/harvest/status?submissionId=xxx
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Auth check
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const { submissionId } = req.query;

    if (!submissionId || typeof submissionId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid request: submissionId query parameter required',
      });
    }

    // Query ingestion log
    const result = await db.execute(sql`
      SELECT 
        job_id,
        submission_id,
        source_url,
        status,
        started_at,
        completed_at,
        error_message,
        pdf_checksum,
        pdf_size_bytes,
        extraction_metadata,
        retry_count,
        created_at,
        updated_at
      FROM csr_ingestion_log
      WHERE submission_id = ${submissionId}
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const records = result.rows;

    if (!records || records.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'No records found for this submission_id',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        submissionId,
        records,
        latestStatus: records[0],
      },
    });
  } catch (error) {
    logger.error('Failed to get harvest status', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get harvest status',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get queue metrics
 * GET /api/vault/harvest/metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    // Auth check
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const metrics = await harvestQueue.getMetrics();

    res.status(200).json({
      status: 'success',
      data: metrics,
    });
  } catch (error) {
    logger.error('Failed to get queue metrics', { error });
    res.status(500).json({
      status: 'error',
      message: 'Failed to get queue metrics',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
