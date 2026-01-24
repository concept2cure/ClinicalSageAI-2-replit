/**
 * Document Approval Routes
 *
 * This module contains routes for document approval workflows.
 */

import express from 'express';
import { publish } from '../utils/event_bus.js';

const router = express.Router();

// Route to approve a document
router.post('/api/documents/:id/approve', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const userId = req.body.user_id || 1; // Default user ID if not provided

    // In a real implementation, this would update document status in the database
    // For demo, just simulate successful approval

    // Emit approval event via WebSocket
    await publish('document_approval', {
      document_id: documentId,
      status: 'approved',
      user_id: userId,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      success: true,
      document_id: documentId,
      status: 'approved',
      message: 'Document approved successfully',
    });
  } catch (error) {
    console.error(`Error approving document ${req.params.id}:`, error);
    return res.status(500).json({
      error: 'Failed to approve document',
      message: error.message,
    });
  }
});

// Route to run QC on a document
router.post('/api/documents/:id/qc', async (req, res) => {
  try {
    const documentId = parseInt(req.params.id);
    if (isNaN(documentId)) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    // In a real implementation, this would run QC checks
    // For demo, just simulate QC process
    const qcSuccess = documentId % 2 === 0; // Alternate between pass/fail for demo

    const qcResult = {
      document_id: documentId,
      status: qcSuccess ? 'pass' : 'warning',
      issues: qcSuccess
        ? []
        : [
            {
              level: 'warning',
              message: 'Sample QC warning',
              location: 'page 2',
            },
          ],
      timestamp: new Date().toISOString(),
    };

    // Emit QC event via WebSocket with a slight delay to simulate processing
    setTimeout(async () => {
      await publish('qc', {
        id: documentId,
        status: qcResult.status,
        qc_result: qcResult,
      });
    }, 1500);

    return res.json({
      success: true,
      document_id: documentId,
      message: 'QC process started',
      result: qcResult,
    });
  } catch (error) {
    console.error(`Error running QC on document ${req.params.id}:`, error);
    return res.status(500).json({
      error: 'Failed to run QC',
      message: error.message,
    });
  }
});

// Register routes with the application
export function registerRoutes(app) {
  app.use(router);
  console.log('Document approval routes registered');
  return router;
}

export default router;
