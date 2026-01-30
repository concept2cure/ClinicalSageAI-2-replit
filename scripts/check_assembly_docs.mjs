#!/usr/bin/env node
import { Pool } from 'pg';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new Pool({ connectionString: dbUrl });

(async () => {
  try {
    const res = await pool.query("SELECT to_regclass('public.assembly_docs') as exists");
    if (res.rows[0].exists) {
      console.log('OK: assembly_docs table exists');
      process.exit(0);
    } else {
      console.error('MISSING: assembly_docs table not found');
      process.exit(2);
    }
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(3);
  } finally {
    await pool.end();
  }
})();
