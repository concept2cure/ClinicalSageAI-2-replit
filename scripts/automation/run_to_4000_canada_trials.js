/**
 * Run to 4000 Health Canada Trials Script
 *
 * This script will continue importing Health Canada trials until we reach 4000.
 * It tracks progress across runs and can be executed multiple times to resume from where it left off.
 */

// ES Module imports
import fs from 'fs';
import { execSync } from 'child_process';
import pg from 'pg';

// Configuration
const TRACKING_FILE = 'canada_500_import_progress.json';
const TARGET_COUNT = 4000;
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_RUN = 5; // Limit number of batches per run to avoid timeouts

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Get tracking data from file or initialize with defaults
 */
function getTrackingData() {
  if (fs.existsSync(TRACKING_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
    } catch (error) {
      logger.error('Error reading tracking file:', error.message);
    }
  }

  // Default tracking data
  return {
    nextId: 1,
    batchesCompleted: 0,
    trialsImported: 0,
    importedIds: [],
    lastBatchIndex: 0,
  };
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
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT COUNT(*) FROM csr_reports WHERE region = 'Health Canada'"
    );
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Error getting count:', error.message);
    return 0;
  } finally {
    client.release();
  }
}

/**
 * Run a single batch import
 */
async function runBatch(batchIndex) {
  logger.info(`\n=== Running batch at index ${batchIndex} ===`);

  try {
    // Run the import script
    execSync(`node import_single_canada_batch.js ${batchIndex} ${BATCH_SIZE}`, {
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

    logger.info(`Batch ${batchIndex} completed. Imported ${importedInThisBatch} trials.`);
    logger.info(
      `Progress: ${currentCount}/${TARGET_COUNT} trials (${Math.round((currentCount / TARGET_COUNT) * 100)}%)`
    );

    return {
      success: true,
      trialsImported: importedInThisBatch,
    };
  } catch (error) {
    logger.error('Error running batch:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Run multiple batches to import more trials
 */
async function runMultipleBatches(startIndex, count) {
  logger.info(`\n=== Running ${count} batches starting at index ${startIndex} ===`);

  let successfulBatches = 0;
  let totalImported = 0;

  for (let i = 0; i < count; i++) {
    const currentBatchIndex = startIndex + i;
    logger.info(`\n--- Starting batch ${i + 1}/${count} (index: ${currentBatchIndex}) ---`);

    const result = await runBatch(currentBatchIndex);

    if (result.success) {
      successfulBatches++;
      totalImported += result.trialsImported;
    }

    // Check if we've reached the target
    const currentCount = await getHealthCanadaCount();
    if (currentCount >= TARGET_COUNT) {
      logger.info(`\n=== Target Reached! ===`);
      break;
    }
  }

  logger.info(`\n=== Batch Run Summary ===`);
  logger.info(`Batches attempted: ${count}`);
  logger.info(`Successful batches: ${successfulBatches}`);
  logger.info(`Total trials imported in this run: ${totalImported}`);
}

/**
 * Main function to run the import process
 */
async function main() {
  logger.info('=== Health Canada Trial Import to 4000 ===');
  logger.info('Starting at:', new Date().toISOString());

  try {
    // Get current count and tracking data
    const currentCount = await getHealthCanadaCount();
    const trackingData = getTrackingData();

    logger.info(`Current status:`);
    logger.info(`- Health Canada trials in database: ${currentCount}`);
    logger.info(`- Target count: ${TARGET_COUNT}`);
    logger.info(`- Progress: ${Math.round((currentCount / TARGET_COUNT) * 100)}%`);
    logger.info(`- Last batch index: ${trackingData.lastBatchIndex}`);
    logger.info(`- Batches completed: ${trackingData.batchesCompleted}`);

    // Check if we've already reached the target
    if (currentCount >= TARGET_COUNT) {
      logger.info(`\n=== Target Already Reached! ===`);
      logger.info(`Target of ${TARGET_COUNT} Health Canada trials has been reached.`);
      logger.info(`Current count: ${currentCount} trials`);
      await pool.end();
      return;
    }

    // Calculate how many batches to run
    const remaining = TARGET_COUNT - currentCount;
    const estimatedBatchesNeeded = Math.ceil(remaining / BATCH_SIZE);
    const batchesToRun = Math.min(estimatedBatchesNeeded, MAX_BATCHES_PER_RUN);

    logger.info(
      `\nPlanning to run ${batchesToRun} batches to import approximately ${batchesToRun * BATCH_SIZE} trials`
    );
    logger.info(`Starting from batch index ${trackingData.lastBatchIndex + 1}`);

    // Run the batches
    await runMultipleBatches(trackingData.lastBatchIndex + 1, batchesToRun);

    // Get final count
    const finalCount = await getHealthCanadaCount();
    logger.info(`\n=== Final Status ===`);
    logger.info(`Health Canada trials in database: ${finalCount}`);
    logger.info(`Target: ${TARGET_COUNT}`);
    logger.info(`Progress: ${Math.round((finalCount / TARGET_COUNT) * 100)}%`);

    if (finalCount >= TARGET_COUNT) {
      logger.info(`\n=== Target Reached! ===`);
    } else {
      logger.info(`\n=== Progress Made ===`);
      logger.info(`Imported ${finalCount - currentCount} new trials in this run.`);
      logger.info(`Run the script again to continue importing.`);
    }
  } catch (error) {
    logger.error('Error during trial import:', error);
  } finally {
    await pool.end();
  }

  logger.info('Process completed at:', new Date().toISOString());
}

// Run the main function
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
