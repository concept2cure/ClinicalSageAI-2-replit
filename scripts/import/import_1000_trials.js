import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Configuration
const TRACKING_FILE = 'micro_batch_progress.json';
const TARGET_ADDITIONAL = 1000; // Import 1000 more trials

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

  return {
    nextId: 5000,
    batchesCompleted: 0,
    totalImported: 0,
    lastRunTime: null,
  };
}

async function runBatches() {
  // Get initial tracking data
  const initialData = getTrackingData();
  const startingTotal = initialData.totalImported;

  logger.info(`Starting import process for 1000 additional trials...`);
  logger.info(`Current trials imported: ${startingTotal}`);
  logger.info(`Target: ${startingTotal + TARGET_ADDITIONAL} trials`);

  let currentTotal = startingTotal;
  let batchesRun = 0;

  while (currentTotal < startingTotal + TARGET_ADDITIONAL) {
    logger.info(`\nRunning batch ${batchesRun + 1}...`);

    try {
      // Run the micro batch script
      const { stdout } = await execPromise('node import_micro_batch.js');

      // Read updated tracking data after batch completes
      const updatedData = getTrackingData();
      const newTotal = updatedData.totalImported;

      // Calculate how many were imported in this batch
      const batchImported = newTotal - currentTotal;
      currentTotal = newTotal;
      batchesRun++;

      logger.info(`Batch ${batchesRun} complete. Imported ${batchImported} trials.`);
      logger.info(
        `Progress: ${currentTotal - startingTotal}/${TARGET_ADDITIONAL} additional trials imported (${Math.round(((currentTotal - startingTotal) / TARGET_ADDITIONAL) * 100)}%)`
      );

      // Check if we've reached our target
      if (currentTotal >= startingTotal + TARGET_ADDITIONAL) {
        logger.info(`\nTarget reached! Total imported: ${currentTotal}`);
        break;
      }

      // Add a small delay between batches to allow system to recover
      logger.info('Waiting 3 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      logger.error(`Error running batch ${batchesRun + 1}:`, error.message);
      logger.info('Waiting 5 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  logger.info(`\n=== Import Complete ===`);
  logger.info(`Started with: ${startingTotal} trials`);
  logger.info(`Ended with: ${currentTotal} trials`);
  logger.info(`Total imported: ${currentTotal - startingTotal} trials`);
  logger.info(`Batches run: ${batchesRun}`);
}

// Run the batches
runBatches().catch(console.error);
