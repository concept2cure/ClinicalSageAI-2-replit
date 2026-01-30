/**
 * Database Table Verification Script
 *
 * This script connects to the database and lists all available tables
 * to verify that the schema has been properly migrated.
 */

const { db } = require('../server/db');
const { sql } = require('drizzle-orm');

async function verifyDatabaseTables() {
  logger.info('Connecting to database...');

  try {
    // Query to list all tables in the public schema
    const tables = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    logger.info('\nDatabase tables:');
    logger.info('-----------------');

    if (tables.length === 0) {
      logger.info('No tables found in the database.');
    } else {
      tables.forEach((table, index) => {
        logger.info(`${index + 1}. ${table.table_name}`);
      });
      logger.info(`\nTotal tables: ${tables.length}`);
    }

    // Query to list all enums in the database
    const enums = await db.execute(sql`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder;
    `);

    if (enums.length > 0) {
      logger.info('\nDatabase enums:');
      logger.info('--------------');

      let currentEnum = null;
      let enumValues = [];

      enums.forEach(enumItem => {
        if (currentEnum !== enumItem.enum_name) {
          if (currentEnum) {
            logger.info(`${currentEnum}: [${enumValues.join(', ')}]`);
            enumValues = [];
          }
          currentEnum = enumItem.enum_name;
        }
        enumValues.push(`'${enumItem.enum_value}'`);
      });

      // Print the last enum
      if (currentEnum) {
        logger.info(`${currentEnum}: [${enumValues.join(', ')}]`);
      }
    }

    // Get a sample of data from csr_reports to verify content
    const reports = await db.execute(sql`
      SELECT id, title, sponsor, indication, phase
      FROM csr_reports
      LIMIT 5;
    `);

    if (reports.length > 0) {
      logger.info('\nSample CSR reports:');
      logger.info('-----------------');
      reports.forEach(report => {
        logger.info(
          `ID: ${report.id}, Title: ${report.title}, Sponsor: ${report.sponsor}, Indication: ${report.indication}, Phase: ${report.phase}`
        );
      });
    }
  } catch (error) {
    logger.error('Error verifying database tables:', error);
  }
}

verifyDatabaseTables().catch(console.error);
