/**
 * QMP Audit Trail API Routes
 *
 * This module provides endpoints for retrieving and managing the audit trail
 * of Quality Management Plan (QMP) changes for regulatory compliance and traceability.
 */

import express from 'express';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock data for QMP audit trail (in a real app, this would come from a database)
const qmpAuditTrail = [
  {
    id: 'audit-001',
    timestamp: '2025-05-01T10:30:00Z',
    user: 'Maria Johnson',
    userRole: 'Quality Manager',
    changeType: 'objective-added',
    title: 'Clinical Data Quality Objective Added',
    description: 'New quality objective added for clinical data integrity',
    details: {
      objectiveId: 1,
      objectiveTitle: 'Clinical Data Quality Assurance',
      measures: 'Data validation rate >98%, Error reporting within 24 hours',
      responsible: 'Clinical Data Manager',
    },
  },
  {
    id: 'audit-002',
    timestamp: '2025-05-02T14:45:00Z',
    user: 'James Smith',
    userRole: 'Regulatory Affairs Specialist',
    changeType: 'ctq-added',
    title: 'Literature Search Comprehensiveness CtQ Added',
    description: 'Added critical-to-quality factor for literature searches',
    details: {
      ctqId: 1,
      ctqName: 'Literature Search Comprehensiveness',
      riskLevel: 'high',
      associatedSection: 'Literature Review',
    },
  },
  {
    id: 'audit-003',
    timestamp: '2025-05-03T09:15:00Z',
    user: 'David Williams',
    userRole: 'Medical Director',
    changeType: 'objective-updated',
    title: 'Regulatory Compliance Objective Updated',
    description: 'Updated target measures for regulatory compliance objective',
    details: {
      objectiveId: 2,
      objectiveTitle: 'Regulatory Compliance Assurance',
      previousMeasures: '95% compliance with regulatory requirements',
      newMeasures: '100% compliance with regulatory requirements',
    },
  },
  {
    id: 'audit-004',
    timestamp: '2025-05-04T16:20:00Z',
    user: 'Emma Davis',
    userRole: 'Clinical Research Associate',
    changeType: 'ctq-updated',
    title: 'FAERS Data Integration CtQ Modified',
    description: 'Updated mitigation strategy for FAERS data integration',
    details: {
      ctqId: 2,
      ctqName: 'FAERS Data Integration',
      previousMitigation: 'Manual verification of signals',
      newMitigation: 'Automated data validation checks; manual verification of critical signals',
    },
  },
  {
    id: 'audit-005',
    timestamp: '2025-05-05T11:30:00Z',
    user: 'Sarah Thompson',
    userRole: 'Quality Assurance Specialist',
    changeType: 'ctq-completed',
    title: 'Equivalence Methodology Validation Completed',
    description: 'CtQ factor marked as complete after independent expert review',
    details: {
      ctqId: 4,
      ctqName: 'Equivalence Methodology Validation',
      previousStatus: 'pending',
      newStatus: 'complete',
      verificationMethod: 'Independent expert review completed on May 5, 2025',
    },
  },
  {
    id: 'audit-006',
    timestamp: '2025-05-06T13:10:00Z',
    user: 'John Miller',
    userRole: 'System Administrator',
    changeType: 'status-changed',
    title: 'Clinical Data Quality Objective Status Changed',
    description: 'Objective status changed from planned to in-progress',
    details: {
      objectiveId: 1,
      objectiveTitle: 'Clinical Data Quality Assurance',
      previousStatus: 'planned',
      newStatus: 'in-progress',
    },
  },
  {
    id: 'audit-007',
    timestamp: '2025-05-07T15:45:00Z',
    user: 'Emily Wilson',
    userRole: 'Document Control Specialist',
    changeType: 'plan-approved',
    title: 'Quality Management Plan Approved',
    description: 'Quality Management Plan v1.0.0 approved for implementation',
    details: {
      planVersion: '1.0.0',
      approvalDate: '2025-05-07',
      nextReviewDate: '2025-11-07',
      approvedBy: 'Quality Management Committee',
    },
  },
];

/**
 * GET /api/qmp/audit-trail
 * Retrieve QMP audit trail records
 */
router.get('/audit-trail', (req, res) => {
  try {
    logger.info('Retrieved QMP audit trail', {
      module: 'qmp-audit-api',
      recordCount: qmpAuditTrail.length,
    });

    // Sort records by timestamp (newest first)
    const sortedRecords = [...qmpAuditTrail].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.json({
      auditRecords: sortedRecords,
      count: sortedRecords.length,
      metadata: {
        retentionPolicy: '10 years',
        complianceStandard: '21 CFR Part 11',
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error retrieving QMP audit trail', {
      module: 'qmp-audit-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP audit trail',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp/export-audit-trail
 * Export QMP audit trail as JSON for documentation and regulatory purposes
 */
router.get('/export-audit-trail', (req, res) => {
  try {
    // Format used in the export filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `QMP_Audit_Trail_${timestamp}.json`;

    // Sort records by timestamp (newest first)
    const sortedRecords = [...qmpAuditTrail].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Create a JSON export with metadata
    const exportData = {
      metadata: {
        title: 'Quality Management Plan - Audit Trail',
        generated: new Date().toISOString(),
        retentionPolicy: '10 years (21 CFR Part 11 compliance)',
        recordCount: sortedRecords.length,
      },
      auditRecords: sortedRecords,
    };

    // Set content type and disposition headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    // Return the JSON data
    res.json(exportData);

    logger.info('Exported QMP audit trail to JSON', {
      module: 'qmp-audit-api',
      recordCount: qmpAuditTrail.length,
      filename,
    });
  } catch (error) {
    logger.error('Error exporting QMP audit trail', {
      module: 'qmp-audit-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to export QMP audit trail',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp/export-audit-trail-pdf
 * Export QMP audit trail as a PDF report for documentation and regulatory purposes
 */
router.get('/export-audit-trail-pdf', async (req, res) => {
  try {
    // Format used in the export filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `QMP_Audit_Trail_Report_${timestamp}`;
    const tempJsonPath = path.join(os.tmpdir(), `${baseFilename}.json`);
    const outputPdfPath = path.join(os.tmpdir(), `${baseFilename}.pdf`);

    // Sort records by timestamp (newest first)
    const sortedRecords = [...qmpAuditTrail].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Create a JSON export with metadata
    const exportData = {
      metadata: {
        title: 'Quality Management Plan - Audit Trail',
        generated: new Date().toISOString(),
        retentionPolicy: '10 years (21 CFR Part 11 compliance)',
        recordCount: sortedRecords.length,
        complianceStandard: '21 CFR Part 11',
        lastUpdated: new Date().toISOString(),
      },
      auditRecords: sortedRecords,
    };

    // Write the JSON data to a temp file for the Python script to read
    fs.writeFileSync(tempJsonPath, JSON.stringify(exportData, null, 2));

    // Use the Python script to generate the PDF
    const pythonScript = path.join(__dirname, '../pdf_generators/qmp_audit_trail_pdf.py');

    logger.info('Generating PDF report from audit trail data', {
      module: 'qmp-audit-api',
      recordCount: qmpAuditTrail.length,
      script: pythonScript,
    });

    try {
      // Make the Python script executable
      fs.chmodSync(pythonScript, '755');

      // Execute the Python script to generate the PDF
      const { stdout, stderr } = await execPromise(
        `python3 ${pythonScript} ${tempJsonPath} ${outputPdfPath}`
      );

      if (stderr) {
        logger.warn('Python script warning', {
          module: 'qmp-audit-api',
          stderr,
        });
      }

      // Check if the PDF was created
      if (!fs.existsSync(outputPdfPath)) {
        throw new Error('PDF generation failed - output file not created');
      }

      // Read the generated PDF
      const pdfData = fs.readFileSync(outputPdfPath);

      // Set appropriate headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${baseFilename}.pdf"`);
      res.setHeader('Content-Length', pdfData.length);

      // Send the PDF data
      res.send(pdfData);

      // Clean up temporary files
      fs.unlinkSync(tempJsonPath);
      fs.unlinkSync(outputPdfPath);

      logger.info('Successfully exported QMP audit trail as PDF', {
        module: 'qmp-audit-api',
        recordCount: qmpAuditTrail.length,
        fileSize: pdfData.length,
      });
    } catch (pythonError) {
      logger.error('Error executing Python PDF generator', {
        module: 'qmp-audit-api',
        error: pythonError.message,
        stdout: pythonError.stdout,
        stderr: pythonError.stderr,
      });
      throw new Error(`PDF generation failed: ${pythonError.message}`);
    }
  } catch (error) {
    logger.error('Error exporting QMP audit trail to PDF', {
      module: 'qmp-audit-api',
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to export QMP audit trail to PDF',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp/audit-trail/by-date/:date
 * Retrieve QMP audit trail records for a specific date
 */
router.get('/audit-trail/by-date/:date', (req, res) => {
  try {
    const { date } = req.params;

    if (!date || !date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return res.status(400).json({
        error: 'Invalid date format',
        message: 'Date should be in YYYY-MM-DD format',
      });
    }

    // Filter records by the specified date
    const dateObj = new Date(date);
    const filteredRecords = qmpAuditTrail.filter(record => {
      const recordDate = new Date(record.timestamp);
      return (
        recordDate.getFullYear() === dateObj.getFullYear() &&
        recordDate.getMonth() === dateObj.getMonth() &&
        recordDate.getDate() === dateObj.getDate()
      );
    });

    logger.info('Retrieved QMP audit trail by date', {
      module: 'qmp-audit-api',
      date,
      recordCount: filteredRecords.length,
    });

    res.json({
      auditRecords: filteredRecords,
      count: filteredRecords.length,
      date,
    });
  } catch (error) {
    logger.error('Error retrieving QMP audit trail by date', {
      module: 'qmp-audit-api',
      date: req.params.date,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP audit trail by date',
      message: error.message,
    });
  }
});

/**
 * GET /api/qmp/audit-trail/by-user/:username
 * Retrieve QMP audit trail records for a specific user
 */
router.get('/audit-trail/by-user/:username', (req, res) => {
  try {
    const { username } = req.params;

    // Filter records by the specified username
    const filteredRecords = qmpAuditTrail.filter(record =>
      record.user.toLowerCase().includes(username.toLowerCase())
    );

    logger.info('Retrieved QMP audit trail by user', {
      module: 'qmp-audit-api',
      username,
      recordCount: filteredRecords.length,
    });

    res.json({
      auditRecords: filteredRecords,
      count: filteredRecords.length,
      username,
    });
  } catch (error) {
    logger.error('Error retrieving QMP audit trail by user', {
      module: 'qmp-audit-api',
      username: req.params.username,
      error: error.message,
    });

    res.status(500).json({
      error: 'Failed to retrieve QMP audit trail by user',
      message: error.message,
    });
  }
});

export default router;
