// Cleanup script for deployment optimization
// This script removes unnecessary files and caches to reduce image size

import fs from 'fs';
import path from 'path';

function cleanupDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      logger.info(`✅ Cleaned up: ${dirPath}`);
    } catch (error) {
      logger.info(`⚠️ Could not clean ${dirPath}: ${error.message}`);
    }
  }
}

function cleanupFiles(pattern) {
  try {
    const files = fs.readdirSync('.').filter(file => file.includes(pattern));
    files.forEach(file => {
      fs.unlinkSync(file);
      logger.info(`✅ Removed file: ${file}`);
    });
  } catch (error) {
    logger.info(`⚠️ Could not clean files with pattern ${pattern}: ${error.message}`);
  }
}

logger.info('🧹 Starting deployment cleanup...');

// Clean up cache directories (avoid protected .cache/replit)
cleanupDirectory('node_modules/.cache');
cleanupDirectory('.vite');
cleanupDirectory('tmp');
cleanupDirectory('cache');
cleanupDirectory('__pycache__');
cleanupDirectory('.pytest_cache');
cleanupDirectory('.mypy_cache');

// Clean up log files
cleanupFiles('.log');

// Clean up temporary files
cleanupFiles('.tmp');
cleanupFiles('.bak');

logger.info('✅ Deployment cleanup complete!');
