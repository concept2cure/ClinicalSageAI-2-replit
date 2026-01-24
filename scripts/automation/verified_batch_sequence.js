/**
 * Verified Batch Sequence for Health Canada Trial Import
 *
 * This script sequentially imports batches of Health Canada trials
 * until the target count is reached, with improved error handling and tracking.
 */

import fs from 'fs';
import pg from 'pg';
import { execSync } from 'child_process';

// Configuration
const BATCH_SIZE = 50;
const TRACKING_FILE = 'canada_batch_sequence_progress.json';
const TARGET_COUNT = 4000;
const MAX_BATCHES_PER_RUN = 10;

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Error handling for database connection
pool.on('error', err => {
  console.error('Unexpected database error:', err);
});

/**
 * Get tracking data from file
 */
function getTrackingData() {
  let trackingData = {
    lastBatchIndex: 0,
    batchesCompleted: 0,
    trialsImported: 0,
    batches: [],
  };

  if (fs.existsSync(TRACKING_FILE)) {
    try {
      trackingData = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));

      // Validate and repair tracking data if needed
      if (!trackingData.batches) {
        trackingData.batches = [];
      }

      if (typeof trackingData.trialsImported !== 'number') {
        trackingData.trialsImported = 0;
      }

      if (typeof trackingData.batchesCompleted !== 'number') {
        trackingData.batchesCompleted = 0;
      }

      if (typeof trackingData.lastBatchIndex !== 'number') {
        trackingData.lastBatchIndex = 0;
      }
    } catch (error) {
      console.error('Error reading tracking file:', error);
    }
  }

  return trackingData;
}

/**
 * Save tracking data to file
 */
function saveTrackingData(data) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get current Health Canada trial count from database
 */
async function getHealthCanadaCount() {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'HC%'");
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Error getting Health Canada trial count:', error);
    return 0;
  }
}

/**
 * Run a single batch import
 */
async function runBatch(batchIndex) {
  console.log(`\n=== Running batch at index ${batchIndex} ===`);

  try {
    // Run the verified batch import script as a separate process
    execSync(`node verified_canada_batch_import.js ${batchIndex}`, {
      stdio: 'inherit',
    });

    // Update tracking data
    const trackingData = getTrackingData();
    const currentCount = await getHealthCanadaCount();

    // Calculate how many trials were imported in this batch
    const previousCount = trackingData.trialsImported || 0;
    const importedInThisBatch = Math.max(0, currentCount - previousCount);

    // Update tracking
    trackingData.lastBatchIndex = batchIndex;
    trackingData.batchesCompleted++;
    trackingData.trialsImported = currentCount;
    saveTrackingData(trackingData);

    console.log(`Batch ${batchIndex} completed. Imported ${importedInThisBatch} trials.`);
    console.log(
      `Progress: ${currentCount}/${TARGET_COUNT} trials (${Math.round((currentCount / TARGET_COUNT) * 100)}%)`
    );

    return {
      success: true,
      trialsImported: importedInThisBatch,
    };
  } catch (error) {
    console.error('Error running batch:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Run multiple batches sequentially
 */
async function runMultipleBatches(startIndex, count) {
  console.log(`\n=== Running ${count} batches starting at index ${startIndex} ===`);

  let successfulBatches = 0;
  let totalImported = 0;

  for (let i = 0; i < count; i++) {
    const currentBatchIndex = startIndex + i;
    console.log(`\n--- Starting batch ${i + 1}/${count} (index: ${currentBatchIndex}) ---`);

    const result = await runBatch(currentBatchIndex);

    if (result.success) {
      successfulBatches++;
      totalImported += result.trialsImported;
    }

    // Check if we've reached the target
    const currentCount = await getHealthCanadaCount();
    if (currentCount >= TARGET_COUNT) {
      console.log(`\n=== Target Reached! ===`);
      break;
    }
  }

  console.log(`\n=== Batch Run Summary ===`);
  console.log(`Batches attempted: ${count}`);
  console.log(`Successful batches: ${successfulBatches}`);
  console.log(`Total trials imported in this run: ${totalImported}`);
}

/**
 * Main function to run the import process
 */
async function main() {
  console.log('=== Verified Health Canada Trial Import Sequence ===');
  console.log('Starting at:', new Date().toISOString());

  try {
    // Get current count and tracking data
    const currentCount = await getHealthCanadaCount();
    const trackingData = getTrackingData();

    console.log(`Current status:`);
    console.log(`- Health Canada trials in database: ${currentCount}`);
    console.log(`- Target count: ${TARGET_COUNT}`);
    console.log(`- Progress: ${Math.round((currentCount / TARGET_COUNT) * 100)}%`);
    console.log(`- Last batch index: ${trackingData.lastBatchIndex}`);
    console.log(`- Batches completed: ${trackingData.batchesCompleted}`);

    // Check if we've already reached the target
    if (currentCount >= TARGET_COUNT) {
      console.log(`\n=== Target Already Reached! ===`);
      console.log(`Target of ${TARGET_COUNT} Health Canada trials has been reached.`);
      console.log(`Current count: ${currentCount} trials`);
      await pool.end();
      return;
    }

    // Calculate how many batches to run
    const remaining = TARGET_COUNT - currentCount;
    const estimatedBatchesNeeded = Math.ceil(remaining / BATCH_SIZE);
    const batchesToRun = Math.min(estimatedBatchesNeeded, MAX_BATCHES_PER_RUN);

    console.log(
      `\nPlanning to run ${batchesToRun} batches to import approximately ${batchesToRun * BATCH_SIZE} trials`
    );
    console.log(`Starting from batch index ${trackingData.lastBatchIndex + 1}`);

    // Run the batches
    await runMultipleBatches(trackingData.lastBatchIndex + 1, batchesToRun);

    // Get final count
    const finalCount = await getHealthCanadaCount();
    console.log(`\n=== Final Status ===`);
    console.log(`Health Canada trials in database: ${finalCount}`);
    console.log(`Target: ${TARGET_COUNT}`);
    console.log(`Progress: ${Math.round((finalCount / TARGET_COUNT) * 100)}%`);

    if (finalCount >= TARGET_COUNT) {
      console.log(`\n=== Target Reached! ===`);
    } else {
      console.log(`\n=== Progress Made ===`);
      console.log(`Imported ${finalCount - currentCount} new trials in this run.`);
      console.log(`Run the script again to continue importing.`);
    }
  } catch (error) {
    console.error('Error during trial import sequence:', error);
  } finally {
    await pool.end();
  }

  console.log('Process completed at:', new Date().toISOString());
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
