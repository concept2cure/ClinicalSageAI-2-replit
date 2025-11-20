import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db.js';
import { importTrialsFromApiV2 } from '../data-importer.js';

// Convert ESM __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function importConsolidatedFile() {
  console.log('Starting import of consolidated clinical trials...');

  // Find the latest consolidated file
  const dataDir = path.join(__dirname, 'data');
  const files = fs
    .readdirSync(dataDir)
    .filter(file => file.startsWith('consolidated_trials_') && file.endsWith('.json'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No consolidated trial files found in data directory');
    return { success: false, message: 'No files found', count: 0 };
  }

  const latestFile = path.join(dataDir, files[0]);
  console.log(`Using latest consolidated file: ${latestFile}`);

  try {
    // Read the file
    const fileData = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

    // Import the data
    const result = await importTrialsFromApiV2(fileData);

    console.log(`Import result: ${result.message}`);
    return result;
  } catch (error) {
    console.error('Error during import:', error);
    return { success: false, message: `Error: ${error.message}`, count: 0 };
  }
}

// Run the import
importConsolidatedFile()
  .then(result => {
    console.log(`Import completed with ${result.count} new records`);
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unhandled error during import:', err);
    process.exit(1);
  });
