/**
 * CER Routes - API endpoints for CER generation and management
 * Security features:
 * - JWT authentication via middleware
 * - Input validation with Joi
 * - Signed URLs for secure PDF downloads
 */
const express = require('express');
const router = express.Router();
const Queue = require('bull');
const { Pool } = require('pg');
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');

// Initialize database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

// Initialize S3 (for signed URL storage)
const s3 = process.env.AWS_ACCESS_KEY_ID
  ? new AWS.S3({
      region: process.env.AWS_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    })
  : null;

// Bull queue
const cerQueue = new Queue('cer-generation', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Validation schema for generate-full payload
const generateSchema = Joi.object({
  deviceInfo: Joi.object({
    name: Joi.string().allow('').max(200).required(),
    type: Joi.string().allow('').max(100).required(),
    manufacturer: Joi.string().allow('').max(200).required(),
  }).required(),
  literature: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        title: Joi.string().required(),
        authors: Joi.string().allow(''),
        journal: Joi.string().allow(''),
        year: Joi.string().allow(''),
        abstract: Joi.string().allow(''),
      })
    )
    .default([]),
  fdaData: Joi.array()
    .items(
      Joi.object({
        event_id: Joi.string(),
        event_type: Joi.string(),
        severity: Joi.string(),
        outcome: Joi.string(),
        frequency: Joi.string(),
      })
    )
    .default([]),
  templateId: Joi.string().allow('').optional(),
});

// Middleware: authenticate JWT
router.use((req, res, next) => {
  // Skip authentication in development mode if configured
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    req.user = { id: 'dev-user-id', role: 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid Authorization format' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
});

// POST /api/cer/generate-full
router.post('/generate-full', async (req, res) => {
  // Validate input
  const { error, value } = generateSchema.validate(req.body);
  if (error) {
    console.error('Validation error:', error.details);
    return res.status(400).json({
      error: 'Invalid input',
      details: error.details[0].message,
    });
  }

  try {
    const userId = req.user.id;
    let { templateId, deviceInfo, literature, fdaData } = value;

    // If no template is specified, get the default template
    if (!templateId) {
      try {
        const defaultTpl = await pool.query(
          `SELECT id FROM templates WHERE is_default = TRUE LIMIT 1`
        );
        if (defaultTpl.rows.length > 0) {
          templateId = defaultTpl.rows[0].id;
        } else {
          return res.status(404).json({ error: 'No default template found' });
        }
      } catch (dbErr) {
        console.error('Database error finding default template:', dbErr);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    // Add job to queue
    const job = await cerQueue.add({
      userId,
      templateId,
      deviceInfo,
      literature,
      fdaData,
    });

    // Persist job in Postgres
    await pool.query(`INSERT INTO cer_jobs(job_id, user_id, template_id) VALUES($1, $2, $3)`, [
      job.id.toString(),
      userId,
      templateId,
    ]);

    return res.status(201).json({
      jobId: job.id,
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

    // Get job status from database
    const { rows } = await pool.query(
      `SELECT status, progress, step, attempts, last_error, created_at, updated_at,
        CASE WHEN status = 'completed' THEN true ELSE false END as is_complete,
        download_url, page_count, word_count
      FROM cer_jobs 
      WHERE job_id = $1 AND (user_id = $2 OR $3 = true)`,
      [jobId, userId, req.user.role === 'admin']
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(rows[0]);
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

    // First check if the job exists and is completed
    const { rows } = await pool.query(
      `SELECT status, download_url FROM cer_jobs 
      WHERE job_id = $1 AND (user_id = $2 OR $3 = true)`,
      [jobId, userId, req.user.role === 'admin']
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (rows[0].status !== 'completed') {
      return res.status(400).json({
        error: 'Job not completed',
        status: rows[0].status,
      });
    }

    // If S3 is configured, generate a signed URL
    if (s3 && process.env.CER_BUCKET) {
      const pdfKey = `cer-job-${jobId}.pdf`;
      const params = {
        Bucket: process.env.CER_BUCKET,
        Key: pdfKey,
        Expires: 60, // URL valid for 60 seconds
      };

      try {
        const url = s3.getSignedUrl('getObject', params);
        return res.json({ downloadUrl: url });
      } catch (s3Err) {
        console.error('Error generating signed URL:', s3Err);
        // Fall back to the stored URL if signing fails
        return res.json({ downloadUrl: rows[0].download_url });
      }
    } else {
      // If S3 is not configured, return the stored URL
      return res.json({ downloadUrl: rows[0].download_url });
    }
  } catch (err) {
    console.error('Error generating download link:', err);
    return res.status(500).json({ error: 'Could not generate download link' });
  }
});

// GET /api/cer/templates
router.get('/templates', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, is_default FROM templates ORDER BY name`
    );
    return res.json(rows);
  } catch (err) {
    console.error('Error fetching templates:', err);
    return res.status(500).json({ error: 'Could not fetch templates' });
  }
});

// GET /api/cer/jobs (list jobs with pagination)
router.get('/jobs', async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Count total jobs for pagination
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM cer_jobs WHERE user_id = $1 OR $2 = true`,
      [userId, req.user.role === 'admin']
    );

    const totalJobs = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalJobs / limit);

    // Get paginated jobs
    const { rows } = await pool.query(
      `SELECT job_id, status, progress, step, attempts, created_at, updated_at,
        template_id, download_url, page_count, word_count
      FROM cer_jobs 
      WHERE user_id = $1 OR $2 = true
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
      [userId, req.user.role === 'admin', limit, offset]
    );

    return res.json({
      jobs: rows,
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

module.exports = router;
