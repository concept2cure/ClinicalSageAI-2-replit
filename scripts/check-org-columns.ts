import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function main() {
  if (!db) {
    console.error('db not initialized');
    process.exit(1);
  }

  const result = await db.execute(
    sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'organizations';`
  );

  console.log(result.rows?.map((row: any) => row.column_name));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
