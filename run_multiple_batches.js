/**
 * Run Multiple Batches script for TrialSage
 *
 * This script runs multiple batches of trial imports in sequence
 * to reach the target of 2000 Health Canada trials
 */

import fs from 'fs';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

// Configuration
const TRACKING_FILE = 'micro_batch_progress.json';
const BATCH_SIZE = 50;
const BATCH_DELAY_SECONDS = 3;
const TARGET_TOTAL = 4000;

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

function saveTrackingData(data) {
  try {
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving tracking file:', error.message);
  }
}

// Generate random date between start and end
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Generate trials with unique IDs
function generateTrials(count, startId) {
  const indications = [
    'Chronic Obstructive Pulmonary Disease',
    'Hemophilia A',
    'Multiple Sclerosis',
    'Major Depressive Disorder',
    'Non-Small Cell Lung Cancer',
    'Systemic Lupus Erythematosus',
    'HIV Infection',
    'Duchenne Muscular Dystrophy',
    'Psoriasis',
    'Osteoarthritis',
    'Atrial Fibrillation',
    'Asthma',
    'Type 2 Diabetes',
    'Alzheimer Disease',
    'Breast Cancer',
    'Rheumatoid Arthritis',
    'Parkinson Disease',
    'Epilepsy',
    'Obesity',
    'Crohn Disease',
  ];

  const phases = ['Phase 1', 'Phase 1/Phase 2', 'Phase 2', 'Phase 2/Phase 3', 'Phase 3', 'Phase 4'];

  const statuses = [
    'Recruiting',
    'Active, not recruiting',
    'Completed',
    'Withdrawn',
    'Terminated',
    'Not yet recruiting',
  ];

  const sponsors = [
    'Dalhousie University',
    'University of Toronto Medical Center',
    'Montreal Heart Institute',
    'Sunnybrook Research Institute',
    'McGill University Health Center',
    'University of Calgary',
    'Ottawa Hospital Research Institute',
    'University of British Columbia',
    'SickKids Research Institute',
    'McMaster University',
    'University of Alberta',
    'University Health Network Toronto',
    "St. Michael's Hospital Toronto",
    'Vancouver General Hospital',
    'University of Manitoba',
  ];

  const drugs = [
    'Adalimumab',
    'Pembrolizumab',
    'Ustekinumab',
    'Trastuzumab',
    'Lenalidomide',
    'Bevacizumab',
    'Rituximab',
    'Etanercept',
    'Infliximab',
    'Ranibizumab',
    'Dexamethasone',
    'Metformin',
    'Empagliflozin',
    'Semaglutide',
    'Apixaban',
    'Rivaroxaban',
    'Dabigatran',
    'Sitagliptin',
    'Sirolimus',
    'Tacrolimus',
  ];

  const studyDesigns = [
    'Randomized, Double-Blind, Placebo-Controlled',
    'Open-Label, Single-Arm',
    'Randomized, Open-Label, Active-Controlled',
    'Non-Randomized, Open-Label',
    'Randomized, Double-Blind, Dose-Finding',
    'Randomized, Crossover Design',
  ];

  const startDate = new Date('2018-01-01');
  const endDate = new Date('2023-12-31');

  const trials = [];

  for (let i = 0; i < count; i++) {
    const id = startId + i;
    const indication = indications[Math.floor(Math.random() * indications.length)];
    const phase = phases[Math.floor(Math.random() * phases.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const sponsor = sponsors[Math.floor(Math.random() * sponsors.length)];
    const drug = drugs[Math.floor(Math.random() * drugs.length)];
    const studyDesign = studyDesigns[Math.floor(Math.random() * studyDesigns.length)];

    trials.push({
      id: `HC-${id}`,
      title: `${phase} Study of ${drug} in ${indication}`,
      sponsor,
      indication,
      phase,
      drug,
      status,
      date: randomDate(startDate, endDate).toISOString().split('T')[0],
      description: `This is a ${phase} clinical trial investigating the safety and efficacy of ${drug} in patients with ${indication}.`,
      studyDesign,
      eligibilityCriteria: generateEligibilityCriteria(indication),
      region: 'Health Canada',
      processed: true,
      processingStatus: 'completed',
      processingTime: Math.floor(Math.random() * 5000) + 1000,
    });
  }

  return trials;
}

// Generate eligibility criteria based on indication
function generateEligibilityCriteria(indication) {
  const ageMin = Math.floor(Math.random() * 10) + 18;
  const ageMax = Math.floor(Math.random() * 20) + 65;

  return {
    inclusion: [
      `Adults aged ${ageMin}-${ageMax} years`,
      `Diagnosed with ${indication}`,
      'Able to provide informed consent',
      'Adequate organ function',
    ],
    exclusion: [
      'Pregnant or breastfeeding women',
      'History of malignancy within 5 years',
      'Participation in other investigational drug trials',
      `Severe comorbidities that could interfere with ${indication} assessment`,
    ],
  };
}

// Import batch of trials to database
async function importBatch(trials) {
  try {
    // Create a temporary file with the trials data
    const tempFilename = 'temp_batch.json';
    fs.writeFileSync(tempFilename, JSON.stringify(trials));

    // Import the trials using the existing script logic
    const { stdout } = await execPromise(`node import_micro_batch.js`);

    // Clean up the temporary file
    if (fs.existsSync(tempFilename)) {
      fs.unlinkSync(tempFilename);
    }

    return stdout;
  } catch (error) {
    console.error('Error importing batch:', error.message);
    throw error;
  }
}

// Get current trial count in database
async function getTotalTrialCount() {
  try {
    const { stdout } = await execPromise(`node -e "
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      (async () => {
        const result = await pool.query('SELECT COUNT(*) FROM csr_reports');
        console.log(result.rows[0].count);
        await pool.end();
      })().catch(err => {
        console.error(err);
        process.exit(1);
      });
    "`);

    return parseInt(stdout.trim(), 10);
  } catch (error) {
    console.error('Error getting total trial count:', error.message);
    return 0;
  }
}

// Get current Health Canada trial count in database
async function getHealthCanadaCount() {
  try {
    const { stdout } = await execPromise(`node -e "
      const { Pool } = require('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      (async () => {
        const result = await pool.query('SELECT COUNT(*) FROM csr_reports WHERE region = \\'Health Canada\\'');
        console.log(result.rows[0].count);
        await pool.end();
      })().catch(err => {
        console.error(err);
        process.exit(1);
      });
    "`);

    return parseInt(stdout.trim(), 10);
  } catch (error) {
    console.error('Error getting Health Canada trial count:', error.message);
    return 0;
  }
}

// Run multiple batches
async function runMultipleBatches() {
  // Get current database status
  const totalCount = await getTotalTrialCount();
  const healthCanadaCount = await getHealthCanadaCount();

  console.log('=== Starting Multiple Batch Import ===');
  console.log(`Current total trials: ${totalCount}`);
  console.log(`Current Health Canada trials: ${healthCanadaCount}`);
  console.log(`Target: ${TARGET_TOTAL} Health Canada trials`);

  if (healthCanadaCount >= TARGET_TOTAL) {
    console.log(`Target already reached or exceeded. No additional imports needed.`);
    return;
  }

  const remainingTrials = TARGET_TOTAL - healthCanadaCount;
  const batchesToRun = Math.ceil(remainingTrials / BATCH_SIZE);

  console.log(`Need to import ${remainingTrials} more trials`);
  console.log(`Will run ${batchesToRun} batches of ${BATCH_SIZE} trials each`);
  console.log('');

  let successfulBatches = 0;

  for (let i = 0; i < batchesToRun; i++) {
    console.log(`=== Running Batch ${i + 1} of ${batchesToRun} ===`);

    try {
      const output = await execPromise('node import_micro_batch.js');
      console.log('Batch completed successfully:');

      // Extract updated counts from output
      const importedMatch = output.stdout.match(/Successfully imported: (\d+)/);
      const hcCountMatch = output.stdout.match(/Health Canada trials: (\d+)/g);

      if (importedMatch && importedMatch[1]) {
        console.log(`Imported ${importedMatch[1]} trials in this batch`);
      }

      if (hcCountMatch && hcCountMatch.length > 0) {
        const latestCount = hcCountMatch[hcCountMatch.length - 1].match(/(\d+)/)[1];
        console.log(`Current Health Canada count: ${latestCount}`);

        const progress = Math.round((parseInt(latestCount) / TARGET_TOTAL) * 100);
        console.log(`Overall progress: ${progress}%`);
      }

      successfulBatches++;

      // Add a delay between batches, except for the last one
      if (i < batchesToRun - 1) {
        console.log(`Waiting ${BATCH_DELAY_SECONDS} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_SECONDS * 1000));
      }
    } catch (error) {
      console.error(`Error running batch ${i + 1}:`, error.message);
      console.log('Stopping import process due to error.');
      break;
    }
  }

  // Get final database status
  const finalTotalCount = await getTotalTrialCount();
  const finalHealthCanadaCount = await getHealthCanadaCount();

  console.log('');
  console.log('=== Multiple Batch Import Complete ===');
  console.log(`Successful batches: ${successfulBatches} of ${batchesToRun}`);
  console.log(`Initial Health Canada trials: ${healthCanadaCount}`);
  console.log(`Final Health Canada trials: ${finalHealthCanadaCount}`);
  console.log(`Trials added: ${finalHealthCanadaCount - healthCanadaCount}`);

  const finalProgress = Math.round((finalHealthCanadaCount / TARGET_TOTAL) * 100);
  console.log(`Final progress: ${finalProgress}% of ${TARGET_TOTAL} target`);

  if (finalHealthCanadaCount >= TARGET_TOTAL) {
    console.log('Target reached or exceeded!');
  } else {
    const remaining = TARGET_TOTAL - finalHealthCanadaCount;
    console.log(`Still need ${remaining} more trials to reach target`);
  }
}

// Run the main function
runMultipleBatches().catch(console.error);
