/**
 * MashableBI API Routes
 *
 * This module provides API endpoints for integrating with the MashableBI analytics platform.
 */

import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
const router = express.Router();

// Get the directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../../.env');

// Mashable API base URL and credentials
const MASHABLE_BI_BASE_URL = process.env.MASHABLE_BI_BASE_URL || 'https://api.mashable-bi.com/v1';
const MASHABLE_BI_API_KEY = process.env.MASHABLE_BI_API_KEY;
const MASHABLE_BI_TENANT_ID = process.env.MASHABLE_BI_TENANT_ID;

// Map of dashboard IDs to MashableBI dashboard GUIDs
const DASHBOARD_MAP = {
  'ind-overview': 'db001-ind-overview-dashboard',
  'ind-timeline': 'db002-ind-timeline-analytics',
  'ind-document-analytics': 'db003-ind-document-analytics',
  'ind-regulatory-insights': 'db004-ind-regulatory-insights',
};

/**
 * Generate a secure embed token for MashableBI dashboards
 */
async function generateEmbedToken(dashboardId, filters = {}) {
  try {
    if (!MASHABLE_BI_API_KEY) {
      throw new Error('MashableBI API key not configured');
    }

    const mashableDashboardId = DASHBOARD_MAP[dashboardId] || DASHBOARD_MAP['ind-overview'];

    const response = await axios.post(
      `${MASHABLE_BI_BASE_URL}/embed/token`,
      {
        dashboardId: mashableDashboardId,
        tenantId: MASHABLE_BI_TENANT_ID,
        filters: filters,
        expiresIn: 3600, // 1 hour
      },
      {
        headers: {
          Authorization: `Bearer ${MASHABLE_BI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.token;
  } catch (error) {
    console.error('Error generating MashableBI embed token:', error);
    throw new Error('Failed to generate embed token');
  }
}

/**
 * Get embed URL for MashableBI dashboard
 *
 * @param {string} dashboardId - Dashboard ID to embed
 * @param {object} filters - Filter parameters to apply to the dashboard
 * @returns {Promise<string>} - Embed URL for the dashboard
 */
async function getEmbedUrl(dashboardId, filters = {}) {
  try {
    const token = await generateEmbedToken(dashboardId, filters);

    const mashableDashboardId = DASHBOARD_MAP[dashboardId] || DASHBOARD_MAP['ind-overview'];

    // Build the embed URL with token
    return `${MASHABLE_BI_BASE_URL}/embed/dashboard/${mashableDashboardId}?token=${token}`;
  } catch (error) {
    console.error('Error getting MashableBI embed URL:', error);
    throw error;
  }
}

/**
 * Route to get embed URL for MashableBI dashboard
 *
 * This route accepts query parameters:
 * - dashboard: Dashboard ID to embed
 * - filter_*: Filter parameters to apply to the dashboard
 */
router.get('/embed', async (req, res) => {
  try {
    const { dashboard } = req.query;

    if (!dashboard) {
      return res.status(400).send({ error: 'Dashboard ID is required' });
    }

    // Extract filter parameters from query
    const filters = {};
    Object.keys(req.query).forEach(key => {
      if (key.startsWith('filter_')) {
        const filterName = key.replace('filter_', '');
        filters[filterName] = req.query[key];
      }
    });

    // Get embed URL
    const embedUrl = await getEmbedUrl(dashboard, filters);

    // Proxy the MashableBI dashboard content
    const response = await axios.get(embedUrl, {
      responseType: 'text',
    });

    // Set content type based on response
    res.set('Content-Type', response.headers['content-type']);

    // Send the dashboard content
    res.send(response.data);
  } catch (error) {
    console.error('Error serving MashableBI dashboard:', error);

    // If API key is missing, return a specific error
    if (error.message === 'MashableBI API key not configured') {
      return res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; padding: 20px; text-align: center;">
            <h2>MashableBI Configuration Error</h2>
            <p>The MashableBI API key is not configured. Please contact your administrator.</p>
          </body>
        </html>
      `);
    }

    // Return an error page for other errors
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h2>Dashboard Error</h2>
          <p>${error.message || 'An error occurred while loading the dashboard'}</p>
        </body>
      </html>
    `);
  }
});

/**
 * Route to get analytics data for projects
 */
router.get('/projects/:projectId/analytics', async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!MASHABLE_BI_API_KEY) {
      return res.status(500).json({ error: 'MashableBI API key not configured' });
    }

    // Call MashableBI API to get project analytics
    const response = await axios.get(`${MASHABLE_BI_BASE_URL}/projects/${projectId}/analytics`, {
      headers: {
        Authorization: `Bearer ${MASHABLE_BI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching project analytics:', error);

    // Provide an error response
    res.status(500).json({
      error: error.message || 'Failed to fetch analytics data',
      // Include additional diagnostic info if available
      details: error.response?.data || {},
    });
  }
});

/**
 * Route to refresh analytics data
 */
router.post('/refresh', async (req, res) => {
  try {
    const { dashboardId, filters } = req.body;

    if (!dashboardId) {
      return res.status(400).json({ error: 'Dashboard ID is required' });
    }

    if (!MASHABLE_BI_API_KEY) {
      return res.status(500).json({ error: 'MashableBI API key not configured' });
    }

    // Call MashableBI API to trigger a data refresh
    const mashableDashboardId = DASHBOARD_MAP[dashboardId] || DASHBOARD_MAP['ind-overview'];

    await axios.post(
      `${MASHABLE_BI_BASE_URL}/dashboards/${mashableDashboardId}/refresh`,
      { filters },
      {
        headers: {
          Authorization: `Bearer ${MASHABLE_BI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.json({ success: true, message: 'Refresh initiated' });
  } catch (error) {
    console.error('Error refreshing analytics data:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh data' });
  }
});

/**
 * Helper function to update the API key in the .env file
 */
async function updateApiKey(apiKey) {
  try {
    // Read the current .env file
    let envContent = '';

    try {
      envContent = fs.readFileSync(envPath, 'utf8');
    } catch (error) {
      console.error('Error reading .env file:', error);
      // If file doesn't exist, create with empty content
      envContent = '';
    }

    // Parse the env content
    const envConfig = dotenv.parse(envContent);

    // Update the API key
    envConfig.MASHABLE_BI_API_KEY = apiKey;

    // Convert back to .env format
    const newEnvContent = Object.entries(envConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Write back to .env file
    fs.writeFileSync(envPath, newEnvContent);

    // Update the environment variable in memory
    process.env.MASHABLE_BI_API_KEY = apiKey;

    return true;
  } catch (error) {
    console.error('Error updating API key in .env file:', error);
    throw error;
  }
}

/**
 * Route to configure the MashableBI API key
 */
router.post('/configure', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Update the API key in the .env file
    await updateApiKey(apiKey);

    // Verify the API key by making a simple request to MashableBI
    try {
      await axios.get(`${MASHABLE_BI_BASE_URL}/status`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.warn('MashableBI status check failed, but API key was saved', error.message);
      // We'll save the key anyway, even if the test request fails
    }

    res.json({
      success: true,
      message: 'MashableBI API key configured successfully',
    });
  } catch (error) {
    console.error('Error configuring MashableBI API key:', error);
    res.status(500).json({
      error: 'Failed to configure MashableBI API key',
      details: error.message,
    });
  }
});

/**
 * Route to check MashableBI configuration status
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      configured: !!process.env.MASHABLE_BI_API_KEY,
      baseUrl: MASHABLE_BI_BASE_URL,
      tenantId: MASHABLE_BI_TENANT_ID,
    };

    if (status.configured) {
      try {
        await axios.get(`${MASHABLE_BI_BASE_URL}/status`, {
          headers: {
            Authorization: `Bearer ${MASHABLE_BI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 3000, // Short timeout for quick checking
        });
        status.connectionStatus = 'ok';
      } catch (error) {
        status.connectionStatus = 'error';
        status.connectionError = error.message;
      }
    }

    res.json(status);
  } catch (error) {
    console.error('Error checking MashableBI status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Route to export dashboard data
 */
router.post('/export', async (req, res) => {
  try {
    const { dashboardId, format, filters } = req.body;

    if (!dashboardId || !format) {
      return res.status(400).json({ error: 'Dashboard ID and format are required' });
    }

    if (!MASHABLE_BI_API_KEY) {
      return res.status(500).json({ error: 'MashableBI API key not configured' });
    }

    // Validate format
    const validFormats = ['pdf', 'excel', 'csv', 'image'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({ error: 'Invalid export format' });
    }

    // Call MashableBI API to export the dashboard
    const mashableDashboardId = DASHBOARD_MAP[dashboardId] || DASHBOARD_MAP['ind-overview'];

    const response = await axios.post(
      `${MASHABLE_BI_BASE_URL}/dashboards/${mashableDashboardId}/export`,
      {
        format,
        filters,
      },
      {
        headers: {
          Authorization: `Bearer ${MASHABLE_BI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      }
    );

    // Set appropriate content type for the response
    let contentType = 'application/octet-stream';
    let filename = `dashboard-export.${format}`;

    switch (format) {
      case 'pdf':
        contentType = 'application/pdf';
        filename = `dashboard-export.pdf`;
        break;
      case 'excel':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `dashboard-export.xlsx`;
        break;
      case 'csv':
        contentType = 'text/csv';
        filename = `dashboard-export.csv`;
        break;
      case 'image':
        contentType = 'image/png';
        filename = `dashboard-export.png`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(response.data);
  } catch (error) {
    console.error('Error exporting dashboard:', error);
    res.status(500).json({ error: error.message || 'Failed to export dashboard' });
  }
});

export default router;
