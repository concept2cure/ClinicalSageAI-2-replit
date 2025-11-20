/**
 * Health Check Routes
 *
 * This module provides endpoints for checking the health of various
 * system components including the database connection.
 */

import express from 'express';
import { testConnection, pool, dbStatus } from '../db.js';

const router = express.Router();

// For backward compatibility with existing code
let lastDatabaseStatus = false;
let consecutiveFailures = 0;
let lastSuccessfulConnection = null;

// Update our monitoring variables from the dbStatus object
dbStatus.events.on('connected', () => {
  lastDatabaseStatus = true;
  lastSuccessfulConnection = dbStatus.lastConnected;
  consecutiveFailures = 0;
});

dbStatus.events.on('error', () => {
  lastDatabaseStatus = false;
  consecutiveFailures++;
});

// Set up periodic health check for monitoring
setInterval(async () => {
  try {
    const dbStatus = await testConnection();

    if (dbStatus) {
      lastSuccessfulConnection = new Date();
      consecutiveFailures = 0;
      lastDatabaseStatus = true;

      // Log successful reconnection after previous failures
      if (consecutiveFailures > 0) {
        console.info('[database] Successfully reconnected to database');
        consecutiveFailures = 0;
      }
    } else {
      consecutiveFailures++;
      lastDatabaseStatus = false;

      console.warn(`[database] Health check failed - consecutive failures: ${consecutiveFailures}`);

      // If too many consecutive failures, try to reset the pool
      if (consecutiveFailures >= 5) {
        try {
          console.warn('[database] Attempting to recover connection pool');
          // This will close idle clients and attempt to reconnect as needed
          await pool.end();
          // Pool will automatically reconnect on next query
        } catch (resetError) {
          console.error('[database] Failed to reset connection pool:', resetError.message);
        }
      }
    }
  } catch (error) {
    consecutiveFailures++;
    lastDatabaseStatus = false;
    console.error('[database] Health check error:', error.message);
  }
}, 30000); // Check every 30 seconds

/**
 * Basic health check endpoint
 * Returns simple status and timestamp
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Deep health check
 * Performs comprehensive checks on all dependencies including database connection
 */
/**
 * Get detailed database pool statistics
 */
function getPoolStats() {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    poolSize: dbStatus.poolSize,
    lastSuccessfulConnection: dbStatus.lastConnected
      ? dbStatus.lastConnected.toISOString()
      : lastSuccessfulConnection
        ? lastSuccessfulConnection.toISOString()
        : null,
    connectionAttempts: dbStatus.connectionAttempts,
    consecutiveFailures,
    reconnecting: dbStatus.reconnecting,
    status: dbStatus.connected ? 'online' : 'offline',
    errorMessage: dbStatus.lastError ? dbStatus.lastError.message : null,
  };
}

/**
 * Deep health check with detailed monitoring information
 * Used by UI components to display system health status
 */
router.get('/deep', async (req, res) => {
  try {
    // Start time for performance measurement
    const startTime = Date.now();

    // Database checks
    let databaseResult;
    try {
      const dbStartTime = Date.now();
      const dbStatus = await testConnection();
      const dbLatency = Date.now() - dbStartTime;

      // Update global status variables
      lastDatabaseStatus = dbStatus;
      if (dbStatus) {
        lastSuccessfulConnection = new Date();
        consecutiveFailures = 0;
      }

      // Get detailed pool statistics
      const poolStats = getPoolStats();

      databaseResult = {
        status: dbStatus ? 'ok' : 'error',
        latency: dbLatency,
        pool: poolStats,
        uptime: lastSuccessfulConnection
          ? Math.floor((Date.now() - new Date(lastSuccessfulConnection).getTime()) / 1000)
          : 0,
      };
    } catch (error) {
      databaseResult = {
        status: 'error',
        error: error.message,
        latency: 0,
        pool: getPoolStats(),
      };
    }

    // Check MashableBI connection if API key exists
    let mashableBiResult = { status: 'unknown' };
    if (process.env.MASHABLE_BI_API_KEY) {
      try {
        mashableBiResult = {
          status: 'ok',
          configured: true,
        };
      } catch (error) {
        mashableBiResult = {
          status: 'error',
          error: error.message,
          configured: true,
        };
      }
    } else {
      mashableBiResult = {
        status: 'not_configured',
        configured: false,
      };
    }

    // Get total execution time for health check
    const totalTime = Date.now() - startTime;

    // Determine overall system status
    const overallStatus = databaseResult.status === 'ok' ? 'ok' : 'degraded';

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      totalTime,
      components: {
        database: databaseResult,
        mashableBi: mashableBiResult,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
