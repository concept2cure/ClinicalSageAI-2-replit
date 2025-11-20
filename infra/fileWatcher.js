/**
 * Protected Directories File Watcher
 *
 * This script monitors landing/ and trialsage-html/ directories for any changes
 * and logs alerts when files are modified. It can also send notifications
 * via webhook if configured.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios').default;

// Directories to watch
const watchDirs = ['landing', 'trialsage-html'];

// Webhook URL (if available)
const webhookUrl = process.env.SLACK_WEBHOOK_URL;

// Log file for alerts
const logFile = path.join(__dirname, 'file_changes.log');

// Helper to send alerts
async function sendAlert(message) {
  // Log to console
  console.error(`🚨 ALERT: ${message}`);

  // Log to file
  fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);

  // Send to webhook if configured
  if (webhookUrl) {
    try {
      await axios.post(webhookUrl, {
        text: `🚨 *Protected Directory Alert*: ${message}`,
      });
    } catch (error) {
      console.error('Failed to send webhook notification:', error.message);
    }
  }
}

// Setup watchers for each directory
watchDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Directory not found: ${dir}, skipping watcher`);
    return;
  }

  console.log(`Setting up file watcher for ${dir}/`);

  // Watch the directory recursively
  fs.watch(dir, { recursive: true }, (eventType, filename) => {
    if (filename) {
      sendAlert(`${eventType} detected in ${dir}/${filename}`);
    }
  });
});

console.log('File watchers initialized for protected directories');
console.log('Alerts will be logged to:', logFile);
if (webhookUrl) {
  console.log('Webhook notifications are enabled');
}
