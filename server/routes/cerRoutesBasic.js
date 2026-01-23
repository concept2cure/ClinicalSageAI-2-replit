/**
 * CER Routes - Simplified version without external dependencies
 * Basic API endpoints for CER generation and management
 */
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');

// Initialize database connection
const pool = process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL })
  : null;

// In-memory job storage if no database is available
const jobsInMemory = new Map();

// Middleware for basic authentication (simplified)
const authenticate = (req, res, next) => {
  // Skip authentication in development mode
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    req.user = { id: 'dev-user-id', role: 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    // Extract token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Invalid Authorization format' });
    }

    // Simple validation - in production we'd use JWT verification
    if (token === 'test-token') {
      req.user = { id: 'test-user', role: 'user' };
      next();
    } else if (token === 'admin-token') {
      req.user = { id: 'admin-user', role: 'admin' };
      next();
    } else {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (err) {
    console.error('Authentication error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Middleware to validate input
const validateInput = schema => (req, res, next) => {
  // Simple validation - in production we'd use a validation library
  const { deviceInfo } = req.body;

  if (!deviceInfo) {
    return res.status(400).json({ error: 'deviceInfo is required' });
  }

  if (typeof deviceInfo !== 'object') {
    return res.status(400).json({ error: 'deviceInfo must be an object' });
  }

  if (!deviceInfo.name || typeof deviceInfo.name !== 'string') {
    return res.status(400).json({ error: 'deviceInfo.name is required and must be a string' });
  }

  if (!deviceInfo.type || typeof deviceInfo.type !== 'string') {
    return res.status(400).json({ error: 'deviceInfo.type is required and must be a string' });
  }

  if (!deviceInfo.manufacturer || typeof deviceInfo.manufacturer !== 'string') {
    return res
      .status(400)
      .json({ error: 'deviceInfo.manufacturer is required and must be a string' });
  }

  // Validation passed
  next();
};

// Apply authentication middleware to all routes
router.use(authenticate);

// POST /api/cer/generate-full
router.post('/generate-full', validateInput(), async (req, res) => {
  try {
    const userId = req.user.id;
    const { templateId, deviceInfo, literature = [], fdaData = [] } = req.body;

    // Generate a unique job ID
    const jobId = crypto.randomUUID();

    // Create job data structure
    const jobData = {
      id: jobId,
      userId,
      templateId,
      deviceInfo,
      literature,
      fdaData,
      status: 'queued',
      progress: 0,
      step: 'initializing',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store job in database or in-memory
    if (pool) {
      try {
        await pool.query(
          `INSERT INTO cer_jobs(job_id, user_id, template_id, status, progress, step) 
           VALUES($1, $2, $3, $4, $5, $6)`,
          [jobId, userId, templateId || null, 'queued', 0, 'initializing']
        );
      } catch (dbErr) {
        console.error('Database error storing job:', dbErr);
        // Fall back to in-memory storage if database fails
        jobsInMemory.set(jobId, jobData);
      }
    } else {
      // In-memory storage if no database
      jobsInMemory.set(jobId, jobData);
    }

    // Simulate job processing in the background
    simulateJobProcessing(jobId, userId);

    return res.status(201).json({
      jobId,
      message: 'CER generation started successfully',
    });
  } catch (err) {
    console.error('Error starting CER generation:', err);
    return res.status(500).json({ error: 'Could not start report generation' });
  }
});

// GET /api/cer/jobs/:id/status
router.get('/jobs/:id/status', async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    // Get job status from database or in-memory
    let jobData;

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT job_id, status, progress, step, created_at, updated_at,
            download_url, page_count, word_count
          FROM cer_jobs 
          WHERE job_id = $1 AND (user_id = $2 OR $3 = true)`,
          [jobId, userId, req.user.role === 'admin']
        );

        if (rows.length) {
          jobData = rows[0];
        }
      } catch (dbErr) {
        console.error('Database error fetching job:', dbErr);
        // Fall back to in-memory if database fails
        if (jobsInMemory.has(jobId)) {
          jobData = jobsInMemory.get(jobId);
        }
      }
    } else {
      // In-memory lookup if no database
      if (jobsInMemory.has(jobId)) {
        jobData = jobsInMemory.get(jobId);
      }
    }

    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(jobData);
  } catch (err) {
    console.error('Error fetching job status:', err);
    return res.status(500).json({ error: 'Could not fetch job status' });
  }
});

// GET /api/cer/jobs/:id/result
router.get('/jobs/:id/result', async (req, res) => {
  try {
    const jobId = req.params.id;
    const userId = req.user.id;

    // Get job data from database or in-memory
    let jobData;

    if (pool) {
      try {
        const { rows } = await pool.query(
          `SELECT status, download_url FROM cer_jobs 
          WHERE job_id = $1 AND (user_id = $2 OR $3 = true)`,
          [jobId, userId, req.user.role === 'admin']
        );

        if (rows.length) {
          jobData = rows[0];
        }
      } catch (dbErr) {
        console.error('Database error fetching job:', dbErr);
        // Fall back to in-memory if database fails
        if (jobsInMemory.has(jobId)) {
          jobData = jobsInMemory.get(jobId);
        }
      }
    } else {
      // In-memory lookup if no database
      if (jobsInMemory.has(jobId)) {
        jobData = jobsInMemory.get(jobId);
      }
    }

    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (jobData.status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: jobData.status,
      });
    }

    // Return download URL
    return res.json({
      downloadUrl: jobData.download_url || `/api/cer/jobs/${jobId}/download`,
    });
  } catch (err) {
    console.error('Error generating download link:', err);
    return res.status(500).json({ error: 'Could not generate download link' });
  }
});

// GET /api/cer/jobs (list jobs with pagination)
router.get('/jobs', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get jobs from database or in-memory
    let jobs = [];
    let totalJobs = 0;

    if (pool) {
      try {
        // Count total jobs
        const countResult = await pool.query(
          `SELECT COUNT(*) FROM cer_jobs WHERE user_id = $1 OR $2 = true`,
          [userId, req.user.role === 'admin']
        );

        totalJobs = parseInt(countResult.rows[0].count);

        // Get paginated jobs
        const { rows } = await pool.query(
          `SELECT job_id, status, progress, step, created_at, updated_at,
            template_id, download_url, page_count, word_count
          FROM cer_jobs 
          WHERE user_id = $1 OR $2 = true
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4`,
          [userId, req.user.role === 'admin', limit, offset]
        );

        jobs = rows;
      } catch (dbErr) {
        console.error('Database error fetching jobs:', dbErr);

        // Fall back to in-memory if database fails
        if (jobsInMemory.size) {
          jobs = Array.from(jobsInMemory.values())
            .filter(job => job.userId === userId || req.user.role === 'admin')
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(offset, offset + limit);

          totalJobs = Array.from(jobsInMemory.values()).filter(
            job => job.userId === userId || req.user.role === 'admin'
          ).length;
        }
      }
    } else {
      // In-memory lookup if no database
      if (jobsInMemory.size) {
        jobs = Array.from(jobsInMemory.values())
          .filter(job => job.userId === userId || req.user.role === 'admin')
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(offset, offset + limit);

        totalJobs = Array.from(jobsInMemory.values()).filter(
          job => job.userId === userId || req.user.role === 'admin'
        ).length;
      }
    }

    const totalPages = Math.ceil(totalJobs / limit);

    return res.json({
      jobs,
      pagination: {
        page,
        limit,
        totalJobs,
        totalPages,
      },
    });
  } catch (err) {
    console.error('Error fetching jobs:', err);
    return res.status(500).json({ error: 'Could not fetch jobs' });
  }
});

// Function to simulate job processing
function simulateJobProcessing(jobId, userId) {
  console.log(`Starting simulated job processing for job ${jobId}`);

  // Update job status to 'processing'
  updateJobStatus(jobId, {
    status: 'processing',
    progress: 10,
    step: 'gathering_data',
  });

  // Simulate processing steps
  setTimeout(() => {
    updateJobStatus(jobId, {
      progress: 30,
      step: 'analyzing_literature',
    });

    setTimeout(() => {
      updateJobStatus(jobId, {
        progress: 50,
        step: 'generating_text',
      });

      setTimeout(() => {
        updateJobStatus(jobId, {
          progress: 70,
          step: 'creating_pdf',
        });

        setTimeout(() => {
          updateJobStatus(jobId, {
            status: 'completed',
            progress: 100,
            step: 'complete',
            download_url: `/api/cer/jobs/${jobId}/download`,
            page_count: 25,
            word_count: 8750,
          });

          console.log(`Completed simulated job processing for job ${jobId}`);
        }, 3000);
      }, 3000);
    }, 2000);
  }, 2000);
}

// Helper function to update job status
async function updateJobStatus(jobId, updates) {
  if (pool) {
    try {
      const fields = Object.keys(updates);
      const values = Object.values(updates);

      let setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
      setClause += ', updated_at = NOW()';

      await pool.query(`UPDATE cer_jobs SET ${setClause} WHERE job_id = $1`, [jobId, ...values]);
    } catch (dbErr) {
      console.error('Database error updating job:', dbErr);

      // Fall back to in-memory update if database fails
      if (jobsInMemory.has(jobId)) {
        const job = jobsInMemory.get(jobId);
        jobsInMemory.set(jobId, {
          ...job,
          ...updates,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } else {
    // In-memory update if no database
    if (jobsInMemory.has(jobId)) {
      const job = jobsInMemory.get(jobId);
      jobsInMemory.set(jobId, {
        ...job,
        ...updates,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}

module.exports = router;
