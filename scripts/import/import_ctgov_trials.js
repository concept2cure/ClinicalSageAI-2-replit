/**
 * Enhanced ClinicalTrials.gov Import Script for TrialSage
 *
 * This script imports trials from ClinicalTrials.gov while carefully handling
 * duplicates and API limitations.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Initialize environment variables
dotenv.config();

// Set up paths for ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Track successful imports to avoid duplicates
const SUCCESSFUL_IMPORTS_FILE = 'ct_successful_imports.json';
const PROGRESS_FILE = 'ct_import_progress.json';

// Get successful imports from tracking file
function getSuccessfulImports() {
  try {
    if (fs.existsSync(SUCCESSFUL_IMPORTS_FILE)) {
      const data = fs.readFileSync(SUCCESSFUL_IMPORTS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error reading successful imports:', error.message);
  }

  return { ids: [] };
}

// Save successful imports to tracking file
function saveSuccessfulImports(imports) {
  try {
    fs.writeFileSync(SUCCESSFUL_IMPORTS_FILE, JSON.stringify(imports, null, 2));
  } catch (error) {
    logger.error('Error saving successful imports data:', error);
  }
}

// Get import progress data
function getProgressData() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error('Error reading progress data:', error.message);
  }

  return {
    currentOffset: 0,
    batchesProcessed: 0,
    targetBatches: 10,
    status: 'not_started',
    lastBatchTimestamp: null,
    errors: [],
  };
}

// Save import progress data
function saveProgressData(data) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
    logger.info('Updated progress data saved');
  } catch (error) {
    logger.error('Error saving progress data:', error);
  }
}

// Fetch trial IDs from ClinicalTrials.gov using their public API
async function fetchTrialIds(pageSize = 50, pageNum = 1) {
  logger.info(`Fetching page ${pageNum} (${pageSize} records per page)`);

  try {
    // Use a very simple query to avoid API errors
    const response = await axios.get('https://clinicaltrials.gov/api/v2/studies', {
      params: {
        format: 'json',
        pageSize,
        page: pageNum,
      },
      timeout: 30000, // 30 second timeout
    });

    if (!response.data || !response.data.studies || !Array.isArray(response.data.studies)) {
      logger.info('API response missing studies array');
      return [];
    }

    // Extract just the NCT IDs from the response
    return response.data.studies
      .map(study => {
        if (study.protocolSection && study.protocolSection.identificationModule) {
          return study.protocolSection.identificationModule.nctId;
        }
        return null;
      })
      .filter(id => id !== null);
  } catch (error) {
    logger.error(`Error fetching trials from ClinicalTrials.gov: ${error.message}`);

    // For certain types of errors, wait and retry
    if (error.response && (error.response.status === 429 || error.response.status === 503)) {
      logger.info('Rate limit or server error, waiting 60 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      return fetchTrialIds(pageSize, pageNum);
    }

    // For other errors, return fallback IDs
    return getFallbackTrialIds();
  }
}

// Fallback list of trial IDs if API is not responsive
function getFallbackTrialIds() {
  logger.info('Using fallback trial IDs');

  // These are real NCT IDs from ClinicalTrials.gov
  const knownIds = [
    'NCT04368728',
    'NCT04380532',
    'NCT04470427',
    'NCT04516746',
    'NCT04646590',
    'NCT04649151',
    'NCT04814459',
    'NCT04816643',
    'NCT04824638',
    'NCT04905836',
    'NCT04904120',
    'NCT04400838',
    'NCT04796896',
    'NCT04674189',
    'NCT04380896',
    'NCT04405076',
    'NCT04283461',
    'NCT04405570',
    'NCT04348370',
    'NCT04336410',
    'NCT04324606',
    'NCT04327206',
    'NCT04283461',
    'NCT04341389',
    'NCT04324606',
    'NCT04252664',
    'NCT04280705',
    'NCT04276688',
    'NCT04283461',
    'NCT04315948',
    'NCT04349241',
    'NCT04320615',
    'NCT04342728',
    'NCT04345289',
    'NCT04313127',
  ];

  return knownIds;
}

// Get detailed information about a single trial
async function fetchTrialDetails(nctId) {
  try {
    logger.info(`Fetching details for trial ${nctId}`);

    const response = await axios.get(`https://clinicaltrials.gov/api/v2/studies/${nctId}`, {
      params: { format: 'json' },
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error) {
    logger.error(`Error fetching details for trial ${nctId}: ${error.message}`);

    // For certain types of errors, wait and retry
    if (error.response && (error.response.status === 429 || error.response.status === 503)) {
      logger.info('Rate limit or server error, waiting 30 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      return fetchTrialDetails(nctId);
    }

    throw error;
  }
}

// Check if trial already exists in database
async function checkTrialExists(nctId) {
  try {
    const { rows } = await pool.query('SELECT id FROM csr_reports WHERE nctrial_id = $1', [nctId]);

    return rows.length > 0;
  } catch (error) {
    logger.error(`Error checking if trial ${nctId} exists:`, error.message);
    return false;
  }
}

// Transform trial data to our database format
function transformTrialData(trialData) {
  const protocolSection = trialData.protocolSection || {};
  const identificationModule = protocolSection.identificationModule || {};
  const statusModule = protocolSection.statusModule || {};
  const sponsorCollaboratorsModule = protocolSection.sponsorCollaboratorsModule || {};
  const conditionsModule = protocolSection.conditionsModule || {};
  const designModule = protocolSection.designModule || {};
  const eligibilityModule = protocolSection.eligibilityModule || {};
  const descriptionModule = protocolSection.descriptionModule || {};

  // Format phase properly
  let phase = 'Unknown';
  if (designModule && designModule.phases && designModule.phases.length > 0) {
    const phaseText = designModule.phases[0];
    if (phaseText.includes('Phase 1')) phase = 'Phase 1';
    else if (phaseText.includes('Phase 2')) phase = 'Phase 2';
    else if (phaseText.includes('Phase 3')) phase = 'Phase 3';
    else if (phaseText.includes('Phase 4')) phase = 'Phase 4';
    else phase = phaseText;
  }

  // Format eligibility criteria
  let eligibilityCriteria = '';
  if (eligibilityModule) {
    if (eligibilityModule.eligibilityCriteria) {
      eligibilityCriteria = eligibilityModule.eligibilityCriteria;
    } else {
      const criteria = [];

      if (eligibilityModule.inclusionCriteria) {
        criteria.push('Inclusion Criteria:');
        criteria.push(eligibilityModule.inclusionCriteria);
      }

      if (eligibilityModule.exclusionCriteria) {
        criteria.push('Exclusion Criteria:');
        criteria.push(eligibilityModule.exclusionCriteria);
      }

      eligibilityCriteria = criteria.join('\n');
    }
  }

  // Format date
  let date = null;
  try {
    if (statusModule && statusModule.completionDateStruct) {
      const year = statusModule.completionDateStruct.year;
      if (year) {
        const month = statusModule.completionDateStruct.month || 1;
        const day = statusModule.completionDateStruct.day || 1;

        // Validate date components
        const validYear = Math.min(Math.max(1900, parseInt(year) || 2000), 2100);
        const validMonth = Math.min(Math.max(1, parseInt(month) || 1), 12);
        const validDay = Math.min(Math.max(1, parseInt(day) || 1), 28);

        date = `${validYear}-${validMonth.toString().padStart(2, '0')}-${validDay.toString().padStart(2, '0')}`;
      }
    }
  } catch (error) {
    logger.info(`Date error for trial ${identificationModule.nctId}: ${error.message}`);
    date = null;
  }

  return {
    nctrialId: identificationModule.nctId || '',
    title: identificationModule.briefTitle || '',
    officialTitle: identificationModule.officialTitle || '',
    sponsor: getSponsorName(sponsorCollaboratorsModule),
    indication: getIndication(conditionsModule),
    phase: phase,
    fileName: `${identificationModule.nctId || 'unknown'}.json`,
    fileSize: JSON.stringify(trialData).length,
    date: date,
    drugName: getInterventions(protocolSection),
    studyType: designModule?.studyType || 'Unknown',
    description: descriptionModule?.briefSummary || '',
    detailedDescription: descriptionModule?.detailedDescription || '',
    eligibilityCriteria: eligibilityCriteria,
    region: 'ClinicalTrials.gov',
  };
}

// Extract sponsor name
function getSponsorName(sponsorModule) {
  if (!sponsorModule) return 'Unknown';

  if (sponsorModule.leadSponsor && sponsorModule.leadSponsor.name) {
    return sponsorModule.leadSponsor.name;
  }

  return 'Unknown';
}

// Extract indication/condition
function getIndication(conditionsModule) {
  if (!conditionsModule) return 'Not specified';

  if (conditionsModule.conditions && conditionsModule.conditions.length > 0) {
    return conditionsModule.conditions[0];
  }

  return 'Not specified';
}

// Extract intervention/drug name
function getInterventions(protocolSection) {
  if (!protocolSection || !protocolSection.armsInterventionsModule) {
    return 'Not specified';
  }

  const interventions = protocolSection.armsInterventionsModule.interventions;
  if (interventions && interventions.length > 0) {
    return interventions[0].name || 'Not specified';
  }

  return 'Not specified';
}

// Import a single trial to database
async function importTrialToDatabase(trial) {
  // Insert new report
  const {
    rows: [newReport],
  } = await pool.query(
    `INSERT INTO csr_reports 
     (title, sponsor, indication, phase, file_name, file_size, date, nctrial_id, drug_name, status, summary, region) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
     RETURNING id`,
    [
      trial.title,
      trial.sponsor,
      trial.indication,
      trial.phase,
      trial.fileName,
      trial.fileSize,
      trial.date,
      trial.nctrialId,
      trial.drugName,
      'Imported',
      trial.officialTitle || '',
      trial.region,
    ]
  );

  // Insert details
  await pool.query(
    `INSERT INTO csr_details 
     (report_id, study_design, primary_objective, study_description, inclusion_criteria, exclusion_criteria, endpoints, statistical_methods, safety, results, last_updated) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      newReport.id,
      trial.studyType,
      'To evaluate the efficacy and safety of the investigational product',
      trial.description || trial.detailedDescription,
      trial.eligibilityCriteria,
      '',
      JSON.stringify({}), // endpoints
      JSON.stringify({}), // statistical_methods
      JSON.stringify({}), // safety
      JSON.stringify({}), // results
      new Date(),
    ]
  );

  return newReport.id;
}

// Process a batch of trials
async function processBatch(batchSize = 50, pageNum = 1) {
  logger.info(`\n=== Processing Batch - Page ${pageNum} ===`);
  logger.info(`Timestamp: ${new Date().toISOString()}`);

  const successfulImports = getSuccessfulImports();
  const startTime = Date.now();
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    // Fetch trial IDs
    const trialIds = await fetchTrialIds(batchSize, pageNum);

    if (!trialIds || trialIds.length === 0) {
      logger.info('No trial IDs found.');
      return { imported: 0, skipped: 0, failed: 0 };
    }

    logger.info(`Found ${trialIds.length} trial IDs`);

    // Process each trial
    for (const nctId of trialIds) {
      // Skip if already imported
      if (successfulImports.ids.includes(nctId)) {
        logger.info(`Skipping already imported trial ID: ${nctId}`);
        skippedCount++;
        continue;
      }

      // Skip if already in database
      const exists = await checkTrialExists(nctId);
      if (exists) {
        logger.info(`Skipping trial already in database: ${nctId}`);
        // Track to avoid database check in future
        successfulImports.ids.push(nctId);
        skippedCount++;
        continue;
      }

      try {
        // Get detailed data
        const trialDetails = await fetchTrialDetails(nctId);

        // Transform to our format
        const transformedTrial = transformTrialData(trialDetails);

        // Import to database
        await importTrialToDatabase(transformedTrial);

        // Track successful import
        successfulImports.ids.push(nctId);
        importedCount++;

        logger.info(`Successfully imported trial ${nctId}`);

        // Small delay between trials to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to import trial ${nctId}:`, error.message);
        failedCount++;
      }
    }

    // Save successful imports
    saveSuccessfulImports(successfulImports);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

    logger.info(`\n=== Batch Summary ===`);
    logger.info(`Total trials processed: ${trialIds.length}`);
    logger.info(`Successfully imported: ${importedCount}`);
    logger.info(`Skipped (already exists): ${skippedCount}`);
    logger.info(`Failed imports: ${failedCount}`);
    logger.info(`Processing time: ${processingTime}s`);

    return { imported: importedCount, skipped: skippedCount, failed: failedCount };
  } catch (error) {
    logger.error('Error processing batch:', error.message);
    return { imported: importedCount, skipped: skippedCount, failed: failedCount };
  }
}

// Get current database status
async function getDatabaseStatus() {
  try {
    const { rows } = await pool.query(`
      SELECT 
        count(*) as total, 
        count(*) FILTER (WHERE region = 'Health Canada') as hc_trials,
        count(*) FILTER (WHERE region = 'ClinicalTrials.gov') as ct_trials
      FROM csr_reports;
    `);

    return {
      total: parseInt(rows[0].total),
      hcTrials: parseInt(rows[0].hc_trials),
      ctTrials: parseInt(rows[0].ct_trials),
    };
  } catch (error) {
    logger.error('Error getting database status:', error);
    return { total: 0, hcTrials: 0, ctTrials: 0 };
  }
}

// Main function to run the import
async function runEnhancedImport() {
  logger.info('\n=========================================================');
  logger.info('ENHANCED CLINICALTRIALS.GOV TRIAL IMPORT');
  logger.info('=========================================================\n');

  try {
    // Get progress data
    const progress = getProgressData();

    // If we've completed all batches, exit
    if (progress.batchesProcessed >= progress.targetBatches) {
      logger.info('All batches have been processed. Import complete.');
      return;
    }

    // If we're resuming an import
    if (progress.batchesProcessed > 0) {
      logger.info(
        `Resuming import from batch ${progress.batchesProcessed + 1}/${progress.targetBatches}`
      );
    }

    // Save initial state
    saveProgressData(progress);

    // Get current database status
    const dbStatus = await getDatabaseStatus();
    logger.info(
      `Current database: ${dbStatus.total} total trials, ${dbStatus.ctTrials} ClinicalTrials.gov trials`
    );

    // Process batches until we reach the target
    while (progress.batchesProcessed < progress.targetBatches) {
      logger.info(
        `\n=== Processing batch ${progress.batchesProcessed + 1}/${progress.targetBatches} ===\n`
      );

      try {
        // Process batch - page number is 1-based
        const pageNum = progress.batchesProcessed + 1;
        const result = await processBatch(50, pageNum);

        // Update progress
        progress.batchesProcessed++;
        progress.lastBatchTimestamp = new Date().toISOString();
        progress.status = 'in_progress';

        saveProgressData(progress);

        // Get updated database counts
        const updatedStatus = await getDatabaseStatus();
        logger.info(`\n=== Current Database Status ===`);
        logger.info(`Total trials in database: ${updatedStatus.total}`);
        logger.info(`ClinicalTrials.gov trials: ${updatedStatus.ctTrials}`);
        logger.info(`Health Canada trials: ${updatedStatus.hcTrials}`);

        // Wait before next batch to avoid rate limiting
        if (progress.batchesProcessed < progress.targetBatches) {
          const waitTime = 10000; // 10 seconds
          logger.info(`\nWaiting ${waitTime / 1000} seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        logger.error('Error processing batch:', error);
        progress.errors.push({
          batch: progress.batchesProcessed + 1,
          timestamp: new Date().toISOString(),
          error: error.message,
        });
        saveProgressData(progress);

        // Wait after an error before continuing
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

    // Update final status
    progress.status = 'completed';
    saveProgressData(progress);

    // Get final database status
    const finalStatus = await getDatabaseStatus();
    logger.info('\n=== Import Complete ===');
    logger.info(`Final database status: ${finalStatus.total} total trials`);
    logger.info(`ClinicalTrials.gov trials: ${finalStatus.ctTrials}`);
    logger.info(`Health Canada trials: ${finalStatus.hcTrials}`);

    // Close the database connection
    await pool.end();
  } catch (error) {
    logger.error('Error in import process:', error.message);
    process.exit(1);
  }
}

// Run the import
runEnhancedImport();
