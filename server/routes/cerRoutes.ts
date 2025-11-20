import express, { Request, Response, NextFunction } from 'express';
import { Queue } from 'bull';
import { getPool } from '../db/pool';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import AWS from 'aws-sdk';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; [key: string]: any };
    }
  }
}

const router = express.Router();

// Initialize S3 client
const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
});

// Validation schema for request payloads
const generateSchema = Joi.object({
  templateId: Joi.string().uuid().optional(),
});

// Configure Bull queue with retry/backoff
const cerQueue = new Queue('cer-generation', {
  redis: { host: process.env.REDIS_HOST!, port: Number(process.env.REDIS_PORT) },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// JWT authentication middleware
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authenticate);

// POST /api/cer/generate-full
router.post('/generate-full', async (req: Request, res: Response) => {
  const { error, value } = generateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  try {
    const userId = req.user!.id;
    let { templateId } = value as { templateId?: string };

    if (!templateId) {
      const result = await pool.query('SELECT id FROM templates WHERE is_default = TRUE LIMIT 1');
      templateId = result.rows[0].id;
    }

    const job = await cerQueue.add({ userId, templateId });
    await pool.query('INSERT INTO cer_jobs(job_id, user_id, template_id) VALUES($1, $2, $3)', [
      job.id.toString(),
      userId,
      templateId,
    ]);

    return res.status(202).json({ jobId: job.id });
  } catch (err) {
    console.error('Error enqueuing CER job:', err);
    return res.status(500).json({ error: 'Could not start report generation' });
  }
});

// GET /api/cer/jobs/:id/status
router.get('/jobs/:id/status', async (req: Request, res: Response) => {
  const jobId = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT status, progress, step, attempts, last_error FROM cer_jobs WHERE job_id = $1`,
      [jobId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Job not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching job status:', err);
    return res.status(500).json({ error: 'Could not fetch job status' });
  }
});

// GET /api/cer/jobs/:id/result
router.get('/jobs/:id/result', async (req: Request, res: Response) => {
  const jobId = req.params.id;
  const key = `cer-job-${jobId}.pdf`;
  try {
    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.CER_BUCKET!,
      Key: key,
      Expires: 60, // seconds
    });
    return res.json({ downloadUrl: url });
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return res.status(500).json({ error: 'Could not generate download link' });
  }
});

export default router;
