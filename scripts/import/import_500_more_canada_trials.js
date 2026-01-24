import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Import 500 More Canada Trials for TrialSage
 *
 * This script automates the process of importing 10 batches of 50 trials (500 total)
 * from Health Canada to meet the requirement of adding 500 more CSRs to our knowledge base.
 */

// Configuration
const TOTAL_BATCHES = 10; // 10 batches of 50 = 500 trials
const TRACKING_FILE = 'hc_import_tracker.json';
const IMPORT_SCRIPT = 'import_batch_of_50.js';
const BATCH_DELAY_MS = 5000; // 5-second delay between batches
const PROGRESS_LOG = 'import_500_progress.json';

// Get or initialize tracking data
function getTrackingData() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('Error reading tracking file:', error.message);
  }

  // Default tracking data - this shouldn't happen if import_batch_of_50.js has been run before
  return {
    nextId: 1340, // Based on current tracker
    batchesCompleted: 19,
    trialsImported: 881,
    importedIds: [],
  };
}

// Get or initialize progress data for this batch of 500
function getProgressData() {
  try {
    if (fs.existsSync(PROGRESS_LOG)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_LOG, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('Error reading progress file:', error.message);
  }

  // Default progress data
  return {
    targetBatches: TOTAL_BATCHES,
    batchesProcessed: 0,
    startTimestamp: new Date().toISOString(),
    lastBatchTimestamp: null,
    status: 'starting',
    errors: [],
  };
}

// Save progress data
function saveProgressData(data) {
  try {
    fs.writeFileSync(PROGRESS_LOG, JSON.stringify(data, null, 2));
    console.log('Updated progress data saved');
  } catch (error) {
    console.error('Error saving progress file:', error.message);
  }
}

// Run a single batch
async function runSingleBatch() {
  console.log(`\n\n=== Running batch import using ${IMPORT_SCRIPT} ===\n`);

  try {
    const { stdout, stderr } = await execPromise(`node ${IMPORT_SCRIPT}`);
    console.log(stdout);
    if (stderr) {
      console.error('Stderr:', stderr);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error executing batch import:', error.message);
    return false;
  }
}

// Run all batches
async function runAllBatches() {
  console.log(`
=========================================================
IMPORTING 500 MORE HEALTH CANADA TRIALS IN BATCHES OF 50
=========================================================
  `);

  // Initialize progress
  const progress = getProgressData();
  if (progress.batchesProcessed >= TOTAL_BATCHES) {
    console.log('All batches have already been processed. Import complete!');
    return;
  }

  // If resuming, show status
  if (progress.batchesProcessed > 0) {
    console.log(`Resuming import from batch ${progress.batchesProcessed + 1}/${TOTAL_BATCHES}`);
  }

  progress.status = 'in_progress';
  saveProgressData(progress);

  // Initial tracking data
  const initialTracking = getTrackingData();
  console.log(`Starting with ID: HC-${initialTracking.nextId}`);
  console.log(`Current trials imported: ${initialTracking.trialsImported}`);

  // Run each batch
  let batchSuccess = true;
  for (let i = progress.batchesProcessed; i < TOTAL_BATCHES; i++) {
    console.log(`\n=== Processing batch ${i + 1}/${TOTAL_BATCHES} ===\n`);

    batchSuccess = await runSingleBatch();

    if (!batchSuccess) {
      console.error(`Batch ${i + 1} failed. Stopping process.`);
      progress.status = 'failed';
      progress.errors.push({
        batch: i + 1,
        timestamp: new Date().toISOString(),
        message: 'Batch execution failed',
      });
      saveProgressData(progress);
      break;
    }

    // Update progress
    progress.batchesProcessed = i + 1;
    progress.lastBatchTimestamp = new Date().toISOString();
    saveProgressData(progress);

    // Get updated tracking data
    const currentTracking = getTrackingData();
    console.log(`\nProgress: ${currentTracking.trialsImported} trials imported`);

    // Delay before next batch (except for the last one)
    if (i < TOTAL_BATCHES - 1) {
      console.log(`Waiting ${BATCH_DELAY_MS / 1000} seconds before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  // Final tracking data
  const finalTracking = getTrackingData();
  const trialsImported = finalTracking.trialsImported - initialTracking.trialsImported;

  if (batchSuccess && progress.batchesProcessed >= TOTAL_BATCHES) {
    progress.status = 'completed';
    progress.completionTimestamp = new Date().toISOString();
    saveProgressData(progress);

    console.log(`
=========================================================
            IMPORT OF 500 TRIALS COMPLETED
=========================================================
Started with: ${initialTracking.trialsImported} trials
Ended with: ${finalTracking.trialsImported} trials
Added: ${trialsImported} new trials
Progress toward 4,000 target: ${Math.round((finalTracking.trialsImported / 4000) * 100)}%
    `);
  } else {
    console.log(`
=========================================================
            IMPORT PROCESS INCOMPLETE
=========================================================
Started with: ${initialTracking.trialsImported} trials
Current count: ${finalTracking.trialsImported} trials
Added so far: ${trialsImported} new trials
Completed: ${progress.batchesProcessed}/${TOTAL_BATCHES} batches
Status: ${progress.status}
    `);
  }
}

// Run the main function
runAllBatches().catch(error => {
  console.error('Fatal error during batch processing:', error);
});
