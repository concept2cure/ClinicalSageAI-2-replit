import { PDFExtract } from 'pdf.js-extract';
import { extractFromDocx } from 'mammoth';
import path from 'path';

const pdfExtract = new PDFExtract();

/**
 * Extract text content from document buffer based on file type
 *
 * @param {Buffer} buffer - Document buffer
 * @param {string} filename - Original filename to determine format
 * @returns {Promise<string>} - Extracted text content
 */
export async function extractTextFromBuffer(buffer, filename) {
  const extension = path.extname(filename).toLowerCase();

  try {
    // Handle PDF files
    if (extension === '.pdf') {
      return await extractTextFromPdf(buffer);
    }

    // Handle Word documents
    else if (extension === '.docx' || extension === '.doc') {
      return await extractTextFromDocx(buffer);
    }

    // Handle plain text
    else if (extension === '.txt') {
      return buffer.toString('utf8');
    }

    // Unsupported format
    else {
      return `[Unsupported document format: ${extension}. Text extraction not available.]`;
    }
  } catch (error) {
    console.error(`Text extraction error for ${filename}:`, error);
    throw new Error(`Failed to extract text from ${filename}: ${error.message}`);
  }
}

/**
 * Extract text from PDF buffer
 *
 * @param {Buffer} buffer - PDF buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromPdf(buffer) {
  try {
    const data = await pdfExtract.extractBuffer(buffer, {});

    // Concatenate text from all pages
    const text = data.pages.map(page => page.content.map(item => item.str).join(' ')).join('\n\n');

    return text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`PDF extraction failed: ${error.message}`);
  }
}

/**
 * Extract text from DOCX buffer
 *
 * @param {Buffer} buffer - DOCX buffer
 * @returns {Promise<string>} - Extracted text
 */
async function extractTextFromDocx(buffer) {
  try {
    const result = await extractFromDocx({ buffer });
    return result.value;
  } catch (error) {
    console.error('DOCX extraction error:', error);
    throw new Error(`DOCX extraction failed: ${error.message}`);
  }
}

/**
 * Extract metadata from document
 *
 * @param {Buffer} buffer - Document buffer
 * @param {string} filename - Original filename to determine format
 * @returns {Promise<Object>} - Extracted metadata
 */
export async function extractMetadataFromBuffer(buffer, filename) {
  const extension = path.extname(filename).toLowerCase();

  try {
    // Handle PDF metadata
    if (extension === '.pdf') {
      // Extract PDF metadata (simplified approach)
      return { format: 'PDF', size: buffer.length };
    }

    // Handle Word metadata
    else if (extension === '.docx' || extension === '.doc') {
      return { format: 'DOCX', size: buffer.length };
    }

    // Default minimal metadata
    else {
      return {
        format: extension.replace('.', '').toUpperCase(),
        size: buffer.length,
      };
    }
  } catch (error) {
    console.error(`Metadata extraction error for ${filename}:`, error);
    return { error: error.message };
  }
}
