/**
 * FAERS Database Service
 *
 * This service handles database operations for FAERS data,
 * including storing reports and retrieving cached analyses.
 */

const { Pool } = require('pg');

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

/**
 * Save FAERS reports to the database
 *
 * @param {Array} reports - Array of FAERS reports
 * @returns {Promise<number>} - Number of reports saved
 */
async function saveReports(reports) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let savedCount = 0;
    for (const report of reports) {
      const query = `
        INSERT INTO faers_reports (
          product_name, substance_name, unii_code, reaction,
          is_serious, outcome_type, report_date, patient_age, patient_sex, report_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
        RETURNING id
      `;

      const values = [
        report.substance || report.productName,
        report.substanceName,
        report.unii,
        report.reaction,
        report.is_serious,
        report.outcome,
        report.report_date,
        report.age ? parseInt(report.age) : null,
        report.sex,
        report.reportId || `FAERS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ];

      const result = await client.query(query, values);
      if (result.rows.length > 0) {
        savedCount++;
      }
    }

    await client.query('COMMIT');
    return savedCount;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving FAERS reports:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Save a cached analysis for faster retrieval
 *
 * @param {Object} analysis - Analysis data
 * @returns {Promise<Object>} - Saved analysis object
 */
async function saveCachedAnalysis(analysis) {
  const query = `
    INSERT INTO faers_cached_analyses (
      product_name, total_reports, serious_events,
      risk_score, severity_assessment, top_reactions,
      demographics, report_summary, cache_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (product_name) 
    DO UPDATE SET 
      total_reports = $2,
      serious_events = $3,
      risk_score = $4,
      severity_assessment = $5,
      top_reactions = $6,
      demographics = $7,
      report_summary = $8,
      cache_expires_at = $9,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  // Set cache to expire in 7 days
  const cacheExpires = new Date();
  cacheExpires.setDate(cacheExpires.getDate() + 7);

  const values = [
    analysis.productName,
    analysis.totalReports,
    analysis.seriousEvents?.length || 0,
    analysis.riskScore,
    analysis.severityAssessment,
    JSON.stringify(analysis.reactionCounts || []),
    JSON.stringify(analysis.demographics || {}),
    `${analysis.productName} demonstrated a ${analysis.severityAssessment.toLowerCase()} risk profile with ${analysis.seriousEvents?.length || 0} serious events reported out of ${analysis.totalReports} total reports.`,
    cacheExpires,
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Get reports for a specific product from the database
 *
 * @param {string} productName - Product name to search for
 * @param {Object} options - Search options
 * @returns {Promise<Array>} - Array of reports
 */
async function getReportsByProduct(productName, options = {}) {
  const { limit = 100, includeSerious = true } = options;

  let query = `
    SELECT * FROM faers_reports 
    WHERE product_name ILIKE $1
  `;

  const params = [`%${productName}%`];

  if (!includeSerious) {
    query += ` AND is_serious = false`;
  }

  query += ` ORDER BY report_date DESC LIMIT $2`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get a cached analysis for a product if available
 *
 * @param {string} productName - Product name
 * @returns {Promise<Object>} - Cached analysis or null if not found/expired
 */
async function getCachedAnalysis(productName) {
  const query = `
    SELECT * FROM faers_cached_analyses 
    WHERE product_name = $1 
    AND cache_expires_at > CURRENT_TIMESTAMP
  `;

  const result = await pool.query(query, [productName]);
  if (result.rows.length > 0) {
    const cachedData = result.rows[0];
    return {
      ...cachedData,
      top_reactions: JSON.parse(cachedData.top_reactions),
      demographics: JSON.parse(cachedData.demographics),
    };
  }

  return null;
}

/**
 * Initialize the database tables if they don't exist
 */
async function initializeTables() {
  const client = await pool.connect();
  try {
    // Check if tables exist
    const checkResult = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'faers_reports'
      );
    `);

    const tablesExist = checkResult.rows[0].exists;

    if (!tablesExist) {
      console.log('FAERS tables do not exist. Creating schema...');

      // Read and execute the schema SQL
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../../sql/faers_schema.sql');

      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSQL);
        console.log('FAERS database schema created successfully.');
      } else {
        console.error('FAERS schema file not found:', schemaPath);
      }
    }
  } catch (error) {
    console.error('Error initializing FAERS tables:', error);
  } finally {
    client.release();
  }
}

// Initialize tables when service is loaded
initializeTables().catch(console.error);

module.exports = {
  saveReports,
  saveCachedAnalysis,
  getReportsByProduct,
  getCachedAnalysis,
};
