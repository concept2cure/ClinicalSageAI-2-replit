/**
 * Import 500 More ClinicalTrials.gov Records Script
 *
 * This script imports 500 ClinicalTrials.gov records in batches of 50.
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
const TRACKING_FILE = 'ctgov_500_import_progress.json';

// Load tracking data
function getTrackingData() {
  if (fs.existsSync(TRACKING_FILE)) {
    const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
    logger.info(`Loaded existing tracking data: ${JSON.stringify(data)}`);
    return data;
  }

  return {
    nextId: 6001, // Starting ID for ClinicalTrials.gov trials
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
  logger.info(`Progress data saved: ${JSON.stringify(data)}`);
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
    logger.error('Error getting ClinicalTrials.gov trial count:', error);
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
    logger.error('Error getting total trial count:', error);
    return 0;
  }
}

// Check if XML files exist in attached_assets
async function checkXmlFiles() {
  const assetsDir = path.join('.', 'attached_assets');
  try {
    const files = fs.readdirSync(assetsDir);
    const xmlFiles = files.filter(file => file.endsWith('.xml') && file.startsWith('NCT'));
    return xmlFiles.length;
  } catch (error) {
    logger.error('Error checking XML files:', error);
    return 0;
  }
}

// Run a single batch using the import_ctgov_batch.js script or batch_import.js
async function runBatch(trackingData) {
  return new Promise((resolve, reject) => {
    logger.info(`\n=== Running batch import for ClinicalTrials.gov data ===`);

    // Determine which import script to use
    const scriptName = fs.existsSync('import_ctgov_batch.js')
      ? 'import_ctgov_batch.js'
      : 'batch_import.js';

    logger.info(`Using script: ${scriptName}`);

    const batchProcess = spawn('node', [scriptName]);

    batchProcess.stdout.on('data', data => {
      process.stdout.write(data.toString());
    });

    batchProcess.stderr.on('data', data => {
      process.stderr.write(data.toString());
    });

    batchProcess.on('close', code => {
      if (code === 0) {
        logger.info(`Batch completed successfully with exit code ${code}`);
        resolve(true);
      } else {
        logger.error(`Batch failed with exit code ${code}`);
        resolve(false); // Resolve with false instead of rejecting to continue the process
      }
    });
  });
}

// Main function to run the import
async function runImport500() {
  try {
    const trackingData = getTrackingData();

    logger.info(`
=========================================================
IMPORTING 500 MORE CLINICALTRIALS.GOV TRIALS IN BATCHES OF 50
=========================================================
  
Resuming import from batch ${trackingData.batchesCompleted + 1}/${TOTAL_BATCHES}
Updated progress data saved
Starting with ID: NCT-${trackingData.nextId}
Current trials imported: ${trackingData.trialsImported}
`);

    // Show current database status
    const currentCTGovCount = await getCurrentCTGovCount();
    const totalTrials = await getTotalTrialCount();
    const xmlFilesCount = await checkXmlFiles();

    logger.info(`
=== Current Database Status ===
Total trials in database: ${totalTrials}
ClinicalTrials.gov trials: ${currentCTGovCount}
XML files available: ${xmlFilesCount}
`);

    // Process batches
    for (let i = trackingData.batchesCompleted; i < TOTAL_BATCHES; i++) {
      logger.info(`\n=== Processing batch ${i + 1}/${TOTAL_BATCHES} ===\n`);

      const batchSuccess = await runBatch(trackingData);

      if (batchSuccess) {
        // Update tracking data
        trackingData.nextId += BATCH_SIZE;
        trackingData.batchesCompleted++;
        trackingData.trialsImported += BATCH_SIZE;
        saveTrackingData(trackingData);

        logger.info(`Completed batch ${i + 1}/${TOTAL_BATCHES}`);
      } else {
        logger.error(`Failed to process batch ${i + 1}. Stopping import.`);
        break;
      }

      // Add delay between batches to avoid overwhelming the system
      logger.info('Waiting 10 seconds before the next batch...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Get updated counts
    const newCTGovCount = await getCurrentCTGovCount();
    const newTotal = await getTotalTrialCount();

    logger.info(`
=== Final Database Status ===
Total trials in database: ${newTotal}
ClinicalTrials.gov trials: ${newCTGovCount}
Health Canada trials: ${newTotal - newCTGovCount}

Import completed. ${trackingData.batchesCompleted} batches (${trackingData.trialsImported} trials) imported.
`);
  } catch (error) {
    logger.error('Error during import process:', error);
  } finally {
    await pool.end();
  }
}

// Run the import
runImport500().catch(err => {
  logger.error('Fatal error occurred during import:', err);
  process.exit(1);
});

// Export functions for potential reuse
export { runImport500, getTrackingData, getCurrentCTGovCount };
