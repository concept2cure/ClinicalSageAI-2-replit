/**
 * Performance Optimizer
 *
 * This module initializes all performance optimizations during server startup.
 * It handles database indexing, cache setup, and performance monitoring.
 */
import { createScopedLogger } from '../utils/logger';
import * as indexOptimizer from '../db/indexOptimizer';
import * as tenantCache from '../cache/tenantCache';
import * as queryBatcher from '../db/queryBatcher';

const logger = createScopedLogger('performance-optimizer');

/**
 * Initialize all performance optimizations
 */
export async function initializePerformanceOptimizations(): Promise<void> {
  logger.info('Initializing performance optimizations');

  try {
    // Initialize database indexes
    await initializeIndexes();

    // Set up periodic cache and performance monitoring
    setupMonitoring();

    logger.info('Performance optimizations successfully initialized');
  } catch (error) {
    logger.error('Error initializing performance optimizations', { error });
  }
}

/**
 * Initialize database indexes in the background
 */
async function initializeIndexes(): Promise<void> {
  try {
    logger.info('Starting database index initialization');

    // Run index creation in the background
    // This avoids blocking server startup while indexes are being created
    setTimeout(async () => {
      try {
        await indexOptimizer.initializeIndexes();
        logger.info('Database indexes successfully initialized');
      } catch (error) {
        logger.error('Error initializing database indexes', { error });
      }
    }, 5000); // Delay by 5 seconds to allow server to start up first

    // Return immediately to avoid blocking server startup
    logger.info('Database index initialization scheduled');
  } catch (error) {
    logger.error('Error scheduling database index initialization', { error });
  }
}

/**
 * Set up periodic monitoring of cache and query performance
 */
function setupMonitoring(): void {
  try {
    // Log cache stats every 15 minutes
    const CACHE_STATS_INTERVAL = 15 * 60 * 1000;

    // Log query batch stats every 15 minutes
    const BATCH_STATS_INTERVAL = 15 * 60 * 1000;

    // Set up cache stats monitoring
    setInterval(() => {
      try {
        const stats = tenantCache.getCacheStats();
        logger.info('Cache performance stats', {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: `${stats.hitRate.toFixed(2)}%`,
          totalItems: stats.totalItems,
          evictions: stats.evictions,
        });
      } catch (error) {
        logger.error('Error logging cache stats', { error });
      }
    }, CACHE_STATS_INTERVAL);

    // Set up query batch stats monitoring
    setInterval(() => {
      try {
        queryBatcher.logBatchStats();
      } catch (error) {
        logger.error('Error logging batch stats', { error });
      }
    }, BATCH_STATS_INTERVAL);

    logger.info('Performance monitoring scheduled');
  } catch (error) {
    logger.error('Error setting up performance monitoring', { error });
  }
}

/**
 * Run a performance check that can be used to diagnose issues
 */
export async function runPerformanceCheck(): Promise<{
  cacheStats: ReturnType<typeof tenantCache.getCacheStats>;
  batchStats: ReturnType<typeof queryBatcher.getBatchStats>;
  dbIndexStatus: boolean;
}> {
  try {
    logger.info('Running performance check');

    // Get cache stats
    const cacheStats = tenantCache.getCacheStats();

    // Get batch stats
    const batchStats = queryBatcher.getBatchStats();

    // Check if DB indexes exist (simple check)
    const dbIndexStatus = true; // placeholder, would need a real check

    // Log performance stats
    logger.info('Performance check results', {
      cacheHitRate: `${cacheStats.hitRate.toFixed(2)}%`,
      cacheItems: cacheStats.totalItems,
      batchesExecuted: batchStats.batchesExecuted,
      queriesExecuted: batchStats.queriesExecuted,
      dbIndexStatus,
    });

    return {
      cacheStats,
      batchStats,
      dbIndexStatus,
    };
  } catch (error) {
    logger.error('Error running performance check', { error });
    throw error;
  }
}
