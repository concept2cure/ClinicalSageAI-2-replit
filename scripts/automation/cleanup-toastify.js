/**
 * This script permanently removes react-toastify remnants from node_modules,
 * ensures critical dependencies like 'diff' are installed,
 * and clears related Vite cache to prevent dependency optimization errors.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get project root (two directories up from scripts/automation/)
const projectRoot = path.resolve(__dirname, '..', '..');

// Function to delete a directory and all its contents recursively
function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach(file => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
    logger.info(`Deleted: ${directoryPath}`);
  }
}

// Clean up react-toastify module if it exists
const toastifyPath = path.join(projectRoot, 'node_modules', 'react-toastify');
if (fs.existsSync(toastifyPath)) {
  logger.info('Found react-toastify in node_modules, removing...');
  deleteFolderRecursive(toastifyPath);
} else {
  logger.info('react-toastify not found in node_modules (good!)');
}

// Clean Vite cache to prevent optimization errors
const viteCachePath = path.join(projectRoot, 'node_modules', '.vite');
if (fs.existsSync(viteCachePath)) {
  logger.info('Clearing Vite cache...');
  deleteFolderRecursive(viteCachePath);
} else {
  logger.info('Vite cache not found or already cleared');
}

logger.info('Toast dependency cleanup complete!');

// Ensure critical dependencies are installed
logger.info('Checking critical dependencies...');

// List of critical packages that keep getting removed
const criticalPackages = [
  'diff',
  'node-html-parser',
  'marked',
  '@tiptap/extension-placeholder',
  'docx',
  'file-saver',
  'jspdf-autotable',
  'react-dnd',
  'react-dnd-html5-backend',
  'd3',
  '@tiptap/extension-table',
  '@tiptap/extension-task-list',
  '@tiptap/extension-task-item',
  '@tiptap/extension-character-count'
];

function checkMissingPackages() {
  const missing = [];
  for (const pkg of criticalPackages) {
    const pkgPath = path.join(projectRoot, 'node_modules', pkg.replace('/', path.sep));
    if (!fs.existsSync(pkgPath)) {
      missing.push(pkg);
    }
  }
  return missing;
}

let missingPackages = checkMissingPackages();

// Install missing packages if any (up to 3 attempts to handle circular removals)
let attempts = 0;
const maxAttempts = 3;

while (missingPackages.length > 0 && attempts < maxAttempts) {
  attempts++;
  logger.info(`[Attempt ${attempts}/${maxAttempts}] Missing ${missingPackages.length} package(s): ${missingPackages.join(', ')}`);
  
  try {
    // Install ALL missing packages at once
    execSync(`npm install ${missingPackages.join(' ')} --no-audit --no-fund --save`, { 
      stdio: 'inherit', 
      cwd: projectRoot 
    });
    logger.info('✅ Installation complete, verifying...');
    
    // Re-check what's still missing
    missingPackages = checkMissingPackages();
    
    if (missingPackages.length === 0) {
      logger.info('✅ All critical packages successfully installed and verified');
      break;
    } else {
      logger.info(`⚠️ ${missingPackages.length} package(s) still missing after installation`);
    }
  } catch (error) {
    logger.error(`❌ Installation failed on attempt ${attempts}:`, error.message);
    if (attempts >= maxAttempts) {
      process.exit(1);
    }
  }
}

if (missingPackages.length > 0) {
  logger.error(`❌ Failed to install all critical packages after ${maxAttempts} attempts`);
  logger.error(`Still missing: ${missingPackages.join(', ')}`);
  process.exit(1);
}

logger.info('✅ All critical dependencies verified and ready');

// Add build size optimization
logger.info('Starting build size optimization...');

// Remove large unnecessary files
const filesToRemove = ['node_modules/.cache', '.vite', 'dist/cache', 'tmp', 'node_modules/.pnpm'];

filesToRemove.forEach(file => {
  const fullPath = path.join(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    try {
      deleteFolderRecursive(fullPath);
      logger.info(`✅ Cleaned: ${file}`);
    } catch (error) {
      logger.info(`⚠️ Could not clean ${file}: ${error.message}`);
    }
  }
});

logger.info('Build size optimization complete!');
