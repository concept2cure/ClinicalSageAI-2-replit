// server/routes/preIndRoutes.ts

import express from 'express';
import { db, pool } from '../db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

const router = express.Router({ mergeParams: true }); // Enable merging params from parent router (for :draftId)

// --- Authentication/Authorization Middleware ---
const authMiddleware = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // For development, we're assuming authentication is handled elsewhere
  // In a production environment, you would check session, JWT, etc.
  console.log(`Auth Check for Draft: ${req.params.draftId}`);

  // Placeholder for authentication check
  // if (!req.user) {
  //   return res.status(401).json({ success: false, message: 'Authentication required.' });
  // }

  // Placeholder for authorization check (draft ownership)
  // const userId = req.user.id;
  // const draftId = req.params.draftId;
  // Check if user owns draft...

  // For now, proceed with all requests
  next();
};

// --- Database Interaction Logic ---
const dbOps = {
  // Function to get Pre-IND data and milestones for a draft
  getPreIndData: async (draftId: string, userId?: number) => {
    try {
      // Run a raw SQL query to fetch pre-ind data
      // In production, you should use prepared statements and parameterization
      const preIndDataQuery = sql`
        SELECT id, draft_id, project_name, therapeutic_area, project_objective,
               target_pre_ind_meeting_date, pre_ind_meeting_objective,
               pre_ind_agenda_topics, pre_ind_attendees, fda_interaction_notes,
               created_at, updated_at
        FROM ind_pre_ind_data
        WHERE draft_id = ${draftId}
      `;

      const preIndResult = await db.execute(preIndDataQuery);

      if (!preIndResult.rows.length) {
        return null; // Not found
      }

      const preIndRecord = preIndResult.rows[0];

      // Fetch associated milestones
      const milestonesQuery = sql`
        SELECT id, title, due_date, status, description
        FROM ind_milestones
        WHERE pre_ind_data_id = ${preIndRecord.id}
        ORDER BY due_date ASC
      `;

      const milestones = await db.execute(milestonesQuery);

      // Format milestones for frontend
      const formattedMilestones = milestones.rows.map((ms: any) => ({
        id: ms.id,
        title: ms.title,
        dueDate: ms.due_date,
        status: ms.status,
        description: ms.description,
      }));

      // Combine data
      return {
        ...preIndRecord,
        milestones: formattedMilestones,
      };
    } catch (error) {
      console.error('Error fetching Pre-IND data:', error);
      throw error;
    }
  },

  // Function to save/update Pre-IND data and milestones
  savePreIndData: async (draftId: string, userId: number | undefined, data: any) => {
    // We'll use a client from the pool to enable transactions
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // 1. UPSERT ind_pre_ind_data - handle both insert and update cases
      const preIndDataUpsert = `
        INSERT INTO ind_pre_ind_data (
          draft_id, project_name, therapeutic_area, project_objective,
          target_pre_ind_meeting_date, pre_ind_meeting_objective,
          pre_ind_agenda_topics, pre_ind_attendees, fda_interaction_notes,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
        ON CONFLICT (draft_id) DO UPDATE SET
          project_name = EXCLUDED.project_name,
          therapeutic_area = EXCLUDED.therapeutic_area,
          project_objective = EXCLUDED.project_objective,
          target_pre_ind_meeting_date = EXCLUDED.target_pre_ind_meeting_date,
          pre_ind_meeting_objective = EXCLUDED.pre_ind_meeting_objective,
          pre_ind_agenda_topics = EXCLUDED.pre_ind_agenda_topics,
          pre_ind_attendees = EXCLUDED.pre_ind_attendees,
          fda_interaction_notes = EXCLUDED.fda_interaction_notes,
          updated_at = NOW()
        RETURNING id
      `;

      // Convert from camelCase to snake_case for DB and handle date formatting
      const preIndDataValues = [
        draftId,
        data.projectName || null,
        data.therapeuticArea || null,
        data.projectObjective || null,
        data.targetPreIndMeetingDate || null,
        data.preIndMeetingObjective || null,
        JSON.stringify(data.preIndAgendaTopics || []),
        JSON.stringify(data.preIndAttendees || []),
        data.fdaInteractionNotes || null,
      ];

      const preIndResult = await client.query(preIndDataUpsert, preIndDataValues);
      const preIndDataId = preIndResult.rows[0].id;

      // 2. Handle Milestones (if present)
      if (Array.isArray(data.milestones)) {
        // Get existing milestone IDs for this pre_ind_data_id
        const existingMilestonesQuery = `
          SELECT id FROM ind_milestones WHERE pre_ind_data_id = $1
        `;
        const existingMilestonesResult = await client.query(existingMilestonesQuery, [
          preIndDataId,
        ]);
        const existingMilestoneIds = existingMilestonesResult.rows.map(row => row.id);

        // Track which milestone IDs we've processed
        const processedIds = new Set();

        // Process each milestone in the input data
        for (const milestone of data.milestones) {
          if (milestone.id && existingMilestoneIds.includes(milestone.id)) {
            // Update existing milestone
            await client.query(
              `
              UPDATE ind_milestones SET
                title = $1,
                due_date = $2,
                status = $3,
                description = $4,
                updated_at = NOW()
              WHERE id = $5 AND pre_ind_data_id = $6
            `,
              [
                milestone.title,
                milestone.dueDate,
                milestone.status,
                milestone.description || null,
                milestone.id,
                preIndDataId,
              ]
            );

            processedIds.add(milestone.id);
          } else {
            // Insert new milestone
            await client.query(
              `
              INSERT INTO ind_milestones (
                pre_ind_data_id, title, due_date, status, description, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, $5, NOW(), NOW()
              )
            `,
              [
                preIndDataId,
                milestone.title,
                milestone.dueDate,
                milestone.status,
                milestone.description || null,
              ]
            );
          }
        }

        // Delete milestones that weren't included in the update
        for (const existingId of existingMilestoneIds) {
          if (!processedIds.has(existingId)) {
            await client.query(
              `
              DELETE FROM ind_milestones WHERE id = $1 AND pre_ind_data_id = $2
            `,
              [existingId, preIndDataId]
            );
          }
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      return {
        success: true,
        message: 'Pre-IND data saved successfully.',
        preIndDataId,
      };
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Error saving Pre-IND data:', error);
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  },
};

// Define Zod schema for milestone validation
const MilestoneSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  dueDate: z.string().optional(),
  status: z.enum(['Pending', 'InProgress', 'Completed', 'Blocked']),
  description: z.string().optional(),
});

// Define Zod schema for Pre-IND data validation
const PreIndDataSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  therapeuticArea: z.string().optional(),
  projectObjective: z.string().optional(),
  targetPreIndMeetingDate: z.string().optional(),
  preIndMeetingObjective: z.string().optional(),
  preIndAgendaTopics: z.array(z.string()).default([]),
  preIndAttendees: z.array(z.string()).default([]),
  fdaInteractionNotes: z.string().optional(),
  milestones: z.array(MilestoneSchema).default([]),
});

// === ROUTES ===

/**
 * GET /api/ind/drafts/:draftId/pre-ind
 * Retrieves the Pre-IND data and associated milestones for a specific draft.
 */
router.get('/', authMiddleware, async (req, res) => {
  const draftId = String(req.params.draftId);
  const userId = (req as any).user?.id; // Type assertion for development - in production use proper typing

  try {
    const preIndData = await dbOps.getPreIndData(draftId, userId);

    if (!preIndData) {
      return res
        .status(404)
        .json({ success: false, message: 'Pre-IND data not found for this draft.' });
    }

    // Map database fields to frontend field names (snake_case to camelCase)
    const responseData = {
      projectName: preIndData.project_name,
      therapeuticArea: preIndData.therapeutic_area,
      projectObjective: preIndData.project_objective,
      targetPreIndMeetingDate: preIndData.target_pre_ind_meeting_date,
      preIndMeetingObjective: preIndData.pre_ind_meeting_objective,
      preIndAgendaTopics: preIndData.pre_ind_agenda_topics || [],
      preIndAttendees: preIndData.pre_ind_attendees || [],
      fdaInteractionNotes: preIndData.fda_interaction_notes,
      milestones: preIndData.milestones || [],
    };

    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error(`Error fetching Pre-IND data for draft ${draftId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve Pre-IND data.' });
  }
});

/**
 * PUT /api/ind/drafts/:draftId/pre-ind
 * Creates or updates the Pre-IND data and milestones for a specific draft.
 */
router.put('/', authMiddleware, async (req, res) => {
  const draftId = String(req.params.draftId);
  const userId = (req as any).user?.id; // Type assertion for development
  const dataToSave = req.body;

  try {
    // Validate input data against schema
    const validationResult = PreIndDataSchema.safeParse(dataToSave);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
        errors: validationResult.error.format(),
      });
    }

    const result = await dbOps.savePreIndData(draftId, userId, validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error(`Error saving Pre-IND data for draft ${draftId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to save Pre-IND data.' });
  }
});

export default router;
