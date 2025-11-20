/**
 * CER Approval Routes
 *
 * These routes handle approval workflow for Clinical Evaluation Reports:
 * - Job status updates
 * - Batch review operations
 * - Approval history tracking
 */

import express from 'express';
import { db } from '../db';

const router = express.Router();

// Get jobs for approvals with status filtering
router.get('/jobs', async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Build query based on status filter
    let query = `
      SELECT j.id as job_id, j.status, j.created_at, j.updated_at, 
             m.device_name, m.lot_number
      FROM cer_jobs j
      LEFT JOIN cer_metadata m ON j.metadata_id = m.id
    `;

    const params = [];

    if (status) {
      query += ` WHERE j.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY j.updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    // Get jobs
    const jobs = await db.query(query, params);

    // Get total count for pagination
    const countResult = await db.query(
      `
      SELECT COUNT(*) as total FROM cer_jobs ${status ? 'WHERE status = $1' : ''}
    `,
      status ? [status] : []
    );

    res.json({
      data: jobs,
      pagination: {
        total: parseInt(countResult[0].total),
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (err) {
    console.error('Failed to get jobs for approval:', err);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

// Batch review jobs (approve/reject)
router.post('/jobs/batch-review', async (req, res) => {
  try {
    const { ids, decision } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No job IDs provided' });
    }

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    // Update all jobs in the batch
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');

    const result = await db.query(
      `
      UPDATE cer_jobs
      SET status = $1, updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING id
    `,
      [decision, ...ids]
    );

    // Add entries to approval history
    const userId = req.user?.id || 'system'; // Use authenticated user ID if available
    const reviewEntries = ids.map(id => [id, userId, decision, new Date()]);

    await db.query(
      `
      INSERT INTO cer_approval_history (job_id, user_id, decision, review_date)
      VALUES ${reviewEntries.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(',')}
    `,
      reviewEntries.flat()
    );

    res.json({
      message: `Successfully ${decision} ${result.length} jobs`,
      jobsUpdated: result.map(r => r.id),
    });
  } catch (err) {
    console.error('Failed to process batch review:', err);
    res.status(500).json({ error: 'Failed to process batch review' });
  }
});

// Get approval history for a job
router.get('/jobs/:id/history', async (req, res) => {
  try {
    const { id } = req.params;

    const history = await db.query(
      `
      SELECT h.decision, h.review_date, h.comments,
             u.username as reviewer_name
      FROM cer_approval_history h
      LEFT JOIN users u ON h.user_id = u.id
      WHERE h.job_id = $1
      ORDER BY h.review_date DESC
    `,
      [id]
    );

    res.json({ history });
  } catch (err) {
    console.error('Failed to get approval history:', err);
    res.status(500).json({ error: 'Failed to get approval history' });
  }
});

// Review a single job
router.post('/jobs/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, comments } = req.body;

    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision' });
    }

    // Update job status
    await db.query(
      `
      UPDATE cer_jobs
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `,
      [decision, id]
    );

    // Add entry to approval history
    const userId = req.user?.id || 'system';

    await db.query(
      `
      INSERT INTO cer_approval_history (job_id, user_id, decision, review_date, comments)
      VALUES ($1, $2, $3, NOW(), $4)
    `,
      [id, userId, decision, comments || null]
    );

    res.json({
      message: `Job ${id} ${decision} successfully`,
      jobId: id,
    });
  } catch (err) {
    console.error('Failed to review job:', err);
    res.status(500).json({ error: 'Failed to review job' });
  }
});

export default router;
