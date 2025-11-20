/**
 * Database Table Verification Script
 *
 * This script connects to the database and lists all available tables
 * to verify that the schema has been properly migrated.
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

interface TableInfo {
  table_name: string;
}

interface EnumInfo {
  enum_name: string;
  enum_value: string;
}

interface ReportInfo {
  id: number;
  title: string;
  sponsor: string;
  indication: string;
  phase: string;
}

async function verifyDatabaseTables() {
  console.log('Connecting to database...');

  try {
    // Query to list all tables in the public schema
    const tables = await db.execute<TableInfo>(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

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
    const enums = await db.execute<EnumInfo>(sql`
      SELECT t.typname AS enum_name, e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder;
    `);

    if (enums.length > 0) {
      console.log('\nDatabase enums:');
      console.log('--------------');

      let currentEnum: string | null = null;
      let enumValues: string[] = [];

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
    const reports = await db.execute<ReportInfo>(sql`
      SELECT id, title, sponsor, indication, phase
      FROM csr_reports
      LIMIT 5;
    `);

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
  }
}

verifyDatabaseTables().catch(console.error);
