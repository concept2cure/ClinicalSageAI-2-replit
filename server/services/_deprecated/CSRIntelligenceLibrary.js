/**
 * CSR INTELLIGENCE LIBRARY - HARD-WIRED DATA GOVERNANCE
 *
 * This service provides the canonical, hard-wired data flow for ALL CSR-related
 * ingestion, parsing, and semantic data management. All CSR operations must
 * flow through this centralized intelligence library.
 *
 * CORE PRINCIPLE: CSR documents have a dual-storage pattern:
 * 1. Full document content -> unified_documents (with document_type='CSR', module='csr')
 * 2. Structured intelligence -> csr_reports + csr_details (CSR Intelligence Library)
 *
 * This service ensures both storage layers are populated and linked properly.
 */

import { pool } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import PDFParser from 'pdf-parse';
// import mammoth from 'mammoth'; // Temporarily disabled for IND templates focus
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class CSRIntelligenceLibrary {
  constructor() {
    this.processingQueue = new Map();
    this.extractionTemplates = {
      indication: /(?:indication|disease|condition|disorder)[:\s]*([^\n\r.]+)/gi,
      phase: /(?:phase|stage)[:\s]*([I1-4]+|[123])/gi,
      sampleSize: /(?:sample size|n\s*=|enrolled|randomized)[:\s]*(\d+)/gi,
      sponsor: /(?:sponsor|company|organization)[:\s]*([^\n\r.]+)/gi,
      endpoints: /(?:primary|secondary)?\s*endpoint[s]?[:\s]*([^\n\r.]+)/gi,
      duration: /(?:duration|follow.?up|treatment period)[:\s]*(\d+)\s*(week|month|year)s?/gi,
      studyDesign: /(?:design|methodology|study type)[:\s]*([^\n\r.]+)/gi,
    };
  }

  /**
   * MAIN ENTRY POINT: Hard-wired CSR ingestion pipeline
   * This is the ONLY method that should be called for CSR document ingestion
   */
  async ingestCSRDocument(options) {
    const {
      filePath,
      fileName,
      fileBuffer,
      mimeType,
      tenantId,
      userId,
      module = 'csr',
      context = 'CSR Intelligence Library Ingestion',
    } = options;

    console.log(`[CSR Intelligence Library] Starting hard-wired ingestion for: ${fileName}`);

    try {
      // Generate unique processing ID for this ingestion
      const processingId = uuidv4();
      const contentHash = this.generateContentHash(fileBuffer || filePath);

      // STEP 1: Extract and process document content
      const extractedContent = await this.extractDocumentContent(filePath, fileBuffer, mimeType);

      // STEP 2: Perform AI-driven CSR-specific analysis
      const csrAnalysis = await this.performCSRAnalysis(extractedContent, fileName);

      // STEP 3: Store in unified_documents (full document storage)
      const unifiedDocumentId = await this.storeInUnifiedDocuments({
        processingId,
        fileName,
        filePath,
        fileBuffer,
        mimeType,
        extractedContent,
        csrAnalysis,
        contentHash,
        tenantId,
        userId,
        module,
        context,
      });

      // STEP 4: Store in CSR Intelligence Library (structured intelligence)
      const csrReportId = await this.storeInCSRIntelligenceLibrary({
        unifiedDocumentId,
        fileName,
        filePath,
        extractedContent,
        csrAnalysis,
        tenantId,
        userId,
      });

      // STEP 5: Create explicit link between unified_documents and CSR Intelligence Library
      await this.createCSRIntelligenceLink(unifiedDocumentId, csrReportId);

      // STEP 6: Audit trail
      await this.logCSRIngestionComplete(
        processingId,
        unifiedDocumentId,
        csrReportId,
        tenantId,
        userId
      );

      console.log(`[CSR Intelligence Library] Hard-wired ingestion complete:`, {
        unifiedDocumentId,
        csrReportId,
        processingId,
      });

      return {
        success: true,
        processingId,
        unifiedDocumentId,
        csrReportId,
        intelligence: csrAnalysis,
        message: 'CSR document successfully ingested into Intelligence Library',
      };
    } catch (error) {
      console.error(`[CSR Intelligence Library] Ingestion failed:`, error);
      throw new Error(`CSR Intelligence Library ingestion failed: ${error.message}`);
    }
  }

  /**
   * Extract content from CSR document (PDF, DOCX, etc.)
   */
  async extractDocumentContent(filePath, fileBuffer, mimeType) {
    let content = '';
    let extractedText = '';

    try {
      if (mimeType === 'application/pdf') {
        const buffer = fileBuffer || fs.readFileSync(filePath);
        const pdfData = await PDFParser(buffer);
        extractedText = pdfData.text;
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const buffer = fileBuffer || fs.readFileSync(filePath);
        // const result = await mammoth.extractRawText({ buffer }); // Temporarily disabled
        // extractedText = result.value; // Temporarily disabled
        extractedText = 'Word document processing temporarily disabled'; // Fallback
      } else {
        extractedText = fileBuffer
          ? fileBuffer.toString('utf8')
          : fs.readFileSync(filePath, 'utf8');
      }

      // Clean and normalize text
      content = extractedText
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();

      return {
        fullText: content,
        extractedText,
        wordCount: content.split(/\s+/).length,
        pageCount: extractedText.split('\f').length || 1,
      };
    } catch (error) {
      console.error('Content extraction failed:', error);
      return {
        fullText: '',
        extractedText: '',
        wordCount: 0,
        pageCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * AI-driven CSR analysis with structured intelligence extraction
   */
  async performCSRAnalysis(extractedContent, fileName) {
    const { fullText } = extractedContent;

    // Extract basic metadata using patterns
    const basicMetadata = this.extractBasicMetadata(fullText);

    // Enhanced AI analysis for complex extraction
    let aiAnalysis = {};

    try {
      if (process.env.OPENAI_API_KEY && fullText.length > 100) {
        const prompt = `
Analyze this Clinical Study Report (CSR) and extract structured information:

Document: ${fileName}
Content: ${fullText.substring(0, 4000)}...

Extract and return JSON with:
{
  "indication": "primary disease/condition",
  "phase": "study phase (Phase I, II, III, IV)",
  "sponsor": "sponsoring organization",
  "drugName": "investigational product name",
  "studyDesign": "study design description",
  "sampleSize": number,
  "duration": "study duration",
  "primaryEndpoint": "primary endpoint description",
  "secondaryEndpoints": ["secondary endpoint 1", "secondary endpoint 2"],
  "inclusionCriteria": ["criteria 1", "criteria 2"],
  "exclusionCriteria": ["criteria 1", "criteria 2"],
  "adverseEvents": "summary of adverse events",
  "efficacyResults": "summary of efficacy results",
  "conclusions": "study conclusions",
  "regulatoryStatus": "regulatory approval status",
  "studyId": "study identifier (NCT, etc.)",
  "region": "regulatory region (FDA, EMA, etc.)"
}

Only return valid JSON.`;

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
          temperature: 0.3,
        });

        const aiContent = response.choices[0].message.content;
        if (aiContent) {
          try {
            aiAnalysis = JSON.parse(aiContent);
          } catch (parseError) {
            console.warn('AI analysis JSON parsing failed, using basic metadata');
            aiAnalysis = basicMetadata;
          }
        }
      } else {
        aiAnalysis = basicMetadata;
      }
    } catch (error) {
      console.warn('AI analysis failed, using basic metadata:', error.message);
      aiAnalysis = basicMetadata;
    }

    return {
      ...basicMetadata,
      ...aiAnalysis,
      analysisTimestamp: new Date().toISOString(),
      contentLength: fullText.length,
      analysisConfidence: aiAnalysis.indication && aiAnalysis.phase ? 'high' : 'medium',
    };
  }

  /**
   * Extract basic metadata using pattern matching
   */
  extractBasicMetadata(text) {
    const metadata = {};

    for (const [key, pattern] of Object.entries(this.extractionTemplates)) {
      const matches = [...text.matchAll(pattern)];
      if (matches.length > 0) {
        if (key === 'sampleSize') {
          metadata[key] = parseInt(matches[0][1]) || null;
        } else {
          metadata[key] = matches[0][1]?.trim() || null;
        }
      }
    }

    return metadata;
  }

  /**
   * Store document in unified_documents table
   */
  async storeInUnifiedDocuments(options) {
    const {
      processingId,
      fileName,
      filePath,
      fileBuffer,
      mimeType,
      extractedContent,
      csrAnalysis,
      contentHash,
      tenantId,
      userId,
      module,
      context,
    } = options;

    const fileSize = fileBuffer ? fileBuffer.length : filePath ? fs.statSync(filePath).size : 0;
    const documentId = uuidv4();

    const insertResult = await pool.query(
      `
      INSERT INTO unified_documents (
        id, processing_id, original_name, file_path, file_size, mime_type, 
        module, context, text_content, processed_text, ai_analysis, 
        module_specific_data, content_hash, document_type, tenant_id, 
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      ) RETURNING id
    `,
      [
        documentId,
        processingId,
        fileName,
        filePath,
        fileSize,
        mimeType,
        module,
        context,
        extractedContent.fullText,
        JSON.stringify(extractedContent),
        JSON.stringify(csrAnalysis),
        JSON.stringify({ csrIntelligenceLibrary: true }),
        contentHash,
        'CSR',
        tenantId,
        new Date(),
        new Date(),
      ]
    );

    return documentId;
  }

  /**
   * Store structured intelligence in CSR Intelligence Library
   */
  async storeInCSRIntelligenceLibrary(options) {
    const {
      unifiedDocumentId,
      fileName,
      filePath,
      extractedContent,
      csrAnalysis,
      tenantId,
      userId,
    } = options;

    // Insert into csr_reports
    const csrReportResult = await pool.query(
      `
      INSERT INTO csr_reports (
        title, sponsor, indication, phase, status, date, summary, 
        file_name, file_size, file_path, study_id, drug_name, 
        region, upload_date, last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      ) RETURNING id
    `,
      [
        csrAnalysis.indication || fileName,
        csrAnalysis.sponsor || 'Unknown',
        csrAnalysis.indication || 'Unknown',
        csrAnalysis.phase || 'Unknown',
        csrAnalysis.regulatoryStatus || 'Ingested',
        new Date().toISOString().split('T')[0],
        csrAnalysis.conclusions || 'Summary pending',
        fileName,
        extractedContent.fullText.length,
        filePath,
        csrAnalysis.studyId || null,
        csrAnalysis.drugName || null,
        csrAnalysis.region || 'Unknown',
        new Date(),
        new Date(),
      ]
    );

    const csrReportId = csrReportResult.rows[0].id;

    // Insert into csr_details
    await pool.query(
      `
      INSERT INTO csr_details (
        report_id, study_design, primary_objective, inclusion_criteria, 
        exclusion_criteria, treatment_arms, study_duration, endpoints, 
        results, safety, sample_size, adverse_events, efficacy_results, 
        processing_status, extraction_date, last_updated
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
      )
    `,
      [
        csrReportId,
        csrAnalysis.studyDesign || 'Unknown',
        csrAnalysis.primaryEndpoint || 'Unknown',
        JSON.stringify(csrAnalysis.inclusionCriteria || []),
        JSON.stringify(csrAnalysis.exclusionCriteria || []),
        JSON.stringify({ primary: csrAnalysis.drugName || 'Unknown' }),
        csrAnalysis.duration || 'Unknown',
        JSON.stringify({
          primary: csrAnalysis.primaryEndpoint,
          secondary: csrAnalysis.secondaryEndpoints || [],
        }),
        JSON.stringify({ summary: csrAnalysis.efficacyResults || 'Pending' }),
        JSON.stringify({ adverse_events: csrAnalysis.adverseEvents || 'Pending' }),
        csrAnalysis.sampleSize || null,
        JSON.stringify({ summary: csrAnalysis.adverseEvents || 'Pending' }),
        JSON.stringify({ summary: csrAnalysis.efficacyResults || 'Pending' }),
        'completed',
        new Date(),
        new Date(),
      ]
    );

    return csrReportId;
  }

  /**
   * Create explicit link between unified_documents and CSR Intelligence Library
   */
  async createCSRIntelligenceLink(unifiedDocumentId, csrReportId) {
    // Update unified_documents with CSR Intelligence Library reference
    await pool.query(
      `
      UPDATE unified_documents 
      SET module_specific_data = module_specific_data || $1
      WHERE id = $2
    `,
      [JSON.stringify({ csrIntelligenceLibraryId: csrReportId }), unifiedDocumentId]
    );

    console.log(
      `[CSR Intelligence Library] Created explicit link: ${unifiedDocumentId} -> ${csrReportId}`
    );
  }

  /**
   * Log CSR ingestion completion in audit trail
   */
  async logCSRIngestionComplete(processingId, unifiedDocumentId, csrReportId, tenantId, userId) {
    await pool.query(
      `
      INSERT INTO document_audit_trail (
        id, document_id, tenant_id, user_id, action, details, timestamp
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
    `,
      [
        uuidv4(),
        unifiedDocumentId,
        tenantId,
        userId,
        'CSR_INTELLIGENCE_LIBRARY_INGESTION_COMPLETE',
        JSON.stringify({
          processingId,
          unifiedDocumentId,
          csrReportId,
          message:
            'CSR document successfully ingested into Intelligence Library with hard-wired data governance',
        }),
        new Date(),
      ]
    );
  }

  /**
   * Generate content hash for deduplication
   */
  generateContentHash(content) {
    const hash = crypto.createHash('sha256');
    if (Buffer.isBuffer(content)) {
      hash.update(content);
    } else if (typeof content === 'string') {
      hash.update(content, 'utf8');
    } else {
      hash.update(fs.readFileSync(content));
    }
    return hash.digest('hex');
  }

  /**
   * Query CSR Intelligence Library (used by Deep Research)
   */
  async queryCSRIntelligenceLibrary(filters = {}) {
    const { indication, phase, sponsor, limit = 20, offset = 0 } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (indication) {
      whereClause += ` AND LOWER(indication) LIKE LOWER($${paramIndex})`;
      params.push(`%${indication}%`);
      paramIndex++;
    }

    if (phase) {
      whereClause += ` AND LOWER(phase) LIKE LOWER($${paramIndex})`;
      params.push(`%${phase}%`);
      paramIndex++;
    }

    if (sponsor) {
      whereClause += ` AND LOWER(sponsor) LIKE LOWER($${paramIndex})`;
      params.push(`%${sponsor}%`);
      paramIndex++;
    }

    const query = `
      SELECT 
        r.id, r.title, r.sponsor, r.indication, r.phase, r.status, r.date,
        r.study_id, r.drug_name, r.region, r.summary, r.file_name,
        d.study_design, d.primary_objective, d.sample_size, d.study_duration,
        d.endpoints, d.results, d.safety, d.adverse_events, d.efficacy_results
      FROM csr_reports r
      LEFT JOIN csr_details d ON r.id = d.report_id
      ${whereClause}
      ORDER BY r.last_updated DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }
}

// Export singleton instance
export const csrIntelligenceLibrary = new CSRIntelligenceLibrary();
