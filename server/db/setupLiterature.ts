/**
 * Literature Database Setup
 *
 * This module provides functions to initialize the database tables
 * required for the 510(k) literature discovery feature.
 */

import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db';

// Re-export the canonical pool for backward compatibility with services
export const pool = getPool();

/**
 * Initialize literature database tables and extensions
 */
export async function initializeLiteratureDatabase() {
  console.log('Initializing literature database tables...');

  try {
    const client = await pool.connect();

    try {
      console.log('Connected to PostgreSQL. Setting up pgvector extension and tables...');

      // Check if pgvector extension is available
      const checkExtensionSql = `
        SELECT * FROM pg_extension WHERE extname = 'vector';
      `;

      const extensionResult = await client.query(checkExtensionSql);

      if (extensionResult.rowCount === 0) {
        console.log('pgvector extension not found. Installing extension...');
        // Enable pgvector extension
        await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
        console.log('pgvector extension installed successfully.');
      } else {
        console.log('pgvector extension is already installed.');
      }

      // Read and execute the migration SQL file
      // Use import.meta.url instead of __dirname for ESM compatibility
      const fileURL = new URL('../../migrations/20250512_literature_entries.sql', import.meta.url);
      const migrationFilePath = fileURL.pathname;
      const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

      // Execute the migration
      await client.query(migrationSql);

      console.log('Literature database tables and indexes created successfully.');

      // Create basic sources data if not exists
      const sourcesSql = `
        INSERT INTO literature_sources (id, name, description, enabled, priority)
        VALUES
          ('pubmed', 'PubMed', 'Medical and biomedical literature from MEDLINE', true, 1),
          ('fda', 'FDA', 'FDA regulatory documents and guidance', true, 2),
          ('clinicaltrials', 'ClinicalTrials.gov', 'Clinical trials registry', true, 3),
          ('imported', 'Previously Imported', 'Documents imported to your library', true, 4)
        ON CONFLICT (id) DO NOTHING;
      `;

      try {
        // Check if the table exists before executing the insert
        const tableExists = await client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_name = 'literature_sources'
          );
        `);

        if (tableExists.rows[0].exists) {
          await client.query(sourcesSql);
          console.log('Literature sources initialized.');
        } else {
          console.log('Literature sources table not found, creating it...');

          // Create the table and then insert the data
          await client.query(`
            CREATE TABLE IF NOT EXISTS literature_sources (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT NULL,
              enabled BOOLEAN NOT NULL DEFAULT true,
              priority INTEGER NOT NULL DEFAULT 999,
              created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );
          `);

          await client.query(sourcesSql);
          console.log('Literature sources table created and initialized.');
        }
      } catch (err) {
        console.warn('Error initializing literature sources:', err);
        // Non-fatal error, continue
      }

      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing literature database:', error);
    return false;
  }
}

export default { initializeLiteratureDatabase };
