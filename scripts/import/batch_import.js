#!/usr/bin/env node

/**
 * Direct Import Script for TrialSage
 *
 * This script handles importing XML files from the attached_assets directory
 * and processing them into the database.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure neon with WebSocket
neonConfig.webSocketConstructor = ws;

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Make sure we have the DATABASE_URL environment variable
if (!process.env.DATABASE_URL) {
  logger.error('DATABASE_URL environment variable not set');
  process.exit(1);
}

// Connect to the database
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create a function to run the import process
async function runImport() {
  try {
    logger.info('Starting batch import process...');

    // Check if attached_assets directory exists
    const assetsDir = path.join(process.cwd(), 'attached_assets');
    if (!fs.existsSync(assetsDir)) {
      logger.error('attached_assets directory not found');
      process.exit(1);
    }

    // Get all XML files that match NCT*.xml
    const xmlFiles = fs
      .readdirSync(assetsDir)
      .filter(file => file.startsWith('NCT') && file.endsWith('.xml'));

    logger.info(`Found ${xmlFiles.length} NCT XML files in ${assetsDir}`);

    if (xmlFiles.length === 0) {
      logger.error('No NCT XML files found in attached_assets directory');
      process.exit(1);
    }

    // Run the Python script to process the XML files
    logger.info('Running Python script to process XML files...');
    execSync(`python3 server/scripts/import_nct_xml.py ${assetsDir}`, { stdio: 'inherit' });

    // Check if processed_trials.json was created
    if (!fs.existsSync('processed_trials.json')) {
      logger.error('Failed to generate processed_trials.json');
      process.exit(1);
    }

    // Read and parse the processed data
    const processedData = JSON.parse(fs.readFileSync('processed_trials.json', 'utf-8'));

    if (!processedData.studies || !Array.isArray(processedData.studies)) {
      logger.error('Invalid format in processed_trials.json');
      process.exit(1);
    }

    logger.info(
      `Successfully processed ${processedData.processed_count} trials. Importing to database...`
    );

    // Import each study into the database
    let importedCount = 0;

    for (const study of processedData.studies) {
      try {
        // Check if this study already exists in the database
        const { rows: existingReports } = await pool.query(
          'SELECT id FROM csr_reports WHERE nctrial_id = $1',
          [study.nctrialId]
        );

        if (existingReports.length > 0) {
          logger.info(`Study ${study.nctrialId} already exists in database, skipping...`);
          continue;
        }

        // Insert new report
        const {
          rows: [newReport],
        } = await pool.query(
          `INSERT INTO csr_reports 
           (title, sponsor, indication, phase, file_name, file_size, date, nctrial_id, drug_name, status, summary) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
           RETURNING id`,
          [
            study.title,
            study.sponsor,
            study.indication,
            study.phase,
            study.fileName,
            study.fileSize,
            study.date,
            study.nctrialId,
            study.drugName,
            'Imported',
            study.officialTitle || '', // Use officialTitle as summary
          ]
        );

        // Insert details
        await pool.query(
          `INSERT INTO csr_details 
           (report_id, study_design, primary_objective, study_description, inclusion_criteria, exclusion_criteria, endpoints, statistical_methods, safety, results, last_updated) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            newReport.id,
            study.studyType,
            'To evaluate the efficacy and safety of the investigational product',
            study.description || study.detailedDescription,
            study.eligibilityCriteria,
            '',
            JSON.stringify({}), // endpoints
            JSON.stringify({}), // statistical_methods
            JSON.stringify({}), // safety
            JSON.stringify({}), // results
            new Date(),
          ]
        );

        importedCount++;
        logger.info(
          `Imported study ${study.nctrialId} (${importedCount}/${processedData.studies.length})`
        );
      } catch (error) {
        logger.error(`Error importing study ${study.nctrialId}:`, error);
      }
    }

    logger.info(`Successfully imported ${importedCount} new studies to the database.`);

    // Close the database connection pool
    await pool.end();

    logger.info('Batch import process completed.');
    process.exit(0);
  } catch (error) {
    logger.error('Error in batch import process:', error);
    process.exit(1);
  }
}

// Run the import process
runImport();
