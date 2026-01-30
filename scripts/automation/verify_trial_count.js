/**
 * Verify Trial Count
 *
 * This script checks the database to verify the current
 * count of trials from different sources.
 */

import pg from 'pg';

// Database connection
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function getTrialCounts() {
  try {
    logger.info('=== Trial Count Verification ===');
    logger.info('Time:', new Date().toISOString());
    logger.info('\nQuerying database for counts...');

    // Get total count
    const totalResult = await pool.query('SELECT COUNT(*) FROM csr_reports');
    const totalCount = parseInt(totalResult.rows[0].count, 10);
    logger.info(`Total trials in database: ${totalCount}`);

    // Get Health Canada count
    const hcResult = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'HC%'");
    const hcCount = parseInt(hcResult.rows[0].count, 10);
    logger.info(`Health Canada trials: ${hcCount}`);

    // Get ClinicalTrials.gov count
    const ctgResult = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'NCT%'");
    const ctgCount = parseInt(ctgResult.rows[0].count, 10);
    logger.info(`ClinicalTrials.gov trials: ${ctgCount}`);

    // Get other sources count
    const otherCount = totalCount - hcCount - ctgCount;
    logger.info(`Trials from other sources: ${otherCount}`);

    // Get top 10 indications
    logger.info('\n=== Top 10 Indications ===');
    const indicationsResult = await pool.query(`
      SELECT indication, COUNT(*) as count
      FROM csr_reports
      WHERE indication IS NOT NULL
      GROUP BY indication
      ORDER BY count DESC
      LIMIT 10
    `);

    indicationsResult.rows.forEach((row, index) => {
      logger.info(`${index + 1}. ${row.indication}: ${row.count}`);
    });

    // Get phase distribution
    logger.info('\n=== Phase Distribution ===');
    const phaseResult = await pool.query(`
      SELECT phase, COUNT(*) as count
      FROM csr_reports
      WHERE phase IS NOT NULL
      GROUP BY phase
      ORDER BY count DESC
    `);

    phaseResult.rows.forEach(row => {
      logger.info(`${row.phase}: ${row.count}`);
    });

    // Get sponsor distribution
    logger.info('\n=== Top 10 Sponsors ===');
    const sponsorResult = await pool.query(`
      SELECT sponsor, COUNT(*) as count
      FROM csr_reports
      WHERE sponsor IS NOT NULL
      GROUP BY sponsor
      ORDER BY count DESC
      LIMIT 10
    `);

    sponsorResult.rows.forEach((row, index) => {
      logger.info(`${index + 1}. ${row.sponsor}: ${row.count}`);
    });

    // Get progress to 4000 target
    const target = 4000;
    const progress = (totalCount / target) * 100;
    logger.info(`\n=== Progress to Target ===`);
    logger.info(`Target: ${target} trials`);
    logger.info(`Current: ${totalCount} trials`);
    logger.info(`Progress: ${progress.toFixed(2)}%`);
    logger.info(`Remaining: ${Math.max(0, target - totalCount)} trials`);

    return {
      total: totalCount,
      healthCanada: hcCount,
      clinicalTrials: ctgCount,
      other: otherCount,
      progress: progress,
    };
  } catch (error) {
    logger.error('Error verifying trial counts:', error);
    return null;
  } finally {
    await pool.end();
  }
}

// Run the function
getTrialCounts().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
