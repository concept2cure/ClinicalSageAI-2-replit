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
  console.error(`Backup script not found at ${backupScriptPath}`);
  process.exit(1);
}

// Make backup script executable
try {
  fs.chmodSync(backupScriptPath, '755');
  console.log('Made backup script executable');
} catch (error) {
  console.error('Failed to make backup script executable:', error.message);
  // Continue anyway, it might already be executable
}

/**
 * Run the backup script
 */
function runBackup() {
  console.log(`Starting backup at ${new Date().toISOString()}`);

  exec(`bash ${backupScriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Backup failed with error: ${error.message}`);
      console.error(stderr);
      return;
    }

    console.log('Backup output:');
    console.log(stdout);
    console.log(`Backup completed at ${new Date().toISOString()}`);
  });
}

// Schedule daily backup at 1:00 AM
// Format: [minute] [hour] [day of month] [month] [day of week]
cron.schedule('0 1 * * *', () => {
  console.log('Running scheduled daily backup');
  runBackup();
});

// Also run backup on script start
console.log('Performing initial backup');
runBackup();

// Keep the process running
console.log('Backup scheduler started');
console.log('Next scheduled backup will run at 1:00 AM');

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Backup scheduler stopping...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Backup scheduler stopping...');
  process.exit(0);
});

// Log that we're ready
console.log('Backup scheduler running. Press Ctrl+C to stop.');

// Run this script with: node scripts/schedule-backup.js &
// To run it in the background on a Linux/Unix system
