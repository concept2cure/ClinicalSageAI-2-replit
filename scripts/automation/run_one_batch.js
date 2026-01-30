import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Configuration
const TRACKING_FILE = 'micro_batch_progress.json';

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

// Run a single batch
async function runSingleBatch() {
  // Get initial tracking data
  const initialData = getTrackingData();

  logger.info(`Current tracking data:`);
  logger.info(`Next ID: HC-${initialData.nextId}`);
  logger.info(`Batches completed: ${initialData.batchesCompleted}`);
  logger.info(`Total imported: ${initialData.totalImported}`);
  logger.info(`Last run: ${initialData.lastRunTime || 'Never'}`);

  try {
    logger.info('\nRunning a single batch of 50 trials...');
    const { stdout } = await execPromise('node import_micro_batch.js');
    logger.info('Batch output summary:');

    // Extract the key information from stdout
    // Note: This is a simple extraction, not a full parse
    const summaryMatch = stdout.match(/Successfully imported: (\d+)/);
    const updatedHCCountMatch = stdout.match(/Health Canada trials: (\d+)/g);
    const progressMatch = stdout.match(/Progress: (\d+)%/g);

    if (summaryMatch && summaryMatch[1]) {
      logger.info(`Successfully imported: ${summaryMatch[1]} trials`);
    }

    if (updatedHCCountMatch && updatedHCCountMatch.length >= 2) {
      logger.info(
        `Updated Health Canada trial count: ${updatedHCCountMatch[updatedHCCountMatch.length - 1]}`
      );
    }

    if (progressMatch && progressMatch.length >= 2) {
      logger.info(`Current progress: ${progressMatch[progressMatch.length - 1]}`);
    }

    // Get updated tracking data
    const updatedData = getTrackingData();
    logger.info('\nUpdated tracking data:');
    logger.info(`Next ID: HC-${updatedData.nextId}`);
    logger.info(`Batches completed: ${updatedData.batchesCompleted}`);
    logger.info(`Total imported: ${updatedData.totalImported}`);
    logger.info(`Last run: ${updatedData.lastRunTime || 'Never'}`);
  } catch (error) {
    logger.error(`Error running batch:`, error.message);
  }
}

// Run the batch
runSingleBatch().catch(console.error);
