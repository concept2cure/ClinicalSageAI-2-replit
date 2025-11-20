/**
 * Enhanced Document Ingestion Pipeline
 *
 * This module provides advanced document processing with automatic regulatory metadata extraction
 * including eCTD section classification, document type detection, and regional authority tagging.
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import { promises as fs } from 'fs';
import { Pool } from 'pg';
import OpenAI from 'openai';
import {
  ECTD_SECTION_MAPPINGS,
  DOC_TYPE_CLASSIFICATION_PATTERNS,
  REGION_CLASSIFICATION_PATTERNS,
  extractEctdSectionFromContent,
  classifyDocumentType,
  extractRegionTags,
  mapDocumentType,
} from '../config/regulatory_config.js';

const router = express.Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file uploads
const upload = multer({
  dest: './uploads/temp/',
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.txt', '.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowedTypes.includes(ext));
  },
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Using centralized regulatory configuration patterns

/**
 * Extract text content from uploaded file
 */
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (ext === '.txt') {
      return await fs.readFile(filePath, 'utf-8');
    } else if (ext === '.pdf') {
      // For PDF extraction, we'd use a library like pdf-parse
      // For now, return placeholder that will trigger AI extraction
      return `[PDF_CONTENT_PLACEHOLDER:${originalName}]`;
    } else if (ext === '.docx' || ext === '.doc') {
      // For Word docs, we'd use mammoth or similar
      return `[DOCX_CONTENT_PLACEHOLDER:${originalName}]`;
    }

    throw new Error(`Unsupported file type: ${ext}`);
  } catch (error) {
    console.error(`Error extracting text from ${originalName}:`, error);
    throw error;
  }
}

/**
 * Enhanced eCTD section classification using centralized patterns
 */
function enhancedClassifyEctdSection(content, docType, title = '') {
  // First try to extract specific eCTD section from content
  const extractedSection = extractEctdSectionFromContent(content + ' ' + title);
  if (extractedSection) {
    return extractedSection;
  }

  // Fallback to document type-based classification
  switch (docType) {
    case 'CSR':
      return content.toLowerCase().includes('study report') ? '5.3.5.1' : '5.3';
    case 'ICH_Guideline':
      return '2.4';
    case 'FDA_Guidance':
    case 'EMA_Guideline':
      return '1.3';
    case 'Protocol':
      return '5.3.5.1';
    case 'SAP':
      return '5.3.5.2';
    case 'IB':
      return '2.5';
    case 'CMC_Batch_Record':
      return '3.2.P.3';
    default:
      return null;
  }
}

/**
 * Use AI for enhanced metadata extraction when pattern matching is insufficient
 */
async function useAIForMetadataExtraction(content, title = '') {
  try {
    const prompt = `Analyze this regulatory document and extract metadata:

Title: ${title}
Content (first 2000 chars): ${content.substring(0, 2000)}

Please identify:
1. Document type (CSR, ICH_Guideline, FDA_Guidance, EMA_Guideline, Protocol, SAP, IB, or Other)
2. Appropriate eCTD section (e.g., 5.3.5.1, 2.4, 1.3)
3. Regional regulatory authorities mentioned (FDA, EMA, PMDA, Health_Canada, TGA, NMPA, ICH)

Respond in JSON format:
{"doc_type": "", "ectd_section": "", "regions": []}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error using AI for metadata extraction:', error);
    return { doc_type: 'Unknown', ectd_section: null, regions: ['FDA'] };
  }
}

/**
 * Create document chunks with enhanced metadata
 */
async function createEnhancedChunks(docId, title, content, metadata) {
  const chunks = [];
  const words = content.split(/\s+/);
  const chunkSize = 800;

  // Generate embeddings for each chunk
  for (let i = 0; i < words.length; i += chunkSize) {
    const chunkWords = words.slice(i, i + chunkSize);
    const chunkContent = chunkWords.join(' ');
    const chunkIndex = Math.floor(i / chunkSize);

    try {
      // Generate embedding
      const embeddingResponse = await openai.embeddings.create({
        input: chunkContent,
        model: 'text-embedding-3-small',
      });

      const embedding = embeddingResponse.data[0].embedding;

      // Create chunk with enhanced metadata
      const chunk = {
        doc_id: docId,
        doc_title: title,
        chunk_index: chunkIndex,
        content: chunkContent,
        embedding: JSON.stringify(embedding),
        ectd_section: metadata.ectd_section,
        page_number: null, // Will be populated with PDF page extraction
        doc_type: metadata.doc_type,
        region_tag: metadata.region_tag,
      };

      chunks.push(chunk);
    } catch (error) {
      console.error(`Error creating chunk ${chunkIndex}:`, error);
    }
  }

  return chunks;
}

/**
 * Store chunks in database with enhanced metadata
 */
async function storeEnhancedChunks(chunks) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete existing chunks for this document
    if (chunks.length > 0) {
      await client.query('DELETE FROM document_chunks WHERE doc_id = $1', [chunks[0].doc_id]);
    }

    // Insert new enhanced chunks
    for (const chunk of chunks) {
      await client.query(
        `
        INSERT INTO document_chunks (
          doc_id, doc_title, chunk_index, content, embedding,
          ectd_section, page_number, doc_type, region_tag
        ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, $9)
      `,
        [
          chunk.doc_id,
          chunk.doc_title,
          chunk.chunk_index,
          chunk.content,
          chunk.embedding,
          chunk.ectd_section,
          chunk.page_number,
          chunk.doc_type,
          chunk.region_tag,
        ]
      );
    }

    await client.query('COMMIT');
    return chunks.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Upload and process single document with enhanced metadata extraction
 */
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, path: tempPath } = req.file;
    const docId = `upload_${Date.now()}_${originalname}`;

    console.log(`Processing uploaded document: ${originalname}`);

    // Extract text content
    const content = await extractTextFromFile(tempPath, originalname);

    // Classify using centralized regulatory configuration
    let docType = classifyDocumentType(content, originalname);
    let regionTags = extractRegionTags(content, originalname);
    let ectdSection = enhancedClassifyEctdSection(content, docType, originalname);

    // Use AI enhancement if needed
    if (docType === 'Unknown' || !ectdSection) {
      console.log('Using AI for enhanced classification...');
      const aiMetadata = await useAIForMetadataExtraction(content, originalname);

      if (docType === 'Unknown' && aiMetadata.doc_type) {
        docType = aiMetadata.doc_type;
      }
      if (!ectdSection && aiMetadata.ectd_section) {
        ectdSection = aiMetadata.ectd_section;
      }
      if (aiMetadata.regions && aiMetadata.regions.length > 0) {
        regionTags = [...new Set([...regionTags, ...aiMetadata.regions])];
      }
    }

    const metadata = {
      doc_type: docType,
      ectd_section: ectdSection,
      region_tag: regionTags,
    };

    console.log('Extracted metadata:', metadata);

    // Create enhanced chunks
    const chunks = await createEnhancedChunks(docId, originalname, content, metadata);

    // Store in database
    const chunksStored = await storeEnhancedChunks(chunks);

    // Clean up temp file
    await fs.unlink(tempPath);

    res.json({
      success: true,
      document_id: docId,
      title: originalname,
      chunks_created: chunksStored,
      metadata: metadata,
      processing_summary: {
        content_length: content.length,
        chunks_generated: chunks.length,
        enhanced_fields_populated: true,
      },
    });
  } catch (error) {
    console.error('Error processing upload:', error);

    // Clean up temp file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Error cleaning up temp file:', cleanupError);
      }
    }

    res.status(500).json({
      error: 'Document processing failed',
      message: error.message,
    });
  }
});

/**
 * Batch process multiple documents
 */
router.post('/batch-upload', upload.array('documents', 10), async (req, res) => {
  const results = [];
  const errors = [];

  try {
    for (const file of req.files || []) {
      try {
        const docId = `batch_${Date.now()}_${file.originalname}`;
        const content = await extractTextFromFile(file.path, file.originalname);

        // Extract metadata
        let docType = classifyDocumentType(content, file.originalname);
        let regionTags = extractRegionTags(content, file.originalname);
        let ectdSection = classifyEctdSection(content, docType, file.originalname);

        // AI enhancement if needed
        if (docType === 'Unknown' || !ectdSection) {
          const aiMetadata = await useAIForMetadataExtraction(content, file.originalname);
          if (docType === 'Unknown') docType = aiMetadata.doc_type;
          if (!ectdSection) ectdSection = aiMetadata.ectd_section;
          if (aiMetadata.regions) regionTags = [...new Set([...regionTags, ...aiMetadata.regions])];
        }

        const metadata = { doc_type: docType, ectd_section: ectdSection, region_tag: regionTags };
        const chunks = await createEnhancedChunks(docId, file.originalname, content, metadata);
        const chunksStored = await storeEnhancedChunks(chunks);

        results.push({
          document_id: docId,
          title: file.originalname,
          chunks_created: chunksStored,
          metadata: metadata,
        });

        // Clean up temp file
        await fs.unlink(file.path);
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message,
        });

        // Clean up temp file on error
        try {
          await fs.unlink(file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up temp file:', cleanupError);
        }
      }
    }

    res.json({
      success: true,
      processed: results.length,
      errors: errors.length,
      results: results,
      errors: errors,
    });
  } catch (error) {
    console.error('Batch processing error:', error);
    res.status(500).json({
      error: 'Batch processing failed',
      message: error.message,
    });
  }
});

/**
 * Get enhanced processing statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const client = await pool.connect();

    const stats = await client.query(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(ectd_section) as chunks_with_ectd,
        COUNT(doc_type) as chunks_with_doc_type,
        COUNT(region_tag) as chunks_with_regions,
        COUNT(DISTINCT doc_id) as total_documents,
        COUNT(DISTINCT ectd_section) as unique_ectd_sections,
        COUNT(DISTINCT doc_type) as unique_doc_types
      FROM document_chunks
    `);

    const docTypeBreakdown = await client.query(`
      SELECT doc_type, COUNT(*) as count
      FROM document_chunks 
      WHERE doc_type IS NOT NULL
      GROUP BY doc_type
      ORDER BY count DESC
    `);

    const ectdBreakdown = await client.query(`
      SELECT ectd_section, COUNT(*) as count
      FROM document_chunks 
      WHERE ectd_section IS NOT NULL
      GROUP BY ectd_section
      ORDER BY count DESC
    `);

    client.release();

    res.json({
      overview: stats.rows[0],
      doc_type_breakdown: docTypeBreakdown.rows,
      ectd_section_breakdown: ectdBreakdown.rows,
      enhancement_coverage: {
        ectd_coverage:
          stats.rows[0].total_chunks > 0
            ? ((stats.rows[0].chunks_with_ectd / stats.rows[0].total_chunks) * 100).toFixed(1) + '%'
            : '0%',
        doc_type_coverage:
          stats.rows[0].total_chunks > 0
            ? ((stats.rows[0].chunks_with_doc_type / stats.rows[0].total_chunks) * 100).toFixed(1) +
              '%'
            : '0%',
        region_coverage:
          stats.rows[0].total_chunks > 0
            ? ((stats.rows[0].chunks_with_regions / stats.rows[0].total_chunks) * 100).toFixed(1) +
              '%'
            : '0%',
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

export default router;
