import express from 'express';

const io = null;

const router = express.Router();

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
  // Process each document asynchronously
  docIds.forEach(async (docId, index) => {
    try {
      // Simulate QC process with staggered completion
      setTimeout(
        () => {
          // Simulate random QC results for demonstration
          const status = Math.random() > 0.2 ? 'passed' : 'failed';
          const message =
            status === 'passed'
              ? 'Document passed all QC checks'
              : 'Failed: Document has invalid structure';

          // Notify all connected clients about QC completion
          notifyQcComplete(docId, status, message);

          console.log(`QC process completed for document ${docId}: ${status}`);
        },
        2000 + index * 1000
      ); // Stagger completions
    } catch (error) {
      console.error(`Error processing QC for document ${docId}:`, error);
    }
  });
}

// Helper function to notify clients of QC completion via WebSockets
function notifyQcComplete(docId: number, status: string, message?: string) {
  // Send WebSocket notification to all clients
  if (io) {
    io.emit('qc:complete', {
      document_id: docId,
      status,
      message: message || (status === 'passed' ? 'QC passed' : 'QC failed'),
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
