/**
 * AnA RI Database Setup
 *
 * Initializes the tables required for AnA RI intelligence harvesting.
 */

import { Pool } from 'pg';
import fs from 'fs';
import { getPool } from '../db';

// Re-export the canonical pool for backward compatibility
export const pool = getPool();

export async function initializeLumenCortexDatabase() {
  console.log('Initializing AnA RI database tables...');

  try {
    const client = await pool.connect();

    try {
      const fileURL = new URL('../../migrations/20250918_lumen_cortex.sql', import.meta.url);
      const migrationFilePath = fileURL.pathname;
      const migrationSql = fs.readFileSync(migrationFilePath, 'utf8');

      await client.query(migrationSql);
      console.log('AnA RI tables created/verified successfully.');
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing AnA RI database:', error);
    return false;
  }
}

export { pool };
export default { initializeLumenCortexDatabase };
