const { Pool } = require('pg');

async function performHealthCheck() {
  logger.info('🏥 Starting comprehensive health check...\n');

  // Memory usage check
  const memUsage = process.memoryUsage();
  const memUsageInMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
  };

  logger.info('💾 Memory Usage:');
  logger.info(`  RSS: ${memUsageInMB.rss}MB`);
  logger.info(`  Heap Total: ${memUsageInMB.heapTotal}MB`);
  logger.info(`  Heap Used: ${memUsageInMB.heapUsed}MB`);
  logger.info(`  External: ${memUsageInMB.external}MB`);

  if (memUsageInMB.heapUsed > 400) {
    logger.info('⚠️  High memory usage detected! This may cause database connection issues.');
  } else {
    logger.info('✅ Memory usage is within normal limits.');
  }

  // Database connection check
  logger.info('\n🔍 Testing database connection...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.info('❌ DATABASE_URL environment variable not set');
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('neondb') ? { rejectUnauthorized: false } : false,
    max: 5,
    connectionTimeoutMillis: 5000,
  });

  try {
    const start = Date.now();
    const client = await pool.connect();
    const connectionTime = Date.now() - start;

    logger.info(`✅ Database connection successful in ${connectionTime}ms`);

    // Test query
    const queryStart = Date.now();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    const queryTime = Date.now() - queryStart;

    logger.info(`✅ Test query executed in ${queryTime}ms`);
    logger.info(`📊 Database time: ${result.rows[0].current_time}`);

    // Pool statistics
    logger.info('\n📈 Connection Pool Stats:');
    logger.info(`  Total connections: ${pool.totalCount}`);
    logger.info(`  Idle connections: ${pool.idleCount}`);
    logger.info(`  Waiting clients: ${pool.waitingCount}`);

    client.release();
    await pool.end();

    logger.info('\n🎉 Health check completed successfully!');
  } catch (error) {
    logger.error('\n❌ Database health check failed:');
    logger.error(`Error code: ${error.code}`);
    logger.error(`Error message: ${error.message}`);

    if (error.message.includes('SSL') || error.message.includes('ssl')) {
      logger.error(
        '💡 This appears to be an SSL-related issue. Neon databases require SSL connections.'
      );
    }

    if (error.code === 'ECONNREFUSED') {
      logger.error('💡 Connection refused - check if database server is accessible.');
    }

    if (error.code === 'ETIMEDOUT') {
      logger.error(
        '💡 Connection timeout - check network connectivity and database availability.'
      );
    }

    await pool.end().catch(() => {});
  }
}

performHealthCheck().catch(console.error);
