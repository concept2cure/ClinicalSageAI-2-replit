import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../server/db';

async function main() {
  const table = process.argv[2];
  if (!table) {
    console.error('Usage: tsx scripts/check-columns.ts <table_name>');
    process.exit(1);
  }

  if (!db) {
    console.error('Database connection not available');
    process.exit(1);
  }

  console.log(`Inspecting columns for table: ${table}`);

  const result = await db.execute(
    sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${table};`
  );

  console.log(result.rows?.map((row: any) => row.column_name));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
