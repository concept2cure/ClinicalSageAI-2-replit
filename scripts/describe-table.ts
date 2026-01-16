import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../server/db';

async function main() {
  const table = process.argv[2];
  if (!table) {
    console.error('Usage: tsx scripts/describe-table.ts <table_name>');
    process.exit(1);
  }

  if (!db) {
    console.error('Database connection not available');
    process.exit(1);
  }

  const result = await db.execute(
    sql`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and table_name = ${table};`
  );

  console.table(result.rows ?? []);

  if (pool) {
    await pool.end();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
