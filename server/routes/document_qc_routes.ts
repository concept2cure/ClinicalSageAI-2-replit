import express from 'express';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { documents } from '../../shared/schema';

const io = null;

const router = express.Router();

/**
 * Validate a single document for QC compliance.
 * Checks required fields and content completeness.
 * Returns { status: 'passed' | 'failed', issues: string[] }
 */
function validateDocument(doc: any): { status: 'passed' | 'failed'; issues: string[] } {
  const issues: string[] = [];

  // Check required fields
  if (!doc.title || doc.title.trim().length === 0) {
    issues.push('Missing or empty document title');
  }

  if (!doc.documentCode || doc.documentCode.trim().length === 0) {
    issues.push('Missing document code');
  }

  if (!doc.documentType || doc.documentType.trim().length === 0) {
    issues.push('Missing document type');
  }

  // Check owner assignment
  if (!doc.ownerId) {
    issues.push('No document owner assigned');
  }

  // Check status is valid for approval
  const invalidStatuses = ['obsolete'];
  if (doc.status && invalidStatuses.includes(doc.status)) {
    issues.push(`Document status "${doc.status}" is not eligible for QC approval`);
  }

  // Check document is active
  if (doc.isActive === false) {
    issues.push('Document is marked inactive');
  }

  // Check document is not locked by another user
  if (doc.isLocked) {
    issues.push('Document is currently locked for editing');
  }

  // Check validation status if GxP
  if (doc.complianceLevel === 'gxp' || doc.complianceLevel === 'cfr_part_11') {
    if (!doc.validationStatus || doc.validationStatus === 'not_validated') {
      issues.push(`Document requires validation for ${doc.complianceLevel} compliance`);
    }
  }

  return {
    status: issues.length === 0 ? 'passed' : 'failed',
    issues,
  };
}

// Endpoint for bulk document QC and approval
router.post('/api/documents/bulk-approve', async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty document IDs' });
    }

    // Start QC process for each document (asynchronously)
    triggerBulkQcProcess(ids);

    // Return immediately to client
    return res.json({
      message: 'Bulk QC and approval process started',
      count: ids.length,
      ids,
    });
  } catch (error) {
    console.error('Error starting bulk QC process:', error);
    return res.status(500).json({ error: 'Failed to start bulk QC process' });
  }
});

// Endpoint to simulate a QC process completing (for testing)
router.post('/api/documents/:id/qc-complete', async (req, res) => {
  try {
    const docId = parseInt(req.params.id);
    const { status, message } = req.body;

    // Notify connected clients about QC completion
    notifyQcComplete(docId, status || 'passed', message);

    return res.json({
      message: 'QC completion notification sent',
      document_id: docId,
    });
  } catch (error) {
    console.error(`Error sending QC notification:`, error);
    return res.status(500).json({ error: 'Failed to send QC notification' });
  }
});

// Endpoint to save document order in the builder
router.post('/api/documents/builder-order', async (req, res) => {
  try {
    const { docs } = req.body;

    if (!Array.isArray(docs)) {
      return res.status(400).json({ error: 'Invalid document order data' });
    }

    // Here you would save the order to the database
    // For now we just log it and return success
    console.log('Saving document order:', docs);

    return res.json({
      message: 'Document order saved',
      count: docs.length,
    });
  } catch (error) {
    console.error('Error saving document order:', error);
    return res.status(500).json({ error: 'Failed to save document order' });
  }
});

// Helper function to trigger QC process for multiple documents
async function triggerBulkQcProcess(docIds: number[]) {
  try {
    // Fetch all documents from the database
    const docs = await db
      .select()
      .from(documents)
      .where(inArray(documents.id, docIds));

    // Build a lookup map for fetched documents
    const docMap = new Map(docs.map(d => [d.id, d]));

    // Validate each document
    for (const docId of docIds) {
      const doc = docMap.get(docId);

      if (!doc) {
        notifyQcComplete(docId, 'failed', 'Document not found in database');
        console.log(`QC process completed for document ${docId}: failed (not found)`);
        continue;
      }

      const result = validateDocument(doc);
      const message =
        result.status === 'passed'
          ? 'Document passed all QC checks'
          : `Failed QC: ${result.issues.join('; ')}`;

      notifyQcComplete(docId, result.status, message);
      console.log(`QC process completed for document ${docId}: ${result.status}`);
    }
  } catch (error) {
    console.error('Error in bulk QC process:', error);
    // Notify failure for all documents on DB error
    for (const docId of docIds) {
      notifyQcComplete(docId, 'failed', 'Internal error during QC validation');
    }
  }
}

// Helper function to notify clients of QC completion via WebSockets
function notifyQcComplete(docId: number, status: string, message?: string) {
  // Send WebSocket notification to all clients
  if (io) {
    (io as any).emit('qc:complete', {
      document_id: docId,
      status,
      message: message || (status === 'passed' ? 'QC passed' : 'QC failed'),
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
