/**
 * DocuShare OCR Service
 *
 * Integrates DocuShare built-in OCR capabilities with external OCR services
 * for comprehensive text extraction and document processing.
 */

import fs from 'fs';
import axios from 'axios';
import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
} from '@aws-sdk/client-textract';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DocuShareOCRService {
  constructor() {
    this.textractClient = null;
    this.tesseractEnabled = true;
    this.awsTextractEnabled = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

    if (this.awsTextractEnabled) {
      this.textractClient = new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  /**
   * Process document using DocuShare built-in OCR
   */
  async processWithDocuShareOCR(documentId, docuShareConfig) {
    try {
      console.log(`[DocuShare OCR] Processing document ${documentId}`);

      // Call DocuShare OCR API endpoint
      const response = await axios.post(
        `${docuShareConfig.apiUrl}/documents/${documentId}/ocr`,
        {
          options: {
            language: 'en',
            outputFormat: 'text',
            preserveLayout: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${docuShareConfig.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        text: response.data.extractedText,
        confidence: response.data.confidence,
        method: 'docushare',
        metadata: {
          pageCount: response.data.pageCount,
          processingTime: response.data.processingTime,
        },
      };
    } catch (error) {
      console.error('[DocuShare OCR] Error:', error.message);
      return {
        success: false,
        error: error.message,
        method: 'docushare',
      };
    }
  }

  /**
   * Process document using AWS Textract
   */
  async processWithAWSTextract(documentBuffer, options = {}) {
    if (!this.textractClient) {
      throw new Error('AWS Textract not configured');
    }

    try {
      console.log('[AWS Textract] Processing document');

      const command = options.analyzeDocument
        ? new AnalyzeDocumentCommand({
            Document: { Bytes: documentBuffer },
            FeatureTypes: ['TABLES', 'FORMS'],
          })
        : new DetectDocumentTextCommand({
            Document: { Bytes: documentBuffer },
          });

      const response = await this.textractClient.send(command);

      // Extract text from blocks
      const extractedText = this.extractTextFromTextractBlocks(response.Blocks);

      return {
        success: true,
        text: extractedText,
        confidence: this.calculateAverageConfidence(response.Blocks),
        method: 'aws-textract',
        metadata: {
          blockCount: response.Blocks?.length || 0,
          hasTableData: options.analyzeDocument,
        },
      };
    } catch (error) {
      console.error('[AWS Textract] Error:', error.message);
      return {
        success: false,
        error: error.message,
        method: 'aws-textract',
      };
    }
  }

  /**
   * Process document using Tesseract OCR
   */
  async processWithTesseract(filePath, options = {}) {
    try {
      console.log('[Tesseract] Processing document');

      const tesseractOptions = [
        '--oem 1',
        '--psm 6',
        '-l eng',
        ...(options.preserveLayout ? ['-c preserve_interword_spaces=1'] : []),
      ].join(' ');

      const { stdout } = await execAsync(`tesseract "${filePath}" stdout ${tesseractOptions}`);

      return {
        success: true,
        text: stdout.trim(),
        confidence: 0.85, // Tesseract doesn't provide confidence by default
        method: 'tesseract',
        metadata: {
          options: tesseractOptions,
        },
      };
    } catch (error) {
      console.error('[Tesseract] Error:', error.message);
      return {
        success: false,
        error: error.message,
        method: 'tesseract',
      };
    }
  }

  /**
   * Intelligent OCR processing with fallback chain
   */
  async processDocument(input, options = {}) {
    const {
      preferredMethod = 'auto',
      enableFallback = true,
      docuShareConfig = null,
      preserveLayout = true,
      analyzeStructure = false,
    } = options;

    const results = [];
    let finalResult = null;

    // Method priority based on preference
    const methodChain = this.buildMethodChain(preferredMethod, docuShareConfig);

    for (const method of methodChain) {
      try {
        let result;

        switch (method) {
          case 'docushare':
            if (docuShareConfig && input.documentId) {
              result = await this.processWithDocuShareOCR(input.documentId, docuShareConfig);
            }
            break;

          case 'aws-textract':
            if (this.awsTextractEnabled && input.buffer) {
              result = await this.processWithAWSTextract(input.buffer, {
                analyzeDocument: analyzeStructure,
              });
            }
            break;

          case 'tesseract':
            if (this.tesseractEnabled && input.filePath) {
              result = await this.processWithTesseract(input.filePath, {
                preserveLayout,
              });
            }
            break;
        }

        if (result) {
          results.push(result);

          if (result.success && this.isHighQualityResult(result)) {
            finalResult = result;
            break;
          }
        }
      } catch (error) {
        console.error(`[OCR] ${method} failed:`, error.message);
        results.push({
          success: false,
          error: error.message,
          method,
        });
      }

      if (!enableFallback) break;
    }

    // If no high-quality result, use the best available
    if (!finalResult && results.length > 0) {
      finalResult = results.find(r => r.success) || results[0];
    }

    return {
      result: finalResult,
      allResults: results,
      processingChain: methodChain,
    };
  }

  /**
   * Build OCR method chain based on preference and availability
   */
  buildMethodChain(preferredMethod, docuShareConfig) {
    const availableMethods = [];

    if (preferredMethod === 'docushare' && docuShareConfig) {
      availableMethods.push('docushare');
    }

    if (this.awsTextractEnabled) {
      availableMethods.push('aws-textract');
    }

    if (this.tesseractEnabled) {
      availableMethods.push('tesseract');
    }

    // Auto mode: prefer DocuShare > AWS Textract > Tesseract
    if (preferredMethod === 'auto') {
      const autoChain = [];
      if (docuShareConfig) autoChain.push('docushare');
      if (this.awsTextractEnabled) autoChain.push('aws-textract');
      if (this.tesseractEnabled) autoChain.push('tesseract');
      return autoChain;
    }

    return availableMethods;
  }

  /**
   * Determine if OCR result meets quality threshold
   */
  isHighQualityResult(result) {
    if (!result.success || !result.text) return false;

    const textLength = result.text.trim().length;
    const confidence = result.confidence || 0;

    // Quality thresholds
    return textLength > 50 && confidence > 0.7;
  }

  /**
   * Extract text from AWS Textract blocks
   */
  extractTextFromTextractBlocks(blocks) {
    if (!blocks) return '';

    return blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .join('\n');
  }

  /**
   * Calculate average confidence from Textract blocks
   */
  calculateAverageConfidence(blocks) {
    if (!blocks || blocks.length === 0) return 0;

    const confidenceValues = blocks
      .filter(block => block.Confidence !== undefined)
      .map(block => block.Confidence);

    if (confidenceValues.length === 0) return 0;

    return confidenceValues.reduce((sum, conf) => sum + conf, 0) / confidenceValues.length / 100;
  }

  /**
   * Enhanced OCR with document structure analysis
   */
  async processWithStructureAnalysis(input, options = {}) {
    const ocrResult = await this.processDocument(input, {
      ...options,
      analyzeStructure: true,
    });

    if (!ocrResult.result?.success) {
      return ocrResult;
    }

    // Enhance with structure analysis
    const structureAnalysis = await this.analyzeDocumentStructure(ocrResult.result.text);

    return {
      ...ocrResult,
      structureAnalysis,
    };
  }

  /**
   * Analyze document structure from extracted text
   */
  async analyzeDocumentStructure(text) {
    const lines = text.split('\n');

    return {
      sections: this.identifySections(lines),
      tables: this.identifyTables(lines),
      headers: this.identifyHeaders(lines),
      metadata: {
        lineCount: lines.length,
        wordCount: text.split(/\s+/).length,
        hasStructuredContent: this.hasStructuredContent(lines),
      },
    };
  }

  /**
   * Identify document sections
   */
  identifySections(lines) {
    const sections = [];
    const sectionPatterns = [
      /^\d+\.\s+/, // Numbered sections
      /^[A-Z\s]{3,}$/, // All caps headers
      /^[A-Z][a-z\s]+:$/, // Title case with colon
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (sectionPatterns.some(pattern => pattern.test(trimmed))) {
        sections.push({
          title: trimmed,
          lineNumber: index + 1,
          type: 'section',
        });
      }
    });

    return sections;
  }

  /**
   * Identify tables in text
   */
  identifyTables(lines) {
    const tables = [];
    let inTable = false;
    let currentTable = [];

    lines.forEach((line, index) => {
      const hasMultipleColumns = (line.match(/\s{3,}/g) || []).length >= 2;

      if (hasMultipleColumns) {
        if (!inTable) {
          inTable = true;
          currentTable = [];
        }
        currentTable.push({
          content: line.trim(),
          lineNumber: index + 1,
        });
      } else if (inTable) {
        tables.push({
          rows: currentTable,
          startLine: currentTable[0]?.lineNumber,
          endLine: currentTable[currentTable.length - 1]?.lineNumber,
        });
        inTable = false;
        currentTable = [];
      }
    });

    return tables;
  }

  /**
   * Identify headers
   */
  identifyHeaders(lines) {
    return lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => {
        return (
          line.length > 0 &&
          line.length < 100 &&
          (line === line.toUpperCase() || /^[A-Z][a-z\s]+$/.test(line))
        );
      })
      .map(({ line, index }) => ({
        text: line,
        lineNumber: index + 1,
        type: 'header',
      }));
  }

  /**
   * Check if document has structured content
   */
  hasStructuredContent(lines) {
    const structureIndicators = [
      /^\d+\./, // Numbered lists
      /^[A-Z]\./, // Lettered lists
      /^\s*[-•]\s/, // Bullet points
      /\|\s*\w+\s*\|/, // Table separators
    ];

    const structuredLines = lines.filter(line =>
      structureIndicators.some(pattern => pattern.test(line))
    );

    return structuredLines.length > 3;
  }
}

export default DocuShareOCRService;
