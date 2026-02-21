/**
 * @fileoverview eCTD 4.0 Validation & Backbone API Routes
 * @module server/routes/ectd-validate
 *
 * Endpoints:
 *   POST /api/ectd-validate/validate  — Full package validation
 *   POST /api/ectd-validate/quick     — Quick completeness check (lightweight)
 *   POST /api/ectd-validate/backbone  — Generate eCTD 4.0 JSON backbone
 *
 * @compliance ICH M8, FDA ESG Technical Conformance Guide
 */

import { Router, Request, Response } from 'express';
import {
  validatePackage,
  quickValidate,
  generateBackbone,
  type ECTDLeaf,
} from '../services/ectd/ectd4-validator.js';

const router = Router();

/**
 * POST /validate — Full eCTD package validation
 * Body: { leaves: ECTDLeaf[], submissionType?: string }
 */
router.post('/validate', (req: Request, res: Response) => {
  try {
    const { leaves, submissionType } = req.body;

    if (!Array.isArray(leaves)) {
      return res.status(400).json({ error: 'Missing or invalid `leaves` array' });
    }

    const result = validatePackage(leaves as ECTDLeaf[], submissionType || 'IND');
    return res.json(result);
  } catch (err: any) {
    console.error('[eCTD Validate] Error:', err);
    return res.status(500).json({ error: 'Validation failed', detail: err.message });
  }
});

/**
 * POST /quick — Quick completeness check (no file-level validation)
 * Body: { sectionCodes: string[], submissionType?: string }
 */
router.post('/quick', (req: Request, res: Response) => {
  try {
    const { sectionCodes, submissionType } = req.body;

    if (!Array.isArray(sectionCodes)) {
      return res.status(400).json({ error: 'Missing or invalid `sectionCodes` array' });
    }

    const result = quickValidate(sectionCodes, submissionType || 'IND');
    return res.json(result);
  } catch (err: any) {
    console.error('[eCTD Quick Validate] Error:', err);
    return res.status(500).json({ error: 'Quick validation failed', detail: err.message });
  }
});

/**
 * POST /backbone — Generate eCTD 4.0 JSON backbone
 * Body: { applicantName, applicationNumber, submissionType, sequenceNumber, leaves }
 */
router.post('/backbone', (req: Request, res: Response) => {
  try {
    const { applicantName, applicationNumber, submissionType, sequenceNumber, leaves } = req.body;

    if (!applicantName || !applicationNumber || !Array.isArray(leaves)) {
      return res.status(400).json({
        error: 'Missing required fields: applicantName, applicationNumber, leaves[]',
      });
    }

    const backbone = generateBackbone({
      applicantName,
      applicationNumber,
      submissionType: submissionType || 'IND',
      sequenceNumber: sequenceNumber || '0000',
      leaves: leaves as ECTDLeaf[],
    });

    return res.json(backbone);
  } catch (err: any) {
    console.error('[eCTD Backbone] Error:', err);
    return res.status(500).json({ error: 'Backbone generation failed', detail: err.message });
  }
});

export default router;
