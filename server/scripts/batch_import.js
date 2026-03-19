/**
 * Batch Import Script for Clinical Trial Data
 *
 * This script handles importing multiple XML files from the attached_assets directory
 * and processes them into the Concept2Cure database.
 */

const { importNctXmlFiles } = require('./import_xml_files');

/**
 * Run the batch import process for all XML files in the attached_assets directory
 */
async function runBatchImport() {
  try {
    console.log('Starting batch import process for clinical trial data...');

    // Import XML files from the attached_assets directory
    const xmlImportResult = await importNctXmlFiles();

    console.log('Batch import process completed.');
    console.log('Import results:', xmlImportResult);

    return {
      success: true,
      message: 'Batch import completed successfully',
      results: {
        xml: xmlImportResult,
      },
    };
  } catch (error) {
    console.error('Error in batch import process:', error);
    return {
      success: false,
      message: `Error in batch import process: ${error.message}`,
      error: error.stack,
    };
  }
}

module.exports = { runBatchImport };

// If this script is run directly from the command line
if (require.main === module) {
  runBatchImport()
    .then(result => {
      console.log('Batch import result:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error in batch import:', error);
      process.exit(1);
    });
}
