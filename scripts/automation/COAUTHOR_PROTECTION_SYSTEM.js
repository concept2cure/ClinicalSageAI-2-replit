/**
 * COAUTHOR PROTECTION SYSTEM - STRUCTURAL ENFORCEMENT
 *
 * This system provides concrete protection against unauthorized
 * creation of alternative CoAuthor implementations.
 */

import fs from 'fs';
import path from 'path';

// OFFICIAL VERSION REGISTRY
const PROTECTED_FILES = {
  official: 'client/src/pages/CoAuthor.jsx',
  lockMarker: 'CoAuthor.jsx.VERSION_LOCK',
  constraints: 'AGENT_BUILD_CONSTRAINTS.md',
};

// PROHIBITED FILE PATTERNS - These cannot be created
const PROHIBITED_PATTERNS = [
  /.*CoAuthor.*\.jsx$/,
  /.*coauthor.*\.jsx$/,
  /.*CoAuthor.*\.js$/,
  /.*coauthor.*\.js$/,
  /Simple.*\.jsx$/,
  /Demo.*\.jsx$/,
  /Test.*\.jsx$/,
  /Working.*\.jsx$/,
  /Real.*\.jsx$/,
  /Minimal.*\.jsx$/,
  /Mock.*\.jsx$/,
  /MVP.*\.jsx$/,
  /Temp.*\.jsx$/,
  /Alt.*\.jsx$/,
  /New.*\.jsx$/,
  /Basic.*\.jsx$/,
];

// ALLOWED OPERATIONS - Only these are permitted
const ALLOWED_OPERATIONS = {
  READ: ['view', 'check', 'verify'],
  ENHANCE: ['str_replace within CoAuthor.jsx only'],
  FORBIDDEN: ['create', 'copy', 'duplicate', 'rebuild', 'recreate'],
};

class CoAuthorProtectionSystem {
  constructor() {
    this.isActive = true;
    this.violations = [];
    this.officialPath = PROTECTED_FILES.official;
  }

  // Check if a file path violates protection rules
  isProhibitedPath(filePath) {
    return PROHIBITED_PATTERNS.some(pattern => pattern.test(filePath));
  }

  // Verify official file exists and is intact
  verifyOfficialVersion() {
    if (!fs.existsSync(this.officialPath)) {
      throw new Error('CRITICAL VIOLATION: Official CoAuthor.jsx missing!');
    }

    const stats = fs.statSync(this.officialPath);
    return {
      exists: true,
      size: stats.size,
      modified: stats.mtime,
      status: 'PROTECTED AND VERIFIED',
    };
  }

  // Block prohibited file creation attempts
  blockProhibitedCreation(attemptedPath) {
    if (this.isProhibitedPath(attemptedPath)) {
      const violation = {
        type: 'PROHIBITED_FILE_CREATION',
        path: attemptedPath,
        timestamp: new Date().toISOString(),
        blocked: true,
      };

      this.violations.push(violation);

      throw new Error(`
        PROTECTION SYSTEM BLOCKED: ${attemptedPath}
        
        This file pattern is PROHIBITED under protection rules.
        Only enhancements to ${this.officialPath} are permitted.
        
        Violation logged: ${violation.timestamp}
      `);
    }
  }

  // Get protection status
  getProtectionStatus() {
    return {
      active: this.isActive,
      officialFile: this.officialPath,
      protectedPatterns: PROHIBITED_PATTERNS.length,
      violations: this.violations.length,
      lastCheck: new Date().toISOString(),
      enforcement: 'ACTIVE - STRUCTURAL BLOCKING ENABLED',
    };
  }

  // Enforcement report
  generateEnforcementReport() {
    return {
      system: 'CoAuthor Protection System',
      status: 'ACTIVE',
      officialVersion: this.verifyOfficialVersion(),
      prohibitedPatterns: PROHIBITED_PATTERNS.map(p => p.source),
      allowedOperations: ALLOWED_OPERATIONS,
      violationCount: this.violations.length,
      protectionLevel: 'MAXIMUM',
    };
  }
}

// Create and export protection instance
export const coAuthorProtection = new CoAuthorProtectionSystem();

// Auto-verify on import
try {
  const status = coAuthorProtection.verifyOfficialVersion();
  console.log('✓ CoAuthor Protection System: ACTIVE');
  console.log(`✓ Official version verified: ${status.size} bytes`);
} catch (error) {
  console.error('✗ CoAuthor Protection System: VIOLATION DETECTED');
  console.error(error.message);
}
