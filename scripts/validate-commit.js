#!/usr/bin/env node

/**
 * TrialSage Commit Validation Script
 * Validates commits for redundant files and code quality
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class CommitValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  log(type, message) {
    const colors = {
      error: '\x1b[31m❌',
      warning: '\x1b[33m⚠️',
      success: '\x1b[32m✅',
      info: '\x1b[34mℹ️',
    };
    logger.info(`${colors[type]} ${message}\x1b[0m`);
  }

  addError(message) {
    this.errors.push(message);
    this.log('error', message);
  }

  addWarning(message) {
    this.warnings.push(message);
    this.log('warning', message);
  }

  // Get list of staged files
  getStagedFiles() {
    try {
      const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
      return output.trim().split('\n').filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  // Check for redundant file patterns
  checkRedundantFiles() {
    this.log('info', 'Checking for redundant files...');

    const redundantPatterns = [
      /\.log$/,
      /\.tmp$/,
      /\.temp$/,
      /~$/,
      /\.swp$/,
      /\.swo$/,
      /\.DS_Store$/,
      /Thumbs\.db$/,
      /node_modules\//,
      /\.env$/,
      /\.env\.local$/,
      /\.backup$/,
      /\.bak$/,
      /_backup_/,
      /^backup_/,
      /^temp_/,
      /_temp_/,
      /\.orig$/,
      /\.rej$/,
      /_v\d+\./,
      /\.old$/,
    ];

    const stagedFiles = this.getStagedFiles();

    for (const file of stagedFiles) {
      for (const pattern of redundantPatterns) {
        if (pattern.test(file)) {
          this.addError(`Redundant file detected: ${file}`);
          break;
        }
      }
    }
  }

  // Check for large files
  checkLargeFiles() {
    this.log('info', 'Checking for large files...');

    const stagedFiles = this.getStagedFiles();
    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of stagedFiles) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        if (stats.size > maxSize) {
          this.addError(
            `Large file detected (${(stats.size / 1024 / 1024).toFixed(2)}MB): ${file}`
          );
        }
      }
    }
  }

  // Check for sensitive data
  checkSensitiveData() {
    this.log('info', 'Checking for sensitive data...');

    const sensitivePatterns = [
      /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
      /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/i,
      /secret\s*[:=]\s*['"][^'"]{8,}['"]/i,
      /token\s*[:=]\s*['"][^'"]{20,}['"]/i,
      /OPENAI_API_KEY/,
      /DATABASE_URL.*:\/\/.*:.*@/,
      /JWT_SECRET/,
      /SUPABASE_SERVICE_ROLE_KEY/,
    ];

    const stagedFiles = this.getStagedFiles();
    const textFiles = stagedFiles.filter(file =>
      /\.(js|jsx|ts|tsx|py|json|env|md|txt)$/.test(file)
    );

    for (const file of textFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            this.addError(`Potential sensitive data found in: ${file}`);
            break;
          }
        }
      }
    }
  }

  // Check for debugging code
  checkDebuggingCode() {
    this.log('info', 'Checking for debugging code...');

    const debugPatterns = [
      /console\.log/,
      /debugger;/,
      /print\(/,
      /pdb\.set_trace/,
      /import pdb/,
      /console\.error/,
      /console\.warn/,
    ];

    const stagedFiles = this.getStagedFiles();
    const codeFiles = stagedFiles.filter(file => /\.(js|jsx|ts|tsx|py)$/.test(file));

    for (const file of codeFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          for (const pattern of debugPatterns) {
            if (pattern.test(lines[i])) {
              this.addWarning(`Debugging code found in ${file}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        }
      }
    }
  }

  // Check JavaScript/TypeScript syntax
  checkSyntax() {
    this.log('info', 'Checking syntax...');

    const stagedFiles = this.getStagedFiles();
    const jsFiles = stagedFiles.filter(file => /\.(js|jsx)$/.test(file));
    const tsFiles = stagedFiles.filter(file => /\.(ts|tsx)$/.test(file));

    // Check JavaScript files
    for (const file of jsFiles) {
      if (fs.existsSync(file)) {
        try {
          execSync(`node -c "${file}"`, { stdio: 'pipe' });
        } catch (error) {
          this.addError(`JavaScript syntax error in: ${file}`);
        }
      }
    }

    // Check TypeScript files (if tsc is available)
    if (tsFiles.length > 0) {
      try {
        execSync('which tsc', { stdio: 'pipe' });
        for (const file of tsFiles) {
          if (fs.existsSync(file)) {
            try {
              execSync(`tsc --noEmit --skipLibCheck "${file}"`, { stdio: 'pipe' });
            } catch (error) {
              this.addError(`TypeScript compilation error in: ${file}`);
            }
          }
        }
      } catch (error) {
        this.addWarning('TypeScript compiler not available, skipping TS syntax check');
      }
    }
  }

  // Check for TODO/FIXME without tracking
  checkTodos() {
    this.log('info', 'Checking for untracked TODOs...');

    const stagedFiles = this.getStagedFiles();
    const codeFiles = stagedFiles.filter(file => /\.(js|jsx|ts|tsx|py|md)$/.test(file));

    for (const file of codeFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (/TODO|FIXME|XXX|HACK/.test(lines[i])) {
            this.addWarning(`TODO/FIXME found in ${file}:${i + 1}: ${lines[i].trim()}`);
          }
        }
      }
    }
  }

  // Run all validations
  validate() {
    this.log('info', '🛡️ Running TrialSage commit validation...');

    this.checkRedundantFiles();
    this.checkLargeFiles();
    this.checkSensitiveData();
    this.checkDebuggingCode();
    this.checkSyntax();
    this.checkTodos();

    // Summary
    logger.info('\n📊 Validation Summary:');
    this.log('info', `Errors: ${this.errors.length}`);
    this.log('info', `Warnings: ${this.warnings.length}`);

    if (this.errors.length > 0) {
      this.log('error', 'Commit validation failed! Please fix the errors above.');
      return false;
    } else {
      this.log('success', 'All commit validations passed!');
      if (this.warnings.length > 0) {
        this.log('warning', 'There are warnings that you may want to address.');
      }
      return true;
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new CommitValidator();
  const isValid = validator.validate();
  process.exit(isValid ? 0 : 1);
}

module.exports = CommitValidator;
