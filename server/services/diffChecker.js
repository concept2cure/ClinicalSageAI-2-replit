/**
 * Document Diff Checker Service
 *
 * Handles comparison between different versions of documents
 * Supports multiple file formats:
 * - Plain text
 * - PDF
 * - Word documents
 * - Markdown
 * - JSON
 */

import { diff_match_patch } from 'diff-match-patch';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import docx from 'docx';
import { createWorker } from 'tesseract.js';
import { logger } from '../utils/logger.js';

/**
 * DiffChecker class to handle document comparisons
 */
export default class DiffChecker {
  constructor(baseFileMimeType, compareFileMimeType) {
    this.baseFileMimeType = baseFileMimeType;
    this.compareFileMimeType = compareFileMimeType;
    this.diffEngine = new diff_match_patch();
  }

  /**
   * Generate difference between two documents
   * @param {Buffer} baseFileBuffer - Base version file buffer
   * @param {Buffer} compareFileBuffer - Compare version file buffer
   * @returns {Object} - Difference object with changes highlighted
   */
  async generateDiff(baseFileBuffer, compareFileBuffer) {
    try {
      // Extract text content from files based on mime type
      const baseText = await this.extractText(baseFileBuffer, this.baseFileMimeType);
      const compareText = await this.extractText(compareFileBuffer, this.compareFileMimeType);

      // Generate diff
      const diffs = this.diffEngine.diff_main(baseText, compareText);
      this.diffEngine.diff_cleanupSemantic(diffs);

      // Format diffs for visualization
      const visualDiff = this.formatDiffForVisualization(diffs);

      // Statistics
      const stats = this.generateDiffStats(diffs);

      return {
        diffs: visualDiff,
        stats,
        rawText: {
          base: baseText,
          compare: compareText,
        },
      };
    } catch (err) {
      logger.error(`Error generating document diff: ${err.message}`, err);
      throw new Error(`Failed to generate document diff: ${err.message}`);
    }
  }

  /**
   * Extract text content from a file based on mime type
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} mimeType - File mime type
   * @returns {string} - Extracted text
   */
  async extractText(fileBuffer, mimeType) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new Error('Empty file buffer provided');
    }

    try {
      if (mimeType.includes('text/plain')) {
        // Plain text
        return fileBuffer.toString('utf8');
      } else if (mimeType.includes('application/pdf')) {
        // PDF
        const data = await pdf(fileBuffer);
        return data.text;
      } else if (
        mimeType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      ) {
        // DOCX
        const { value } = await mammoth.extractRawText({
          buffer: fileBuffer,
        });
        return value;
      } else if (mimeType.includes('application/msword')) {
        // DOC (legacy Word format)
        // For DOC files, we may need to use OCR if direct extraction fails
        try {
          const { value } = await mammoth.extractRawText({
            buffer: fileBuffer,
          });
          return value;
        } catch (err) {
          logger.warn(
            `Failed to extract text from DOC file directly, falling back to OCR: ${err.message}`
          );
          return await this.extractTextViaOcr(fileBuffer);
        }
      } else if (mimeType.includes('text/markdown')) {
        // Markdown
        return fileBuffer.toString('utf8');
      } else if (mimeType.includes('application/json')) {
        // JSON - we'll pretty-print it for better comparison
        const jsonObj = JSON.parse(fileBuffer.toString('utf8'));
        return JSON.stringify(jsonObj, null, 2);
      } else if (mimeType.includes('image/')) {
        // Image files - use OCR
        return await this.extractTextViaOcr(fileBuffer);
      } else {
        // Default to treating as plain text
        logger.warn(
          `Unsupported mime type for text extraction: ${mimeType}, falling back to raw text`
        );
        return fileBuffer.toString('utf8');
      }
    } catch (err) {
      logger.error(`Error extracting text from file (${mimeType}): ${err.message}`, err);
      throw new Error(`Failed to extract text from file: ${err.message}`);
    }
  }

  /**
   * Extract text from image using OCR
   * @param {Buffer} imageBuffer - Image buffer
   * @returns {string} - Extracted text
   */
  async extractTextViaOcr(imageBuffer) {
    const worker = await createWorker();

    try {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');

      const {
        data: { text },
      } = await worker.recognize(imageBuffer);

      return text;
    } finally {
      await worker.terminate();
    }
  }

  /**
   * Format diff for visualization
   * @param {Array} diffs - Diff array from diff_match_patch
   * @returns {Array} - Formatted diff for frontend visualization
   */
  formatDiffForVisualization(diffs) {
    return diffs.map((diff, index) => {
      const [operation, text] = diff;
      let type = 'equal';

      if (operation === -1) {
        type = 'delete';
      } else if (operation === 1) {
        type = 'insert';
      }

      return {
        id: index,
        type,
        text,
        // Split text into lines for line-by-line comparison
        lines: text.split('\n').map(line => ({
          type,
          text: line,
        })),
      };
    });
  }

  /**
   * Generate statistics for the diff
   * @param {Array} diffs - Diff array from diff_match_patch
   * @returns {Object} - Statistics object
   */
  generateDiffStats(diffs) {
    let insertions = 0;
    let deletions = 0;
    let unchanged = 0;

    diffs.forEach(diff => {
      const [operation, text] = diff;

      if (operation === -1) {
        // Deletions
        deletions += text.length;
      } else if (operation === 1) {
        // Insertions
        insertions += text.length;
      } else {
        // Unchanged
        unchanged += text.length;
      }
    });

    const total = insertions + deletions + unchanged;

    return {
      insertions,
      deletions,
      unchanged,
      total,
      percentChanged: total > 0 ? (((insertions + deletions) / total) * 100).toFixed(2) : 0,
      percentUnchanged: total > 0 ? ((unchanged / total) * 100).toFixed(2) : 0,
    };
  }
}
