/**
 * Backup Scheduler
 *
 * This script schedules regular backups of code and database data
 * to ensure disaster recovery capability. It uses node-cron to
 * run the backup.sh script at scheduled intervals.
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');

// Path to backup script
const backupScriptPath = path.join(__dirname, 'backup.sh');

// Make sure backup script exists and is executable
if (!fs.existsSync(backupScriptPath)) {
  logger.error(`Backup script not found at ${backupScriptPath}`);
  process.exit(1);
}

// Make backup script executable
try {
  fs.chmodSync(backupScriptPath, '755');
  logger.info('Made backup script executable');
} catch (error) {
  logger.error('Failed to make backup script executable:', error.message);
  // Continue anyway, it might already be executable
}

/**
 * Run the backup script
 */
function runBackup() {
  logger.info(`Starting backup at ${new Date().toISOString()}`);

  exec(`bash ${backupScriptPath}`, (error, stdout, stderr) => {
    if (error) {
      logger.error(`Backup failed with error: ${error.message}`);
      logger.error(stderr);
      return;
    }

    logger.info('Backup output:');
    logger.info(stdout);
    logger.info(`Backup completed at ${new Date().toISOString()}`);
  });
}

// Schedule daily backup at 1:00 AM
// Format: [minute] [hour] [day of month] [month] [day of week]
cron.schedule('0 1 * * *', () => {
  logger.info('Running scheduled daily backup');
  runBackup();
});

// Also run backup on script start
logger.info('Performing initial backup');
runBackup();

// Keep the process running
logger.info('Backup scheduler started');
logger.info('Next scheduled backup will run at 1:00 AM');

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Backup scheduler stopping...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Backup scheduler stopping...');
  process.exit(0);
});

// Log that we're ready
logger.info('Backup scheduler running. Press Ctrl+C to stop.');

// Run this script with: node scripts/schedule-backup.js &
// To run it in the background on a Linux/Unix system
