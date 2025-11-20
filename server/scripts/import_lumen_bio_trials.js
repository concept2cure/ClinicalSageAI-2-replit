/**
 * Import script for Lumen Bio pipeline-specific clinical trials
 *
 * This script imports the consolidated trial data collected for
 * Lumen Bio's therapeutic areas into our database with proper tagging.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { csrReports, csrDetails } from 'shared/schema.js';
import { importTrialsFromApiV2 } from '../data-importer.js';
import { processApiV2Data } from '../data-importer-v2.js';
import { sql } from 'drizzle-orm';

// Convert ESM __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find the latest Lumen Bio consolidated file
async function findLatestLumenBioFile() {
  const dataDir = path.join(__dirname, 'data');
  const files = fs
    .readdirSync(dataDir)
    .filter(file => file.startsWith('lumen_bio_consolidated_') && file.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error('No Lumen Bio consolidated trial files found in data directory');
  }

  return path.join(dataDir, files[0]);
}

async function importLumenBioTrials() {
  console.log('Starting import of Lumen Bio pipeline-specific clinical trials...');

  try {
    // Find the latest file
    const latestFile = await findLatestLumenBioFile();
    console.log(`Using latest consolidated file: ${latestFile}`);

    // Read the file
    const fileData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

    // Process the data
    const processedData = processApiV2Data(fileData);
    console.log(`Processed ${processedData.studies.length} studies for import`);

    // Add Lumen Bio client tag to each study
    for (const study of processedData.studies) {
      if (!study.report.region) {
        study.report.region = 'Lumen Bio Pipeline';
      } else {
        study.report.region += ', Lumen Bio Pipeline';
      }
    }

    // Import the processed data
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const study of processedData.studies) {
      try {
        // Check if the study already exists
        const existingRecord = await db
          .select({ id: csrReports.id })
          .from(csrReports)
          .where(sql`${csrReports.nctrialId} = ${study.report.nctrialId}`)
          .limit(1);

        if (existingRecord.length > 0) {
          // Update the existing record
          const reportId = existingRecord[0].id;

          await db
            .update(csrReports)
            .set({
              region: study.report.region, // Update the region to include Lumen Bio tag
              lastUpdated: new Date(),
            })
            .where(sql`${csrReports.id} = ${reportId}`);

          updatedCount++;
          console.log(`Updated existing report: ${study.report.title}`);
        } else {
          // Insert new report and details
          const [insertedReport] = await db
            .insert(csrReports)
            .values(study.report)
            .returning({ id: csrReports.id });

          // Update the details with the correct report ID
          study.details.reportId = insertedReport.id;

          await db.insert(csrDetails).values(study.details);

          insertedCount++;
          console.log(`Inserted new report: ${study.report.title}`);
        }
      } catch (error) {
        console.error(`Error processing study ${study.report.nctrialId || 'unknown'}:`, error);
        errorCount++;
      }
    }

    console.log(
      `Import completed: ${insertedCount} inserted, ${updatedCount} updated, ${errorCount} errors`
    );
    return {
      success: true,
      insertedCount,
      updatedCount,
      errorCount,
      total: insertedCount + updatedCount,
    };
  } catch (error) {
    console.error('Error during Lumen Bio data import:', error);
    return {
      success: false,
      message: error.message,
      error,
    };
  }
}

// Run the import
importLumenBioTrials()
  .then(result => {
    if (result.success) {
      console.log(
        `Successfully imported ${result.total} Lumen Bio pipeline-relevant clinical trials`
      );
      process.exit(0);
    } else {
      console.error(`Failed to import Lumen Bio trials: ${result.message}`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Unhandled error during import:', err);
    process.exit(1);
  });
