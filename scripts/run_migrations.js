/**
 * Migration Runner
 *
 * This script runs all database migrations in the correct order.
 */
const { runAllMigrations } = require('../server/migrations/runMigrations');

async function main() {
  try {
    console.log('=== Starting Database Migrations ===');

    // Run all migrations
    await runAllMigrations();

    console.log('=== Migrations completed successfully ===');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
