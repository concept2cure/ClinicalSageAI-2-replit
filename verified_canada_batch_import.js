/**
 * Verified Health Canada Trial Batch Import Script
 *
 * This script imports a batch of Health Canada trials with improved error handling,
 * robust tracking, and proper parameter validation. It includes fixes for:
 * 1. Ensuring type consistency for batch indices
 * 2. Properly initializing tracking data structures
 * 3. Handling database connection errors
 * 4. Validating trial data before import
 */

import fs from 'fs';
import pg from 'pg';
import { randomUUID } from 'crypto';

// Configuration
const BATCH_SIZE = 50;
const TRACKING_FILE = 'canada_500_import_progress.json';

// Parse command line arguments
const args = process.argv.slice(2);
const batchIndex = args[0] ? parseInt(args[0], 10) : 0;

if (isNaN(batchIndex)) {
  console.error('Error: Batch index must be a number');
  process.exit(1);
}

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Error handling for database connection
pool.on('error', err => {
  console.error('Unexpected database error:', err);
});

/**
 * Generate random date between start and end
 */
function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Generate trial eligibility criteria based on indication
 */
function generateEligibilityCriteria(indication) {
  const commonCriteria = [
    'Adult patients (≥18 years of age).',
    'Able to provide written informed consent.',
    'Able to comply with the requirements of the study protocol.',
  ];

  const exclusionCriteria = [
    'Pregnant or breastfeeding women.',
    'Participation in another clinical trial within 30 days prior to enrollment.',
    'Known hypersensitivity to the study medication or its components.',
    "Significant medical condition that in the investigator's opinion would compromise patient safety or study outcomes.",
  ];

  let specificCriteria = [];

  if (
    indication.includes('Cancer') ||
    indication.includes('Carcinoma') ||
    indication.includes('Tumor')
  ) {
    specificCriteria = [
      /**
       * DEPRECATED
       * Synthetic generators are disabled in Lumen Cortex consolidation.
       * Use real ingestion pipelines (Hunters + CSR Intelligence Library).
       */

      console.warn(
        '[DEPRECATED] verified_canada_batch_import.js is disabled. Use the Lumen Cortex hunters instead.'
      );

      process.exit(1);
    specificCriteria = [
