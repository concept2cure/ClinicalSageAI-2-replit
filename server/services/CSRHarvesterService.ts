import axios, { AxiosError } from 'axios';
import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Pool } from 'pg';
import { PDFProcessor } from './PDFProcessor.js';
import { ValidationService } from './ValidationService.js';
import { LLMStructuredExtractor } from './deep-miner/llm-extractor.js';

/**
 * CSRHarvesterService - Orchestrates the full CSR ingestion pipeline
 * 
 * Pipeline: Download → Extract → Validate → Store → Log
 */
export class CSRHarvesterService {
  private db: Pool;
  private pdfProcessor: PDFProcessor;
  private validator: ValidationService;
  private extractor: LLMStructuredExtractor;

  // Download configuration
  private readonly TIMEOUT_MS = 60000; // 60 seconds
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 2000; // 2 seconds base delay

  constructor(db: Pool) {
    this.db = db;
    this.pdfProcessor = new PDFProcessor();
    this.validator = new ValidationService();
    this.extractor = new LLMStructuredExtractor();
  }

  /**
   * Harvest a single CSR from URL
   * 
   * @param submissionId - Unique submission identifier
   * @param pdfUrl - URL to the PDF file
   * @returns CSR ID if successful
   */
  async harvestCSR(submissionId: string, pdfUrl: string): Promise<number | null> {
    let logId: number | null = null;
    const startTime = Date.now();

    try {
      // Create ingestion log entry
      logId = await this.createIngestionLog(submissionId, pdfUrl);
      await this.updateLogStatus(logId, 'downloading');

      // Step 1: Download PDF
      const downloadStart = Date.now();
      const { buffer, fileSize } = await this.downloadPDF(pdfUrl);
      const downloadDuration = Date.now() - downloadStart;

      // Validate PDF
      if (!this.pdfProcessor.validatePDF(buffer)) {
        throw new Error('Invalid PDF file format');
      }

      // Compute hash for duplicate detection
      const pdfHash = this.pdfProcessor.computeHash(buffer);

      // Check for duplicates
      const duplicate = await this.checkDuplicate(pdfHash);
      if (duplicate) {
        await this.updateLogStatus(logId, 'completed', {
          error: `Duplicate PDF detected (CSR ID: ${duplicate.csr_id})`,
          csrId: duplicate.csr_id
        });
        return duplicate.csr_id;
      }

      await this.updateLogStatus(logId, 'processing');

      // Step 2: Extract text and tables
      const extractionStart = Date.now();
      const extracted = await this.pdfProcessor.extractFromBuffer(buffer);
      const extractionDuration = Date.now() - extractionStart;

      // Step 3: Extract structured data with LLM
      const context = `Submission: ${submissionId}\nPages: ${extracted.metadata.pages}`;
      const deepData = await this.extractor.extractFullPayload(extracted.text, context);

      // Step 4: Validate extracted data
      const validation = this.validator.validate(deepData);

      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
      }

      // Step 5: Store in database
      const csrId = await this.storeCSR({
        submissionId,
        pdfUrl,
        pdfHash,
        deepData,
        confidence: validation.score,
        completeness: validation.completeness,
        missingSections: validation.missingSections
      });

      // Step 6: Update log with success
      const totalDuration = Date.now() - startTime;
      await this.updateLogStatus(logId, 'completed', {
        csrId,
        fileSize,
        downloadDuration,
        extractionDuration,
        totalDuration,
        confidence: validation.score,
        completeness: validation.completeness
      });

      return csrId;

    } catch (error) {
      // Log failure
      if (logId) {
        await this.updateLogStatus(logId, 'failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
      }
      throw error;
    }
  }

  /**
   * Download PDF with retry logic and exponential backoff
   */
  private async downloadPDF(url: string): Promise<{ buffer: Buffer; fileSize: number }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: this.TIMEOUT_MS,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClinicalSage/2.0',
            'Accept': 'application/pdf'
          },
          maxContentLength: 100 * 1024 * 1024, // 100MB max
          validateStatus: (status) => status === 200
        });

        // Validate content type
        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('pdf')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        const buffer = Buffer.from(response.data);
        return {
          buffer,
          fileSize: buffer.length
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < this.MAX_RETRIES) {
          // Exponential backoff
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`Failed to download PDF after ${this.MAX_RETRIES} attempts: ${lastError?.message}`);
  }

  /**
   * Check if PDF already exists based on SHA256 hash
   */
  private async checkDuplicate(hash: string): Promise<{ csr_id: number } | null> {
    const result = await this.db.query(
      'SELECT csr_id FROM csr_deep_vault WHERE pdf_sha256_hash = $1 LIMIT 1',
      [hash]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Store CSR in database
   */
  private async storeCSR(data: {
    submissionId: string;
    pdfUrl: string;
    pdfHash: string;
    deepData: any;
    confidence: number;
    completeness: number;
    missingSections: string[];
  }): Promise<number> {
    const regulatory = data.deepData.regulatory || {};
    const protocol = data.deepData.protocol || {};

    const result = await this.db.query(
      `INSERT INTO csr_deep_vault (
        regulatory_agency,
        submission_id,
        study_id,
        drug_name,
        deep_data,
        extraction_method,
        extraction_confidence_score,
        completeness_score,
        missing_sections,
        pdf_url,
        pdf_sha256_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING csr_id`,
      [
        regulatory.regulatory_agency || 'Unknown',
        data.submissionId,
        protocol.study_id || data.submissionId,
        protocol.drug_name || 'Unknown',
        JSON.stringify(data.deepData),
        'gpt-4-turbo-preview',
        data.confidence,
        data.completeness,
        JSON.stringify(data.missingSections),
        data.pdfUrl,
        data.pdfHash
      ]
    );

    return result.rows[0].csr_id;
  }

  /**
   * Create ingestion log entry
   */
  private async createIngestionLog(submissionId: string, pdfUrl: string): Promise<number> {
    const result = await this.db.query(
      `INSERT INTO csr_ingestion_log (submission_id, pdf_url, status)
       VALUES ($1, $2, 'pending')
       RETURNING log_id`,
      [submissionId, pdfUrl]
    );

    return result.rows[0].log_id;
  }

  /**
   * Update ingestion log status and metrics
   */
  private async updateLogStatus(
    logId: number,
    status: string,
    metrics?: {
      csrId?: number;
      fileSize?: number;
      downloadDuration?: number;
      extractionDuration?: number;
      totalDuration?: number;
      confidence?: number;
      completeness?: number;
      error?: string;
      stack?: string;
    }
  ): Promise<void> {
    const updates: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: any[] = [logId, status];
    let paramIndex = 3;

    if (status === 'completed' || status === 'failed') {
      updates.push(`completed_at = NOW()`);
    }

    if (metrics) {
      if (metrics.csrId !== undefined) {
        updates.push(`csr_id = $${paramIndex++}`);
        values.push(metrics.csrId);
      }
      if (metrics.fileSize !== undefined) {
        updates.push(`file_size_bytes = $${paramIndex++}`);
        values.push(metrics.fileSize);
      }
      if (metrics.downloadDuration !== undefined) {
        updates.push(`download_duration_ms = $${paramIndex++}`);
        values.push(metrics.downloadDuration);
      }
      if (metrics.extractionDuration !== undefined) {
        updates.push(`extraction_duration_ms = $${paramIndex++}`);
        values.push(metrics.extractionDuration);
      }
      if (metrics.totalDuration !== undefined) {
        updates.push(`total_duration_ms = $${paramIndex++}`);
        values.push(metrics.totalDuration);
      }
      if (metrics.confidence !== undefined) {
        updates.push(`extraction_confidence_score = $${paramIndex++}`);
        values.push(metrics.confidence);
      }
      if (metrics.completeness !== undefined) {
        updates.push(`completeness_score = $${paramIndex++}`);
        values.push(metrics.completeness);
      }
      if (metrics.error !== undefined) {
        updates.push(`error_message = $${paramIndex++}`);
        values.push(metrics.error);
        updates.push(`retry_count = retry_count + 1`);
      }
      if (metrics.stack !== undefined) {
        updates.push(`error_stack = $${paramIndex++}`);
        values.push(metrics.stack);
      }
    }

    await this.db.query(
      `UPDATE csr_ingestion_log SET ${updates.join(', ')} WHERE log_id = $1`,
      values
    );
  }

  /**
   * Get ingestion status for a submission
   */
  async getIngestionStatus(submissionId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT 
        log_id,
        submission_id,
        pdf_url,
        status,
        started_at,
        completed_at,
        file_size_bytes,
        download_duration_ms,
        extraction_duration_ms,
        total_duration_ms,
        extraction_confidence_score,
        completeness_score,
        error_message,
        retry_count,
        csr_id,
        pdf_sha256_hash
      FROM csr_ingestion_log
      WHERE submission_id = $1
      ORDER BY started_at DESC`,
      [submissionId]
    );

    return result.rows;
  }
}
