import 'dotenv/config';
import postgres from 'postgres';

const tables = process.argv.length > 2 ? process.argv.slice(2) : [];
if (tables.length === 0) {
  console.error('Usage: node scripts/check-table-exists.mjs <table_name> [more_names...]');
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
  for (const name of tables) {
    const [row] = await sql`
      select to_regclass(${`public.${name}`}::text) as regclass;
    `;
    console.log(name, row?.regclass ?? null);
  }
} finally {
  await sql.end({ timeout: 5 });
}
