/**
 * Download ClinicalTrials.gov XML Files
 *
 * This script downloads XML files from ClinicalTrials.gov for trials that
 * are not already in our database. It will download a specified number of
 * trials and save them to the attached_assets directory.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import pg from 'pg';
import { spawn } from 'child_process';

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Constants
const NUM_TO_DOWNLOAD = 50; // Number of files to download in each batch
const OUTPUT_DIR = path.join('.', 'attached_assets');
const DOWNLOAD_LOG = 'downloaded_trials.json';

// Initialize download log
function getDownloadLog() {
  if (fs.existsSync(DOWNLOAD_LOG)) {
    return JSON.parse(fs.readFileSync(DOWNLOAD_LOG, 'utf8'));
  }
  return {
    downloadedIds: [],
    lastNCTID: 'NCT03700000', // Use an ID smaller than our known valid IDs
    totalDownloaded: 0,
    lastRunTime: null,
  };
}

// Save download log
function saveDownloadLog(data) {
  data.lastRunTime = new Date().toISOString();
  fs.writeFileSync(DOWNLOAD_LOG, JSON.stringify(data, null, 2));
  logger.info(`Download progress saved. Total downloaded: ${data.totalDownloaded}`);
}

// Check if an NCT ID already exists in the database
async function checkTrialExists(nctId) {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*) 
      FROM csr_reports 
      WHERE "nctrial_id" = $1
    `,
      [nctId]
    );

    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error('Error checking if trial exists:', error);
    return true; // Assume it exists to avoid duplicate downloads
  }
}

// Download XML file from ClinicalTrials.gov
function downloadTrialXML(nctId) {
  return new Promise((resolve, reject) => {
    const url = `https://clinicaltrials.gov/api/query/full_studies?expr=${nctId}&fmt=xml`;
    const outputPath = path.join(OUTPUT_DIR, `${nctId}.xml`);

    // Check if file already exists
    if (fs.existsSync(outputPath)) {
      logger.info(`File ${nctId}.xml already exists, skipping.`);
      resolve(false);
      return;
    }

    logger.info(`Downloading ${nctId} from ${url}`);

    const file = fs.createWriteStream(outputPath);

    https
      .get(url, response => {
        // Handle HTTP redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          logger.info(`Redirected to ${location}`);
          file.close();
          fs.unlinkSync(outputPath); // Remove the incomplete file

          // Handle relative URLs in redirects
          let redirectUrl = location;
          if (location.startsWith('/')) {
            redirectUrl = `https://clinicaltrials.gov${location}`;
          }

          logger.info(`Following redirect to ${redirectUrl}`);

          https
            .get(redirectUrl, finalResponse => {
              finalResponse.pipe(file);

              file.on('finish', () => {
                file.close();
                logger.info(`Downloaded ${nctId}.xml`);
                resolve(true);
              });
            })
            .on('error', err => {
              fs.unlinkSync(outputPath); // Remove the incomplete file
              logger.error(`Error downloading ${nctId}: ${err.message}`);
              reject(err);
            });

          return;
        }

        // Handle direct response
        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath); // Remove the incomplete file
          reject(new Error(`Failed to download ${nctId}. Status code: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          logger.info(`Downloaded ${nctId}.xml`);

          // Check if file is valid XML (contains trial data)
          const content = fs.readFileSync(outputPath, 'utf8');
          if (!content.includes('<full_studies>') && !content.includes('<clinical_study>')) {
            logger.warn(`${nctId}.xml does not contain valid trial data, removing file.`);
            fs.unlinkSync(outputPath);
            resolve(false);
            return;
          }

          resolve(true);
        });
      })
      .on('error', err => {
        file.close();
        fs.unlinkSync(outputPath); // Remove the incomplete file
        logger.error(`Error downloading ${nctId}: ${err.message}`);
        reject(err);
      });
  });
}

// Generate the next NCT ID to try
function getNextNCTID(lastNCTID) {
  // Extract the numeric part
  const numPart = parseInt(lastNCTID.replace('NCT', ''));
  // Increment and format with leading zeros
  const nextNum = numPart + 1;
  return `NCT${nextNum.toString().padStart(8, '0')}`;
}

// Sample of known valid NCT IDs (a mix of older and newer trials)
const KNOWN_VALID_NCTIDS = [
  'NCT03811366',
  'NCT03794050',
  'NCT03785600',
  'NCT03792139',
  'NCT03815682',
  'NCT03814343',
  'NCT03787836',
  'NCT03800550',
  'NCT03808376',
  'NCT03798106',
  'NCT03808727',
  'NCT03808844',
  'NCT03803072',
  'NCT03800823',
  'NCT03793439',
  'NCT03809169',
  'NCT03797274',
  'NCT03805269',
  'NCT03785704',
  'NCT03812861',
  'NCT04572633',
  'NCT04572646',
  'NCT04569760',
  'NCT04574362',
  'NCT04575337',
  'NCT04577599',
  'NCT04578366',
  'NCT04572464',
  'NCT04576442',
  'NCT04570527',
  'NCT04573764',
  'NCT04566159',
  'NCT04571970',
  'NCT04577430',
  'NCT04577300',
  'NCT04573036',
  'NCT04572334',
  'NCT04571814',
  'NCT04576130',
  'NCT04568928',
  'NCT05570149',
  'NCT05567341',
  'NCT05566977',
  'NCT05567653',
  'NCT05569824',
  'NCT05569889',
  'NCT05567692',
  'NCT05570006',
  'NCT05569550',
  'NCT05567406',
];

// Generate a list of NCT IDs to try
function generateNCTIDs(startId, count) {
  // Filter out IDs that are "smaller" than our starting ID
  const validIds = KNOWN_VALID_NCTIDS.filter(id => id > startId);

  // Sort them numerically
  validIds.sort();

  // Take just what we need
  return validIds.slice(0, count * 3); // Generate more than we need to account for failures
}

// Main download function
async function downloadTrialBatch() {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load download log
    const downloadLog = getDownloadLog();
    logger.info(`Starting download from ID: ${downloadLog.lastNCTID}`);
    logger.info(`Previously downloaded: ${downloadLog.totalDownloaded} files`);

    // Generate IDs to try
    const idsToTry = generateNCTIDs(downloadLog.lastNCTID, NUM_TO_DOWNLOAD);
    let successCount = 0;
    let lastSuccessfulId = downloadLog.lastNCTID;

    // Try downloading each ID
    for (const nctId of idsToTry) {
      // Check if we already have this trial in the database
      const exists = await checkTrialExists(nctId);

      if (exists) {
        logger.info(`Trial ${nctId} already exists in database, skipping.`);
        continue;
      }

      try {
        const success = await downloadTrialXML(nctId);

        if (success) {
          downloadLog.downloadedIds.push(nctId);
          lastSuccessfulId = nctId;
          successCount++;
        }

        // Add a short delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000));

        // If we've downloaded enough, stop
        if (successCount >= NUM_TO_DOWNLOAD) {
          break;
        }
      } catch (error) {
        logger.error(`Error downloading ${nctId}:`, error);
        continue;
      }
    }

    // Update download log
    downloadLog.lastNCTID = lastSuccessfulId;
    downloadLog.totalDownloaded += successCount;
    saveDownloadLog(downloadLog);

    logger.info(`Downloaded ${successCount} new XML files.`);
    logger.info(`Total downloaded so far: ${downloadLog.totalDownloaded}`);

    return {
      success: successCount > 0,
      count: successCount,
      total: downloadLog.totalDownloaded,
    };
  } finally {
    await pool.end();
  }
}

// Run the download
downloadTrialBatch()
  .then(result => {
    if (result.success) {
      logger.info('Download completed successfully.');
      process.exit(0);
    } else {
      logger.error('No new trials downloaded.');
      process.exit(1);
    }
  })
  .catch(error => {
    logger.error('Error during download process:', error);
    process.exit(1);
  });
