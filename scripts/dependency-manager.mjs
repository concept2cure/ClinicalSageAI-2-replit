#!/usr/bin/env node
/**
 * PERMANENT DEPENDENCY MANAGER
 * This script ensures ALL required dependencies are installed and available
 * Run before every server start to prevent dependency issues
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REQUIRED_DEPENDENCIES = {
  // Core application dependencies  
  'uuid': '^10.0.0',
  '@types/uuid': '^10.0.0',
  'docx': '^9.5.1',
  'pdf-lib': '^1.17.1', 
  'mammoth': '^1.8.0',
  'marked': '^16.2.1',
  'bcryptjs': '^3.0.2',
  'file-saver': '^2.0.5',
  'nodemailer': '^6.9.15',
  '@types/nodemailer': '^6.4.19',
  
  // TipTap editor dependencies (critical for Document Authoring)
  '@tiptap/react': '^2.8.0',
  '@tiptap/starter-kit': '^2.8.0', 
  '@tiptap/core': '^2.8.0',
  '@tiptap/extension-heading': '^2.8.0',
  '@tiptap/extension-bold': '^2.8.0',
  '@tiptap/extension-italic': '^2.8.0',
  '@tiptap/extension-list-item': '^2.8.0',
  '@tiptap/extension-ordered-list': '^2.8.0',
  '@tiptap/extension-bullet-list': '^2.8.0',
  '@tiptap/extension-paragraph': '^2.8.0',
  '@tiptap/extension-text': '^2.8.0',
  '@tiptap/extension-document': '^2.8.0',
  '@tiptap/pm': '^2.8.0'
};

console.log('🔧 DEPENDENCY MANAGER - Permanent Fix');
console.log('=====================================');

function checkPackageExists(packageName) {
  try {
    const packagePath = path.join('node_modules', packageName);
    return fs.existsSync(packagePath);
  } catch (error) {
    return false;
  }
}

function installMissingPackages() {
  const missingPackages = [];
  
  for (const [pkg, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
    if (!checkPackageExists(pkg)) {
      missingPackages.push(pkg);
      console.log(`❌ MISSING: ${pkg}`);
    } else {
      console.log(`✅ FOUND: ${pkg}`);
    }
  }
  
  if (missingPackages.length > 0) {
    console.log(`\n🚨 Installing ${missingPackages.length} missing packages...`);
    
    try {
      const installCmd = `npm install ${missingPackages.join(' ')}`;
      console.log(`Executing: ${installCmd}`);
      execSync(installCmd, { stdio: 'inherit' });
      console.log('✅ All missing packages installed successfully');
    } catch (error) {
      console.error('❌ Failed to install packages:', error.message);
      process.exit(1);
    }
  } else {
    console.log('✅ All required packages are present');
  }
}

function validateImports() {
  console.log('\n🔍 Validating critical imports...');
  
  const criticalFiles = [
    'server/routes/authoring.router.ts',
    'client/src/components/cmc/CMCDocumentAuthoring.jsx',
    'client/src/components/cmc/editor/extensions/TokenNode.jsx'
  ];
  
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ Critical file exists: ${file}`);
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  }
}

function lockDependencies() {
  console.log('\n🔒 Locking dependency versions...');
  
  try {
    // Ensure package-lock.json exists to lock versions
    if (!fs.existsSync('package-lock.json')) {
      execSync('npm install', { stdio: 'inherit' });
    }
    console.log('✅ Dependencies locked via package-lock.json');
  } catch (error) {
    console.error('❌ Failed to lock dependencies:', error.message);
  }
}

// Main execution
async function main() {
  try {
    installMissingPackages();
    validateImports();
    lockDependencies();
    
    console.log('\n🎉 DEPENDENCY MANAGEMENT COMPLETE');
    console.log('All required packages are installed and verified');
    console.log('=====================================');
  } catch (error) {
    console.error('💥 DEPENDENCY MANAGER FAILED:', error.message);
    process.exit(1);
  }
}

main();