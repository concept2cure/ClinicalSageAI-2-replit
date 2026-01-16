/**
 * Document Bulk Approve API
 *
 * This module provides endpoints for bulk approving documents
 * and emitting real-time QC events via WebSockets.
 */

import express from 'express';
import { setTimeout } from 'timers/promises';
import { WebSocket } from 'ws';

const router = express.Router();

// Access the QC WebSocket server for broadcasting updates
function getQcWebSocketServer() {
  return global.qcWebSocketServer;
}

/**
 * Broadcast a QC status update to all connected clients via WebSocket
 *
 * @param {number} documentId - ID of the document
 * @param {string} status - New QC status ('passed', 'failed', etc.)
 */
async function broadcastQcUpdate(documentId, status) {
  const wss = getQcWebSocketServer();

  if (!wss || !wss.clients) {
    console.error('QC WebSocket server not initialized');
    return;
  }

  const message = JSON.stringify({
    type: 'qc_status',
    documentId,
    status,
    timestamp: new Date().toISOString(),
  });

  let clientCount = 0;

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      clientCount++;
    }
  });

  console.log(`QC update for document ${documentId} broadcasted to ${clientCount} clients`);
}

/**
 * Bulk approve and QC multiple documents
 *
 * @route POST /api/documents/bulk-approve
 * @param {object} req.body.ids - Array of document IDs to approve
 * @param {string} req.body.region - Regulatory region (FDA, EMA, PMDA)
 * @returns {object} Success message
 */
router.post('/api/documents/bulk-approve', async (req, res) => {
  try {
    const { ids, region = 'FDA' } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({
        error: 'Invalid request format',
        message: 'Expected "ids" array in request body',
      });
    }

    // Validate region parameter
    const validRegions = ['FDA', 'EMA', 'PMDA'];
    const validatedRegion = validRegions.includes(region) ? region : 'FDA';

    console.log(
      `Bulk approve request for ${ids.length} documents using ${validatedRegion} validation rules`
    );

    // Send immediate response to client
    res.json({
      success: true,
      message: `Bulk approval started for ${ids.length} documents`,
      processing: true,
      region: validatedRegion,
    });

    // Process documents in the background with region-specific validation
    processDocuments(ids, validatedRegion);
  } catch (error) {
    console.error('Error in bulk approve endpoint:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * Process documents in the background and send WebSocket updates
 * Uses region-specific validation profiles
 *
 * @param {number[]} documentIds - Array of document IDs to process
 * @param {string} region - Regulatory region (FDA, EMA, PMDA)
 */
async function processDocuments(documentIds, region = 'FDA') {
  const validationProfile = getValidationProfile(region);
  console.log(`Using validation profile: ${validationProfile} for region: ${region}`);

  // Broadcasting processing start
  documentIds.forEach(id => {
    broadcastQcUpdate(id, 'processing');
  });

  // For parallel processing (up to 5 at a time), use Promise.all with batches
  const batchSize = 5;
  const documentBatches = [];

  // Create batches of documents to process in parallel
  for (let i = 0; i < documentIds.length; i += batchSize) {
    documentBatches.push(documentIds.slice(i, i + batchSize));
  }

  let processedCount = 0;
  let passedCount = 0;
  let failedCount = 0;

  // Process each batch in sequence, but documents within a batch in parallel
  for (const batch of documentBatches) {
    try {
      await Promise.all(
        batch.map(async id => {
          try {
            // Simulate document processing with validation
            await validateDocument(id, validationProfile);
            processedCount++;

            // Get calculated status based on document type and validation rules
            const status = await calculateDocumentStatus(id, region);

            if (status === 'passed') {
              passedCount++;
            } else {
              failedCount++;
            }

            // Send real-time update via WebSocket
            await broadcastQcUpdate(id, status);

            console.log(`Document ${id} QC ${status} (${region}/${validationProfile})`);
          } catch (error) {
            console.error(`Error processing document ${id}:`, error);
            // Mark as failed on error
            await broadcastQcUpdate(id, 'failed');
            processedCount++;
            failedCount++;
          }
        })
      );
    } catch (error) {
      console.error('Error processing batch:', error);
    }
  }

  console.log(
    `Completed bulk processing for ${documentIds.length} documents. Results: ${passedCount} passed, ${failedCount} failed`
  );

  // Final summary broadcast (could be used for notification or status updates)
  const wss = getQcWebSocketServer();
  if (wss && wss.clients) {
    const summaryMessage = JSON.stringify({
      type: 'bulk_qc_summary',
      total: documentIds.length,
      processed: processedCount,
      passed: passedCount,
      failed: failedCount,
      region: region,
      timestamp: new Date().toISOString(),
    });

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(summaryMessage);
      }
    });
  }
}

/**
 * Get the appropriate validation profile for the regulatory region
 *
 * @param {string} region - Regulatory region (FDA, EMA, PMDA)
 * @returns {string} Validation profile name
 */
function getValidationProfile(region) {
  const profiles = {
    FDA: 'FDA_eCTD_3.2.2',
    EMA: 'EU_eCTD_3.2.2',
    PMDA: 'JP_eCTD_4.0',
  };

  return profiles[region] || profiles['FDA']; // Default to FDA if region not found
}

/**
 * Validate a document using the specified profile
 *
 * @param {number} documentId - Document ID
 * @param {string} validationProfile - Validation profile to use
 * @returns {Promise<void>}
 */
async function validateDocument(documentId, validationProfile) {
  // Simulate validation process
  const processingTime = 1000 + Math.random() * 3000;
  await setTimeout(processingTime);

  // In a real implementation, this would call the validation API
  // For example:
  // const response = await fetch(`/api/validate/document/${documentId}?profile=${validationProfile}`);
  // return response.json();

  return Promise.resolve({
    documentId,
    profile: validationProfile,
    processingTime,
  });
}

/**
 * Calculate document status based on document type and validation rules
 *
 * @param {number} documentId - Document ID
 * @param {string} region - Regulatory region
 * @returns {Promise<string>} Status (passed, failed, warning)
 */
async function calculateDocumentStatus(documentId, region) {
  // In a real implementation, this would apply complex rules based on
  // document content, metadata, and validation results

  // For demo purposes, we apply some randomization with region-specific biases
  const basePassRate = 0.9; // 90% base pass rate

  const regionFactors = {
    FDA: 0.0, // No adjustment for FDA
    EMA: -0.05, // Slightly stricter for EMA
    PMDA: -0.1, // More strict for PMDA
  };

  const regionFactor = regionFactors[region] || 0;
  const adjustedPassRate = basePassRate + regionFactor;

  // Determine final status (passed or failed)
  return Promise.resolve(Math.random() < adjustedPassRate ? 'passed' : 'failed');
}

export default router;
