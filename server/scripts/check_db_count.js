import { db } from '../db.js';
import { csrReports } from 'shared/schema.ts';
import { sql } from 'drizzle-orm';

async function checkDatabaseCounts() {
  try {
    // Get count of reports
    const reportCount = await db.select({ count: sql`count(*)` }).from(csrReports);

    console.log(`Total clinical trial records in database: ${reportCount[0].count}`);

    // Get count by indication
    const indicationCounts = await db
      .select({
        indication: csrReports.indication,
        count: sql`count(*)`,
      })
      .from(csrReports)
      .groupBy(csrReports.indication)
      .orderBy(sql`count(*) desc`)
      .limit(10);

    console.log('\nTop 10 indications:');
    indicationCounts.forEach(row => {
      console.log(`${row.indication}: ${row.count} records`);
    });
  } catch (error) {
    console.error('Error checking database counts:', error);
  }
}

// Run the check
checkDatabaseCounts()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
