/**
 * Continuous Trial Import Service
 *
 * This script runs a continuous batch import process in the background,
 * allowing development work to proceed on core features while trials
 * are being imported to reach the target count.
 *
 * Features:
 * - Runs batch imports at specified intervals
 * - Self-monitors progress towards the 4,000 target
 * - Low resource consumption to avoid interfering with development
 * - Automatically stops when target is reached
 * - Detailed logging for diagnostic purposes
 */

import fs from 'fs';
import pg from 'pg';
import { execSync } from 'child_process';
import { setTimeout } from 'timers/promises';

// Configuration
const TARGET_COUNT = 4000;
const BATCH_SIZE = 50;
const BATCHES_PER_RUN = 3;
const INTERVAL_MINUTES = 10;
const TRACKING_FILE = 'continuous_import_tracking.json';
const LOG_FILE = 'continuous_import_log.txt';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/**
 * Write a log message to console and log file
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp} - ${message}`;
  console.log(logEntry);

  // Append to log file
  fs.appendFileSync(LOG_FILE, logEntry + '\n');
}

/**
 * Get tracking data from file
 */
function getTrackingData() {
  let trackingData = {
    lastBatchIndex: 0,
    batchesCompleted: 0,
    trialsImported: 0,
    lastRunTime: null,
    runs: [],
  };

  if (fs.existsSync(TRACKING_FILE)) {
    try {
      trackingData = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
    } catch (error) {
      log(`Error reading tracking file: ${error.message}`);
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
    log(`Error getting Health Canada trial count: ${error.message}`);
    return 0;
  }
}

/**
 * Get total trial count from database
 */
async function getTotalTrialCount() {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM csr_reports');
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    log(`Error getting total trial count: ${error.message}`);
    return 0;
  }
}

/**
 * Run a single batch import
 */
async function runBatch(batchIndex) {
  log(`Running batch at index ${batchIndex}`);

  try {
    // Run the verified batch import script
    execSync(`node verified_canada_batch_import.js ${batchIndex}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    log(`Completed batch ${batchIndex}`);
    return true;
  } catch (error) {
    log(`Error running batch ${batchIndex}: ${error.message}`);
    return false;
  }
}

/**
 * Run multiple batches sequentially
 */
async function runBatches(startIndex, count) {
  log(`Running ${count} batches starting at index ${startIndex}`);

  let successfulBatches = 0;
  let tracking = getTrackingData();

  for (let i = 0; i < count; i++) {
    const currentBatchIndex = startIndex + i;

    // Check if we've already reached the target
    const currentCount = await getHealthCanadaCount();
    if (currentCount >= TARGET_COUNT) {
      log(`Target of ${TARGET_COUNT} trials already reached. Stopping.`);
      break;
    }

    // Run the batch
    const success = await runBatch(currentBatchIndex);

    if (success) {
      successfulBatches++;
      tracking.lastBatchIndex = currentBatchIndex;
      tracking.batchesCompleted++;
      saveTrackingData(tracking);
    }

    // Pause briefly between batches to reduce load
    await setTimeout(2000);
  }

  // Update tracking with the final count
  const finalCount = await getHealthCanadaCount();
  tracking.trialsImported = finalCount;
  tracking.lastRunTime = new Date().toISOString();
  tracking.runs.push({
    timestamp: new Date().toISOString(),
    batchesAttempted: count,
    batchesSuccessful: successfulBatches,
    trialCount: finalCount,
    progress: Math.round((finalCount / TARGET_COUNT) * 100),
  });
  saveTrackingData(tracking);

  log(`Completed ${successfulBatches}/${count} batches. Current count: ${finalCount}`);
  return successfulBatches;
}

/**
 * Main function to run the continuous import process
 */
async function runContinuousImport() {
  log('Starting continuous import service');

  try {
    while (true) {
      // Check current counts
      const currentCount = await getHealthCanadaCount();
      const totalCount = await getTotalTrialCount();

      log(
        `Current status: ${currentCount}/${TARGET_COUNT} Health Canada trials (${Math.round((currentCount / TARGET_COUNT) * 100)}%)`
      );
      log(`Total trials in database: ${totalCount}`);

      // Check if target already reached
      if (currentCount >= TARGET_COUNT) {
        log(`Target of ${TARGET_COUNT} trials reached! Continuous import complete.`);
        break;
      }

      // Get tracking data
      const tracking = getTrackingData();
      const nextBatchIndex = tracking.lastBatchIndex + 1;

      // Run a set of batches
      await runBatches(nextBatchIndex, BATCHES_PER_RUN);

      // Wait for the interval before next run
      log(`Waiting ${INTERVAL_MINUTES} minutes before next run...`);
      await setTimeout(INTERVAL_MINUTES * 60 * 1000);
    }
  } catch (error) {
    log(`Fatal error in continuous import: ${error.message}`);
  } finally {
    await pool.end();
    log('Continuous import service stopped');
  }
}

// Run the continuous import process
log('=== Continuous Trial Import Service ===');
runContinuousImport().catch(error => {
  log(`Unhandled error: ${error.message}`);
  pool.end();
});
