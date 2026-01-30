import { pool } from '../server/db.js';

async function verifyDatabaseConnection() {
  logger.info('🔍 Verifying database connection...');

  try {
    // Test basic connection
    const client = await pool.connect();
    logger.info('✅ Successfully connected to database');

    // Test query
    const result = await client.query('SELECT NOW() as current_time, version()');
    logger.info('✅ Database query successful');
    logger.info('📊 Database info:', {
      time: result.rows[0].current_time,
      version: result.rows[0].version.split(' ')[0],
    });

    // Test database permissions
    const dbName = await client.query('SELECT current_database()');
    logger.info('📁 Connected to database:', dbName.rows[0].current_database);

    client.release();

    logger.info('🎉 Database connection verification completed successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    logger.error('🔧 Please check your DATABASE_URL in Secrets');

    if (error.code === '28P01') {
      logger.error('💡 This is an authentication error - check username/password');
    } else if (error.code === 'ENOTFOUND') {
      logger.error('💡 This is a connection error - check hostname/port');
    }

    process.exit(1);
  }
}

verifyDatabaseConnection();
