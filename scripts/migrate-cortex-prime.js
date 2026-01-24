#!/usr/bin/env node
/**
 * Cortex Prime Migration Orchestrator
 * 
 * Orchestrates the migration of the entire Cortex Prime brain.
 * Runs migrations 073-079 in sequence with validation.
 * 
 * Usage:
 *   node scripts/migrate-cortex-prime.js [--dry-run] [--validate-only]
 * 
 * @module scripts/migrate-cortex-prime
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuration
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');
const CORTEX_MIGRATIONS = [
  '073_cortex_prime_unified_brain.sql',
  '074_gcc_regulatory_intuition_engine.sql',
  '075_gcc_epistemic_intelligence.sql',
  '076_gcc_causal_inference_engine.sql',
  '077_gcc_self_evolving_intelligence.sql',
  '078_gcc_cross_domain_transfer.sql',
  '079_gcc_unified_functions_views.sql'
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(70));
  log(message, colors.bright + colors.cyan);
  console.log('='.repeat(70));
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
}

async function checkPrerequisites(pool) {
  logHeader('Checking Prerequisites');
  
  // Check pgvector extension
  const vectorCheck = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) as has_vector
  `);
  
  if (vectorCheck.rows[0].has_vector) {
    logSuccess('pgvector extension installed');
  } else {
    logError('pgvector extension not installed');
    throw new Error('pgvector is required. Run: CREATE EXTENSION vector;');
  }
  
  // Check for cortex schema (may not exist yet)
  const schemaCheck = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cortex'
    ) as has_cortex
  `);
  
  if (schemaCheck.rows[0].has_cortex) {
    logWarning('cortex schema already exists - migrations may be partial');
  } else {
    logInfo('cortex schema will be created');
  }
  
  // Check disk space (rough estimate)
  const sizeCheck = await pool.query(`
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
  `);
  logInfo(`Current database size: ${sizeCheck.rows[0].db_size}`);
  
  return true;
}

async function validateMigrationFiles() {
  logHeader('Validating Migration Files');
  
  const missing = [];
  const found = [];
  
  for (const migration of CORTEX_MIGRATIONS) {
    const filePath = path.join(MIGRATIONS_DIR, migration);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      found.push({
        name: migration,
        size: stats.size,
        path: filePath
      });
      logSuccess(`${migration} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      missing.push(migration);
      logError(`${migration} - NOT FOUND`);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Missing migrations: ${missing.join(', ')}`);
  }
  
  return found;
}

async function checkMigrationStatus(pool) {
  logHeader('Checking Migration Status');
  
  // Check if migrations table exists
  const tableCheck = await pool.query(`
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'schema_migrations'
    ) as has_migrations_table
  `);
  
  if (!tableCheck.rows[0].has_migrations_table) {
    logInfo('No migrations table found - fresh install');
    return [];
  }
  
  // Get applied migrations
  const applied = await pool.query(`
    SELECT version, applied_at 
    FROM schema_migrations 
    WHERE version LIKE '07%' 
    ORDER BY version
  `);
  
  if (applied.rows.length > 0) {
    logInfo('Previously applied Cortex migrations:');
    for (const row of applied.rows) {
      log(`  - ${row.version} (applied ${row.applied_at})`, colors.cyan);
    }
  } else {
    logInfo('No Cortex migrations applied yet');
  }
  
  return applied.rows.map(r => r.version);
}

async function runMigration(pool, migration, dryRun = false) {
  const filePath = path.join(MIGRATIONS_DIR, migration.name);
  const sql = fs.readFileSync(filePath, 'utf8');
  const version = migration.name.split('_')[0];
  
  log(`\n📦 Migration: ${migration.name}`, colors.bright);
  log(`   Size: ${(migration.size / 1024).toFixed(1)} KB`, colors.cyan);
  
  if (dryRun) {
    logInfo('DRY RUN - Would execute migration');
    return { success: true, dryRun: true };
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Run the migration
    const startTime = Date.now();
    await client.query(sql);
    const duration = Date.now() - startTime;
    
    // Record in migrations table (if it exists)
    try {
      await client.query(`
        INSERT INTO schema_migrations (version, applied_at)
        VALUES ($1, NOW())
        ON CONFLICT (version) DO NOTHING
      `, [version]);
    } catch (e) {
      // Migrations table may not exist
      logWarning('Could not record migration (table may not exist)');
    }
    
    await client.query('COMMIT');
    logSuccess(`Completed in ${duration}ms`);
    
    return { success: true, duration };
  } catch (error) {
    await client.query('ROLLBACK');
    logError(`Failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

async function validateSchema(pool) {
  logHeader('Validating Cortex Schema');
  
  const checks = [
    { schema: 'cortex', table: 'atoms', description: 'Core atoms table' },
    { schema: 'cortex', table: 'edges', description: 'Knowledge edges' },
    { schema: 'cortex', table: 'agents', description: 'Agent registry' },
    { schema: 'cortex', table: 'traces', description: 'Execution traces' },
    { schema: 'cortex', table: 'threads', description: 'Conversation threads' },
    { schema: 'cortex', table: 'regulatory_signals', description: 'Regulatory signals' },
    { schema: 'cortex', table: 'rejection_patterns', description: 'Rejection patterns' },
    { schema: 'cortex', table: 'uncertainty_estimates', description: 'Uncertainty estimates' },
    { schema: 'cortex', table: 'causal_graphs', description: 'Causal graphs' },
    { schema: 'cortex', table: 'learning_experiences', description: 'Learning experiences' },
    { schema: 'cortex', table: 'distilled_insights', description: 'Distilled insights' },
    { schema: 'cortex', table: 'domain_knowledge', description: 'Domain knowledge' },
    { schema: 'cortex', table: 'transfer_mappings', description: 'Transfer mappings' }
  ];
  
  let allPassed = true;
  
  for (const check of checks) {
    const result = await pool.query(`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      ) as exists
    `, [check.schema, check.table]);
    
    if (result.rows[0].exists) {
      // Count rows
      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM ${check.schema}.${check.table}`
      );
      logSuccess(`${check.schema}.${check.table} - ${countResult.rows[0].count} rows`);
    } else {
      logError(`${check.schema}.${check.table} - MISSING`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

async function checkFunctions(pool) {
  logHeader('Checking Functions');
  
  const functions = [
    'cortex.unified_search',
    'cortex.unified_search_fast',
    'cortex.traverse_reasoning',
    'cortex.assemble_context',
    'cortex.query',
    'cortex.health_check',
    'cortex.extract_regulatory_signals',
    'cortex.generate_intuition_prediction',
    'cortex.estimate_uncertainty',
    'cortex.estimate_causal_effect',
    'cortex.record_learning_experience',
    'cortex.run_distillation',
    'cortex.evolve',
    'cortex.find_transfer_candidates',
    'cortex.execute_transfer'
  ];
  
  let allFound = true;
  
  for (const func of functions) {
    const [schema, name] = func.split('.');
    const result = await pool.query(`
      SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = $1 AND p.proname = $2
      ) as exists
    `, [schema, name]);
    
    if (result.rows[0].exists) {
      logSuccess(func);
    } else {
      logError(`${func} - MISSING`);
      allFound = false;
    }
  }
  
  return allFound;
}

async function runHealthCheck(pool) {
  logHeader('Running Health Check');
  
  try {
    const result = await pool.query(`SELECT cortex.health_check() as health`);
    const health = result.rows[0].health;
    
    log('\nHealth Status:', colors.bright);
    log(`  Status: ${health.status}`, health.status === 'healthy' ? colors.green : colors.red);
    log(`  Checked: ${health.checked_at}`, colors.cyan);
    
    log('\nTable Counts:', colors.bright);
    for (const [table, count] of Object.entries(health.tables || {})) {
      log(`  ${table}: ${count}`, colors.cyan);
    }
    
    log('\nIndex Sizes:', colors.bright);
    for (const [index, size] of Object.entries(health.indexes || {})) {
      log(`  ${index}: ${size}`, colors.cyan);
    }
    
    return health.status === 'healthy';
  } catch (error) {
    logError(`Health check failed: ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const validateOnly = args.includes('--validate-only');
  
  console.log('\n');
  log('╔══════════════════════════════════════════════════════════════════╗', colors.cyan);
  log('║              CORTEX PRIME MIGRATION ORCHESTRATOR                 ║', colors.bright + colors.cyan);
  log('║       The Definitive Life Sciences AI Mind - Database Setup      ║', colors.cyan);
  log('╚══════════════════════════════════════════════════════════════════╝', colors.cyan);
  
  if (dryRun) {
    logWarning('\n🔍 DRY RUN MODE - No changes will be made\n');
  }
  if (validateOnly) {
    logWarning('\n🔍 VALIDATE ONLY MODE - No migrations will run\n');
  }
  
  let pool;
  try {
    pool = await createPool();
    logSuccess('Database connection established');
    
    // Prerequisites
    await checkPrerequisites(pool);
    
    // Validate files
    const migrations = await validateMigrationFiles();
    
    // Check status
    const applied = await checkMigrationStatus(pool);
    
    if (!validateOnly) {
      // Run migrations
      logHeader('Running Migrations');
      
      let totalDuration = 0;
      let successful = 0;
      let skipped = 0;
      let failed = 0;
      
      for (const migration of migrations) {
        const version = migration.name.split('_')[0];
        
        if (applied.includes(version)) {
          logInfo(`Skipping ${migration.name} - already applied`);
          skipped++;
          continue;
        }
        
        const result = await runMigration(pool, migration, dryRun);
        
        if (result.success) {
          successful++;
          totalDuration += result.duration || 0;
        } else {
          failed++;
          if (!dryRun) {
            logError('Migration failed - stopping');
            break;
          }
        }
      }
      
      log('\n📊 Migration Summary:', colors.bright);
      log(`  Successful: ${successful}`, colors.green);
      log(`  Skipped: ${skipped}`, colors.yellow);
      log(`  Failed: ${failed}`, colors.red);
      log(`  Total Duration: ${totalDuration}ms`, colors.cyan);
    }
    
    // Validate schema
    const schemaValid = await validateSchema(pool);
    
    // Check functions
    const functionsValid = await checkFunctions(pool);
    
    // Health check
    const healthy = await runHealthCheck(pool);
    
    // Final summary
    logHeader('Final Status');
    
    if (schemaValid && functionsValid && healthy) {
      logSuccess('CORTEX PRIME IS READY');
      log('\nThe definitive Life Sciences AI mind is online.', colors.green);
      log('All systems operational.', colors.green);
    } else {
      logError('CORTEX PRIME SETUP INCOMPLETE');
      log('\nSome components may be missing or misconfigured.', colors.yellow);
      log('Check the logs above for details.', colors.yellow);
    }
    
  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

main();
