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
  const [row] = await sql`select gen_random_uuid() as uuid;`;
  console.log(row);
} catch (error) {
  console.error('gen_random_uuid unavailable?', error.message || error);
} finally {
  await sql.end({ timeout: 5 });
}
