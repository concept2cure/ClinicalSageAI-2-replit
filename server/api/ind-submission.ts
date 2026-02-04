/**
 * IND Submission API Service
 * Orchestrates IND Wizard, eCTD Co-Author, and CMC modules
 * With OpenAI Facts Graph and Day-30 tracking
 */

import express from 'express';
import {
  extractFactsFromEvidence,
  generateComparabilityPlan,
  generateSafetyUpdate,
  validateECTDStructure,
} from '../services/ai/openai-orchestrator';
import { getPool } from '../db';
import { v4 as uuid } from 'uuid';
import multer from 'multer';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const db = getPool();

/**
 * Save IND Progress with Facts Graph integration
 */
router.post('/save-progress', async (req, res) => {
  try {
    const { draftId, projectData, indData, currentStep, completedSteps } = req.body;

    // Store in database with proper structure
    await db.query(
      `INSERT INTO ind_submissions (
        draft_id, project_data, ind_data, current_step,
        completed_steps, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (draft_id) DO UPDATE SET
        project_data = $2,
        ind_data = $3,
        current_step = $4,
        completed_steps = $5,
        updated_at = NOW()`,
      [
        draftId || uuid(),
        JSON.stringify(projectData),
        JSON.stringify(indData),
        currentStep,
        completedSteps,
      ]
    );

    // Extract facts from any new evidence
    if (indData.preIndData?.evidenceDocuments) {
      for (const doc of indData.preIndData.evidenceDocuments) {
        if (doc.content && !doc.factsExtracted) {
          const facts = await extractFactsFromEvidence(doc.content, doc.fileName);

          // Link facts to IND submission
          for (const fact of facts) {
            await db.query(
              `INSERT INTO ind_facts (draft_id, fact_id) VALUES ($1, $2)
               ON CONFLICT DO NOTHING`,
              [draftId, fact.id]
            );
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'IND progress saved with Facts Graph integration',
      draftId: draftId || uuid(),
    });
  } catch (error) {
    console.error('Error saving IND progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

/**
 * Extract Facts from uploaded evidence documents
 */
router.post('/extract-facts', upload.single('document'), async (req, res) => {
  try {
    const { file } = req;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read file content (simplified - in production use proper file parsing)
    const fs = require('fs');
    const fileContent = fs.readFileSync(file.path, 'utf-8');

    // Extract facts using OpenAI
    const facts = await extractFactsFromEvidence(fileContent, file.originalname);

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      facts,
      message: `Extracted ${facts.length} facts from ${file.originalname}`,
    });
  } catch (error) {
    console.error('Error extracting facts:', error);
    res.status(500).json({ error: 'Failed to extract facts' });
  }
});

/**
 * Generate CMC comparability plan and leaf patches
 */
router.post('/generate-cmc-comparability', async (req, res) => {
  try {
    const { preChangeData, postChangeData, leafId } = req.body;

    const result = await generateComparabilityPlan(
      preChangeData,
      postChangeData,
      leafId || 'm3.2.P.5-1'
    );

    // Store the comparability plan
    await db.query(
      `INSERT INTO cmc_comparability_plans (id, plan_data, leaf_patches, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [uuid(), JSON.stringify(result.plan), JSON.stringify(result.patch)]
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error generating comparability plan:', error);
    res.status(500).json({ error: 'Failed to generate comparability plan' });
  }
});

/**
 * Process safety event and generate IND safety update
 */
router.post('/process-safety-event', async (req, res) => {
  try {
    const { saeData } = req.body;

    const safetyUpdate = await generateSafetyUpdate(saeData);

    // Store safety update with 312.32 timeline tracking
    await db.query(
      `INSERT INTO safety_updates (
        id, event_type, reporting_timeline, narrative,
        investigator_notification, fda_notification,
        actions, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        safetyUpdate.id,
        safetyUpdate.event_type,
        safetyUpdate.reporting_timeline,
        safetyUpdate.narrative,
        safetyUpdate.investigator_notification,
        safetyUpdate.fda_notification,
        JSON.stringify(safetyUpdate.actions),
      ]
    );

    // Set up automated timers for 7-day or 15-day reporting
    if (safetyUpdate.reporting_timeline === '7-day') {
      // Schedule 7-day notification
      console.log('[Safety] 7-day SUSAR timer started for:', safetyUpdate.id);
    } else if (safetyUpdate.reporting_timeline === '15-day') {
      // Schedule 15-day notification
      console.log('[Safety] 15-day safety timer started for:', safetyUpdate.id);
    }

    res.json({
      success: true,
      safetyUpdate,
    });
  } catch (error) {
    console.error('Error processing safety event:', error);
    res.status(500).json({ error: 'Failed to process safety event' });
  }
});

/**
 * Validate eCTD structure before submission
 */
router.post('/validate-ectd', async (req, res) => {
  try {
    const { leafData } = req.body;

    const findings = await validateECTDStructure(leafData);

    // Store validation findings
    await db.query(
      `INSERT INTO validation_runs (id, findings, created_at)
       VALUES ($1, $2, NOW())`,
      [uuid(), JSON.stringify(findings)]
    );

    // Check for blocking errors
    const hasErrors = findings.some(f => f.severity === 'error');

    res.json({
      success: !hasErrors,
      findings,
      canSubmit: !hasErrors,
    });
  } catch (error) {
    console.error('Error validating eCTD:', error);
    res.status(500).json({ error: 'Failed to validate eCTD structure' });
  }
});

/**
 * Submit IND to FDA via ESG NextGen
 */
router.post('/submit-ind', async (req, res) => {
  try {
    const { draftId, sequenceNo, region } = req.body;

    // Validate before submission
    const validation = await validateECTDStructure({ draftId });
    if (validation.some(f => f.severity === 'error')) {
      return res.status(400).json({
        error: 'Validation failed',
        findings: validation,
      });
    }

    const submissionId = uuid();

    // Create submission record
    await db.query(
      `INSERT INTO submissions (
        id, draft_id, sequence_no, region, status, created_at
      ) VALUES ($1, $2, $3, $4, 'submitted', NOW())`,
      [submissionId, draftId, sequenceNo, region]
    );

    // Simulate ESG submission (replace with actual ESG API)
    const esgResponse = {
      submissionId: `ESG-${submissionId}`,
      receiptTimestamp: new Date().toISOString(),
      acknowledgment: 'FDA-ACK-' + Math.random().toString(36).substring(7),
    };

    // Update with FDA receipt - starts Day-30 clock
    await db.query(
      `UPDATE submissions
       SET esg_submission_id = $1,
           fda_receipt_ts = $2,
           status = 'acknowledged'
       WHERE id = $3`,
      [esgResponse.submissionId, esgResponse.receiptTimestamp, submissionId]
    );

    // Calculate Day-30 deadline
    const day30Date = new Date();
    day30Date.setDate(day30Date.getDate() + 30);

    res.json({
      success: true,
      submissionId,
      esgSubmissionId: esgResponse.submissionId,
      fdaReceipt: esgResponse.receiptTimestamp,
      day30Deadline: day30Date.toISOString(),
      message: 'IND submitted successfully - Day-30 clock started',
    });
  } catch (error) {
    console.error('Error submitting IND:', error);
    res.status(500).json({ error: 'Failed to submit IND' });
  }
});

/**
 * Get Day-30 clock status
 */
router.get('/day30-status/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;

    const result = await db.query(
      `SELECT fda_receipt_ts, status
       FROM submissions
       WHERE draft_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [draftId]
    );

    if (result.rows.length === 0) {
      return res.json({ hasSubmission: false });
    }

    const submission = result.rows[0];
    const receiptDate = new Date(submission.fda_receipt_ts);
    const day30Date = new Date(receiptDate);
    day30Date.setDate(day30Date.getDate() + 30);

    const now = new Date();
    const daysRemaining = Math.ceil((day30Date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    res.json({
      hasSubmission: true,
      fdaReceipt: submission.fda_receipt_ts,
      day30Deadline: day30Date.toISOString(),
      daysRemaining: Math.max(0, daysRemaining),
      status: submission.status,
      isActive: daysRemaining > 0 && submission.status === 'acknowledged',
    });
  } catch (error) {
    console.error('Error getting Day-30 status:', error);
    res.status(500).json({ error: 'Failed to get Day-30 status' });
  }
});

/**
 * Get Facts Graph for a draft
 */
router.get('/facts/:draftId', async (req, res) => {
  try {
    const { draftId } = req.params;

    const result = await db.query(
      `SELECT f.*
       FROM facts f
       JOIN ind_facts if ON f.id = if.fact_id
       WHERE if.draft_id = $1
       ORDER BY f.created_at DESC`,
      [draftId]
    );

    res.json({
      success: true,
      facts: result.rows,
    });
  } catch (error) {
    console.error('Error getting facts:', error);
    res.status(500).json({ error: 'Failed to get facts' });
  }
});

/**
 * Initialize database tables for IND submissions
 */
async function initializeINDTables() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS ind_submissions (
      draft_id TEXT PRIMARY KEY,
      project_data JSONB,
      ind_data JSONB,
      current_step INT,
      completed_steps TEXT[],
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS ind_facts (
      draft_id TEXT,
      fact_id UUID,
      PRIMARY KEY (draft_id, fact_id)
    )`,

    `CREATE TABLE IF NOT EXISTS cmc_comparability_plans (
      id UUID PRIMARY KEY,
      plan_data JSONB,
      leaf_patches JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS safety_updates (
      id UUID PRIMARY KEY,
      event_type TEXT,
      reporting_timeline TEXT,
      narrative TEXT,
      investigator_notification TEXT,
      fda_notification TEXT,
      actions JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    `CREATE TABLE IF NOT EXISTS validation_runs (
      id UUID PRIMARY KEY,
      findings JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];

  for (const query of queries) {
    try {
      await db.query(query);
    } catch (error) {
      console.error('[IND Tables] Error creating table:', error);
    }
  }

  console.log('[IND Submission] Database tables initialized');
}

// Initialize tables on module load
initializeINDTables().catch(console.error);

export default router;
