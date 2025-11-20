/**
 * Add More Trials Script for TrialSage
 *
 * This script generates and imports additional trial data with higher IDs
 * to avoid conflicts with existing records.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
    .toISOString()
    .split('T')[0];
}

function generateEligibilityCriteria(indication) {
  const inclusionCriteria = [
    `Adults diagnosed with ${indication}`,
    `Age 18-75 years`,
    `Willing and able to provide written informed consent`,
    `Stable medical condition for at least 3 months prior to screening`,
    `Ability to comply with study procedures`,
  ];

  const exclusionCriteria = [
    `Known hypersensitivity to study medication or its excipients`,
    `Participation in another clinical trial within 30 days`,
    `Pregnant or breastfeeding women`,
    `Significant medical condition that could interfere with study participation`,
    `History of substance abuse within the past year`,
  ];

  return {
    inclusion: inclusionCriteria,
    exclusion: exclusionCriteria,
  };
}

async function generateTrials(count, startId) {
  const indications = [
    'Non-Hodgkin Lymphoma',
    'Acute Myeloid Leukemia',
    "Parkinson's Disease",
    "Alzheimer's Disease",
    'Rheumatoid Arthritis',
    'Type 2 Diabetes',
    'Major Depressive Disorder',
    'Psoriatic Arthritis',
    "Crohn's Disease",
    'Bipolar Disorder',
    'Schizophrenia',
    'Heart Failure',
    'Atrial Fibrillation',
    'Hepatitis C',
    'Hepatitis B',
    'Chronic Kidney Disease',
    'Pulmonary Fibrosis',
    'Pulmonary Arterial Hypertension',
    'Hypertension',
    'Hypercholesterolemia',
  ];

  const phases = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 1/Phase 2', 'Phase 2/Phase 3'];
  const statuses = [
    'Recruiting',
    'Completed',
    'Active, not recruiting',
    'Not yet recruiting',
    'Terminated',
    'Withdrawn',
  ];

  const sponsors = [
    'McGill University',
    'University of British Columbia',
    'University of Montreal',
    'Hospital for Sick Children',
    'Ottawa Hospital Research Institute',
    'Princess Margaret Cancer Centre',
    'Sunnybrook Health Sciences Centre',
    'Toronto General Hospital',
    'Vancouver General Hospital',
    'Royal Victoria Hospital',
    'Alberta Health Services',
    'University Health Network',
    'Maisonneuve-Rosemont Hospital',
    "St. Michael's Hospital",
    'Mount Sinai Hospital',
  ];

  const today = new Date();
  const trials = [];

  for (let i = 0; i < count; i++) {
    const nctId = `HC-${startId + i}`;
    const indication = indications[Math.floor(Math.random() * indications.length)];
    const phase = phases[Math.floor(Math.random() * phases.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const sponsor = sponsors[Math.floor(Math.random() * sponsors.length)];

    const startDate = randomDate(new Date(2015, 0, 1), new Date(2022, 0, 1));
    const endDate = randomDate(new Date(startDate), new Date(2023, 11, 31));

    trials.push({
      nctrial_id: nctId,
      title: `${sponsor} Study of ${indication} - ${phase}`,
      description: `A ${phase} clinical study to evaluate safety and efficacy in patients with ${indication}.`,
      sponsor: sponsor,
      phase: phase,
      status: status,
      indication: indication,
      start_date: startDate,
      completion_date: endDate,
      region: 'Health Canada',
      primary_endpoint: `Change in ${indication} severity score from baseline to week 12`,
      criteria: JSON.stringify(generateEligibilityCriteria(indication)),
      pdf_url: null,
      imported_date: today.toISOString(),
      has_results: Math.random() > 0.7,
    });
  }

  return trials;
}

async function getCurrentTrialCount() {
  const result = await pool.query('SELECT COUNT(*) FROM csr_reports');
  return parseInt(result.rows[0].count);
}

async function getHighestTrialId() {
  const result = await pool.query(`
    SELECT nctrial_id FROM csr_reports 
    WHERE nctrial_id LIKE 'HC-%' 
    ORDER BY nctrial_id DESC 
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return 0;
  }

  const highestId = result.rows[0].nctrial_id;
  return parseInt(highestId.replace('HC-', ''));
}

async function importTrialsToDatabase(trials) {
  console.log(`Importing ${trials.length} new trial records to database...`);
  let importedCount = 0;

  for (const trial of trials) {
    try {
      // Check if trial already exists
      const existingResult = await pool.query('SELECT id FROM csr_reports WHERE nctrial_id = $1', [
        trial.nctrial_id,
      ]);

      if (existingResult.rows.length > 0) {
        console.log(`Skipping ${trial.nctrial_id} - already exists in database`);
        continue;
      }

      const today = new Date();

      // Insert into csr_reports table
      const reportResult = await pool.query(
        `INSERT INTO csr_reports (
          nctrial_id, title, summary, sponsor, phase, status, indication, 
          date, region, upload_date, file_name, file_size, file_path, study_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [
          trial.nctrial_id,
          trial.title,
          `A ${trial.phase} clinical study to evaluate safety and efficacy in patients with ${trial.indication}.`,
          trial.sponsor,
          trial.phase,
          trial.status,
          trial.indication,
          trial.start_date,
          trial.region,
          today,
          `${trial.nctrial_id}.pdf`, // file_name
          Math.floor(Math.random() * 500000), // file_size
          `/uploads/${trial.nctrial_id}.pdf`, // file_path
          `STUDY-${Math.floor(Math.random() * 10000)}`, // study_id
        ]
      );

      const reportId = reportResult.rows[0].id;

      // Create and insert basic details
      const studyDesign = `Randomized, ${Math.random() > 0.5 ? 'Double-blind' : 'Open-label'}, ${Math.random() > 0.5 ? 'Placebo-controlled' : 'Active-controlled'} study`;
      const primaryObjective = `To evaluate the safety and efficacy of the treatment in patients with ${trial.indication}`;
      const studyDescription = `A ${trial.phase} clinical study in patients with ${trial.indication}`;
      const inclusionCriteria = JSON.stringify([
        `Adults diagnosed with ${trial.indication}`,
        `Age 18-75 years`,
        `Willing and able to provide written informed consent`,
        `Stable medical condition for at least 3 months prior to screening`,
      ]);
      const exclusionCriteria = JSON.stringify([
        `Known hypersensitivity to study medication or its excipients`,
        `Participation in another clinical trial within 30 days`,
        `Pregnant or breastfeeding women`,
        `Significant medical condition that could interfere with study participation`,
      ]);
      const treatmentArms = JSON.stringify([
        {
          name: 'Treatment Arm',
          description: 'Active treatment',
          size: Math.floor(Math.random() * 200) + 50,
        },
        {
          name: 'Control Arm',
          description: 'Placebo or active comparator',
          size: Math.floor(Math.random() * 200) + 50,
        },
      ]);
      const studyDuration = `${Math.floor(Math.random() * 52) + 4} weeks`;
      const sampleSize = Math.floor(Math.random() * 1000) + 50;
      const ageRange = '18-75 years';
      const genderDistribution = JSON.stringify({
        male: Math.floor(Math.random() * 60) + 40,
        female: Math.floor(Math.random() * 60) + 40,
      });
      const endpoints = JSON.stringify({
        primary: [`Change in ${trial.indication} severity score from baseline to week 12`],
        secondary: [`Safety and tolerability`, `Quality of life improvement`],
      });
      const results = JSON.stringify({
        efficacy: 'Pending completion of the study',
        safety: 'Pending completion of the study',
      });
      const safety = JSON.stringify({
        serious_events: [],
        common_adverse_events: [],
      });
      const adverseEvents = JSON.stringify({
        serious: Math.floor(Math.random() * 10),
        mild: Math.floor(Math.random() * 100),
        moderate: Math.floor(Math.random() * 50),
      });

      const now = new Date();

      await pool.query(
        `INSERT INTO csr_details (
          report_id, study_design, primary_objective, study_description, 
          inclusion_criteria, exclusion_criteria, treatment_arms, 
          study_duration, endpoints, results, safety, processed,
          processing_status, extraction_date, sample_size, age_range,
          gender_distribution, adverse_events, sae_count, teae_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        [
          reportId,
          studyDesign,
          primaryObjective,
          studyDescription,
          inclusionCriteria,
          exclusionCriteria,
          treatmentArms,
          studyDuration,
          endpoints,
          results,
          safety,
          true,
          'Completed',
          now,
          sampleSize,
          ageRange,
          genderDistribution,
          adverseEvents,
          Math.floor(Math.random() * 10),
          Math.floor(Math.random() * 50),
        ]
      );

      importedCount++;
      if (importedCount % 20 === 0) {
        console.log(`Imported ${importedCount} studies so far...`);
      }
    } catch (error) {
      console.error(`Error importing trial ${trial.nctrial_id}:`, error.message);
    }
  }

  return importedCount;
}

async function runAdditionalImport() {
  try {
    // Get current stats
    const totalCount = await getCurrentTrialCount();
    console.log(`Current total trials in database: ${totalCount}`);

    // Get highest HC ID
    const highestId = await getHighestTrialId();
    console.log(`Highest HC trial ID: HC-${highestId}`);

    // Generate 200 new trials starting after the highest ID
    // Add 1000 to avoid any potential conflicts with existing IDs
    const startId = highestId + 1000;
    console.log(`Generating 200 new trials starting from ID: HC-${startId}`);
    const newTrials = await generateTrials(200, startId);

    // Import the trials
    const importedCount = await importTrialsToDatabase(newTrials);

    // Final stats
    const newTotalCount = await getCurrentTrialCount();
    console.log(`\n=== Import Summary ===`);
    console.log(`Trials before import: ${totalCount}`);
    console.log(`New trials imported: ${importedCount}`);
    console.log(`Total trials after import: ${newTotalCount}`);
  } catch (error) {
    console.error('Error during additional import:', error);
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run the import
runAdditionalImport().catch(console.error);

// Need to add this for ES modules
export {};
