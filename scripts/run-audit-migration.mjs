import pg from 'pg';
import fs from 'fs';

const connectionString = process.env.DATABASE_URL;
logger.info('Connecting to:', connectionString?.replace(/:[^:@]+@/, ':***@'));

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    const client = await pool.connect();
    logger.info('✅ Connected to database');

    const sql = fs.readFileSync('./db/migrations/20260125_ai_provider_audit_log.sql', 'utf8');
    await client.query(sql);
    logger.info('✅ AI Provider Audit Log migration completed');

    client.release();
    await pool.end();
  } catch (error) {
    logger.error('Error:', error.message);
    process.exit(1);
  }
}

run();
