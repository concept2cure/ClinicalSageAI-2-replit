/**
 * Database Optimizer Module for Concept2Cure
 *
 * This module provides database optimization utilities specific to the 510(k) workflow,
 * including creating necessary indexes for performance, validating database schema,
 * and ensuring query performance.
 */

const { getPool } = require('../db');
const logger = require('./logger');

const pool = getPool();

/**
 * Create necessary indexes for 510(k) workflow tables
 *
 * @returns {Promise<boolean>} True if successful
 */
async function create510kIndexes() {
  logger.info('Initializing 510(k) database indexes');
  try {
    // Check if tables exist before creating indexes
    const tableCheckQueries = [
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'device_profiles')",
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'predicate_selections')",
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'equivalence_analyses')",
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'workflow_status')",
    ];

    const tableResults = await Promise.all(tableCheckQueries.map(query => pool.query(query)));
    const [
      deviceProfilesExists,
      predicateSelectionsExists,
      equivalenceAnalysesExists,
      workflowStatusExists,
    ] = tableResults.map(result => result.rows[0].exists);

    // Create index on device_profiles table for faster lookups (if table exists)
    if (deviceProfilesExists) {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_device_profiles_id
        ON device_profiles(id)
      `);
      logger.info('Created index on device_profiles table');
    } else {
      logger.info('Skipping device_profiles index - table does not exist');
    }

    // Create index on predicate_selections for device_id (if table and column exist)
    if (predicateSelectionsExists) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name='predicate_selections' AND column_name='device_id'
        )
      `);
      if (columnCheck.rows[0].exists) {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_predicate_selections_device_id
          ON predicate_selections(device_id)
        `);
        logger.info('Created index on predicate_selections.device_id');
      } else {
        logger.info('Skipping predicate_selections.device_id index - column does not exist');
      }
    }

    // Create index on equivalence_analyses for device_id (if table and column exist)
    if (equivalenceAnalysesExists) {
      const columnCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns
          WHERE table_name='equivalence_analyses' AND column_name='device_id'
        )
      `);
      if (columnCheck.rows[0].exists) {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_equivalence_analyses_device_id
          ON equivalence_analyses(device_id)
        `);
        logger.info('Created index on equivalence_analyses.device_id');
      } else {
        logger.info('Skipping equivalence_analyses.device_id index - column does not exist');
      }
    }

    // Create composite index for better performance on workflow status checks (if table exists)
    if (workflowStatusExists) {
      const columnsCheck = await pool.query(`
        SELECT
          EXISTS (SELECT FROM information_schema.columns WHERE table_name='workflow_status' AND column_name='device_id') as device_id_exists,
          EXISTS (SELECT FROM information_schema.columns WHERE table_name='workflow_status' AND column_name='organization_id') as org_id_exists
      `);
      if (columnsCheck.rows[0].device_id_exists && columnsCheck.rows[0].org_id_exists) {
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_workflow_status_device_org
          ON workflow_status(device_id, organization_id)
        `);
        logger.info('Created composite index on workflow_status');
      } else {
        logger.info('Skipping workflow_status composite index - required columns do not exist');
      }
    }

    logger.info('Successfully completed 510(k) database index initialization');
    return true;
  } catch (error) {
    logger.error(`Error creating 510(k) database indexes: ${error.message}`);
    return false;
  }
}

/**
 * Test 510(k) workflow database connectivity and performance
 *
 * @returns {Promise<{success: boolean, latency: number}>} Test results
 */
async function test510kDatabasePerformance() {
  logger.info('Testing 510(k) database performance');
  try {
    const startTime = Date.now();

    // Simple query to test connectivity and performance
    await pool.query('SELECT COUNT(*) FROM device_profiles');

    const endTime = Date.now();
    const latency = endTime - startTime;

    logger.info(`Database performance test completed: ${latency}ms latency`);

    return {
      success: true,
      latency,
    };
  } catch (error) {
    logger.error(`Database performance test failed: ${error.message}`);
    return {
      success: false,
      latency: -1,
      error: error.message,
    };
  }
}

/**
 * Analyze slow queries and log recommendations
 *
 * @returns {Promise<void>}
 */
async function analyzeSlowQueries() {
  try {
    logger.info('Analyzing slow queries for 510(k) module');

    // For PostgreSQL, we can query pg_stat_statements for slow query analysis
    // This assumes pg_stat_statements extension is installed

    const result = await pool.query(`
      SELECT query, calls, total_time / calls as avg_time, rows
      FROM pg_stat_statements
      WHERE query LIKE '%device_profiles%' OR query LIKE '%predicate_selections%'
        OR query LIKE '%equivalence_analyses%'
      ORDER BY total_time / calls DESC
      LIMIT 10
    `);

    if (result.rows.length > 0) {
      logger.info(`Found ${result.rows.length} slow queries to optimize`);

      // Log the slow queries with recommendations
      result.rows.forEach((row, i) => {
        logger.info(`Slow query #${i + 1}: ${row.query.substring(0, 100)}...`);
        logger.info(`  Avg time: ${row.avg_time}ms, Calls: ${row.calls}, Rows: ${row.rows}`);

        // Simple recommendation based on query patterns
        if (row.query.includes('WHERE') && !row.query.includes('INDEX')) {
          logger.info('  Recommendation: Consider adding an index for the WHERE clause conditions');
        }
      });
    } else {
      logger.info('No slow queries detected for 510(k) module tables');
    }
  } catch (error) {
    logger.error(`Error analyzing slow queries: ${error.message}`);
  }
}

// Export both as CommonJS and ESM compatible exports
module.exports = {
  create510kIndexes,
  test510kDatabasePerformance,
  analyzeSlowQueries,
};

// Also export individual functions for ESM imports
export { create510kIndexes, test510kDatabasePerformance, analyzeSlowQueries };
