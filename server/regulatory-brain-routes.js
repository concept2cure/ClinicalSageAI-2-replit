/**
 * Regulatory Brain API Routes
 *
 * This file defines the API endpoints for the Concept2Cure™ Regulatory Brain services,
 * including the IND Wizard, eCTD Builder, and Risk Predictor.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  validateSponsorInfo,
  validateProtocolInfo,
  predictClinicalHoldRisk,
} from './regulatory-brain/ind-validator.js';
import {
  predictSubmissionRisk,
  generateRegulatoryReport,
  analyzeProtocolRisks,
} from './regulatory-brain/risk-predictor.js';
import {
  createEctdStructure,
  saveDocument,
  mapDocumentToFolder,
  validateEctdStructure,
} from './regulatory-brain/folder-builder.js';

// Create router
const router = express.Router();

/**
 * Route to validate sponsor information
 */
router.post('/api/ind/validate-sponsor', async (req, res) => {
  try {
    const sponsorInfo = req.body;
    const validationResults = await validateSponsorInfo(sponsorInfo);
    res.json(validationResults);
  } catch (error) {
    console.error('Error validating sponsor info:', error);
    res.status(500).json({
      error: 'Failed to validate sponsor information',
      details: error.message,
    });
  }
});

/**
 * Route to validate protocol information
 */
router.post('/api/ind/validate-protocol', async (req, res) => {
  try {
    const protocolInfo = req.body;
    const validationResults = await validateProtocolInfo(protocolInfo);
    res.json(validationResults);
  } catch (error) {
    console.error('Error validating protocol info:', error);
    res.status(500).json({
      error: 'Failed to validate protocol information',
      details: error.message,
    });
  }
});

/**
 * Route to predict clinical hold risk
 */
router.post('/api/ind/predict-clinical-hold-risk', async (req, res) => {
  try {
    const indInfo = req.body;
    const riskAssessment = await predictClinicalHoldRisk(indInfo);
    res.json(riskAssessment);
  } catch (error) {
    console.error('Error predicting clinical hold risk:', error);
    res.status(500).json({
      error: 'Failed to predict clinical hold risk',
      details: error.message,
    });
  }
});

/**
 * Route to predict submission risks
 */
router.post('/api/ind/predict-submission-risk', async (req, res) => {
  try {
    const submissionDraft = req.body;
    const riskAssessment = await predictSubmissionRisk(submissionDraft);
    res.json(riskAssessment);
  } catch (error) {
    console.error('Error predicting submission risk:', error);
    res.status(500).json({
      error: 'Failed to predict submission risk',
      details: error.message,
    });
  }
});

/**
 * Route to generate a regulatory intelligence report
 */
router.post('/api/ind/generate-regulatory-report', async (req, res) => {
  try {
    const { submissionData, riskAssessment } = req.body;
    const report = await generateRegulatoryReport(submissionData, riskAssessment);
    res.json(report);
  } catch (error) {
    console.error('Error generating regulatory report:', error);
    res.status(500).json({
      error: 'Failed to generate regulatory report',
      details: error.message,
    });
  }
});

/**
 * Route to analyze protocol risks
 */
router.post('/api/ind/analyze-protocol-risks', async (req, res) => {
  try {
    const protocolData = req.body;
    const analysis = await analyzeProtocolRisks(protocolData);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing protocol risks:', error);
    res.status(500).json({
      error: 'Failed to analyze protocol risks',
      details: error.message,
    });
  }
});

/**
 * Route to create an eCTD folder structure
 */
router.post('/api/ectd/create-structure', async (req, res) => {
  try {
    const { basePath, submissionId } = req.body;

    // Create a unique output directory for this submission
    const outputDir = path.join(
      process.cwd(),
      'generated_documents',
      `submission_${submissionId || Date.now()}`
    );

    // Ensure the directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    // Create eCTD structure
    const result = createEctdStructure(outputDir);

    res.json({
      ...result,
      outputDir,
    });
  } catch (error) {
    console.error('Error creating eCTD structure:', error);
    res.status(500).json({
      error: 'Failed to create eCTD structure',
      details: error.message,
    });
  }
});

/**
 * Route to save a document to the eCTD structure
 */
router.post('/api/ectd/save-document', async (req, res) => {
  try {
    const { document, targetFolder } = req.body;
    const result = saveDocument(document, targetFolder);
    res.json(result);
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({
      error: 'Failed to save document',
      details: error.message,
    });
  }
});

/**
 * Route to map a document to its appropriate eCTD folder
 */
router.post('/api/ectd/map-document', async (req, res) => {
  try {
    const { document, basePath } = req.body;
    const targetFolder = mapDocumentToFolder(document, basePath);
    res.json({ targetFolder });
  } catch (error) {
    console.error('Error mapping document:', error);
    res.status(500).json({
      error: 'Failed to map document to folder',
      details: error.message,
    });
  }
});

/**
 * Route to validate an eCTD structure
 */
router.post('/api/ectd/validate-structure', async (req, res) => {
  try {
    const { basePath } = req.body;
    const validationResults = validateEctdStructure(basePath);
    res.json(validationResults);
  } catch (error) {
    console.error('Error validating eCTD structure:', error);
    res.status(500).json({
      error: 'Failed to validate eCTD structure',
      details: error.message,
    });
  }
});

export default router;
