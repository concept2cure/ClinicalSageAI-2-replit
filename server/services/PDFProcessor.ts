/**
 * PDFProcessor - Extract text and tables from CSR PDFs
 * 
 * Uses pdfplumber for table extraction and PyPDF2 for text extraction
 * Outputs structured JSON suitable for LLM processing
 */

import { spawn } from 'child_process';
import { createScopedLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

const logger = createScopedLogger('PDFProcessor');

export interface ExtractedTable {
  page: number;
  headers: string[];
  rows: string[][];
  tableIndex: number;
}

export interface ExtractedContent {
  text: string;
  tables: ExtractedTable[];
  metadata: {
    pageCount: number;
    extractionTimestamp: string;
    processingTimeMs: number;
  };
}

export class PDFProcessor {
  /**
   * Extract text and tables from a PDF file
   * @param pdfPath Absolute path to the PDF file
   * @returns Structured extraction results
   */
  async extract(pdfPath: string): Promise<ExtractedContent> {
    const startTime = Date.now();
    
    logger.info('Starting PDF extraction', { pdfPath });

    // Verify file exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    try {
      // Run Python extraction script
      const extractionResult = await this.runPythonExtractor(pdfPath);
      
      const processingTimeMs = Date.now() - startTime;
      logger.info('PDF extraction completed', { 
        pdfPath, 
        processingTimeMs,
        pageCount: extractionResult.metadata.pageCount,
        tableCount: extractionResult.tables.length
      });

      return {
        ...extractionResult,
        metadata: {
          ...extractionResult.metadata,
          processingTimeMs,
          extractionTimestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      logger.error('PDF extraction failed', { pdfPath, error });
      throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run Python extraction script using pdfplumber and PyPDF2
   */
  private async runPythonExtractor(pdfPath: string): Promise<ExtractedContent> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '../scripts/extract_pdf.py');
      
      // Check if Python script exists, if not we'll create inline extraction
      if (!fs.existsSync(scriptPath)) {
        logger.warn('Python extraction script not found, using fallback');
        return this.fallbackExtraction(pdfPath).then(resolve).catch(reject);
      }

      const pythonProcess = spawn('python3', [scriptPath, pdfPath]);
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          logger.error('Python extraction failed', { code, stderr });
          reject(new Error(`Python extraction failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (error) {
          logger.error('Failed to parse extraction result', { stdout, error });
          reject(new Error('Failed to parse extraction result'));
        }
      });

      pythonProcess.on('error', (error) => {
        logger.error('Failed to spawn Python process', { error });
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    });
  }

  /**
   * Fallback extraction using pdf-parse (already in dependencies)
   */
  private async fallbackExtraction(pdfPath: string): Promise<ExtractedContent> {
    logger.info('Using fallback PDF extraction');
    
    try {
      // Dynamic import to avoid issues if pdf-parse is not available
      const pdfParse = await import('pdf-parse');
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdfParse.default(dataBuffer);

      return {
        text: data.text,
        tables: [], // Fallback doesn't extract tables
        metadata: {
          pageCount: data.numpages,
          extractionTimestamp: new Date().toISOString(),
          processingTimeMs: 0
        }
      };
    } catch (error) {
      logger.error('Fallback extraction failed', { error });
      throw new Error(`Fallback extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default PDFProcessor;
