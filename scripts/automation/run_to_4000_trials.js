/**
 * Run To 4000 Trials Script for TrialSage
 *
 * This script runs multiple batches of 50 trials each until the
 * Health Canada trial count reaches 4000.
 */

import { run50TrialBatch } from './import_50_trial_batch.js';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Pool } = pg;

// Initialize dotenv
dotenv.config();

// Get directory name for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Health Canada region identifier
const HC_REGION = 'Health Canada';

// Configuration
const TARGET_COUNT = 4000;
const MAX_BATCH_RUNS = 100; // Safety limit to prevent infinite loops
const BATCH_INTERVAL_MS = 5000; // 5 seconds between batches

/**
 * Get current Health Canada trial count
 */
async function getHealthCanadaCount() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query('SELECT COUNT(*) FROM csr_reports WHERE region = $1', [
      HC_REGION,
    ]);
    return parseInt(result.rows[0].count);
  } finally {
    await pool.end();
  }
}

/**
 * Run batches until we hit the target count
 */
async function runUntilTarget() {
  console.log(
    `Starting multiple batch import process to reach ${TARGET_COUNT} Health Canada trials`
  );

  // Get initial count
  let currentCount = await getHealthCanadaCount();
  console.log(
    `Starting with ${currentCount} Health Canada trials out of ${TARGET_COUNT} target (${((currentCount / TARGET_COUNT) * 100).toFixed(2)}%)`
  );

  let batchesRun = 0;
  let totalImported = 0;

  while (currentCount < TARGET_COUNT && batchesRun < MAX_BATCH_RUNS) {
    // Log batch progress
    batchesRun++;
    console.log(`\n===== Running batch ${batchesRun} =====`);
    console.log(
      `Current progress: ${currentCount}/${TARGET_COUNT} (${((currentCount / TARGET_COUNT) * 100).toFixed(2)}%)`
    );
    console.log(`Remaining: ${TARGET_COUNT - currentCount} trials\n`);

    // Run a single batch
    const result = await run50TrialBatch();

    if (result.success) {
      totalImported += result.importedCount;
      currentCount = result.healthCanadaTrials;

      console.log(`\nBatch ${batchesRun} complete: Imported ${result.importedCount} trials`);
      console.log(
        `New total: ${currentCount}/${TARGET_COUNT} (${((currentCount / TARGET_COUNT) * 100).toFixed(2)}%)`
      );
    } else {
      console.error(`Batch ${batchesRun} failed:`, result.error);
      console.log('Waiting before retry...');
    }

    // Wait between batches to avoid database contention
    if (currentCount < TARGET_COUNT) {
      await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL_MS));
    }
  }

  if (currentCount >= TARGET_COUNT) {
    console.log(`\n✅ SUCCESS: Target of ${TARGET_COUNT} Health Canada trials reached!`);
    console.log(`Final count: ${currentCount} trials`);
    console.log(`Total batches run: ${batchesRun}`);
    console.log(`Total trials imported: ${totalImported}`);
  } else {
    console.log(`\n⚠️ Maximum batch limit (${MAX_BATCH_RUNS}) reached before target.`);
    console.log(
      `Current count: ${currentCount}/${TARGET_COUNT} (${((currentCount / TARGET_COUNT) * 100).toFixed(2)}%)`
    );
    console.log(`Total batches run: ${batchesRun}`);
    console.log(`Total trials imported: ${totalImported}`);
    console.log(`Remaining: ${TARGET_COUNT - currentCount} trials`);
  }
}

// Execute if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runUntilTarget().catch(err => {
    console.error('Unhandled error in batch import process:', err);
    process.exit(1);
  });
}

// Export the function
export { runUntilTarget };
