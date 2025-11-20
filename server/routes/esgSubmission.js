/**
 * FDA ESG Submission Routes
 *
 * API routes for:
 * - Creating ESG submissions
 * - Generating submission packages
 * - Validating submissions
 * - Submitting to FDA ESG
 * - Tracking acknowledgments
 */

import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.js';
import {
  createEsgSubmission,
  generateSubmissionPackage,
  validateSubmissionPackage,
  submitToFda,
  getSubmissionEvents,
  getSubmissionAcknowledgments,
  configureEsgConnection,
} from '../services/esgService.js';
import { logger } from '../utils/logger.js';

const router = Router();

/**
 * Create a new ESG submission
 *
 * POST /api/esg/submissions
 */
router.post('/submissions', verifyJwt, async (req, res) => {
  try {
    const { submissionId, submissionType, sequenceNumber, center, format, environment } = req.body;

    if (!submissionId) {
      return res.status(400).json({ message: 'Missing required parameter: submissionId' });
    }

    const result = await createEsgSubmission(submissionId, {
      userId: req.user.id,
      submissionType,
      sequenceNumber,
      center,
      format,
      environment,
    });

    res.status(201).json(result);
  } catch (error) {
    logger.error(`Error creating ESG submission: ${error.message}`, error);
    res.status(500).json({ message: `Error creating ESG submission: ${error.message}` });
  }
});

/**
 * Get ESG submission by ID
 *
 * GET /api/esg/submissions/:id
 */
router.get('/submissions/:id', verifyJwt, async (req, res) => {
  try {
    const { data: submission, error } = await supabase
      .from('esg_submissions')
      .select('*, ind_submissions(*)')
      .eq('id', req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ message: `Submission not found: ${error.message}` });
    }

    res.json(submission);
  } catch (error) {
    logger.error(`Error fetching ESG submission: ${error.message}`, error);
    res.status(500).json({ message: `Error fetching ESG submission: ${error.message}` });
  }
});

/**
 * List ESG submissions for an IND submission
 *
 * GET /api/esg/submissions/by-ind/:indSubmissionId
 */
router.get('/submissions/by-ind/:indSubmissionId', verifyJwt, async (req, res) => {
  try {
    const { data: submissions, error } = await supabase
      .from('esg_submissions')
      .select('*')
      .eq('submission_id', req.params.indSubmissionId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: `Error fetching submissions: ${error.message}` });
    }

    res.json(submissions);
  } catch (error) {
    logger.error(`Error listing ESG submissions: ${error.message}`, error);
    res.status(500).json({ message: `Error listing ESG submissions: ${error.message}` });
  }
});

/**
 * Generate submission package
 *
 * POST /api/esg/submissions/:id/package
 */
router.post('/submissions/:id/package', verifyJwt, async (req, res) => {
  try {
    const result = await generateSubmissionPackage(req.params.id, {
      userId: req.user.id,
      ...req.body,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Error generating package: ${error.message}`, error);
    res.status(500).json({ message: `Error generating package: ${error.message}` });
  }
});

/**
 * Validate submission package
 *
 * POST /api/esg/submissions/:id/validate
 */
router.post('/submissions/:id/validate', verifyJwt, async (req, res) => {
  try {
    const { validator } = req.body;

    const result = await validateSubmissionPackage(req.params.id, {
      userId: req.user.id,
      validator,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Error validating package: ${error.message}`, error);
    res.status(500).json({ message: `Error validating package: ${error.message}` });
  }
});

/**
 * Submit to FDA ESG
 *
 * POST /api/esg/submissions/:id/submit
 */
router.post('/submissions/:id/submit', verifyJwt, async (req, res) => {
  try {
    const { environment } = req.body;

    const result = await submitToFda(req.params.id, {
      userId: req.user.id,
      environment,
    });

    res.json(result);
  } catch (error) {
    logger.error(`Error submitting to FDA: ${error.message}`, error);
    res.status(500).json({ message: `Error submitting to FDA: ${error.message}` });
  }
});

/**
 * Get submission events
 *
 * GET /api/esg/submissions/:id/events
 */
router.get('/submissions/:id/events', verifyJwt, async (req, res) => {
  try {
    const events = await getSubmissionEvents(req.params.id);
    res.json(events);
  } catch (error) {
    logger.error(`Error fetching events: ${error.message}`, error);
    res.status(500).json({ message: `Error fetching events: ${error.message}` });
  }
});

/**
 * Get submission acknowledgments
 *
 * GET /api/esg/submissions/:id/acks
 */
router.get('/submissions/:id/acks', verifyJwt, async (req, res) => {
  try {
    const acks = await getSubmissionAcknowledgments(req.params.id);
    res.json(acks);
  } catch (error) {
    logger.error(`Error fetching acknowledgments: ${error.message}`, error);
    res.status(500).json({ message: `Error fetching acknowledgments: ${error.message}` });
  }
});

/**
 * Configure ESG connection
 *
 * POST /api/esg/config
 */
router.post('/config', verifyJwt, async (req, res) => {
  try {
    const config = await configureEsgConnection({
      ...req.body,
      userId: req.user.id,
    });

    res.status(201).json(config);
  } catch (error) {
    logger.error(`Error configuring ESG connection: ${error.message}`, error);
    res.status(500).json({ message: `Error configuring ESG connection: ${error.message}` });
  }
});

/**
 * Get ESG configuration
 *
 * GET /api/esg/config
 */
router.get('/config', verifyJwt, async (req, res) => {
  try {
    const { data: configs, error } = await supabase
      .from('esg_configuration')
      .select(
        'id, environment, connection_type, sender_id, sender_name, fda_receiver_id, is_active'
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: `Error fetching configurations: ${error.message}` });
    }

    res.json(configs);
  } catch (error) {
    logger.error(`Error fetching ESG configurations: ${error.message}`, error);
    res.status(500).json({ message: `Error fetching ESG configurations: ${error.message}` });
  }
});

export default router;
