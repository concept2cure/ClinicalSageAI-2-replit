// server/routes/nonclinicalRoutes.ts

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
  // Function to get Nonclinical data and studies for a draft
  getNonclinicalData: async (draftId: string, userId?: number) => {
    try {
      // Run a raw SQL query to fetch nonclinical data
      const nonclinicalDataQuery = sql`
        SELECT id, draft_id, overall_nonclinical_summary, pharmacology_status, pk_status, toxicology_status, created_at, updated_at
        FROM ind_nonclinical_data
        WHERE draft_id = ${draftId}
      `;

      const nonclinicalResult = await db.execute(nonclinicalDataQuery);

      if (!nonclinicalResult.length) {
        return null; // Not found
      }

      const nonclinicalRecord = nonclinicalResult[0];

      // Fetch associated studies
      const studiesQuery = sql`
        SELECT id, study_identifier, study_title, study_type, species, model,
               route_of_administration, duration, main_findings, glp_compliance,
               validation_status, validation_issues, study_location, study_director
        FROM ind_nonclinical_studies
        WHERE nonclinical_data_id = ${nonclinicalRecord.id}
        ORDER BY study_identifier ASC
      `;

      const studies = await db.execute(studiesQuery);

      // Format studies for frontend (snake_case to camelCase)
      const formattedStudies = studies.map(study => ({
        id: study.id,
        studyIdentifier: study.study_identifier,
        studyTitle: study.study_title,
        studyType: study.study_type,
        species: study.species,
        model: study.model,
        routeOfAdministration: study.route_of_administration,
        duration: study.duration,
        mainFindings: study.main_findings,
        glpCompliance: study.glp_compliance,
        validationStatus: study.validation_status,
        validationIssues: study.validation_issues,
        studyLocation: study.study_location,
        studyDirector: study.study_director,
      }));

      // Combine data (snake_case to camelCase)
      return {
        ...nonclinicalRecord,
        overallNonclinicalSummary: nonclinicalRecord.overall_nonclinical_summary,
        pharmacologyStatus: nonclinicalRecord.pharmacology_status,
        pkStatus: nonclinicalRecord.pk_status,
        toxicologyStatus: nonclinicalRecord.toxicology_status,
        studies: formattedStudies,
      };
    } catch (error) {
      console.error('Error fetching Nonclinical data:', error);
      throw error;
    }
  },

  // Function to save/update Nonclinical data and studies
  saveNonclinicalData: async (draftId: string, userId: number | undefined, data: any) => {
    // We'll use a client from the pool to enable transactions
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // 1. UPSERT ind_nonclinical_data
      const nonclinicalDataUpsert = `
        INSERT INTO ind_nonclinical_data (
          draft_id, overall_nonclinical_summary, pharmacology_status,
          pk_status, toxicology_status, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, NOW()
        )
        ON CONFLICT (draft_id) DO UPDATE SET
          overall_nonclinical_summary = EXCLUDED.overall_nonclinical_summary,
          pharmacology_status = EXCLUDED.pharmacology_status,
          pk_status = EXCLUDED.pk_status,
          toxicology_status = EXCLUDED.toxicology_status,
          updated_at = NOW()
        RETURNING id
      `;

      // Convert from camelCase to snake_case for DB
      const nonclinicalDataValues = [
        draftId,
        data.overallNonclinicalSummary || null,
        data.pharmacologyStatus || 'NotStarted',
        data.pkStatus || 'NotStarted',
        data.toxicologyStatus || 'NotStarted',
      ];

      const nonclinicalResult = await client.query(nonclinicalDataUpsert, nonclinicalDataValues);
      const nonclinicalDataId = nonclinicalResult.rows[0].id;

      // 2. Handle Studies (if present)
      const newStudyIds: Record<string, string> = {};

      if (Array.isArray(data.studies)) {
        // Get existing study IDs for this nonclinical_data_id
        const existingStudiesQuery = `
          SELECT id, study_identifier FROM ind_nonclinical_studies WHERE nonclinical_data_id = $1
        `;
        const existingStudiesResult = await client.query(existingStudiesQuery, [nonclinicalDataId]);

        // Create maps for efficient lookups
        const existingStudiesById = new Map(existingStudiesResult.rows.map(row => [row.id, row]));
        const existingStudiesByIdentifier = new Map(
          existingStudiesResult.rows.map(row => [row.study_identifier, row])
        );

        // Track which study IDs we've processed
        const processedIds = new Set();

        // Process each study in the input data
        for (const study of data.studies) {
          if (study.id && existingStudiesById.has(study.id)) {
            // Update existing study by ID
            await client.query(
              `
              UPDATE ind_nonclinical_studies SET
                study_identifier = $1,
                study_title = $2,
                study_type = $3,
                species = $4,
                model = $5,
                route_of_administration = $6,
                duration = $7,
                main_findings = $8,
                glp_compliance = $9,
                validation_status = $10,
                validation_issues = $11,
                study_location = $12,
                study_director = $13,
                updated_at = NOW()
              WHERE id = $14 AND nonclinical_data_id = $15
            `,
              [
                study.studyIdentifier,
                study.studyTitle,
                study.studyType || null,
                study.species || null,
                study.model || null,
                study.routeOfAdministration || null,
                study.duration || null,
                study.mainFindings || null,
                study.glpCompliance || false,
                study.validationStatus || 'pending',
                study.validationIssues || null,
                study.studyLocation || null,
                study.studyDirector || null,
                study.id,
                nonclinicalDataId,
              ]
            );

            processedIds.add(study.id);
          } else {
            // Check if we have a study with the same identifier
            const existingStudyId = existingStudiesByIdentifier.get(study.studyIdentifier)?.id;

            if (existingStudyId) {
              // Update existing study by study_identifier
              await client.query(
                `
                UPDATE ind_nonclinical_studies SET
                  study_title = $1,
                  study_type = $2,
                  species = $3,
                  model = $4,
                  route_of_administration = $5,
                  duration = $6,
                  main_findings = $7,
                  glp_compliance = $8,
                  validation_status = $9,
                  validation_issues = $10,
                  study_location = $11,
                  study_director = $12,
                  updated_at = NOW()
                WHERE id = $13 AND nonclinical_data_id = $14
              `,
                [
                  study.studyTitle,
                  study.studyType || null,
                  study.species || null,
                  study.model || null,
                  study.routeOfAdministration || null,
                  study.duration || null,
                  study.mainFindings || null,
                  study.glpCompliance || false,
                  study.validationStatus || 'pending',
                  study.validationIssues || null,
                  study.studyLocation || null,
                  study.studyDirector || null,
                  existingStudyId,
                  nonclinicalDataId,
                ]
              );

              processedIds.add(existingStudyId);
            } else {
              // Insert new study
              const insertResult = await client.query(
                `
                INSERT INTO ind_nonclinical_studies (
                  nonclinical_data_id, study_identifier, study_title, study_type,
                  species, model, route_of_administration, duration, main_findings,
                  glp_compliance, validation_status, validation_issues,
                  study_location, study_director, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW()
                ) RETURNING id
              `,
                [
                  nonclinicalDataId,
                  study.studyIdentifier,
                  study.studyTitle,
                  study.studyType || null,
                  study.species || null,
                  study.model || null,
                  study.routeOfAdministration || null,
                  study.duration || null,
                  study.mainFindings || null,
                  study.glpCompliance || false,
                  study.validationStatus || 'pending',
                  study.validationIssues || null,
                  study.studyLocation || null,
                  study.studyDirector || null,
                ]
              );

              const newStudyId = insertResult.rows[0].id;
              processedIds.add(newStudyId);

              // Store new ID mapping for response
              newStudyIds[study.studyIdentifier] = newStudyId;
            }
          }
        }

        // Delete studies that weren't included in the update
        const idsToDelete = Array.from(existingStudiesById.keys()).filter(
          id => !processedIds.has(id)
        );

        if (idsToDelete.length > 0) {
          for (const idToDelete of idsToDelete) {
            await client.query(
              `
              DELETE FROM ind_nonclinical_studies WHERE id = $1 AND nonclinical_data_id = $2
            `,
              [idToDelete, nonclinicalDataId]
            );
          }
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      return {
        success: true,
        message: 'Nonclinical data saved successfully.',
        data: {
          nonclinicalDataId,
          newStudyIds,
        },
      };
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Error saving Nonclinical data:', error);
      throw error;
    } finally {
      // Release client back to pool
      client.release();
    }
  },

  // Function to validate a nonclinical study
  validateStudy: async (studyId: string, validationStatus: string, validationIssues?: string) => {
    try {
      const updateQuery = sql`
        UPDATE ind_nonclinical_studies
        SET validation_status = ${validationStatus},
            validation_issues = ${validationIssues || null},
            updated_at = NOW()
        WHERE id = ${studyId}
        RETURNING *
      `;

      const result = await db.execute(updateQuery);

      if (!result.length) {
        return null; // Not found
      }

      return {
        id: result[0].id,
        studyIdentifier: result[0].study_identifier,
        validationStatus: result[0].validation_status,
        validationIssues: result[0].validation_issues,
      };
    } catch (error) {
      console.error('Error validating study:', error);
      throw error;
    }
  },
};

// Define Zod schema for study validation
const NonclinicalStudySchema = z.object({
  id: z.string().optional(),
  studyIdentifier: z.string().min(1, 'Study identifier is required'),
  studyTitle: z.string().min(1, 'Study title is required'),
  studyType: z.string().optional(),
  species: z.string().optional(),
  model: z.string().optional(),
  routeOfAdministration: z.string().optional(),
  duration: z.string().optional(),
  mainFindings: z.string().optional(),
  glpCompliance: z.boolean().default(false),
  validationStatus: z.enum(['pending', 'validated', 'rejected']).default('pending'),
  validationIssues: z.string().optional(),
  studyLocation: z.string().optional(),
  studyDirector: z.string().optional(),
});

// Define Zod schema for nonclinical data validation
const NonclinicalDataSchema = z.object({
  overallNonclinicalSummary: z.string().optional(),
  pharmacologyStatus: z.enum(['NotStarted', 'InProgress', 'Completed']).default('NotStarted'),
  pkStatus: z.enum(['NotStarted', 'InProgress', 'Completed']).default('NotStarted'),
  toxicologyStatus: z.enum(['NotStarted', 'InProgress', 'Completed']).default('NotStarted'),
  studies: z.array(NonclinicalStudySchema).default([]),
});

// === ROUTES ===

/**
 * GET /api/ind/drafts/:draftId/nonclinical
 * Retrieves the nonclinical data and associated studies for a specific draft.
 */
router.get('/', authMiddleware, async (req, res) => {
  const { draftId } = req.params;
  const userId = (req as any).user?.id; // Type assertion for development - in production use proper typing

  try {
    const nonclinicalData = await dbOps.getNonclinicalData(draftId, userId);

    if (!nonclinicalData) {
      return res.status(404).json({
        success: false,
        message: 'Nonclinical data not found for this draft.',
      });
    }

    // Format response data
    const responseData = {
      overallNonclinicalSummary: nonclinicalData.overallNonclinicalSummary,
      pharmacologyStatus: nonclinicalData.pharmacologyStatus,
      pkStatus: nonclinicalData.pkStatus,
      toxicologyStatus: nonclinicalData.toxicologyStatus,
      studies: nonclinicalData.studies || [],
    };

    res.status(200).json({ success: true, data: responseData });
  } catch (error) {
    console.error(`Error fetching Nonclinical data for draft ${draftId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Nonclinical data.',
    });
  }
});

/**
 * PUT /api/ind/drafts/:draftId/nonclinical
 * Creates or updates the nonclinical data and studies for a specific draft.
 */
router.put('/', authMiddleware, async (req, res) => {
  const { draftId } = req.params;
  const userId = (req as any).user?.id; // Type assertion for development
  const dataToSave = req.body;

  try {
    // Validate input data against schema
    const validationResult = NonclinicalDataSchema.safeParse(dataToSave);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
        errors: validationResult.error.format(),
      });
    }

    const result = await dbOps.saveNonclinicalData(draftId, userId, validationResult.data);
    res.status(200).json(result);
  } catch (error) {
    console.error(`Error saving Nonclinical data for draft ${draftId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to save Nonclinical data.',
    });
  }
});

/**
 * POST /api/ind/drafts/:draftId/nonclinical/studies/:studyId/validate
 * Updates the validation status of a specific study.
 */
router.post('/studies/:studyId/validate', authMiddleware, async (req, res) => {
  const { studyId } = req.params;
  const { validationStatus, validationIssues } = req.body;

  // Validate input
  if (!validationStatus || !['pending', 'validated', 'rejected'].includes(validationStatus)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid validation status. Must be one of: pending, validated, rejected.',
    });
  }

  try {
    const result = await dbOps.validateStudy(studyId, validationStatus, validationIssues);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Study not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Study validation status updated successfully.',
      data: result,
    });
  } catch (error) {
    console.error(`Error validating study ${studyId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to update study validation status.',
    });
  }
});

export default router;
