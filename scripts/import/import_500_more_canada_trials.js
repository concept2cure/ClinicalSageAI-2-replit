import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = {
  info: (...args) => console.log('[HC-BULK]', ...args),
  warn: (...args) => console.warn('[HC-BULK]', ...args),
  error: (...args) => console.error('[HC-BULK]', ...args),
};

const TOTAL_BATCHES = Number(process.env.HC_TOTAL_BATCHES || 10);
const TRACKING_FILE = path.join(process.cwd(), 'hc_import_tracker.json');
const IMPORT_SCRIPT = path.join(__dirname, 'import_batch_of_50.js');
const BATCH_DELAY_MS = Number(process.env.HC_BATCH_DELAY_MS || 5000);
const PROGRESS_LOG = path.join(process.cwd(), 'import_500_progress.json');

function getTrackingData() {
  try {
    if (fs.existsSync(TRACKING_FILE)) {
      return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
    }
  } catch (error) {
    logger.error('Error reading tracking file:', error.message);
  }

  return {
    nextId: 1340,
    batchesCompleted: 19,
    trialsImported: 881,
    importedIds: [],
  };
}

function getProgressData() {
  try {
    if (fs.existsSync(PROGRESS_LOG)) {
      return JSON.parse(fs.readFileSync(PROGRESS_LOG, 'utf8'));
    }
  } catch (error) {
    logger.error('Error reading progress file:', error.message);
  }

  return {
    targetBatches: TOTAL_BATCHES,
    batchesProcessed: 0,
    startTimestamp: new Date().toISOString(),
    lastBatchTimestamp: null,
    status: 'starting',
    errors: [],
  };
}

function saveProgressData(data) {
  fs.writeFileSync(PROGRESS_LOG, JSON.stringify(data, null, 2));
}

async function runSingleBatch() {
  logger.info(`Running batch import using ${IMPORT_SCRIPT}`);

  try {
    const { stdout, stderr } = await execPromise(`node "${IMPORT_SCRIPT}"`, { cwd: process.cwd() });
    if (stdout) logger.info(stdout.trim());
    if (stderr) logger.warn(stderr.trim());
    return { ok: true };
  } catch (error) {
    logger.error('Error executing batch import:', error.message);
    return { ok: false, error: error.message };
  }
}

export async function runAllBatches() {
  logger.info(`Starting bulk import: ${TOTAL_BATCHES} batches of Health Canada CSRs.`);

  const progress = getProgressData();
  if (progress.batchesProcessed >= TOTAL_BATCHES) {
    logger.info('All batches already processed.');
    return;
  }

  const initialTracking = getTrackingData();
  progress.status = 'in_progress';
  saveProgressData(progress);

  for (let i = progress.batchesProcessed; i < TOTAL_BATCHES; i++) {
    const batchResult = await runSingleBatch();
    if (!batchResult.ok) {
      progress.status = 'failed';
      progress.errors.push({
        batch: i + 1,
        timestamp: new Date().toISOString(),
        message: batchResult.error || 'Batch execution failed',
      });
      saveProgressData(progress);
      break;
    }

    progress.batchesProcessed = i + 1;
    progress.lastBatchTimestamp = new Date().toISOString();
    saveProgressData(progress);

    if (i < TOTAL_BATCHES - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const finalTracking = getTrackingData();
  const trialsImported = finalTracking.trialsImported - initialTracking.trialsImported;

  if (progress.batchesProcessed >= TOTAL_BATCHES) {
    progress.status = 'completed';
    progress.completionTimestamp = new Date().toISOString();
    saveProgressData(progress);
    logger.info(`Completed bulk import. Added ${trialsImported} trials.`);
  } else {
    logger.warn(
      `Bulk import incomplete (${progress.batchesProcessed}/${TOTAL_BATCHES}). Added so far: ${trialsImported}`
    );
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runAllBatches()
    .then(() => {})
    .catch(error => {
      logger.error('Fatal error during batch processing:', error);
      process.exitCode = 1;
    });
}
