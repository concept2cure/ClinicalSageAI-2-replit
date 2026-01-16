/**
 * DEPRECATED
 * Synthetic generators are disabled in Lumen Cortex consolidation.
 * Use real ingestion pipelines (Hunters + CSR Intelligence Library).
 */

console.warn('[DEPRECATED] batch_import_large_canada.js is disabled.');
process.exit(1);

// Generate realistic eligibility criteria based on the indication
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

// Import trials to the database with optimized transactions
async function importTrialsToDatabase(trials) {
  console.log(`Starting import of ${trials.length} trials...`);
  const client = await pool.connect();

  let importedCount = 0;
  let skippedCount = 0;

  try {
    // Process trials in smaller transaction batches to avoid overloading the DB
    for (let i = 0; i < trials.length; i += TRANSACTION_SIZE) {
      const batchEnd = Math.min(i + TRANSACTION_SIZE, trials.length);
      const trialBatch = trials.slice(i, batchEnd);

      console.log(`Processing batch ${i / TRANSACTION_SIZE + 1} (${i} to ${batchEnd - 1})...`);

      // Begin transaction
      await client.query('BEGIN');

      try {
        // Process each trial in this transaction batch
        for (const trial of trialBatch) {
          // Check if trial already exists
          if (await checkTrialExists(client, trial.nctrialId)) {
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

          importedCount++;
        }

        // Commit this batch
        await client.query('COMMIT');
        console.log(
          `Successfully committed batch ${i / TRANSACTION_SIZE + 1} (imported ${importedCount} so far)`
        );
      } catch (error) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error(`Error during batch ${i / TRANSACTION_SIZE + 1}:`, error.message);
        // Continue with next batch
      }
    }

    console.log(`
=== Import Summary ===
Total Health Canada studies processed: ${trials.length}
Successfully imported: ${importedCount}
Skipped (already exists or error): ${skippedCount}
    `);

    return { importedCount, skippedCount };
  } catch (error) {
    console.error('Error during overall import process:', error.message);
    throw error;
  } finally {
    // Release the client
    client.release();
  }
}

// Get current total count of trials from Health Canada
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

// Get current total count of all trials
async function getTotalTrialCount() {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT COUNT(*) as count FROM csr_reports');
    return parseInt(result.rows[0].count);
  } finally {
    client.release();
  }
}

// Main function - for optimized large batch import
async function runLargeBatchImport() {
  console.log('Starting large-scale Health Canada trial import process...');

  try {
    // Get tracking data
    const trackingData = getTrackingData();
    console.log('Current tracking data:', trackingData);

    // Get current counts
    const currentHCCount = await getCurrentHealthCanadaCount();
    const totalTrials = await getTotalTrialCount();

    console.log(`
=== Current Database Status ===
Total trials in database: ${totalTrials}
Health Canada trials: ${currentHCCount}
Target: ${TARGET_COUNT} Health Canada trials
Progress: ${Math.round((currentHCCount / TARGET_COUNT) * 100)}%
`);

    const remainingToImport = TARGET_COUNT - currentHCCount;
    if (remainingToImport <= 0) {
      console.log(
        `Target of ${TARGET_COUNT} Health Canada trials already reached or exceeded (${currentHCCount}/${TARGET_COUNT}). No import needed.`
      );
      await pool.end();
      return;
    }

    // Determine batch size for this run
    const batchSize = Math.min(BATCH_SIZE, remainingToImport);
    const nextId = trackingData.nextId;

    console.log(`
=== Running Batch ${trackingData.batchesCompleted + 1} ===
Importing ${batchSize} trials starting from ID: HC-${nextId}
`);

    // Generate and import trials
    console.time('Trial generation');
    console.log('Generating trial data...');
    const trials = generateTrials(batchSize, nextId);
    console.timeEnd('Trial generation');

    console.time('Database import');
    const result = await importTrialsToDatabase(trials);
    console.timeEnd('Database import');

    // Update tracking data
    trackingData.nextId += batchSize;
    trackingData.batchesCompleted += 1;
    trackingData.trialsImported += result.importedCount;
    saveTrackingData(trackingData);

    // Get updated counts
    const newHCCount = await getCurrentHealthCanadaCount();
    const newTotal = await getTotalTrialCount();

    console.log(`
=== Updated Database Status ===
Total trials in database: ${newTotal}
Health Canada trials: ${newHCCount}
ClinicalTrials.gov trials: ${newTotal - newHCCount}
Progress: ${newHCCount}/${TARGET_COUNT} Health Canada trials (${Math.round((newHCCount / TARGET_COUNT) * 100)}%)

To continue importing, run this script again.
`);
  } catch (error) {
    console.error('Error during import process:', error.message);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the import
runLargeBatchImport().catch(console.error);
