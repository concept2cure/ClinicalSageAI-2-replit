#!/usr/bin/env node

/**
 * Manual runner for the document retention job
 *
 * This script allows administrators to run the retention job manually
 * for testing or to execute it outside the normal schedule.
 *
 * Usage: node server/bin/run-retention.js
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { runRetentionJob } from '../jobs/retentionCron.js';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                 Concept2Cure Vault Retention Job                 ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('⚠️  WARNING: This will archive and permanently delete documents');
console.log('   based on configured retention rules.');
console.log('');
console.log('Starting job...');
console.log('');

runRetentionJob()
  .then(success => {
    if (success) {
      console.log('');
      console.log('✅ Retention job completed successfully');
      process.exit(0);
    } else {
      console.log('');
      console.log('❌ Retention job failed');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('');
    console.error('❌ Retention job failed with error:', err);
    process.exit(1);
  });
