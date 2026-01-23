/**
 * ensureCoreTables.ts - Enterprise Database Schema Enforcement
 * 
 * This module ensures all core tables exist before the application starts.
 * Instead of creating tables (which can conflict with Drizzle migrations),
 * it validates required tables exist and reports any missing ones.
 * 
 * DESIGN PRINCIPLES:
 * 1. Idempotent - safe to run multiple times
 * 2. Non-destructive - never modifies existing tables
 * 3. Diagnostic - clearly reports what's missing
 * 4. Startup-friendly - doesn't block on optional tables
 */

import { Pool } from 'pg';
import dns from 'dns';

// Force IPv4 to prevent ENETUNREACH errors in environments without IPv6
dns.setDefaultResultOrder('ipv4first');

/**
 * Tables required for absolute minimum application functionality.
 * If these are missing, the app cannot start properly.
 */
const CRITICAL_TABLES = [
  'organizations',
  'users',
];

/**
 * Tables needed for full functionality but app can start without them.
 */
const IMPORTANT_TABLES = [
  'projects',
  'licenses',
  'audit_logs',
  'activity_feed',
  'organization_users',
  'auth_users',
  'auth_refresh_tokens',
  'roles',
  'permissions',
  'user_roles',
  'organization_settings',
  'document_templates',
  'lumen_data_atoms',
];

/**
 * Optional tables for specific features.
 */
const OPTIONAL_TABLES = [
  'ectd_nodes',
  'cmc_method_overrides',
  'coauthor_validation_rules',
  'ai_dead_letter_queue',
  'ai_token_budget',
  'sharepoint_files',
  'sharepoint_file_versions',
  'sharepoint_audit_log',
  'sharepoint_shares',
  'sharepoint_comments',
  'sharepoint_locks',
  'leaves',
  'facts',
  'leaf_citations',
  'leaf_patches',
  'validation_findings',
  'audit_trail',
];

export interface EnsureTablesResult {
  success: boolean;
  existingTables: string[];
  missingCritical: string[];
  missingImportant: string[];
  missingOptional: string[];
  errors: string[];
  duration: number;
}

/**
 * Check which tables exist in the database.
 */
export async function ensureCoreTables(connectionString?: string): Promise<EnsureTablesResult> {
  const dbUrl = connectionString || process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL;
  const startTime = Date.now();
  const result: EnsureTablesResult = {
    success: false,
    existingTables: [],
    missingCritical: [],
    missingImportant: [],
    missingOptional: [],
    errors: [],
    duration: 0,
  };

  if (!dbUrl) {
    result.errors.push('DATABASE_URL not set');
    result.duration = Date.now() - startTime;
    return result;
  }

  // Neon database detection (cloud PostgreSQL)
  const isNeonDb = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: isNeonDb ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    console.log('[ensureCoreTables] Starting table verification...');
    console.log(`[ensureCoreTables] Database: ${isNeonDb ? 'Neon Cloud' : 'Local'}`);
    
    // Get list of existing tables
    const tablesResult = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const existingTables = new Set(tablesResult.rows.map(r => r.tablename));
    result.existingTables = Array.from(existingTables);
    
    // Check critical tables
    for (const table of CRITICAL_TABLES) {
      if (!existingTables.has(table)) {
        result.missingCritical.push(table);
      }
    }
    
    // Check important tables
    for (const table of IMPORTANT_TABLES) {
      if (!existingTables.has(table)) {
        result.missingImportant.push(table);
      }
    }
    
    // Check optional tables
    for (const table of OPTIONAL_TABLES) {
      if (!existingTables.has(table)) {
        result.missingOptional.push(table);
      }
    }
    
    result.duration = Date.now() - startTime;
    
    // Success if no critical tables are missing
    result.success = result.missingCritical.length === 0;
    
    // Log summary
    console.log(`[ensureCoreTables] Found ${result.existingTables.length} tables in database`);
    
    if (result.missingCritical.length > 0) {
      console.error(`[ensureCoreTables] ❌ CRITICAL TABLES MISSING: ${result.missingCritical.join(', ')}`);
      console.error('[ensureCoreTables] Run: npm run db:push to sync schema');
    }
    
    if (result.missingImportant.length > 0) {
      console.warn(`[ensureCoreTables] ⚠️ Important tables missing: ${result.missingImportant.join(', ')}`);
    }
    
    console.log(`[ensureCoreTables] Verification complete in ${result.duration}ms`);
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);
    console.error('[ensureCoreTables] Error:', errorMsg);
  } finally {
    await pool.end();
  }

  return result;
}

/**
 * Validates that all required tables exist.
 * Throws an error if any critical table is missing.
 */
export async function validateCoreTables(connectionString?: string): Promise<void> {
  const result = await ensureCoreTables(connectionString);
  
  if (result.errors.length > 0) {
    throw new Error(`Database validation errors: ${result.errors.join(', ')}`);
  }
  
  if (result.missingCritical.length > 0) {
    throw new Error(`Missing critical tables: ${result.missingCritical.join(', ')}. Run: npm run db:push`);
  }
  
  console.log('[validateCoreTables] All critical tables present');
}

/**
 * Get a diagnostic report of database status.
 */
export async function getDatabaseDiagnostics(connectionString?: string): Promise<string> {
  const result = await ensureCoreTables(connectionString);
  
  const lines = [
    '========================================',
    'DATABASE DIAGNOSTICS REPORT',
    '========================================',
    '',
    `Status: ${result.success ? '✅ HEALTHY' : '❌ ISSUES DETECTED'}`,
    `Duration: ${result.duration}ms`,
    '',
    `Existing Tables (${result.existingTables.length}):`,
    ...result.existingTables.map(t => `  ✓ ${t}`),
    '',
  ];
  
  if (result.missingCritical.length > 0) {
    lines.push(`CRITICAL Missing (${result.missingCritical.length}):`);
    lines.push(...result.missingCritical.map(t => `  ❌ ${t}`));
    lines.push('');
  }
  
  if (result.missingImportant.length > 0) {
    lines.push(`Important Missing (${result.missingImportant.length}):`);
    lines.push(...result.missingImportant.map(t => `  ⚠️ ${t}`));
    lines.push('');
  }
  
  if (result.errors.length > 0) {
    lines.push('Errors:');
    lines.push(...result.errors.map(e => `  ❌ ${e}`));
    lines.push('');
  }
  
  lines.push('========================================');
  
  return lines.join('\n');
}

// CLI support - run with: npx tsx server/db/ensureCoreTables.ts
if (process.argv[1]?.includes('ensureCoreTables')) {
  (async () => {
    const report = await getDatabaseDiagnostics();
    console.log(report);
    process.exit(0);
  })();
}

export default { ensureCoreTables, validateCoreTables, getDatabaseDiagnostics };
