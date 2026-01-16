import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

try {
  const rows = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'organizations';`;
  console.log(rows.map((r) => r.column_name));
} finally {
  await sql.end({ timeout: 5 });
}
