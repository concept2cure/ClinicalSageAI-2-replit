/**
 * Direct Import Script for XML Clinical Trial Data
 *
 * This script processes XML files from the attached_assets directory
 * and inserts them directly into the database.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { Pool } = require('@neondatabase/serverless');
const { drizzle } = require('drizzle-orm/neon-serverless');
const { eq } = require('drizzle-orm');

// Connect to the database
const pool = new Pool({ connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL });
const schema = require('../../shared/schema');
const db = drizzle(pool, { schema });

/**
 * Run the direct import process for all NCT XML files
 */
async function runDirectImport() {
  try {
    console.log('Starting direct import process...');

    // Define paths
    const assetsDir = path.join(process.cwd(), 'attached_assets');
    const outputJsonPath = path.join(process.cwd(), 'data', 'processed_trials.json');

    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Check if attached_assets directory exists
    if (!fs.existsSync(assetsDir)) {
      console.log('attached_assets directory not found');
      return { success: false, message: 'attached_assets directory not found', count: 0 };
    }

    // Get the list of NCT XML files
    console.log('Looking for NCT*.xml files in attached_assets directory...');
    const xmlFiles = fs
      .readdirSync(assetsDir)
      .filter(file => file.startsWith('NCT') && file.endsWith('.xml'));

    if (xmlFiles.length === 0) {
      console.log('No NCT XML files found in attached_assets directory');
      return {
        success: false,
        message: 'No NCT XML files found in attached_assets directory',
        count: 0,
      };
    }

    console.log(`Found ${xmlFiles.length} NCT XML files to process.`);

    // Run Python script to process XML files
    console.log('Running Python script to process XML files...');

    // Pass the attached_assets directory to the Python script
    execSync(`python3 server/scripts/import_nct_xml.py ${assetsDir}`, { stdio: 'inherit' });

    // Check if processed JSON file was created
    if (!fs.existsSync('processed_trials.json')) {
      console.log('Failed to generate processed_trials.json');
      return { success: false, message: 'Failed to generate processed_trials.json', count: 0 };
    }

    // Move the processed_trials.json file to the data directory
    fs.renameSync('processed_trials.json', outputJsonPath);

    // Read and parse the processed data
    const processedData = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));

    if (!processedData.studies || !Array.isArray(processedData.studies)) {
      console.log('Invalid format in processed_trials.json');
      return { success: false, message: 'Invalid format in processed_trials.json', count: 0 };
    }

    console.log(
      `Successfully processed ${processedData.processed_count} trials. Importing to database...`
    );

    // Import each study into the database
    let importedCount = 0;

    for (const study of processedData.studies) {
      try {
        // Check if this study already exists in the database
        const existingReports = await db
          .select()
          .from(schema.csrReports)
          .where(eq(schema.csrReports.nctrialId, study.nctrialId));

        if (existingReports.length > 0) {
          console.log(`Study ${study.nctrialId} already exists in database, skipping...`);
          continue;
        }

        // Insert new report
        const [newReport] = await db
          .insert(schema.csrReports)
          .values({
            title: study.title,
            officialTitle: study.officialTitle,
            sponsor: study.sponsor,
            indication: study.indication,
            phase: study.phase,
            fileName: study.fileName,
            fileSize: study.fileSize,
            date: study.date,
            completionDate: study.completionDate,
            nctrialId: study.nctrialId,
            drugName: study.drugName,
            source: study.source,
            importDate: new Date(),
            status: 'Imported',
          })
          .returning();

        // Insert details
        await db.insert(schema.csrDetails).values({
          reportId: newReport.id,
          studyDesign: study.studyType,
          primaryObjective: 'To evaluate the efficacy and safety of the investigational product',
          studyDescription: study.description || study.detailedDescription,
          inclusionCriteria: study.eligibilityCriteria,
          exclusionCriteria: '',
          endpointText: '',
          statisticalMethods: '',
          safetyMonitoring: '',
          results: {}, // Will be populated later with further processing
          lastUpdated: new Date(),
        });

        importedCount++;
      } catch (error) {
        console.error(`Error importing study ${study.nctrialId}:`, error);
      }
    }

    console.log(`Successfully imported ${importedCount} new studies to the database.`);

    return {
      success: true,
      message: `Successfully processed and imported ${importedCount} new studies`,
      count: importedCount,
    };
  } catch (error) {
    console.error('Error in direct import:', error);
    return {
      success: false,
      message: `Error in direct import: ${error.message}`,
      error: error.stack,
    };
  }
}

// If this script is run directly from the command line
if (require.main === module) {
  runDirectImport()
    .then(result => {
      console.log('Direct import result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error in direct import:', error);
      process.exit(1);
    });
}

module.exports = { runDirectImport };
