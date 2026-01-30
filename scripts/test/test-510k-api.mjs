import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const app = express();
app.use(express.json());

// Mock FDA 510k API routes
app.get('/api/fda510k/estar/compliance-status', (req, res) => {
  res.json(mockComplianceStatusData);
});

// PDF generation endpoint
app.post('/api/fda510k/pdf/submission', (req, res) => {
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

// Serve static files from 'generated_documents'
app.use('/generated_documents', express.static(path.join(__dirname, 'generated_documents')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
  logger.info(`FDA 510k test server running on port ${PORT}`);
  logger.info(
    `Test the compliance status endpoint at: http://localhost:${PORT}/api/fda510k/estar/compliance-status`
  );
  logger.info(
    `Test the PDF generation endpoint at: http://localhost:${PORT}/api/fda510k/pdf/submission (POST)`
  );
});
