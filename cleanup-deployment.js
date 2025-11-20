// Cleanup script for deployment optimization
// This script removes unnecessary files and caches to reduce image size

import fs from 'fs';
import path from 'path';

function cleanupDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ Cleaned up: ${dirPath}`);
    } catch (error) {
      console.log(`⚠️ Could not clean ${dirPath}: ${error.message}`);
    }
  }
}

function cleanupFiles(pattern) {
  try {
    const files = fs.readdirSync('.').filter(file => file.includes(pattern));
    files.forEach(file => {
      fs.unlinkSync(file);
      console.log(`✅ Removed file: ${file}`);
    });
  } catch (error) {
    console.log(`⚠️ Could not clean files with pattern ${pattern}: ${error.message}`);
  }
}

console.log('🧹 Starting deployment cleanup...');

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

console.log('✅ Deployment cleanup complete!');
