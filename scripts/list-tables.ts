import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db, pool } from '../server/db';

async function main() {
  if (!db) {
    console.error('Database connection not available');
    process.exit(1);
  }

  const result = await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public';`
  );

  console.log(result.rows?.map((row: any) => row.table_name));

  if (pool) {
    await pool.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
