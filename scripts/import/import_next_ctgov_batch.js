/**
 * Enhanced ClinicalTrials.gov Batch Import Script for TrialSage
 *
 * Imports the next batch of trials from ClinicalTrials.gov
 * while preventing duplicates and handling API rate limits
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
    console.error('Error reading successful imports:', error.message);
  }

  return { ids: [] };
}

// Save successful imports to tracking file
function saveSuccessfulImports(imports) {
  try {
    fs.writeFileSync(SUCCESSFUL_IMPORTS_FILE, JSON.stringify(imports, null, 2));
  } catch (error) {
    console.error('Error saving successful imports data:', error);
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
    console.error('Error reading progress data:', error.message);
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
    console.log('Updated progress data saved');
  } catch (error) {
    console.error('Error saving progress data:', error);
  }
}

// Fetch trial IDs from ClinicalTrials.gov using their public API
async function fetchTrialIds(pageSize = 50, pageNum = 1) {
  console.log(`Fetching page ${pageNum} of ClinicalTrials.gov studies (${pageSize} per page)`);

  try {
    // Use the ClinicalTrials.gov API v2
    const response = await axios.get('https://clinicaltrials.gov/api/v2/studies', {
      params: {
        format: 'json',
        pageSize,
        page: pageNum,
      },
      timeout: 30000, // 30 second timeout
    });

    if (!response.data || !response.data.studies || !Array.isArray(response.data.studies)) {
      console.log('API response missing studies array');
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
    console.error(`Error fetching trials from ClinicalTrials.gov: ${error.message}`);

    // For certain types of errors, wait and retry
    if (error.response && (error.response.status === 429 || error.response.status === 503)) {
      console.log('Rate limit or server error, waiting 60 seconds before retrying...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      return fetchTrialIds(pageSize, pageNum);
    }

    // Return an empty array for other errors
    return [];
  }
}

// Get detailed information about a single trial
async function fetchTrialDetails(nctId) {
  try {
    console.log(`Fetching details for trial ${nctId}`);

    const response = await axios.get(`https://clinicaltrials.gov/api/v2/studies/${nctId}`, {
      params: { format: 'json' },
      timeout: 30000, // 30 second timeout
    });

    return response.data;
  } catch (error) {
    console.error(`Error fetching details for trial ${nctId}: ${error.message}`);

    // For certain types of errors, wait and retry
    if (error.response && (error.response.status === 429 || error.response.status === 503)) {
      console.log('Rate limit or server error, waiting 30 seconds before retrying...');
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
    console.error(`Error checking if trial ${nctId} exists:`, error.message);
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
    console.log(`Date error for trial ${identificationModule.nctId}: ${error.message}`);
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
async function processBatch(batchSize = 50) {
  // Get current progress
  const progress = getProgressData();
  const nextPage = progress.batchesProcessed + 1;

  console.log(`\n=== Processing Batch ${nextPage} ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Update progress status
  progress.status = 'processing';
  progress.lastBatchTimestamp = new Date().toISOString();
  saveProgressData(progress);

  const successfulImports = getSuccessfulImports();
  const startTime = Date.now();
  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  try {
    // Fetch trial IDs
    const trialIds = await fetchTrialIds(batchSize, nextPage);

    if (!trialIds || trialIds.length === 0) {
      console.log('No trial IDs found for this batch.');

      // Update progress
      progress.batchesProcessed++;
      progress.errors.push(`No trial IDs found for batch ${nextPage}`);
      progress.status = 'completed';
      saveProgressData(progress);

      return { imported: 0, skipped: 0, failed: 0 };
    }

    console.log(`Found ${trialIds.length} trial IDs`);

    // Process each trial
    for (const nctId of trialIds) {
      // Skip if already imported
      if (successfulImports.ids.includes(nctId)) {
        console.log(`Skipping already imported trial ID: ${nctId}`);
        skippedCount++;
        continue;
      }

      // Skip if already in database
      const exists = await checkTrialExists(nctId);
      if (exists) {
        console.log(`Skipping trial already in database: ${nctId}`);
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

        console.log(`Successfully imported trial ${nctId}`);

        // Small delay between trials to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to import trial ${nctId}:`, error.message);
        failedCount++;
      }
    }

    // Save successful imports
    saveSuccessfulImports(successfulImports);

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(`\n=== Batch Summary ===`);
    console.log(`Total trials processed: ${trialIds.length}`);
    console.log(`Successfully imported: ${importedCount}`);
    console.log(`Skipped (already exists): ${skippedCount}`);
    console.log(`Failed imports: ${failedCount}`);
    console.log(`Processing time: ${processingTime}s`);

    // Update progress
    progress.batchesProcessed++;
    progress.status = progress.batchesProcessed >= progress.targetBatches ? 'completed' : 'ready';
    saveProgressData(progress);

    return { imported: importedCount, skipped: skippedCount, failed: failedCount };
  } catch (error) {
    console.error('Error processing batch:', error.message);

    // Update progress with error
    progress.errors.push(`Batch ${nextPage} error: ${error.message}`);
    saveProgressData(progress);

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
    console.error('Error getting database status:', error);
    return { total: 0, hcTrials: 0, ctTrials: 0 };
  }
}

// Main function to run the import
async function runNextBatch() {
  console.log('\n=========================================================');
  console.log('CLINICALTRIALS.GOV NEXT BATCH IMPORT');
  console.log('=========================================================\n');

  try {
    // Get database status before import
    const initialStatus = await getDatabaseStatus();
    console.log(
      `Current database: ${initialStatus.total} total trials, ${initialStatus.ctTrials} ClinicalTrials.gov trials`
    );

    // Process the next batch
    const result = await processBatch(50);

    // Get database status after import
    const finalStatus = await getDatabaseStatus();

    console.log('\n=== Import Result ===');
    console.log(`Imported trials: ${result.imported}`);
    console.log(`Final database status: ${finalStatus.total} total trials`);
    console.log(`ClinicalTrials.gov trials: ${finalStatus.ctTrials}`);
    console.log(`Health Canada trials: ${finalStatus.hcTrials}`);

    // Calculate progress toward 500 target
    const ctGovTarget = 500;
    const percentComplete = ((finalStatus.ctTrials / ctGovTarget) * 100).toFixed(1);
    console.log(
      `Progress toward 500 CT.gov trials: ${finalStatus.ctTrials}/${ctGovTarget} (${percentComplete}%)`
    );

    // Close the database connection
    await pool.end();
  } catch (error) {
    console.error('Error in import process:', error.message);
    process.exit(1);
  }
}

// Run the batch import
runNextBatch();
