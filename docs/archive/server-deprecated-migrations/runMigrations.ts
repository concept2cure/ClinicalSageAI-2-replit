/**
 * Migration Runner for Concept2Cure Multi-Tenant System
 *
 * This utility runs database migrations in order to set up
 * the multi-tenant architecture features.
 */
import path from 'path';
import fs from 'fs';
import { runMigrations as runCoreMigrations } from '../db';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('migrations');

/**
 * Run all migrations in order
 */
export async function runAllMigrations() {
  try {
    // First run the core Drizzle migrations
    await runCoreMigrations();
    logger.info('Core schema migrations completed');

    // Then run the multi-tenant feature migrations
    await runTenantMigrations();
    logger.info('Tenant feature migrations completed');

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', error);
    throw error;
  }
}

/**
 * Run the multi-tenant feature migrations
 */
async function runTenantMigrations() {
  const migrationsDir = path.resolve(__dirname, '../../migrations');

  // Check if migrations directory exists
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found, skipping tenant migrations');
    return;
  }

  // Get all migration files and sort them
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
    .sort();

  // Run each migration in order
  for (const file of migrationFiles) {
    const migrationPath = path.join(migrationsDir, file);
    logger.info(`Running migration ${file}`);

    try {
      // Import the migration
      const migration = await import(migrationPath);

      // Run the migration
      if (typeof migration.up === 'function') {
        await migration.up();
        logger.info(`Migration ${file} completed successfully`);
      } else {
        logger.warn(`Migration ${file} does not have an up function, skipping`);
      }
    } catch (error) {
      logger.error(`Migration ${file} failed`, error);
      throw error;
    }
  }
}

/**
 * Run a specific migration
 */
export async function runMigration(name: string) {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationPath = path.join(migrationsDir, `${name}.ts`);

  // Check if migration file exists
  if (!fs.existsSync(migrationPath)) {
    logger.error(`Migration ${name} not found`);
    throw new Error(`Migration ${name} not found`);
  }

  logger.info(`Running migration ${name}`);

  try {
    // Import the migration
    const migration = await import(migrationPath);

    // Run the migration
    if (typeof migration.up === 'function') {
      await migration.up();
      logger.info(`Migration ${name} completed successfully`);
    } else {
      logger.warn(`Migration ${name} does not have an up function, skipping`);
    }
  } catch (error) {
    logger.error(`Migration ${name} failed`, error);
    throw error;
  }
}

/**
 * Revert a specific migration
 */
export async function revertMigration(name: string) {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const migrationPath = path.join(migrationsDir, `${name}.ts`);

  // Check if migration file exists
  if (!fs.existsSync(migrationPath)) {
    logger.error(`Migration ${name} not found`);
    throw new Error(`Migration ${name} not found`);
  }

  logger.info(`Reverting migration ${name}`);

  try {
    // Import the migration
    const migration = await import(migrationPath);

    // Run the migration's down function
    if (typeof migration.down === 'function') {
      await migration.down();
      logger.info(`Migration ${name} reverted successfully`);
    } else {
      logger.warn(`Migration ${name} does not have a down function, cannot revert`);
    }
  } catch (error) {
    logger.error(`Failed to revert migration ${name}`, error);
    throw error;
  }
}
