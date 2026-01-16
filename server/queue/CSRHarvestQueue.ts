import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

/**
 * CSRHarvestQueue - BullMQ queue for CSR harvesting jobs
 * 
 * Manages background processing of CSR downloads and ingestion
 */

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

// Create Redis connection
export const redisConnection = new Redis(redisConfig);

// Create CSR Harvest Queue
export const csrHarvestQueue = new Queue('csr-harvest', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5 seconds base delay
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 24 * 3600 // 24 hours
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs for debugging
      age: 7 * 24 * 3600 // 7 days
    }
  }
});

export interface CSRHarvestJob {
  submissionId: string;
  pdfUrl: string;
  priority?: number;
  metadata?: {
    regulatoryAgency?: string;
    drugName?: string;
    studyId?: string;
  };
}

/**
 * Add a single CSR harvest job to the queue
 */
export async function enqueueCSRHarvest(job: CSRHarvestJob): Promise<string> {
  const addedJob = await csrHarvestQueue.add(
    'harvest',
    job,
    {
      jobId: `harvest-${job.submissionId}-${Date.now()}`,
      priority: job.priority || 10
    }
  );

  return addedJob.id || '';
}

/**
 * Add multiple CSR harvest jobs to the queue (batch)
 */
export async function enqueueBatchCSRHarvest(jobs: CSRHarvestJob[]): Promise<string[]> {
  const bulkJobs = jobs.map((job, index) => ({
    name: 'harvest',
    data: job,
    opts: {
      jobId: `harvest-${job.submissionId}-${Date.now()}-${index}`,
      priority: job.priority || 10
    }
  }));

  const addedJobs = await csrHarvestQueue.addBulk(bulkJobs);
  return addedJobs.map(j => j.id || '');
}

/**
 * Get queue statistics
 */
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    csrHarvestQueue.getWaitingCount(),
    csrHarvestQueue.getActiveCount(),
    csrHarvestQueue.getCompletedCount(),
    csrHarvestQueue.getFailedCount(),
    csrHarvestQueue.getDelayedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  };
}

/**
 * Get job status by ID
 */
export async function getJobStatus(jobId: string) {
  const job = await csrHarvestQueue.getJob(jobId);
  
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    timestamp: job.timestamp
  };
}

/**
 * Clean up old jobs
 */
export async function cleanQueue(grace: number = 24 * 3600 * 1000) {
  await csrHarvestQueue.clean(grace, 1000, 'completed');
  await csrHarvestQueue.clean(7 * 24 * 3600 * 1000, 1000, 'failed');
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Closing CSR Harvest Queue...');
  await csrHarvestQueue.close();
  await redisConnection.quit();
});
