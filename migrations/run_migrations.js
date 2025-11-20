/**
 * Database Migration Runner
 *
 * This script runs all SQL migration files in the migrations directory
 * to ensure database schema is up to date.
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Create a database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration(filePath) {
  console.log(`Running migration: ${path.basename(filePath)}`);
  const sql = fs.readFileSync(filePath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Split SQL file by semicolons to handle multiple statements
    // This is a simple approach - for more complex migrations, use a proper migration tool
    const statements = sql.split(';').filter(s => s.trim().length > 0);

    for (const statement of statements) {
      await client.query(statement);
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully executed: ${path.basename(filePath)}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`❌ Error executing migration ${path.basename(filePath)}:`, error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Get a list of migration files
async function getMigrationFiles() {
  const migrationDir = path.join(__dirname);
  const files = await fs.promises.readdir(migrationDir);
  return files
    .filter(f => f.endsWith('.sql'))
    .map(f => path.join(migrationDir, f))
    .sort(); // Sort to ensure migrations run in order
}

// Run all migrations
async function runAllMigrations() {
  try {
    // First, ensure we have a migrations table to track what's been run
    await createMigrationsTable();

    const files = await getMigrationFiles();
    for (const file of files) {
      const fileName = path.basename(file);

      // Skip if migration has already been run
      if (await isMigrationAlreadyRun(fileName)) {
        console.log(`⏭️ Skipping already applied migration: ${fileName}`);
        continue;
      }

      // Run the migration
      await runMigration(file);

      // Record that this migration has been run
      await recordMigration(fileName);
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Create migrations tracking table if it doesn't exist
async function createMigrationsTable() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  } finally {
    client.release();
  }
}

// Check if a migration has already been run
async function isMigrationAlreadyRun(migrationName) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT 1 FROM schema_migrations WHERE migration_name = $1', [
      migrationName,
    ]);
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

// Record that a migration has been run
async function recordMigration(migrationName) {
  const client = await pool.connect();
  try {
    await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1)', [
      migrationName,
    ]);
  } finally {
    client.release();
  }
}

// Run the migrations
runAllMigrations();
