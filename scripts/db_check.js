import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  logger.error('DATABASE_URL is not set.');
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
  const result = await client.query('SELECT 1 as ok');
  logger.info('Database check result:', result.rows[0]);
  await client.end();
};

run().catch(error => {
  logger.error('Database check failed:', error);
  process.exit(1);
});
