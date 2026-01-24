/**
 * Import 50 More Health Canada CSRs Script
 *
 * This script imports 50 additional CSRs from Health Canada's database,
 * focusing on the most recent submissions to ensure up-to-date data.
 * It tracks progress and avoids duplicates by checking against existing records.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Tracking file for progress
const TRACKING_FILE = 'health_canada_csr_import_progress.json';

// Initialize tracking data
function getTrackingData() {
  if (fs.existsSync(TRACKING_FILE)) {
    return JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
  }
  return {
    lastImportDate: new Date().toISOString(),
    totalImported: 0,
    lastOffset: 0,
    processedIds: [],
  };
}

// Save tracking data
function saveTrackingData(data) {
  fs.writeFileSync(TRACKING_FILE, JSON.stringify(data, null, 2));
  console.log('Progress saved to tracking file');
}

// Check if a CSR already exists in the database
async function checkCSRExists(client, csrId) {
  const result = await client.query('SELECT id FROM csr_documents WHERE external_id = $1', [csrId]);
  return result.rows.length > 0;
}

// Fetch CSRs from Health Canada API
async function fetchHealthCanadaCSRs(offset = 0, limit = 50) {
  const url = `${process.env.HEALTH_CANADA_API_URL}/clinical-documents`;

  try {
    console.log(`Fetching CSRs from Health Canada API: offset=${offset}, limit=${limit}`);

    const response = await axios.get(url, {
      params: {
        offset,
        limit,
        sort_by: 'date',
        sort_order: 'desc',
        doc_type: 'csr',
      },
      headers: {
        Authorization: `Bearer ${process.env.HEALTH_CANADA_API_KEY}`,
        Accept: 'application/json',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching CSRs from Health Canada:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    throw error;
  }
}

// Download PDF for a CSR
async function downloadCSRPdf(csrId, fileName) {
  const url = `${process.env.HEALTH_CANADA_API_URL}/clinical-documents/${csrId}/pdf`;
  const outputPath = path.join('downloads', 'health_canada_csrs', fileName);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    console.log(`Downloading PDF for CSR ${csrId} to ${outputPath}`);

    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      headers: {
        Authorization: `Bearer ${process.env.HEALTH_CANADA_API_KEY}`,
      },
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading PDF for CSR ${csrId}:`, error.message);
    throw error;
  }
}

// Process and import a single CSR
async function processCSR(client, csr) {
  try {
    console.log(`Processing CSR ${csr.id}: ${csr.title}`);

    // Check if this CSR already exists
    const exists = await checkCSRExists(client, csr.id);
    if (exists) {
      console.log(`CSR ${csr.id} already exists in database, skipping`);
      return false;
    }

    // Download PDF if available
    let pdfPath = null;
    if (csr.has_pdf) {
      const fileName = `hc_csr_${csr.id}.pdf`;
      pdfPath = await downloadCSRPdf(csr.id, fileName);
    }

    // Prepare data for database insertion
    const csrData = {
      external_id: csr.id,
      title: csr.title,
      sponsor: csr.sponsor,
      study_id: csr.study_id || null,
      therapeutic_area: csr.therapeutic_area || 'Not specified',
      phase: csr.phase || null,
      submission_date: csr.submission_date ? new Date(csr.submission_date) : null,
      approval_date: csr.approval_date ? new Date(csr.approval_date) : null,
      pdf_path: pdfPath,
      source: 'Health Canada',
      metadata: JSON.stringify(csr),
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Insert into database
    await client.query(
      `INSERT INTO csr_documents 
       (external_id, title, sponsor, study_id, therapeutic_area, phase, 
        submission_date, approval_date, pdf_path, source, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        csrData.external_id,
        csrData.title,
        csrData.sponsor,
        csrData.study_id,
        csrData.therapeutic_area,
        csrData.phase,
        csrData.submission_date,
        csrData.approval_date,
        csrData.pdf_path,
        csrData.source,
        csrData.metadata,
        csrData.created_at,
        csrData.updated_at,
      ]
    );

    console.log(`Successfully imported CSR ${csr.id}`);
    return true;
  } catch (error) {
    console.error(`Error processing CSR ${csr.id}:`, error);
    return false;
  }
}

// Main function to import 50 CSRs
async function importFiftyMoreCSRs() {
  console.log('Starting import of 50 more Health Canada CSRs');

  // Get tracking data
  const trackingData = getTrackingData();
  console.log(`Previous import: ${trackingData.totalImported} CSRs imported`);

  // Connect to database
  const client = await pool.connect();

  try {
    // Start transaction
    await client.query('BEGIN');

    let importedCount = 0;
    let currentOffset = trackingData.lastOffset;

    // Keep fetching until we get 50 new CSRs
    while (importedCount < 50) {
      // Fetch batch of CSRs
      const result = await fetchHealthCanadaCSRs(currentOffset, 25);

      if (!result.documents || result.documents.length === 0) {
        console.log('No more CSRs available from Health Canada API');
        break;
      }

      // Process each CSR
      for (const csr of result.documents) {
        // Skip if we've already processed this ID
        if (trackingData.processedIds.includes(csr.id)) {
          console.log(`Skipping already processed CSR ${csr.id}`);
          continue;
        }

        const imported = await processCSR(client, csr);

        if (imported) {
          importedCount++;
          console.log(`Progress: ${importedCount}/50 CSRs imported`);

          // Track this ID
          trackingData.processedIds.push(csr.id);

          // Save progress after each successful import
          trackingData.totalImported++;
          trackingData.lastImportDate = new Date().toISOString();
          saveTrackingData(trackingData);

          // Check if we've reached our target
          if (importedCount >= 50) {
            break;
          }
        }
      }

      // Move to next batch
      currentOffset += result.documents.length;
      trackingData.lastOffset = currentOffset;
      saveTrackingData(trackingData);
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log(`Import completed successfully. ${importedCount} new CSRs imported.`);

    // Final update to tracking data
    trackingData.lastImportDate = new Date().toISOString();
    saveTrackingData(trackingData);
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during import:', error);
    throw error;
  } finally {
    // Release client
    client.release();
    console.log('Database connection closed');
  }
}

// Check for Health Canada API key before running
function checkRequiredEnvVars() {
  const required = ['DATABASE_URL', 'HEALTH_CANADA_API_URL', 'HEALTH_CANADA_API_KEY'];
  const missing = required.filter(name => !process.env[name]);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please check your .env file and try again');
    return false;
  }

  return true;
}

// Run the import if executed directly
if (require.main === module) {
  if (checkRequiredEnvVars()) {
    importFiftyMoreCSRs()
      .then(() => {
        console.log('Import script completed successfully');
        process.exit(0);
      })
      .catch(error => {
        console.error('Import script failed:', error);
        process.exit(1);
      });
  } else {
    process.exit(1);
  }
}

module.exports = {
  importFiftyMoreCSRs,
};
