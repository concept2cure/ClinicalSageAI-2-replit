import 'dotenv/config';
import postgres from 'postgres';

const testConnection = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  const hostInfo = databaseUrl?.split('@')[1];

  console.log('🔌 Testing Connection to:', hostInfo || 'unknown host');

  if (!databaseUrl) {
    console.error('❌ ERROR: DATABASE_URL is missing in .env');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { ssl: 'require' });

  try {
    await sql`SELECT 1 as connected`;
    console.log('✅ SUCCESS: Connection verified!');
    console.log('   Neon is accepting your password.');
    await sql.end();
    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ CONNECTION FAILED');
    console.error('   Reason:', err?.message || err);
    console.error(
      "   Hint: If it says 'password authentication failed', reset your Neon password and update DATABASE_URL."
    );
    await sql.end();
    process.exit(1);
  }
};

testConnection();
