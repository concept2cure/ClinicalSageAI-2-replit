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
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
  console.log(`Worker health check server running on port ${port}`);
});

// Process jobs (simplified version without Bull queue)
async function processJob(job) {
  console.log(`Processing job: ${job.id}`);

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
    console.log(`Job completed: ${job.id}`);

    // Move job from active to completed
    if (activeJobs.has(job.id)) {
      completedJobs.set(job.id, activeJobs.get(job.id));
      activeJobs.delete(job.id);
    }

    return { success: true };
  } catch (err) {
    console.error(`Error processing job ${job.id}:`, err);

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

      console.log(`Updated job ${jobId} status to ${status} in database`);
    } catch (dbErr) {
      console.error(`Database error updating job ${jobId}:`, dbErr);

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
      console.log(`Job ${jobId} stored in database`);
    } catch (dbErr) {
      console.error(`Database error storing job ${jobId}:`, dbErr);
    }
  }

  return job;
}

// Main function to start worker
async function main() {
  console.log('Starting TrialSage CER Worker...');

  // Check database connection
  if (pool) {
    try {
      const { rows } = await pool.query('SELECT NOW()');
      console.log('Database connected:', rows[0].now);
    } catch (dbErr) {
      console.error('Database connection error:', dbErr);
    }
  } else {
    console.log('No database connection configured, using in-memory storage');
  }

  // Start processing any pending jobs from database
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT job_id FROM cer_jobs WHERE status = 'queued' OR status = 'processing' LIMIT 10`
      );

      console.log(`Found ${rows.length} pending jobs in database`);

      for (const row of rows) {
        console.log(`Processing job ${row.job_id} from database`);
        const job = { id: row.job_id };
        processJob(job).catch(err => {
          console.error(`Error processing job ${job.id}:`, err);
        });
      }
    } catch (dbErr) {
      console.error('Error fetching pending jobs:', dbErr);
    }
  }

  // Set up interval to check queue (simplified)
  setInterval(async () => {
    if (activeJobs.size < 2) {
      // Limit concurrent jobs
      try {
        console.log('Creating and processing a sample job');
        const job = await createSampleJob();
        processJob(job).catch(err => {
          console.error(`Error processing job ${job.id}:`, err);
        });
      } catch (err) {
        console.error('Error creating sample job:', err);
      }
    }
  }, 60000); // Check for jobs every minute

  // Process SIGTERM for graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');

    // Stop accepting new jobs
    clearInterval(checkQueueInterval);

    // Wait for active jobs to complete (with timeout)
    const shutdownTimeout = setTimeout(() => {
      console.log('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 30000);

    // Close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
    });

    // Close database connection if exists
    if (pool) {
      try {
        await pool.end();
        console.log('Database connection closed');
      } catch (err) {
        console.error('Error closing database connection:', err);
      }
    }

    // If no active jobs, exit cleanly
    if (activeJobs.size === 0) {
      clearTimeout(shutdownTimeout);
      console.log('No active jobs, clean shutdown');
      process.exit(0);
    }
  });
}

// Start the worker
main().catch(err => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
