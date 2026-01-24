/**
 * Mock FDA 510k API routes for testing
 */

const express = require('express');
const router = express.Router();

// Mock compliance status data that matches what we expect in the frontend
const mockComplianceStatusData = {
  success: true,
  progressSummary: {
    overallPercentage: 87,
    steps: {
      total: 12,
      completed: 10,
      percentage: 83,
    },
    validationRules: {
      total: 54,
      implemented: 49,
      percentage: 91,
    },
  },
  implementedFeatures: [
    'PDF Generation System',
    'Section Validation',
    'eSTAR Package Builder',
    'Compliance Tracker',
    'Document Format Validator',
    'FDA Template Integration',
    'Predicate Comparison System',
    'Section Ordering',
    'Workflow Integration',
    'Status Reporting',
  ],
  pendingFeatures: [
    'Interactive FDA Review Comments',
    'Auto-correction for Non-compliant Sections',
  ],
  validationIssues: [
    {
      severity: 'warning',
      section: 'Performance Testing',
      message: 'Section contains tables that may not meet FDA formatting requirements',
    },
    {
      severity: 'warning',
      section: 'Software Documentation',
      message: 'Missing recommended cross-references to validation documentation',
    },
    {
      severity: 'info',
      section: 'General',
      message: 'Consider adding more detailed device specifications',
    },
  ],
  lastUpdated: '2025-05-14T14:32:10Z',
};

// GET /api/fda510k/estar/compliance-status
router.get('/estar/compliance-status', (req, res) => {
  res.json(mockComplianceStatusData);
});

// POST /api/fda510k/pdf/submission
router.post('/pdf/submission', (req, res) => {
  const { projectId } = req.body;

  // Simulate PDF generation
  res.json({
    success: true,
    fileUrl: '/generated_documents/510k-submission-CardioTrack-X500.pdf',
    generatedAt: new Date().toISOString(),
    pageCount: 87,
    fdaCompliant: true,
    validationResult: {
      valid: true,
      issues: [],
    },
  });
});

module.exports = router;
