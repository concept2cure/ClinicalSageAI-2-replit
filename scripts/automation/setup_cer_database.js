import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the schema file
const schemaFilePath = path.join(__dirname, 'server', 'api', 'cer', 'schema.sql');
const schema = fs.readFileSync(schemaFilePath, 'utf8');

// Initialize PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  try {
    logger.info('Setting up CER database...');

    // Execute the schema
    await pool.query(schema);

    logger.info('CER database setup complete!');
  } catch (error) {
    logger.error('Error setting up CER database:', error);
  } finally {
    await pool.end();
  }
}

setupDatabase();
