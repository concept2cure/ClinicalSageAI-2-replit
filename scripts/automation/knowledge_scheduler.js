import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
import cron from 'node-cron';

const execPromise = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = {
  info: (...args) => console.log('[KNOWLEDGE-SCHEDULER]', ...args),
  warn: (...args) => console.warn('[KNOWLEDGE-SCHEDULER]', ...args),
  error: (...args) => console.error('[KNOWLEDGE-SCHEDULER]', ...args),
};

/**
 * Knowledge Enhancement Scheduler for TrialSage
 *
 * This script automatically schedules and executes all knowledge enhancement systems
 * to ensure our AI knowledge base is continuously updated without manual intervention.
 *
 * It coordinates:
 * 1. Health Canada CSR imports
 * 2. Academic knowledge enhancement
 * 3. Journal RSS monitoring
 * 4. Integration into our knowledge services
 */

// Configuration
const SCHEDULER_CONFIG = {
  logDirectory: path.join(process.cwd(), 'logs/knowledge_enhancement'),
  schedules: {
    // Import Canada CSRs in batches of 50 every Monday at 3:00 AM
    canadaImport: {
      cronSchedule: '0 3 * * 1',
      script: path.join(process.cwd(), 'scripts/import/import_batch_of_50.js'),
      enabled: true,
      label: 'Health Canada CSR Import',
      logFile: 'canada_import_log.json',
    },
    // Run knowledge enhancement daily at 2:00 AM
    knowledgeEnhancement: {
      cronSchedule: '0 2 * * *',
      script: path.join(process.cwd(), 'scripts/automation/auto_knowledge_enhancement.js'),
      enabled: true,
      label: 'Academic Knowledge Enhancement',
      logFile: 'knowledge_enhancement_log.json',
    },
    // Monitor journal RSS feeds twice daily (8:00 AM and 8:00 PM)
    journalMonitor: {
      cronSchedule: '0 8,20 * * *',
      script: path.join(process.cwd(), 'scripts/automation/journal_rss_monitor.js'),
      enabled: true,
      label: 'Journal RSS Monitoring',
      logFile: 'journal_monitor_log.json',
    },
    // Run full 500 imports monthly on the 1st at 1:00 AM
    bulkCanadaImport: {
      cronSchedule: '0 1 1 * *',
      script: path.join(process.cwd(), 'scripts/import/import_500_more_canada_trials.js'),
      enabled: true,
      label: 'Bulk Canada CSR Import (500)',
      logFile: 'bulk_canada_import_log.json',
    },
    canadaRealCsrDownload: {
      cronSchedule: '30 2 * * 2',
      script: path.join(process.cwd(), 'scripts/import/download_and_harvest_canada_csrs.js'),
      enabled: false,
      label: 'Canada Real CSR Download + Harvest',
      logFile: 'canada_real_csr_download_log.json',
    },
  },
};

// Ensure log directory exists
function ensureLogDirectory() {
  if (!fs.existsSync(SCHEDULER_CONFIG.logDirectory)) {
    fs.mkdirSync(SCHEDULER_CONFIG.logDirectory, { recursive: true });
    logger.info(`Created log directory: ${SCHEDULER_CONFIG.logDirectory}`);
  }
}

// Log task execution
function logTaskExecution(task, result) {
  const logFile = path.join(SCHEDULER_CONFIG.logDirectory, task.logFile);

  try {
    // Read existing log or initialize
    let log = [];
    if (fs.existsSync(logFile)) {
      log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }

    // Add new entry
    log.push({
      taskName: task.label,
      scriptPath: task.script,
      timestamp: new Date().toISOString(),
      result: result,
    });

    // Limit log size to last 100 entries
    if (log.length > 100) {
      log = log.slice(-100);
    }

    // Save log
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    logger.info(`Task execution logged to ${logFile}`);
  } catch (error) {
    logger.error(`Error logging task execution for ${task.label}:`, error.message);
  }
}

// Execute a task
async function executeTask(task) {
  logger.info(`Executing task: ${task.label}...`);

  try {
    // Execute the script
    console.time(`${task.label} execution`);
    const { stdout, stderr } = await execPromise(`node "${task.script}"`);
    console.timeEnd(`${task.label} execution`);

    // Log results
    const result = {
      success: true,
      stdout: stdout.substring(0, 1000), // Limit output size
      stderr: stderr ? stderr.substring(0, 1000) : null,
      executionTime: new Date().toISOString(),
    };

    logTaskExecution(task, result);
    logger.info(`Successfully executed ${task.label}`);
    return result;
  } catch (error) {
    logger.error(`Error executing ${task.label}:`, error.message);

    // Log error
    const result = {
      success: false,
      error: error.message,
      executionTime: new Date().toISOString(),
    };

    logTaskExecution(task, result);
    return result;
  }
}

// Schedule all tasks
function scheduleAllTasks() {
  logger.info('Scheduling knowledge enhancement tasks...');

  ensureLogDirectory();

  for (const [key, task] of Object.entries(SCHEDULER_CONFIG.schedules)) {
    if (!task.enabled) {
      logger.info(`Task ${task.label} is disabled, skipping`);
      continue;
    }

    try {
      logger.info(`Scheduling ${task.label} with cron pattern: ${task.cronSchedule}`);

      cron.schedule(task.cronSchedule, async () => {
        logger.info(`Cron triggered for ${task.label} at ${new Date().toISOString()}`);
        await executeTask(task);
      });

      logger.info(`Successfully scheduled ${task.label}`);
    } catch (error) {
      logger.error(`Error scheduling ${task.label}:`, error.message);
    }
  }

  logger.info('All tasks scheduled successfully!');
  logger.info(
    'Knowledge enhancement system will run automatically based on the configured schedules.'
  );
}

// Run a task immediately
async function runTaskNow(taskKey) {
  const task = SCHEDULER_CONFIG.schedules[taskKey];

  if (!task) {
    logger.error(`Task ${taskKey} not found in configuration`);
    return {
      success: false,
      error: `Task ${taskKey} not found in configuration`,
    };
  }

  if (!task.enabled) {
    logger.warn(`Task ${task.label} is disabled`);
    return {
      success: false,
      error: `Task ${task.label} is disabled`,
    };
  }

  logger.info(`Manually running task: ${task.label}...`);
  return await executeTask(task);
}

// Get status of all scheduled tasks
function getScheduleStatus() {
  const status = {
    schedulerActive: true,
    systemTime: new Date().toISOString(),
    tasks: {},
  };

  for (const [key, task] of Object.entries(SCHEDULER_CONFIG.schedules)) {
    // Calculate next execution time
    const cronInstance = cron.validate(task.cronSchedule) ? task.cronSchedule : '0 0 * * *'; // Default daily at midnight

    const schedule = cron.schedule(cronInstance, () => {});
    schedule.stop();

    // Get last execution from logs if available
    let lastExecution = null;
    const logFile = path.join(SCHEDULER_CONFIG.logDirectory, task.logFile);

    if (fs.existsSync(logFile)) {
      try {
        const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
        if (log.length > 0) {
          lastExecution = log[log.length - 1];
        }
      } catch (error) {
        logger.error(`Error reading log file for ${task.label}:`, error.message);
      }
    }

    status.tasks[key] = {
      name: task.label,
      enabled: task.enabled,
      schedule: task.cronSchedule,
      script: task.script,
      lastExecution: lastExecution
        ? {
            timestamp: lastExecution.timestamp,
            success: lastExecution.result.success,
          }
        : null,
    };
  }

  return status;
}

// Start the scheduler
function startScheduler() {
  logger.info('Starting knowledge enhancement scheduler...');

  try {
    scheduleAllTasks();

    // Log startup
    const startupInfo = {
      startTime: new Date().toISOString(),
      nodeVersion: process.version,
      schedules: SCHEDULER_CONFIG.schedules,
    };

    fs.writeFileSync(
      path.join(SCHEDULER_CONFIG.logDirectory, 'scheduler_startup.json'),
      JSON.stringify(startupInfo, null, 2)
    );

    // Return status
    return {
      success: true,
      message: 'Knowledge enhancement scheduler started successfully',
      startTime: startupInfo.startTime,
      status: getScheduleStatus(),
    };
  } catch (error) {
    logger.error('Error starting scheduler:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Install cron if needed
async function installDependencies() {
  try {
    try {
      logger.info('node-cron dependency check skipped (managed by package.json)');
      return true;
    } catch (e) {
      return true;
    }
  } catch (error) {
    logger.error('Error installing dependencies:', error.message);
    return false;
  }
}

// Main function
async function main() {
  logger.info('Initializing knowledge enhancement scheduler...');

  // Ensure dependencies are installed
  const dependenciesInstalled = await installDependencies();

  if (!dependenciesInstalled) {
    logger.error('Failed to install required dependencies. Aborting.');
    return {
      success: false,
      error: 'Failed to install required dependencies',
    };
  }

  // Start the scheduler
  const result = startScheduler();

  if (result.success) {
    logger.info(`
=========================================================
      KNOWLEDGE ENHANCEMENT SCHEDULER IS ACTIVE
=========================================================
The following tasks are scheduled:

Health Canada CSR Import: ${SCHEDULER_CONFIG.schedules.canadaImport.cronSchedule}
Academic Knowledge Enhancement: ${SCHEDULER_CONFIG.schedules.knowledgeEnhancement.cronSchedule}
Journal RSS Monitoring: ${SCHEDULER_CONFIG.schedules.journalMonitor.cronSchedule}
Bulk Canada CSR Import (500): ${SCHEDULER_CONFIG.schedules.bulkCanadaImport.cronSchedule}

Your AI knowledge base will be automatically enhanced without
requiring manual uploads. To check status, run:

  node knowledge_scheduler.js status

To run a task immediately, run:
  node knowledge_scheduler.js run <taskKey>

Available task keys: canadaImport, knowledgeEnhancement, 
journalMonitor, bulkCanadaImport, canadaRealCsrDownload
=========================================================
`);
  }

  return result;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    return main();
  }

  switch (command) {
    case 'status':
      logger.info('Getting scheduler status...');
      logger.info(JSON.stringify(getScheduleStatus(), null, 2));
      break;

    case 'run':
      const taskKey = args[1];
      if (!taskKey) {
        logger.error('No task key provided. Usage: node knowledge_scheduler.js run <taskKey>');
        logger.info('Available task keys:', Object.keys(SCHEDULER_CONFIG.schedules).join(', '));
        return;
      }

      logger.info(`Manually running task: ${taskKey}`);
      runTaskNow(taskKey)
        .then(result => {
          logger.info('Task execution result:', result);
        })
        .catch(error => {
          logger.error('Error executing task:', error);
        });
      break;

    default:
      logger.error(`Unknown command: ${command}`);
      logger.info('Available commands: status, run <taskKey>');
  }
}

// Run main function when directly executed
// ES Module version of the traditional CommonJS check
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  parseArgs();
}

// Export functions for use in other modules
export { startScheduler, runTaskNow, getScheduleStatus };
