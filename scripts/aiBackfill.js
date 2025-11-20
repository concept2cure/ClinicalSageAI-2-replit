/**
 * Document Intelligence Suite v8: AI Back-fill CLI
 *
 * This script is responsible for re-embedding all documents in the system
 * with the latest embedding model. It can be run manually or scheduled
 * via a cron job to ensure all documents maintain up-to-date vector embeddings.
 */

import fs from 'fs';
import path from 'path';
import { pool } from '../server/db.js';
import aiUtils from '../server/services/aiUtils.js';

// Configuration
const DOCUMENTS_DIR = path.join(process.cwd(), 'uploads');
const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'backfill.log');
const PDF_PARSE_TIMEOUT = 60000; // 60 seconds timeout for PDF parsing
let pdfParse;

try {
  // Dynamically import pdf-parse to handle potential import issues
  import('pdf-parse').then(module => {
    pdfParse = module.default;
  });
} catch (error) {
  console.error('Error importing pdf-parse:', error.message);
}

/**
 * Setup logging
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);

  // Ensure log directory exists
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  // Append to log file
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

/**
 * Extract text from a PDF file
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPdf(filePath) {
  if (!pdfParse) {
    throw new Error('PDF parser not available');
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);

    // Set up a promise with timeout
    const parsePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`PDF parsing timed out after ${PDF_PARSE_TIMEOUT / 1000} seconds`));
      }, PDF_PARSE_TIMEOUT);

      pdfParse(dataBuffer)
        .then(data => {
          clearTimeout(timeout);
          resolve(data.text);
        })
        .catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
    });

    return await parsePromise;
  } catch (error) {
    log(`Error extracting text from PDF ${filePath}: ${error.message}`);
    return '';
  }
}

/**
 * Update document embedding in the database
 *
 * @param {object} client - Database client
 * @param {number} documentId - Document ID
 * @param {number[]} embedding - Vector embedding
 * @returns {Promise<void>}
 */
async function updateDocumentEmbedding(client, documentId, embedding) {
  const updateQuery = `
    UPDATE documents 
    SET embedding = $1, 
        last_embedded_at = NOW() 
    WHERE id = $2
  `;

  await client.query(updateQuery, [JSON.stringify(embedding), documentId]);
}

/**
 * Process a document to update its embedding
 *
 * @param {object} document - Document metadata
 * @returns {Promise<boolean>} - Success status
 */
async function processDocument(document) {
  const filePath = path.join(DOCUMENTS_DIR, document.file_path);

  if (!fs.existsSync(filePath)) {
    log(`File not found: ${filePath}`);
    return false;
  }

  try {
    // Extract text from document
    let text = '';
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      text = await extractTextFromPdf(filePath);
    } else {
      // For non-PDF files, read directly as text
      text = fs.readFileSync(filePath, 'utf8');
    }

    if (!text || text.trim().length === 0) {
      log(`No text extracted from document: ${document.id} - ${document.title}`);
      return false;
    }

    // Generate embedding
    const embedding = await aiUtils.embed(text);

    // Update database
    const client = await pool.connect();
    try {
      await updateDocumentEmbedding(client, document.id, embedding);
      log(`Updated embedding for document: ${document.id} - ${document.title}`);
      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    log(`Error processing document ${document.id}: ${error.message}`);
    return false;
  }
}

/**
 * Main backfill function
 *
 * @returns {Promise<void>}
 */
export async function backfill() {
  log('Starting document backfill process');

  let client;
  try {
    client = await pool.connect();

    // Get all documents that need embedding updates
    // This includes documents that have never been embedded or were embedded more than 30 days ago
    const query = `
      SELECT id, title, file_path, created_at, last_embedded_at
      FROM documents
      WHERE last_embedded_at IS NULL OR last_embedded_at < NOW() - INTERVAL '30 days'
      ORDER BY created_at DESC
    `;

    const result = await client.query(query);
    const documents = result.rows;

    log(`Found ${documents.length} documents that need embedding updates`);

    // Process documents in batches to avoid memory issues
    const BATCH_SIZE = 10;
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(documents.length / BATCH_SIZE)}`
      );

      // Process batch with concurrency control
      const results = await Promise.all(batch.map(doc => processDocument(doc)));

      // Count successes and failures
      results.forEach(success => {
        if (success) successCount++;
        else failureCount++;
      });

      // Small delay between batches to prevent rate limiting
      if (i + BATCH_SIZE < documents.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    log(`Backfill completed. Success: ${successCount}, Failures: ${failureCount}`);
    return { success: successCount, failure: failureCount };
  } catch (error) {
    log(`Backfill process error: ${error.message}`);
    throw error;
  } finally {
    if (client) client.release();
  }
}

/**
 * Command line entry point
 */
if (require.main === module) {
  backfill()
    .then(() => {
      log('Backfill script completed');
      process.exit(0);
    })
    .catch(error => {
      log(`Backfill script failed: ${error.message}`);
      process.exit(1);
    });
}
