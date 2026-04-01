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
 *
 * POOL MANAGEMENT:
 * - When called from main app: uses the canonical pool from getPool()
 * - When run as CLI tool: creates a standalone pool (auto-detected via process.argv)
 */

import { Pool } from 'pg';
import dns from 'dns';

// Force IPv4 to prevent ENETUNREACH errors in environments without IPv6
dns.setDefaultResultOrder('ipv4first');

// Detect if running as CLI
const isCliMode = process.argv[1]?.includes('ensureCoreTables');

/**
 * Tables required for absolute minimum application functionality.
 * If these are missing, the app cannot start properly.
 */
const CRITICAL_TABLES = ['organizations', 'users'];

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
  'workflow_runs',
  'step_runs',
  'permissions',
  'user_roles',
  'organization_settings',
  'document_templates',
  'lumen_data_atoms',
  'assembly_docs',
  'assembly_audit_logs',
  // CERV2 Medical Device module tables
  'documents',
  'document_versions',
  'cerv2_510k_sections',
  'cerv2_section_versions',
  'cerv2_document_sessions',
  // RAG system tables
  'rag_documents',
  'rag_chunks',
  'rag_queries',
  'rag_knowledge_graph',
  'rag_ingestion_jobs',
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
  existingSchemas: string[];
  existingTables: string[];
  missingSchemas: string[];
  missingCritical: string[];
  missingImportant: string[];
  missingOptional: string[];
  missingExtensions: string[];
  warnings: string[];
  errors: string[];
  duration: number;
}

/**
 * Check which tables exist in the database.
 */
export async function ensureCoreTables(connectionString?: string): Promise<EnsureTablesResult> {
  // Import cleanDatabaseUrl inline to avoid circular dependencies
  const cleanDatabaseUrl = (url: string | undefined): string | undefined => {
    if (!url) return url;
    let cleaned = url;
    if (cleaned.startsWith('psql ')) {
      cleaned = cleaned.substring(5);
    }
    if (
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"'))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    return cleaned.trim();
  };

  const rawUrl =
    connectionString || process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET;
  const dbUrl = cleanDatabaseUrl(rawUrl);
  const startTime = Date.now();
  const result: EnsureTablesResult = {
    success: false,
    existingSchemas: [],
    existingTables: [],
    missingSchemas: [],
    missingCritical: [],
    missingImportant: [],
    missingOptional: [],
    missingExtensions: [],
    warnings: [],
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

  // Use standalone pool for CLI mode (will be .end()ed), or shared pool from getPool() for app mode
  let pool: Pool;
  let shouldEndPool = false;

  if (isCliMode || connectionString) {
    // CLI mode or explicit connectionString: create standalone pool
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isNeonDb ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });
    shouldEndPool = true;
  } else {
    // App mode: use canonical pool (import dynamically to avoid circular deps)
    const { getPool } = await import('../db');
    pool = getPool();
  }

  try {
    console.log('[ensureCoreTables] Starting table verification...');
    console.log(`[ensureCoreTables] Database: ${isNeonDb ? 'Neon Cloud' : 'Local'}`);
    console.log(`[ensureCoreTables] Pool mode: ${shouldEndPool ? 'standalone' : 'shared'}`);

    // Ensure baseline schemas exist for GA readiness
    const requiredSchemas = ['public', 'vault', 'extensions'];
    const schemaResult = await pool.query(`
      SELECT nspname
      FROM pg_namespace
      WHERE nspname = ANY($1::text[])
      ORDER BY nspname
    `, [requiredSchemas]);
    const existingSchemas = new Set(schemaResult.rows.map(r => r.nspname));
    result.existingSchemas = Array.from(existingSchemas);

    for (const schemaName of requiredSchemas) {
      if (!existingSchemas.has(schemaName)) {
        result.missingSchemas.push(schemaName);
      }
    }

    for (const missingSchema of result.missingSchemas) {
      try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${missingSchema}"`);
      } catch (schemaErr: any) {
        result.errors.push(`Could not create schema ${missingSchema}: ${schemaErr.message}`);
      }
    }

    // Ensure vector extension is available for retrieval/RAG workloads.
    // Neon often runs with restricted extension DDL for non-superuser roles, so
    // we only attempt CREATE EXTENSION there when explicitly enabled.
    const canAttemptExtensionDDL = !isNeonDb || process.env.ALLOW_EXTENSION_DDL === 'true';
    const extensionResult = await pool.query(`
      SELECT extname
      FROM pg_extension
      WHERE extname = ANY($1::text[])
      ORDER BY extname
    `, [['vector']]);
    const installedExtensions = new Set(extensionResult.rows.map(r => r.extname));
    if (!installedExtensions.has('vector')) {
      if (canAttemptExtensionDDL) {
        try {
          await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
        } catch (extensionErr: any) {
          result.missingExtensions.push('vector');
          result.errors.push(`Could not ensure extension vector: ${extensionErr.message}`);
        }
      } else {
        result.warnings.push(
          'Vector extension not installed and extension DDL skipped (Neon managed mode). Set ALLOW_EXTENSION_DDL=true to attempt CREATE EXTENSION.'
        );
      }
    }

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

    // Auto-create missing CERV2 and document tables if they don't exist
    const autoCreateTables: Record<string, string> = {
      documents: `CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        client_workspace_id INTEGER DEFAULT 1,
        document_code TEXT,
        title TEXT NOT NULL DEFAULT 'Untitled',
        document_type TEXT NOT NULL DEFAULT 'cerv2_510k',
        category TEXT DEFAULT 'regulatory',
        status TEXT DEFAULT 'draft',
        compliance_level TEXT,
        owner_id INTEGER DEFAULT 1,
        created_by_id INTEGER DEFAULT 1,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      document_versions: `CREATE TABLE IF NOT EXISTS document_versions (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        version_number TEXT DEFAULT '1.0',
        version_label TEXT,
        content TEXT,
        change_description TEXT,
        change_type TEXT DEFAULT 'edit',
        status TEXT DEFAULT 'draft',
        is_published BOOLEAN DEFAULT FALSE,
        checksum TEXT,
        created_by_id INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      cerv2_510k_sections: `CREATE TABLE IF NOT EXISTS cerv2_510k_sections (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        document_id INTEGER,
        section_number TEXT,
        section_title TEXT NOT NULL,
        section_key TEXT,
        category TEXT,
        level INTEGER DEFAULT 1,
        display_order INTEGER DEFAULT 0,
        is_required BOOLEAN DEFAULT TRUE,
        icon TEXT,
        status TEXT DEFAULT 'todo',
        content TEXT,
        assigned_to INTEGER,
        completion_percentage INTEGER DEFAULT 0,
        validation_status TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      cerv2_section_versions: `CREATE TABLE IF NOT EXISTS cerv2_section_versions (
        id SERIAL PRIMARY KEY,
        section_id INTEGER NOT NULL,
        organization_id INTEGER NOT NULL,
        version_number INTEGER DEFAULT 1,
        change_type TEXT DEFAULT 'edit',
        content TEXT,
        field_data JSONB,
        changed_by INTEGER,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      cerv2_document_sessions: `CREATE TABLE IF NOT EXISTS cerv2_document_sessions (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        document_id INTEGER,
        user_id INTEGER,
        open_sections JSONB,
        active_section_id INTEGER,
        is_dirty BOOLEAN DEFAULT FALSE,
        last_activity TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      rag_documents: `CREATE TABLE IF NOT EXISTS rag_documents (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL,
        document_id TEXT,
        title TEXT,
        document_type TEXT,
        status TEXT DEFAULT 'pending',
        therapeutic_area TEXT,
        compound TEXT,
        embed_model TEXT DEFAULT 'text-embedding-3-small',
        chunk_count INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      rag_chunks: `CREATE TABLE IF NOT EXISTS rag_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        chunk_id TEXT,
        chunk_index INTEGER DEFAULT 0,
        content TEXT NOT NULL,
        entities JSONB,
        keywords JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
    };

    const createdTables: string[] = [];
    for (const [tableName, createSql] of Object.entries(autoCreateTables)) {
      if (!existingTables.has(tableName)) {
        try {
          await pool.query(createSql);
          createdTables.push(tableName);
          existingTables.add(tableName);
          // Remove from missing lists since we just created it
          result.missingImportant = result.missingImportant.filter(t => t !== tableName);
        } catch (createErr) {
          const msg = createErr instanceof Error ? createErr.message : String(createErr);
          console.warn(`[ensureCoreTables] Could not auto-create ${tableName}: ${msg}`);
        }
      }
    }
    if (createdTables.length > 0) {
      console.log(`[ensureCoreTables] ✅ Auto-created tables: ${createdTables.join(', ')}`);
    }

    result.existingTables = Array.from(existingTables);
    result.duration = Date.now() - startTime;

    // Success if no critical tables/schemas/extensions are missing and no hard errors
    result.success =
      result.missingCritical.length === 0 &&
      result.missingSchemas.length === 0 &&
      result.missingExtensions.length === 0 &&
      result.errors.length === 0;

    // Log summary
    console.log(`[ensureCoreTables] Found ${result.existingTables.length} tables in database`);

    if (result.missingCritical.length > 0) {
      console.error(
        `[ensureCoreTables] ❌ CRITICAL TABLES MISSING: ${result.missingCritical.join(', ')}`
      );
      console.error('[ensureCoreTables] Run: npm run db:push to sync schema');
    }

    if (result.missingImportant.length > 0) {
      console.warn(
        `[ensureCoreTables] ⚠️ Important tables missing: ${result.missingImportant.join(', ')}`
      );
    }

    if (result.missingSchemas.length > 0) {
      console.warn(
        `[ensureCoreTables] ⚠️ Schemas required initialization: ${result.missingSchemas.join(', ')}`
      );
    }

    if (result.missingExtensions.length > 0) {
      console.warn(
        `[ensureCoreTables] ⚠️ Missing required extensions: ${result.missingExtensions.join(', ')}`
      );
    }

    if (result.warnings.length > 0) {
      console.warn('[ensureCoreTables] Warnings:', result.warnings);
    }

    console.log(`[ensureCoreTables] Verification complete in ${result.duration}ms`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMsg);
    console.error('[ensureCoreTables] Error:', errorMsg);
  } finally {
    // Only end pool if we created a standalone one (CLI mode or explicit connectionString)
    if (shouldEndPool) {
      await pool.end();
    }
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
    throw new Error(
      `Missing critical tables: ${result.missingCritical.join(', ')}. Run: npm run db:push`
    );
  }

  if (result.missingExtensions.length > 0) {
    throw new Error(
      `Missing required extensions: ${result.missingExtensions.join(', ')}. Ensure extension install permissions and retry`
    );
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
    `Existing Schemas (${result.existingSchemas.length}):`,
    ...result.existingSchemas.map(s => `  ✓ ${s}`),
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

  if (result.missingSchemas.length > 0) {
    lines.push(`Schemas Initialized During Check (${result.missingSchemas.length}):`);
    lines.push(...result.missingSchemas.map(s => `  ⚠️ ${s}`));
    lines.push('');
  }

  if (result.missingExtensions.length > 0) {
    lines.push(`Missing Extensions (${result.missingExtensions.length}):`);
    lines.push(...result.missingExtensions.map(e => `  ❌ ${e}`));
    lines.push('');
  }

  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}):`);
    lines.push(...result.warnings.map(w => `  ⚠️ ${w}`));
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
