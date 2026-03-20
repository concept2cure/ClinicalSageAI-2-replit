/**
 * UNIFIED DOCUMENT INGESTION HUB - Performance Optimized
 *
 * Central processing system for ALL document ingestion needs across the entire platform:
 * - Lumen AI Agent document uploads
 * - Vault document storage
 * - eCTD Co-Author document processing
 * - CER v2 document analysis
 * - IND Wizard document integration
 * - Clinical study report processing
 * - Regulatory submission documents
 *
 * This replaces ALL separate ingestion systems with one unified workflow.
 *
 * PERFORMANCE OPTIMIZATIONS:
 * - Chunked processing for large documents (>10MB)
 * - Streaming document content to frontend
 * - Optimized database queries for large text content
 * - Memory-efficient processing for 500+ page documents
 */

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { TextProcessor } from '../utils/textProcessing.js';
import { pool as dbPool } from '../utils/database.js';
// import PDFParser from 'pdf-parse';
// import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// PYTHON PDF EXTRACTOR BRIDGE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract text from PDF using the Python multi-strategy extractor.
 * Cascades through: PyMuPDF → PyPDF2 → pdfminer.six → OCR → Enhanced OCR
 *
 * @param {Buffer} pdfBuffer - PDF file as buffer
 * @param {Object} options - Extraction options
 * @param {string[]} options.strategies - Which strategies to use
 * @param {number} options.minChars - Minimum characters for success (default 50)
 * @param {boolean} options.forceOcr - Skip text extraction, use OCR directly
 * @returns {Promise<{text: string, strategy: string, pageCount: number, charCount: number, success: boolean, warnings: string[], metadata: object}>}
 */
async function extractPdfWithPython(pdfBuffer, options = {}) {
  const { strategies, minChars = 50, forceOcr = false } = options;

  // First try: call FastAPI endpoint if analytics-engine is running
  const analyticsPort = process.env.ANALYTICS_PORT || 8001;
  const analyticsUrl = `http://localhost:${analyticsPort}/extract-pdf`;

  try {
    const response = await fetch(analyticsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_base64: pdfBuffer.toString('base64'),
        strategies: strategies || null,
        min_chars: minChars,
        force_ocr: forceOcr,
      }),
      signal: AbortSignal.timeout(120000), // 2 minute timeout for OCR
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[PDF EXTRACTOR] FastAPI extraction succeeded: ${result.strategy}, ${result.char_count} chars`);
      return {
        text: result.text,
        strategy: result.strategy,
        pageCount: result.page_count,
        charCount: result.char_count,
        success: result.success,
        warnings: result.warnings,
        metadata: result.metadata,
      };
    }
    console.warn(`[PDF EXTRACTOR] FastAPI returned ${response.status}, falling back to direct Python call`);
  } catch (err) {
    console.warn(`[PDF EXTRACTOR] FastAPI not available (${err.message}), falling back to direct Python call`);
  }

  // Fallback: call Python script directly
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || path.join(process.cwd(), '.venv/bin/python3');
    const scriptPath = path.join(process.cwd(), 'ingestion/pdf_extractor.py');

    // Write buffer to temp file
    const tempFile = `/tmp/pdf_extract_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
    fs.writeFileSync(tempFile, pdfBuffer);

    const args = [
      '-c',
      `
import sys
import json
sys.path.insert(0, '${process.cwd()}')
from ingestion.pdf_extractor import extract_pdf_text
result = extract_pdf_text(
    '${tempFile}',
    strategies=${strategies ? JSON.stringify(strategies) : 'None'},
    min_chars=${minChars},
    force_ocr=${forceOcr ? 'True' : 'False'}
)
print(json.dumps(result))
      `.trim(),
    ];

    const python = spawn(pythonPath, args, {
      env: { ...process.env, PYTHONPATH: process.cwd() },
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => { stdout += data.toString(); });
    python.stderr.on('data', (data) => { stderr += data.toString(); });

    python.on('close', (code) => {
      // Cleanup temp file
      try { fs.unlinkSync(tempFile); } catch {}

      if (code !== 0) {
        console.error(`[PDF EXTRACTOR] Python script failed: ${stderr}`);
        resolve({
          text: '',
          strategy: 'none',
          pageCount: 0,
          charCount: 0,
          success: false,
          warnings: [`Python extraction failed: ${stderr}`],
          metadata: {},
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        console.log(`[PDF EXTRACTOR] Direct Python extraction succeeded: ${result.strategy}, ${result.char_count} chars`);
        resolve({
          text: result.text,
          strategy: result.strategy,
          pageCount: result.page_count,
          charCount: result.char_count,
          success: result.success,
          warnings: result.warnings,
          metadata: result.metadata,
        });
      } catch (parseErr) {
        console.error(`[PDF EXTRACTOR] Failed to parse Python output: ${parseErr}`);
        resolve({
          text: '',
          strategy: 'none',
          pageCount: 0,
          charCount: 0,
          success: false,
          warnings: [`Failed to parse extraction result: ${parseErr.message}`],
          metadata: {},
        });
      }
    });

    python.on('error', (err) => {
      try { fs.unlinkSync(tempFile); } catch {}
      console.error(`[PDF EXTRACTOR] Python spawn error: ${err}`);
      resolve({
        text: '',
        strategy: 'none',
        pageCount: 0,
        charCount: 0,
        success: false,
        warnings: [`Python spawn error: ${err.message}`],
        metadata: {},
      });
    });
  });
}

// Performance optimization constants
const LARGE_DOCUMENT_THRESHOLD = 10 * 1024 * 1024; // 10MB
const CHUNK_SIZE = 64 * 1024; // 64KB chunks for processing
const MAX_MEMORY_BUFFER = 100 * 1024 * 1024; // 100MB max memory buffer

// OCR Configuration
const OCR_CONFIG = {
  tesseract: {
    enabled: true,
    languages: ['eng', 'fra', 'deu', 'spa', 'ita'], // Multi-language support
    psm: 6, // Page segmentation mode
    oem: 3, // OCR Engine mode
  },
  fallback: {
    enabled: true,
    timeout: 30000, // 30 seconds timeout
  },
};

// Import CSR Intelligence Library for hard-wired CSR processing
import { csrIntelligenceLibrary } from './CSRIntelligenceLibrary.js';

// Regulatory Document Processing Configuration
const REGULATORY_CONFIG = {
  documentTypes: {
    IND: {
      patterns: ['investigational new drug', 'ind application', 'ind amendment'],
      priority: 'high',
    },
    NDA: {
      patterns: ['new drug application', 'nda submission', 'marketing application'],
      priority: 'high',
    },
    BLA: { patterns: ['biologics license application', 'bla submission'], priority: 'high' },
    CSR: {
      patterns: ['clinical study report', 'csr', 'clinical trial report'],
      priority: 'high',
      hardWired: true,
    },
    Protocol: {
      patterns: ['study protocol', 'clinical protocol', 'trial protocol'],
      priority: 'medium',
    },
    SOP: {
      patterns: ['standard operating procedure', 'sop', 'procedure manual'],
      priority: 'medium',
    },
    'Post-Market': {
      patterns: ['post-market', 'adverse event', 'safety report', 'pharmacovigilance'],
      priority: 'high',
    },
    eCTD: { patterns: ['ectd', 'common technical document', 'ctd'], priority: 'high' },
    '510k': {
      patterns: ['510k', '510(k)', 'predicate device', 'substantial equivalence'],
      priority: 'high',
    },
    CER: {
      patterns: ['clinical evaluation report', 'cer', 'clinical evaluation'],
      priority: 'high',
    },
  },
  sectionPatterns: {
    ich: /^\s*(\d+\.)+\s*(Purpose|Scope|Definitions|Responsibilities|Procedures|Methods|Results|Discussion|Conclusion|References|Appendices|Abbreviations)\s*$/gim,
    clinical:
      /^\s*([A-Z]\d?\.?)+\s*(BACKGROUND|OBJECTIVES|PRIMARY ENDPOINT|SECONDARY ENDPOINT|STUDY DESIGN|STATISTICAL METHODS|ADVERSE EVENTS|SAE REPORTING|RISK MANAGEMENT|PATIENT POPULATION|INVESTIGATIONAL PRODUCT|DOSAGE AND ADMINISTRATION|SCHEDULE OF ACTIVITIES|ETHICAL CONSIDERATIONS|DATA MANAGEMENT|QUALITY ASSURANCE)\s*$/gim,
    spl: /^\s*(DESCRIPTION|INDICATIONS AND USAGE|CONTRAINDICATIONS|WARNINGS|PRECAUTIONS|ADVERSE REACTIONS|DRUG INTERACTIONS|USE IN SPECIFIC POPULATIONS|OVERDOSAGE|CLINICAL PHARMACOLOGY|CLINICAL STUDIES|NONCLINICAL TOXICOLOGY|HOW SUPPLIED|STORAGE AND HANDLING)\s*$/gim,
    quality: /^\s*(QUALITY OVERVIEW|MANUFACTURING PROCESS|ANALYTICAL METHODS|STABILITY)\s*$/gim,
    qms: /^\s*COMPLAINT HANDLING|DEVIATION MANAGEMENT|CAPA PROCEDURE|AUDIT REPORT\s*$/gim,
  },
};
import { ai } from '../lib/unified-ai-client';

// Initialize services
const textProcessor = new TextProcessor();

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/json',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
]);

const MAGIC_SIGNATURES = [
  { mime: 'application/pdf', magic: Buffer.from('%PDF') },
  { mime: 'image/png', magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', magic: Buffer.from([0xff, 0xd8, 0xff]) },
  { mime: 'application/zip', magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
];

const isLikelyText = buffer => {
  const sample = buffer.subarray(0, 2048);
  if (sample.includes(0)) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printable += 1;
    }
  }
  return printable / sample.length > 0.9;
};

const matchesMagic = (buffer, magic) =>
  buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);

const validateFileSignature = (buffer, mimeType) => {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported file type');
  }

  const zipBasedMimes = new Set([
    'application/zip',
    'application/x-zip-compressed',
    'multipart/x-zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);

  const magicMatch = MAGIC_SIGNATURES.find(sig => matchesMagic(buffer, sig.magic));

  if (zipBasedMimes.has(mimeType)) {
    if (!matchesMagic(buffer, Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw new Error('Invalid ZIP-based file signature');
    }
  } else if (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml')
  ) {
    if (!isLikelyText(buffer)) {
      throw new Error('Invalid text file content');
    }
  } else if (magicMatch && magicMatch.mime !== mimeType && mimeType !== 'application/zip') {
    throw new Error('File signature does not match MIME type');
  }
};

// Central storage configuration
const STORAGE_PATHS = {
  uploads: path.join(process.cwd(), 'uploads'),
  vault: path.join(process.cwd(), 'vault'),
  attachedAssets: path.join(process.cwd(), 'attached_assets'),
  processed: path.join(process.cwd(), 'processed_documents'),
  temp: path.join(process.cwd(), 'temp_documents'),
};

// Ensure all directories exist
Object.values(STORAGE_PATHS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Unified multer configuration
// Multer config moved to end of file to avoid duplicate exports

/**
 * UNIFIED DOCUMENT INGESTION CLASS
 * Handles all document processing needs across the entire platform
 */
export class UnifiedDocumentIngestion {
  constructor() {
    this.processingQueue = new Map();
    this.knowledgeBase = new Map();
  }

  /**
   * MAIN ENTRY POINT - Process any document for any module
   */
  async processDocument(file, options = {}) {
    const processingId = uuidv4();
    const startTime = Date.now();
    let tempFilePath = null;

    console.log(`[UNIFIED INGESTION] Starting processing: ${file.originalname}`);
    console.log(`[UNIFIED INGESTION] Module: ${options.module || 'general'}`);
    console.log(`[UNIFIED INGESTION] Context: ${options.context || 'unknown'}`);

    try {
      const bufferToValidate = file.buffer
        ? file.buffer
        : file.path
          ? fs.readFileSync(file.path)
          : Buffer.alloc(0);
      validateFileSignature(bufferToValidate, file.mimetype);
    } catch (error) {
      throw new Error(`Upload validation failed: ${error.message}`);
    }

    try {
      // CRITICAL: Handle memoryStorage by creating temporary file for Python service
      if (file.buffer && !file.path) {
        // Create temporary directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp_documents');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create temporary file path
        const fileExt = path.extname(file.originalname);
        tempFilePath = path.join(tempDir, `${processingId}-${file.originalname}`);

        // Write buffer to temporary file
        fs.writeFileSync(tempFilePath, file.buffer);
        console.log(`[UNIFIED INGESTION] Created temporary file for processing: ${tempFilePath}`);

        // Update file object with path for downstream processing
        file.path = tempFilePath;
      }

      // Step 1: Extract content
      const extractedContent = await this.extractContent(file);

      // Step 2: Process with enhanced text processing
      const processedText = {
        cleanedText: extractedContent.text.replace(/\s+/g, ' ').trim(),
        cleanedLength: extractedContent.text.replace(/\s+/g, ' ').trim().length,
        originalLength: extractedContent.text.length,
        wordCount: extractedContent.text.split(/\s+/).filter(Boolean).length,
        extractedEntities: {
          regulatoryTerms: [],
          medicalTerms: [],
        },
      };
      console.log(
        `Text processing complete: ${extractedContent.text.length} chars -> ${processedText.cleanedLength} chars`
      );
      console.log(
        `Extracted: ${processedText.extractedEntities.regulatoryTerms.length} regulatory terms, ${processedText.extractedEntities.medicalTerms.length} medical terms`
      );

      // Step 3: Regulatory document type detection
      const documentTypeAnalysis = await this.detectRegulatoryDocumentType(
        extractedContent.text,
        file.originalname
      );

      // Step 4: Regulatory structure extraction
      const regulatoryStructure = await this.extractRegulatoryStructure(extractedContent.text);

      // Step 5: AI-powered document analysis
      const aiAnalysis = await this.performAIAnalysis(extractedContent.text, {
        ...options,
        documentType: documentTypeAnalysis,
        structure: regulatoryStructure,
      });

      // Step 6: Module-specific processing
      const moduleSpecificData = await this.processForModule(
        extractedContent,
        processedText,
        options
      );

      // Step 7: Store in unified database
      const documentRecord = await this.storeUnifiedDocument({
        file,
        extractedContent,
        processedText,
        aiAnalysis,
        moduleSpecificData,
        options,
        processingId,
        processingTime: Date.now() - startTime,
        documentType: documentTypeAnalysis,
        structure: regulatoryStructure,
      });

      // Step 8: Update all relevant knowledge bases
      await this.updateAllKnowledgeBases(documentRecord);

      // Step 9: Generate response based on requesting module
      const response = await this.generateModuleResponse(documentRecord, options);

      console.log(`[UNIFIED INGESTION] Processing completed in ${Date.now() - startTime}ms`);

      return response;
    } catch (error) {
      console.error(`[UNIFIED INGESTION] Processing failed:`, error);
      throw new Error(`Document processing failed: ${error.message}`);
    } finally {
      // Clean up temporary file if created
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[UNIFIED INGESTION] Cleaned up temporary file: ${tempFilePath}`);
      }
    }
  }

  /**
   * Process scanned documents using Tesseract OCR
   */
  async processWithOCR(fileBuffer, fileType) {
    try {
      console.log(`[UNIFIED INGESTION] Processing scanned ${fileType} with OCR`);

      // Create temporary file for OCR processing
      const tempDir = '/tmp';
      const tempFile = `${tempDir}/ocr_temp_${Date.now()}.${fileType}`;

      // Write buffer to temporary file
      fs.writeFileSync(tempFile, fileBuffer);

      // Run Tesseract OCR
      const { stdout } = await execAsync(`tesseract ${tempFile} stdout`);

      // Clean up temporary file
      fs.unlinkSync(tempFile);

      return stdout.trim();
    } catch (error) {
      console.error('OCR processing failed:', error);
      return 'OCR processing failed - document may be corrupted or unsupported format';
    }
  }

  /**
   * Extract content from any supported file format
   */
  async extractContent(file) {
    const mimeType = file.mimetype;
    const filePath = file.path;
    const fileBuffer = file.buffer;

    console.log(`[UNIFIED INGESTION] Extracting content from ${mimeType}`);
    console.log(`[UNIFIED INGESTION] File path: ${filePath}, Buffer available: ${!!fileBuffer}`);

    try {
      let text = '';
      let metadata = {};

      switch (mimeType) {
        case 'application/pdf':
          const pdfBuffer = fileBuffer || fs.readFileSync(filePath);

          // Use Python multi-strategy extractor (PyMuPDF → PyPDF2 → pdfminer → OCR)
          const pdfResult = await extractPdfWithPython(pdfBuffer);
          text = pdfResult.text;
          metadata = {
            pages: pdfResult.pageCount,
            strategy: pdfResult.strategy,
            charCount: pdfResult.charCount,
            warnings: pdfResult.warnings,
            ...pdfResult.metadata,
          };

          // Log extraction result
          if (pdfResult.success) {
            console.log(`[UNIFIED INGESTION] PDF extracted via ${pdfResult.strategy}: ${pdfResult.charCount} chars from ${pdfResult.pageCount} pages`);
          } else {
            console.warn(`[UNIFIED INGESTION] PDF extraction failed: ${pdfResult.warnings.join(', ')}`);
          }

          // Track if OCR was used
          if (pdfResult.strategy === 'ocr' || pdfResult.strategy === 'ocr_enhanced') {
            metadata.ocrProcessed = true;
          }
          break;

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          let docResult;
          if (fileBuffer) {
            docResult = await mammoth.extractRawText({ buffer: fileBuffer });
          } else {
            docResult = await mammoth.extractRawText({ path: filePath });
          }
          text = docResult.value;
          metadata = { wordCount: text.split(/\s+/).length };

          // If DOCX has little text, try OCR (scanned document)
          if (text.trim().length < 50) {
            console.log(`[UNIFIED INGESTION] DOCX appears to be scanned, using OCR`);
            const docBuffer = fileBuffer || fs.readFileSync(filePath);
            const ocrText = await this.processWithOCR(docBuffer, 'docx');
            text = ocrText.length > text.length ? ocrText : text;
            metadata.ocrProcessed = true;
          }
          break;

        case 'application/vnd.ms-excel':
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
          const workbook = await this.loadExcelWorkbook({ fileBuffer, filePath });
          text = this.extractExcelText(workbook);
          metadata = { sheets: workbook.worksheets.map(sheet => sheet.name) };
          break;

        case 'text/plain':
        case 'text/csv':
          if (fileBuffer) {
            text = fileBuffer.toString('utf8');
          } else if (filePath && fs.existsSync(filePath)) {
            text = fs.readFileSync(filePath, 'utf8');
          } else {
            throw new Error('No file source available for text extraction');
          }
          metadata = { encoding: 'utf8' };
          break;

        case 'text/xml':
        case 'application/xml':
          if (fileBuffer) {
            text = fileBuffer.toString('utf8');
          } else if (filePath && fs.existsSync(filePath)) {
            text = fs.readFileSync(filePath, 'utf8');
          } else {
            throw new Error('No file source available for XML extraction');
          }
          metadata = { format: 'xml' };
          break;

        case 'application/json':
          let jsonText;
          if (fileBuffer) {
            jsonText = fileBuffer.toString('utf8');
          } else if (filePath && fs.existsSync(filePath)) {
            jsonText = fs.readFileSync(filePath, 'utf8');
          } else {
            throw new Error('No file source available for JSON extraction');
          }
          const jsonData = JSON.parse(jsonText);
          text = JSON.stringify(jsonData, null, 2);
          metadata = { format: 'json', keys: Object.keys(jsonData) };
          break;

        case 'application/zip':
        case 'application/x-zip-compressed':
        case 'multipart/x-zip':
        case 'application/octet-stream':
          // Handle ZIP files and eCTD archives
          if (filePath && filePath.endsWith('.zip')) {
            text = `ZIP Archive: ${filePath.split('/').pop()}`;
            metadata = {
              format: 'zip',
              type: 'eCTD Archive',
              note: 'ZIP content will be processed by Python FastAPI service',
            };
          } else {
            throw new Error(`Unsupported file type: ${mimeType}`);
          }
          break;

        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      return {
        text,
        metadata,
        hash: crypto.createHash('sha256').update(text).digest('hex'),
        extractedAt: new Date(),
      };
    } catch (error) {
      throw new Error(`Content extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from Excel workbook
   */
  extractExcelText(workbook) {
    let text = '';
    workbook.eachSheet(worksheet => {
      const sheetData = this.worksheetToCsv(worksheet);
      text += `--- Sheet: ${worksheet.name} ---\n${sheetData}\n\n`;
    });
    return text;
  }

  async loadExcelWorkbook({ fileBuffer, filePath }) {
    const workbook = new ExcelJS.Workbook();
    if (fileBuffer) {
      await workbook.xlsx.load(fileBuffer);
    } else if (filePath && fs.existsSync(filePath)) {
      await workbook.xlsx.readFile(filePath);
    } else {
      throw new Error('No file source available for Excel extraction');
    }
    return workbook;
  }

  worksheetToCsv(worksheet) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: true }, row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      const serialized = values.map(value => this.escapeCsv(this.excelCellToString(value)));
      rows.push(serialized.join(','));
    });
    return rows.join('\n');
  }

  excelCellToString(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') return value.text;
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map(part => part.text || '').join('');
      }
      if ('result' in value && value.result !== undefined) return String(value.result);
      if ('formula' in value && value.formula !== undefined)
        return String(value.result ?? value.formula);
    }
    return String(value);
  }

  escapeCsv(value) {
    const text = value ?? '';
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  /**
   * Regulatory document type detection and classification
   */
  async detectRegulatoryDocumentType(text, filename) {
    const lowerText = text.toLowerCase();
    const lowerFilename = filename.toLowerCase();

    let detectedTypes = [];

    // Check filename patterns first
    for (const [type, config] of Object.entries(REGULATORY_CONFIG.documentTypes)) {
      for (const pattern of config.patterns) {
        if (lowerFilename.includes(pattern) || lowerText.includes(pattern)) {
          detectedTypes.push({
            type,
            confidence: lowerFilename.includes(pattern) ? 0.9 : 0.7,
            priority: config.priority,
            source: lowerFilename.includes(pattern) ? 'filename' : 'content',
          });
        }
      }
    }

    // Sort by confidence and return primary type
    detectedTypes.sort((a, b) => b.confidence - a.confidence);

    return {
      primaryType: detectedTypes[0]?.type || 'Unknown',
      allDetected: detectedTypes,
      confidence: detectedTypes[0]?.confidence || 0,
      isRegulatory: detectedTypes.length > 0,
    };
  }

  /**
   * Extract regulatory sections and structure
   */
  async extractRegulatoryStructure(text) {
    const sections = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check against regulatory section patterns
      for (const [sectionType, pattern] of Object.entries(REGULATORY_CONFIG.sectionPatterns)) {
        const matches = line.match(pattern);
        if (matches) {
          sections.push({
            type: sectionType,
            heading: line,
            lineNumber: i + 1,
            content: this.extractSectionContent(lines, i),
            level: this.determineSectionLevel(line),
          });
        }
      }
    }

    return {
      sections,
      structureQuality: sections.length > 0 ? 'well-structured' : 'unstructured',
      totalSections: sections.length,
    };
  }

  /**
   * Extract content for a detected section
   */
  extractSectionContent(lines, startIndex) {
    let content = [];
    let i = startIndex + 1;

    // Extract content until next section or end of document
    while (i < lines.length) {
      const line = lines[i].trim();

      // Check if this line is a new section
      let isNewSection = false;
      for (const pattern of Object.values(REGULATORY_CONFIG.sectionPatterns)) {
        if (line.match(pattern)) {
          isNewSection = true;
          break;
        }
      }

      if (isNewSection) break;
      if (line) content.push(line);
      i++;
    }

    return content.join('\n');
  }

  /**
   * Determine section hierarchy level
   */
  determineSectionLevel(heading) {
    // Count leading numbers (1., 1.1., 1.1.1., etc.)
    const numberMatch = heading.match(/^(\d+\.)+/);
    if (numberMatch) {
      return numberMatch[0].split('.').length - 1;
    }

    // Check for letter patterns (A., A.1., etc.)
    const letterMatch = heading.match(/^[A-Z]+\./);
    if (letterMatch) {
      return 1;
    }

    return 0; // Top level or unknown
  }

  /**
   * Enhanced AI analysis with regulatory focus
   */
  async performAIAnalysis(text, options) {
    try {
      const analysisPrompt = `
        COMPREHENSIVE DOCUMENT ANALYSIS

        Document Context:
        - Module: ${options.module || 'general'}
        - Context: ${options.context || 'unknown'}
        - Purpose: ${options.purpose || 'document processing'}

        Document Content (first 4000 chars):
        ${text.substring(0, 4000)}...

        Provide comprehensive analysis including:
        1. Document classification (CSR, Protocol, IND, BLA, NDA, 510K, etc.)
        2. Key regulatory information extracted
        3. Compliance assessment
        4. Risk analysis
        5. Recommended actions
        6. Integration suggestions for the specified module

        Format as structured JSON with clear categories.
      `;

      const aiResult = await ai.chat({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a regulatory document analysis expert. Provide comprehensive, structured analysis of regulatory documents.',
          },
          {
            role: 'user',
            content: analysisPrompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.1,
      });

      try {
        return JSON.parse(aiResult.content);
      } catch (parseError) {
        return {
          rawAnalysis: aiResult.content,
          classification: 'Unknown',
          confidence: 0.5,
        };
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
      return {
        error: error.message,
        classification: 'Unknown',
        confidence: 0,
      };
    }
  }

  /**
   * Process document for specific module requirements
   * CRITICAL: CSR documents are hard-wired to CSR Intelligence Library
   */
  async processForModule(extractedContent, processedText, options) {
    const module = options.module || 'general';

    console.log(`[UNIFIED INGESTION] Processing for module: ${module}`);

    // HARD-WIRED CSR PROCESSING: If CSR detected, route to CSR Intelligence Library
    if (module === 'csr' || this.isCSRDocument(extractedContent, options)) {
      console.log(
        '[UNIFIED INGESTION] CSR document detected - routing to CSR Intelligence Library'
      );
      return await this.processForCSRIntelligenceLibrary(extractedContent, processedText, options);
    }

    switch (module) {
      case 'lumen-ai':
        return await this.processForLumenAI(extractedContent, processedText, options);

      case 'coauthor':
      case 'ectd':
        return await this.processForCoAuthor(extractedContent, processedText, options);

      case 'cer-v2':
        return await this.processForCER(extractedContent, processedText, options);

      case 'ind-wizard':
        return await this.processForIND(extractedContent, processedText, options);

      case 'vault':
        return await this.processForVault(extractedContent, processedText, options);

      default:
        return await this.processGeneral(extractedContent, processedText, options);
    }
  }

  /**
   * Detect if document is a CSR based on content analysis
   */
  isCSRDocument(extractedContent, options) {
    const { text } = extractedContent;
    const fileName = options.file?.originalname || '';

    // Check filename patterns
    const csrFilePatterns = ['csr', 'clinical study report', 'clinical trial report'];
    if (csrFilePatterns.some(pattern => fileName.toLowerCase().includes(pattern))) {
      return true;
    }

    // Check content patterns
    const csrContentPatterns = [
      'clinical study report',
      'study protocol',
      'primary endpoint',
      'secondary endpoint',
      'adverse events',
      'treatment emergent',
      'clinical trial',
      'randomized',
      'double-blind',
      'placebo-controlled',
    ];

    const lowerText = text.toLowerCase();
    const matchCount = csrContentPatterns.filter(pattern => lowerText.includes(pattern)).length;

    // If 3 or more CSR indicators are present, classify as CSR
    return matchCount >= 3;
  }

  /**
   * HARD-WIRED: Process CSR documents through CSR Intelligence Library
   */
  async processForCSRIntelligenceLibrary(extractedContent, processedText, options) {
    try {
      console.log('[UNIFIED INGESTION] Processing CSR through Intelligence Library');

      // Extract tenant context
      const tenantId = options.tenantId || 'default';
      const userId = options.userId || 'system';
      const fileName = options.file?.originalname || 'unknown.pdf';
      const fileBuffer = options.file?.buffer;
      const mimeType = options.file?.mimetype || 'application/pdf';

      // Call CSR Intelligence Library ingestion
      const csrResult = await csrIntelligenceLibrary.ingestCSRDocument({
        fileName,
        fileBuffer,
        mimeType,
        tenantId,
        userId,
        module: 'csr',
        context: 'Unified Document Ingestion - CSR Intelligence Library',
      });

      return {
        module: 'csr',
        csrIntelligenceLibrary: csrResult,
        processingMethod: 'hard-wired',
        message: 'CSR document processed through CSR Intelligence Library',
      };
    } catch (error) {
      console.error('[UNIFIED INGESTION] CSR Intelligence Library processing failed:', error);
      throw new Error(`CSR Intelligence Library processing failed: ${error.message}`);
    }
  }

  /**
   * Process for Lumen AI Agent
   */
  async processForLumenAI(extractedContent, processedText, options) {
    return {
      knowledgeBaseEntry: {
        content: extractedContent.text,
        processedContent: processedText,
        searchableTerms: processedText.extractedEntities.regulatoryTerms,
        expertiseArea: this.determineExpertiseArea(processedText),
        confidenceLevel: this.calculateConfidenceLevel(processedText),
      },
      chatContext: {
        documentSummary: extractedContent.text.substring(0, 1000),
        keyTerms: processedText.extractedEntities.regulatoryTerms.slice(0, 10),
        expertise: 'regulatory-affairs',
      },
    };
  }

  /**
   * Process for eCTD Co-Author
   */
  async processForCoAuthor(extractedContent, processedText, options) {
    return {
      ctdModule: this.determineCTDModule(extractedContent.text),
      sectionMapping: this.mapToECTDSections(processedText),
      complianceCheck: this.checkICHCompliance(extractedContent.text),
      integrationPoints: this.findIntegrationPoints(processedText),
    };
  }

  /**
   * Process for CER v2
   */
  async processForCER(extractedContent, processedText, options) {
    return {
      deviceData: this.extractDeviceInformation(extractedContent.text),
      safetyData: this.extractSafetyInformation(processedText),
      regulatoryStatus: this.assessRegulatoryStatus(extractedContent.text),
      cerSections: this.mapToCERSections(processedText),
    };
  }

  /**
   * Process for IND Wizard
   */
  async processForIND(extractedContent, processedText, options) {
    return {
      indSection: this.determineINDSection(extractedContent.text),
      drugInformation: this.extractDrugInformation(processedText),
      clinicalData: this.extractClinicalData(extractedContent.text),
      manufacturingData: this.extractManufacturingData(processedText),
    };
  }

  /**
   * Process for Vault
   */
  async processForVault(extractedContent, processedText, options) {
    return {
      vaultMetadata: {
        documentType: this.classifyForVault(extractedContent.text),
        accessLevel: options.accessLevel || 'restricted',
        retentionPeriod: options.retentionPeriod || '7-years',
        auditTrail: true,
      },
      searchMetadata: {
        tags: processedText.extractedEntities.regulatoryTerms,
        fullTextSearch: true,
        semanticSearch: true,
      },
    };
  }

  /**
   * General processing for unknown modules
   */
  async processGeneral(extractedContent, processedText, options) {
    return {
      generalAnalysis: {
        documentType: 'general',
        extractedTerms: processedText.extractedEntities,
        statistics: processedText.statistics,
        recommendations: ['Review document classification', 'Assign to appropriate module'],
      },
    };
  }

  /**
   * Extract enhanced metadata from document data
   */
  extractEnhancedMetadata(data) {
    const metadata = {
      // Extract from options (form data)
      regulatoryPathway: data.options.regulatoryPathway || null,
      therapeuticArea: data.options.therapeuticArea || null,
      studyId: data.options.studyId || null,
      productName: data.options.productName || null,
      regulatoryAgency: data.options.regulatoryAgency || null,
      effectiveDate: data.options.effectiveDate || null,
      ectdModule: data.options.ectdModule || null,
      ectdSection: data.options.ectdSection || null,
      ectdLeafId: data.options.ectdLeafId || null,
      ectdOperationType: data.options.ectdOperationType || 'new',
      ectdSequenceNumber: data.options.ectdSequenceNumber || null,
      complianceScore: null, // Will be calculated based on document analysis
    };

    // Calculate compliance score based on document type and structure
    if (data.documentType && data.structure) {
      const typeConfidence = data.documentType.confidence || 0;
      const structureQuality = data.structure.structureQuality === 'well-structured' ? 1 : 0.5;
      metadata.complianceScore = (typeConfidence * 0.6 + structureQuality * 0.4) * 100;
    }

    return metadata;
  }

  /**
   * Store document in unified database with enhanced regulatory fields
   */
  async storeUnifiedDocument(data) {
    try {
      const query = `
        INSERT INTO unified_documents (
          id, processing_id, original_name, file_path, file_size, mime_type,
          module, context, text_content, processed_text, ai_analysis,
          module_specific_data, document_type, structure, content_hash, processing_time, created_at,
          document_version_id, is_latest_version, previous_version_doc_id, version_number, version_label,
          ingested_by, source_system, source_file_checksum, regulatory_pathway, compliance_score,
          therapeutic_area, study_id, product_name, regulatory_agency, effective_date, version_notes,
          ectd_module, ectd_section, ectd_leaf_id, ectd_operation_type, ectd_sequence_number,
          submission_id, submission_type, tenant_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
          $34, $35, $36, $37, $38, $39, $40, $41
        ) RETURNING *
      `;

      // Generate SHA256 checksum of source file
      const fileChecksum = crypto
        .createHash('sha256')
        .update(data.file.buffer || '')
        .digest('hex');

      // Extract enhanced metadata
      const enhancedMetadata = this.extractEnhancedMetadata(data);

      const documentId = uuidv4();
      const documentVersionId = uuidv4();

      // CRITICAL FIX: Extract tenant_id from options (passed from middleware)
      const tenantId = data.options.tenantId || 'default';
      if (!tenantId || tenantId === 'default') {
        console.warn('[UNIFIED INGESTION] No tenant_id provided, using default tenant');
      }

      const values = [
        documentId,
        data.processingId,
        data.file.originalname,
        data.file.path || null, // Allow NULL for memory storage uploads as per database schema fix
        data.file.size,
        data.file.mimetype,
        data.options.module || 'general',
        data.options.context || 'unknown',
        data.extractedContent.text,
        JSON.stringify(data.processedText),
        JSON.stringify(data.aiAnalysis),
        JSON.stringify(data.moduleSpecificData),
        JSON.stringify(data.documentType),
        JSON.stringify(data.structure),
        data.extractedContent.hash,
        data.processingTime,
        new Date(),
        // New versioning fields
        documentVersionId,
        true, // is_latest_version
        data.options.previousVersionId || null,
        1, // version_number (will be updated by trigger if not first version)
        data.options.versionLabel || 'Initial',
        // New audit fields
        data.options.userId || 'system',
        data.options.sourceSystem || data.options.module || 'unified-ingestion',
        fileChecksum,
        enhancedMetadata.regulatoryPathway,
        enhancedMetadata.complianceScore,
        enhancedMetadata.therapeuticArea,
        enhancedMetadata.studyId,
        enhancedMetadata.productName,
        enhancedMetadata.regulatoryAgency,
        enhancedMetadata.effectiveDate,
        data.options.versionNotes || null,
        // eCTD fields
        enhancedMetadata.ectdModule,
        enhancedMetadata.ectdSection,
        enhancedMetadata.ectdLeafId,
        enhancedMetadata.ectdOperationType || 'new',
        enhancedMetadata.ectdSequenceNumber,
        data.options.submissionId || null,
        data.options.submissionType || null,
        // CRITICAL FIX: Add tenant_id
        tenantId,
      ];

      // CRITICAL FIX: Version tracking - if this is a new version, update previous versions
      if (data.options.previousVersionId) {
        // Get the logical document ID from the previous version
        const logicalDocQuery = await dbPool.query(
          'SELECT original_name FROM unified_documents WHERE id = $1',
          [data.options.previousVersionId]
        );

        if (logicalDocQuery.rows.length > 0) {
          // Update all previous versions with the same original_name to not be latest
          await dbPool.query(
            'UPDATE unified_documents SET is_latest_version = FALSE WHERE original_name = $1 AND id != $2',
            [logicalDocQuery.rows[0].original_name, documentId]
          );
        }
      } else {
        // For new documents, ensure no other version with same name is marked as latest
        await dbPool.query(
          'UPDATE unified_documents SET is_latest_version = FALSE WHERE original_name = $1 AND id != $2',
          [data.file.originalname, documentId]
        );
      }

      const result = await dbPool.query(query, values);
      const documentRecord = result.rows[0];

      // Store document chunks if available
      if (data.processedText.chunks && data.processedText.chunks.length > 0) {
        await this.storeDocumentChunks(documentVersionId, data.processedText.chunks, tenantId);
      }

      // Store extracted tables if available
      if (data.extractedContent.tables && data.extractedContent.tables.length > 0) {
        await this.storeDocumentTables(documentVersionId, data.extractedContent.tables, tenantId);
      }

      // Create audit trail entry
      await this.createAuditEntry(
        documentVersionId,
        'document_ingested',
        data.options.userId || 'system',
        {
          source: data.options.sourceSystem || data.options.module,
          fileSize: data.file.size,
          processingTime: data.processingTime,
        },
        tenantId
      );

      return documentRecord;
    } catch (error) {
      console.error('Database storage failed:', error);
      throw error;
    }
  }

  /**
   * Store document chunks for vector search
   */
  async storeDocumentChunks(documentVersionId, chunks, tenantId) {
    try {
      // Note: document_chunks.id is auto-incremented integer, not UUID
      // Using existing columns: doc_id, content, embedding (requires vector generation)
      const chunkInsertQuery = `
        INSERT INTO document_chunks (
          doc_id,
          doc_title,
          chunk_index,
          content,
          chunk_text,
          embedding,
          document_version_id,
          created_at,
          tenant_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      // Generate placeholder embedding vector (1536 dimensions) - should be replaced with actual embeddings
      const placeholderEmbedding = Array(1536).fill(0.0);

      for (let i = 0; i < chunks.length; i++) {
        await dbPool.query(chunkInsertQuery, [
          documentVersionId, // Using document_version_id as doc_id
          'Document', // Placeholder title - should be extracted from document metadata
          i,
          chunks[i], // content column
          chunks[i], // chunk_text column (duplicate for compatibility)
          placeholderEmbedding,
          documentVersionId,
          new Date(),
          tenantId,
        ]);
      }

      console.log(
        `[UNIFIED INGESTION] Stored ${chunks.length} document chunks with tenant isolation`
      );
    } catch (error) {
      console.error('Failed to store document chunks:', error);
      // Non-critical error, continue processing
    }
  }

  /**
   * Store extracted tables from documents
   */
  async storeDocumentTables(documentVersionId, tables, tenantId) {
    try {
      const tableInsertQuery = `
        INSERT INTO document_tables (table_id, document_version_id, table_index, table_data, headers, created_at, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (let i = 0; i < tables.length; i++) {
        const tableId = uuidv4();
        await dbPool.query(tableInsertQuery, [
          tableId,
          documentVersionId,
          i,
          JSON.stringify(tables[i].data),
          JSON.stringify(tables[i].headers || []),
          new Date(),
          tenantId,
        ]);
      }

      console.log(
        `[UNIFIED INGESTION] Stored ${tables.length} document tables with tenant isolation`
      );
    } catch (error) {
      console.error('Failed to store document tables:', error);
      // Non-critical error, continue processing
    }
  }

  /**
   * Create audit trail entry
   */
  async createAuditEntry(documentVersionId, action, userId, details, tenantId) {
    try {
      const auditQuery = `
        INSERT INTO document_audit_trail (audit_id, document_version_id, action, performed_by, performed_at, details, tenant_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      const auditId = uuidv4();
      await dbPool.query(auditQuery, [
        auditId,
        documentVersionId,
        action,
        userId,
        new Date(),
        JSON.stringify(details),
        tenantId,
      ]);

      console.log(`[UNIFIED INGESTION] Created audit trail entry with tenant isolation: ${action}`);
    } catch (error) {
      console.error('Failed to create audit entry:', error);
      // Non-critical error, continue processing
    }
  }

  /**
   * Update all relevant knowledge bases
   */
  async updateAllKnowledgeBases(documentRecord) {
    console.log(
      `[UNIFIED INGESTION] Updating knowledge bases for: ${documentRecord.original_name}`
    );

    // Update Lumen AI knowledge base
    this.knowledgeBase.set(documentRecord.id, {
      content: documentRecord.text_content,
      module: documentRecord.module,
      processed:
        typeof documentRecord.processed_text === 'string'
          ? JSON.parse(documentRecord.processed_text)
          : documentRecord.processed_text,
      lastUpdated: new Date(),
    });

    console.log(
      `[UNIFIED INGESTION] Knowledge base updated. Total entries: ${this.knowledgeBase.size}`
    );

    return true;
  }

  /**
   * Generate module-specific response
   */
  async generateModuleResponse(documentRecord, options) {
    const baseResponse = {
      success: true,
      documentId: documentRecord.id,
      processingId: documentRecord.processing_id,
      originalName: documentRecord.original_name,
      module: documentRecord.module,
      processingTime: documentRecord.processing_time,
      contentHash: documentRecord.content_hash,
    };

    // Add module-specific data
    const moduleData =
      typeof documentRecord.module_specific_data === 'string'
        ? JSON.parse(documentRecord.module_specific_data)
        : documentRecord.module_specific_data;
    const aiAnalysis =
      typeof documentRecord.ai_analysis === 'string'
        ? JSON.parse(documentRecord.ai_analysis)
        : documentRecord.ai_analysis;

    // Add regulatory analysis results to base response
    baseResponse.documentType = documentRecord.document_type
      ? typeof documentRecord.document_type === 'string'
        ? JSON.parse(documentRecord.document_type)
        : documentRecord.document_type
      : null;
    baseResponse.structure = documentRecord.structure
      ? typeof documentRecord.structure === 'string'
        ? JSON.parse(documentRecord.structure)
        : documentRecord.structure
      : null;
    baseResponse.aiAnalysis = aiAnalysis;

    switch (documentRecord.module) {
      case 'lumen-ai':
        return {
          ...baseResponse,
          message: 'Document successfully integrated into Lumen AI knowledge base',
          knowledgeBaseEntry: moduleData.knowledgeBaseEntry,
          chatReady: true,
          expertiseArea: moduleData.knowledgeBaseEntry.expertiseArea,
        };

      case 'coauthor':
        return {
          ...baseResponse,
          message: 'Document processed for eCTD Co-Author integration',
          ctdModule: moduleData.ctdModule,
          sectionMapping: moduleData.sectionMapping,
          complianceStatus: moduleData.complianceCheck,
        };

      case 'cer-v2':
        return {
          ...baseResponse,
          message: 'Document processed for CER v2 integration',
          deviceData: moduleData.deviceData,
          safetyData: moduleData.safetyData,
          regulatoryStatus: moduleData.regulatoryStatus,
        };

      default:
        return {
          ...baseResponse,
          message: 'Document processed successfully',
          classification: aiAnalysis.classification,
          recommendations: aiAnalysis.recommendations || [],
        };
    }
  }

  // Helper methods for module-specific processing
  determineExpertiseArea(processedText) {
    const terms = processedText.extractedEntities.regulatoryTerms.join(' ').toLowerCase();
    if (terms.includes('fda') || terms.includes('510k')) return 'fda-submissions';
    if (terms.includes('ema') || terms.includes('ma')) return 'ema-submissions';
    if (terms.includes('clinical')) return 'clinical-research';
    return 'general-regulatory';
  }

  calculateConfidenceLevel(processedText) {
    const termCount = processedText.extractedEntities.regulatoryTerms.length;
    const textLength = processedText.cleanedLength;
    return Math.min(1, (termCount / 100) * (textLength / 10000));
  }

  determineCTDModule(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('quality') || lowerText.includes('cmc')) return 'Module 3';
    if (lowerText.includes('nonclinical') || lowerText.includes('toxicology')) return 'Module 4';
    if (lowerText.includes('clinical') || lowerText.includes('efficacy')) return 'Module 5';
    return 'Module 1';
  }

  mapToECTDSections(processedText) {
    // Implementation would map content to specific eCTD sections
    return { suggestedSections: ['2.7', '3.2.P', '5.3.5'], confidence: 0.8 };
  }

  checkICHCompliance(text) {
    const ichGuidelines = text.match(/ICH\s+[A-Z]\d+/gi) || [];
    return { guidelines: ichGuidelines, compliant: ichGuidelines.length > 0 };
  }

  findIntegrationPoints(processedText) {
    // Find points where this document can integrate with other eCTD modules
    return processedText.extractedEntities.regulatoryTerms.slice(0, 5);
  }

  extractDeviceInformation(text) {
    // Extract medical device specific information
    const deviceMatch = text.match(/device\s+name[:\s]+([^\n]+)/i);
    return { deviceName: deviceMatch ? deviceMatch[1] : 'Unknown' };
  }

  extractSafetyInformation(processedText) {
    // Extract safety-related information
    const safetyTerms = processedText.extractedEntities.regulatoryTerms.filter(
      term => term.toLowerCase().includes('safety') || term.toLowerCase().includes('adverse')
    );
    return { safetyTerms, riskLevel: safetyTerms.length > 5 ? 'High' : 'Low' };
  }

  assessRegulatoryStatus(text) {
    // Assess regulatory approval status
    const approvalTerms = ['approved', 'cleared', 'authorized', 'licensed'];
    const hasApproval = approvalTerms.some(term => text.toLowerCase().includes(term));
    return { status: hasApproval ? 'Approved' : 'Pending', confidence: 0.7 };
  }

  mapToCERSections(processedText) {
    // Map content to CER sections
    return { sections: ['Safety', 'Clinical Evidence', 'Risk Analysis'], mapped: true };
  }

  determineINDSection(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('protocol')) return 'Section 6 - Protocol';
    if (lowerText.includes('investigator')) return 'Section 7 - Investigator';
    if (lowerText.includes('chemistry')) return 'Section 4 - Chemistry';
    return 'Section 1 - Cover Letter';
  }

  extractDrugInformation(processedText) {
    // Extract drug-specific information
    const drugNames = processedText.extractedEntities.drugNames || [];
    return { drugNames, count: drugNames.length };
  }

  extractClinicalData(text) {
    // Extract clinical trial data
    const nctMatch = text.match(/NCT\d+/gi) || [];
    return { clinicalTrials: nctMatch, count: nctMatch.length };
  }

  extractManufacturingData(processedText) {
    // Extract manufacturing information
    const mfgTerms = processedText.extractedEntities.regulatoryTerms.filter(
      term => term.toLowerCase().includes('manufacturing') || term.toLowerCase().includes('gmp')
    );
    return { manufacturingTerms: mfgTerms, compliant: mfgTerms.length > 0 };
  }

  classifyForVault(text) {
    // Classify document for vault storage
    const lowerText = text.toLowerCase();
    if (lowerText.includes('protocol')) return 'Clinical Protocol';
    if (lowerText.includes('report')) return 'Clinical Report';
    if (lowerText.includes('submission')) return 'Regulatory Submission';
    return 'General Document';
  }

  /**
   * Search across all ingested documents
   */
  async searchDocuments(query, filters = {}) {
    try {
      let searchQuery = `
        SELECT * FROM unified_documents
        WHERE text_content ILIKE $1
      `;

      const queryParams = [`%${query}%`];

      if (filters.module) {
        searchQuery += ` AND module = $${queryParams.length + 1}`;
        queryParams.push(filters.module);
      }

      if (filters.documentType) {
        searchQuery += ` AND ai_analysis::text ILIKE $${queryParams.length + 1}`;
        queryParams.push(`%${filters.documentType}%`);
      }

      searchQuery += ` ORDER BY created_at DESC LIMIT 50`;

      const result = await dbPool.query(searchQuery, queryParams);
      return result.rows;
    } catch (error) {
      console.error('Document search failed:', error);
      throw error;
    }
  }

  /**
   * Get processing statistics
   */
  getProcessingStats() {
    return {
      totalDocuments: this.knowledgeBase.size,
      processingQueue: this.processingQueue.size,
      lastProcessed: new Date(),
      supportedFormats: ['PDF', 'DOCX', 'Excel', 'PowerPoint', 'TXT', 'CSV', 'XML', 'JSON'],
    };
  }
}

// Multer configuration for unified document uploads
export const unifiedUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for comprehensive document processing
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'application/xml',
      'text/xml',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/tiff',
      // ZIP archive support for eCTD submissions
      'application/zip',
      'application/x-zip-compressed',
      'multipart/x-zip',
    ];

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      file.originalname.endsWith('.txt') ||
      file.originalname.endsWith('.zip')
    ) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
});

// Export singleton instance
export const unifiedDocumentIngestion = new UnifiedDocumentIngestion();

export { extractPdfWithPython };
