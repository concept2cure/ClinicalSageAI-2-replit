import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Run Multiple Smaller Batches script for TrialSage
 *
 * This script runs multiple smaller batches of trial imports (200 trials each)
 * to avoid timeouts and ensure we make progress towards our goal of 4000 trials.
 */

// Configuration
const TRACKING_FILE = 'hc_import_tracker.json';
const BATCH_SIZE = 200; // Process 200 at a time
const BATCH_COUNT = 5; // Run 5 batches for a total of 1000 trials

// Get tracking data
function getTrackingData() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    logger.error('Error reading tracking file:', error.message);
  }

  // Default tracking data
  return {
    nextId: 1000,
    batchesCompleted: 0,
    trialsImported: 0,
  };
}

// Save tracking data
function saveTrackingData(data) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    logger.error('Error saving tracking file:', error.message);
  }
}

// Run batches of imports
async function runBatches() {
  logger.info(`Starting to import ${BATCH_COUNT} batches of ${BATCH_SIZE} trials each`);

  // Update the batch size in the original script
  const originalScript = fs.readFileSync('batch_import_large_canada.js', 'utf8');
  const updatedScript = originalScript.replace(
    /const BATCH_SIZE = 1000;/,
    `const BATCH_SIZE = ${BATCH_SIZE};`
  );
  fs.writeFileSync('temp_batch_import.js', updatedScript);
  logger.info('Created temporary import script with smaller batch size');

  // Run multiple batches
  for (let i = 0; i < BATCH_COUNT; i++) {
    logger.info(`\n=== Running Batch ${i + 1} of ${BATCH_COUNT} ===`);
    try {
      // Run the import script
      execSync('node temp_batch_import.js', { stdio: 'inherit' });

      // Get updated tracking data
      const trackingData = getTrackingData();
      logger.info(`Completed batch ${i + 1}. New tracking data:`, trackingData);
    } catch (error) {
      logger.error(`Error running batch ${i + 1}:`, error.message);
      break;
    }
  }

  // Clean up
  fs.unlinkSync('temp_batch_import.js');
  logger.info('\nImport process completed.');
}

// Run the batches
runBatches();
