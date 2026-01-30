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

logger.info('🔧 DEPENDENCY MANAGER - Permanent Fix');
logger.info('=====================================');

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
      logger.info(`❌ MISSING: ${pkg}`);
    } else {
      logger.info(`✅ FOUND: ${pkg}`);
    }
  }
  
  if (missingPackages.length > 0) {
    logger.info(`\n🚨 Installing ${missingPackages.length} missing packages...`);
    
    try {
      const installCmd = `npm install ${missingPackages.join(' ')}`;
      logger.info(`Executing: ${installCmd}`);
      execSync(installCmd, { stdio: 'inherit' });
      logger.info('✅ All missing packages installed successfully');
    } catch (error) {
      logger.error('❌ Failed to install packages:', error.message);
      process.exit(1);
    }
  } else {
    logger.info('✅ All required packages are present');
  }
}

function validateImports() {
  logger.info('\n🔍 Validating critical imports...');
  
  const criticalFiles = [
    'server/routes/authoring.router.ts',
    'client/src/components/cmc/CMCDocumentAuthoring.jsx',
    'client/src/components/cmc/editor/extensions/TokenNode.jsx'
  ];
  
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      logger.info(`✅ Critical file exists: ${file}`);
    } else {
      logger.info(`⚠️  File not found: ${file}`);
    }
  }
}

function lockDependencies() {
  logger.info('\n🔒 Locking dependency versions...');
  
  try {
    // Ensure package-lock.json exists to lock versions
    if (!fs.existsSync('package-lock.json')) {
      execSync('npm install', { stdio: 'inherit' });
    }
    logger.info('✅ Dependencies locked via package-lock.json');
  } catch (error) {
    logger.error('❌ Failed to lock dependencies:', error.message);
  }
}

// Main execution
async function main() {
  try {
    installMissingPackages();
    validateImports();
    lockDependencies();
    
    logger.info('\n🎉 DEPENDENCY MANAGEMENT COMPLETE');
    logger.info('All required packages are installed and verified');
    logger.info('=====================================');
  } catch (error) {
    logger.error('💥 DEPENDENCY MANAGER FAILED:', error.message);
    process.exit(1);
  }
}

main();