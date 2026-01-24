/**
 * Server-Sent Events Routes
 *
 * Provides endpoints for real-time generation progress updates using SSE.
 */
const express = require('express');
const router = express.Router();

// Store active SSE clients for each job
const sseClients = new Map();

/**
 * Set up SSE for a job
 * @param {string} jobId - The ID of the generation job
 * @param {express.Response} res - The response object to send events to
 */
function setupSSE(jobId, res) {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send an initial message
  const initialData = JSON.stringify({
    jobId,
    progress: 0,
    message: 'Starting generation process...',
  });
  res.write(`event: progress\ndata: ${initialData}\n\n`);

  // Add this client to our clients map
  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, []);
  }

  sseClients.get(jobId).push(res);

  // Remove client when connection closes
  res.on('close', () => {
    if (sseClients.has(jobId)) {
      sseClients.set(
        jobId,
        sseClients.get(jobId).filter(client => client !== res)
      );

      // Clean up if no clients left
      if (sseClients.get(jobId).length === 0) {
        sseClients.delete(jobId);
      }
    }
  });
}

/**
 * Send an event to all clients connected to a job
 * @param {string} jobId - The job ID
 * @param {string} eventType - The type of event ('progress', 'section', 'complete', 'error')
 * @param {object} data - The data to send
 */
function sendEventToJob(jobId, eventType, data) {
  if (sseClients.has(jobId)) {
    const eventData = JSON.stringify(data);
    const eventString = `event: ${eventType}\ndata: ${eventData}\n\n`;

    sseClients.get(jobId).forEach(client => {
      client.write(eventString);

      // If this is a 'complete' or 'error' event, close the connection
      if (eventType === 'complete' || eventType === 'error') {
        client.end();
      }
    });
  }
}

// SSE endpoint for generation progress
router.get('/cer/job/:jobId/progress', (req, res) => {
  const { jobId } = req.params;
  setupSSE(jobId, res);
});

// Export both the router and the helper function
module.exports = {
  router,
  sendEventToJob,
};
