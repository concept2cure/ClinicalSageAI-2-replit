import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import pg from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Health Canada CSR Downloader for TrialSage
 *
 * This script downloads clinical trial data from Health Canada's Clinical Trials Database
 * and transforms it into the format expected by TrialSage.
 */

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Configuration
const OUTPUT_FILE = path.join(__dirname, 'canada_trials.json');
const BASE_URL = 'https://clinical-trials.canada.ca/api/v1/trials';
const MAX_TRIALS = 200; // Maximum number of trials to download
const BATCH_SIZE = 20; // Number of trials to download per batch

// Tracking variables for progress
let downloadedCount = 0;
let processedCount = 0;

/**
 * Download trials data from Health Canada API
 */
async function downloadTrialsFromHealthCanada() {
  logger.info(`Starting download of up to ${MAX_TRIALS} trials from Health Canada...`);

  try {
    // Create array to store trial data
    const studies = [];
    let page = 1;
    let hasMoreData = true;

    while (hasMoreData && downloadedCount < MAX_TRIALS) {
      logger.info(`Downloading batch ${page}...`);

      // Make API request
      const response = await axios.get(`${BASE_URL}?page=${page}&size=${BATCH_SIZE}`);

      if (!response.data || !response.data.content || !Array.isArray(response.data.content)) {
        logger.error('Error: Invalid response format from Health Canada API');
        hasMoreData = false;
        continue;
      }

      const batchTrials = response.data.content;

      if (batchTrials.length === 0) {
        hasMoreData = false;
        continue;
      }

      // Process each trial
      for (const trial of batchTrials) {
        if (downloadedCount >= MAX_TRIALS) {
          hasMoreData = false;
          break;
        }

        try {
          // Get detailed information for each trial
          const detailResponse = await axios.get(`${BASE_URL}/${trial.protocol_id}`);
          const trialDetail = detailResponse.data;

          // Transform to our format
          const transformedTrial = transformHealthCanadaTrial(trialDetail);
          studies.push(transformedTrial);

          downloadedCount++;

          if (downloadedCount % 10 === 0) {
            logger.info(`Downloaded ${downloadedCount} trials so far...`);
          }

          // Small delay to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          logger.error(
            `Error downloading detailed information for trial ${trial.protocol_id}:`,
            error.message
          );
        }
      }

      page++;
    }

    // Write the data to a JSON file
    const outputData = {
      processed_count: studies.length,
      processed_date: new Date().toISOString(),
      studies: studies,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(outputData, null, 2));

    logger.info(`
=== Download Summary ===
Total trials downloaded: ${downloadedCount}
Data saved to: ${OUTPUT_FILE}
    `);

    return outputData;
  } catch (error) {
    logger.error('Error during download process:', error.message);
    throw error;
  }
}

/**
 * Transform Health Canada trial data to our format
 */
function transformHealthCanadaTrial(trial) {
  // Extract dates (handling different formats)
  let startDate = null;
  if (trial.start_date) {
    startDate = new Date(trial.start_date).toISOString().split('T')[0];
  }

  let endDate = null;
  if (trial.completion_date) {
    endDate = new Date(trial.completion_date).toISOString().split('T')[0];
  }

  // Extract phase (handle various formats)
  let phase = 'Unknown';
  if (trial.phase && trial.phase.name) {
    phase = mapPhase(trial.phase.name);
  }

  // Map status
  let status = 'Unknown';
  if (trial.status && trial.status.name) {
    status = mapStatus(trial.status.name);
  }

  // Generate a unique ID for Health Canada trials
  const trialId = `HC-${trial.protocol_id || Date.now()}`;

  return {
    nctrialId: trialId,
    title: trial.title || 'Unknown Title',
    officialTitle: trial.scientific_title || trial.title || 'Unknown Title',
    sponsor: extractSponsor(trial),
    indication: extractIndication(trial),
    phase: phase,
    fileName: `${trialId}.json`,
    fileSize: Buffer.from(JSON.stringify(trial)).length,
    date: startDate,
    completionDate: endDate,
    drugName: extractDrug(trial),
    source: 'Health Canada Clinical Trials Database',
    studyType: trial.study_type || 'Interventional',
    status: status,
    description: trial.brief_description || extractDescription(trial),
    eligibilityCriteria: extractEligibilityCriteria(trial),
  };
}

/**
 * Extract sponsor information
 */
function extractSponsor(trial) {
  if (trial.sponsors && Array.isArray(trial.sponsors) && trial.sponsors.length > 0) {
    const primarySponsor = trial.sponsors.find(
      s => s.sponsor_type === 'lead' || s.sponsor_type === 'primary'
    );
    if (primarySponsor && primarySponsor.name) {
      return primarySponsor.name;
    }
    return trial.sponsors[0].name || 'Unknown Sponsor';
  }
  return trial.sponsor || 'Unknown Sponsor';
}

/**
 * Extract indication (medical condition)
 */
function extractIndication(trial) {
  if (trial.conditions && Array.isArray(trial.conditions) && trial.conditions.length > 0) {
    return trial.conditions.map(c => c.name || c).join(', ');
  }
  return 'Unknown Indication';
}

/**
 * Extract drug information
 */
function extractDrug(trial) {
  if (trial.interventions && Array.isArray(trial.interventions) && trial.interventions.length > 0) {
    return trial.interventions.map(i => i.name || i).join(', ');
  }
  return 'Unknown Intervention';
}

/**
 * Extract study description
 */
function extractDescription(trial) {
  if (trial.brief_description) {
    return trial.brief_description;
  }

  if (trial.detailed_description) {
    return trial.detailed_description;
  }

  let description = `A clinical study of ${extractDrug(trial)} in patients with ${extractIndication(trial)}.`;
  if (trial.phase) {
    description += ` This is a ${trial.phase.name || 'clinical'} study.`;
  }

  return description;
}

/**
 * Extract eligibility criteria
 */
function extractEligibilityCriteria(trial) {
  let criteria = '\nInclusion Criteria:\n';

  if (
    trial.eligibility &&
    trial.eligibility.inclusion_criteria &&
    Array.isArray(trial.eligibility.inclusion_criteria)
  ) {
    criteria += trial.eligibility.inclusion_criteria.map(c => `- ${c}`).join('\n');
  } else {
    criteria += '- Information not available';
  }

  criteria += '\n\nExclusion Criteria:\n';

  if (
    trial.eligibility &&
    trial.eligibility.exclusion_criteria &&
    Array.isArray(trial.eligibility.exclusion_criteria)
  ) {
    criteria += trial.eligibility.exclusion_criteria.map(c => `- ${c}`).join('\n');
  } else {
    criteria += '- Information not available';
  }

  return criteria;
}

/**
 * Map phase values to standard format
 */
function mapPhase(phaseString) {
  const phaseMap = {
    'Phase 1': 'Phase 1',
    'Phase I': 'Phase 1',
    'Phase 1/2': 'Phase 1/Phase 2',
    'Phase I/II': 'Phase 1/Phase 2',
    'Phase 2': 'Phase 2',
    'Phase II': 'Phase 2',
    'Phase 2/3': 'Phase 2/Phase 3',
    'Phase II/III': 'Phase 2/Phase 3',
    'Phase 3': 'Phase 3',
    'Phase III': 'Phase 3',
    'Phase 4': 'Phase 4',
    'Phase IV': 'Phase 4',
    'N/A': 'Not Applicable',
    'Early Phase 1': 'Phase 1',
  };

  return phaseMap[phaseString] || phaseString || 'Unknown';
}

/**
 * Map status values to standard format
 */
function mapStatus(statusString) {
  const statusMap = {
    'Not yet recruiting': 'Not yet recruiting',
    Recruiting: 'Recruiting',
    'Enrolling by invitation': 'Recruiting',
    'Active, not recruiting': 'Active, not recruiting',
    Suspended: 'Suspended',
    Terminated: 'Terminated',
    Completed: 'Completed',
    Withdrawn: 'Withdrawn',
    'Unknown status': 'Unknown',
  };

  return statusMap[statusString] || statusString || 'Unknown';
}

/**
 * Import trials from JSON file to database
 */
async function importTrialsToDatabase() {
  logger.info('Starting import of Health Canada trials to database...');

  try {
    // Read the Health Canada trials JSON file
    if (!fs.existsSync(OUTPUT_FILE)) {
      logger.error(`Error: ${OUTPUT_FILE} file not found`);
      return;
    }

    const fileData = fs.readFileSync(OUTPUT_FILE, 'utf8');
    const trialsData = JSON.parse(fileData);

    if (!trialsData.studies || !Array.isArray(trialsData.studies)) {
      logger.error(`Error: Invalid format in ${OUTPUT_FILE}`);
      return;
    }

    logger.info(`Found ${trialsData.studies.length} studies to import`);

    // Connect to the database
    const client = await pool.connect();

    try {
      // Begin transaction
      await client.query('BEGIN');

      let importedCount = 0;
      let skippedCount = 0;

      // Process each study
      for (const study of trialsData.studies) {
        try {
          // Check if a report with this ID already exists
          const checkQuery = 'SELECT id FROM csr_reports WHERE nctrial_id = $1';
          const checkResult = await client.query(checkQuery, [study.nctrialId]);

          if (checkResult.rows.length > 0) {
            logger.info(`Skipping ${study.nctrialId} - already exists in database`);
            skippedCount++;
            continue;
          }

          // Insert into csr_reports table
          const insertReportQuery = `
            INSERT INTO csr_reports (
              title, sponsor, indication, phase, file_name, file_size, date, 
              last_updated, drug_name, region, nctrial_id, status, deleted_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING id
          `;

          const reportValues = [
            study.title || 'Unknown Title',
            study.sponsor || 'Unknown Sponsor',
            study.indication || 'Unknown Indication',
            study.phase || 'Unknown',
            study.fileName || '',
            study.fileSize || 0,
            study.date || null,
            study.completionDate || null,
            study.drugName || 'Unknown',
            'Health Canada', // region
            study.nctrialId || '',
            study.status || 'Imported', // status
            null, // deleted_at
          ];

          const reportResult = await client.query(insertReportQuery, reportValues);
          const reportId = reportResult.rows[0].id;

          // Insert into csr_details table
          const insertDetailsQuery = `
            INSERT INTO csr_details (
              report_id, study_design, primary_objective, study_description, 
              inclusion_criteria, exclusion_criteria, processed
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `;

          const detailsValues = [
            reportId,
            study.studyType || null,
            null,
            study.description || null,
            study.eligibilityCriteria || null,
            null,
            true,
          ];

          await client.query(insertDetailsQuery, detailsValues);

          importedCount++;

          if (importedCount % 10 === 0) {
            logger.info(`Imported ${importedCount} studies so far...`);
          }
        } catch (error) {
          logger.error(`Error importing study ${study.nctrialId}:`, error.message);
          skippedCount++;
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      logger.info(`
=== Import Summary ===
Total Health Canada studies processed: ${trialsData.studies.length}
Successfully imported: ${importedCount}
Skipped (already exists or error): ${skippedCount}
      `);
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      logger.error('Error during transaction:', error.message);
    } finally {
      // Release the client
      client.release();
    }
  } catch (error) {
    logger.error('Error during import process:', error.message);
  }
}

/**
 * Main function
 */
async function downloadAndImportCanadaCSR() {
  try {
    logger.info('Starting Health Canada CSR download and import process...');

    // Step 1: Download trials from Health Canada
    await downloadTrialsFromHealthCanada();

    // Step 2: Import trials to database
    await importTrialsToDatabase();

    // Get total count
    const client = await pool.connect();
    try {
      const countResult = await client.query(
        "SELECT COUNT(*) as total FROM csr_reports WHERE region = 'Health Canada'"
      );
      logger.info(`\nTotal Health Canada trials in database: ${countResult.rows[0].total}`);

      // Get overall trial count
      const totalResult = await client.query('SELECT COUNT(*) as total FROM csr_reports');
      logger.info(`Total trials in database: ${totalResult.rows[0].total}`);
    } finally {
      client.release();
    }

    logger.info('Health Canada CSR download and import process completed successfully!');
  } catch (error) {
    logger.error('Error during download and import process:', error);
  } finally {
    // Close the database pool
    await pool.end();
  }
}

// Execute the main function
downloadAndImportCanadaCSR().catch(console.error);
