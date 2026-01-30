import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const TOTAL_BATCHES = 15;
const BATCH_SIZE = 50;
const PROGRESS_FILE = 'canada_15x50_import_progress.json';

// Initialize progress tracking
let progress = {
  completed: 0,
  total: TOTAL_BATCHES,
  batches: [],
  startTime: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
};

// Load existing progress if available
if (fs.existsSync(PROGRESS_FILE)) {
  try {
    const savedProgress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    progress = { ...savedProgress };
    logger.info(
      `Resuming from previous progress: ${progress.completed}/${progress.total} batches completed`
    );
  } catch (err) {
    logger.error('Error reading progress file, starting fresh:', err);
  }
}

// Function to run a single batch import
async function runBatch(batchNumber) {
  return new Promise((resolve, reject) => {
    logger.info(
      `Starting Canada CSR batch ${batchNumber}/${TOTAL_BATCHES} (${BATCH_SIZE} CSRs)...`
    );

    // Use the existing import script that works with Canada CSRs
    const batchProcess = spawn('node', [
      'import_single_canada_batch.js',
      '--batchSize',
      BATCH_SIZE.toString(),
      '--batchIndex',
      batchNumber.toString(),
    ]);

    let output = '';
    let errorOutput = '';

    batchProcess.stdout.on('data', data => {
      const text = data.toString();
      output += text;
      logger.info(`[Batch ${batchNumber}] ${text.trim()}`);
    });

    batchProcess.stderr.on('data', data => {
      const text = data.toString();
      errorOutput += text;
      logger.error(`[Batch ${batchNumber} ERROR] ${text.trim()}`);
    });

    batchProcess.on('close', code => {
      const result = {
        batchNumber,
        exitCode: code,
        timestamp: new Date().toISOString(),
        success: code === 0,
        output: output.substring(0, 500) + (output.length > 500 ? '...' : ''),
        error: errorOutput.substring(0, 500) + (errorOutput.length > 500 ? '...' : ''),
      };

      progress.batches.push(result);
      progress.lastUpdated = new Date().toISOString();

      if (code === 0) {
        progress.completed++;
        logger.info(`Batch ${batchNumber}/${TOTAL_BATCHES} completed successfully.`);
        resolve(result);
      } else {
        logger.error(`Batch ${batchNumber}/${TOTAL_BATCHES} failed with exit code ${code}`);
        reject(result);
      }

      // Save progress after each batch
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    });
  });
}

// Main function to run all batches
async function runAllBatches() {
  // Calculate how many batches we still need to run
  const remainingBatches = TOTAL_BATCHES - progress.completed;

  logger.info(
    `Starting import of ${remainingBatches} Canada CSR batches, each with ${BATCH_SIZE} CSRs (total: ${remainingBatches * BATCH_SIZE} CSRs)`
  );

  for (let i = progress.completed + 1; i <= TOTAL_BATCHES; i++) {
    try {
      await runBatch(i);

      // Add a short delay between batches to prevent overloading
      if (i < TOTAL_BATCHES) {
        logger.info(`Waiting 5 seconds before starting next batch...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      logger.error(`Error in batch ${i}:`, error);
      // Continue with next batch even if one fails
    }
  }

  // Final summary
  const successBatches = progress.batches.filter(b => b.success).length;
  const failedBatches = progress.batches.filter(b => !b.success).length;

  logger.info('\n===== IMPORT SUMMARY =====');
  logger.info(`Total batches: ${TOTAL_BATCHES}`);
  logger.info(`Successfully completed: ${successBatches}`);
  logger.info(`Failed: ${failedBatches}`);
  logger.info(`Estimated CSRs imported: ${successBatches * BATCH_SIZE}`);
  logger.info('==========================\n');

  // Calculate and display time stats
  const startTime = new Date(progress.startTime);
  const endTime = new Date();
  const totalSeconds = Math.floor((endTime - startTime) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  logger.info(`Total import time: ${hours}h ${minutes}m ${seconds}s`);
}

// Start the batch process
runAllBatches()
  .then(() => {
    logger.info('All Canada CSR batches have been processed.');
  })
  .catch(err => {
    logger.error('Error running batches:', err);
  });
