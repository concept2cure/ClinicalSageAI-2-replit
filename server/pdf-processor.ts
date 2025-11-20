import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

// Local implementation to avoid circular dependency with openai-service
async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(
      `Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const UPLOAD_DIR = path.resolve('uploads');

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
  }
}

// Save uploaded PDF file
export async function savePdfFile(buffer: Buffer, filename: string): Promise<string> {
  await ensureUploadDir();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
  const filePath = path.join(UPLOAD_DIR, sanitizedFilename);

  await fs.writeFile(filePath, buffer);
  return filePath;
}

// Validate PDF file
export async function validatePdfFile(buffer: Buffer): Promise<boolean> {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    return pageCount > 0;
  } catch (error) {
    console.error('Invalid PDF file:', error);
    return false;
  }
}

// Get PDF metadata
export async function getPdfMetadata(
  buffer: Buffer
): Promise<{ pageCount: number; fileSize: number }> {
  try {
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    return {
      pageCount,
      fileSize: buffer.length,
    };
  } catch (error) {
    console.error('Failed to get PDF metadata:', error);
    throw new Error('Failed to get PDF metadata');
  }
}

// Process PDF file
export async function processPdfFile(filePath: string, reportId: number): Promise<string> {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const extractedText = await extractTextFromPdf(fileBuffer);
    return extractedText;
  } catch (error) {
    console.error(`Error processing PDF file (report ID: ${reportId}):`, error);
    throw new Error('Failed to process PDF file');
  }
}
