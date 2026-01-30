#!/usr/bin/env node

/*
 * Database Migration Script for TrialSage
 * This script pushes the schema defined in shared/schema.ts to the database
 */

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './shared/schema.js';

// Configuration validation
if (!process.env.DATABASE_URL) {
  logger.error('Error: DATABASE_URL environment variable not set');
  process.exit(1);
}

async function runMigration() {
  logger.info('Starting database migration for TrialSage...');

  try {
    // Connect to the database with postgres.js
    const migrationClient = postgres(process.env.DATABASE_URL, { ssl: 'require' });
    const db = drizzle(migrationClient, { schema });

    logger.info('Connected to database. Running migrations...');

    // Run migrations
    await migrate(db, { migrationsFolder: './migrations' });

    logger.info('Database migration completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
