/**
 * Database Table Verification Script
 *
 * This script connects to the database and lists all available tables
 * to verify that the schema has been properly migrated.
 */

import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const ssl = databaseUrl.includes('sslmode=require')
  ? {
      rejectUnauthorized: false,
    }
  : undefined;

async function verifyDatabaseTables() {
  console.log('Connecting to database...');
  const client = new Client({
    connectionString: databaseUrl,
    ssl,
  });

  try {
    await client.connect();

    // Query to list all tables in the public schema
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    const tables = tablesResult.rows;

    console.log('\nDatabase tables:');
    console.log('-----------------');

    if (tables.length === 0) {
      console.log('No tables found in the database.');
    } else {
      tables.forEach((table, index) => {
        console.log(`${index + 1}. ${table.table_name}`);
      });
      console.log(`\nTotal tables: ${tables.length}`);
    }

    // Query to list all enums in the database
    const enumsResult = await client.query(`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder;
    `);
    const enums = enumsResult.rows;

    if (enums.length > 0) {
      console.log('\nDatabase enums:');
      console.log('--------------');

      let currentEnum = null;
      let enumValues = [];

      enums.forEach(enumItem => {
        if (currentEnum !== enumItem.enum_name) {
          if (currentEnum) {
            console.log(`${currentEnum}: [${enumValues.join(', ')}]`);
            enumValues = [];
          }
          currentEnum = enumItem.enum_name;
        }
        enumValues.push(`'${enumItem.enum_value}'`);
      });

      // Print the last enum
      if (currentEnum) {
        console.log(`${currentEnum}: [${enumValues.join(', ')}]`);
      }
    }

    // Get a sample of data from csr_reports to verify content
    const reportsResult = await client.query(`
      SELECT id, title, sponsor, indication, phase
      FROM csr_reports
      LIMIT 5;
    `);
    const reports = reportsResult.rows;

    if (reports.length > 0) {
      console.log('\nSample CSR reports:');
      console.log('-----------------');
      reports.forEach(report => {
        console.log(
          `ID: ${report.id}, Title: ${report.title}, Sponsor: ${report.sponsor}, Indication: ${report.indication}, Phase: ${report.phase}`
        );
      });
    }
  } catch (error) {
    console.error('Error verifying database tables:', error);
  } finally {
    await client.end();
  }
}

verifyDatabaseTables().catch(console.error);
