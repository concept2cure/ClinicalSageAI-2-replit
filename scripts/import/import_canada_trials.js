import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Health Canada Trials Import Script for TrialSage
 *
 * This script handles importing Health Canada clinical trials from the canada_trials.json file
 * and processing them into the database.
 */

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runCanadaTrialsImport() {
  logger.info('Starting import of Health Canada trials from canada_trials.json...');

  try {
    // Read the Health Canada trials JSON file
    const trialsPath = path.join(__dirname, 'canada_trials.json');

    if (!fs.existsSync(trialsPath)) {
      logger.error('Error: canada_trials.json file not found');
      return;
    }

    const fileData = fs.readFileSync(trialsPath, 'utf8');
    const trialsData = JSON.parse(fileData);

    if (!trialsData.studies || !Array.isArray(trialsData.studies)) {
      logger.error('Error: Invalid format in canada_trials.json');
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
  } finally {
    // Close the pool
    await pool.end();
  }
}

runCanadaTrialsImport().catch(console.error);
