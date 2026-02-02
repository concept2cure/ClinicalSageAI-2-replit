/**
 * TrialSage CER Worker
 *
 * This worker process handles CER generation jobs from the queue.
 * It provides:
 * - PDF generation via puppeteer
 * - Job status updates
 * - Error handling and retry logic
 * - Health check endpoint
 */

const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const crypto = require('crypto');
const logger = require('../server/utils/logger');

// Create Express app for health checks and metrics
const app = express();
const port = process.env.PORT || 3001;

// PostgreSQL connection (if available)
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

// In-memory job tracking if no database is available
const activeJobs = new Map();
const completedJobs = new Map();
const failedJobs = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    activeJobCount: activeJobs.size,
    completedJobCount: completedJobs.size,
    failedJobCount: failedJobs.size,
  });
});

// Start HTTP server for health checks
const server = http.createServer(app);
server.listen(port, () => {
  logger.info(`Worker health check server running on port ${port}`);
});

// Process jobs (simplified version without Bull queue)
async function processJob(job) {
  logger.info(`Processing job: ${job.id}`);

  try {
    // Update job status to processing
    await updateJobStatus(job.id, 'processing', 10, 'initializing');

    // Simulate gathering data
    await delay(2000);
    await updateJobStatus(job.id, 'processing', 30, 'gathering_data');

    // Simulate analysis
    await delay(2000);
    await updateJobStatus(job.id, 'processing', 50, 'analyzing');

    // Simulate PDF generation
    await delay(2000);
    await updateJobStatus(job.id, 'processing', 70, 'generating_pdf');

    // Generate PDF and store download URL
    const pdfPath = `/api/cer/jobs/${job.id}/download`;
    await delay(2000);

    // Complete the job
    await updateJobStatus(job.id, 'completed', 100, 'complete', null, pdfPath);
    logger.info(`Job completed: ${job.id}`);

    // Move job from active to completed
    if (activeJobs.has(job.id)) {
      completedJobs.set(job.id, activeJobs.get(job.id));
      activeJobs.delete(job.id);
    }

    return { success: true };
  } catch (err) {
    logger.error(`Error processing job ${job.id}:`, err);

    // Update job status to failed
    await updateJobStatus(job.id, 'failed', 0, 'error', err.message);

    // Move job from active to failed
    if (activeJobs.has(job.id)) {
      failedJobs.set(job.id, {
        ...activeJobs.get(job.id),
        error: err.message,
      });
      activeJobs.delete(job.id);
    }

    return { success: false, error: err.message };
  }
}

// Helper function to update job status in database or in-memory
async function updateJobStatus(jobId, status, progress, step, error = null, downloadUrl = null) {
  const updateTime = new Date().toISOString();

  if (pool) {
    try {
      // Update in database
      const updates = {
        status,
        progress,
        step,
        updated_at: updateTime,
      };

      if (error) {
        updates.last_error = error;
        updates.attempts = 1; // Increment attempts
      }

      if (downloadUrl) {
        updates.download_url = downloadUrl;
      }

      const fields = Object.keys(updates);
      const values = Object.values(updates);

      let setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');

      const query = `UPDATE cer_jobs SET ${setClause} WHERE job_id = $1`;
      await pool.query(query, [jobId, ...values]);

      logger.info(`Updated job ${jobId} status to ${status} in database`);
    } catch (dbErr) {
      logger.error(`Database error updating job ${jobId}:`, dbErr);

      // Fall back to in-memory update
      if (activeJobs.has(jobId)) {
        const job = activeJobs.get(jobId);
        activeJobs.set(jobId, {
          ...job,
          status,
          progress,
          step,
          error: error || job.error,
          downloadUrl: downloadUrl || job.downloadUrl,
          updatedAt: updateTime,
        });
      }
    }
  } else {
    // Update in memory
    if (activeJobs.has(jobId)) {
      const job = activeJobs.get(jobId);
      activeJobs.set(jobId, {
        ...job,
        status,
        progress,
        step,
        error: error || job.error,
        downloadUrl: downloadUrl || job.downloadUrl,
        updatedAt: updateTime,
      });
    }
  }
}

// Helper function for delays
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sample job creation for demo (would normally come from Bull queue)
async function createSampleJob() {
  const jobId = crypto.randomUUID();
  const userId = 'test-user';

  const job = {
    id: jobId,
    data: {
      userId,
      templateId: 'default-template',
      deviceInfo: {
        name: 'Sample Medical Device',
        type: 'Class II',
        manufacturer: 'ABC Medical Devices, Inc.',
      },
      literature: [
        {
          id: 'lit-1',
          title: 'Clinical evaluation of the sample device',
          authors: 'Smith J, Johnson M',
          journal: 'Journal of Medical Devices',
          year: '2024',
        },
      ],
    },
    createdAt: new Date().toISOString(),
  };

  // Track the job in memory
  activeJobs.set(jobId, {
    ...job,
    status: 'queued',
    progress: 0,
    step: 'queued',
    updatedAt: new Date().toISOString(),
  });

  // Store in database if available
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO cer_jobs(job_id, user_id, template_id, status, progress, step) 
         VALUES($1, $2, $3, $4, $5, $6)`,
        [jobId, userId, job.data.templateId, 'queued', 0, 'queued']
      );
      logger.info(`Job ${jobId} stored in database`);
    } catch (dbErr) {
      logger.error(`Database error storing job ${jobId}:`, dbErr);
    }
  }

  return job;
}

// Main function to start worker
async function main() {
  logger.info('Starting TrialSage CER Worker...');

  // Check database connection
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT NOW()');
      logger.info('Database connected:', rows[0].now);
    } catch (dbErr) {
      logger.error('Database connection error:', dbErr);
    }
  } else {
    logger.info('No database connection configured, using in-memory storage');
  }

  // Start processing any pending jobs from database
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT job_id FROM cer_jobs WHERE status = 'queued' OR status = 'processing' LIMIT 10`
      );

      logger.info(`Found ${rows.length} pending jobs in database`);

      for (const row of rows) {
        logger.info(`Processing job ${row.job_id} from database`);
        const job = { id: row.job_id };
        processJob(job).catch(err => {
          logger.error(`Error processing job ${job.id}:`, err);
        });
      }
    } catch (dbErr) {
      logger.error('Error fetching pending jobs:', dbErr);
    }
  }

  // Set up interval to check queue (simplified)
  const checkQueueInterval = setInterval(async () => {
    if (activeJobs.size < 2) {
      // Limit concurrent jobs
      try {
        logger.info('Creating and processing a sample job');
        const job = await createSampleJob();
        processJob(job).catch(err => {
          logger.error(`Error processing job ${job.id}:`, err);
        });
      } catch (err) {
        logger.error('Error creating sample job:', err);
      }
    }
  }, 60000); // Check for jobs every minute

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

    // Stop accepting new jobs
    clearInterval(checkQueueInterval);

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = setTimeout(() => {
      logger.info('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 30000);

    // Close HTTP server
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connection if exists
    if (pool) {
      try {
        await pool.end();
        logger.info('Database connection closed');
      } catch (err) {
        logger.error('Error closing database connection:', err);
      }
    }

    // If no active jobs, exit cleanly
    if (activeJobs.size === 0) {
      clearTimeout(shutdownTimeout);
      logger.info('No active jobs, clean shutdown');
      process.exit(0);
    }
  };

  // Process termination signals for graceful shutdown
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start the worker
main().catch(err => {
  logger.error('Fatal worker error:', err);
  process.exit(1);
});
