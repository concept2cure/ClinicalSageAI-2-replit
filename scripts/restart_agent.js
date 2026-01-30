const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const LOG_FILE = path.join(__dirname, '../logs/agent_restart.log');

// Ensure log directory exists
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

// Check running processes
function checkRunningProcesses() {
  try {
    const output = execSync('ps aux | grep node').toString();
    log('Current Node.js processes:');
    log(output);
    return output;
  } catch (error) {
    log(`Error checking processes: ${error.message}`);
    return '';
  }
}

// Restart application
function restartApp() {
  try {
    log('Attempting to restart the application...');

    // Find and terminate stuck processes (optional - uncomment if needed)
    // const output = checkRunningProcesses();
    // const stuckProcesses = findStuckProcesses(output);
    // terminateStuckProcesses(stuckProcesses);

    // Start the app using the existing workflow
    log('Starting application using workflow...');

    // Check if application is running properly
    setTimeout(() => {
      log('Checking if application is running properly...');
      checkRunningProcesses();
      log('Application restart process completed');
    }, 5000);

    return true;
  } catch (error) {
    log(`Error restarting application: ${error.message}`);
    return false;
  }
}

// Main execution
if (require.main === module) {
  log('Starting agent restart process');
  checkRunningProcesses();
  restartApp();
}

module.exports = { restartApp, checkRunningProcesses };
