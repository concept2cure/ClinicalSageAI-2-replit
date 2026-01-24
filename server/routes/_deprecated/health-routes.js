/**
 * Health Check Routes
 *
 * This module provides health check endpoints for monitoring application health,
 * database connectivity, and readiness for traffic.
 */

const express = require('express');
const { pool } = require('../db');
const config = require('../config/environment').config;

const router = express.Router();

// Basic liveness check (is the app running?)
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: process.env.APP_VERSION || 'development',
  });
});

// Readiness check (can the app handle traffic?)
router.get('/ready', async (req, res) => {
  const startTime = Date.now();
  const healthCheck = {
    status: 'UP',
    timestamp: new Date().toISOString(),
    components: {
      database: { status: 'UNKNOWN' },
      api: { status: 'UP' },
    },
    environment: config.env,
    version: process.env.APP_VERSION || 'development',
  };

  // Check database connectivity
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      healthCheck.components.database = {
        status: 'UP',
        responseTime: `${Date.now() - startTime}ms`,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Health check - Database error:', error.message);
    healthCheck.components.database = {
      status: 'DOWN',
      error: error.message,
      responseTime: `${Date.now() - startTime}ms`,
    };
    healthCheck.status = 'DEGRADED';
  }

  // Check external API dependencies if applicable
  try {
    // Example: check OpenAI API key is present (but don't actually call the API)
    if (config.api.openai.key) {
      healthCheck.components.openai = { status: 'CONFIGURED' };
    } else {
      healthCheck.components.openai = { status: 'NOT_CONFIGURED' };
    }

    // Example: check PubMed API key is present
    if (config.api.pubmed.key) {
      healthCheck.components.pubmed = { status: 'CONFIGURED' };
    } else {
      healthCheck.components.pubmed = { status: 'NOT_CONFIGURED' };
    }
  } catch (error) {
    console.error('Health check - API error:', error.message);
    healthCheck.components.api = {
      status: 'WARNING',
      error: error.message,
    };
  }

  // Add memory usage info
  healthCheck.memory = {
    rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
  };

  // Add uptime info
  healthCheck.uptime = `${Math.round(process.uptime())} seconds`;

  // Add response time
  healthCheck.responseTime = `${Date.now() - startTime}ms`;

  // Return 503 if any critical component is down
  const httpStatus =
    healthCheck.status === 'UP' ? 200 : healthCheck.status === 'DEGRADED' ? 200 : 503;

  res.status(httpStatus).json(healthCheck);
});

// Detailed application diagnostics (for internal use with proper authorization)
router.get('/diagnostics', (req, res) => {
  // This should be protected by admin authorization in production
  const diagnostics = {
    timestamp: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      versions: process.versions,
    },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    environment: process.env.NODE_ENV,
    connections: {
      database: config.database.url ? 'CONFIGURED' : 'NOT_CONFIGURED',
    },
    config: {
      environment: config.env,
      isProduction: config.isProduction,
      isStaging: config.isStaging,
      isDevelopment: config.isDevelopment,
    },
  };

  res.json(diagnostics);
});

module.exports = router;
