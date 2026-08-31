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
  // Server-side RBAC and token revocation. Both are read on the request path
  // (server/middleware/requirePlatformAdmin.ts, requireBusinessAdmin.ts, and
  // the revocation check in server/lib/startup-invariants.ts), and both are
  // security-critical for readiness — see SECURITY_CRITICAL_TABLES in
  // server/startup/services.ts. A table absent from this list can never appear
  // in missingImportant, so that gate would silently not cover them.
  'platform_role_grants',
  'revoked_tokens',
  // auth_users / auth_refresh_tokens / roles / permissions / user_roles were
  // listed here and are deliberately gone. Nothing creates them — their only
  // DDL sits in the quarantined db/migrations/_consolidated tree — and nothing
  // queries them. Keeping them meant every correctly provisioned database
  // logged five permanent "important tables missing" warnings, which is how a
  // diagnostic stops being read.
  'workflow_runs',
  // step_runs / organization_settings / assembly_docs / assembly_audit_logs were
  // listed here and are deliberately gone (evidence-based reachability audit,
  // 2026-08-11). None is queried by any LIVE production path, so listing them made
  // readiness warn about tables no shipped code needs — the same "a diagnostic
  // stops being read" failure the auth_users cohort above caused:
  //   • organization_settings — phantom: it appears only as an audit-log
  //     resourceType LABEL (server/routes/ana-tool-policy.ts,
  //     organizations-routes.ts); no SQL anywhere addresses a table by that name.
  //   • step_runs — the hash-chained public.step_runs is written only by
  //     WorkflowExecutionEngine, which is referenced solely from a test, and it has
  //     no creator on any lineage. Its companion public.workflow_runs stays above:
  //     the MOUNTED orchestration-checkpoints route reads it and 0007 provisions it.
  //   • assembly_docs / assembly_audit_logs — written only by AssemblyLine, which
  //     is instantiated only by /api/test-assembly, a route fenced OUT of non-test
  //     environments (server/bootstrap/register-core-routes.ts). Test scaffolding,
  //     not production schema.
  // If any is later wired into a live path, provision it durably and restore the
  // entry then — don't warn for a table before it is real.
  'document_templates',
  'lumen_data_atoms',
  // CERV2 Medical Device module tables
  'documents',
  'document_versions',
  'cerv2_510k_sections',
  'cerv2_section_versions',
  // cerv2_document_sessions removed (reachability audit, 2026-08-11): provisioned
  // (shared/schema.ts + boot autocreate) but queried by NOTHING in shipped server
  // code — the mounted cerv2-versions.ts never reads it and the drizzle export is
  // imported nowhere. Its boot autocreate DDL was dropped too. Restore both if a
  // document-session feature is wired to a live route.
  // RAG system tables
  'rag_documents',
  'rag_chunks',
  'rag_queries',
  'rag_knowledge_graph',
  // rag_ingestion_jobs removed (reachability audit, 2026-08-11): defined in
  // shared/schema.ts but no live SQL or ORM consumer anywhere — gating readiness
  // on it warned about a table no shipped code needs.
  // Pharmacovigilance + commitments (applied via `npm run db:apply-c2c`).
  'adverse_events',
  'icsrs',
  'safety_signals',
  'periodic_safety_reports',
  'risk_management_plans',
  'c2c_commitments',
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

/**
 * Regulated subsystems that must be provisioned AS A UNIT. Unlike the flat
 * table tiers above, a subsystem is judged whole/partial/absent together,
 * because a half-provisioned regulated surface is worse than an absent one.
 *
 * Authoring: the tenant-scoped tables the db/migrations/20260725_authoring_* and
 * 20260730_authoring_subsystem_schema.sql files create. This list is the
 * readiness half of the contract whose provisioning half is
 * scripts/db/authoring-subsystem.mjs (AUTHORING_SUBSYSTEM_TABLES) — keep the two
 * in sync. A PARTIAL subsystem (e.g. the loop tables without their audit and
 * signature companions) always fails readiness: it stands up freeze/e-sign with
 * no Part 11 evidence, which is worse than tables plainly absent. A wholly
 * ABSENT subsystem also fails readiness by default (authoring routes would throw
 * against it), unless AUTHORING_SUBSYSTEM_OPTIONAL=true is set to acknowledge a
 * deployment that intentionally does not offer authoring.
 *
 * Only the tenant_id-carrying tables appear here, mirroring the provisioning
 * list: the workflow tables without a local tenant_id (doc_change_requests /
 * doc_checklist(+items) / doc_exports) are created by the same unit but isolated
 * by a parent-scoped policy, and are intentionally not part of this tenant-keyed
 * readiness set (see AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES in the provisioning
 * half).
 */
const AUTHORING_SUBSYSTEM_TABLES = [
  'authoring_documents',
  'authoring_sections',
  'doc_revisions',
  'authoring_comments',
  'authoring_citations',
  'frozen_documents',
  'user_pins',
  'authoring_audit_trail',
  'authoring_signatures',
  'authoring_workflow_steps',
  // Section-level permission grants (C2C-AUTHOR-002). canEditSection consults it
  // for the per-user AUTHOR/REVIEWER matrix, and a permission store that cannot
  // be read denies every write — so its absence takes authoring down rather than
  // opening it. Readiness must surface that instead of letting the first section
  // edit discover it.
  'doc_permissions',
  // C-30: the eight tenant-scoped workflow tables from
  // 20260730_authoring_subsystem_schema.sql. Every authoring workflow endpoint
  // (reviews, audit, AI suggestions, compliance scoring, feedback, comment
  // activity, exports, template sections) queries one of these; before C-30 the
  // file was on no durable applier, so a deploy shipped the router onto a schema
  // missing them and every such endpoint 500'd. Readiness must gate on them.
  'authoring_comment_activity',
  'authoring_reviews',
  'authoring_audit_events',
  'authoring_ai_suggestions',
  'authoring_compliance_scores',
  'authoring_suggestion_feedback',
  'authoring_exports',
  'template_sections',
];

/**
 * Tenant-consistent parentage (P0 #4): the four composite (parent_id, tenant_id)
 * → (id, tenant_id) foreign keys the loop-tables migration installs on the
 * working-content child links. Tables can exist WITHOUT these constraints — a DB
 * provisioned before the migration landed, or a retrofit whose ADD CONSTRAINT
 * rolled back — and such a DB is NOT ready for a Part 11 authoring workload: RLS
 * filters each row by its own tenant but only these FKs stop a child from
 * structurally pointing at another tenant's parent. Their absence while the
 * tables are present fails readiness closed. Keep in sync with the DO-block in
 * db/migrations/20260725_authoring_document_loop_tables.sql.
 */
const AUTHORING_SUBSYSTEM_FK_CONSTRAINTS = [
  'authoring_sections_doc_tenant_fkey',
  'doc_revisions_section_tenant_fkey',
  'authoring_comments_section_tenant_fkey',
  'authoring_citations_section_tenant_fkey',
  // C2C-AUTHOR-002 object permissions: composite tenant-parentage FKs on
  // doc_permissions guaranteed by 20260727_authoring_object_permissions.sql.
  // Keep in sync with AUTHORING_SUBSYSTEM_FK_CONSTRAINTS in
  // scripts/db/authoring-subsystem.mjs.
  'doc_permissions_doc_tenant_fkey',
  'doc_permissions_section_doc_tenant_fkey',
];

export type SubsystemState = 'present' | 'partial' | 'absent';

export interface SubsystemStatus {
  name: string;
  expected: string[];
  present: string[];
  missing: string[];
  state: SubsystemState;
  /** True when this state must fail /readyz (partial always; absent unless opted out). */
  readinessFailing: boolean;
}

/**
 * Judge a regulated subsystem as a unit. Pure (no I/O) so the readiness rule is
 * testable without a database.
 *
 * - present  → all expected tables exist. Never fails readiness.
 * - partial  → some but not all exist. ALWAYS fails readiness: a half-built
 *              regulated surface (e.g. freeze/e-sign with no audit or signature
 *              storage) is worse than one plainly absent. `optional` cannot
 *              rescue a partial subsystem — that is the whole point.
 * - absent   → none exist. Fails readiness by default (routes would throw);
 *              `optional: true` downgrades ONLY this case to a non-failing state.
 */
export function evaluateSubsystem(
  name: string,
  expected: string[],
  existing: ReadonlySet<string>,
  opts: { optional?: boolean } = {},
): SubsystemStatus {
  const present = expected.filter(t => existing.has(t));
  const missing = expected.filter(t => !existing.has(t));
  const state: SubsystemState =
    missing.length === 0 ? 'present' : present.length === 0 ? 'absent' : 'partial';
  const readinessFailing = state === 'partial' || (state === 'absent' && !opts.optional);
  return { name, expected, present, missing, state, readinessFailing };
}

export interface EnsureTablesResult {
  success: boolean;
  existingSchemas: string[];
  existingTables: string[];
  missingSchemas: string[];
  missingCritical: string[];
  missingImportant: string[];
  missingOptional: string[];
  missingExtensions: string[];
  subsystems: SubsystemStatus[];
  warnings: string[];
  errors: string[];
  duration: number;
}

/**
 * Check which tables exist in the database.
 */

/**
 * Is the operator explicitly opting out of DB TLS certificate verification?
 *
 * Exported so there is exactly ONE definition of "insecure TLS is allowed" and
 * a test can pin it. The opt-out must be set deliberately: it is never inferred
 * from NODE_ENV, which is how server/scripts/run-sql.js ended up disabling
 * verification *specifically in production* and verifying everywhere else.
 */
export function allowUnverifiedDbTls(): boolean {
  return process.env.DB_SSL_ALLOW_UNVERIFIED === '1';
}

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
    subsystems: [],
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
      // TLS certificate verification is ON. This was `{ rejectUnauthorized:
      // false }` for Neon, which accepts ANY certificate — including an
      // attacker's — on the connection that provisions the schema. Neon serves
      // a publicly-trusted chain, so verification costs nothing here; turning
      // it off bought no compatibility and removed the only thing making the
      // connection's identity meaningful.
      //
      // DB_SSL_ALLOW_UNVERIFIED=1 is the documented, explicit escape hatch for
      // an operator whose chain genuinely is not trusted (a self-signed proxy,
      // say). It has to be set deliberately — the insecure mode is never the
      // default, and never selected by inferring it from the environment.
      ssl: isNeonDb ? { rejectUnauthorized: !allowUnverifiedDbTls() } : false,
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
      // Every column recordCerv2SectionVersion writes, because it is the only
      // writer of this table and a boot-created table narrower than the writer
      // 500s on every section edit. This fallback carried ten columns while the
      // writer inserted seventeen; the transaction rolls the content write back
      // with it, so the failure is safe rather than silent, but the surface is
      // dead in any environment where this DDL — not drizzle push — created the
      // table. Keep it in step with shared/schema.ts cerv2SectionVersions.
      cerv2_section_versions: `CREATE TABLE IF NOT EXISTS cerv2_section_versions (
        id SERIAL PRIMARY KEY,
        section_id INTEGER NOT NULL,
        organization_id INTEGER NOT NULL,
        version_number INTEGER NOT NULL DEFAULT 1,
        version_label TEXT,
        change_type TEXT NOT NULL DEFAULT 'edit',
        change_summary TEXT,
        content TEXT,
        field_data JSONB,
        status TEXT,
        completion_percentage INTEGER,
        fields_changed TEXT[],
        previous_values JSONB,
        new_values JSONB,
        changed_by INTEGER,
        changed_by_name TEXT,
        changed_by_email TEXT,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // cerv2_document_sessions autocreate removed (reachability audit,
      // 2026-08-11): no shipped server code queries the table, and shared/schema.ts
      // already provisions it via drizzle push — a boot-time CREATE for a table
      // nothing reads was dead work. Restore alongside the readiness entry if a
      // document-session feature is wired to a live route.
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

    // Regulated subsystems — judged as a unit (present / partial / absent).
    const authoring = evaluateSubsystem('authoring', AUTHORING_SUBSYSTEM_TABLES, existingTables, {
      optional: process.env.AUTHORING_SUBSYSTEM_OPTIONAL === 'true',
    });
    result.subsystems.push(authoring);
    if (authoring.state === 'absent' && !authoring.readinessFailing) {
      result.warnings.push(
        'Authoring subsystem absent, but AUTHORING_SUBSYSTEM_OPTIONAL=true — readiness not failed. Authoring routes will error until it is provisioned (npm run db:apply-c2c).',
      );
    }

    // Tenant-consistent parentage (P0 #4): tables present but their composite-FK
    // integrity constraints absent means the subsystem was provisioned before
    // that migration landed, or a retrofit's ADD CONSTRAINT rolled back — either
    // way it is NOT ready for a Part 11 authoring workload. Verify the four FKs
    // and, if any is missing while the tables exist, downgrade to partial (fails
    // /readyz closed). Fail closed if the check itself errors — never claim ready
    // on unverifiable integrity.
    if (authoring.state === 'present') {
      try {
        const cons = await pool.query(
          `SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`,
          [AUTHORING_SUBSYSTEM_FK_CONSTRAINTS],
        );
        const have = new Set(cons.rows.map(r => r.conname));
        const missingFks = AUTHORING_SUBSYSTEM_FK_CONSTRAINTS.filter(c => !have.has(c));
        if (missingFks.length > 0) {
          authoring.state = 'partial';
          authoring.missing = missingFks;
          authoring.readinessFailing = true;
        }
      } catch (err: any) {
        authoring.state = 'partial';
        authoring.missing = ['<integrity-constraint-check-failed>'];
        authoring.readinessFailing = true;
        result.warnings.push(
          `Could not verify authoring tenant-parentage constraints: ${err?.message ?? String(err)}`,
        );
      }
    }

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

    for (const sub of result.subsystems) {
      if (sub.state === 'present') continue;
      const line = `[ensureCoreTables] ${sub.readinessFailing ? '❌' : '⚠️'} ${sub.name} subsystem ${sub.state} — missing: ${sub.missing.join(', ')}`;
      if (sub.readinessFailing) console.error(line);
      else console.warn(line);
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

  for (const sub of result.subsystems) {
    const glyph = sub.state === 'present' ? '✅' : sub.readinessFailing ? '❌' : '⚠️';
    lines.push(`Subsystem "${sub.name}": ${glyph} ${sub.state} (${sub.present.length}/${sub.expected.length} tables)`);
    if (sub.missing.length > 0) {
      lines.push(...sub.missing.map(t => `  ${sub.readinessFailing ? '❌' : '⚠️'} ${t}`));
    }
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
