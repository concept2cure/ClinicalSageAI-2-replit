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
    console.log(`Deleted: ${directoryPath}`);
  }
}

// Clean up react-toastify module if it exists
const toastifyPath = path.join(__dirname, 'node_modules', 'react-toastify');
if (fs.existsSync(toastifyPath)) {
  console.log('Found react-toastify in node_modules, removing...');
  deleteFolderRecursive(toastifyPath);
} else {
  console.log('react-toastify not found in node_modules (good!)');
}

// Clean Vite cache to prevent optimization errors
const viteCachePath = path.join(__dirname, 'node_modules', '.vite');
if (fs.existsSync(viteCachePath)) {
  console.log('Clearing Vite cache...');
  deleteFolderRecursive(viteCachePath);
} else {
  console.log('Vite cache not found or already cleared');
}

console.log('Toast dependency cleanup complete!');

// Ensure critical dependencies are installed
console.log('Checking critical dependencies...');

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
    const pkgPath = path.join(__dirname, 'node_modules', pkg.replace('/', path.sep));
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
  console.log(`[Attempt ${attempts}/${maxAttempts}] Missing ${missingPackages.length} package(s): ${missingPackages.join(', ')}`);
  
  try {
    // Install ALL missing packages at once (ignore scripts to avoid TensorFlow issues)
    execSync(`npm install ${missingPackages.join(' ')} --no-audit --no-fund --ignore-scripts --save`, { 
      stdio: 'inherit', 
      cwd: __dirname 
    });
    console.log('✅ Installation complete, verifying...');
    
    // Re-check what's still missing
    missingPackages = checkMissingPackages();
    
    if (missingPackages.length === 0) {
      console.log('✅ All critical packages successfully installed and verified');
      break;
    } else {
      console.log(`⚠️ ${missingPackages.length} package(s) still missing after installation`);
    }
  } catch (error) {
    console.error(`❌ Installation failed on attempt ${attempts}:`, error.message);
    if (attempts >= maxAttempts) {
      process.exit(1);
    }
  }
}

if (missingPackages.length > 0) {
  console.error(`❌ Failed to install all critical packages after ${maxAttempts} attempts`);
  console.error(`Still missing: ${missingPackages.join(', ')}`);
  process.exit(1);
}

console.log('✅ All critical dependencies verified and ready');

// Add build size optimization
console.log('Starting build size optimization...');

// Remove large unnecessary files
const filesToRemove = ['node_modules/.cache', '.vite', 'dist/cache', 'tmp', 'node_modules/.pnpm'];

filesToRemove.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    try {
      deleteFolderRecursive(fullPath);
      console.log(`✅ Cleaned: ${file}`);
    } catch (error) {
      console.log(`⚠️ Could not clean ${file}: ${error.message}`);
    }
  }
});

console.log('Build size optimization complete!');
