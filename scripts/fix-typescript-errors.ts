#!/usr/bin/env npx ts-node
/**
 * Automated TypeScript Error Fixer
 *
 * This script programmatically fixes common TypeScript errors:
 * 1. TS18047: 'db' is possibly 'null' - Add non-null assertions or early returns
 * 2. TS18046: 'error' is of type 'unknown' - Add type assertions in catch blocks
 * 3. TS2531: Object is possibly 'null' - Add optional chaining or non-null assertions
 */

import * as fs from 'fs';
import * as path from 'path';

interface FileFixResult {
  file: string;
  fixesApplied: number;
  errors: string[];
}

// Patterns to fix
const FIX_PATTERNS = [
  // Fix 1: db possibly null - add early return guard
  {
    name: 'db-null-guard',
    // Match: await db.select or db.insert etc without prior null check
    pattern:
      /^(\s*)(const|let|var)?\s*(\w+\s*=\s*)?await\s+db\.(select|insert|update|delete|query)/gm,
    replacement: (
      match: string,
      indent: string,
      varType: string,
      varAssign: string,
      method: string
    ) => {
      return `${indent}if (!db) throw new Error('Database connection not available');\n${match}`;
    },
    shouldApply: (content: string, matchIndex: number) => {
      // Check if there's already a guard before this line
      const before = content.substring(Math.max(0, matchIndex - 200), matchIndex);
      return !before.includes('if (!db)') && !before.includes('if (db === null)');
    },
  },
  // Fix 2: error is unknown - add type assertion in catch
  {
    name: 'error-unknown-type',
    pattern: /catch\s*\(\s*error\s*\)\s*\{/g,
    replacement: 'catch (error: unknown) {',
    shouldApply: () => true,
  },
  // Fix 3: Add error type guard helper usage
  {
    name: 'error-message-access',
    pattern: /(\s+)(error\.message|error\.stack)/g,
    replacement: (match: string, indent: string, prop: string) => {
      const accessor = prop === 'error.message' ? 'message' : 'stack';
      return `${indent}(error instanceof Error ? error.${accessor} : String(error))`;
    },
    shouldApply: (content: string, matchIndex: number) => {
      // Only apply if we're inside a catch block
      const before = content.substring(Math.max(0, matchIndex - 500), matchIndex);
      return before.includes('catch') && !before.includes('instanceof Error');
    },
  },
];

// Files with most errors to prioritize
const PRIORITY_FILES = [
  'server/statistics-service.ts',
  'server/services/medicalDeviceService.ts',
  'server/storage.ts',
  'server/services/fdaIntegrationService.ts',
  'server/routes/quality-management-api.ts',
  'server/services/cerGenerationService.ts',
  'server/routes/academic_protocol_assessment.ts',
  'server/repositories/learningRepository.ts',
  'server/services/part11ComplianceService.ts',
  'client/src/pages/Analytics.tsx',
  'server/routes/traceability-mapping-routes.ts',
  'server/data-importer.ts',
  'server/services/unifiedTaskService.ts',
];

function addDbNullGuard(content: string): { content: string; fixes: number } {
  let fixes = 0;

  // Find all db method calls and add guards if not present
  const lines = content.split('\n');
  const result: string[] = [];
  let inFunction = false;
  let hasDbGuard = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track function boundaries
    if (line.match(/^\s*(async\s+)?(function|const\s+\w+\s*=\s*async)/)) {
      inFunction = true;
      hasDbGuard = false;
      braceCount = 0;
    }

    // Count braces
    braceCount += (line.match(/{/g) || []).length;
    braceCount -= (line.match(/}/g) || []).length;

    if (braceCount === 0 && inFunction) {
      inFunction = false;
      hasDbGuard = false;
    }

    // Check for existing db guard
    if (line.includes('if (!db)') || line.includes('if (db === null)')) {
      hasDbGuard = true;
    }

    // Check if line uses db and needs guard
    if (inFunction && !hasDbGuard && line.match(/\bdb\.(select|insert|update|delete|query)\b/)) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      result.push(`${indent}if (!db) throw new Error('Database connection not available');`);
      hasDbGuard = true;
      fixes++;
    }

    result.push(line);
  }

  return { content: result.join('\n'), fixes };
}

function fixErrorUnknownType(content: string): { content: string; fixes: number } {
  let fixes = 0;

  // Fix catch (error) to catch (error: unknown)
  const newContent = content.replace(/catch\s*\(\s*error\s*\)\s*\{/g, match => {
    if (!match.includes(': unknown')) {
      fixes++;
      return 'catch (error: unknown) {';
    }
    return match;
  });

  return { content: newContent, fixes };
}

function fixErrorPropertyAccess(content: string): { content: string; fixes: number } {
  let fixes = 0;

  // Fix error.message and error.stack access
  let newContent = content;

  // Pattern: error.message without instanceof check nearby
  const messagePattern = /(\s+)(?<!instanceof Error \? )error\.message(?!\s*:)/g;
  newContent = newContent.replace(messagePattern, (match, indent) => {
    // Check if already wrapped or has proper type guard
    fixes++;
    return `${indent}(error instanceof Error ? error.message : String(error))`;
  });

  return { content: newContent, fixes };
}

async function fixFile(filePath: string): Promise<FileFixResult> {
  const result: FileFixResult = {
    file: filePath,
    fixesApplied: 0,
    errors: [],
  };

  try {
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) {
      result.errors.push(`File not found: ${fullPath}`);
      return result;
    }

    let content = fs.readFileSync(fullPath, 'utf-8');
    const originalContent = content;

    // Apply fixes
    const dbFix = addDbNullGuard(content);
    content = dbFix.content;
    result.fixesApplied += dbFix.fixes;

    const errorTypeFix = fixErrorUnknownType(content);
    content = errorTypeFix.content;
    result.fixesApplied += errorTypeFix.fixes;

    // Only write if changes were made
    if (content !== originalContent) {
      fs.writeFileSync(fullPath, content, 'utf-8');
      logger.info(`✓ Fixed ${result.fixesApplied} issues in ${filePath}`);
    } else {
      logger.info(`- No fixes needed in ${filePath}`);
    }
  } catch (err) {
    result.errors.push(`Error processing ${filePath}: ${err}`);
  }

  return result;
}

async function main() {
  logger.info('=== TypeScript Error Auto-Fixer ===\n');

  let totalFixes = 0;
  const results: FileFixResult[] = [];

  for (const file of PRIORITY_FILES) {
    const result = await fixFile(file);
    results.push(result);
    totalFixes += result.fixesApplied;
  }

  logger.info(`\n=== Summary ===`);
  logger.info(`Total fixes applied: ${totalFixes}`);
  logger.info(`Files processed: ${results.length}`);

  const errors = results.flatMap(r => r.errors);
  if (errors.length > 0) {
    logger.info(`\nErrors encountered:`);
    errors.forEach(e => logger.info(`  - ${e}`));
  }
}

main().catch(console.error);
