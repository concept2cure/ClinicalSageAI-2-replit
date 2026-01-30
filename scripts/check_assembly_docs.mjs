#!/usr/bin/env node
import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  logger.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

(async () => {
  try {
    const res = await pool.query("SELECT to_regclass('public.assembly_docs') as exists");
    if (res.rows[0].exists) {
      logger.info('OK: assembly_docs table exists');
      process.exit(0);
    } else {
      logger.error('MISSING: assembly_docs table not found');
      process.exit(2);
    }
  } catch (e) {
    logger.error('ERROR:', e.message);
    process.exit(3);
  } finally {
    await pool.end();
  }
})();
