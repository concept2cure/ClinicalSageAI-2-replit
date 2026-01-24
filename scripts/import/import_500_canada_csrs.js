/**
 * Import 500 More Canada CSRs Script
 *
 * This script imports 500 Health Canada clinical trials (CSRs) in batches of 50.
 * It tracks progress and can be safely restarted if interrupted.
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { spawn } from 'child_process';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Constants
const BATCH_SIZE = 50;
const TOTAL_BATCHES = 10;
const TRACKING_FILE = 'canada_500_import_progress.json';

// Load tracking data
function getTrackingData() {
  if (fs.existsSync(TRACKING_FILE)) {
    const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
    console.log(`Loaded existing tracking data: ${JSON.stringify(data)}`);
    return data;
  }

  return {
    nextId: 1430, // Starting ID for Health Canada trials
    batchesCompleted: 0,
    trialsImported: 0,
    importedIds: [],
    lastRunTime: null,
  };
}

// Save tracking data
function saveTrackingData(data) {
  data.lastRunTime = new Date().toISOString();
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  console.log(`Progress data saved: ${JSON.stringify(data)}`);
}

// Get current count of Health Canada trials
async function getCurrentHealthCanadaCount() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) 
      FROM csr_reports 
      WHERE (region = 'Health Canada' OR region = 'Canada')
    `);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting Health Canada trial count:', error);
    return 0;
  }
}

// Get total trial count
async function getTotalTrialCount() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) 
      FROM csr_reports
    `);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting total trial count:', error);
    return 0;
  }
}

// Run a single batch using the import_batch_of_50.js script
async function runBatch(trackingData) {
  return new Promise((resolve, reject) => {
    console.log(`\n=== Running batch import using import_batch_of_50.js ===`);

    const batchProcess = spawn('node', ['import_batch_of_50.js']);

    batchProcess.stdout.on('data', data => {
      process.stdout.write(data.toString());
    });

    batchProcess.stderr.on('data', data => {
      process.stderr.write(data.toString());
    });

    batchProcess.on('close', code => {
      if (code === 0) {
        console.log(`Batch completed successfully with exit code ${code}`);
        resolve(true);
      } else {
        console.error(`Batch failed with exit code ${code}`);
        resolve(false); // Resolve with false instead of rejecting to continue the process
      }
    });
  });
}

// Main function to run the import
async function runImport500() {
  try {
    const trackingData = getTrackingData();

    console.log(`
=========================================================
IMPORTING 500 MORE HEALTH CANADA TRIALS IN BATCHES OF 50
=========================================================
  
Resuming import from batch ${trackingData.batchesCompleted + 1}/${TOTAL_BATCHES}
Updated progress data saved
Starting with ID: HC-${trackingData.nextId}
Current trials imported: ${trackingData.trialsImported}
`);

    // Show current database status
    const currentHCCount = await getCurrentHealthCanadaCount();
    const totalTrials = await getTotalTrialCount();

    console.log(`
=== Current Database Status ===
Total trials in database: ${totalTrials}
Health Canada trials: ${currentHCCount}
Target: 4000 Health Canada trials
Progress: ${Math.round((currentHCCount / 4000) * 100)}%
`);

    // Process batches
    for (let i = trackingData.batchesCompleted; i < TOTAL_BATCHES; i++) {
      console.log(`\n=== Processing batch ${i + 1}/${TOTAL_BATCHES} ===\n`);

      const batchSuccess = await runBatch(trackingData);

      if (batchSuccess) {
        // Update tracking data
        trackingData.nextId += BATCH_SIZE;
        trackingData.batchesCompleted++;
        trackingData.trialsImported += BATCH_SIZE;
        saveTrackingData(trackingData);

        console.log(`Completed batch ${i + 1}/${TOTAL_BATCHES}`);
      } else {
        console.error(`Failed to process batch ${i + 1}. Stopping import.`);
        break;
      }

      // Add delay between batches to avoid overwhelming the system
      console.log('Waiting 10 seconds before the next batch...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Get updated counts
    const newHCCount = await getCurrentHealthCanadaCount();
    const newTotal = await getTotalTrialCount();

    console.log(`
=== Final Database Status ===
Total trials in database: ${newTotal}
Health Canada trials: ${newHCCount}
ClinicalTrials.gov trials: ${newTotal - newHCCount}
Progress: ${newHCCount}/4000 Health Canada trials (${Math.round((newHCCount / 4000) * 100)}%)

Import completed. ${trackingData.batchesCompleted} batches (${trackingData.trialsImported} trials) imported.
`);
  } catch (error) {
    console.error('Error during import process:', error);
  } finally {
    await pool.end();
  }
}

// Run the import
runImport500().catch(err => {
  console.error('Fatal error occurred during import:', err);
  process.exit(1);
});

// Export functions for potential reuse
export { runImport500, getTrackingData, getCurrentHealthCanadaCount };
