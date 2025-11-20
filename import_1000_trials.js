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
    console.error('Error reading tracking file:', error.message);
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

  console.log(`Starting import process for 1000 additional trials...`);
  console.log(`Current trials imported: ${startingTotal}`);
  console.log(`Target: ${startingTotal + TARGET_ADDITIONAL} trials`);

  let currentTotal = startingTotal;
  let batchesRun = 0;

  while (currentTotal < startingTotal + TARGET_ADDITIONAL) {
    console.log(`\nRunning batch ${batchesRun + 1}...`);

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

      console.log(`Batch ${batchesRun} complete. Imported ${batchImported} trials.`);
      console.log(
        `Progress: ${currentTotal - startingTotal}/${TARGET_ADDITIONAL} additional trials imported (${Math.round(((currentTotal - startingTotal) / TARGET_ADDITIONAL) * 100)}%)`
      );

      // Check if we've reached our target
      if (currentTotal >= startingTotal + TARGET_ADDITIONAL) {
        console.log(`\nTarget reached! Total imported: ${currentTotal}`);
        break;
      }

      // Add a small delay between batches to allow system to recover
      console.log('Waiting 3 seconds before next batch...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Error running batch ${batchesRun + 1}:`, error.message);
      console.log('Waiting 5 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`Started with: ${startingTotal} trials`);
  console.log(`Ended with: ${currentTotal} trials`);
  console.log(`Total imported: ${currentTotal - startingTotal} trials`);
  console.log(`Batches run: ${batchesRun}`);
}

// Run the batches
runBatches().catch(console.error);
