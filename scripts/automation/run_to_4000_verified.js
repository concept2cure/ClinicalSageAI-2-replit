/**
 * Run To 4000 Verified Trials
 *
 * This script automates the process of running multiple batch sequences
 * until we reach the target of 4000 Health Canada trials.
 */

import pg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';

// Configuration
const TARGET_COUNT = 4000;
const MAX_RUNS = 10;
const TRACKING_FILE = 'canada_batch_sequence_progress.json';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/**
 * Get current Health Canada trial count from database
 */
async function getHealthCanadaCount() {
  try {
    const result = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'HC%'");
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error('Error getting Health Canada trial count:', error);
    return 0;
  }
}

/**
 * Get tracking data from file
 */
function getTrackingData() {
  let trackingData = {
    lastBatchIndex: 0,
    batchesCompleted: 0,
    trialsImported: 0,
    runs: [],
  };

  if (fs.existsSync(TRACKING_FILE)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      trackingData = {
        ...trackingData,
        ...fileData,
      };

      // Ensure the runs array exists
      if (!trackingData.runs) {
        trackingData.runs = [];
      }
    } catch (error) {
      logger.error('Error reading tracking file:', error);
    }
  }

  return trackingData;
}

/**
 * Save tracking data to file
 */
function saveTrackingData(data) {
  fs.writeFileSync('run_to_4000_tracking.json', JSON.stringify(data, null, 2));
}

/**
 * Run the main import process
 */
async function main() {
  logger.info('=== Run To 4000 Verified Health Canada Trials ===');
  logger.info('Starting at:', new Date().toISOString());

  try {
    // Get initial count
    const initialCount = await getHealthCanadaCount();
    logger.info(`Starting with ${initialCount} Health Canada trials`);
    logger.info(`Target: ${TARGET_COUNT} trials`);

    if (initialCount >= TARGET_COUNT) {
      logger.info(`Target already reached! Current count: ${initialCount}`);
      return;
    }

    // Initialize tracking
    const trackingData = getTrackingData();
    trackingData.runs.push({
      startTime: new Date().toISOString(),
      startCount: initialCount,
    });
    saveTrackingData(trackingData);

    // Run batch sequences until we reach the target
    let currentCount = initialCount;
    let runCount = 0;

    while (currentCount < TARGET_COUNT && runCount < MAX_RUNS) {
      logger.info(`\n=== Starting batch sequence run ${runCount + 1} ===`);

      // Run the batch sequence script
      try {
        execSync('node verified_batch_sequence.js', {
          stdio: 'inherit',
          timeout: 1800000, // 30 minutes timeout
        });
      } catch (error) {
        logger.error('Batch sequence run timed out or failed:', error.message);
      }

      // Get updated count
      const newCount = await getHealthCanadaCount();
      logger.info(`\nAfter run ${runCount + 1}:`);
      logger.info(`- Previous count: ${currentCount}`);
      logger.info(`- Current count: ${newCount}`);
      logger.info(`- Progress: ${Math.round((newCount / TARGET_COUNT) * 100)}%`);

      // Update tracking
      trackingData.runs[trackingData.runs.length - 1].runNumber = runCount + 1;
      trackingData.runs[trackingData.runs.length - 1].endCount = newCount;
      trackingData.runs[trackingData.runs.length - 1].imported = newCount - currentCount;
      trackingData.runs[trackingData.runs.length - 1].endTime = new Date().toISOString();
      saveTrackingData(trackingData);

      // Prepare for next run
      currentCount = newCount;
      runCount++;

      if (currentCount >= TARGET_COUNT) {
        logger.info(`\n=== Target Reached! ===`);
        logger.info(`Target of ${TARGET_COUNT} trials has been reached.`);
        logger.info(`Final count: ${currentCount}`);
        break;
      }

      if (runCount >= MAX_RUNS) {
        logger.info(`\n=== Maximum Runs Reached ===`);
        logger.info(`Reached maximum number of runs (${MAX_RUNS}).`);
        logger.info(`Current count: ${currentCount}`);
        logger.info(`Remaining to target: ${TARGET_COUNT - currentCount}`);
        break;
      }
    }

    // Final summary
    logger.info(`\n=== Final Summary ===`);
    logger.info(`Starting count: ${initialCount}`);
    logger.info(`Final count: ${currentCount}`);
    logger.info(`Total imported: ${currentCount - initialCount}`);
    logger.info(`Progress to target: ${Math.round((currentCount / TARGET_COUNT) * 100)}%`);
  } catch (error) {
    logger.error('Error during automated import process:', error);
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
