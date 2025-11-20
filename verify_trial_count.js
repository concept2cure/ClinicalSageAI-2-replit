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
    console.log('=== Trial Count Verification ===');
    console.log('Time:', new Date().toISOString());
    console.log('\nQuerying database for counts...');

    // Get total count
    const totalResult = await pool.query('SELECT COUNT(*) FROM csr_reports');
    const totalCount = parseInt(totalResult.rows[0].count, 10);
    console.log(`Total trials in database: ${totalCount}`);

    // Get Health Canada count
    const hcResult = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'HC%'");
    const hcCount = parseInt(hcResult.rows[0].count, 10);
    console.log(`Health Canada trials: ${hcCount}`);

    // Get ClinicalTrials.gov count
    const ctgResult = await pool.query("SELECT COUNT(*) FROM csr_reports WHERE title LIKE 'NCT%'");
    const ctgCount = parseInt(ctgResult.rows[0].count, 10);
    console.log(`ClinicalTrials.gov trials: ${ctgCount}`);

    // Get other sources count
    const otherCount = totalCount - hcCount - ctgCount;
    console.log(`Trials from other sources: ${otherCount}`);

    // Get top 10 indications
    console.log('\n=== Top 10 Indications ===');
    const indicationsResult = await pool.query(`
      SELECT indication, COUNT(*) as count
      FROM csr_reports
      WHERE indication IS NOT NULL
      GROUP BY indication
      ORDER BY count DESC
      LIMIT 10
    `);

    indicationsResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.indication}: ${row.count}`);
    });

    // Get phase distribution
    console.log('\n=== Phase Distribution ===');
    const phaseResult = await pool.query(`
      SELECT phase, COUNT(*) as count
      FROM csr_reports
      WHERE phase IS NOT NULL
      GROUP BY phase
      ORDER BY count DESC
    `);

    phaseResult.rows.forEach(row => {
      console.log(`${row.phase}: ${row.count}`);
    });

    // Get sponsor distribution
    console.log('\n=== Top 10 Sponsors ===');
    const sponsorResult = await pool.query(`
      SELECT sponsor, COUNT(*) as count
      FROM csr_reports
      WHERE sponsor IS NOT NULL
      GROUP BY sponsor
      ORDER BY count DESC
      LIMIT 10
    `);

    sponsorResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.sponsor}: ${row.count}`);
    });

    // Get progress to 4000 target
    const target = 4000;
    const progress = (totalCount / target) * 100;
    console.log(`\n=== Progress to Target ===`);
    console.log(`Target: ${target} trials`);
    console.log(`Current: ${totalCount} trials`);
    console.log(`Progress: ${progress.toFixed(2)}%`);
    console.log(`Remaining: ${Math.max(0, target - totalCount)} trials`);

    return {
      total: totalCount,
      healthCanada: hcCount,
      clinicalTrials: ctgCount,
      other: otherCount,
      progress: progress,
    };
  } catch (error) {
    console.error('Error verifying trial counts:', error);
    return null;
  } finally {
    await pool.end();
  }
}

// Run the function
getTrialCounts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
