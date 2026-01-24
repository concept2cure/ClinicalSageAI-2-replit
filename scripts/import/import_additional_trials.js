import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mass Import Script for TrialSage
 *
 * This script handles importing additional trials from the additional_trials.json file
 * and processing them into the database.
 */

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMassImport() {
  console.log('Starting import of additional trials from additional_trials.json...');

  try {
    // Read the additional trials JSON file
    const trialsPath = path.join(__dirname, 'additional_trials.json');

    if (!fs.existsSync(trialsPath)) {
      console.error('Error: additional_trials.json file not found');
      return;
    }

    const fileData = fs.readFileSync(trialsPath, 'utf8');
    const trialsData = JSON.parse(fileData);

    if (!trialsData.studies || !Array.isArray(trialsData.studies)) {
      console.error('Error: Invalid format in additional_trials.json');
      return;
    }

    console.log(`Found ${trialsData.studies.length} studies to import`);

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
          // Check if a report with this NCT ID already exists
          const checkQuery = 'SELECT id FROM csr_reports WHERE nctrial_id = $1';
          const checkResult = await client.query(checkQuery, [study.nctrialId]);

          if (checkResult.rows.length > 0) {
            console.log(`Skipping ${study.nctrialId} - already exists in database`);
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
            'ClinicalTrials.gov API v2', // region
            study.nctrialId || '',
            'Imported', // status
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
            console.log(`Imported ${importedCount} studies so far...`);
          }
        } catch (error) {
          console.error(`Error importing study ${study.nctrialId}:`, error.message);
          skippedCount++;
        }
      }

      // Commit transaction
      await client.query('COMMIT');

      console.log(`
=== Import Summary ===
Total studies processed: ${trialsData.studies.length}
Successfully imported: ${importedCount}
Skipped (already exists or error): ${skippedCount}
      `);
    } catch (error) {
      // Rollback transaction on error
      await client.query('ROLLBACK');
      console.error('Error during transaction:', error.message);
    } finally {
      // Release the client
      client.release();
    }
  } catch (error) {
    console.error('Error during import process:', error.message);
  } finally {
    // Close the pool
    await pool.end();
  }
}

runMassImport().catch(console.error);
