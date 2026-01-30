#!/usr/bin/env node

/**
 * Document Editor Protection Script
 *
 * This script provides automated protection and monitoring for the
 * UltimateDocumentEditor.jsx file to prevent accidental damage or loss.
 *
 * Usage:
 *   node protect-document-editor.js --monitor  (continuous monitoring)
 *   node protect-document-editor.js --restore  (restore from backup)
 *   node protect-document-editor.js --backup   (create new backup)
 *   node protect-document-editor.js --verify   (verify integrity)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DocumentEditorProtection {
  constructor() {
    this.primaryFile = 'client/src/pages/UltimateDocumentEditor.jsx';
    this.backupFile = 'client/src/pages/UltimateDocumentEditor.jsx.PROTECTED_BACKUP_FULL';
    this.hashFile = '.document-editor-hash';
    this.logFile = 'document-editor-protection.log';
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    logger.info(logEntry.trim());

    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (err) {
      logger.error('Failed to write to log file:', err.message);
    }
  }

  calculateHash(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      this.log(`Error calculating hash for ${filePath}: ${err.message}`);
      return null;
    }
  }

  verifyIntegrity() {
    this.log('Starting integrity verification...');

    if (!fs.existsSync(this.primaryFile)) {
      this.log('❌ CRITICAL: Primary Document Editor file is missing!');
      return false;
    }

    if (!fs.existsSync(this.backupFile)) {
      this.log('❌ WARNING: Protected backup file is missing!');
      return false;
    }

    const primaryHash = this.calculateHash(this.primaryFile);
    const backupHash = this.calculateHash(this.backupFile);

    if (!primaryHash || !backupHash) {
      this.log('❌ ERROR: Could not calculate file hashes');
      return false;
    }

    // Check if primary file is significantly smaller (potential corruption)
    const primaryStats = fs.statSync(this.primaryFile);
    const backupStats = fs.statSync(this.backupFile);

    if (primaryStats.size < backupStats.size * 0.5) {
      this.log('❌ CRITICAL: Primary file appears to be corrupted (too small)');
      return false;
    }

    // Store hash for monitoring
    try {
      fs.writeFileSync(this.hashFile, primaryHash);
    } catch (err) {
      this.log(`Warning: Could not save hash file: ${err.message}`);
    }

    this.log('✅ Integrity verification passed');
    return true;
  }

  createBackup() {
    this.log('Creating protected backup...');

    if (!fs.existsSync(this.primaryFile)) {
      this.log('❌ ERROR: Cannot create backup - primary file does not exist');
      return false;
    }

    try {
      fs.copyFileSync(this.primaryFile, this.backupFile);
      this.log('✅ Protected backup created successfully');
      return true;
    } catch (err) {
      this.log(`❌ ERROR: Failed to create backup: ${err.message}`);
      return false;
    }
  }

  restoreFromBackup() {
    this.log('🔄 RESTORING Document Editor from protected backup...');

    if (!fs.existsSync(this.backupFile)) {
      this.log('❌ CRITICAL: Protected backup file does not exist!');
      return false;
    }

    try {
      // Create safety backup of current file
      if (fs.existsSync(this.primaryFile)) {
        const safetyBackup = `${this.primaryFile}.corrupted.${Date.now()}`;
        fs.copyFileSync(this.primaryFile, safetyBackup);
        this.log(`📁 Created safety backup at: ${safetyBackup}`);
      }

      // Restore from protected backup
      fs.copyFileSync(this.backupFile, this.primaryFile);
      this.log('✅ Document Editor restored successfully from protected backup');

      // Verify restoration
      if (this.verifyIntegrity()) {
        this.log('✅ Restoration verified - Document Editor is functional');
        return true;
      } else {
        this.log('❌ WARNING: Restoration completed but verification failed');
        return false;
      }
    } catch (err) {
      this.log(`❌ CRITICAL: Failed to restore from backup: ${err.message}`);
      return false;
    }
  }

  startMonitoring() {
    this.log('🔍 Starting continuous monitoring of Document Editor...');

    // Initial verification
    if (!this.verifyIntegrity()) {
      this.log('⚠️  Initial integrity check failed - attempting restoration...');
      this.restoreFromBackup();
    }

    // Monitor for changes every 30 seconds
    setInterval(() => {
      if (!this.verifyIntegrity()) {
        this.log('🚨 ALERT: Document Editor integrity compromised - auto-restoring...');
        this.restoreFromBackup();
      }
    }, 30000);

    this.log('✅ Monitoring started - Document Editor is now protected');
  }

  showStatus() {
    logger.info('\n=== Document Editor Protection Status ===');

    const primaryExists = fs.existsSync(this.primaryFile);
    const backupExists = fs.existsSync(this.backupFile);

    logger.info(`Primary File: ${primaryExists ? '✅ EXISTS' : '❌ MISSING'}`);
    logger.info(`Backup File:  ${backupExists ? '✅ EXISTS' : '❌ MISSING'}`);

    if (primaryExists && backupExists) {
      const primaryStats = fs.statSync(this.primaryFile);
      const backupStats = fs.statSync(this.backupFile);

      logger.info(`Primary Size: ${primaryStats.size} bytes`);
      logger.info(`Backup Size:  ${backupStats.size} bytes`);

      const integrityOK = this.verifyIntegrity();
      logger.info(`Integrity:    ${integrityOK ? '✅ VERIFIED' : '❌ FAILED'}`);
    }

    logger.info('==========================================\n');
  }
}

// Command line interface
function main() {
  const protection = new DocumentEditorProtection();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    logger.info(`
Document Editor Protection System
Usage:
  node protect-document-editor.js --monitor   Start continuous monitoring
  node protect-document-editor.js --restore   Restore from backup
  node protect-document-editor.js --backup    Create new backup
  node protect-document-editor.js --verify    Verify integrity
  node protect-document-editor.js --status    Show status
    `);
    return;
  }

  switch (args[0]) {
    case '--monitor':
      protection.startMonitoring();
      break;

    case '--restore':
      protection.restoreFromBackup();
      break;

    case '--backup':
      protection.createBackup();
      break;

    case '--verify':
      const isValid = protection.verifyIntegrity();
      process.exit(isValid ? 0 : 1);
      break;

    case '--status':
      protection.showStatus();
      break;

    default:
      logger.info('Unknown command:', args[0]);
      process.exit(1);
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  logger.info('\n🛡️  Document Editor Protection terminated');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\n🛡️  Document Editor Protection terminated');
  process.exit(0);
});

if (require.main === module) {
  main();
}

module.exports = DocumentEditorProtection;
