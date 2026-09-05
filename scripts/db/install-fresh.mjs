#!/usr/bin/env node
/**
 * install-fresh.mjs — Canonical from-scratch DB provisioning (app schema + RLS).
 *
 * The problem this solves: there was no single, verified command that turns an
 * empty Postgres into a correct Concept2Cure app schema. `drizzle-kit push`
 * alone fails on a bare DB ("schema vault does not exist") and, once the
 * prereqs exist, still creates ZERO row-level-security policies (push cannot
 * emit policies). Replaying the 162-file migrations/ tree is not idempotent and
 * fails. This script is the one supported path for the application schema.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Create the named schemas + extensions the Drizzle schema references.
 *   2. `drizzle-kit push` to lay down every table from the schema entrypoints
 *      declared in drizzle.config.ts.
 *   3. Overlay the raw migrations/ tree ON TOP of push (multi-pass, tolerant of
 *      objects push already made) to create the core product tables that live
 *      ONLY in raw migrations and are NOT in shared/schema.ts — regulatory_programs,
 *      c2c_documents/sections/rule_packs, c2c_ana_*, submission-ops, … Without
 *      this the real routes read absent tables and the UI shows "Sample data".
 *   4. Provision the authoring subsystem (the four db/migrations/20260725_authoring_*
 *      files) as one atomic unit. These back the flagship IND authoring loop and
 *      had NO durable provisioning path — see scripts/db/authoring-subsystem.mjs.
 *   5. Apply the RLS-bearing raw migrations in their required order, tracking
 *      applied files in an _install_applied_migrations ledger.
 *   6. Apply the governed-content tree (*_gcc_*.sql) via psql — the `audit`
 *      schema and Part-11 tamper-proof audit tables — then re-run the canonical
 *      tenant-isolation sweep, because that tree creates tenant-keyed tables
 *      AFTER 0021 swept in step 5 and they would otherwise carry no policy.
 *   7. Provision the non-superuser runtime role (opt-in, APP_SERVICE_DB_PASSWORD).
 *   8. Verify: table count, pg_policies count, the core route tables and the
 *      authoring subsystem, the required-object contract (columns, primary keys,
 *      foreign keys, indexes and RLS posture per capability, each reported with
 *      the step that created it), and full tenant-isolation coverage via
 *      scripts/db/rls-coverage-check.sql.
 *
 * The authoring subsystem in step 4 is the ONE db/migrations/ exception run
 * here. It is included precisely because it is NOT part of the *_gcc_* tree
 * below: its tables carry integer tenant_id (the app tenant model) and it adds
 * no RLS of its own, so it composes cleanly with the RLS rollout — unlike the
 * uuid-keyed governed-content tree.
 *
 * Step 6 applies the governed-content tree db/migrations/*_gcc_*.sql (named
 * `audit` schema, Part-11 tables, its own RLS). These files are psql-authored
 * — meta-commands and dollar-quoting that node-postgres cannot execute — so the
 * step shells out to psql, exactly as CI does. They are applied AFTER the RLS
 * rollout and never merged into it: their uuid tenant columns are incompatible
 * with the app RLS policy.
 *
 * This step used to not exist. The script printed the psql loop as advice and
 * then declared success, so an operator who followed the green checkmark ended
 * up with no `audit` schema and no tamper-proof Part 11 audit trail. The app
 * BOOTS without it (audit degrades non-fatally), which is why that went
 * unnoticed. If psql is unavailable the step now says so, records the shortfall,
 * and the install does not report success.
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs
 *   DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs --allow-incomplete
 *
 * Exit code is 0 only when every step completed. A partial install exits 1 and
 * names what is missing, unless --allow-incomplete is passed.
 *
 * After this completes, set RLS_ENFORCE=on and restart to turn the tenant
 * isolation policies from shadow-mode into enforcing.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import {
  applyAuthoringSubsystem,
  AUTHORING_SUBSYSTEM_TABLES,
} from './authoring-subsystem.mjs';
import { resolveDatabaseUrl, sslFor, INSTALL_URL_VARS } from './connection.mjs';
import { provisionAppServiceRole, resolveAppServiceRole } from './provision-app-role.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

// RLS lives only in these raw migrations — drizzle-kit push cannot emit
// policies, so they must be applied explicitly after the tables exist. Order
// matters: 0005 seeds CSR-knowledge RLS; the 0019→0020→0021 trio is the tenant
// RLS rollout (audit → coerce tenant column types → enable RLS everywhere);
// the dated files add AI-placement and research-admin policies.
const RLS_MIGRATIONS = [
  '0005_csr_knowledge_database.sql',
  '0019_tenant_column_audit.sql',
  '0020_coerce_text_tenant_columns.sql',
  '0021_enable_rls_everywhere.sql',
  '20260608_ai_placement_policies.sql',
  '20260612_rls_research_admin.sql',
];

const CHECK_SCHEMA_ENTRYPOINTS = process.argv.includes('--check-schema-entrypoints');
// The config-only guard must be runnable before credentials or a database
// exist. node-postgres connects lazily, so a syntactically valid inert URL lets
// the shared pool be constructed without opening a socket in this mode.
const url = CHECK_SCHEMA_ENTRYPOINTS
  ? 'postgresql://schema-check:unused@127.0.0.1:1/schema-check'
  : resolveDatabaseUrl(INSTALL_URL_VARS);
const pool = new Pool({ connectionString: url, ssl: sslFor(url) });

/**
 * `--allow-incomplete` — finish and exit 0 even when part of the install did
 * not land.
 *
 * The default is now the opposite. This script used to print
 * "✅ Application schema install complete." unconditionally: with raw
 * migrations left unapplied (described, without evidence, as "safe to skip"),
 * and with the entire governed-content tree un-run, because the script only
 * PRINTED the psql loop for an operator to run by hand. An operator who
 * followed the green checkmark got a database with no `audit` schema and no
 * Part 11 tamper-proof audit trail, and nothing told them.
 *
 * An installer that reports success it did not achieve is worse than one that
 * fails, because the failure surfaces later, in production, as a missing table.
 */
const ALLOW_INCOMPLETE = process.argv.includes('--allow-incomplete');

/** Non-fatal shortfalls, collected across steps and adjudicated at the end. */
const incomplete = [];
function recordIncomplete(area, detail) {
  incomplete.push({ area, detail });
}

/**
 * pgvector posture — decided in step 1, consulted by every later step.
 *
 * `vector` is a SEPARATE OS package (postgresql-N-pgvector) that a fresh
 * machine frequently does not have. Until now step 1 issued
 * `CREATE EXTENSION vector` inside the same multi-statement query as the
 * schemas, so its absence threw out of step 1/8 and the whole install died
 * with `Install failed: extension "vector" is not available` — creating ZERO
 * tables, EVEN under `--allow-incomplete`. `scripts/setup-local-db.sh` then ran
 * deploy-migrate against an empty database, which correctly refused ("this
 * database has not been provisioned"), and the operator was left with a
 * 0-table database and a dev server that can serve nothing. That is the state
 * in which the Wave 0 design review could not visually verify a single surface.
 *
 * The extension is now attempted on its own. If it is missing the install
 * CONTINUES and every object whose definition needs the `vector` type is
 * skipped BY NAME and reported — it is not silently faked. There is no stub
 * type: `vector(1536)` needs a typmod-bearing base type, which cannot be
 * created without the C extension, so pretending is not even available as a
 * shortcut. Anything vector-backed (similarity search, embeddings) is
 * genuinely unavailable in such a database, the final report says exactly
 * that, and `report()` never prints the success banner for it.
 */
let pgvectorAvailable = true;

/** Objects not created because pgvector is absent — named in the final report. */
const vectorSkipped = [];
function recordVectorSkip(what) {
  vectorSkipped.push(what);
}

/** True when `err` is the shape a missing pgvector produces (and it IS missing). */
function isVectorTypeMissing(err) {
  if (pgvectorAvailable) return false;
  const msg = String(err?.message ?? err ?? '');
  return /type "?vector"? does not exist|extension "vector" is not available|access method "?(ivfflat|hnsw)"? does not exist|operator class "?vector_/i.test(
    msg,
  );
}

/** SQL that cannot execute without pgvector. */
const NEEDS_VECTOR = /vector\s*\(\s*\d+\s*\)|\b(ivfflat|hnsw)\b|vector_(cosine|l2|ip)_ops/i;

/** Best-effort human label for a DDL statement, for the skip report. */
function describeStatement(sql) {
  const table = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w.]+)"?/i);
  if (table) return `table ${table[1]}`;
  const index = sql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([\w.]+)"?/i);
  if (index) return `index ${index[1]}`;
  const alter = sql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?"?([\w.]+)"?/i);
  if (alter) return `alter on ${alter[1]}`;
  return sql.replace(/\s+/g, ' ').slice(0, 80);
}

/**
 * Table a statement creates or targets, used to trace cascading skips.
 * Handles both `"table"` and `"schema"."table"` — the schema-qualified form
 * must yield the TABLE, not the schema, or every vault/precedent object would
 * poison the skip set under the key "vault".
 */
function targetTable(sql) {
  const qualified = '(?:"?[\\w]+"?\\.)?"?([\\w]+)"?';
  const m =
    sql.match(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${qualified}`, 'i')) ||
    sql.match(new RegExp(`ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${qualified}`, 'i')) ||
    sql.match(new RegExp(`\\bON\\s+${qualified}`, 'i'));
  return m ? m[1] : null;
}

/**
 * ── Schema provenance ─────────────────────────────────────────────────────────
 *
 * The installer has THREE creators, and until now it never said which one
 * produced any given table:
 *
 *   1. `drizzle-kit push` from the entrypoint in drizzle.config.ts,
 *   2. the raw `migrations/` overlay,
 *   3. the authoring subsystem and the governed-content (*_gcc_*) tree.
 *
 * "It reported 786 tables" is not an answer to "where did stability_studies
 * come from" — and that question is exactly what an operator debugging a
 * missing capability needs answered. So a snapshot of the public base tables is
 * taken after each creator runs, and every required object is reported with the
 * step that actually created it.
 *
 * This is also the evidence for the entrypoint decision itself. drizzle.config.ts
 * points at shared/schema.ts, NOT the shared/schema/index.ts barrel. The barrel
 * reaches 175 more tables, but 172 of them are already created by the raw
 * overlay — pushing them too would give those tables a SECOND creator with a
 * possibly different shape, which is the parallel-implementation failure this
 * repo forbids, and introspecting an already-provisioned database to do it takes
 * minutes. The remaining 3 (module_documents, document_audit_logs,
 * document_attachments) are provisioned by their own raw migration
 * (migrations/20260729b_unified_workflow_companion_tables.sql), on the same
 * terms as 20260729_unified_documents_provision.sql. So shared/schema.ts stays
 * canonical, no table has two creators, and this report proves it per table.
 */
const schemaSources = [];
function recordSchemaSource(label, tables) {
  schemaSources.push({ label, tables });
}

/** The public base tables present right now. */
async function snapshotPublicTables() {
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  return new Set(rows.map((r) => r.table_name));
}

/** The step that first created `table`, or null when nothing created it. */
function sourceOf(table) {
  let previous = new Set();
  for (const { label, tables } of schemaSources) {
    if (tables.has(table) && !previous.has(table)) return label;
    previous = tables;
  }
  return null;
}

/**
 * The drizzle entrypoint actually in effect, read from drizzle.config.ts.
 *
 * Reported, never guessed: if the config cannot be read or the `schema` field
 * cannot be found, that is said plainly rather than printing a plausible
 * default. An installer that names the wrong schema source is worse than one
 * that admits it does not know, because the wrong name sends the next operator
 * to the wrong file.
 */
function resolveDrizzleEntrypoints() {
  const configPath = path.resolve(__dirname, '..', '..', 'drizzle.config.ts');
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    return { paths: [], detail: `drizzle.config.ts unreadable: ${err.message}` };
  }

  // drizzle-kit accepts either a string or an array. The installer used to
  // recognise only the string form, so changing the real config to an array of
  // three entrypoints made a successful install report itself incomplete. Keep
  // this deliberately literal (no config execution before a database exists),
  // but parse both documented forms and verify every path on disk.
  const field = text.match(/\bschema\s*:\s*(\[[\s\S]*?\]|['"][^'"]+['"])/);
  const paths = field
    ? [...field[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    : [];
  if (paths.length === 0) {
    return { paths: [], detail: 'drizzle.config.ts has no literal `schema:` entrypoint' };
  }
  const missing = paths.filter((entry) => !fs.existsSync(path.resolve(path.dirname(configPath), entry)));
  return {
    paths,
    detail:
      missing.length === 0
        ? null
        : `declared entrypoint(s) do not exist on disk: ${missing.join(', ')}`,
  };
}

/**
 * ── Required-object contract ──────────────────────────────────────────────────
 *
 * Verification used to be a table COUNT plus a presence list. A count cannot
 * tell the difference between a table that exists and a table that exists with
 * the wrong columns, no primary key, no foreign keys, and no RLS policy — and
 * every one of those ships a capability that is broken in a different way:
 *
 *   • missing column      → the route 500s on its first SELECT;
 *   • missing FK          → orphan rows accumulate and DELETE cascades silently
 *                           do not cascade;
 *   • missing index       → the declared query pattern seq-scans the table;
 *   • missing RLS policy  → a tenant-keyed table stays fully readable across
 *                           tenants even under RLS_ENFORCE=on, because there is
 *                           no predicate to filter it;
 *   • policy on the WRONG   → the opposite failure, and just as broken: the
 *     tenant column            predicate compares a column no writer stamps, so
 *                              every tenant-scoped read returns zero rows and
 *                              every write is refused.
 *
 * So each entry names a CAPABILITY and the objects that capability actually
 * needs. Anything missing is a shortfall by name, and the success banner is
 * withheld. `tenantColumn: null` means the table is deliberately global (a
 * registry with no tenant scope) and is expected to carry no RLS policy —
 * stated, not inferred from its absence.
 */
const REQUIRED_OBJECT_CONTRACT = [
  {
    table: 'stability_studies',
    capability: 'CMC stability program (study registry, shelf-life evidence)',
    columns: ['id', 'organization_id', 'study_title', 'product_name', 'study_type', 'status'],
    foreignKeys: [
      { column: 'organization_id', references: 'organizations' },
      { column: 'study_director', references: 'users' },
    ],
    indexedColumns: ['organization_id'],
    tenantColumn: 'organization_id',
  },
  {
    table: 'project_intelligence_profiles',
    capability: 'ANA project intelligence (per-project profile + readiness scoring)',
    columns: [
      'id',
      'project_id',
      'organization_id',
      'regulatory_strategy',
      'target_regulatory_bodies',
      'project_type',
      'therapeutic_area',
    ],
    foreignKeys: [
      { column: 'organization_id', references: 'organizations' },
      { column: 'project_id', references: 'projects' },
    ],
    indexedColumns: ['organization_id', 'project_id'],
    tenantColumn: 'organization_id',
  },
  {
    table: 'immutable_report_records',
    capability: 'Report OS sealed records (Part 11 immutable report spine)',
    columns: [
      'id',
      'organization_id',
      'report_uuid',
      'report_code',
      'seal_status',
      'content_hash',
      'previous_hash',
    ],
    foreignKeys: [
      { column: 'organization_id', references: 'organizations' },
      { column: 'project_id', references: 'projects' },
      { column: 'sealed_by_id', references: 'users' },
    ],
    indexedColumns: ['organization_id'],
    tenantColumn: 'organization_id',
  },
  {
    table: 'evidence_claims',
    capability: 'Evidence fabric (extracted, versioned, verifiable claims)',
    columns: [
      'id',
      'organization_id',
      'claim_text',
      'claim_type',
      'is_current',
      'version',
      'confidence',
    ],
    foreignKeys: [],
    indexedColumns: ['organization_id'],
    tenantColumn: 'organization_id',
  },
  {
    table: 'conversation_working_memory',
    capability: 'Conversation working memory (rolling summary + embeddings)',
    columns: [
      'id',
      'conversation_id',
      'organization_id',
      'project_id',
      'summary',
      'message_count_at_generation',
    ],
    foreignKeys: [
      { column: 'organization_id', references: 'organizations' },
      { column: 'project_id', references: 'projects' },
      { column: 'conversation_id', references: 'concept2cure_conversations' },
    ],
    indexedColumns: ['organization_id', 'conversation_id'],
    tenantColumn: 'organization_id',
  },
  {
    table: 'ana_capability_registry',
    capability: 'ANA capability governance (intended use, risk tier, oversight)',
    columns: [
      'id',
      'capability_key',
      'category',
      'slash_command',
      'intended_use',
      'risk_tier',
      'human_oversight',
      'gxp_applicable',
    ],
    foreignKeys: [],
    indexedColumns: ['category'],
    // Deliberately global: the capability catalogue is platform-wide, identical
    // for every tenant, and carries no tenant column — so it is expected to have
    // no RLS policy. Said here so its absence is a decision, not an oversight.
    tenantColumn: null,
  },
  {
    table: 'report_type_registry',
    capability: 'Report OS type registry (scopes, dependencies, governance rules)',
    columns: [
      'id',
      'type_id',
      'label',
      'family',
      'allowed_scopes',
      'governance_requirements',
      'truthfulness_rules',
      'enabled',
    ],
    foreignKeys: [],
    indexedColumns: ['family'],
    // Global for the same reason as ana_capability_registry.
    tenantColumn: null,
  },
  {
    table: 'doc_permissions',
    capability: 'Authoring object-level authorization (who may edit which section)',
    // The columns decideAuthoringPermission actually reads
    // (server/services/authoring/authoring-permissions.ts): the grant's scope,
    // the identity it names, and its lifecycle. This entry exists because the
    // table-presence check could not tell the difference between the table the
    // 20260725 loop-tables migration creates — id, doc_id, section_id, email,
    // role, tenant_id, created_at — and the one 20260727 brings it up to. On
    // the narrower shape the decision query throws 42703 and the gate fails
    // CLOSED, so every authoring object action is refused and the readiness
    // banner still reads green. Three test suites and one golden journey were
    // caught by exactly that gap.
    columns: [
      'id',
      'doc_id',
      'section_id',
      'tenant_id',
      'principal_id',
      'email',
      'role',
      'granted_by',
      'grant_reason',
      'valid_from',
      'valid_until',
      'revoked_at',
    ],
    // Tenant-consistent parentage: a grant cannot name a document (or section)
    // belonging to another tenant, because the FK is composite on (id, tenant).
    foreignKeys: [
      { column: 'doc_id', references: 'authoring_documents' },
      { column: 'section_id', references: 'authoring_sections' },
    ],
    indexedColumns: ['tenant_id', 'doc_id'],
    tenantColumn: 'tenant_id',
  },
];

/**
 * Verify REQUIRED_OBJECT_CONTRACT against the live catalog.
 *
 * Returns { lines, shortfalls } — `lines` is what to print (one per capability,
 * naming the step that created it), `shortfalls` is every missing object.
 */
async function verifyRequiredObjects() {
  const names = REQUIRED_OBJECT_CONTRACT.map((c) => c.table);

  const present = new Set(
    (
      await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            AND table_name = ANY($1::text[])`,
        [names],
      )
    ).rows.map((r) => r.table_name),
  );

  const columns = new Map();
  for (const row of (
    await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
      [names],
    )
  ).rows) {
    if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
    columns.get(row.table_name).add(row.column_name);
  }

  // Primary keys and foreign keys, read from pg_constraint so a constraint that
  // exists under any name is recognised (names are generated and vary by
  // creator; the SHAPE is what the contract is about).
  const primaryKeys = new Set(
    (
      await pool.query(
        `SELECT c.relname FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND con.contype = 'p' AND c.relname = ANY($1::text[])`,
        [names],
      )
    ).rows.map((r) => r.relname),
  );

  const foreignKeys = new Set(
    (
      await pool.query(
        `SELECT c.relname AS tbl, att.attname AS col, ref.relname AS target
           FROM pg_constraint con
           JOIN pg_class c ON c.oid = con.conrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_class ref ON ref.oid = con.confrelid
           JOIN unnest(con.conkey) AS k(attnum) ON true
           JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum = k.attnum
          WHERE n.nspname = 'public' AND con.contype = 'f' AND c.relname = ANY($1::text[])`,
        [names],
      )
    ).rows.map((r) => `${r.tbl}.${r.col}->${r.target}`),
  );

  // An index "covers" a column when that column is the index's LEADING column —
  // the only position Postgres can use for a lookup on that column alone.
  const leadingIndexColumns = new Set(
    (
      await pool.query(
        `SELECT c.relname AS tbl, att.attname AS col
           FROM pg_index idx
           JOIN pg_class c ON c.oid = idx.indrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           JOIN pg_attribute att ON att.attrelid = c.oid AND att.attnum = idx.indkey[0]
          WHERE n.nspname = 'public' AND idx.indisvalid AND c.relname = ANY($1::text[])`,
        [names],
      )
    ).rows.map((r) => `${r.tbl}.${r.col}`),
  );

  // RLS posture, including WHICH COLUMN the policy actually keys on.
  //
  // "a policy exists" is not the property. 0021 used to attach the policy to the
  // alphabetically-last tenant column, so six tables ended up policied on a
  // NULLABLE adapter `tenant_id` that no writer stamps — `NULL = <tenant>` is
  // NULL, so every read returned zero rows and every INSERT was refused, while
  // the policy count and the coverage gate both reported green. The deparsed
  // policy renders the predicate as `(<column> = (NULLIF(…))::integer)`, so the
  // declared tenant column must appear in that form.
  const rls = new Map(
    (
      await pool.query(
        `SELECT c.relname,
                c.relrowsecurity AS enabled,
                (SELECT count(*)::int FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
                (SELECT string_agg(COALESCE(p.qual, ''), ' ') FROM pg_policies p
                  WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS quals
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
        [names],
      )
    ).rows.map((r) => [r.relname, r]),
  );

  const lines = [];
  const shortfalls = [];

  for (const contract of REQUIRED_OBJECT_CONTRACT) {
    const { table } = contract;
    if (!present.has(table)) {
      shortfalls.push(`${table} is ABSENT — capability unavailable: ${contract.capability}`);
      lines.push(`    ✗ ${table} — ABSENT (${contract.capability})`);
      continue;
    }

    const missing = [];
    const cols = columns.get(table) ?? new Set();
    const missingColumns = contract.columns.filter((c) => !cols.has(c));
    if (missingColumns.length) missing.push(`column(s) ${missingColumns.join(', ')}`);

    if (!primaryKeys.has(table)) missing.push('primary key');

    const missingFks = contract.foreignKeys.filter(
      (fk) => !foreignKeys.has(`${table}.${fk.column}->${fk.references}`),
    );
    if (missingFks.length) {
      missing.push(
        `foreign key(s) ${missingFks.map((fk) => `${fk.column}→${fk.references}`).join(', ')}`,
      );
    }

    const missingIndexes = (contract.indexedColumns ?? []).filter(
      (c) => cols.has(c) && !leadingIndexColumns.has(`${table}.${c}`),
    );
    if (missingIndexes.length) missing.push(`index on ${missingIndexes.join(', ')}`);

    const posture = rls.get(table);
    if (contract.tenantColumn) {
      if (!cols.has(contract.tenantColumn)) {
        missing.push(`tenant column ${contract.tenantColumn}`);
      } else if (!posture?.enabled) {
        missing.push('row-level security not enabled');
      } else if (!(posture.policies > 0)) {
        missing.push('no RLS policy');
      } else if (!String(posture.quals ?? '').includes(`(${contract.tenantColumn} = `)) {
        missing.push(
          `RLS policy does not key on ${contract.tenantColumn} (it is attached to a different ` +
            'column, so every tenant-scoped read returns zero rows and every write is refused)',
        );
      }
    }

    const from = sourceOf(table) ?? 'unknown step';
    if (missing.length) {
      shortfalls.push(`${table} incomplete — missing ${missing.join('; ')} (${contract.capability})`);
      lines.push(`    ✗ ${table} — missing ${missing.join('; ')}`);
    } else {
      const scope = contract.tenantColumn
        ? `RLS on ${contract.tenantColumn}`
        : 'global (no tenant scope, no policy expected)';
      lines.push(`    ✓ ${table} — from ${from} · ${scope}`);
    }
  }

  return { lines, shortfalls };
}

async function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  await fn();
}

/**
 * Every table name drizzle-kit will create from `shared/schema.ts`.
 *
 * Scoped exactly the way drizzle scopes it: use every entrypoint named in
 * `drizzle.config.ts`, plus whatever each entrypoint recursively re-exports
 * (`export * from './schema/…'`) — and nothing else under `shared/`. Modules
 * outside that reachable graph are not push inputs. Counting them here would
 * make this gate fail an install that is in fact complete, which is worse than
 * the silence it replaces.
 *
 * Read from source text rather than by importing: this runs against a database
 * that may not exist yet, and importing pulls in the whole Drizzle graph. The
 * declaration form is uniform — `pgTable('name', …)` — so a regex over the
 * reachable files is sufficient and cannot be broken by the module failing to
 * load. Views are excluded (`pgView`/`pgMaterializedView`): push does not
 * create them.
 */
function declaredTableNames(entrypoints) {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const files = [];
  const queued = entrypoints.map((entry) => path.resolve(repoRoot, entry));
  const seen = new Set();

  // Follow literal re-exports from every configured entrypoint. A queue keeps
  // this correct if an entrypoint gains a second level of barrel files later;
  // `seen` prevents cycles from turning installer verification into a hang.
  while (queued.length > 0) {
    const file = queued.shift();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = path.resolve(path.dirname(file), `${m[1]}${suffix}`);
        if (fs.existsSync(candidate)) {
          queued.push(candidate);
          break;
        }
      }
    }
  }

  const names = new Set();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bpgTable\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}



async function main() {
  await step('1/8 Prerequisites — schemas + extensions', async () => {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS vault;
      CREATE SCHEMA IF NOT EXISTS precedent;
      CREATE SCHEMA IF NOT EXISTS audit;
      -- Required by the readiness contract (ensureCoreTables requiredSchemas).
      -- Absent from this step, it was first created at STARTUP by the runtime
      -- role — which cannot (permission denied) — so on a single-pass fresh
      -- install app_service never got USAGE on it and /readyz reported
      -- "schemas missing: extensions" forever. The production-boot-smoke job
      -- caught it. Installers own schema; startup only validates.
      CREATE SCHEMA IF NOT EXISTS extensions;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);
    console.log('  ✓ schemas (vault, precedent, audit, extensions) + extensions (pgcrypto, uuid-ossp, pg_trgm)');

    // pgvector on its own: it is the one extension here that ships as a
    // separate OS package, so it is the one that is routinely absent. Grouping
    // it with the others meant its absence aborted the entire install (see the
    // `pgvectorAvailable` note above).
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('  ✓ pgvector (extension "vector") present');
    } catch (err) {
      pgvectorAvailable = false;
      console.log(`  ⚠ pgvector NOT available: ${(err.message || '').split('\n')[0]}`);
      console.log('    Install it and re-run (this script is idempotent) to get the skipped objects:');
      console.log('      apt-get install -y postgresql-16-pgvector    # Debian/Ubuntu');
      console.log('    Continuing WITHOUT it. Every object whose definition needs the `vector`');
      console.log('    type is SKIPPED and named below — nothing is faked, and no stub type is');
      console.log('    created. Embedding storage and similarity search backed by those objects');
      console.log('    are UNAVAILABLE in this database.');
      recordIncomplete(
        'pgvector extension',
        `extension "vector" is not available on this server; vector-dependent objects were skipped ` +
          `(embedding / similarity-search features unavailable)`,
      );
    }
  });

  await step('2/8 Tables — drizzle-kit push', async () => {
    // Baseline BEFORE any creator runs: on a truly empty database this is
    // empty, and on a re-run it is everything a previous run left behind. Both
    // are needed for the provenance report to be honest — on a re-run nothing
    // is "created by" this run, and saying so beats attributing every table to
    // whichever step happened to run first.
    recordSchemaSource('pre-existing (before this run)', await snapshotPublicTables());

    const entrypoint = resolveDrizzleEntrypoints();
    if (entrypoint.paths.length > 0) {
      console.log(
        `  • schema source: drizzle-kit push from ${entrypoint.paths.join(', ')} (drizzle.config.ts)`,
      );
    }
    if (entrypoint.detail) {
      console.log(`  ⚠ ${entrypoint.detail}`);
      recordIncomplete('drizzle schema entrypoint', entrypoint.detail);
    }

    if (pgvectorAvailable) {
      // `echo ""` answers drizzle-kit's interactive prompt; a fresh DB has no
      // destructive changes so it proceeds. Inherit env so drizzle.config.ts
      // resolves the same DATABASE_URL.
      const res = spawnSync('npx', ['drizzle-kit', 'push'], {
        cwd: path.resolve(__dirname, '..', '..'),
        input: '\n',
        encoding: 'utf8',
        env: process.env,
      });
      if (res.status !== 0) {
        console.error(res.stdout || '');
        console.error(res.stderr || '');
        throw new Error(`drizzle-kit push failed (exit ${res.status})`);
      }
      /* ── The exit code is not evidence ────────────────────────────────────
         The degraded branch below already records why: drizzle-kit push applies
         its statements in ONE sequential loop, stops at the first error, and
         EXITS 0 while doing so. That hazard is not specific to pgvector — any
         failing statement (an introspection error, a type it cannot round-trip,
         a policy-bound column) ends the loop the same way — so a status check
         here proves nothing at all.

         Observed: on a database with pgvector present, push aborted partway
         with a validation error, exited 0, and this step printed
         "✓ schema pushed from the configured entrypoints". `project_memory_entries`,
         `coauthor_documents` and `conversation_working_memory` were never
         created; step 8's checks (a table COUNT, five named route tables, the
         authoring subsystem) all passed, and the install reported success. The
         first sign was /api/haq-manager/rounds and /api/coauthor/documents
         returning 500 in the running product.

         So the push is verified against the thing it claims to have done:
         every table the configured schema graph declares must now exist. That cannot be
         satisfied by an exit code. */
      const declared = declaredTableNames(entrypoint.paths);
      const { rows: existing } = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );
      const have = new Set(existing.map((r) => r.table_name));
      const missing = declared.filter((t) => !have.has(t));
      if (missing.length > 0) {
        console.error(res.stdout || '');
        console.error(res.stderr || '');
        throw new Error(
          `drizzle-kit push exited 0 but did NOT create ${missing.length} of ` +
            `${declared.length} table(s) declared by the configured schema entrypoints. push stops at ` +
            `the first failing statement and still exits 0, so its exit code cannot be ` +
            `trusted. Missing: ${missing.slice(0, 25).join(', ')}` +
            `${missing.length > 25 ? `, …and ${missing.length - 25} more` : ''}`,
        );
      }
      console.log(
        `  ✓ schema pushed from ${entrypoint.paths.join(', ')} ` +
          `(${declared.length} declared tables verified present)`,
      );
      return;
    }

    // ── Degraded push: pgvector absent ──────────────────────────────────────
    // eleven tables in shared/schema.ts carry a `vector(N)` column. drizzle-kit
    // push applies its statements in one sequential loop and STOPS at the first
    // error (it also exits 0 while doing so — see drizzle-kit pgPush), so on a
    // server without pgvector it dies on the first such table and creates zero
    // of the ~950 others. Nothing about the remaining tables needs the
    // extension.
    //
    // So: ask push for the statements WITHOUT executing them (`--verbose
    // --strict` prints the exact statement list, then the Select prompt is
    // answered "No, abort"), and run them here — skipping the vector-dependent
    // ones by name and everything that transitively depends on them. This is
    // the same DDL push would have run, minus the objects the server cannot
    // represent.
    console.log('  • pgvector absent — applying push statements individually so the');
    console.log('    non-vector schema still lands (push itself stops at the first error).');
    const res = spawnSync('npx', ['drizzle-kit', 'push', '--verbose', '--strict'], {
      cwd: path.resolve(__dirname, '..', '..'),
      input: '\n', // selects "No, abort" — we execute the statements ourselves
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      maxBuffer: 64 * 1024 * 1024,
    });
    const out = `${res.stdout || ''}\n${res.stderr || ''}`.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
    if (/No changes detected/.test(out) && !/about to execute current statements/.test(out)) {
      console.log('  • push reports no changes — schema already present');
      return;
    }
    const marker = out.indexOf('You are about to execute current statements:');
    if (marker < 0) {
      // drizzle-kit did not hand back a statement list (it can end during
      // introspection on an already-large database). Do NOT decide here what
      // that means for the install — step 8 counts the tables and says. This
      // is recorded, not thrown, so an idempotent re-run over an already
      // provisioned database is not turned into a total failure by a step that
      // had nothing left to do.
      console.log('  ⚠ drizzle-kit did not return a statement list; last output:');
      console.log(
        out
          .trim()
          .split('\n')
          .slice(-5)
          .map((l) => `      ${l}`)
          .join('\n'),
      );
      console.log('    No tables were pushed in this step. Verification (8/8) decides the verdict.');
      recordIncomplete(
        'drizzle push (pgvector absent)',
        'could not obtain the push statement list from drizzle-kit; no tables were pushed in this step ' +
          '(see the table count in 8/8 for what the database actually contains)',
      );
      return;
    }
    const lines = out.slice(marker).split('\n').slice(1);
    const stop = lines.findIndex((l) => /^\s*(❯|Yes, I want to|No, abort|Found data-loss statements:)/.test(l));
    const body = lines.slice(0, stop < 0 ? lines.length : stop).join('\n');
    const statements = body
      .split(/;\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!statements.length) {
      throw new Error('push statement list parsed as empty — cannot provision tables without pgvector');
    }

    const isDuplicate = (err) =>
      ['42710', '42P07', '42P06', '42P16', '42723', '42711', '42P05'].includes(err.code) ||
      /already exists/i.test(err.message || '');

    const skippedTables = new Set();
    let applied = 0;
    let present = 0;
    const hardFailures = [];
    for (const stmt of statements) {
      if (NEEDS_VECTOR.test(stmt)) {
        const t = targetTable(stmt);
        if (t) skippedTables.add(t.toLowerCase());
        recordVectorSkip(`${describeStatement(stmt)} (needs the vector type)`);
        continue;
      }
      // An object hanging off — or pointing at — a table we skipped cannot
      // exist either. Foreign keys name their target in REFERENCES.
      const deps = [targetTable(stmt), ...[...stmt.matchAll(/REFERENCES\s+"?([\w]+)"?/gi)].map((m) => m[1])];
      const blockedBy = deps.find((d) => d && skippedTables.has(d.toLowerCase()));
      if (blockedBy) {
        recordVectorSkip(`${describeStatement(stmt)} (depends on skipped table ${blockedBy})`);
        continue;
      }
      try {
        await pool.query(stmt);
        applied++;
      } catch (err) {
        // `relation "public.foo" does not exist` — compare on the bare name.
        const named = (err.message || '').match(/relation "([\w.]+)" does not exist/i);
        const namedTable = named ? named[1].split('.').pop().toLowerCase() : null;
        if (isDuplicate(err)) {
          present++;
        } else if (isVectorTypeMissing(err) || (namedTable && skippedTables.has(namedTable))) {
          recordVectorSkip(`${describeStatement(stmt)} (${(err.message || '').split('\n')[0]})`);
        } else {
          hardFailures.push(`${describeStatement(stmt)} — ${(err.message || '').split('\n')[0]}`);
        }
      }
    }
    console.log(
      `  ✓ push applied statement-by-statement: ${applied} applied, ${present} already present, ` +
        `${vectorSkipped.length} skipped for pgvector, ${hardFailures.length} failed`,
    );
    if (hardFailures.length) {
      for (const f of hardFailures.slice(0, 20)) console.log(`  ⚠ ${f}`);
      if (hardFailures.length > 20) console.log(`  ⚠ …and ${hardFailures.length - 20} more`);
      recordIncomplete(
        'drizzle push (statement-by-statement)',
        `${hardFailures.length} statement(s) failed for reasons unrelated to pgvector: ` +
          hardFailures.slice(0, 5).join(' | '),
      );
    }
  });

  const pushedEntrypoints = resolveDrizzleEntrypoints().paths;
  recordSchemaSource(
    `drizzle-kit push (${pushedEntrypoints.join(', ') || 'drizzle.config.ts'})`,
    await snapshotPublicTables(),
  );

  await step('3/8 Complete schema — raw migration overlay', async () => {
    // drizzle-kit push lays down only the configured Drizzle schema graph. The core product tables
    // — regulatory_programs, c2c_documents / c2c_document_sections /
    // c2c_rule_packs, c2c_ana_*, the submission-ops set, and ~200 more — live
    // ONLY in the raw migrations/ tree, which drizzle's journaled migrate() does
    // NOT replay (one journaled baseline vs 160 files). Without them every real
    // route reads an absent table and the UI falls back to fixtures ("Sample
    // data"). Overlay the raw tree ON TOP of push: multi-pass so
    // forward-dependencies resolve across passes, and tolerant of objects push
    // already created (on top of push those bare CREATEs simply report "already
    // exists" — which also sidesteps the stale 0000 snapshot's cmax/system-column
    // bug, since push created that table cleanly). RLS migrations are applied
    // separately in their required order (next step), so exclude them here.
    //
    // ── Pre-overlay creators (blank-DB provisioning audit 2026-07-30) ───────
    // Some root-tree files ALTER or FK-reference tables whose ONLY creator
    // lives in db/migrations/ — a tree this overlay never walks, applied on
    // real deploys by deploy-migrate AFTER install-fresh finishes. On a fresh
    // install those files therefore deferred forever and the run reported
    // incomplete:
    //   0016/0017 ALTER cmc_source_objects  → created by the CMC convergence OS
    //   0011      ALTERs ai_threads         → created by the AI trace chain
    //   0006      FKs to cmc_projects(id)   → code-derived reconstruction
    // Apply those creators FIRST (each idempotent), the same documented
    // exception pattern as the authoring subsystem in step 4.
    const PRE_OVERLAY_CREATORS = [
      'db/migrations/20260401_cmc_convergence_os.sql',
      'db/migrations/20260224_ai_trace_chain.sql',
      'db/migrations/20260730_cmc_projects_reconstruction.sql',
      'db/migrations/20260730_manufacturing_processes_reconstruction.sql',
      'db/migrations/20260730_fk_delete_policies_port.sql',
    ];
    for (const rel of PRE_OVERLAY_CREATORS) {
      const full = path.resolve(__dirname, '..', '..', rel);
      const sql = fs.readFileSync(full, 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('COMMIT');
        console.log(`  ✓ pre-overlay creator: ${rel}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        if (isVectorTypeMissing(err)) {
          recordVectorSkip(`pre-overlay creator ${rel} (${(err.message || '').split('\n')[0]})`);
          console.log(`  ⚠ pre-overlay creator ${rel} skipped — needs pgvector`);
          continue;
        }
        if (ALLOW_INCOMPLETE) {
          // Same contract as everywhere else under this flag: record it, keep
          // going, and let 8/8 count what actually exists. Throwing here ended
          // the run before ANY report was printed, which is the opposite of
          // what an operator who asked for a partial install needs to see.
          console.log(`  ⚠ pre-overlay creator ${rel}: ${(err.message || '').split('\n')[0]}`);
          recordIncomplete('pre-overlay creators', `${rel} failed: ${(err.message || '').split('\n')[0]}`);
          continue;
        }
        throw new Error(`pre-overlay creator ${rel} failed: ${err.message}`);
      }
    }

    // ── Classified skips (explicit, per-file, auditable) ────────────────────
    // A file listed here is EXPECTED to fail with the recorded error class on
    // a fresh install, for the documented reason. It is reported as
    // skipped-classified rather than flipping the exit code — anything NOT in
    // this map still fails the install loudly. This is per-file
    // classification, not blanket tolerance (see the --allow-incomplete
    // rationale above): each entry names its tracked resolution.
    const CLASSIFIED_OVERLAY_SKIPS = new Map([
      ['0008_critical_fk_delete_policies.sql',
        'superseded by db/migrations/20260730_fk_delete_policies_port.sql (guarded port applied pre-overlay); the original aborts on retired user_sessions'],
      // 0004_workflow_performance_indexes.sql and 0007_tenant_isolation_fixes.sql
      // were classified-skipped here for the ledger C-29 collision. They were
      // not actually blocked by that collision: 0004 needed document_audit_logs
      // and 0007 needed module_documents, and those two tables (plus
      // document_attachments) simply had NO creator on any provisioning path —
      // defined only in shared/schema/unified_workflow.ts, which the pushed
      // entrypoint does not re-export. migrations/20260729b_unified_workflow_companion_tables.sql
      // provisions all three with the canonical Drizzle shape, on the same terms
      // as 20260729_unified_documents_provision.sql did for their siblings, so
      // both files now apply for real and are no longer expected skips.
      // 001_create_ivdr_tables.sql was classified-skipped here ("needs a
      // rename decision") because its rival shape-1 CREATE of
      // ivdr_classifications collided with the push shape. The D11d IVDR
      // consolidation (2026-08-13) made that decision: the rival definition is
      // deleted, shape-2 names are canonical, and the file now applies cleanly
      // — so it is no longer classified as an expected skip.
      ['20260609_design_risk.sql',
        'risk_items/risk_management_files shapes collide with shared/schema.ts — ledger C-29; both consumers live, needs a rename decision'],
    ]);

    const rlsSet = new Set(RLS_MIGRATIONS);
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !rlsSet.has(f))
      .sort();

    const isDuplicate = (err) =>
      ['42710', '42P07', '42P06', '42P16', '42723', '42711', '42P05'].includes(err.code) ||
      /already exists|multiple primary keys/i.test(err.message || '');
    const isMissingDep = (err) =>
      ['42P01', '42703', '42704', '42883', '42P17'].includes(err.code) ||
      /does not exist|no existing constraint/i.test(err.message || '');

    const done = new Set();
    const lastErr = new Map();
    /**
     * Files that failed for a reason that will NOT resolve on a later pass.
     *
     * These were counted (`hard=N` in the per-pass line), printed, and then
     * dropped on the floor: nothing recorded them, so a migration that errored
     * outright did not stop the installer printing "✅ Application schema
     * install complete." That is the exact failure this script exists to
     * prevent, one level down. A re-run made it concrete —
     * 0007_tenant_isolation_fixes.sql aborts on an already-policied
     * unified_documents, and the run still exited 0.
     *
     * A hard failure is now a shortfall unless it is classified below.
     */
    const hardFailures = new Map();
    let applied = 0;
    let present = 0;

    for (let pass = 1; pass <= 8; pass++) {
      let progressed = false;
      let passApplied = 0;
      let passPresent = 0;
      let deferred = 0;
      let hard = 0;
      let vectorFiles = 0;
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
        // CREATE INDEX CONCURRENTLY cannot run inside a transaction block, so
        // those files run in autocommit; every other file is atomic per file.
        const concurrent = /concurrently/i.test(sql);
        try {
          if (concurrent) {
            await pool.query(sql);
          } else {
            await pool.query('BEGIN');
            await pool.query(sql);
            await pool.query('COMMIT');
          }
          done.add(file);
          passApplied++;
          applied++;
          progressed = true;
        } catch (err) {
          if (!concurrent) await pool.query('ROLLBACK').catch(() => {});
          if (isDuplicate(err)) {
            done.add(file);
            passPresent++;
            present++;
            progressed = true;
          } else if (isVectorTypeMissing(err)) {
            // Not a defect in the file: this server has no pgvector, so the
            // file's vector-typed objects cannot be created. Named in the
            // final report rather than counted as a hard failure.
            done.add(file);
            vectorFiles++;
            progressed = true;
            recordVectorSkip(`migrations/${file} (${(err.message || '').split('\n')[0]})`);
          } else if (isMissingDep(err)) {
            deferred++; // retry on a later pass once its dependency is created
            lastErr.set(file, (err.message || '').split('\n')[0]);
          } else {
            done.add(file); // a hard failure won't self-resolve — record + move on
            hard++;
            progressed = true;
            const why = (err.message || '').split('\n')[0];
            hardFailures.set(file, why);
            console.log(`  ⚠ ${file}: ${why}`);
          }
        }
      }
      console.log(
        `  pass ${pass}: applied=${passApplied} already-present=${passPresent} deferred=${deferred} hard=${hard}` +
          (vectorFiles ? ` needs-pgvector=${vectorFiles}` : ''),
      );
      if (!progressed) break;
    }

    // Hard failures that are not a documented, classified skip are shortfalls.
    const unclassifiedHard = [...hardFailures].filter(([f]) => !CLASSIFIED_OVERLAY_SKIPS.has(f));
    if (unclassifiedHard.length) {
      console.log(
        `  ⚠ ${unclassifiedHard.length} file(s) failed outright (not a classified skip). ` +
          'Each ran and errored — this is not a deferred dependency:',
      );
      for (const [f, why] of unclassifiedHard) console.log(`      ${f} — ${why}`);
      recordIncomplete(
        'raw migration overlay',
        `${unclassifiedHard.length} file(s) failed outright: ` +
          unclassifiedHard.map(([f, why]) => `${f} (${why})`).join(' | '),
      );
    }

    const remainingAll = files.filter((f) => !done.has(f));
    // A classified file can leave the loop two ways: still deferred (its
    // dependency never appeared) or hard-failed. Both are the documented
    // outcome, so report either — otherwise a classified file that hard-fails
    // vanishes from the report entirely.
    const classified = [
      ...new Set([...remainingAll, ...hardFailures.keys()].filter((f) => CLASSIFIED_OVERLAY_SKIPS.has(f))),
    ].sort();
    const remaining = remainingAll.filter((f) => !CLASSIFIED_OVERLAY_SKIPS.has(f));
    if (classified.length) {
      console.log(
        `  ◦ ${classified.length} file(s) skipped-classified (expected on a fresh install; ` +
          'each names its tracked resolution — NOT counted as incomplete):',
      );
      for (const f of classified) {
        console.log(`      ${f} — ${CLASSIFIED_OVERLAY_SKIPS.get(f)}`);
        console.log(`        last error: ${lastErr.get(f) || hardFailures.get(f) || '(none recorded)'}`);
      }
    }
    if (remaining.length) {
      // This used to read "safe to skip for the app schema". Nothing here
      // establishes that. The loop knows only that each file kept failing —
      // usually because it references a table absent from this schema, which is
      // often benign and sometimes means a table that should exist does not.
      // Asserting safety on the operator's behalf is the part that was wrong;
      // report the facts and let the exit code reflect the uncertainty.
      console.log(
        `  ⚠ ${remaining.length} file(s) left unapplied. Each failed repeatedly across ` +
          `multiple passes, typically because it references a table absent from this ` +
          `schema. Review each before treating this install as complete:`,
      );
      for (const f of remaining) console.log(`      ${f} — ${lastErr.get(f) || ''}`);
      recordIncomplete(
        'raw migration overlay',
        `${remaining.length} file(s) unapplied: ${remaining.join(', ')}`,
      );
    }
    console.log(`  ✓ overlay: ${applied} applied, ${present} already-present from push`);
  });

  recordSchemaSource('raw migrations/ overlay', await snapshotPublicTables());

  await step('4/8 Authoring subsystem (Part-11 unit)', async () => {
    // The four db/migrations/20260725_authoring_* files back the flagship IND
    // authoring loop and, until now, had NO durable provisioning path — the
    // root overlay above only touches migrations/, and the *_gcc_* psql loop
    // never matched them. They apply here as ONE atomic unit (all four or none)
    // so the loop tables never stand up freeze/e-sign without their audit and
    // signature companions. See scripts/db/authoring-subsystem.mjs.
    await applyAuthoringSubsystem(pool, path.resolve(__dirname, '..', '..'), {
      log: (m) => console.log(m),
    });
  });

  recordSchemaSource('authoring subsystem (db/migrations/20260725_authoring_*)', await snapshotPublicTables());

  await step('5/8 Row-Level Security policies (raw migrations)', async () => {
    // The RLS rollout (0021) hard-fails if ANY tenant column is still text.
    // 0020 coerces a fixed list, but the raw overlay adds tables (e.g.
    // adverse_events) with a text organization_id that predate that list. On a
    // fresh install every table is empty, so coerce ALL residual text
    // organization_id/tenant_id columns to integer up front — safe (no rows to
    // fail the cast) and exactly what the integer-keyed tenant model expects.
    // Per-column exception handling skips any column that legitimately can't be
    // an integer rather than aborting the whole install.
    await pool.query(`
      DO $$
      DECLARE r record;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
            FROM information_schema.columns
           WHERE table_schema = 'public'
             AND column_name IN ('organization_id', 'tenant_id')
             AND data_type IN ('text', 'character varying')
        LOOP
          BEGIN
            EXECUTE format(
              'ALTER TABLE public.%I ALTER COLUMN %I TYPE integer USING NULLIF(%I, '''')::integer',
              r.table_name, r.column_name, r.column_name
            );
          EXCEPTION WHEN others THEN
            RAISE NOTICE 'skip coercion of %.%: %', r.table_name, r.column_name, SQLERRM;
          END;
        END LOOP;
      END $$;
    `);
    console.log('  ✓ coerced residual text tenant columns to integer (fresh-DB safe)');

    // Bookkeeping ledger: these raw migrations use bare CREATE POLICY (no
    // IF NOT EXISTS), so re-running a file would error on an already-present
    // policy. Record what has been applied so the installer is safely
    // re-runnable, and tolerate objects that already exist out-of-band.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._install_applied_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const record = (file) =>
      pool.query(
        'INSERT INTO public._install_applied_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
    const isDuplicate = (err) =>
      err.code === '42710' || // duplicate_object (policy/role)
      err.code === '42P07' || // duplicate_table
      /already exists/i.test(err.message || '');

    for (const file of RLS_MIGRATIONS) {
      const already = await pool.query(
        'SELECT 1 FROM public._install_applied_migrations WHERE filename = $1',
        [file],
      );
      if (already.rowCount > 0) {
        console.log(`  • ${file} — already applied, skipping`);
        continue;
      }
      const full = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(full)) throw new Error(`missing RLS migration: ${file}`);
      const sql = fs.readFileSync(full, 'utf8');
      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('COMMIT');
        await record(file);
        console.log(`  ✓ applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        if (isDuplicate(err)) {
          await record(file);
          console.log(`  • ${file} — objects already present, recorded`);
          continue;
        }
        if (isVectorTypeMissing(err)) {
          // 0005_csr_knowledge_database.sql defines vector-typed CSR knowledge
          // tables together with their RLS. Without pgvector the file cannot
          // apply at all; the OTHER RLS files (the 0019→0020→0021 tenant
          // rollout) do not need it and still apply, so tenant isolation is
          // still established. Not recorded as applied — a later re-run with
          // pgvector installed picks it up.
          console.log(`  ⚠ ${file} — skipped, needs pgvector`);
          recordVectorSkip(`RLS migration ${file} (${(err.message || '').split('\n')[0]})`);
          continue;
        }
        throw new Error(`failed applying ${file}: ${err.message}`);
      }
    }
  });

  await step('6/8 Governed content — Part 11 audit tree (*_gcc_*.sql)', async () => {
    // This step used to not exist. The script PRINTED a psql loop and told the
    // operator to run it themselves, then declared the install complete —
    // so following the instructions on screen produced a database with no
    // `audit` schema and no tamper-proof Part 11 audit trail, while the last
    // line said success. The app boots without it (audit degrades non-fatally),
    // which is exactly why nobody noticed.
    //
    // These files are psql-authored (\set, dollar-quoting, meta-commands) and
    // cannot be run through node-postgres, so psql is genuinely required — that
    // constraint was real. It just is not a reason to make it the operator's
    // problem.
    const gccDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');
    const gccFiles = fs.existsSync(gccDir)
      ? fs.readdirSync(gccDir).filter((f) => f.includes('_gcc_') && f.endsWith('.sql')).sort()
      : [];

    if (!gccFiles.length) {
      console.log('  • no *_gcc_* files found; nothing to apply');
      return;
    }

    const psqlProbe = spawnSync('psql', ['--version'], { encoding: 'utf8' });
    if (psqlProbe.error || psqlProbe.status !== 0) {
      console.log(
        `  ⚠ psql not available — cannot apply ${gccFiles.length} governed-content file(s).`,
      );
      console.log('    The app will boot, but 21 CFR Part 11 tamper-proof audit will be absent.');
      console.log('    Install the postgresql client and re-run, or apply by hand:');
      console.log('      for f in $(ls db/migrations/*_gcc_*.sql | sort); do \\');
      console.log('        psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done');
      recordIncomplete(
        'governed content (Part 11 audit)',
        `psql unavailable; ${gccFiles.length} *_gcc_* file(s) not applied`,
      );
      return;
    }

    let ok = 0;
    const failed = [];
    let vectorBlocked = 0;
    for (const f of gccFiles) {
      const full = path.join(gccDir, f);
      const res = spawnSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-f', full], {
        encoding: 'utf8',
        env: { ...process.env, PAGER: 'cat' },
      });
      if (res.status === 0) {
        ok++;
      } else {
        const stderr = (res.stderr || '').trim();
        const why = (stderr.split('\n').pop() || '').slice(0, 160);
        // A file that only fails because this server has no pgvector is
        // attributed to that, not counted as a governed-content defect.
        if (isVectorTypeMissing({ message: stderr })) {
          vectorBlocked++;
          recordVectorSkip(`governed-content file ${f} (${why})`);
          console.log(`  ⚠ ${f}: skipped, needs pgvector`);
          continue;
        }
        failed.push(`${f} — ${why}`);
        console.log(`  ⚠ ${f}: ${why}`);
      }
    }
    console.log(
      `  ${failed.length || vectorBlocked ? '⚠' : '✓'} governed content: ${ok}/${gccFiles.length} applied` +
        (vectorBlocked ? `, ${vectorBlocked} blocked by missing pgvector` : ''),
    );
    if (vectorBlocked) {
      recordIncomplete(
        'governed content (Part 11 audit)',
        `${vectorBlocked} of ${gccFiles.length} file(s) could not be applied because pgvector is absent`,
      );
    }
    if (failed.length) {
      recordIncomplete(
        'governed content (Part 11 audit)',
        `${failed.length} of ${gccFiles.length} file(s) failed: ${failed.join(' | ')}`,
      );
    }

    // ── Close the sweep over what this tree just created ────────────────────
    // 0021 (step 5) policies every integer tenant-keyed table that exists WHEN
    // IT RUNS. This tree runs after it and adds more — 063_gcc_cognitive_agent_runtime.sql
    // alone creates three public tables with an integer tenant_id and no RLS of
    // its own. They shipped cross-tenant readable on every fresh install, and
    // nothing said so: a policy COUNT goes up when tables like these are added,
    // so counting policies could never catch it.
    //
    // db/migrations/20260801_tenant_isolation_sweep.sql is 0021's loop made
    // re-runnable — same policy shape, same canonical allowlist, guarded so it
    // never overwrites a subsystem's hand-tuned policy. It is the LAST entry in
    // C2C_MIGRATION_FILES for exactly this reason on the deploy path; the
    // install path needs it for the same reason and did not have it. Reusing
    // the file rather than re-implementing the loop keeps one canonical sweep.
    const sweepPath = path.resolve(gccDir, '20260801_tenant_isolation_sweep.sql');
    if (!fs.existsSync(sweepPath)) {
      recordIncomplete(
        'tenant isolation sweep',
        `${path.relative(process.cwd(), sweepPath)} is missing — tables created after 0021 ` +
          'would keep no RLS policy',
      );
      return;
    }
    try {
      await pool.query(fs.readFileSync(sweepPath, 'utf8'));
      console.log('  ✓ tenant-isolation sweep re-run over the tables this tree created');
    } catch (err) {
      const why = (err.message || '').split('\n')[0];
      console.log(`  ⚠ tenant-isolation sweep failed: ${why}`);
      recordIncomplete(
        'tenant isolation sweep',
        `20260801_tenant_isolation_sweep.sql failed: ${why} — tenant-keyed tables created by the ` +
          'governed-content tree may carry no RLS policy',
      );
    }
  });

  recordSchemaSource('governed content (db/migrations/*_gcc_*)', await snapshotPublicTables());

  await step('7/8 Runtime role — non-superuser app_service grants', async () => {
    // The RLS unlock. Everything above ran as the owner/admin (DATABASE_URL),
    // which is a superuser on most managed providers — a connection RLS never
    // filters. Mint a dedicated NOSUPERUSER / NOBYPASSRLS LOGIN role and grant
    // it least-privilege DML so the request-serving pool can connect as it
    // (APP_DATABASE_URL) and have tenant_isolation_policy actually filter rows.
    //
    // This runs LAST among the schema steps so `GRANT ... ON ALL TABLES` reaches
    // every table the prior steps created; ALTER DEFAULT PRIVILEGES (inside the
    // helper) covers tables future migrations add. It is a NO-OP unless
    // APP_SERVICE_DB_PASSWORD is set, so an install that has not opted into the
    // split role behaves exactly as before.
    const result = await provisionAppServiceRole(pool, {
      log: (m) => console.log(m),
    });
    if (result.skipped) {
      console.log(
        `  • ${result.role} not provisioned (APP_SERVICE_DB_PASSWORD unset). Production boot ` +
          'will FAIL CLOSED if it connects as a superuser under RLS_ENFORCE=on — set ' +
          'APP_SERVICE_DB_PASSWORD here and APP_DATABASE_URL for the runtime before going live.',
      );
    }
  });

  await step('8/8 Verify', async () => {
    /**
     * A COMPLETENESS shortfall found by verification.
     *
     * These used to throw unconditionally, which meant `--allow-incomplete`
     * did not actually allow an incomplete install: the run still died here
     * with exit 1 and no final report. The flag's documented contract is
     * "finish and exit 0 even when part of the install did not land", so
     * completeness gaps are now recorded and adjudicated by report() — which
     * still names every one of them and still withholds the success banner.
     *
     * This is for MISSING things only. Unsafe things (the runtime-role posture
     * checks below) still throw regardless of the flag: an install must never
     * hand over a role that would defeat RLS, no matter what was opted into.
     */
    const verifyFail = (area, detail) => {
      if (!ALLOW_INCOMPLETE) throw new Error(detail);
      console.log(`  ⚠ ${detail}`);
      recordIncomplete(area, detail);
    };

    const tables = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    const policies = await pool.query(`SELECT count(*)::int AS n FROM pg_policies`);
    const tableCount = tables.rows[0].n;
    const policyCount = policies.rows[0].n;
    console.log(`  tables (public): ${tableCount}`);
    console.log(`  RLS policies:    ${policyCount}`);
    if (tableCount < 100) {
      verifyFail('schema completeness', `expected the full schema (100s of tables); only ${tableCount} created`);
    }
    if (policyCount < 1) {
      verifyFail('row-level security', 'no RLS policies created — tenant isolation would be absent');
    }

    // Assert the core product tables the shipping routes read actually exist —
    // these come from the raw overlay, not push, and their absence is exactly
    // what makes the app render fixtures instead of live data.
    const CORE_TABLES = [
      'regulatory_programs',
      'c2c_documents',
      'c2c_document_sections',
      'c2c_rule_packs',
      'c2c_project_pinned_evidence',
    ];
    const core = await pool.query(
      `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present
         FROM unnest($1::text[]) AS t`,
      [CORE_TABLES],
    );
    const missingCore = core.rows.filter((r) => !r.present).map((r) => r.name);
    console.log(`  core route tables: ${CORE_TABLES.length - missingCore.length}/${CORE_TABLES.length} present`);
    if (missingCore.length) {
      verifyFail(
        'core product tables',
        `core product tables missing (routes would read absent tables → UI shows sample data): ${missingCore.join(', ')}`,
      );
    }

    // Authoring subsystem — the exact contract /readyz enforces at boot
    // (server/db/ensureCoreTables.ts). Absent OR partial here means the install
    // did not stand the subsystem up as a unit; fail loudly rather than ship a
    // database whose authoring routes throw while readiness would report red.
    const authoring = await pool.query(
      `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present
         FROM unnest($1::text[]) AS t`,
      [AUTHORING_SUBSYSTEM_TABLES],
    );
    const missingAuthoring = authoring.rows.filter((r) => !r.present).map((r) => r.name);
    console.log(
      `  authoring subsystem: ${AUTHORING_SUBSYSTEM_TABLES.length - missingAuthoring.length}/${AUTHORING_SUBSYSTEM_TABLES.length} tables present`,
    );
    if (missingAuthoring.length) {
      verifyFail(
        'authoring subsystem',
        `authoring subsystem incomplete (authoring routes would throw; /readyz would fail closed): missing ${missingAuthoring.join(', ')}`,
      );
    }

    // ── Required-object contract ─────────────────────────────────────────
    // Tables, columns, primary keys, foreign keys, indexes and RLS policies for
    // every capability this installer must land. A table COUNT cannot tell a
    // working capability from a table with the wrong columns and no policy;
    // this can. See REQUIRED_OBJECT_CONTRACT.
    const required = await verifyRequiredObjects();
    console.log(
      `  required objects: ${REQUIRED_OBJECT_CONTRACT.length - required.shortfalls.length}/` +
        `${REQUIRED_OBJECT_CONTRACT.length} capabilities complete`,
    );
    for (const line of required.lines) console.log(line);
    for (const shortfall of required.shortfalls) {
      verifyFail('required objects', `required object contract not met: ${shortfall}`);
    }

    // ── Tenant-isolation coverage ────────────────────────────────────────────
    // The repo's own gate (scripts/db/rls-coverage-check.sql), run here rather
    // than reimplemented: every integer tenant-keyed base table, in EVERY
    // schema, minus the pinned allowlist, must carry a policy. Its allowlist is
    // kept in sync with 0021 and the deploy sweep by
    // scripts/ci/check-rls-allowlist-sync.mjs, so running the file itself is
    // the only way to stay on that single source of truth.
    //
    // A count of 802 policies says nothing about WHICH tables have one. A table
    // that gained a tenant column after 0021 ran — anything the overlay or the
    // governed-content tree adds later — is org-keyed and unprotected, and the
    // count goes UP when that happens. This names them.
    const coverageSqlPath = path.resolve(__dirname, 'rls-coverage-check.sql');
    if (fs.existsSync(coverageSqlPath)) {
      const unprotected = (
        await pool.query(fs.readFileSync(coverageSqlPath, 'utf8'))
      ).rows.map((r) => r.unprotected);
      if (unprotected.length) {
        verifyFail(
          'tenant isolation coverage',
          `${unprotected.length} tenant-keyed table(s) carry no RLS policy — rows are readable ` +
            `across tenants once anything reads them: ${unprotected.slice(0, 15).join(', ')}` +
            (unprotected.length > 15 ? `, …and ${unprotected.length - 15} more` : ''),
        );
      } else {
        console.log('  tenant isolation: every integer tenant-keyed table is policied ✓');
      }
    } else {
      verifyFail(
        'tenant isolation coverage',
        `${path.relative(process.cwd(), coverageSqlPath)} is missing — tenant-isolation coverage ` +
          'could not be checked, so this install is not verified against cross-tenant reads',
      );
    }

    // Runtime role posture — only asserted when the split role was requested
    // (APP_SERVICE_DB_PASSWORD set). Confirms the role exists and is genuinely
    // least-privilege (not a superuser, no BYPASSRLS) and can actually read a
    // core tenant table — so a green install can never hand over a role that
    // would fail the production boot posture check or be locked out of its
    // tables. Mirrors server/db/rlsEnforcement.ts → assertRlsCatalogPosture.
    if (process.env.APP_SERVICE_DB_PASSWORD) {
      const role = resolveAppServiceRole();
      const roleRow = (
        await pool.query(
          'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
          [role],
        )
      ).rows[0];
      if (!roleRow) {
        throw new Error(`runtime role ${role} was requested but does not exist after provisioning`);
      }
      const roleFailures = [];
      if (roleRow.rolsuper) roleFailures.push('is a superuser (RLS would never filter)');
      if (roleRow.rolbypassrls) roleFailures.push('has BYPASSRLS (RLS would never filter)');
      if (!roleRow.rolcanlogin) roleFailures.push('cannot LOGIN (runtime could not connect)');
      const canRead = (
        await pool.query(
          `SELECT has_table_privilege($1, 'public.organizations', 'SELECT') AS ok`,
          [role],
        )
      ).rows[0]?.ok;
      if (!canRead) roleFailures.push('lacks SELECT on public.organizations (grants did not apply)');
      // Every application schema must be reachable: a schema the runtime uses
      // but the role lacks USAGE on surfaces as a `permission denied for schema
      // X` 500 the moment a feature backed by X is hit. Catch ANY such gap here
      // so a "green" install can never hand over a role locked out of a schema.
      const schemaGaps = (
        await pool.query(
          `SELECT nspname FROM pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema')
              AND nspname !~ '^pg_'
              AND NOT has_schema_privilege($1, nspname, 'USAGE')
            ORDER BY nspname`,
          [role],
        )
      ).rows.map(r => r.nspname);
      if (schemaGaps.length) {
        roleFailures.push(`lacks USAGE on schema(s): ${schemaGaps.join(', ')} (grants incomplete)`);
      }
      if (roleFailures.length) {
        throw new Error(`runtime role ${role} posture is unsafe: ${roleFailures.join('; ')}`);
      }
      console.log(
        `  runtime role ${role}: LOGIN · non-superuser · NOBYPASSRLS · USAGE on all application schemas · can read tenant tables ✓`,
      );
    }

    // The success banner is printed by main(), and ONLY when nothing was
    // recorded incomplete. It used to print here, unconditionally.
  });
}

/**
 * Final verdict.
 *
 * Green is earned, not assumed. If any step recorded a shortfall the script
 * says what is missing, what it means, and exits non-zero — unless the operator
 * explicitly asked for a partial install with --allow-incomplete, in which case
 * it still says what is missing and exits 0.
 */
function report() {
  // Say what a missing pgvector cost, in objects, before anything else. The
  // rule this script is built on is that it does not claim readiness it has
  // not checked; the corollary is that it must state what it KNOWS is absent.
  if (!pgvectorAvailable) {
    console.error('\n⚠️  pgvector (extension "vector") is NOT installed on this server.');
    console.error(`   ${vectorSkipped.length} object(s) were skipped because of it:`);
    for (const what of vectorSkipped.slice(0, 40)) console.error(`     • ${what}`);
    if (vectorSkipped.length > 40) {
      console.error(`     …and ${vectorSkipped.length - 40} more`);
    }
    console.error('   Vector-dependent features — embedding storage, semantic/similarity');
    console.error('   search, and anything reading the skipped tables — are UNAVAILABLE in');
    console.error('   this database. The rest of the schema was installed and the app can');
    console.error('   boot and serve from it.');
    console.error('   To get them: install the pgvector package for your PostgreSQL major');
    console.error('   version (e.g. `apt-get install -y postgresql-16-pgvector`) and re-run');
    console.error('   this script — it is idempotent and will fill in what it skipped.');
  }

  if (!incomplete.length) {
    console.log('\n✅ Application schema install complete.');
    console.log('   Next:');
    console.log('   • run `node scripts/db/deploy-migrate.mjs` to apply the out-of-band');
    console.log('     C2C migration set (the db/migrations/ files NO other path applies —');
    console.log('     e.g. the clinical-regulatory evidence spine, section tracking, and');
    console.log('     the governance/resolution tables). This installer does NOT apply');
    console.log('     that set; without it the routes reading those tables fall back to');
    console.log('     sample data. (In the AWS pipeline deploy-migrate runs as its own');
    console.log('     step after this one; a local install must run it by hand.)');
    console.log('   • set RLS_ENFORCE=on and restart to enforce tenant isolation;');
    console.log('   • point the runtime at the non-superuser role: set APP_DATABASE_URL to the');
    console.log('     app_service connection string (set APP_SERVICE_DB_PASSWORD here first so');
    console.log('     the role is provisioned). Migrations keep using DATABASE_URL (the owner).');
    console.log('     Production boot fails closed under RLS_ENFORCE=on if it connects as a superuser.');
    console.log('   • leave SEED_DEMO_USER unset in production (no known-password admin).');
    return 0;
  }

  console.error(`\n⚠️  Install finished with ${incomplete.length} incomplete area(s):`);
  for (const { area, detail } of incomplete) {
    console.error(`   • ${area}: ${detail}`);
  }

  if (ALLOW_INCOMPLETE) {
    console.error('\n   Continuing anyway: --allow-incomplete was passed.');
    console.error('   This database is NOT fully provisioned. Do not treat it as production-ready');
    console.error('   without resolving the areas above.');
    return 0;
  }

  console.error('\n❌ Install INCOMPLETE — not reporting success.');
  console.error('   Resolve the areas above and re-run (the script is idempotent), or pass');
  console.error('   --allow-incomplete to accept a partial install deliberately.');
  return 1;
}

if (CHECK_SCHEMA_ENTRYPOINTS) {
  const entrypoint = resolveDrizzleEntrypoints();
  if (entrypoint.detail) {
    console.error(`[db:check-schema-entrypoints] FAIL — ${entrypoint.detail}`);
    process.exitCode = 1;
  } else {
    const tables = declaredTableNames(entrypoint.paths);
    console.log(
      `[db:check-schema-entrypoints] OK — ${entrypoint.paths.length} entrypoint(s), ` +
        `${tables.length} declared public table(s): ${entrypoint.paths.join(', ')}`,
    );
  }
  await pool.end().catch(() => {});
} else {
  main()
    .then(async () => {
      const code = report();
      await pool.end().catch(() => {});
      process.exit(code);
    })
    .catch(async (err) => {
      console.error(`\n❌ Install failed: ${err.message}`);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
