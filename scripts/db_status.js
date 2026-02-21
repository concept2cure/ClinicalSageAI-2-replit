import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const ssl = databaseUrl.includes('sslmode=require')
  ? {
      rejectUnauthorized: false,
    }
  : undefined;

const client = new Client({
  connectionString: databaseUrl,
  ssl,
});

const run = async () => {
  await client.connect();
  const tablesResult = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('drizzle_migrations', 'schema_migrations')"
  );

  if (tablesResult.rows.length === 0) {
    console.warn('No migration tables found (drizzle_migrations or schema_migrations).');
    const publicTableCount = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log('Public table count:', publicTableCount.rows[0].count);
    await client.end();
    return;
  }

  console.log('Migration tables found:', tablesResult.rows.map(row => row.table_name).join(', '));

  if (tablesResult.rows.some(row => row.table_name === 'drizzle_migrations')) {
    const migrations = await client.query(
      'SELECT * FROM drizzle_migrations ORDER BY id DESC LIMIT 5'
    );
    console.log('Latest drizzle migrations:', migrations.rows);
  }

  if (tablesResult.rows.some(row => row.table_name === 'schema_migrations')) {
    const migrations = await client.query(
      'SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5'
    );
    console.log('Latest schema migrations:', migrations.rows);
  }

  await client.end();
};

run().catch(error => {
  console.error('Database status check failed:', error);
  process.exit(1);
});
