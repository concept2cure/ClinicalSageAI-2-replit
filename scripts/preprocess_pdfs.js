const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const SOURCE_DIR = path.join(__dirname, '../attached_assets');
const OUTPUT_DIR = path.join(__dirname, '../data/processed_documents');
const LOG_FILE = path.join(__dirname, '../logs/pdf_processing.log');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

if (!fs.existsSync(path.dirname(LOG_FILE))) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

// Logging helper
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  logger.info(message);
  fs.appendFileSync(LOG_FILE, logMessage);
}

// Process a PDF file
async function processPDF(filePath) {
  try {
    const filename = path.basename(filePath);
    const outputPath = path.join(OUTPUT_DIR, `${path.basename(filename, '.pdf')}.json`);

    // Basic metadata extraction
    const stats = fs.statSync(filePath);
    const metadata = {
      filename,
      path: filePath,
      size: stats.size,
      lastModified: stats.mtime,
      processed: new Date().toISOString(),
      status: 'processed',
      type: 'pdf',
    };

    // Store metadata
    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));
    log(`Successfully processed: ${filename}`);
    return outputPath;
  } catch (error) {
    log(`Error processing ${filePath}: ${error.message}`);
    return null;
  }
}

// Process all PDFs in a directory
async function processDirectory(dir) {
  log(`Starting to process PDFs in ${dir}`);
  let processed = 0;
  let failed = 0;

  try {
    const processDir = currentDir => {
      const files = fs.readdirSync(currentDir);

      for (const file of files) {
        const fullPath = path.join(currentDir, file);

        if (fs.statSync(fullPath).isDirectory()) {
          processDir(fullPath);
          continue;
        }

        if (path.extname(file).toLowerCase() === '.pdf') {
          const result = processPDF(fullPath);
          if (result) {
            processed++;
          } else {
            failed++;
          }
        }
      }
    };

    processDir(dir);
    log(`Processing complete. Processed: ${processed}, Failed: ${failed}`);
  } catch (error) {
    log(`Error processing directory ${dir}: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  processDirectory(SOURCE_DIR)
    .then(() => {
      log('PDF preprocessing completed');
    })
    .catch(err => {
      log(`Fatal error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { processDirectory, processPDF };
