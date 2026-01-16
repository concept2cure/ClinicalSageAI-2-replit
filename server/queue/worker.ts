/**
 * CSR Harvest Worker
 * 
 * BullMQ worker that processes CSR harvest jobs with concurrency 4
 * Handles retries with exponential backoff
 */

import { Worker, Job } from 'bullmq';
import { createScopedLogger } from '../utils/logger';
import CSRHarvesterService from '../services/CSRHarvesterService';
import type { CSRHarvestJobData } from './CSRHarvestQueue';

const logger = createScopedLogger('CSRHarvestWorker');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL
const parseRedisUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    return {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port || '6379', 10),
      password: parsedUrl.password || undefined,
      username: parsedUrl.username || undefined,
      db: parsedUrl.pathname ? parseInt(parsedUrl.pathname.slice(1), 10) : 0,
    };
  } catch (error) {
    logger.error('Failed to parse Redis URL', { error });
    return {
      host: 'localhost',
      port: 6379,
    };
  }
};

const redisConfig = parseRedisUrl(REDIS_URL);

// Initialize harvester service
const harvesterService = new CSRHarvesterService();

// Worker processor function
const processJob = async (job: Job<CSRHarvestJobData>) => {
  const jobId = job.id || `unknown-${Date.now()}`;
  logger.info('Processing job', { jobId, data: job.data });

  const result = await harvesterService.processJob({
    jobId,
    submissionId: job.data.submissionId,
    sourceUrl: job.data.sourceUrl,
    priority: job.data.priority,
  });

  if (!result.success) {
    throw new Error(result.error || 'Job processing failed');
  }

  logger.info('Job completed', { jobId, submissionId: result.submissionId });
  return result;
};

// Create worker
const worker = new Worker<CSRHarvestJobData>('csr-harvest', processJob, {
  connection: redisConfig,
  concurrency: 4,
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // per second
  },
});

// Worker event handlers
worker.on('completed', (job) => {
  logger.info('Job completed', { jobId: job.id });
});

worker.on('failed', (job, err) => {
  logger.error('Job failed', { 
    jobId: job?.id, 
    error: err.message,
    attemptsMade: job?.attemptsMade,
  });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err });
});

worker.on('stalled', (jobId) => {
  logger.warn('Job stalled', { jobId });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down worker...');
  await worker.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

logger.info('CSR Harvest Worker started', { 
  concurrency: 4,
  redisConfig: { host: redisConfig.host, port: redisConfig.port }
});
