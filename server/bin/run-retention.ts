#!/usr/bin/env tsx
/**
 * Manual / scheduled runner for the document retention job.
 *
 * Runs one retention sweep (see server/jobs/retentionCron.ts): each
 * organisation in its own scope, archives its expired documents per policy,
 * soft-deletes them and audits each action. A legal hold leaves a document in
 * place, and a policy that asks for destruction is refused: nothing is
 * hard-deleted. Intended for an external scheduler (cron / CI) or manual admin
 * runs. Exits 1 when any document could not be disposed of, an organisation
 * could not be swept, or a document names another organisation than its
 * programme's owner (P-72 slice 1b).
 *
 * Usage: tsx server/bin/run-retention.ts   (or: npm run retention:run)
 */

import '../config/load-env-files';

import { runRetentionJob } from '../jobs/retentionCron';

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║                 Concept2Cure Vault Retention Job                 ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('⚠️  Archives and deletes documents whose retention period has elapsed.');
console.log('   Soft-delete only: a legal hold leaves a document in place, and destruction is refused.');
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
