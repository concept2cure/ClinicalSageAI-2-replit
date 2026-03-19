/**
 * Obligations & Commitments Ledger API Routes
 *
 * Comprehensive AI-powered agency commitment management system per STEP 7 specification
 */

import { Router } from 'express';
import { getPool } from '../../db';
import { ai } from '../../lib/unified-ai-client';

// Database connection
const pool = getPool();

const router = Router();
// Helper: Insert obligation audit event
const logObligationEvent = async (
  oblId: string,
  event: string,
  byUser: string = 'system',
  payload: any = {}
) => {
  const client = await pool.connect();
  try {
    await client.query(
      `
      INSERT INTO reg_obligation_events (obl_id, event, by_user, payload_json)
      VALUES ($1, $2, $3, $4)
    `,
      [oblId, event, byUser, JSON.stringify(payload)]
    );
  } finally {
    client.release();
  }
};

// Helper: AI Extraction Service for Obligations from Documents
const extractObligationsFromText = async (text: string, context: any = {}) => {
  try {
    const prompt = `
You are an expert regulatory affairs specialist. Extract regulatory obligations, commitments, and requirements from the following document text.

Look for:
- Agency requests ("provide data on...", "submit within...")
- Approval conditions ("maintain records...", "report annually...")
- Post-market requirements ("conduct studies...", "monitor safety...")
- Manufacturing commitments ("validate process...", "maintain specifications...")
- Quality agreements ("test every batch...", "retain samples...")

For each obligation found, extract:
- Title (clear, actionable description)
- Due date (if specified)
- Severity (CRITICAL, MAJOR, MINOR)
- Source context (which document/section)
- Recommended recurrence (if ongoing)

Document text:
${text}

Respond with JSON: {"obligations": [{"title": "...", "severity": "...", "dueDate": null, "recurrence": {...}, "context": "..."}]}
`;

    const aiResult = await ai.chat({
      model: 'gpt-4o', // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      messages: [
        {
          role: 'system',
          content: 'You are a regulatory affairs expert specializing in obligation extraction.',
        },
        { role: 'user', content: prompt },
      ], { jsonMode: true, temperature: 0.3, callerModule: 'obligations/extractObligationsFromText' });

    const result = JSON.parse(aiResult.content || '{}');
    return result.obligations || [];
  } catch (error) {
    console.error('AI extraction failed:', error);
    return [];
  }
};

// Helper: Recurrence calculation
const calculateNextDueDate = (recurrence: any, baseDate: Date = new Date()): Date | null => {
  if (!recurrence.freq) return null;

  const next = new Date(baseDate);
  const interval = recurrence.interval || 1;

  switch (recurrence.freq) {
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + interval);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3 * interval);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + interval);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * interval);
      break;
    default:
      return null;
  }

  // Check if until date is reached
  if (recurrence.until && next > new Date(recurrence.until)) {
    return null;
  }

  return next;
};

// GET /obligations - List obligations for a submission with comprehensive filtering
router.get('/:subId/obligations', async (req, res) => {
  try {
    const { subId } = req.params;
    const { status, region, severity, owner, dueState, priority } = req.query;

    let query = `
      SELECT o.*, 
        CASE
          WHEN o.status IN ('COMPLETED','DEFERRED','CANCELLED') THEN 'NA'
          WHEN o.due_date IS NULL THEN 'NO_DATE'
          WHEN o.due_date < CURRENT_DATE THEN 'OVERDUE'
          WHEN o.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
          ELSE 'OPEN'
        END as due_state,
        (SELECT COUNT(*) FROM reg_obligation_events e WHERE e.obl_id = o.obl_id) as event_count
      FROM reg_obligations o
      WHERE o.sub_id = $1
    `;

    const params: any[] = [subId];
    let paramIndex = 2;

    if (status) {
      query += ` AND o.status = $${paramIndex++}`;
      params.push(status);
    }

    if (region) {
      query += ` AND o.region = $${paramIndex++}`;
      params.push(region);
    }

    if (severity) {
      query += ` AND o.severity = $${paramIndex++}`;
      params.push(severity);
    }

    if (priority) {
      query += ` AND o.priority = $${paramIndex++}`;
      params.push(priority);
    }

    if (owner) {
      query += ` AND o.owner_user_id = $${paramIndex++}`;
      params.push(owner);
    }

    if (dueState) {
      // Apply due state filter in HAVING clause after due_state is calculated
      query = `SELECT * FROM (${query}) filtered WHERE due_state = $${paramIndex++}`;
      params.push(dueState);
    }

    query += ' ORDER BY due_date ASC NULLS LAST, created_at DESC';

    const client = await pool.connect();
    let result;
    try {
      result = await client.query(query, params);
    } finally {
      client.release();
    }
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      summary: {
        total: result.rows.length,
        overdue: result.rows.filter((r: any) => r.due_state === 'OVERDUE').length,
        dueSoon: result.rows.filter((r: any) => r.due_state === 'DUE_SOON').length,
        open: result.rows.filter((r: any) => r.due_state === 'OPEN').length,
        completed: result.rows.filter((r: any) => r.status === 'COMPLETED').length,
      },
    });
  } catch (error: any) {
    console.error('Error listing obligations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list obligations',
    });
  }
});

// POST /obligations - Create new obligation
router.post('/:subId/obligations', async (req, res) => {
  try {
    const { subId } = req.params;
    const {
      title,
      source,
      severity,
      status,
      dueDate,
      recurrence,
      ownerUserId,
      priority,
      evidence,
      links,
      note,
      createdBy,
      region,
      productId,
    } = req.body;

    const client = await pool.connect();
    let result;
    try {
      result = await client.query(
        `
        INSERT INTO reg_obligations (
          sub_id, product_id, region, title, source, severity, status, due_date,
          recurrence, owner_user_id, priority, evidence, links, note, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `,
        [
          subId,
          productId || 'default',
          region,
          title,
          source || 'AGENCY',
          severity || 'MAJOR',
          status || 'OPEN',
          dueDate,
          JSON.stringify(recurrence || {}),
          ownerUserId,
          priority || 'High',
          JSON.stringify(evidence || []),
          JSON.stringify(links || []),
          note,
          createdBy,
        ]
      );
    } finally {
      client.release();
    }

    const obligation = result.rows[0];

    // Log creation event
    await logObligationEvent(obligation.obl_id, 'CREATED', createdBy, {
      source: source || 'MANUAL',
      originalData: req.body,
    });

    res.status(201).json({
      success: true,
      data: obligation,
      message: 'Obligation created successfully',
    });
  } catch (error: any) {
    console.error('Error creating obligation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create obligation',
    });
  }
});

// POST /obligations/ingest - AI-powered obligation extraction from text/documents
router.post('/:subId/obligations/ingest', async (req, res) => {
  try {
    const { subId } = req.params;
    const { text, source, documentId, extractedBy, productId, region } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text content is required for extraction',
      });
    }

    // Extract obligations using AI
    const extractedObligations = await extractObligationsFromText(text, {
      subId,
      source: source || 'DOCUMENT',
      documentId,
      productId,
      region,
    });

    const createdObligations = [];

    // Insert each extracted obligation
    for (const extracted of extractedObligations) {
      const result = await pool.query(
        `
        INSERT INTO reg_obligations (
          sub_id, product_id, region, title, source, severity, status, due_date,
          recurrence, priority, evidence, links, note, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `,
        [
          subId,
          productId || 'default',
          region || extracted.region,
          extracted.title,
          'AI_EXTRACT',
          extracted.severity || 'MAJOR',
          'OPEN',
          extracted.dueDate || null,
          JSON.stringify(extracted.recurrence || {}),
          extracted.priority || 'High',
          JSON.stringify([{ type: 'DOCUMENT', id: documentId, source: source }]),
          JSON.stringify(extracted.links || []),
          extracted.context || `Extracted from: ${source}`,
          extractedBy || 'AI_SYSTEM',
        ]
      );

      const obligation = result.rows[0];

      // Log AI extraction event
      await logObligationEvent(obligation.obl_id, 'AI_EXTRACT', extractedBy || 'AI_SYSTEM', {
        source: 'AI_EXTRACTION',
        documentId,
        extractionSource: source,
        confidence: extracted.confidence || 0.8,
      });

      createdObligations.push(obligation);
    }

    res.status(201).json({
      success: true,
      data: createdObligations,
      message: `Extracted ${createdObligations.length} obligations from document`,
      extractionSummary: {
        totalExtracted: createdObligations.length,
        source: source || 'DOCUMENT',
        documentId,
      },
    });
  } catch (error: any) {
    console.error('Error extracting obligations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract obligations from document',
    });
  }
});

// PUT /obligations/:id - Update obligation
router.put('/:subId/obligations/:oblId', async (req, res) => {
  try {
    const { oblId } = req.params;
    const updates = req.body;
    const { updatedBy } = updates;

    // Build dynamic update query
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'updatedBy' && value !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
      });
    }

    setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(oblId);

    const result = await pool.query(
      `
      UPDATE reg_obligations 
      SET ${setClause.join(', ')}
      WHERE obl_id = $${paramIndex}
      RETURNING *
    `,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Obligation not found',
      });
    }

    const obligation = result.rows[0];

    // Log update event
    await logObligationEvent(oblId, 'UPDATED', updatedBy || 'system', {
      updatedFields: Object.keys(updates).filter(k => k !== 'updatedBy'),
      previousValues: updates,
    });

    res.json({
      success: true,
      data: obligation,
      message: 'Obligation updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating obligation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update obligation',
    });
  }
});

// POST /obligations/:id/assign - Assign obligation to user
router.post('/:subId/obligations/:oblId/assign', async (req, res) => {
  try {
    const { oblId } = req.params;
    const { ownerUserId, assignedBy, note } = req.body;

    const result = await pool.query(
      `
      UPDATE reg_obligations 
      SET owner_user_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE obl_id = $2
      RETURNING *
    `,
      [ownerUserId, oblId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Obligation not found',
      });
    }

    const obligation = result.rows[0];

    // Log assignment event
    await logObligationEvent(oblId, 'ASSIGNED', assignedBy || 'system', {
      ownerUserId,
      note,
    });

    res.json({
      success: true,
      data: obligation,
      message: 'Obligation assigned successfully',
    });
  } catch (error: any) {
    console.error('Error assigning obligation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to assign obligation',
    });
  }
});

// POST /obligations/:id/snooze - Snooze obligation (extend due date)
router.post('/:subId/obligations/:oblId/snooze', async (req, res) => {
  try {
    const { oblId } = req.params;
    const { newDueDate, reason, snoozedBy } = req.body;

    const result = await pool.query(
      `
      UPDATE reg_obligations 
      SET due_date = $1, updated_at = CURRENT_TIMESTAMP
      WHERE obl_id = $2
      RETURNING *
    `,
      [newDueDate, oblId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Obligation not found',
      });
    }

    const obligation = result.rows[0];

    // Log snooze event
    await logObligationEvent(oblId, 'SNOOZED', snoozedBy || 'system', {
      newDueDate,
      reason,
    });

    res.json({
      success: true,
      data: obligation,
      message: 'Obligation snoozed successfully',
    });
  } catch (error: any) {
    console.error('Error snoozing obligation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to snooze obligation',
    });
  }
});

// POST /obligations/:id/complete - Mark obligation as completed
router.post('/:subId/obligations/:oblId/complete', async (req, res) => {
  try {
    const { oblId } = req.params;
    const { completionNote, completedBy } = req.body;

    const result = await pool.query(
      `
      UPDATE reg_obligations 
      SET status = 'COMPLETED', closed_at = CURRENT_TIMESTAMP, note = COALESCE($1, note), updated_at = CURRENT_TIMESTAMP
      WHERE obl_id = $2
      RETURNING *
    `,
      [completionNote, oblId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Obligation not found',
      });
    }

    const obligation = result.rows[0];

    // Log completion event
    await logObligationEvent(oblId, 'COMPLETED', completedBy || 'system', {
      completionNote,
    });

    // Handle recurrence - create next instance if needed
    if (obligation.recurrence && obligation.recurrence.freq) {
      const nextDueDate = calculateNextDueDate(
        obligation.recurrence,
        new Date(obligation.due_date)
      );

      if (nextDueDate) {
        const nextResult = await pool.query(
          `
          INSERT INTO reg_obligations (
            sub_id, product_id, region, title, source, severity, status, due_date,
            recurrence, owner_user_id, priority, evidence, links, note, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `,
          [
            obligation.sub_id,
            obligation.product_id,
            obligation.region,
            obligation.title,
            obligation.source,
            obligation.severity,
            'OPEN',
            nextDueDate,
            obligation.recurrence,
            obligation.owner_user_id,
            obligation.priority,
            obligation.evidence,
            obligation.links,
            `Recurring obligation (previous: ${oblId})`,
            'RECURRENCE_SYSTEM',
          ]
        );

        const nextObligation = nextResult.rows[0];

        // Log recurrence creation
        await logObligationEvent(nextObligation.obl_id, 'CREATED', 'RECURRENCE_SYSTEM', {
          source: 'RECURRENCE',
          previousObligationId: oblId,
          recurrencePattern: obligation.recurrence,
        });
      }
    }

    res.json({
      success: true,
      data: obligation,
      message: 'Obligation completed successfully',
    });
  } catch (error: any) {
    console.error('Error completing obligation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete obligation',
    });
  }
});

// GET /obligations/:id/events - Get obligation event history
router.get('/:subId/obligations/:oblId/events', async (req, res) => {
  try {
    const { oblId } = req.params;

    const result = await pool.query(
      `
      SELECT * FROM reg_obligation_events 
      WHERE obl_id = $1 
      ORDER BY created_at DESC
    `,
      [oblId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching obligation events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch obligation events',
    });
  }
});

// GET /dashboard/stats - Dashboard statistics for RPI integration
router.get('/dashboard/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'OPEN') as open,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status NOT IN ('COMPLETED','CANCELLED')) as overdue,
        COUNT(*) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' AND status NOT IN ('COMPLETED','CANCELLED')) as due_soon,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical,
        COUNT(*) FILTER (WHERE severity = 'MAJOR') as major,
        COUNT(*) FILTER (WHERE severity = 'MINOR') as minor
      FROM reg_obligations
    `);

    const regionStats = await pool.query(`
      SELECT region, COUNT(*) as count
      FROM reg_obligations 
      WHERE region IS NOT NULL
      GROUP BY region
      ORDER BY count DESC
    `);

    const sourceStats = await pool.query(`
      SELECT source, COUNT(*) as count
      FROM reg_obligations 
      GROUP BY source
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        summary: stats.rows[0],
        byRegion: regionStats.rows,
        bySource: sourceStats.rows,
      },
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats',
    });
  }
});

export { router as obligationsRouter };
