/**
 * FastAPI Bridge for CER Generator (CommonJS version)
 *
 * This module provides a connection between the Express.js server and Python-based
 * FastAPI services for advanced data processing tasks.
 */

const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Default FastAPI server location
const FASTAPI_SERVER = process.env.FASTAPI_SERVER || 'http://localhost:8000';

// Flag to track if FastAPI server is running
let isServerRunning = false;

/**
 * Start the FastAPI server if not already running
 */
async function ensureFastApiServer() {
  if (isServerRunning) {
    return true;
  }

  try {
    // Try to check if the server is already running
    try {
      const response = await axios.get(`${FASTAPI_SERVER}/health`);
      if (response.status === 200) {
        console.log('FastAPI server is already running');
        isServerRunning = true;
        return true;
      }
    } catch (error) {
      // Server is not running, we'll start it
    }

    // Paths are relative to the project root
    const fastApiScriptPath = path.join('server', 'cer_fastapi_simplified.py');

    // Ensure the script exists
    if (!fs.existsSync(fastApiScriptPath)) {
      console.error(`FastAPI script not found at ${fastApiScriptPath}`);
      return false;
    }

    // Start the FastAPI server as a child process
    const fastApiProcess = spawn('python3', [fastApiScriptPath]);

    fastApiProcess.stdout.on('data', data => {
      console.log(`FastAPI: ${data.toString()}`);
      if (data.toString().includes('Application startup complete')) {
        isServerRunning = true;
      }
    });

    fastApiProcess.stderr.on('data', data => {
      console.error(`FastAPI error: ${data.toString()}`);
    });

    fastApiProcess.on('close', code => {
      console.log(`FastAPI server exited with code ${code}`);
      isServerRunning = false;
    });

    // Give the server a moment to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify the server is running
    try {
      const response = await axios.get(`${FASTAPI_SERVER}/health`);
      if (response.status === 200) {
        console.log('FastAPI server started successfully');
        isServerRunning = true;
        return true;
      }
    } catch (error) {
      console.error('Failed to verify FastAPI server is running:', error.message);
      return false;
    }

    return isServerRunning;
  } catch (error) {
    console.error('Error ensuring FastAPI server is running:', error);
    return false;
  }
}

/**
 * Call a FastAPI endpoint with auto-retry if server not running
 * @param {string} endpoint - API endpoint path (e.g., '/cer/generate')
 * @param {string} method - HTTP method ('get', 'post', etc.)
 * @param {object} data - Request data for POST/PUT methods
 * @param {object} options - Additional axios options
 * @returns {Promise<object>} - Response data
 */
async function callFastApi(endpoint, method = 'get', data = null, options = {}) {
  try {
    // Ensure FastAPI server is running
    const serverReady = await ensureFastApiServer();
    if (!serverReady) {
      throw new Error('Failed to start FastAPI server');
    }

    // Prepare request URL and config
    const url = `${FASTAPI_SERVER}${endpoint}`;
    const config = { ...options };

    // Make the API call
    let response;
    if (method.toLowerCase() === 'get') {
      response = await axios.get(url, config);
    } else if (method.toLowerCase() === 'post') {
      response = await axios.post(url, data, config);
    } else if (method.toLowerCase() === 'put') {
      response = await axios.put(url, data, config);
    } else if (method.toLowerCase() === 'delete') {
      response = await axios.delete(url, config);
    } else {
      throw new Error(`Unsupported HTTP method: ${method}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Error calling FastAPI (${endpoint}):`, error.message);
    throw error;
  }
}

/**
 * Generate a CER for a specified NDC code
 * @param {string} ndcCode - The NDC code to generate a report for
 * @returns {Promise<object>} - Generated CER data
 */
async function generateCer(ndcCode) {
  return callFastApi('/cer/generate', 'post', { ndc_code: ndcCode });
}

/**
 * Analyze multiple NDC codes for comparison
 * @param {string[]} ndcCodes - Array of NDC codes to analyze
 * @returns {Promise<object>} - Comparative analysis data
 */
async function analyzeCers(ndcCodes) {
  return callFastApi('/cer/analyze', 'post', { ndc_codes: ndcCodes });
}

/**
 * Generate a PDF report for one or more NDC codes
 * @param {string[]} ndcCodes - Array of NDC codes to include in the report
 * @returns {Promise<Buffer>} - PDF data as a buffer
 */
async function generateCerPdf(ndcCodes) {
  const response = await axios.post(
    `${FASTAPI_SERVER}/cer/export-pdf`,
    { ndc_codes: ndcCodes },
    { responseType: 'arraybuffer' }
  );

  return Buffer.from(response.data);
}

/**
 * Start FastAPI server programmatically
 * @returns {Promise<boolean>}
 */
function startFastApiServer() {
  return ensureFastApiServer();
}

/**
 * Stop FastAPI server
 * @returns {void}
 */
function stopFastApiServer() {
  console.log('FastAPI server stop requested (stub)');
  // In a real implementation, this would stop the FastAPI server
  // But since we're running it in-process, it will terminate with the Node process
}

/**
 * Create Express middleware to proxy requests to FastAPI
 * @returns {Function} Express middleware function
 */
function createFastApiProxyMiddleware() {
  return function (req, res, next) {
    // Only intercept API routes for CER endpoints
    if (req.path.startsWith('/api/cer/')) {
      callFastApi(req.path.replace('/api/cer', '/cer'), req.method.toLowerCase(), req.body, {
        params: req.query,
      })
        .then(result => {
          res.json({ success: true, ...result });
        })
        .catch(error => {
          console.error(`Error proxying to FastAPI (${req.path}):`, error.message);
          res.status(500).json({
            success: false,
            message: error.message || 'Failed to process request',
          });
        });
    } else {
      // Pass through for non-CER endpoints
      next();
    }
  };
}

// Auto-start the FastAPI server when this module is imported
ensureFastApiServer()
  .then(success => {
    if (success) {
      console.log('FastAPI server is ready (CommonJS)');
    } else {
      console.error('Failed to start FastAPI server (CommonJS)');
    }
  })
  .catch(err => {
    console.error('Error in FastAPI server initialization (CommonJS):', err);
  });

module.exports = {
  ensureFastApiServer,
  callFastApi,
  generateCer,
  analyzeCers,
  generateCerPdf,
  startFastApiServer,
  stopFastApiServer,
  createFastApiProxyMiddleware,
};
