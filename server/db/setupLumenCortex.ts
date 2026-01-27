/**
 * Lumen Cortex Database Setup
 *
 * Initializes the tables required for Lumen Cortex intelligence harvesting.
 */

import { Pool } from 'pg';
import fs from 'fs';
import { getSslConfig } from './ssl';
import { getDatabaseUrl } from './getDatabaseUrl';

const connectionString = getDatabaseUrl();
const pool = new Pool({
  connectionString,
  ssl: getSslConfig(connectionString || ''),
});

export async function initializeLumenCortexDatabase() {
  console.log('Initializing Lumen Cortex database tables...');

  try {
    const client = await pool.connect();

    try {
      const fileURL = new URL('../../migrations/20250918_lumen_cortex.sql', import.meta.url);
      const migrationFilePath = fileURL.pathname;
      const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

      await client.query(migrationSql);
      console.log('Lumen Cortex tables created/verified successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing Lumen Cortex database:', error);
    return false;
  }
}

export { pool };
export default { initializeLumenCortexDatabase };
