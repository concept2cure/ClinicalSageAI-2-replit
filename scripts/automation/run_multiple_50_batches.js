import { execSync } from 'child_process';
import fs from 'fs';

/**
 * Run Multiple Batches of 50 Trials for TrialSage
 *
 * This script runs multiple parallel processes, each importing 50 trials.
 * It's optimized to run several concurrent imports while avoiding database conflicts.
 */

// Configuration
const PARALLEL_PROCESSES = 5; // Number of parallel import processes to run
const TRACKING_FILE = 'hc_import_tracker.json';
const TARGET_COUNT = 4000; // Target number of Health Canada trials

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
    nextId: 1240,
    batchesCompleted: 17,
    trialsImported: 790,
  };
}

// Run parallel import processes
async function runParallelImports() {
  logger.info(`=== Running ${PARALLEL_PROCESSES} Parallel Import Processes ===`);
  logger.info(`Each process will import 50 trials. Total: ${PARALLEL_PROCESSES * 50} trials`);
  logger.info('Timestamp:', new Date().toISOString());

  // Make a backup of tracking file before starting
  const trackingData = getTrackingData();
  fs.writeFileSync('tracking_backup.json', JSON.stringify(trackingData, null, 2));
  logger.info('Created backup of tracking data');

  // Modify the import script to use different nextId values for each process
  for (let i = 0; i < PARALLEL_PROCESSES; i++) {
    const nextId = trackingData.nextId + i * 50;

    // Create a temporary script file with the adjusted nextId
    const scriptContent = `
      import fs from 'fs';
      import path from 'path';
      import { fileURLToPath } from 'url';
      import pg from 'pg';
      
      // Override the nextId in the tracking data for this process
      const OVERRIDE_NEXT_ID = ${nextId};
      
      // Import the rest of the script 
      import('./import_batch_of_50.js')
        .then(module => {
          // The module will run automatically
          logger.info('Import process ${i + 1} completed with nextId ${nextId}');
        })
        .catch(err => {
          logger.error('Error importing module in process ${i + 1}:', err);
        });
    `;

    const scriptPath = `temp_import_${i}.mjs`;
    fs.writeFileSync(scriptPath, scriptContent);

    // Run the process
    logger.info(`Starting import process ${i + 1} with nextId ${nextId}`);
    try {
      // Use spawn to run the process in the background
      const childProcess = require('child_process').spawn('node', [scriptPath], {
        detached: true,
        stdio: 'inherit',
      });

      // Don't wait for the child process
      childProcess.unref();

      logger.info(`Process ${i + 1} started with PID ${childProcess.pid}`);
    } catch (error) {
      logger.error(`Error starting process ${i + 1}:`, error.message);
    }
  }

  logger.info(`
All ${PARALLEL_PROCESSES} import processes have been started in parallel.
Each process will log its own progress.
The main tracking file will be updated as each process completes.
`);
}

// Run the parallel imports
runParallelImports();
