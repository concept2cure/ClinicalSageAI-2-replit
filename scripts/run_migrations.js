/**
 * Migration Runner
 *
 * This script runs all database migrations in the correct order.
 */
const { runAllMigrations } = require('../server/migrations/runMigrations');

async function main() {
  try {
    logger.info('=== Starting Database Migrations ===');

    // Run all migrations
    await runAllMigrations();

    logger.info('=== Migrations completed successfully ===');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
