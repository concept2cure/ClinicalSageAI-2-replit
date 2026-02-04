/**
 * Document Ingestion Workflow for Lumen AI Agent
 *
 * This service provides comprehensive document ingestion capabilities including:
 * - Multi-format document processing (PDF, DOCX, Excel, PowerPoint)
 * - Text extraction and cleaning
 * - Regulatory term extraction
 * - Document classification
 * - Metadata enrichment
 * - Vector search preparation
 * - Integration with Lumen AI Agent
 */

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { TextProcessor } from '../utils/textProcessing.ts';
import { pool as dbPool } from '../utils/database.js';
import OpenAI from 'openai';
import PDFParser from 'pdf-parse';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Document storage configuration
const uploadDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for file uploads
export const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
      cb(null, uniqueName);
    },
  }),
  fileFilter: (req, file, cb) => {
    // Accept regulatory document formats
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

/**
 * Document Ingestion Workflow Class
 */
export class DocumentIngestionWorkflow {
  constructor() {
    this.textProcessor = new TextProcessor();
  }

  /**
   * Process uploaded document through complete ingestion workflow
   */
  async processDocument(file, metadata = {}) {
    try {
      console.log(`Starting document ingestion for: ${file.originalname}`);

      // Step 1: Extract text content based on file type
      const textContent = await this.extractTextContent(file);

      // Step 2: Clean and process text
      const processedText = await this.textProcessor.processText(textContent);

      // Step 3: Classify document type
      const documentType = await this.classifyDocument(textContent, metadata);

      // Step 4: Extract regulatory information
      const regulatoryInfo = await this.extractRegulatoryInformation(textContent);

      // Step 5: Generate AI-powered document summary
      const aiSummary = await this.generateDocumentSummary(textContent, documentType);

      // Step 6: Create vector embeddings for search
      const embeddings = await this.generateEmbeddings(textContent);

      // Step 7: Store document metadata in database
      const documentRecord = await this.storeDocumentMetadata({
        originalName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        documentType,
        textContent,
        processedText,
        regulatoryInfo,
        aiSummary,
        embeddings,
        metadata,
        uploadedAt: new Date(),
      });

      // Step 8: Update Lumen AI knowledge base
      await this.updateLumenKnowledgeBase(documentRecord);

      console.log(`Document ingestion completed for: ${file.originalname}`);

      return {
        success: true,
        documentId: documentRecord.id,
        documentType,
        extractedText: textContent.substring(0, 500) + '...',
        regulatoryInfo,
        aiSummary,
        processingStats: {
          originalLength: textContent.length,
          processedLength: processedText.cleanedLength,
          extractedTerms: processedText.extractedEntities.regulatoryTerms.length,
          segments: processedText.segments.length,
        },
      };
    } catch (error) {
      console.error('Document ingestion error:', error);
      throw new Error(`Document ingestion failed: ${error.message}`);
    }
  }

  /**
   * Extract text content from various file formats
   */
  async extractTextContent(file) {
    const filePath = file.path;
    const mimeType = file.mimetype;

    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.extractFromPDF(filePath);

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.extractFromDOCX(filePath);

        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          return await this.extractFromExcel(filePath);

        case 'text/plain':
        case 'text/csv':
          return await this.extractFromText(filePath);

        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF files
   */
  async extractFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await PDFParser(dataBuffer);
    return data.text;
  }

  /**
   * Extract text from DOCX files
   */
  async extractFromDOCX(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /**
   * Extract text from Excel files
   */
  async extractFromExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    let text = '';

    workbook.worksheets.forEach(worksheet => {
      const rows = [];
      worksheet.eachRow({ includeEmpty: true }, row => {
        const values = row.values
          .slice(1)
          .map(value => (value === null || value === undefined ? '' : String(value)));
        rows.push(values.join(','));
      });
      const sheetData = rows.join('\n');
      text += `Sheet: ${worksheet.name}\n${sheetData}\n\n`;
    });

    return text;
  }

  /**
   * Extract text from plain text files
   */
  async extractFromText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Classify document type using AI
   */
  async classifyDocument(textContent, metadata = {}) {
    try {
      const classificationPrompt = `
        Classify this regulatory document based on its content and metadata:

        Document Content Preview:
        ${textContent.substring(0, 2000)}...

        Metadata:
        ${JSON.stringify(metadata, null, 2)}

        Please classify as one of:
        - CSR (Clinical Study Report)
        - Protocol
        - IND (Investigational New Drug)
        - BLA (Biologics License Application)
        - NDA (New Drug Application)
        - 510K (FDA 510(k) Submission)
        - PMA (Premarket Approval)
        - IDE (Investigational Device Exemption)
        - CTD (Common Technical Document)
        - PSUR (Periodic Safety Update Report)
        - Other

        Respond with just the classification and confidence level.
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a regulatory document classification expert. Classify documents based on their content and structure.',
          },
          {
            role: 'user',
            content: classificationPrompt,
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      });

      const classification = response.choices[0].message.content.trim();
      return classification;
    } catch (error) {
      console.error('Document classification error:', error);
      return 'Other';
    }
  }

  /**
   * Extract regulatory information from document
   */
  async extractRegulatoryInformation(textContent) {
    try {
      const regulatoryPrompt = `
        Extract key regulatory information from this document:

        ${textContent.substring(0, 3000)}...

        Please extract:
        1. Regulatory agencies mentioned (FDA, EMA, Health Canada, etc.)
        2. Regulatory guidelines referenced (ICH, CFR, etc.)
        3. Study identifiers (NCT numbers, protocol numbers)
        4. Drug/device names
        5. Indication/therapeutic area
        6. Key dates
        7. Compliance requirements

        Format as JSON with clear categories.
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a regulatory information extraction expert. Extract structured regulatory data from documents.',
          },
          {
            role: 'user',
            content: regulatoryPrompt,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      });

      try {
        return JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        return { rawExtraction: response.choices[0].message.content };
      }
    } catch (error) {
      console.error('Regulatory information extraction error:', error);
      return {};
    }
  }

  /**
   * Generate AI-powered document summary
   */
  async generateDocumentSummary(textContent, documentType) {
    try {
      const summaryPrompt = `
        Generate a comprehensive summary of this ${documentType} document:

        ${textContent.substring(0, 4000)}...

        Include:
        1. Executive summary (3-4 sentences)
        2. Key objectives
        3. Main findings/conclusions
        4. Regulatory implications
        5. Action items or recommendations

        Make it suitable for regulatory professionals.
      `;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a regulatory medical writer creating executive summaries for regulatory documents.',
          },
          {
            role: 'user',
            content: summaryPrompt,
          },
        ],
        max_tokens: 800,
        temperature: 0.3,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Document summary generation error:', error);
      return 'Summary generation failed';
    }
  }

  /**
   * Generate vector embeddings for document search
   */
  async generateEmbeddings(textContent) {
    try {
      // Use OpenAI embeddings API
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: textContent.substring(0, 8000), // Limit to avoid token limits
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      return null;
    }
  }

  /**
   * Store document metadata in database
   */
  async storeDocumentMetadata(docData) {
    try {
      const query = `
        INSERT INTO ingested_documents (
          id, original_name, file_path, file_size, mime_type, document_type,
          text_content, processed_text, regulatory_info, ai_summary,
          embeddings, metadata, uploaded_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) RETURNING *
      `;

      const documentId = uuidv4();
      const values = [
        documentId,
        docData.originalName,
        docData.filePath,
        docData.fileSize,
        docData.mimeType,
        docData.documentType,
        docData.textContent,
        JSON.stringify(docData.processedText),
        JSON.stringify(docData.regulatoryInfo),
        docData.aiSummary,
        JSON.stringify(docData.embeddings),
        JSON.stringify(docData.metadata),
        docData.uploadedAt,
      ];

      const result = await dbPool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Database storage error:', error);
      throw error;
    }
  }

  /**
   * Update Lumen AI knowledge base with new document
   */
  async updateLumenKnowledgeBase(documentRecord) {
    try {
      console.log(
        `Updating Lumen AI knowledge base with document: ${documentRecord.original_name}`
      );

      // This would integrate with your existing Lumen AI service
      // For now, we'll log the integration
      const knowledgeUpdate = {
        documentId: documentRecord.id,
        documentType: documentRecord.document_type,
        keyTerms: documentRecord.regulatory_info,
        summary: documentRecord.ai_summary,
        searchable: true,
        addedAt: new Date(),
      };

      console.log('Knowledge base update:', knowledgeUpdate);

      // TODO: Implement actual knowledge base integration
      return true;
    } catch (error) {
      console.error('Knowledge base update error:', error);
      return false;
    }
  }

  /**
   * Search ingested documents
   */
  async searchDocuments(query, filters = {}) {
    try {
      let searchQuery = `
        SELECT * FROM ingested_documents
        WHERE text_content ILIKE $1
      `;

      const queryParams = [`%${query}%`];

      if (filters.documentType) {
        searchQuery += ` AND document_type = $${queryParams.length + 1}`;
        queryParams.push(filters.documentType);
      }

      if (filters.dateFrom) {
        searchQuery += ` AND uploaded_at >= $${queryParams.length + 1}`;
        queryParams.push(filters.dateFrom);
      }

      searchQuery += ` ORDER BY uploaded_at DESC LIMIT 50`;

      const result = await dbPool.query(searchQuery, queryParams);
      return result.rows;
    } catch (error) {
      console.error('Document search error:', error);
      throw error;
    }
  }
}

// Initialize the workflow
export const documentIngestionWorkflow = new DocumentIngestionWorkflow();
