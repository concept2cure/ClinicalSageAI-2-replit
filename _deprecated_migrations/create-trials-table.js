import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

// This will automatically run needed migrations on the database
async function main() {
  console.log('Starting database migration...');
  console.log(
    'Using DATABASE_URL:',
    process.env.DATABASE_URL ? 'Found (hidden for security)' : 'Not found'
  );

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Create connection
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    // Run migrations
    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: 'migrations/scripts' });
    console.log('Migrations completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    // Close connection
    await sql.end();
  }
}

// Run the migration
main()
  .then(() => {
    console.log('Database migration finished');
    process.exit(0);
  })
  .catch(err => {
    console.error('Database migration failed:', err);
    process.exit(1);
  });
