#!/usr/bin/env node

/**
 * Concept2Cure Database Table Verification
 *
 * This script checks if the database tables are properly set up
 * after running the schema migration.
 */

import pg from 'pg';
const { Pool } = pg;

// Create a database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkTables() {
  const client = await pool.connect();
  try {
    logger.info('Connected to database. Checking tables...\n');

    // Get a list of all tables in the public schema
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // Get enum types
    const enumsResult = await client.query(`
      SELECT t.typname AS enum_name
      FROM pg_type t
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typcategory = 'E'
      GROUP BY t.typname
      ORDER BY t.typname
    `);

    logger.info('Tables found in database:');
    logger.info('========================');

    if (tablesResult.rows.length === 0) {
      logger.info('No tables found!');
    } else {
      tablesResult.rows.forEach((row, i) => {
        logger.info(`${i + 1}. ${row.table_name}`);
      });
      logger.info(`\nTotal tables: ${tablesResult.rows.length}`);
    }

    logger.info('\nEnum types found in database:');
    logger.info('===========================');

    if (enumsResult.rows.length === 0) {
      logger.info('No enum types found!');
    } else {
      enumsResult.rows.forEach((row, i) => {
        logger.info(`${i + 1}. ${row.enum_name}`);
      });
      logger.info(`\nTotal enum types: ${enumsResult.rows.length}`);
    }

    // Check for specific required tables
    const requiredTables = ['users', 'csr_reports', 'protocols', 'projects'];

    logger.info('\nVerifying required tables:');
    logger.info('=========================');

    const missingTables = [];

    for (const table of requiredTables) {
      const found = tablesResult.rows.some(row => row.table_name === table);
      if (found) {
        logger.info(`✓ ${table} - Found`);
      } else {
        logger.info(`✗ ${table} - MISSING`);
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      logger.info('\n⚠️  WARNING: Some required tables are missing!');
      logger.info(`Missing tables: ${missingTables.join(', ')}`);
      return false;
    } else {
      logger.info('\n✓ All required tables are present!');
      return true;
    }
  } catch (error) {
    logger.error('Error checking database tables:', error);
    return false;
  } finally {
    client.release();
    await pool.end();
  }
}

checkTables()
  .then(success => {
    if (!success) {
      process.exit(1);
    }
  })
  .catch(error => {
    logger.error('Unexpected error:', error);
    process.exit(1);
  });
