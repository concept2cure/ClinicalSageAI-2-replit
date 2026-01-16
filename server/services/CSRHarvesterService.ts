/**
 * CSRHarvesterService - Orchestrates CSR ingestion pipeline
 * 
 * Workflow:
 * 1. Validate job parameters
 * 2. Check for duplicates (submission_id)
 * 3. Download PDF (axios, 60s timeout, 3 retries, exponential backoff)
 * 4. Verify MIME type (application/pdf)
 * 5. Calculate SHA256 checksum
 * 6. Extract text and tables
 * 7. Call LLMStructuredExtractor
 * 8. Validate payload
 * 9. Insert into csr_deep_vault
 * 10. Log to csr_ingestion_log
 */

import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createScopedLogger } from '../utils/logger';
import PDFProcessor from './PDFProcessor';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const logger = createScopedLogger('CSRHarvesterService');

export interface HarvestJob {
  jobId: string;
  submissionId: string;
  sourceUrl: string;
  priority?: number;
}

export interface HarvestResult {
  success: boolean;
  jobId: string;
  submissionId: string;
  error?: string;
  extractedData?: any;
  vaultInserted?: boolean; // Indicates if data was inserted into csr_deep_vault
  warnings?: string[]; // Non-fatal warnings during processing
}

export class CSRHarvesterService {
  private pdfProcessor: PDFProcessor;
  private downloadDir: string;
  private maxRetries = 3;
  private timeout = 60000; // 60 seconds

  constructor() {
    this.pdfProcessor = new PDFProcessor();
    this.downloadDir = path.join(os.tmpdir(), 'csr-harvester');
    
    // Ensure download directory exists
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * Process a harvest job
   */
  async processJob(job: HarvestJob): Promise<HarvestResult> {
    const { jobId, submissionId, sourceUrl } = job;
    
    logger.info('Processing harvest job', { jobId, submissionId, sourceUrl });

    const warnings: string[] = [];

    try {
      // 1. Validate job parameters
      this.validateJob(job);

      // 2. Check for duplicates
      const isDuplicate = await this.checkDuplicate(submissionId);
      if (isDuplicate) {
        throw new Error(`Duplicate submission_id: ${submissionId}`);
      }

      // 3. Log job start
      await this.logJobStart(jobId, submissionId, sourceUrl);

      // 4. Download PDF
      const pdfPath = await this.downloadPDF(sourceUrl, submissionId);

      // 5. Calculate checksum
      const checksum = await this.calculateChecksum(pdfPath);
      const fileSize = fs.statSync(pdfPath).size;

      // 6. Extract text and tables
      const extractedContent = await this.pdfProcessor.extract(pdfPath);

      // 7. Call LLM Structured Extractor
      const structuredData = await this.extractStructuredData(extractedContent);

      // 8. Validate payload
      this.validatePayload(structuredData);

      // 9. Insert into csr_deep_vault
      const vaultInserted = await this.insertIntoVault(submissionId, structuredData, checksum, warnings);

      // 10. Log job completion
      await this.logJobComplete(jobId, checksum, fileSize, {
        pageCount: extractedContent.metadata.pageCount,
        tableCount: extractedContent.tables.length,
        processingTimeMs: extractedContent.metadata.processingTimeMs,
        vaultInserted
      });

      // Cleanup
      this.cleanupTempFile(pdfPath);

      logger.info('Harvest job completed successfully', { jobId, submissionId });

      return {
        success: true,
        jobId,
        submissionId,
        extractedData: structuredData,
        vaultInserted,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      logger.error('Harvest job failed', { jobId, submissionId, error });
      
      await this.logJobError(jobId, error instanceof Error ? error.message : 'Unknown error');

      return {
        success: false,
        jobId,
        submissionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Validate job parameters
   */
  private validateJob(job: HarvestJob): void {
    if (!job.jobId || !job.submissionId || !job.sourceUrl) {
      throw new Error('Missing required job parameters: jobId, submissionId, or sourceUrl');
    }

    // Validate URL format
    try {
      new URL(job.sourceUrl);
    } catch {
      throw new Error(`Invalid source URL: ${job.sourceUrl}`);
    }
  }

  /**
   * Check if submission already exists
   */
  private async checkDuplicate(submissionId: string): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*) as count 
        FROM csr_ingestion_log 
        WHERE submission_id = ${submissionId} 
        AND status = 'completed'
      `);
      
      return (result.rows[0] as any)?.count > 0;
    } catch (error) {
      logger.error('Duplicate check failed', { submissionId, error });
      return false; // Continue processing if check fails
    }
  }

  /**
   * Download PDF with retries and exponential backoff
   */
  private async downloadPDF(url: string, submissionId: string): Promise<string> {
    const filename = `${submissionId}_${Date.now()}.pdf`;
    const filepath = path.join(this.downloadDir, filename);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info('Downloading PDF', { url, attempt, maxRetries: this.maxRetries });

        const response = await axios({
          method: 'get',
          url,
          responseType: 'stream',
          timeout: this.timeout,
          maxRedirects: 5,
          validateStatus: (status) => status === 200
        });

        // Verify MIME type
        const contentType = response.headers['content-type'];
        if (!contentType || contentType.toLowerCase() !== 'application/pdf') {
          throw new Error(`Invalid content type: ${contentType}. Expected exactly 'application/pdf'`);
        }

        // Stream to disk
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        logger.info('PDF downloaded successfully', { filepath, size: fs.statSync(filepath).size });
        return filepath;

      } catch (error) {
        logger.warn('PDF download attempt failed', { url, attempt, error });

        if (attempt === this.maxRetries) {
          throw new Error(`Failed to download PDF after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // Exponential backoff: 2^attempt seconds
        const backoffMs = Math.pow(2, attempt) * 1000;
        logger.info('Retrying after backoff', { backoffMs });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('Download failed unexpectedly');
  }

  /**
   * Calculate SHA256 checksum
   */
  private async calculateChecksum(filepath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filepath);

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Extract structured data using LLM
   * 
   * IMPORTANT: This is a PLACEHOLDER implementation.
   * In production, this should integrate with an actual LLM service (e.g., OpenAI, Anthropic)
   * to extract structured fields from the CSR text and tables.
   * 
   * The structured_fields below are hardcoded as null - they should be populated
   * by the LLM based on the extracted content.
   * 
   * TODO: Replace with actual LLMStructuredExtractor integration
   */
  private async extractStructuredData(extractedContent: any): Promise<any> {
    logger.info('Extracting structured data with LLM (PLACEHOLDER - not implemented)');

    return {
      raw_text: extractedContent.text,
      tables: extractedContent.tables,
      metadata: extractedContent.metadata,
      // Placeholder for LLM-extracted fields
      // TODO: Implement actual LLM extraction for these fields
      structured_fields: {
        study_title: null,
        sponsor: null,
        indication: null,
        phase: null,
        endpoints: [],
        patient_population: null
      },
      _extraction_note: 'LLM structured extraction is not yet implemented - placeholder data only'
    };
  }

  /**
   * Validate extracted payload
   */
  private validatePayload(data: any): void {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid payload: must be an object');
    }

    // Add more specific validations as needed
    if (!data.raw_text && !data.tables) {
      throw new Error('Invalid payload: missing both raw_text and tables');
    }
  }

  /**
   * Insert into csr_deep_vault
   * 
   * Note: This method assumes csr_deep_vault table exists with the following schema:
   * - submission_id (VARCHAR, UNIQUE)
   * - extracted_data (JSONB)
   * - pdf_checksum (VARCHAR)
   * - created_at (TIMESTAMP)
   * - updated_at (TIMESTAMP)
   * 
   * If the table doesn't exist, this will fail. A separate migration should create
   * the csr_deep_vault table before using this ingestion pipeline.
   * 
   * @returns true if inserted, false if skipped
   */
  private async insertIntoVault(
    submissionId: string, 
    data: any, 
    checksum: string,
    warnings: string[]
  ): Promise<boolean> {
    try {
      // Check if table exists first
      const tableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'csr_deep_vault'
        )
      `);
      
      const tableExists = (tableCheck.rows[0] as any)?.exists;
      
      if (!tableExists) {
        const warningMsg = 'csr_deep_vault table does not exist - skipping vault insertion';
        logger.warn(warningMsg, { submissionId });
        warnings.push(warningMsg);
        return false;
      }

      await db.execute(sql`
        INSERT INTO csr_deep_vault (
          submission_id,
          extracted_data,
          pdf_checksum,
          created_at
        ) VALUES (
          ${submissionId},
          ${JSON.stringify(data)},
          ${checksum},
          NOW()
        )
        ON CONFLICT (submission_id) DO UPDATE
        SET 
          extracted_data = EXCLUDED.extracted_data,
          pdf_checksum = EXCLUDED.pdf_checksum,
          updated_at = NOW()
      `);
      
      logger.info('Data inserted into csr_deep_vault', { submissionId, checksum });
      return true;
    } catch (error) {
      logger.error('Failed to insert into vault', { submissionId, error });
      throw error;
    }
  }

  /**
   * Log job start
   */
  private async logJobStart(jobId: string, submissionId: string, sourceUrl: string): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO csr_ingestion_log (
          job_id,
          submission_id,
          source_url,
          status,
          started_at
        ) VALUES (
          ${jobId},
          ${submissionId},
          ${sourceUrl},
          'processing',
          NOW()
        )
        ON CONFLICT (job_id) DO UPDATE
        SET status = 'processing', started_at = NOW()
      `);
    } catch (error) {
      logger.error('Failed to log job start', { jobId, error });
    }
  }

  /**
   * Log job completion
   */
  private async logJobComplete(
    jobId: string, 
    checksum: string, 
    fileSize: number, 
    metadata: any
  ): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE csr_ingestion_log 
        SET 
          status = 'completed',
          completed_at = NOW(),
          pdf_checksum = ${checksum},
          pdf_size_bytes = ${fileSize},
          extraction_metadata = ${JSON.stringify(metadata)}
        WHERE job_id = ${jobId}
      `);
    } catch (error) {
      logger.error('Failed to log job completion', { jobId, error });
    }
  }

  /**
   * Log job error
   */
  private async logJobError(jobId: string, errorMessage: string): Promise<void> {
    try {
      await db.execute(sql`
        UPDATE csr_ingestion_log 
        SET 
          status = 'failed',
          completed_at = NOW(),
          error_message = ${errorMessage},
          retry_count = retry_count + 1
        WHERE job_id = ${jobId}
      `);
    } catch (error) {
      logger.error('Failed to log job error', { jobId, error });
    }
  }

  /**
   * Cleanup temporary file
   */
  private cleanupTempFile(filepath: string): void {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
        logger.debug('Cleaned up temp file', { filepath });
      }
    } catch (error) {
      logger.warn('Failed to cleanup temp file', { filepath, error });
    }
  }
}

export default CSRHarvesterService;
