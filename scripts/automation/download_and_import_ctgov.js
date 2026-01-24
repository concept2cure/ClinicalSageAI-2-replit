/**
 * Download and Import ClinicalTrials.gov Records
 *
 * This script coordinates the downloading and importing of ClinicalTrials.gov
 * records to reach the target of 500 trials. It works in batches of 50 trials,
 * first downloading new XML files and then importing them.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import pg from 'pg';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Constants
const BATCH_SIZE = 50;
const TOTAL_BATCHES = 10; // To reach 500 trials
const PROGRESS_FILE = 'ctgov_download_import_progress.json';

// Load progress data
function getProgressData() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }

  return {
    batchesCompleted: 0,
    trialsImported: 0,
    lastRunTime: null,
  };
}

// Save progress data
function saveProgressData(data) {
  data.lastRunTime = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  console.log(`Progress data saved: ${JSON.stringify(data)}`);
}

// Get current count of ClinicalTrials.gov trials
async function getCurrentCTGovCount() {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) 
      FROM csr_reports 
      WHERE (region = 'ClinicalTrials.gov' OR region = 'US' OR region IS NULL)
      AND ("nctrial_id" LIKE 'NCT%' OR "file_name" LIKE 'NCT%')
    `);
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error getting ClinicalTrials.gov trial count:', error);
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

// Run a script and capture its output
function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`Running script: ${scriptName}`);

    const process = spawn('node', [scriptName]);

    process.stdout.on('data', data => {
      console.log(data.toString());
    });

    process.stderr.on('data', data => {
      console.error(data.toString());
    });

    process.on('close', code => {
      if (code === 0) {
        console.log(`Script ${scriptName} completed successfully with exit code ${code}`);
        resolve(true);
      } else {
        console.error(`Script ${scriptName} failed with exit code ${code}`);
        resolve(false); // Resolve with false instead of rejecting to continue the process
      }
    });
  });
}

// Run a single batch (download + import)
async function runBatch() {
  // First download XML files
  const downloadSuccess = await runScript('download_clinicaltrials_xml.js');

  if (!downloadSuccess) {
    console.warn('Download failed or no new files were downloaded.');
    // Continue anyway, we might still have files to import
  }

  // Then import XML files
  const importSuccess = await runScript('import_ctgov_batch.js');

  return importSuccess;
}

// Main function to run the download and import process
async function runDownloadAndImport() {
  try {
    const progressData = getProgressData();

    console.log(`
=========================================================
DOWNLOADING AND IMPORTING CLINICALTRIALS.GOV TRIALS
TARGET: 500 TRIALS IN BATCHES OF 50
=========================================================
  
Resuming from batch ${progressData.batchesCompleted + 1}/${TOTAL_BATCHES}
Updated progress data saved
Current trials imported: ${progressData.trialsImported}
`);

    // Show current database status
    const currentCTGovCount = await getCurrentCTGovCount();
    const totalTrials = await getTotalTrialCount();

    console.log(`
=== Current Database Status ===
Total trials in database: ${totalTrials}
ClinicalTrials.gov trials: ${currentCTGovCount}
Remaining to reach target: ${Math.max(0, 500 - currentCTGovCount)}
`);

    // Check if we've already reached the target
    if (currentCTGovCount >= 500) {
      console.log('Target of 500 ClinicalTrials.gov trials already achieved!');
      return;
    }

    // Process batches
    for (let i = progressData.batchesCompleted; i < TOTAL_BATCHES; i++) {
      console.log(`\n=== Processing batch ${i + 1}/${TOTAL_BATCHES} ===\n`);

      const batchSuccess = await runBatch();

      if (batchSuccess) {
        // Update progress data
        progressData.batchesCompleted++;
        progressData.trialsImported += BATCH_SIZE;
        saveProgressData(progressData);

        console.log(`Completed batch ${i + 1}/${TOTAL_BATCHES}`);
      } else {
        console.error(`Failed to process batch ${i + 1}. Retrying...`);
        i--; // Retry this batch
        continue;
      }

      // Check if we've reached the target
      const newCTGovCount = await getCurrentCTGovCount();
      if (newCTGovCount >= 500) {
        console.log('Target of 500 ClinicalTrials.gov trials achieved!');
        break;
      }

      // Add delay between batches
      console.log('Waiting 60 seconds before the next batch...');
      await new Promise(resolve => setTimeout(resolve, 60000));
    }

    // Get updated counts
    const newCTGovCount = await getCurrentCTGovCount();
    const newTotal = await getTotalTrialCount();

    console.log(`
=== Final Database Status ===
Total trials in database: ${newTotal}
ClinicalTrials.gov trials: ${newCTGovCount}
Health Canada trials: ${newTotal - newCTGovCount}
Target progress: ${Math.min(100, (newCTGovCount / 500) * 100).toFixed(1)}%

Import completed. ${progressData.batchesCompleted} batches (${progressData.trialsImported} trials) imported.
`);
  } catch (error) {
    console.error('Error during download and import process:', error);
  } finally {
    await pool.end();
  }
}

// Run the process
runDownloadAndImport().catch(err => {
  console.error('Fatal error occurred during process:', err);
  process.exit(1);
});
