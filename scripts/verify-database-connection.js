import { pool } from '../server/db.js';

async function verifyDatabaseConnection() {
  console.log('🔍 Verifying database connection...');

  try {
    // Test basic connection
    const client = await pool.connect();
    console.log('✅ Successfully connected to database');

    // Test query
    const result = await client.query('SELECT NOW() as current_time, version()');
    console.log('✅ Database query successful');
    console.log('📊 Database info:', {
      time: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[0],
    });

    // Test database permissions
    const dbName = await client.query('SELECT current_database()');
    console.log('📁 Connected to database:', dbName.rows[0].current_database);

    client.release();

    console.log('🎉 Database connection verification completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('🔧 Please check your DATABASE_URL in Secrets');

    if (error.code === '28P01') {
      console.error('💡 This is an authentication error - check username/password');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 This is a connection error - check hostname/port');
    }

    process.exit(1);
  }
}

verifyDatabaseConnection();
