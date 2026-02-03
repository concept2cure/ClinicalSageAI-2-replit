/**
 * Performance Test Harness
 *
 * This module runs tests to validate the effectiveness of our performance optimizations.
 * It tests database indexing, caching, and query batching under controlled conditions.
 */
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger';
import * as tenantCache from '../cache/tenantCache';
import * as queryBatcher from '../db/queryBatcher';
import * as indexOptimizer from '../db/indexOptimizer';

const logger = createScopedLogger('performance-test');

// Test configuration
const TEST_TENANT_ID = 999999; // Use a high ID that won't conflict with real data
const TEST_ITERATIONS = 100;
const TEST_BATCH_SIZE = 10;

// Test stats
interface TestStats {
  description: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  errorsCount: number;
}

/**
 * Format test results as a table for readable output
 */
function formatTestResults(results: TestStats[]): string {
  const headers = [
    'Test',
    'Iterations',
    'Total (ms)',
    'Avg (ms)',
    'Min (ms)',
    'Max (ms)',
    'Errors',
  ];

  // Calculate column widths
  const colWidths = headers.map((header, index) => {
    const dataWidths = results.map(result => {
      switch (index) {
        case 0:
          return result.description.length;
        case 1:
          return String(result.iterations).length;
        case 2:
          return String(Math.round(result.totalTimeMs)).length;
        case 3:
          return String(result.avgTimeMs.toFixed(2)).length;
        case 4:
          return String(result.minTimeMs.toFixed(2)).length;
        case 5:
          return String(result.maxTimeMs.toFixed(2)).length;
        case 6:
          return String(result.errorsCount).length;
        default:
          return 0;
      }
    });

    // Get max width including header
    return Math.max(header.length, ...dataWidths) + 2;
  });

  // Create divider line
  const divider = colWidths.map(width => '-'.repeat(width)).join('+');

  // Format headers
  const headerRow = headers.map((header, i) => header.padEnd(colWidths[i])).join('|');

  // Format data rows
  const dataRows = results.map(result => {
    return [
      result.description.padEnd(colWidths[0]),
      String(result.iterations).padEnd(colWidths[1]),
      Math.round(result.totalTimeMs).toString().padEnd(colWidths[2]),
      result.avgTimeMs.toFixed(2).padEnd(colWidths[3]),
      result.minTimeMs.toFixed(2).padEnd(colWidths[4]),
      result.maxTimeMs.toFixed(2).padEnd(colWidths[5]),
      String(result.errorsCount).padEnd(colWidths[6]),
    ].join('|');
  });

  // Combine all parts
  return [divider, headerRow, divider, ...dataRows, divider].join('\n');
}

/**
 * Run a performance test with timing
 */
async function runTest(
  description: string,
  testFn: () => Promise<void>,
  iterations: number
): Promise<TestStats> {
  const stats: TestStats = {
    description,
    iterations,
    totalTimeMs: 0,
    avgTimeMs: 0,
    minTimeMs: Infinity,
    maxTimeMs: 0,
    errorsCount: 0,
  };

  const timings: number[] = [];

  logger.info(`Starting test: ${description} (${iterations} iterations)`);

  for (let i = 0; i < iterations; i++) {
    try {
      const startTime = Date.now();
      await testFn();
      const endTime = Date.now();

      const duration = endTime - startTime;
      timings.push(duration);

      // Update stats
      stats.minTimeMs = Math.min(stats.minTimeMs, duration);
      stats.maxTimeMs = Math.max(stats.maxTimeMs, duration);

      // Log progress periodically
      if ((i + 1) % 10 === 0 || i === iterations - 1) {
        logger.debug(`Test progress: ${i + 1}/${iterations} iterations complete`);
      }
    } catch (error) {
      stats.errorsCount++;
      logger.error(`Error in test iteration ${i + 1}`, { error });
    }
  }

  // Calculate aggregate stats
  stats.totalTimeMs = timings.reduce((sum, time) => sum + time, 0);
  stats.avgTimeMs = stats.totalTimeMs / (iterations - stats.errorsCount);

  // Fix minTimeMs if no successful iterations
  if (stats.minTimeMs === Infinity) {
    stats.minTimeMs = 0;
  }

  logger.info(`Test completed: ${description}`, {
    iterations: stats.iterations,
    totalTimeMs: stats.totalTimeMs,
    avgTimeMs: stats.avgTimeMs,
    minTimeMs: stats.minTimeMs,
    maxTimeMs: stats.maxTimeMs,
    errors: stats.errorsCount,
  });

  return stats;
}

/**
 * Clean up any test data created during testing
 */
async function cleanupTestData(): Promise<void> {
  logger.info('Cleaning up test data');

  try {
    // Remove tenant cache data
    tenantCache.invalidateTenantCache(TEST_TENANT_ID);

    // Clean up any test records
    if (db) {
      await db.execute(sql`
        DELETE FROM ctq_factors WHERE organization_id = ${TEST_TENANT_ID};
      `);
    }
  } catch (error) {
    logger.error('Error cleaning up test data', { error });
  }
}

/**
 * Test database performance with and without indexes
 */
async function testDatabaseIndexing(): Promise<TestStats[]> {
  const results: TestStats[] = [];

  // Create a test query that would benefit from indexing
  const queryWithoutIndex = async () => {
    if (!db) {
      throw new Error('Database connection not available');
    }

    await db.execute(sql`
      SELECT * FROM ctq_factors
      WHERE organization_id = ${TEST_TENANT_ID}
      AND section_code = 'test-section'
      AND risk_level = 'high'
      LIMIT 1;
    `);
  };

  // Test without indexes first
  results.push(await runTest('Query without index', queryWithoutIndex, TEST_ITERATIONS));

  // Create indexes
  await indexOptimizer.createTenantIndexes();
  await indexOptimizer.createColumnIndexes();
  await indexOptimizer.createCompositeIndexes();

  // Test with indexes
  results.push(await runTest('Query with index', queryWithoutIndex, TEST_ITERATIONS));

  return results;
}

/**
 * Test caching performance
 */
async function testCaching(): Promise<TestStats[]> {
  const results: TestStats[] = [];

  const entityType = 'ctq-factors';
  const entityId = 'test-collection';
  const testData = {
    factors: Array(100)
      .fill(0)
      .map((_, i) => ({ id: i, name: `Test Factor ${i}` })),
  };

  // Test without cache
  results.push(
    await runTest(
      'Data retrieval without cache',
      async () => {
        // Intentionally invalidate for each test to ensure cache miss
        tenantCache.invalidateCache(TEST_TENANT_ID, entityType, entityId);

        // Get data (should be cache miss)
        const data = tenantCache.getFromCache(TEST_TENANT_ID, entityType, entityId);

        // If cache miss, store in cache (simulating database retrieval)
        if (data === null) {
          // Simulate database call with a delay
          await new Promise(resolve => setTimeout(resolve, 5));
          tenantCache.storeInCache(TEST_TENANT_ID, entityType, entityId, testData);
        }
      },
      TEST_ITERATIONS
    )
  );

  // Store test data in cache once
  tenantCache.storeInCache(TEST_TENANT_ID, entityType, entityId, testData);

  // Test with cache
  results.push(
    await runTest(
      'Data retrieval with cache',
      async () => {
        // Get data (should be cache hit)
        const data = tenantCache.getFromCache(TEST_TENANT_ID, entityType, entityId);

        // If cache miss (which shouldn't happen), store in cache
        if (data === null) {
          // Simulate database call with a delay
          await new Promise(resolve => setTimeout(resolve, 5));
          tenantCache.storeInCache(TEST_TENANT_ID, entityType, entityId, testData);
        }
      },
      TEST_ITERATIONS
    )
  );

  return results;
}

/**
 * Test query batching performance
 */
async function testQueryBatching(): Promise<TestStats[]> {
  const results: TestStats[] = [];

  // Create a simple test query
  const sampleQuery = sql`SELECT 1`;

  // Test without batching (individual queries)
  results.push(
    await runTest(
      'Individual queries',
      async () => {
        if (!db) {
          throw new Error('Database connection not available');
        }

        for (let i = 0; i < TEST_BATCH_SIZE; i++) {
          await db.execute(sampleQuery);
        }
      },
      TEST_ITERATIONS / TEST_BATCH_SIZE // Fewer iterations due to more queries per iteration
    )
  );

  // Test with batching
  results.push(
    await runTest(
      'Batched queries',
      async () => {
        if (!db) {
          throw new Error('Database connection not available');
        }
        const queryPromises = [];

        for (let i = 0; i < TEST_BATCH_SIZE; i++) {
          queryPromises.push(queryBatcher.batchQuery(db, 'SELECT 1'));
        }

        // Wait for all batched queries to complete
        await Promise.all(queryPromises);
      },
      TEST_ITERATIONS / TEST_BATCH_SIZE // Fewer iterations due to more queries per iteration
    )
  );

  return results;
}

/**
 * Run all performance tests
 */
export async function runPerformanceTests(): Promise<void> {
  try {
    logger.info('Starting performance tests');

    const allResults: TestStats[] = [];

    // Run all test suites
    allResults.push(...(await testDatabaseIndexing()));
    allResults.push(...(await testCaching()));
    allResults.push(...(await testQueryBatching()));

    // Log formatted results
    logger.info('Performance test results:\n' + formatTestResults(allResults));

    // Clean up test data
    await cleanupTestData();

    logger.info('Performance tests completed successfully');
  } catch (error) {
    logger.error('Error running performance tests', { error });
  }
}

// If this file is run directly, execute the tests
if (require.main === module) {
  runPerformanceTests().catch(error => {
    console.error('Unhandled error in performance tests:', error);
    process.exit(1);
  });
}
