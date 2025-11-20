/**
 * Query Batcher Service
 *
 * Batches database queries to reduce connection overhead and
 * improve performance for high-volume operations.
 */

import { performance } from 'perf_hooks';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('query-batcher');

// Configuration
const BATCH_CONFIG = {
  maxBatchSize: 100,
  maxWaitTime: 50, // ms
  enableBatching: true,
  minBatchSize: 5,
};

// Statistics for monitoring
const stats = {
  batchesExecuted: 0,
  queriesExecuted: 0,
  queriesBatched: 0,
  avgBatchSize: 0,
  totalBatchTime: 0,
  peakBatchSize: 0,
  lastResetTime: Date.now(),
};

// Current batch
let currentBatch: any[] = [];
let batchTimer: NodeJS.Timeout | null = null;

/**
 * Add a query to the current batch
 * @param db - Database connection
 * @param query - SQL query
 * @param params - Query parameters
 * @returns Promise that resolves with query result
 */
export function batchQuery(db: any, query: string, params: any[] = []) {
  if (!BATCH_CONFIG.enableBatching || !db) {
    // Execute directly if batching is disabled
    return executeQuery(db, query, params);
  }

  return new Promise((resolve, reject) => {
    currentBatch.push({
      query,
      params,
      resolve,
      reject,
      timestamp: performance.now(),
    });

    // If we've reached max batch size, execute immediately
    if (currentBatch.length >= BATCH_CONFIG.maxBatchSize) {
      if (batchTimer) {
        clearTimeout(batchTimer);
        batchTimer = null;
      }
      executeBatch(db);
    } else if (!batchTimer) {
      // Start a timer to execute the batch after maxWaitTime
      batchTimer = setTimeout(() => {
        batchTimer = null;
        if (currentBatch.length >= BATCH_CONFIG.minBatchSize) {
          executeBatch(db);
        } else {
          // Execute queries individually if batch is too small
          executeQueriesIndividually(db);
        }
      }, BATCH_CONFIG.maxWaitTime);
    }
  });
}

/**
 * Execute a batch of queries in a transaction
 * @param db - Database connection
 */
async function executeBatch(db: any) {
  if (currentBatch.length === 0) return;

  const batchToExecute = [...currentBatch];
  currentBatch = [];

  const batchSize = batchToExecute.length;
  const startTime = performance.now();

  try {
    // Start transaction
    await db.query('BEGIN');

    // Execute all queries in the batch
    for (const item of batchToExecute) {
      try {
        const result = await db.query(item.query, item.params);
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
    }

    // Commit transaction
    await db.query('COMMIT');

    // Update stats
    const elapsedTime = performance.now() - startTime;
    stats.batchesExecuted++;
    stats.queriesExecuted += batchSize;
    stats.queriesBatched += batchSize;
    stats.totalBatchTime += elapsedTime;
    stats.avgBatchSize = stats.queriesBatched / stats.batchesExecuted;
    stats.peakBatchSize = Math.max(stats.peakBatchSize, batchSize);

    logger.debug(`Executed batch of ${batchSize} queries in ${elapsedTime.toFixed(2)}ms`);
  } catch (error) {
    logger.error('Error executing query batch', { error });

    // Rollback transaction
    try {
      await db.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Error rolling back transaction', { error: rollbackError });
    }

    // Reject all promises in the batch
    for (const item of batchToExecute) {
      item.reject(error);
    }
  }
}

/**
 * Execute queries individually for small batches
 * @param db - Database connection
 */
async function executeQueriesIndividually(db: any) {
  if (currentBatch.length === 0) return;

  const batchToExecute = [...currentBatch];
  currentBatch = [];

  for (const item of batchToExecute) {
    try {
      const result = await executeQuery(db, item.query, item.params);
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    }
  }

  // Update stats
  stats.queriesExecuted += batchToExecute.length;
}

/**
 * Execute a single query
 * @param db - Database connection
 * @param query - SQL query
 * @param params - Query parameters
 * @returns Query result
 */
async function executeQuery(db: any, query: string, params: any[] = []) {
  try {
    stats.queriesExecuted++;
    return await db.query(query, params);
  } catch (error) {
    logger.error('Error executing query', { error, query });
    throw error;
  }
}

/**
 * Log batch statistics
 */
export function logBatchStats() {
  const now = Date.now();
  const elapsedSeconds = (now - stats.lastResetTime) / 1000;

  logger.info('Query batcher stats', {
    batchesExecuted: stats.batchesExecuted,
    queriesExecuted: stats.queriesExecuted,
    avgBatchSize: stats.avgBatchSize.toFixed(2),
    queriesPerSecond: (stats.queriesExecuted / elapsedSeconds).toFixed(2),
    avgBatchTimeMs:
      stats.batchesExecuted > 0 ? (stats.totalBatchTime / stats.batchesExecuted).toFixed(2) : 0,
    peakBatchSize: stats.peakBatchSize,
  });
}

/**
 * Get batch statistics
 */
export function getBatchStats() {
  return { ...stats };
}

/**
 * Reset batch statistics
 */
export function resetBatchStats() {
  stats.batchesExecuted = 0;
  stats.queriesExecuted = 0;
  stats.queriesBatched = 0;
  stats.avgBatchSize = 0;
  stats.totalBatchTime = 0;
  stats.peakBatchSize = 0;
  stats.lastResetTime = Date.now();
}

/**
 * Configure batch settings
 * @param config - Batch configuration
 */
export function configureBatcher(config: Partial<typeof BATCH_CONFIG>) {
  Object.assign(BATCH_CONFIG, config);
  logger.info('Query batcher configured', { config: BATCH_CONFIG });
}
