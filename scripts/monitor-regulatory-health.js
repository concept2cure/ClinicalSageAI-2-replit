#!/usr/bin/env node
import pg from 'pg';

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL/NEON_DATABASE_URL missing');
  process.exit(1);
}

const { Client } = pg;

(async () => {
  console.log('🏥 Monitoring Regulatory System Health...');

  const client = new Client({ connectionString });
  await client.connect();

  const lowCompliance = await client.query(
    'select count(*)::int as count from regulatory_atoms where compliance_score < 0.8'
  );
  if (lowCompliance.rows[0].count > 0) {
    console.error(`🚨 ALERT: ${lowCompliance.rows[0].count} atoms below 80% compliance`);
    await client.end();
    process.exit(1);
  }

  const recentLogs = await client.query(
    'select count(*)::int as count from audit_logs where timestamp >= now() - interval \'5 minutes\''
  );
  if (recentLogs.rows[0].count === 0) {
    console.error('🚨 ALERT: No audit logs in last 5 minutes - logging broken');
    await client.end();
    process.exit(1);
  }

  const slowQueries = await client.query(
    'select query, mean_exec_time from pg_stat_statements where mean_exec_time > 1000 limit 5'
  );
  if (slowQueries.rows.length > 0) {
    console.error('🚨 ALERT: Slow queries detected');
    console.table(slowQueries.rows);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('✅ All systems healthy');
})();
