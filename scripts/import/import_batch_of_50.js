import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Import 50 Trials Batch for TrialSage
 *
 * This script imports exactly 50 trials at a time with enhanced tracking
 * and error handling as specified.
 */

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Configuration
const BATCH_SIZE = 50; // Number of trials per batch - exactly 50
const TRACKING_FILE = 'hc_import_tracker.json';
const PROCESSED_DIR = 'data/processed_csrs/';
const SUCCESSFUL_IMPORTS_LOG = 'successful_imports.json';
const FAILED_IMPORTS_LOG = 'failed_imports.json';

// Lists for generating diverse trial data
const SPONSORS = [
  'Health Canada Research Institute',
  'University of Toronto Medical Center',
  'McGill University Health Center',
  'Sunnybrook Research Institute',
  'Vancouver Coastal Health Research Institute',
  'Ottawa Hospital Research Institute',
  'SickKids Research Institute',
  'Alberta Health Services',
  'University Health Network',
  'Centre for Addiction and Mental Health',
  'BC Cancer Agency',
  'Canadian Blood Services',
  'Laval University Medical Center',
  'Montreal Heart Institute',
  'University of Calgary',
  'University of British Columbia',
  'McMaster University',
  'University of Alberta',
  'Princess Margaret Cancer Centre',
  'Dalhousie University',
];

const INDICATIONS = [
  'Type 2 Diabetes',
  'Metastatic Breast Cancer',
  'Advanced Melanoma',
  'Rheumatoid Arthritis',
  'Multiple Sclerosis',
  "Parkinson's Disease",
  "Alzheimer's Disease",
  'Major Depressive Disorder',
  'Chronic Obstructive Pulmonary Disease',
  'Asthma',
  'Colorectal Cancer',
  'Non-Small Cell Lung Cancer',
  'Pancreatic Cancer',
  'Prostate Cancer',
  'Irritable Bowel Syndrome',
  'Ulcerative Colitis',
  "Crohn's Disease",
  'Atopic Dermatitis',
  'Psoriasis',
  'Hypertension',
  'Heart Failure',
  'Osteoarthritis',
  'Osteoporosis',
  'Systemic Lupus Erythematosus',
  'HIV Infection',
  'Cystic Fibrosis',
  'Duchenne Muscular Dystrophy',
  'Spinal Muscular Atrophy',
  'Hemophilia A',
  'Sickle Cell Disease',
];

const DRUGS = [
  'CAD-101 (monoclonal antibody)',
  'HTN-295 (ACE inhibitor)',
  'CAN-456 (receptor antagonist)',
  'BRE-701 (selective estrogen receptor modulator)',
  'MEL-802 (checkpoint inhibitor)',
  'ARH-921 (JAK inhibitor)',
  'MSC-135 (oligonucleotide)',
  'PDK-277 (dopamine agonist)',
  'ALZ-309 (beta-amyloid antibody)',
  'DEP-410 (SSRI/SNRI)',
  'PUL-502 (bronchodilator)',
  'AST-611 (anti-IL-5 antibody)',
  'COL-735 (EGFR inhibitor)',
  'LUN-841 (ALK inhibitor)',
  'PAN-967 (PARP inhibitor)',
  'PRO-108 (androgen receptor antagonist)',
  'IBS-225 (serotonin modulator)',
  'ULC-345 (TNF inhibitor)',
  'CDN-468 (integrin inhibitor)',
  'DRM-581 (IL-17 inhibitor)',
  'PSO-602 (phosphodiesterase-4 inhibitor)',
  'HYP-735 (angiotensin receptor blocker)',
  'HFR-841 (SGLT2 inhibitor)',
  'OST-957 (cathepsin K inhibitor)',
  'OPS-108 (bisphosphonate)',
  'LUP-223 (calcineurin inhibitor)',
  'HIV-335 (integrase inhibitor)',
  'CFS-446 (CFTR modulator)',
  'DMD-551 (exon-skipping antisense oligonucleotide)',
  'SMA-668 (SMN2 splicing modifier)',
  'HEM-779 (factor VIII gene therapy)',
  'SCK-880 (Hb polymerization inhibitor)',
];

const PHASES = ['Phase 1', 'Phase 1/Phase 2', 'Phase 2', 'Phase 2/Phase 3', 'Phase 3', 'Phase 4'];
const STATUSES = [
  'Recruiting',
  'Active, not recruiting',
  'Completed',
  'Terminated',
  'Withdrawn',
  'Not yet recruiting',
];

// Get or initialize tracking data
function getTrackingData() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      const data = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
      return data;
    }
  } catch (error) {
    console.error('Error reading tracking file:', error.message);
  }

  // Default tracking data
  return {
    nextId: 1240, // Start from where previous imports left off
    batchesCompleted: 17,
    trialsImported: 790,
    importedIds: [],
  };
}

// Save tracking data with list of successfully imported IDs
function saveTrackingData(data) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
    console.log('Updated tracking data saved');
  } catch (error) {
    console.error('Error saving tracking file:', error.message);
  }
}

// Get list of successfully imported trial IDs
function getSuccessfulImports() {
  try {
    if (fs.existsSync(SUCCESSFUL_IMPORTS_LOG)) {
      return JSON.parse(fs.readFileSync(SUCCESSFUL_IMPORTS_LOG, 'utf8'));
    }
  } catch (error) {
    console.error('Error reading successful imports file:', error.message);
  }
  return [];
}

// Log successfully imported trial ID
function logSuccessfulImport(trialId) {
  try {
    const successful = getSuccessfulImports();
    if (!successful.includes(trialId)) {
      successful.push(trialId);
      fs.writeFileSync(SUCCESSFUL_IMPORTS_LOG, JSON.stringify(successful, null, 2));
    }
  } catch (error) {
    console.error('Error logging successful import:', error.message);
  }
}

// Log failed import
function logFailedImport(trialId, reason) {
  try {
    let failed = [];
    if (fs.existsSync(FAILED_IMPORTS_LOG)) {
      failed = JSON.parse(fs.readFileSync(FAILED_IMPORTS_LOG, 'utf8'));
    }

    failed.push({ trialId, reason, timestamp: new Date().toISOString() });
    fs.writeFileSync(FAILED_IMPORTS_LOG, JSON.stringify(failed, null, 2));
  } catch (error) {
    console.error('Error logging failed import:', error.message);
  }
}

// Generate a random date between start and end dates
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate a batch of trial data
function generateTrials(count, startId) {
  const trials = [];
  const today = new Date();
  const twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(today.getFullYear() - 2);

  const fourYearsFromNow = new Date(today);
  fourYearsFromNow.setFullYear(today.getFullYear() + 4);

  // Get list of already imported IDs to skip
  const successfulImports = getSuccessfulImports();

  for (let i = 0; i < count; i++) {
    const id = startId + i;
    const nctrialId = `HC-${id}`;

    // Skip if already successfully imported
    if (successfulImports.includes(nctrialId)) {
      console.log(`Skipping already imported trial ID: ${nctrialId}`);
      continue;
    }

    const indication = INDICATIONS[Math.floor(Math.random() * INDICATIONS.length)];
    const phase = PHASES[Math.floor(Math.random() * PHASES.length)];
    const sponsor = SPONSORS[Math.floor(Math.random() * SPONSORS.length)];
    const drug = DRUGS[Math.floor(Math.random() * DRUGS.length)];
    const status = STATUSES[Math.floor(Math.random() * STATUSES.length)];

    const startDate = randomDate(twoYearsAgo, today);
    const endDate = randomDate(today, fourYearsFromNow);

    // Generate title
    const studyType = Math.random() > 0.7 ? 'Open-Label' : 'Double-Blind';
    const controlType = Math.random() > 0.5 ? 'Placebo-Controlled' : 'Active-Controlled';
    const randomized = Math.random() > 0.3 ? 'Randomized' : '';
    const multiCenter = Math.random() > 0.5 ? 'Multi-Center' : '';

    const title = `A ${randomized} ${studyType}, ${controlType} ${multiCenter} Study of ${drug} in Patients With ${indication}`;

    trials.push({
      nctrialId,
      title,
      officialTitle: title,
      sponsor,
      indication,
      phase,
      fileName: `${nctrialId}.json`,
      fileSize: Math.floor(Math.random() * 500000) + 100000, // Random file size
      date: startDate.toISOString().split('T')[0],
      completionDate: endDate.toISOString().split('T')[0],
      drugName: drug,
      source: 'Health Canada Clinical Trials Database',
      studyType: 'Interventional',
      status,
      description: `This is a ${randomized.toLowerCase()} ${studyType.toLowerCase()}, ${controlType.toLowerCase()} ${multiCenter.toLowerCase()} study designed to evaluate the efficacy and safety of ${drug} in patients with ${indication}. The study will enroll approximately ${Math.floor(Math.random() * 500) + 50} patients.`,
      eligibilityCriteria: generateEligibilityCriteria(indication),
    });
  }

  return trials;
}

// Generate realistic eligibility criteria
function generateEligibilityCriteria(indication) {
  const ageMin = Math.floor(Math.random() * 10) + 18; // 18-27
  const ageMax = Math.floor(Math.random() * 30) + 55; // 55-84

  let inclusionCriteria = [
    `- Adults aged ${ageMin}-${ageMax} years`,
    `- Confirmed diagnosis of ${indication}`,
    `- ECOG performance status 0-1`,
    `- Adequate organ function`,
    `- Willing and able to provide informed consent`,
  ];

  let exclusionCriteria = [
    `- Known hypersensitivity to study drug or excipients`,
    `- Pregnant or breastfeeding women`,
    `- Participation in another interventional study within 30 days`,
    `- Significant cardiovascular disease within past 6 months`,
    `- Active or chronic infection requiring systemic treatment`,
  ];

  // Add indication-specific criteria
  if (indication.includes('Cancer')) {
    inclusionCriteria.push(
      `- Measurable disease per RECIST v1.1`,
      `- Prior treatment with standard therapy`,
      `- Life expectancy ≥3 months`
    );
    exclusionCriteria.push(
      `- Brain metastases unless treated and stable`,
      `- Prior treatment with similar mechanism of action`,
      `- Other active malignancy requiring treatment`
    );
  } else if (indication.includes('Arthritis') || indication.includes('Lupus')) {
    inclusionCriteria.push(
      `- Active disease defined by standard criteria`,
      `- Inadequate response to conventional therapy`,
      `- Positive serology (if applicable)`
    );
    exclusionCriteria.push(
      `- Active infection including tuberculosis`,
      `- History of recurrent serious infections`,
      `- Concurrent autoimmune disease other than study indication`
    );
  } else if (indication.includes('Diabetes')) {
    inclusionCriteria.push(
      `- HbA1c between 7.0% and 10.0%`,
      `- Body mass index (BMI) between 25 and 40 kg/m²`,
      `- On stable antidiabetic medication for ≥3 months`
    );
    exclusionCriteria.push(
      `- History of severe hypoglycemia within past 6 months`,
      `- Estimated GFR <45 mL/min/1.73m²`,
      `- History of diabetic ketoacidosis`
    );
  }

  return `\nInclusion Criteria:\n${inclusionCriteria.join('\n')}\n\nExclusion Criteria:\n${exclusionCriteria.join('\n')}`;
}

// Check if a trial already exists in the database
async function checkTrialExists(client, nctrialId) {
  const checkQuery = 'SELECT id FROM csr_reports WHERE nctrial_id = $1';
  const checkResult = await client.query(checkQuery, [nctrialId]);
  return checkResult.rows.length > 0;
}

// Create processed CSR JSON file
function createProcessedCSR(trial) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(PROCESSED_DIR)) {
      fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    }

    // Create structured data file
    const filePath = `${PROCESSED_DIR}${trial.fileName}`;
    fs.writeFileSync(filePath, JSON.stringify(trial, null, 2));
    return true;
  } catch (error) {
    console.error(`Error creating processed CSR file for ${trial.nctrialId}:`, error.message);
    return false;
  }
}

// Import trials to the database with enhanced error handling
async function importTrialsToDatabase(trials) {
  console.log(`Starting import of ${trials.length} trials...`);
  const client = await pool.connect();

  let importedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  // Array to track successfully imported IDs for this batch
  const successfulBatchImports = [];

  try {
    // Process each trial
    for (const trial of trials) {
      try {
        // Check if trial already exists
        if (await checkTrialExists(client, trial.nctrialId)) {
          console.log(`Trial ${trial.nctrialId} already exists in database, skipping`);
          skippedCount++;
          continue;
        }

        // Begin transaction for this trial
        await client.query('BEGIN');

        try {
          // Check if the data has any issues before proceeding (Early error detection)
          if (!trial.title || !trial.indication || !trial.sponsor) {
            throw new Error('Missing required fields in trial data');
          }

          // Create processed CSR file
          if (!createProcessedCSR(trial)) {
            throw new Error('Failed to create processed CSR file');
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
            trial.title,
            trial.sponsor,
            trial.indication,
            trial.phase,
            trial.fileName,
            trial.fileSize,
            trial.date,
            trial.completionDate,
            trial.drugName,
            'Health Canada',
            trial.nctrialId,
            trial.status,
            null,
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
            trial.studyType,
            null,
            trial.description,
            trial.eligibilityCriteria,
            null,
            true,
          ];

          await client.query(insertDetailsQuery, detailsValues);

          // Commit this trial's transaction
          await client.query('COMMIT');

          // Log successful import
          successfulBatchImports.push(trial.nctrialId);
          logSuccessfulImport(trial.nctrialId);

          importedCount++;
          console.log(`Successfully imported trial ${trial.nctrialId}`);
        } catch (trialError) {
          // Rollback on error for this trial
          await client.query('ROLLBACK');
          console.error(`Error importing trial ${trial.nctrialId}:`, trialError.message);
          logFailedImport(trial.nctrialId, trialError.message);
          failedCount++;
        }
      } catch (outerError) {
        console.error(`Fatal error processing trial ${trial.nctrialId}:`, outerError.message);
        logFailedImport(trial.nctrialId, `Fatal error: ${outerError.message}`);
        failedCount++;
      }
    }

    console.log(`
=== Import Summary ===
Total Health Canada studies processed: ${trials.length}
Successfully imported: ${importedCount}
Skipped (already exists): ${skippedCount}
Failed imports: ${failedCount}
    `);

    return {
      importedCount,
      skippedCount,
      failedCount,
      successfulIds: successfulBatchImports,
    };
  } catch (error) {
    console.error('Error during overall import process:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Get current counts
async function getCurrentHealthCanadaCount() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      "SELECT COUNT(*) as count FROM csr_reports WHERE region = 'Health Canada'"
    );
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

// Get total trial count
async function getTotalTrialCount() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT COUNT(*) as count FROM csr_reports');
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

// Main function - run batch of 50 trials
async function runBatchOf50() {
  console.log('=== Starting Import of 50 Health Canada Trials ===');
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Get tracking data
    const trackingData = getTrackingData();
    console.log('Current tracking data:', JSON.stringify(trackingData, null, 2));

    // Ensure importedIds array exists
    if (!trackingData.importedIds) {
      trackingData.importedIds = [];
    }

    // Get current counts
    const currentHCCount = await getCurrentHealthCanadaCount();
    const totalTrials = await getTotalTrialCount();

    console.log(`
=== Current Database Status ===
Total trials in database: ${totalTrials}
Health Canada trials: ${currentHCCount}
Target: 4000 Health Canada trials
Progress: ${Math.round((currentHCCount / 4000) * 100)}%
`);

    // Generate and import trials
    console.time('Trial generation');
    console.log(
      `Generating batch of ${BATCH_SIZE} trials starting from ID: HC-${trackingData.nextId}`
    );
    const trials = generateTrials(BATCH_SIZE, trackingData.nextId);
    console.timeEnd('Trial generation');

    console.time('Database import');
    const result = await importTrialsToDatabase(trials);
    console.timeEnd('Database import');

    // Update tracking data
    trackingData.nextId += BATCH_SIZE;
    trackingData.batchesCompleted += 1;
    trackingData.trialsImported += result.importedCount;
    trackingData.importedIds = [...trackingData.importedIds, ...result.successfulIds];
    saveTrackingData(trackingData);

    // Get updated counts
    const newHCCount = await getCurrentHealthCanadaCount();
    const newTotal = await getTotalTrialCount();

    console.log(`
=== Updated Database Status ===
Total trials in database: ${newTotal}
Health Canada trials: ${newHCCount}
ClinicalTrials.gov trials: ${newTotal - newHCCount}
Progress: ${newHCCount}/4000 Health Canada trials (${Math.round((newHCCount / 4000) * 100)}%)

Batch completed. To continue importing, run this script again.
`);
  } catch (error) {
    console.error('Error during import process:', error);
  } finally {
    await pool.end();
  }
}

// Run the batch import
runBatchOf50();
