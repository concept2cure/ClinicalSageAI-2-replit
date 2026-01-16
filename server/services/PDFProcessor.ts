import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/**
 * PDFProcessor - Extract text and tables from PDF files
 * 
 * Uses Python-based pdfplumber for table extraction and PyPDF2 for text
 * Provides both streaming and buffer-based processing
 */
export class PDFProcessor {
  private pythonScript: string;

  constructor() {
    // Path to Python helper script for PDF processing
    this.pythonScript = path.join(process.cwd(), 'server', 'services', 'pdf_extractor_helper.py');
  }

  /**
   * Extract text and tables from a PDF buffer
   * 
   * @param buffer - PDF file buffer
   * @returns Object containing text, tables, metadata, and quality metrics
   */
  async extractFromBuffer(buffer: Buffer): Promise<PDFExtractionResult> {
    const tempFile = path.join('/tmp', `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    
    try {
      // Write buffer to temp file for Python processing
      await fs.writeFile(tempFile, buffer);
      
      // Extract using Python
      const result = await this.extractFromFile(tempFile);
      
      return result;
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Extract text and tables from a PDF file
   * 
   * @param filePath - Path to PDF file
   * @returns Object containing text, tables, metadata, and quality metrics
   */
  async extractFromFile(filePath: string): Promise<PDFExtractionResult> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const python = spawn('python3', [this.pythonScript, filePath]);

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`PDF extraction failed: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse extraction result: ${e instanceof Error ? e.message : 'Unknown error'}`));
        }
      });

      python.on('error', (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });
    });
  }

  /**
   * Compute SHA256 hash of a buffer
   * 
   * @param buffer - File buffer
   * @returns SHA256 hash as hex string
   */
  computeHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Validate that a buffer is a valid PDF file
   * 
   * @param buffer - File buffer to validate
   * @returns true if valid PDF, false otherwise
   */
  validatePDF(buffer: Buffer): boolean {
    // PDF files start with %PDF-
    const header = buffer.slice(0, 5).toString('utf8');
    return header === '%PDF-';
  }
}

export interface PDFExtractionResult {
  text: string;
  tables: PDFTable[];
  metadata: {
    pages: number;
    author?: string;
    title?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
  };
  quality: {
    textLength: number;
    tableCount: number;
    confidence: number;
  };
}

export interface PDFTable {
  page: number;
  data: string[][];
  rowCount: number;
  columnCount: number;
}
