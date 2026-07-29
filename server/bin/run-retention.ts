#!/usr/bin/env tsx
/**
 * Manual / scheduled runner for the document retention job.
 *
 * Runs one retention sweep (see server/jobs/retentionCron.ts): archives expired
 * documents per policy, soft- or hard-deletes them, audits each action. Intended
 * for an external scheduler (cron / CI) or manual admin runs.
 *
 * Usage: tsx server/bin/run-retention.ts   (or: npm run retention:run)
 */

import dotenv from 'dotenv';
dotenv.config();

import { runRetentionJob } from '../jobs/retentionCron';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                 Concept2Cure Vault Retention Job                 ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('⚠️  Archives and deletes documents whose retention period has elapsed.');
console.log('   Soft-delete by default; hard-delete only when a matched policy says so.');
console.log('');
console.log('Starting job...');
console.log('');

runRetentionJob()
  .then(success => {
    console.log('');
    console.log(success ? '✅ Retention job completed successfully' : '❌ Retention job completed with errors');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('');
    console.error('❌ Retention job failed with error:', err);
    process.exit(1);
  });
