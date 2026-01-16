import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { redisConnection } from './CSRHarvestQueue.js';
import { CSRHarvesterService } from '../services/CSRHarvesterService.js';

/**
 * CSR Harvest Worker
 * 
 * Processes CSR harvest jobs from the queue with concurrency control
 */

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Initialize harvester service
const harvester = new CSRHarvesterService(db);

// Create worker with concurrency 4
const worker = new Worker(
  'csr-harvest',
  async (job) => {
    const { submissionId, pdfUrl, metadata } = job.data;

    console.log(`[CSR-WORKER] Processing job ${job.id}: ${submissionId}`);
    
    try {
      // Update progress
      await job.updateProgress(10);

      // Run the harvest pipeline
      const csrId = await harvester.harvestCSR(submissionId, pdfUrl);

      await job.updateProgress(100);

      console.log(`[CSR-WORKER] ✓ Completed job ${job.id}: CSR ID ${csrId}`);

      return {
        success: true,
        csrId,
        submissionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[CSR-WORKER] ✗ Failed job ${job.id}:`, error);
      throw error; // Let BullMQ handle retry logic
    }
  },
  {
    connection: redisConnection,
    concurrency: 4, // Process up to 4 jobs simultaneously
    limiter: {
      max: 10, // Max 10 jobs
      duration: 60000 // per minute (rate limiting)
    },
    lockDuration: 300000, // 5 minutes lock duration for long-running jobs
    autorun: true
  }
);

// Event handlers
worker.on('completed', (job) => {
  console.log(`[CSR-WORKER] Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  console.error(`[CSR-WORKER] Job ${job?.id} failed:`, err.message);
});

worker.on('error', (err) => {
  console.error('[CSR-WORKER] Worker error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`[CSR-WORKER] Job ${jobId} stalled`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[CSR-WORKER] Shutting down...');
  
  try {
    await worker.close();
    await db.end();
    await redisConnection.quit();
    console.log('[CSR-WORKER] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[CSR-WORKER] Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[CSR-WORKER] Worker started, processing jobs with concurrency 4...');

export default worker;
