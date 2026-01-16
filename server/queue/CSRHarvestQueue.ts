/**
 * CSRHarvestQueue - BullMQ queue for CSR ingestion jobs
 * 
 * Handles job enqueueing with priority and manages job lifecycle
 */

import { Queue, QueueOptions } from 'bullmq';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('CSRHarvestQueue');

export interface CSRHarvestJobData {
  submissionId: string;
  sourceUrl: string;
  priority?: number;
  metadata?: Record<string, any>;
}

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

const queueOptions: QueueOptions = {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 604800, // Keep failed jobs for 7 days
      count: 5000, // Keep last 5000 failed jobs
    },
  },
};

export class CSRHarvestQueue {
  private queue: Queue<CSRHarvestJobData>;

  constructor() {
    this.queue = new Queue<CSRHarvestJobData>('csr-harvest', queueOptions);
    
    this.queue.on('error', (error) => {
      logger.error('Queue error', { error });
    });

    logger.info('CSRHarvestQueue initialized', { redisConfig: { host: redisConfig.host, port: redisConfig.port } });
  }

  /**
   * Enqueue a single harvest job
   */
  async enqueue(data: CSRHarvestJobData): Promise<string> {
    try {
      const job = await this.queue.add(
        'harvest-csr',
        data,
        {
          priority: data.priority || 5,
          jobId: `harvest-${data.submissionId}-${Date.now()}`,
        }
      );

      logger.info('Job enqueued', { jobId: job.id, submissionId: data.submissionId });
      return job.id!;
    } catch (error) {
      logger.error('Failed to enqueue job', { data, error });
      throw error;
    }
  }

  /**
   * Enqueue multiple harvest jobs
   */
  async enqueueBatch(jobs: CSRHarvestJobData[]): Promise<string[]> {
    try {
      const jobIds: string[] = [];
      
      for (const data of jobs) {
        const jobId = await this.enqueue(data);
        jobIds.push(jobId);
      }

      logger.info('Batch enqueued', { count: jobs.length, jobIds });
      return jobIds;
    } catch (error) {
      logger.error('Failed to enqueue batch', { count: jobs.length, error });
      throw error;
    }
  }

  /**
   * Get job status by job ID
   */
  async getJobStatus(jobId: string): Promise<any> {
    try {
      const job = await this.queue.getJob(jobId);
      
      if (!job) {
        return { status: 'not_found' };
      }

      const state = await job.getState();
      
      return {
        jobId: job.id,
        status: state,
        data: job.data,
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        failedReason: job.failedReason,
      };
    } catch (error) {
      logger.error('Failed to get job status', { jobId, error });
      throw error;
    }
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<any> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaitingCount(),
        this.queue.getActiveCount(),
        this.queue.getCompletedCount(),
        this.queue.getFailedCount(),
        this.queue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      logger.error('Failed to get queue metrics', { error });
      throw error;
    }
  }

  /**
   * Close queue connection
   */
  async close(): Promise<void> {
    await this.queue.close();
    logger.info('CSRHarvestQueue closed');
  }
}

export default CSRHarvestQueue;
