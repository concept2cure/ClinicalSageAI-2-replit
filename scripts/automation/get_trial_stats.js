import pg from 'pg';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getTrialStatistics() {
  const client = await pool.connect();

  try {
    // Count by region
    logger.info('=== TRIALS BY REGION ===');
    const regionQuery = `
      SELECT region, COUNT(*) as count 
      FROM csr_reports 
      GROUP BY region 
      ORDER BY count DESC
    `;
    const regionResult = await client.query(regionQuery);
    regionResult.rows.forEach(row => {
      logger.info(`${row.region || 'Unknown'}: ${row.count}`);
    });

    // Count by phase
    logger.info('\n=== TRIALS BY PHASE ===');
    const phaseQuery = `
      SELECT phase, COUNT(*) as count 
      FROM csr_reports 
      GROUP BY phase 
      ORDER BY count DESC
    `;
    const phaseResult = await client.query(phaseQuery);
    phaseResult.rows.forEach(row => {
      logger.info(`${row.phase || 'Unknown'}: ${row.count}`);
    });

    // Count by status
    logger.info('\n=== TRIALS BY STATUS ===');
    const statusQuery = `
      SELECT status, COUNT(*) as count 
      FROM csr_reports 
      GROUP BY status 
      ORDER BY count DESC
    `;
    const statusResult = await client.query(statusQuery);
    statusResult.rows.forEach(row => {
      logger.info(`${row.status || 'Unknown'}: ${row.count}`);
    });

    // Count by top indications
    logger.info('\n=== TOP 10 INDICATIONS ===');
    const indicationQuery = `
      SELECT indication, COUNT(*) as count, 
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM csr_reports), 1) as percentage
      FROM csr_reports 
      GROUP BY indication 
      ORDER BY count DESC 
      LIMIT 10
    `;
    const indicationResult = await client.query(indicationQuery);
    indicationResult.rows.forEach(row => {
      logger.info(`${row.indication || 'Unknown'}: ${row.count} (${row.percentage}%)`);
    });

    // Count by top sponsors
    logger.info('\n=== TOP 10 SPONSORS ===');
    const sponsorQuery = `
      SELECT sponsor, COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM csr_reports), 1) as percentage
      FROM csr_reports 
      GROUP BY sponsor 
      ORDER BY count DESC 
      LIMIT 10
    `;
    const sponsorResult = await client.query(sponsorQuery);
    sponsorResult.rows.forEach(row => {
      logger.info(`${row.sponsor || 'Unknown'}: ${row.count} (${row.percentage}%)`);
    });

    // Total count
    const totalQuery = 'SELECT COUNT(*) as count FROM csr_reports';
    const totalResult = await client.query(totalQuery);
    logger.info(`\nTOTAL TRIALS: ${totalResult.rows[0].count}`);

    // Health Canada trial count and percentage
    const hcQuery = "SELECT COUNT(*) as count FROM csr_reports WHERE region = 'Health Canada'";
    const hcResult = await client.query(hcQuery);
    const hcCount = parseInt(hcResult.rows[0].count);
    const hcPercentage = ((hcCount / parseInt(totalResult.rows[0].count)) * 100).toFixed(1);

    logger.info(`\nHealth Canada Trials: ${hcCount} (${hcPercentage}% of total)`);
  } finally {
    client.release();
    await pool.end();
  }
}

getTrialStatistics().catch(console.error);
