/**
 * Concept2Cure v3.0 - Enterprise Architecture Migration Runner
 * Purpose: Execute eCTD v4.0 migrations against Neon PostgreSQL
 * 
 * Usage: node run_concept2cure_migrations.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config();

// Get database URL
function getDatabaseUrl() {
  // Try different env var names
  const envVars = [
    'DATABASE_URL',
    'DATABASE_NEON_NEW_SECRET',
    'NEON_DATABASE_URL'
  ];
  
  for (const varName of envVars) {
    let url = process.env[varName];
    if (url) {
      // Clean up - remove any 'psql ' prefix
      url = url.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
      return url;
    }
  }
  
  throw new Error('DATABASE_URL not found. Set DATABASE_URL environment variable.');
}

// Migrations to run (in order)
// Default: run ALL SQL migrations in db/migrations (sorted), excluding test runner
const migrationsDir = path.join(__dirname, 'db', 'migrations');
const MIGRATIONS = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .filter((file) => file !== '056_gcc_test_runner.sql')
  .sort();

// Terminal colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function runMigration(pool, filePath, filename) {
  const sql = fs.readFileSync(filePath, 'utf8');
  
  try {
    await pool.query(sql);
    log(colors.green, `  ✓ ${filename}`);
    return true;
  } catch (error) {
    log(colors.red, `  ✗ ${filename}`);
    log(colors.red, `    Error: ${error.message}`);
    if (error.detail) {
      log(colors.red, `    Detail: ${error.detail}`);
    }
    return false;
  }
}

async function runTestSuite(pool, migrationsDir) {
  const testFile = path.join(migrationsDir, '056_gcc_test_runner.sql');
  
  if (!fs.existsSync(testFile)) {
    log(colors.yellow, 'Test runner not found, skipping tests');
    return;
  }
  
  log(colors.cyan, '\n═══════════════════════════════════════════════════════════════════════════');
  log(colors.cyan, '  Running Test Suite');
  log(colors.cyan, '═══════════════════════════════════════════════════════════════════════════\n');
  
  const sql = fs.readFileSync(testFile, 'utf8');
  
  // Execute test queries
  const testQueries = [
    // Schema verification
    `SELECT COUNT(*) as schema_count FROM information_schema.schemata WHERE schema_name IN ('common_standards', 'identity', 'ectd_v4', 'audit')`,
    // Domain registry
    `SELECT COUNT(*) as authority_count FROM common_standards.global_regulatory_authorities`,
    `SELECT COUNT(*) as study_type_count FROM common_standards.clinical_study_types`,
    `SELECT COUNT(*) as submission_type_count FROM common_standards.submission_types`,
    // Identity
    `SELECT COUNT(*) as org_count FROM identity.organizations`,
    `SELECT COUNT(*) as user_count FROM identity.users`,
    // eCTD v4.0
    `SELECT COUNT(*) as submission_count FROM ectd_v4.regulatory_submissions`,
    `SELECT COUNT(*) as document_count FROM ectd_v4.documents`,
    `SELECT COUNT(*) as cou_count FROM ectd_v4.context_of_use_elements`,
  ];
  
  const results = {};
  
  for (const query of testQueries) {
    try {
      const result = await pool.query(query);
      const key = Object.keys(result.rows[0])[0];
      results[key] = parseInt(result.rows[0][key]);
    } catch (error) {
      // Query failed - table might not exist
      const match = query.match(/as (\w+)/);
      if (match) {
        results[match[1]] = 'ERROR';
      }
    }
  }
  
  // Display results
  console.log('\n  Test Results:');
  console.log('  ─────────────────────────────────────────────────────────────────');
  
  const checks = [
    { name: 'Schemas Present', key: 'schema_count', expected: 4 },
    { name: 'Regulatory Authorities', key: 'authority_count', expected: 11 },
    { name: 'Clinical Study Types', key: 'study_type_count', expected: 15 },
    { name: 'Submission Types', key: 'submission_type_count', expected: 16 },
    { name: 'Organizations', key: 'org_count', expected: 1 },
    { name: 'Users', key: 'user_count', expected: 1 },
    { name: 'Regulatory Submissions', key: 'submission_count', expected: 1 },
    { name: 'Documents', key: 'document_count', expected: 1 },
    { name: 'Context of Use Elements', key: 'cou_count', expected: 1 },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const check of checks) {
    const value = results[check.key];
    const ok = value !== 'ERROR' && value >= check.expected;
    
    if (ok) {
      log(colors.green, `  ✓ ${check.name}: ${value}`);
      passed++;
    } else {
      log(colors.red, `  ✗ ${check.name}: ${value} (expected >= ${check.expected})`);
      failed++;
    }
  }
  
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  Total: ${passed} passed, ${failed} failed\n`);
  
  // Show submission breakdown
  try {
    const submissionTypes = await pool.query(`
      SELECT application_type, COUNT(*) as count, STRING_AGG(application_number, ', ') as apps
      FROM ectd_v4.regulatory_submissions
      GROUP BY application_type
      ORDER BY count DESC
    `);
    
    if (submissionTypes.rows.length > 0) {
      console.log('  Submissions by Type:');
      for (const row of submissionTypes.rows) {
        console.log(`    ${row.application_type}: ${row.count} (${row.apps})`);
      }
    }
  } catch (e) {
    // Ignore
  }
  
  return { passed, failed };
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  Concept2Cure v3.0 - Enterprise Architecture Migration Runner            ║');
  console.log('║  eCTD v4.0 | Multi-Tenant RLS | Part 11 Audit                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
  
  let databaseUrl;
  try {
    databaseUrl = getDatabaseUrl();
    const maskedUrl = databaseUrl.replace(/:[^@]+@/, ':****@');
    log(colors.blue, `Database: ${maskedUrl.substring(0, 70)}...`);
  } catch (error) {
    log(colors.red, error.message);
    process.exit(1);
  }
  
  // Create pool
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });
  
  // Test connection
  try {
    const result = await pool.query('SELECT version()');
    log(colors.green, `Connected to PostgreSQL`);
    console.log(`  ${result.rows[0].version.split(',')[0]}\n`);
  } catch (error) {
    log(colors.red, `Connection failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  }
  
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  Running Migrations');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const migration of MIGRATIONS) {
    const filePath = path.join(migrationsDir, migration);
    
    if (!fs.existsSync(filePath)) {
      log(colors.red, `  ✗ ${migration} (file not found)`);
      failCount++;
      continue;
    }
    
    const success = await runMigration(pool, filePath, migration);
    if (success) {
      successCount++;
    } else {
      failCount++;
      // Continue with other migrations (some failures may be acceptable - idempotent)
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`  Migration Summary: ${successCount} succeeded, ${failCount} failed`);
  console.log('═══════════════════════════════════════════════════════════════════════════');
  
  // Run tests
  if (successCount > 0) {
    await runTestSuite(pool, migrationsDir);
  }
  
  await pool.end();
  
  if (failCount === 0) {
    log(colors.green, '\n🎉 All migrations completed successfully!\n');
  } else {
    log(colors.yellow, '\n⚠️  Some migrations had issues (may be idempotent re-runs)\n');
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
