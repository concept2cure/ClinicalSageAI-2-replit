import 'dotenv/config';
import postgres from 'postgres';

const table = process.argv[2];
if (!table) {
  console.error('Usage: node scripts/db-describe.mjs <table_name>');
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: url.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

try {
  const rows = await sql`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
    order by ordinal_position;
  `;
  console.table(rows);
} finally {
  await sql.end({ timeout: 5 });
}
