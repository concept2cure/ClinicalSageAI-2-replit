const { Pool } = require('pg');

async function performHealthCheck() {
  console.log('🏥 Starting comprehensive health check...\n');

  // Memory usage check
  const memUsage = process.memoryUsage();
  const memUsageInMB = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    external: Math.round(memUsage.external / 1024 / 1024),
  };

  console.log('💾 Memory Usage:');
  console.log(`  RSS: ${memUsageInMB.rss}MB`);
  console.log(`  Heap Total: ${memUsageInMB.heapTotal}MB`);
  console.log(`  Heap Used: ${memUsageInMB.heapUsed}MB`);
  console.log(`  External: ${memUsageInMB.external}MB`);

  if (memUsageInMB.heapUsed > 400) {
    console.log('⚠️  High memory usage detected! This may cause database connection issues.');
  } else {
    console.log('✅ Memory usage is within normal limits.');
  }

  // Database connection check
  console.log('\n🔍 Testing database connection...');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('❌ DATABASE_URL environment variable not set');
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

    console.log(`✅ Database connection successful in ${connectionTime}ms`);

    // Test query
    const queryStart = Date.now();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    const queryTime = Date.now() - queryStart;

    console.log(`✅ Test query executed in ${queryTime}ms`);
    console.log(`📊 Database time: ${result.rows[0].current_time}`);

    // Pool statistics
    console.log('\n📈 Connection Pool Stats:');
    console.log(`  Total connections: ${pool.totalCount}`);
    console.log(`  Idle connections: ${pool.idleCount}`);
    console.log(`  Waiting clients: ${pool.waitingCount}`);

    client.release();
    await pool.end();

    console.log('\n🎉 Health check completed successfully!');
  } catch (error) {
    console.error('\n❌ Database health check failed:');
    console.error(`Error code: ${error.code}`);
    console.error(`Error message: ${error.message}`);

    if (error.message.includes('SSL') || error.message.includes('ssl')) {
      console.error(
        '💡 This appears to be an SSL-related issue. Neon databases require SSL connections.'
      );
    }

    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused - check if database server is accessible.');
    }

    if (error.code === 'ETIMEDOUT') {
      console.error(
        '💡 Connection timeout - check network connectivity and database availability.'
      );
    }

    await pool.end().catch(() => {});
  }
}

performHealthCheck().catch(console.error);
