/**
 * Application Health Check Utility
 *
 * This module provides functions to check the health of various components
 * of the application, ensuring stability and preventing downtime.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Structure to hold health check results
interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: {
      status: 'up' | 'down' | 'degraded';
      responseTime?: number;
      message?: string;
    };
    fileSystem: {
      status: 'ok' | 'error';
      message?: string;
    };
    memory: {
      status: 'ok' | 'warning' | 'critical';
      used: number;
      total: number;
      percentUsed: number;
    };
  };
  timestamp: string;
}

/**
 * Performs a comprehensive health check of all critical application components
 */
export async function performHealthCheck(dbPool: Pool): Promise<HealthCheckResult> {
  const startTime = process.hrtime();

  // Check database connectivity
  const dbCheck = await checkDatabaseConnection(dbPool);

  // Check file system access
  const fsCheck = checkFileSystemAccess();

  // Check memory usage
  const memoryCheck = checkMemoryUsage();

  // Calculate overall status
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  if (
    dbCheck.status === 'down' ||
    fsCheck.status === 'error' ||
    memoryCheck.status === 'critical'
  ) {
    overallStatus = 'unhealthy';
  } else if (dbCheck.status === 'degraded' || memoryCheck.status === 'warning') {
    overallStatus = 'degraded';
  }

  return {
    status: overallStatus,
    checks: {
      database: dbCheck,
      fileSystem: fsCheck,
      memory: memoryCheck,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Checks database connectivity
 */
async function checkDatabaseConnection(dbPool: Pool): Promise<{
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  message?: string;
}> {
  try {
    const startTime = process.hrtime();
    const client = await dbPool.connect();

    try {
      await client.query('SELECT NOW()');
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTime = seconds * 1000 + nanoseconds / 1000000; // Convert to ms

      // If query takes longer than 200ms, consider it degraded
      if (responseTime > 200) {
        return {
          status: 'degraded',
          responseTime,
          message: `Database connection slow (${responseTime.toFixed(2)}ms)`,
        };
      }

      return {
        status: 'up',
        responseTime,
      };
    } finally {
      client.release();
    }
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

/**
 * Checks file system access
 */
function checkFileSystemAccess(): {
  status: 'ok' | 'error';
  message?: string;
} {
  try {
    // Try to write a temporary file
    const testFilePath = path.join(process.cwd(), 'tmp_health_check.txt');
    fs.writeFileSync(testFilePath, 'health check test');
    fs.unlinkSync(testFilePath);

    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown file system error',
    };
  }
}

/**
 * Checks memory usage
 */
function checkMemoryUsage(): {
  status: 'ok' | 'warning' | 'critical';
  used: number;
  total: number;
  percentUsed: number;
} {
  const memoryUsage = process.memoryUsage();
  const usedHeapSize = memoryUsage.heapUsed;
  const totalHeapSize = memoryUsage.heapTotal;
  const percentUsed = (usedHeapSize / totalHeapSize) * 100;

  let status: 'ok' | 'warning' | 'critical' = 'ok';

  if (percentUsed > 90) {
    status = 'critical';
  } else if (percentUsed > 75) {
    status = 'warning';
  }

  return {
    status,
    used: usedHeapSize,
    total: totalHeapSize,
    percentUsed,
  };
}

/**
 * Recovery function to attempt restoring service when unhealthy
 */
export async function attemptServiceRecovery(dbPool: Pool): Promise<boolean> {
  console.log('Attempting service recovery...');

  // Try to restart DB connection pool
  try {
    // Use the passed pool rather than creating new one
    const client = await dbPool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('Database pool connection verified');
  } catch (error) {
    console.error('Failed to verify database pool:', error);
    return false;
  }

  // Clear memory if possible
  try {
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection completed');
    }
  } catch (error) {
    console.error('Failed to run garbage collection:', error);
  }

  return true;
}

export default {
  performHealthCheck,
  attemptServiceRecovery,
};
