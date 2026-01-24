/**
 * Performance monitoring routes for TrialSage
 * Provides database performance insights and optimization status
 */

import express from 'express';
import { dbPerformanceOptimizer } from '../utils/database-performance-optimizer';
import { createScopedLogger } from '../utils/logger';

const router = express.Router();
const logger = createScopedLogger('performance-api');

/**
 * Get database performance report
 */
router.get('/db-report', async (req, res) => {
  try {
    if (!dbPerformanceOptimizer) {
      return res.status(503).json({
        error: 'Database performance optimizer not available',
      });
    }

    const report = await dbPerformanceOptimizer.generatePerformanceReport();

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Failed to generate performance report:', error);
    res.status(500).json({
      error: 'Failed to generate performance report',
      details: error.message,
    });
  }
});

/**
 * Get index usage statistics
 */
router.get('/index-stats', async (req, res) => {
  try {
    if (!dbPerformanceOptimizer) {
      return res.status(503).json({
        error: 'Database performance optimizer not available',
      });
    }

    const indexStats = await dbPerformanceOptimizer.analyzeIndexUsage();

    res.json({
      success: true,
      data: {
        total_indexes: indexStats.length,
        indexes: indexStats.slice(0, 20), // Return top 20
      },
    });
  } catch (error) {
    logger.error('Failed to get index statistics:', error);
    res.status(500).json({
      error: 'Failed to get index statistics',
      details: error.message,
    });
  }
});

/**
 * Get slow queries
 */
router.get('/slow-queries', async (req, res) => {
  try {
    if (!dbPerformanceOptimizer) {
      return res.status(503).json({
        error: 'Database performance optimizer not available',
      });
    }

    const limit = parseInt(req.query.limit) || 10;
    const slowQueries = await dbPerformanceOptimizer.getSlowQueries(limit);

    res.json({
      success: true,
      data: {
        total_queries: slowQueries.length,
        queries: slowQueries,
      },
    });
  } catch (error) {
    logger.error('Failed to get slow queries:', error);
    res.status(500).json({
      error: 'Failed to get slow queries',
      details: error.message,
    });
  }
});

/**
 * Trigger database statistics update
 */
router.post('/update-stats', async (req, res) => {
  try {
    if (!dbPerformanceOptimizer) {
      return res.status(503).json({
        error: 'Database performance optimizer not available',
      });
    }

    await dbPerformanceOptimizer.updateTableStatistics();

    res.json({
      success: true,
      message: 'Database statistics updated successfully',
    });
  } catch (error) {
    logger.error('Failed to update database statistics:', error);
    res.status(500).json({
      error: 'Failed to update database statistics',
      details: error.message,
    });
  }
});

export default router;
