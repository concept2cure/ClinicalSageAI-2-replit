/**
 * Test script for continuous CSR upload functionality
 *
 * This script will check the database for recent imports and verify
 * that the continuous upload service is working correctly
 */

import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function checkUploadProgress() {
  logger.info('Checking continuous upload progress...');

  // Connect to database
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    // Get total trial count
    const countResult = await client.query('SELECT COUNT(*) FROM trials');
    const totalTrials = parseInt(countResult.rows[0].count);

    // Get count by source
    const sourceResult = await client.query(
      'SELECT source, COUNT(*) FROM trials GROUP BY source ORDER BY COUNT(*) DESC'
    );

    // Get recent imports (last 24 hours)
    const recentResult = await client.query(
      "SELECT COUNT(*) FROM trials WHERE imported_date > NOW() - INTERVAL '24 HOURS'"
    );
    const recentImports = parseInt(recentResult.rows[0].count);

    // Check if there are processing files
    let processingInfo = 'No processing data found';
    try {
      if (fs.existsSync('continuous_upload_progress.json')) {
        const progressData = JSON.parse(fs.readFileSync('continuous_upload_progress.json', 'utf8'));
        processingInfo = `Last run: ${progressData.lastRun || 'Never'}, Total imported: ${progressData.totalImported}`;
      }
    } catch (error) {
      processingInfo = `Error reading progress file: ${error.message}`;
    }

    // Display results
    logger.info(`\n=== CSR Upload Statistics ===`);
    logger.info(`Total trials in database: ${totalTrials}`);
    logger.info(`Recent imports (24h): ${recentImports}`);
    logger.info(`Continuous upload status: ${processingInfo}`);
    logger.info('\nBreakdown by source:');

    sourceResult.rows.forEach(row => {
      logger.info(`- ${row.source}: ${row.count} trials`);
    });

    logger.info('\nTest complete!');
  } catch (error) {
    logger.error('Error checking upload progress:', error);
  } finally {
    await client.end();
  }
}

// Run the test
checkUploadProgress().catch(console.error);
