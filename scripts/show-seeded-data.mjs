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
  const orgs = await sql`select id, name, slug from organizations order by id limit 5;`;
  console.log('organizations:', orgs);

  const docs = await sql`select id, organization_id, document_uid, title from source_documents order by created_at desc limit 5;`;
  console.log('source_documents:', docs);

  const points = await sql`select document_id, label, value from source_data_points order by created_at desc limit 5;`;
  console.log('source_data_points:', points);
} finally {
  await sql.end({ timeout: 5 });
}
