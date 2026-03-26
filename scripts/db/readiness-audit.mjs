import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const migrationsDir = path.join(repoRoot, 'db', 'migrations');
const manifestPath = path.join(migrationsDir, 'migrations_manifest.json');

function pass(name, details) {
  return { name, status: 'PASS', details };
}

function fail(name, details, fix) {
  return { name, status: 'FAIL', details, fix };
}

function warn(name, details, fix) {
  return { name, status: 'WARN', details, fix };
}

function getMigrationInventory() {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

function loadManifest() {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return 'invalid_json';
  }
}

async function runDatabaseChecks(client) {
  const checks = [];

  const extensionRows = (
    await client.query(`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('pgcrypto', 'vector', 'uuid-ossp')
      ORDER BY extname
    `)
  ).rows;
  const installedExtensions = new Set(extensionRows.map(row => row.extname));

  if (!installedExtensions.has('pgcrypto')) {
    checks.push(
      fail(
        'required_extension_pgcrypto',
        'pgcrypto extension is not installed.',
        'Install extension: CREATE EXTENSION IF NOT EXISTS pgcrypto;'
      )
    );
  } else {
    checks.push(pass('required_extension_pgcrypto', 'pgcrypto extension is installed.'));
  }

  if (!installedExtensions.has('vector')) {
    checks.push(
      warn(
        'optional_extension_vector',
        'pgvector extension is not installed.',
        'Install if embedding/vector search is enabled: CREATE EXTENSION IF NOT EXISTS vector;'
      )
    );
  } else {
    checks.push(pass('optional_extension_vector', 'pgvector extension is installed.'));
  }

  const migrationTableRows = (
    await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('drizzle_migrations', 'schema_migrations')
    `)
  ).rows;

  if (migrationTableRows.length === 0) {
    checks.push(
      fail(
        'migration_bookkeeping',
        'No migration bookkeeping table found (drizzle_migrations/schema_migrations).',
        'Create a migration table and enforce migration-only schema changes in deploy pipeline.'
      )
    );
  } else {
    checks.push(
      pass(
        'migration_bookkeeping',
        `Migration tracking tables found: ${migrationTableRows.map(row => row.table_name).join(', ')}.`
      )
    );
  }

  const fkWithoutIndex = (
    await client.query(`
      WITH fk_columns AS (
        SELECT
          con.conname,
          ns.nspname AS schema_name,
          rel.relname AS table_name,
          ARRAY_AGG(att.attname ORDER BY u.attposition) AS fk_cols
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, attposition) ON true
        JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = u.attnum
        WHERE con.contype = 'f'
          AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
        GROUP BY con.conname, ns.nspname, rel.relname
      )
      SELECT fk.schema_name, fk.table_name, fk.conname, fk.fk_cols
      FROM fk_columns fk
      WHERE NOT EXISTS (
        SELECT 1
        FROM pg_index idx
        JOIN pg_class rel ON rel.oid = idx.indrelid
        JOIN pg_namespace ns ON ns.oid = rel.relnamespace
        JOIN LATERAL (
          SELECT ARRAY_AGG(att.attname ORDER BY ord.ordinality) AS idx_cols
          FROM unnest(idx.indkey) WITH ORDINALITY AS ord(attnum, ordinality)
          JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ord.attnum
        ) ic ON true
        WHERE ns.nspname = fk.schema_name
          AND rel.relname = fk.table_name
          AND idx.indisvalid
          AND idx.indisready
          AND ic.idx_cols[1:cardinality(fk.fk_cols)] = fk.fk_cols
      )
      ORDER BY fk.schema_name, fk.table_name, fk.conname
      LIMIT 25
    `)
  ).rows;

  if (fkWithoutIndex.length > 0) {
    checks.push(
      warn(
        'foreign_keys_without_indexes',
        `${fkWithoutIndex.length} FK constraint(s) are missing supporting indexes (showing up to 25).`,
        `Add indexes for FK columns, starting with: ${fkWithoutIndex
          .slice(0, 5)
          .map(row => `${row.schema_name}.${row.table_name}(${row.fk_cols.join(',')})`)
          .join('; ')}.`
      )
    );
  } else {
    checks.push(pass('foreign_keys_without_indexes', 'All foreign keys are index-backed.'));
  }

  const tablesWithOrgIdNoRls = (
    await client.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND EXISTS (
          SELECT 1
          FROM pg_attribute a
          WHERE a.attrelid = c.oid
            AND a.attname IN ('organization_id', 'org_id', 'tenant_id')
            AND a.attnum > 0
            AND NOT a.attisdropped
        )
        AND c.relrowsecurity = false
      ORDER BY n.nspname, c.relname
      LIMIT 25
    `)
  ).rows;

  if (tablesWithOrgIdNoRls.length > 0) {
    checks.push(
      warn(
        'tenant_tables_without_rls',
        `${tablesWithOrgIdNoRls.length} tenant-keyed table(s) have RLS disabled (showing up to 25).`,
        `Enable and validate RLS policies for: ${tablesWithOrgIdNoRls
          .slice(0, 5)
          .map(row => `${row.schema_name}.${row.table_name}`)
          .join(', ')}.`
      )
    );
  } else {
    checks.push(pass('tenant_tables_without_rls', 'RLS is enabled for tenant-keyed tables.'));
  }

  const tablesWithoutPrimaryKey = (
    await client.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_constraint pk
        ON pk.conrelid = c.oid
       AND pk.contype = 'p'
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pk.oid IS NULL
      ORDER BY n.nspname, c.relname
      LIMIT 25
    `)
  ).rows;

  if (tablesWithoutPrimaryKey.length > 0) {
    checks.push(
      warn(
        'tables_without_primary_key',
        `${tablesWithoutPrimaryKey.length} table(s) are missing primary keys (showing up to 25).`,
        `Add stable primary keys to: ${tablesWithoutPrimaryKey
          .slice(0, 5)
          .map(row => `${row.schema_name}.${row.table_name}`)
          .join(', ')}.`
      )
    );
  } else {
    checks.push(pass('tables_without_primary_key', 'All scanned tables have primary keys.'));
  }

  const nullableTenantKeys = (
    await client.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND a.attname IN ('organization_id', 'org_id', 'tenant_id')
        AND a.attnotnull = false
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY n.nspname, c.relname, a.attname
      LIMIT 25
    `)
  ).rows;

  if (nullableTenantKeys.length > 0) {
    checks.push(
      warn(
        'nullable_tenant_keys',
        `${nullableTenantKeys.length} tenant key column(s) are nullable (showing up to 25).`,
        `Backfill and enforce NOT NULL where required. Examples: ${nullableTenantKeys
          .slice(0, 5)
          .map(row => `${row.schema_name}.${row.table_name}.${row.column_name}`)
          .join(', ')}.`
      )
    );
  } else {
    checks.push(pass('nullable_tenant_keys', 'Tenant key columns are NOT NULL across scanned tables.'));
  }

  return checks;
}

function runStaticChecks() {
  const checks = [];
  const migrations = getMigrationInventory();
  const manifest = loadManifest();

  if (migrations.length === 0) {
    checks.push(
      fail(
        'migration_files_present',
        'No SQL migrations were found under db/migrations.',
        'Add ordered, idempotent SQL migration files and block ad-hoc production DDL.'
      )
    );
    return checks;
  }

  const latest = migrations[migrations.length - 1];
  checks.push(
    pass(
      'migration_files_present',
      `Found ${migrations.length} SQL migration files. Latest migration in tree: ${latest}.`
    )
  );

  if (!manifest) {
    checks.push(
      warn(
        'migration_manifest_present',
        'migrations_manifest.json was not found.',
        'Add a canonical migration manifest for deterministic deployment ordering.'
      )
    );
  } else if (manifest === 'invalid_json') {
    checks.push(
      fail(
        'migration_manifest_present',
        'migrations_manifest.json is not valid JSON.',
        'Fix JSON syntax and rerun readiness audit.'
      )
    );
  } else {
    checks.push(pass('migration_manifest_present', 'migrations_manifest.json is present and parseable.'));

    const executionOrder = Array.isArray(manifest.executionOrder) ? manifest.executionOrder : [];
    const skipFiles = new Set(Array.isArray(manifest.skipFiles) ? manifest.skipFiles : []);
    const sqlFiles = migrations.filter(file => file.endsWith('.sql'));
    const uncovered = sqlFiles.filter(file => !executionOrder.includes(file) && !skipFiles.has(file));

    if (executionOrder.length === 0) {
      checks.push(
        warn(
          'migration_manifest_execution_order',
          'Manifest has no executionOrder list.',
          'Populate executionOrder to ensure deterministic and auditable deploy ordering.'
        )
      );
    } else if (uncovered.length > 0) {
      checks.push(
        warn(
          'migration_manifest_execution_order',
          `${uncovered.length} SQL migration file(s) are not covered by manifest executionOrder/skipFiles.`,
          `Update manifest coverage. Examples: ${uncovered.slice(0, 5).join(', ')}.`
        )
      );
    } else {
      checks.push(
        pass('migration_manifest_execution_order', 'Manifest execution order covers all SQL migrations.')
      );
    }

    const manifestTotal = Number(manifest.totalMigrations);
    if (!Number.isNaN(manifestTotal) && manifestTotal !== sqlFiles.length) {
      checks.push(
        warn(
          'migration_manifest_total_mismatch',
          `Manifest totalMigrations=${manifestTotal} but repository currently has ${sqlFiles.length} SQL migrations.`,
          'Update totalMigrations metadata during release grooming.'
        )
      );
    } else {
      checks.push(pass('migration_manifest_total_mismatch', 'Manifest totalMigrations matches SQL file count.'));
    }
  }

  const nonStandardNames = migrations.filter(file => !/^\d{3,8}[a-zA-Z0-9-]*_.+\.sql$/.test(file));
  if (nonStandardNames.length > 0) {
    checks.push(
      warn(
        'migration_naming_convention',
        `${nonStandardNames.length} migration file(s) do not follow the standard <numeric_prefix>_<name>.sql pattern.`,
        `Rename non-standard files or enforce deterministic ordering in migration runner. Examples: ${nonStandardNames
          .slice(0, 5)
          .join(', ')}.`
      )
    );
  } else {
    checks.push(
      pass('migration_naming_convention', 'All migrations follow the expected naming convention.')
    );
  }

  const duplicatePrefixes = new Map();
  for (const file of migrations) {
    const prefix = file.split('_')[0];
    duplicatePrefixes.set(prefix, (duplicatePrefixes.get(prefix) || 0) + 1);
  }

  const collisions = [...duplicatePrefixes.entries()].filter(([, count]) => count > 1);
  if (collisions.length > 0) {
    checks.push(
      warn(
        'migration_prefix_collisions',
        `Found ${collisions.length} duplicate migration prefix(es).`,
        `Normalize migration naming/versioning strategy to avoid ambiguous ordering: ${collisions
          .slice(0, 5)
          .map(([prefix, count]) => `${prefix}x${count}`)
          .join(', ')}.`
      )
    );
  } else {
    checks.push(pass('migration_prefix_collisions', 'No migration prefix collisions detected.'));
  }

  const styleFamilies = new Set(
    migrations.map(file => {
      const prefix = file.split('_')[0];
      if (/^\d{8}$/.test(prefix)) return 'date_prefix';
      if (/^\d{3}$/.test(prefix)) return 'sequence_prefix';
      return 'other';
    })
  );
  if (styleFamilies.size > 1) {
    checks.push(
      warn(
        'migration_prefix_style_mixed',
        `Detected mixed migration prefix styles: ${[...styleFamilies].join(', ')}.`,
        'Use one canonical ordering strategy (or explicit manifest) in deployment pipeline.'
      )
    );
  } else {
    checks.push(pass('migration_prefix_style_mixed', 'Single migration prefix style detected.'));
  }

  return checks;
}

function summarize(checks) {
  const scoreMap = { PASS: 1, WARN: 0.5, FAIL: 0 };
  const score = checks.reduce((sum, check) => sum + (scoreMap[check.status] ?? 0), 0);
  const maxScore = checks.length;
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return { score, maxScore, percent };
}

function parseArgs(argv) {
  const strictWarn = argv.includes('--strict-warn');
  const jsonOutArg = argv.find(arg => arg.startsWith('--json-out='));
  const jsonOutPath = jsonOutArg ? jsonOutArg.split('=').slice(1).join('=').trim() : null;
  return { strictWarn, jsonOutPath };
}

async function main() {
  const { strictWarn, jsonOutPath } = parseArgs(process.argv.slice(2));
  const checks = [];
  checks.push(...runStaticChecks());

  const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_NEON_NEW_SECRET;
  if (!databaseUrl) {
    checks.push(
      warn(
        'live_database_checks',
        'DATABASE_URL is not set; live readiness checks were skipped.',
        'Provide DATABASE_URL and rerun: npm run db:readiness'
      )
    );
  } else {
    const ssl = databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined;
    const client = new Client({ connectionString: databaseUrl, ssl });

    try {
      await client.connect();
      checks.push(pass('db_connectivity', 'Connected to PostgreSQL instance successfully.'));
      checks.push(...(await runDatabaseChecks(client)));
    } catch (error) {
      checks.push(
        fail(
          'db_connectivity',
          `Database connection failed: ${error.message}`,
          'Validate credentials/network and rerun readiness audit.'
        )
      );
    } finally {
      await client.end().catch(() => {});
    }
  }

  const summary = summarize(checks);
  console.log('\n=== Database Production Readiness Audit ===');
  for (const check of checks) {
    const symbol = check.status === 'PASS' ? '✅' : check.status === 'WARN' ? '⚠️' : '❌';
    console.log(`${symbol} [${check.status}] ${check.name}: ${check.details}`);
    if (check.fix) {
      console.log(`   ↳ Fix: ${check.fix}`);
    }
  }

  console.log(`\nReadiness score: ${summary.percent}% (${summary.score}/${summary.maxScore})`);

  if (jsonOutPath) {
    const payload = {
      generatedAt: new Date().toISOString(),
      summary,
      strictWarn,
      checks,
    };
    fs.writeFileSync(path.resolve(process.cwd(), jsonOutPath), `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`JSON report written to: ${jsonOutPath}`);
  }

  const hardFailures = checks.filter(check => check.status === 'FAIL').length;
  const warnings = checks.filter(check => check.status === 'WARN').length;
  if (hardFailures > 0) {
    process.exit(2);
  }
  if (strictWarn && warnings > 0) {
    process.exit(3);
  }
  process.exit(0);
}

main().catch(error => {
  console.error('Unhandled readiness audit error:', error);
  process.exit(1);
});
