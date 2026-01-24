/**
 * Health Canada Trial Manager
 *
 * This script provides a unified management interface for importing trials from Health Canada.
 * It includes functionality to:
 * 1. Resume interrupted imports from the last known position
 * 2. Verify the database for existing trial counts
 * 3. Support both single-batch and multi-batch import strategies
 * 4. Provide detailed logging and error recovery
 */

import { execSync } from 'child_process';
import fs from 'fs';
import pg from 'pg';
import axios from 'axios';

// Configuration
const BATCH_SIZE = 50;
const MAX_BATCHES_PER_RUN = 10;
const TARGET_COUNT = 4000;
const TRACKING_FILE = 'hc_import_tracker.json';
const BATCH_LOG_FILE = 'canada_batch_log.json';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// API endpoints
const HC_API_BASE = 'https://clinical-information.canada.ca/ci-rc/api';
const HC_SEARCH_ENDPOINT = `${HC_API_BASE}/search`;

/**
 * Get tracking data from file or initialize with defaults
 */
function getTrackingData() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('Error reading tracking file:', error.message);
  }

  // Default tracking data
  return {
    nextId: 1240,
    batchesCompleted: 17,
    trialsImported: 790,
    importedIds: [],
    lastBatchIndex: 0,
  };
}

/**
 * Save tracking data to file
 */
function saveTrackingData(data) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  console.log('Tracking data saved.');
}

/**
 * Get the current batch log or initialize a new one
 */
function getBatchLog() {
  try {
    if (fs.existsSync(BATCH_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(BATCH_LOG_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading batch log file:', error.message);
  }

  return {
    batches: [],
    lastRunTimestamp: null,
    totalTrialsImported: 0,
    errors: [],
  };
}

/**
 * Save batch log to file
 */
function saveBatchLog(log) {
  fs.writeFileSync(BATCH_LOG_FILE, JSON.stringify(log, null, 2));
}

/**
 * Add a batch entry to the log
 */
function logBatch(batchIndex, success, count, error = null) {
  const log = getBatchLog();

  log.batches.push({
    batchIndex,
    timestamp: new Date().toISOString(),
    success,
    trialsImported: count,
    error: error ? error.message || String(error) : null,
  });

  log.lastRunTimestamp = new Date().toISOString();
  log.totalTrialsImported += count;

  if (error) {
    log.errors.push({
      batchIndex,
      timestamp: new Date().toISOString(),
      message: error.message || String(error),
      stack: error.stack,
    });
  }

  saveBatchLog(log);
}

/**
 * Get current Health Canada trial count from database
 */
async function getHealthCanadaCount() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM csr_reports WHERE region = 'Health Canada'"
    );
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

/**
 * Get total available Health Canada trials from API
 */
async function getTotalAvailableTrials() {
  try {
    const searchParams = {
      lang: 'en',
      type: 'search',
      query: '*',
      page: 0,
      pageSize: 1,
    };

    // Use standard node HTTPS module directly to avoid 'require is not defined' errors
    // and to bypass certificate verification
    const https = require('https');
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const axiosConfig = {
      params: searchParams,
      httpsAgent: agent,
    };

    const response = await axios.get(HC_SEARCH_ENDPOINT, axiosConfig);
    return response.data.totalElements || 0;
  } catch (error) {
    console.error('Error getting total available trials:', error.message);
    return 0;
  }
}

/**
 * Run a single batch import at the specified index
 */
async function runSingleBatch(batchIndex) {
  console.log(`\n=== Running single batch at index ${batchIndex} ===`);

  try {
    // Run the import process
    execSync(
      `node import_single_canada_batch.js --batchSize ${BATCH_SIZE} --batchIndex ${batchIndex}`,
      {
        stdio: 'inherit',
      }
    );

    // Update tracking data
    const trackingData = getTrackingData();
    trackingData.lastBatchIndex = batchIndex;
    trackingData.batchesCompleted++;
    saveTrackingData(trackingData);

    // Get the new count and log success
    const newCount = await getHealthCanadaCount();
    const previousCount = trackingData.trialsImported;
    const importedInThisBatch = newCount - previousCount;

    trackingData.trialsImported = newCount;
    saveTrackingData(trackingData);

    logBatch(batchIndex, true, importedInThisBatch);

    return {
      success: true,
      trialsImported: importedInThisBatch,
      batchIndex,
    };
  } catch (error) {
    logBatch(batchIndex, false, 0, error);

    return {
      success: false,
      trialsImported: 0,
      error: error.message,
      batchIndex,
    };
  }
}

/**
 * Run multiple batches sequentially
 */
async function runMultipleBatches(startIndex, count) {
  console.log(`\n=== Running ${count} batches starting at index ${startIndex} ===`);

  const results = [];
  let successfulBatches = 0;
  let totalImported = 0;

  // Get initial tracking data
  const trackingData = getTrackingData();

  for (let i = 0; i < count; i++) {
    const currentBatchIndex = startIndex + i;
    console.log(`\n--- Starting batch ${i + 1}/${count} (index: ${currentBatchIndex}) ---`);

    try {
      const result = await runSingleBatch(currentBatchIndex);
      results.push(result);

      if (result.success) {
        successfulBatches++;
        totalImported += result.trialsImported;

        // Update tracking data after each successful batch
        trackingData.lastBatchIndex = currentBatchIndex;
        trackingData.batchesCompleted++;
        trackingData.trialsImported += result.trialsImported;
        saveTrackingData(trackingData);
      }
    } catch (error) {
      console.error(`Error running batch ${currentBatchIndex}:`, error);
      logBatch(currentBatchIndex, false, 0, error);
      results.push({
        success: false,
        trialsImported: 0,
        error: error.message,
        batchIndex: currentBatchIndex,
      });
    }

    // Get current count and check if we've reached the target
    const currentCount = await getHealthCanadaCount();
    console.log(
      `\nCurrent progress: ${currentCount}/${TARGET_COUNT} trials (${Math.round((currentCount / TARGET_COUNT) * 100)}%)`
    );

    if (currentCount >= TARGET_COUNT) {
      console.log(`\n=== Target Reached! ===`);
      break;
    }
  }

  console.log(`\n=== Batch Run Summary ===`);
  console.log(`Batches attempted: ${count}`);
  console.log(`Successful batches: ${successfulBatches}`);
  console.log(`Total trials imported: ${totalImported}`);

  return {
    batchesAttempted: count,
    batchesSuccessful: successfulBatches,
    totalImported,
    results,
  };
}

/**
 * Run until target count is reached
 */
async function runUntilTarget() {
  console.log('=== Health Canada Trial Manager ===');
  console.log('Starting timestamp:', new Date().toISOString());

  try {
    // Get current count and tracking data
    const currentCount = await getHealthCanadaCount();
    const trackingData = getTrackingData();
    const totalAvailable = await getTotalAvailableTrials();

    console.log(`Current status:`);
    console.log(`- Health Canada trials in database: ${currentCount}`);
    console.log(`- Total available from API: ${totalAvailable}`);
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
    console.error('Error during trial import:', error);
  } finally {
    await pool.end();
  }

  console.log('Process completed at:', new Date().toISOString());
}

/**
 * Display help
 */
function showHelp() {
  console.log(`
Health Canada Trial Manager
---------------------------
Commands:
  --help              Show this help
  --status            Show current import status
  --run               Run until target is reached (${TARGET_COUNT} trials)
  --batch <index>     Run a single batch at the specified index
  --multi <n>         Run n batches starting from the last index + 1
  --continue          Same as --run (alias for convenience)
  --reset             Reset the tracking data (warning: will restart import process)
  `);
}

/**
 * Show current status
 */
async function showStatus() {
  try {
    const currentCount = await getHealthCanadaCount();
    const trackingData = getTrackingData();
    const totalAvailable = await getTotalAvailableTrials();
    const batchLog = getBatchLog();

    console.log('=== Health Canada Import Status ===');
    console.log(`Health Canada trials in database: ${currentCount}`);
    console.log(`Total available from API: ${totalAvailable}`);
    console.log(`Target count: ${TARGET_COUNT}`);
    console.log(`Progress: ${Math.round((currentCount / TARGET_COUNT) * 100)}%`);
    console.log(`Last batch index: ${trackingData.lastBatchIndex}`);
    console.log(`Batches completed: ${trackingData.batchesCompleted}`);
    console.log(
      `Estimated batches remaining: ${Math.ceil((TARGET_COUNT - currentCount) / BATCH_SIZE)}`
    );

    if (batchLog.lastRunTimestamp) {
      console.log(`Last import run: ${batchLog.lastRunTimestamp}`);
      console.log(`Total logged imports: ${batchLog.totalTrialsImported}`);
      console.log(`Total batches logged: ${batchLog.batches.length}`);
      console.log(`Error count: ${batchLog.errors.length}`);
    }
  } catch (error) {
    console.error('Error showing status:', error);
  } finally {
    await pool.end();
  }
}

/**
 * Reset tracking data
 */
function resetTracking() {
  console.log('WARNING: This will reset all tracking data. Import will start from the beginning.');
  console.log('Creating backup of current tracking data...');

  // Backup current files
  if (fs.existsSync(TRACKING_FILE)) {
    fs.copyFileSync(TRACKING_FILE, `${TRACKING_FILE}.backup.${Date.now()}`);
  }

  if (fs.existsSync(BATCH_LOG_FILE)) {
    fs.copyFileSync(BATCH_LOG_FILE, `${BATCH_LOG_FILE}.backup.${Date.now()}`);
  }

  // Reset tracking data
  const defaultTrackingData = {
    nextId: 1,
    batchesCompleted: 0,
    trialsImported: 0,
    importedIds: [],
    lastBatchIndex: 0,
  };

  saveTrackingData(defaultTrackingData);

  // Reset batch log
  const defaultBatchLog = {
    batches: [],
    lastRunTimestamp: null,
    totalTrialsImported: 0,
    errors: [],
  };

  saveBatchLog(defaultBatchLog);

  console.log('Tracking data has been reset. Import will start from the beginning.');
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }

  if (args.includes('--status')) {
    await showStatus();
    return;
  }

  if (args.includes('--reset')) {
    resetTracking();
    return;
  }

  if (args.includes('--run') || args.includes('--continue')) {
    await runUntilTarget();
    return;
  }

  if (args.includes('--batch')) {
    const indexArg = args[args.indexOf('--batch') + 1];
    const batchIndex = parseInt(indexArg, 10);

    if (isNaN(batchIndex)) {
      console.error('Error: --batch requires a valid index number');
      return;
    }

    await runSingleBatch(batchIndex);
    await pool.end();
    return;
  }

  if (args.includes('--multi')) {
    const countArg = args[args.indexOf('--multi') + 1];
    const batchCount = parseInt(countArg, 10);

    if (isNaN(batchCount) || batchCount <= 0) {
      console.error('Error: --multi requires a positive number of batches');
      return;
    }

    const trackingData = getTrackingData();
    await runMultipleBatches(trackingData.lastBatchIndex + 1, batchCount);
    await pool.end();
    return;
  }

  console.log('Unknown command. Use --help to see available commands.');
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
