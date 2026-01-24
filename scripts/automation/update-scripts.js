/**
 * This script safely modifies package.json to include the toast cleanup script
 * in both development and build processes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the current package.json
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Backup the original package.json
const backupPath = path.join(__dirname, 'package.json.backup');
fs.writeFileSync(backupPath, JSON.stringify(packageJson, null, 2));
console.log(`Created backup of package.json at ${backupPath}`);

// Update the scripts
const currentDevScript = packageJson.scripts.dev;
const currentBuildScript = packageJson.scripts.build;

// Only modify scripts if they don't already include our cleanup script
if (!currentDevScript.includes('node cleanup-toastify.js')) {
  packageJson.scripts.dev = `node cleanup-toastify.js && ${currentDevScript}`;
  console.log('Updated dev script to include toast cleanup');
}

if (!currentBuildScript.includes('node cleanup-toastify.js')) {
  packageJson.scripts.build = `node cleanup-toastify.js && ${currentBuildScript}`;
  console.log('Updated build script to include toast cleanup');
}

// Write the updated package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log('Package.json updated successfully!');
console.log('Run "npm run dev" to start the application with permanent toast fixes.');
